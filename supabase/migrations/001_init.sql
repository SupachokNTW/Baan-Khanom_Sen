-- บ้านขนมเส้น — QR table ordering
-- Run once on a fresh Supabase project (SQL editor or `supabase db push`).
--
-- Security model
--   * anon may only SELECT the menu tables.
--   * Customers act through SECURITY DEFINER RPCs that require the table's qr_token.
--   * Prices are always computed here, never taken from the client.
--   * Tables / sessions / orders are readable by staff only (RLS).

-- ───────────────────────── tables ─────────────────────────

create table public.staff_profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role         text not null default 'staff' check (role in ('owner', 'staff'))
);

create table public.menu_items (
  id           bigint generated always as identity primary key,
  name         text not null,
  description  text not null default '',
  price        numeric(10,2) not null check (price >= 0),
  category     text not null check (category in ('noodle', 'side', 'drink')),
  is_available boolean not null default true,
  sort_order   int not null default 0,
  image_url    text
);

create table public.option_groups (
  id            bigint generated always as identity primary key,
  name          text not null,
  min_select    int not null default 0 check (min_select >= 0),
  max_select    int not null default 1 check (max_select >= 1 and max_select >= min_select),
  sort_order    int not null default 0,
  -- kitchen sidebar sums these options ("total to scoop per curry")
  kitchen_tally boolean not null default false
);

create table public.options (
  id           bigint generated always as identity primary key,
  group_id     bigint not null references public.option_groups(id) on delete cascade,
  name         text not null,
  price_delta  numeric(10,2) not null default 0,
  is_available boolean not null default true,
  sort_order   int not null default 0
);
create index on public.options(group_id);

create table public.menu_item_option_groups (
  menu_item_id bigint not null references public.menu_items(id) on delete cascade,
  group_id     bigint not null references public.option_groups(id) on delete cascade,
  sort_order   int not null default 0,
  primary key (menu_item_id, group_id)
);

create table public.tables (
  id       bigint generated always as identity primary key,
  label    text not null unique,
  qr_token text not null unique default replace(gen_random_uuid()::text, '-', '')
);

create table public.table_sessions (
  id             bigint generated always as identity primary key,
  table_id       bigint not null references public.tables(id),
  opened_at      timestamptz not null default now(),
  closed_at      timestamptz,
  call_status    text check (call_status in ('staff', 'bill')),
  called_at      timestamptz,
  payment_method text check (payment_method in ('cash', 'promptpay')),
  paid_total     numeric(10,2),
  cash_received  numeric(10,2),
  closed_by      uuid references auth.users(id)
);
-- at most one open session per table
create unique index table_sessions_one_open on public.table_sessions(table_id) where closed_at is null;
create index on public.table_sessions(closed_at);

create table public.orders (
  id         bigint generated always as identity primary key,
  session_id bigint not null references public.table_sessions(id) on delete cascade,
  source     text not null default 'customer' check (source in ('customer', 'staff')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index on public.orders(session_id);
create index on public.orders(created_at);

create table public.order_items (
  id                bigint generated always as identity primary key,
  order_id          bigint not null references public.orders(id) on delete cascade,
  menu_item_id      bigint references public.menu_items(id) on delete set null,
  name              text not null,                 -- snapshot
  unit_price        numeric(10,2) not null,        -- snapshot: base + option deltas, per unit
  qty               int not null check (qty between 1 and 20),
  note              text check (note is null or char_length(note) <= 120),
  status            text not null default 'new' check (status in ('new', 'cooking', 'served', 'cancelled')),
  status_changed_at timestamptz not null default now()
);
create index on public.order_items(order_id);
create index on public.order_items(status);

create table public.order_item_options (
  id            bigint generated always as identity primary key,
  order_item_id bigint not null references public.order_items(id) on delete cascade,
  group_id      bigint references public.option_groups(id) on delete set null,
  group_name    text not null,                     -- snapshot
  name          text not null,                     -- snapshot
  price_delta   numeric(10,2) not null default 0   -- snapshot
);
create index on public.order_item_options(order_item_id);

-- ───────────────────────── helpers ─────────────────────────

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_profiles where user_id = auth.uid());
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_profiles where user_id = auth.uid() and role = 'owner');
$$;

-- keep status_changed_at honest whatever the client sends
create or replace function public.touch_order_item_status() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end $$;

create trigger order_items_status_touch before update on public.order_items
  for each row execute function public.touch_order_item_status();

-- ───────────────────────── RLS + grants ─────────────────────────

alter table public.staff_profiles          enable row level security;
alter table public.menu_items              enable row level security;
alter table public.option_groups           enable row level security;
alter table public.options                 enable row level security;
alter table public.menu_item_option_groups enable row level security;
alter table public.tables                  enable row level security;
alter table public.table_sessions          enable row level security;
alter table public.orders                  enable row level security;
alter table public.order_items             enable row level security;
alter table public.order_item_options      enable row level security;

-- Supabase grants everything to anon/authenticated by default; start from nothing.
revoke all on all tables in schema public from anon, authenticated;

-- menu: everyone reads
grant select on public.menu_items, public.option_groups, public.options, public.menu_item_option_groups
  to anon, authenticated;
create policy menu_items_read on public.menu_items              for select to anon, authenticated using (true);
create policy groups_read     on public.option_groups           for select to anon, authenticated using (true);
create policy options_read    on public.options                 for select to anon, authenticated using (true);
create policy mig_read        on public.menu_item_option_groups for select to anon, authenticated using (true);

-- staff toggle sold-out (only that column)
grant update (is_available) on public.menu_items, public.options to authenticated;
create policy menu_items_staff_update on public.menu_items for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy options_staff_update    on public.options    for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- staff profiles: staff can see the roster (names on closed bills)
grant select on public.staff_profiles to authenticated;
create policy staff_profiles_read on public.staff_profiles for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

-- operational tables: staff read
grant select on public.tables, public.table_sessions, public.orders, public.order_items, public.order_item_options
  to authenticated;
create policy tables_staff_read   on public.tables             for select to authenticated using (public.is_staff());
create policy sessions_staff_read on public.table_sessions     for select to authenticated using (public.is_staff());
create policy orders_staff_read   on public.orders             for select to authenticated using (public.is_staff());
create policy items_staff_read    on public.order_items        for select to authenticated using (public.is_staff());
create policy oio_staff_read      on public.order_item_options for select to authenticated using (public.is_staff());

-- kitchen: change dish status only
grant update (status) on public.order_items to authenticated;
create policy items_staff_update on public.order_items for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- staff: acknowledge a call (clear call_status) only
grant update (call_status, called_at) on public.table_sessions to authenticated;
create policy sessions_staff_update on public.table_sessions for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ───────────────────────── customer RPCs ─────────────────────────

-- p_items: [{ "menu_item_id": 1, "qty": 2, "note": "ไม่ใส่ผัก", "option_ids": [3, 7] }, ...]
create or replace function public.place_order(p_token text, p_items jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_table       public.tables%rowtype;
  v_session_id  bigint;
  v_order_id    bigint;
  v_item_id     bigint;
  v_line        jsonb;
  v_menu        public.menu_items%rowtype;
  v_qty         int;
  v_note        text;
  v_opt_ids     bigint[];
  v_opt         record;
  v_grp         record;
  v_unavailable text[] := '{}';
  v_unit        numeric(10,2);
  v_is_staff    boolean := public.is_staff();
  v_cnt         int;
begin
  select * into v_table from public.tables where qr_token = p_token;
  if not found then raise exception 'invalid_table'; end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_order';
  end if;
  if jsonb_array_length(p_items) > 30 then raise exception 'too_many_lines'; end if;

  -- ── pass 1: validate everything before writing anything ──
  for v_line in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_line) <> 'object'
       or jsonb_typeof(v_line->'menu_item_id') is distinct from 'number' then
      raise exception 'invalid_item';
    end if;

    select * into v_menu from public.menu_items where id = (v_line->>'menu_item_id')::bigint;
    if not found then raise exception 'invalid_item'; end if;
    if not v_menu.is_available then v_unavailable := v_unavailable || v_menu.name; end if;

    if jsonb_typeof(v_line->'qty') is distinct from 'number'
       or (v_line->>'qty')::numeric <> trunc((v_line->>'qty')::numeric)
       or (v_line->>'qty')::numeric not between 1 and 20 then
      raise exception 'invalid_qty';
    end if;

    if v_line ? 'note' and jsonb_typeof(v_line->'note') not in ('string', 'null') then
      raise exception 'invalid_note';
    end if;
    if char_length(coalesce(v_line->>'note', '')) > 120 then raise exception 'note_too_long'; end if;

    if v_line ? 'option_ids' and jsonb_typeof(v_line->'option_ids') not in ('array', 'null') then
      raise exception 'invalid_option';
    end if;
    if exists (select 1 from jsonb_array_elements(coalesce(v_line->'option_ids', '[]')) e
               where jsonb_typeof(e) <> 'number') then
      raise exception 'invalid_option';
    end if;
    select coalesce(array_agg((e)::text::bigint), '{}') into v_opt_ids
      from jsonb_array_elements(coalesce(v_line->'option_ids', '[]')) e;
    if cardinality(v_opt_ids) <> (select count(distinct x) from unnest(v_opt_ids) x) then
      raise exception 'invalid_option';
    end if;

    -- every option must exist and belong to a group attached to this item
    select count(*) into v_cnt
      from public.options o
      join public.menu_item_option_groups mig on mig.group_id = o.group_id and mig.menu_item_id = v_menu.id
     where o.id = any(v_opt_ids);
    if v_cnt <> cardinality(v_opt_ids) then raise exception 'invalid_option'; end if;

    for v_opt in select o.name from public.options o where o.id = any(v_opt_ids) and not o.is_available loop
      v_unavailable := v_unavailable || (v_menu.name || ' (' || v_opt.name || ')');
    end loop;

    -- min / max per group
    for v_grp in
      select g.id, g.min_select, g.max_select,
             (select count(*) from public.options o where o.group_id = g.id and o.id = any(v_opt_ids)) as picked
        from public.option_groups g
        join public.menu_item_option_groups mig on mig.group_id = g.id and mig.menu_item_id = v_menu.id
    loop
      if v_grp.picked < v_grp.min_select or v_grp.picked > v_grp.max_select then
        raise exception 'option_count';
      end if;
    end loop;
  end loop;

  if cardinality(v_unavailable) > 0 then
    return jsonb_build_object('ok', false, 'unavailable', to_jsonb(v_unavailable));
  end if;

  -- ── open (or reuse) the table's session ──
  insert into public.table_sessions(table_id) values (v_table.id)
    on conflict (table_id) where closed_at is null do nothing;
  select id into v_session_id from public.table_sessions
   where table_id = v_table.id and closed_at is null
   for update;

  if not v_is_staff then
    select count(*) into v_cnt from public.orders
     where session_id = v_session_id and created_at > now() - interval '1 minute';
    if v_cnt >= 6 then raise exception 'rate_limited'; end if;
  end if;

  insert into public.orders(session_id, source, created_by)
  values (v_session_id,
          case when v_is_staff then 'staff' else 'customer' end,
          case when v_is_staff then auth.uid() end)
  returning id into v_order_id;

  -- ── pass 2: write lines with prices computed here ──
  for v_line in select * from jsonb_array_elements(p_items) loop
    select * into v_menu from public.menu_items where id = (v_line->>'menu_item_id')::bigint;
    v_qty  := (v_line->>'qty')::int;
    v_note := nullif(btrim(coalesce(v_line->>'note', '')), '');
    select coalesce(array_agg((e)::text::bigint), '{}') into v_opt_ids
      from jsonb_array_elements(coalesce(v_line->'option_ids', '[]')) e;

    select v_menu.price + coalesce(sum(o.price_delta), 0) into v_unit
      from public.options o where o.id = any(v_opt_ids);

    insert into public.order_items(order_id, menu_item_id, name, unit_price, qty, note)
    values (v_order_id, v_menu.id, v_menu.name, v_unit, v_qty, v_note)
    returning id into v_item_id;

    insert into public.order_item_options(order_item_id, group_id, group_name, name, price_delta)
    select v_item_id, g.id, g.name, o.name, o.price_delta
      from public.options o join public.option_groups g on g.id = o.group_id
     where o.id = any(v_opt_ids)
     order by g.sort_order, o.sort_order;
  end loop;

  return jsonb_build_object('ok', true, 'order_id', v_order_id, 'session_id', v_session_id);
end $$;

create or replace function public.get_table_status(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_table   public.tables%rowtype;
  v_session public.table_sessions%rowtype;
begin
  select * into v_table from public.tables where qr_token = p_token;
  if not found then raise exception 'invalid_table'; end if;

  select * into v_session from public.table_sessions
   where table_id = v_table.id and closed_at is null;

  if not found then
    return jsonb_build_object('table', v_table.label, 'session', null, 'orders', '[]'::jsonb, 'total', 0);
  end if;

  return jsonb_build_object(
    'table', v_table.label,
    'session', jsonb_build_object('id', v_session.id, 'opened_at', v_session.opened_at,
                                  'call_status', v_session.call_status),
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id, 'created_at', o.created_at, 'source', o.source,
               'items', (select coalesce(jsonb_agg(jsonb_build_object(
                           'id', i.id, 'name', i.name, 'qty', i.qty, 'unit_price', i.unit_price,
                           'note', i.note, 'status', i.status,
                           'options', (select coalesce(jsonb_agg(jsonb_build_object(
                                          'group_name', x.group_name, 'name', x.name) order by x.id), '[]'::jsonb)
                                         from public.order_item_options x where x.order_item_id = i.id)
                         ) order by i.id), '[]'::jsonb)
                         from public.order_items i where i.order_id = o.id)
             ) order by o.created_at)
        from public.orders o where o.session_id = v_session.id), '[]'::jsonb),
    'total', (select coalesce(sum(i.unit_price * i.qty), 0)
                from public.order_items i join public.orders o on o.id = i.order_id
               where o.session_id = v_session.id and i.status <> 'cancelled')
  );
end $$;

-- p_kind: 'staff' (call a waiter) or 'bill' (ask for the bill)
create or replace function public.call_staff(p_token text, p_kind text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_table   public.tables%rowtype;
  v_session bigint;
begin
  if p_kind not in ('staff', 'bill') then raise exception 'invalid_kind'; end if;
  select * into v_table from public.tables where qr_token = p_token;
  if not found then raise exception 'invalid_table'; end if;

  select id into v_session from public.table_sessions where table_id = v_table.id and closed_at is null;
  if v_session is null then
    -- no order yet: a bill makes no sense, but a customer may still need help
    if p_kind = 'bill' then raise exception 'no_order'; end if;
    insert into public.table_sessions(table_id) values (v_table.id)
      on conflict (table_id) where closed_at is null do nothing;
    select id into v_session from public.table_sessions where table_id = v_table.id and closed_at is null;
  end if;

  update public.table_sessions
     set call_status = case when call_status = 'bill' then 'bill' else p_kind end,
         called_at = now()
   where id = v_session;
  return jsonb_build_object('ok', true);
end $$;

-- ───────────────────────── staff RPCs ─────────────────────────

create or replace function public.close_table(p_session_id bigint, p_method text, p_cash_received numeric default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_session public.table_sessions%rowtype;
  v_total   numeric(10,2);
begin
  if not public.is_staff() then raise exception 'not_staff'; end if;
  if p_method not in ('cash', 'promptpay') then raise exception 'invalid_method'; end if;

  select * into v_session from public.table_sessions where id = p_session_id for update;
  if not found then raise exception 'invalid_session'; end if;
  if v_session.closed_at is not null then raise exception 'already_closed'; end if;

  select coalesce(sum(i.unit_price * i.qty), 0) into v_total
    from public.order_items i join public.orders o on o.id = i.order_id
   where o.session_id = p_session_id and i.status <> 'cancelled';

  if p_method = 'cash' then
    if p_cash_received is null or p_cash_received < v_total then raise exception 'cash_short'; end if;
  end if;

  update public.table_sessions
     set closed_at = now(), payment_method = p_method, paid_total = v_total,
         cash_received = case when p_method = 'cash' then p_cash_received end,
         closed_by = auth.uid(), call_status = null
   where id = p_session_id;

  return jsonb_build_object('ok', true, 'total', v_total,
    'change', case when p_method = 'cash' then p_cash_received - v_total else 0 end);
end $$;

create or replace function public.reopen_table(p_session_id bigint)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_session public.table_sessions%rowtype;
begin
  if not public.is_staff() then raise exception 'not_staff'; end if;
  select * into v_session from public.table_sessions where id = p_session_id for update;
  if not found then raise exception 'invalid_session'; end if;
  if v_session.closed_at is null then raise exception 'not_closed'; end if;
  if v_session.closed_at < now() - interval '10 minutes' then raise exception 'reopen_expired'; end if;
  if exists (select 1 from public.table_sessions where table_id = v_session.table_id and closed_at is null) then
    raise exception 'table_in_use';
  end if;

  update public.table_sessions
     set closed_at = null, payment_method = null, paid_total = null, cash_received = null, closed_by = null
   where id = p_session_id;
  return jsonb_build_object('ok', true);
end $$;

-- today's sales (Asia/Bangkok day), staff
create or replace function public.sales_today()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_from timestamptz := date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok';
begin
  if not public.is_staff() then raise exception 'not_staff'; end if;
  return jsonb_build_object(
    'date', to_char(now() at time zone 'Asia/Bangkok', 'YYYY-MM-DD'),
    'bills', (select count(*) from public.table_sessions where closed_at >= v_from),
    'total', (select coalesce(sum(paid_total), 0) from public.table_sessions where closed_at >= v_from),
    'cash', (select coalesce(sum(paid_total), 0) from public.table_sessions where closed_at >= v_from and payment_method = 'cash'),
    'promptpay', (select coalesce(sum(paid_total), 0) from public.table_sessions where closed_at >= v_from and payment_method = 'promptpay'),
    'open_tables', (select count(*) from public.table_sessions where closed_at is null),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'qty', qty, 'amount', amount) order by qty desc, name)
        from (select i.name, sum(i.qty) as qty, sum(i.qty * i.unit_price) as amount
                from public.order_items i
                join public.orders o on o.id = i.order_id
                join public.table_sessions s on s.id = o.session_id
               where s.closed_at >= v_from and i.status <> 'cancelled'
               group by i.name) t), '[]'::jsonb)
  );
end $$;

-- monthly report (owner only). Month boundaries in Asia/Bangkok.
create or replace function public.report_month(p_year int, p_month int)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_from timestamptz;
  v_to   timestamptz;
begin
  if not public.is_owner() then raise exception 'not_owner'; end if;
  if p_month not between 1 and 12 or p_year not between 2000 and 2100 then raise exception 'invalid_month'; end if;
  v_from := make_timestamptz(p_year, p_month, 1, 0, 0, 0, 'Asia/Bangkok');
  -- not v_from + '1 month': that adds in the session's zone (UTC on Supabase) and lands on the wrong day
  v_to   := make_timestamptz(case when p_month = 12 then p_year + 1 else p_year end,
                             case when p_month = 12 then 1 else p_month + 1 end,
                             1, 0, 0, 0, 'Asia/Bangkok');

  return jsonb_build_object(
    'year', p_year, 'month', p_month,
    'summary', (select jsonb_build_object(
                  'bills', count(*),
                  'total', coalesce(sum(paid_total), 0),
                  'cash', coalesce(sum(paid_total) filter (where payment_method = 'cash'), 0),
                  'promptpay', coalesce(sum(paid_total) filter (where payment_method = 'promptpay'), 0),
                  'avg_bill', coalesce(round(avg(paid_total), 2), 0))
                  from public.table_sessions where closed_at >= v_from and closed_at < v_to),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('date', d, 'bills', n, 'total', t, 'cash', c, 'promptpay', p) order by d)
        from (select to_char(closed_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD') d, count(*) n,
                     sum(paid_total) t,
                     coalesce(sum(paid_total) filter (where payment_method = 'cash'), 0) c,
                     coalesce(sum(paid_total) filter (where payment_method = 'promptpay'), 0) p
                from public.table_sessions where closed_at >= v_from and closed_at < v_to
               group by 1) x), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'qty', qty, 'amount', amount) order by qty desc, name)
        from (select i.name, sum(i.qty) qty, sum(i.qty * i.unit_price) amount
                from public.order_items i
                join public.orders o on o.id = i.order_id
                join public.table_sessions s on s.id = o.session_id
               where s.closed_at >= v_from and s.closed_at < v_to and i.status <> 'cancelled'
               group by i.name) x), '[]'::jsonb),
    'bills', coalesce((
      select jsonb_agg(jsonb_build_object(
               'session_id', s.id, 'table', t.label,
               'opened_at', to_char(s.opened_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI'),
               'closed_at', to_char(s.closed_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI'),
               'method', s.payment_method, 'total', s.paid_total, 'cash_received', s.cash_received,
               'closed_by', sp.display_name) order by s.closed_at)
        from public.table_sessions s
        join public.tables t on t.id = s.table_id
        left join public.staff_profiles sp on sp.user_id = s.closed_by
       where s.closed_at >= v_from and s.closed_at < v_to), '[]'::jsonb),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'session_id', s.id, 'table', t.label,
               'ordered_at', to_char(o.created_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI'),
               'source', o.source, 'name', i.name,
               'options', (select string_agg(x.name, ', ' order by x.id) from public.order_item_options x where x.order_item_id = i.id),
               'note', i.note, 'qty', i.qty, 'unit_price', i.unit_price, 'status', i.status,
               'amount', case when i.status = 'cancelled' then 0 else i.qty * i.unit_price end)
             order by o.created_at, i.id)
        from public.order_items i
        join public.orders o on o.id = i.order_id
        join public.table_sessions s on s.id = o.session_id
        join public.tables t on t.id = s.table_id
       where s.closed_at >= v_from and s.closed_at < v_to), '[]'::jsonb)
  );
end $$;

-- functions are executable by PUBLIC (and, on Supabase, anon/authenticated) by default: start from nothing
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.place_order(text, jsonb)       to anon, authenticated;
grant execute on function public.get_table_status(text)         to anon, authenticated;
grant execute on function public.call_staff(text, text)         to anon, authenticated;
grant execute on function public.is_staff()                     to authenticated;
grant execute on function public.is_owner()                     to authenticated;
grant execute on function public.close_table(bigint, text, numeric) to authenticated;
grant execute on function public.reopen_table(bigint)           to authenticated;
grant execute on function public.sales_today()                  to authenticated;
grant execute on function public.report_month(int, int)         to authenticated;

-- ───────────────────────── realtime ─────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.menu_items, public.options, public.table_sessions, public.orders, public.order_items;
  end if;
end $$;
