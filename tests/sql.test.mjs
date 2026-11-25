// Runs supabase/migrations/001_init.sql + seed.sql on PGlite (Postgres 16 in WASM)
// with a minimal Supabase shim (auth schema, anon/authenticated roles), then checks
// pricing, validation, RLS, close/reopen and reports.   npm run test:sql
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')

const db = new PGlite()
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  create publication supabase_realtime;
`)
await db.exec(read('supabase/migrations/001_init.sql'))
await db.exec(read('supabase/seed.sql'))

const OWNER = '00000000-0000-0000-0000-000000000001'
const STAFF = '00000000-0000-0000-0000-000000000002'
const RANDO = '00000000-0000-0000-0000-000000000003' // logged in, not staff
await db.exec(`
  insert into auth.users values ('${OWNER}'), ('${STAFF}'), ('${RANDO}');
  insert into public.staff_profiles values ('${OWNER}', 'แม่', 'owner'), ('${STAFF}', 'น้อง', 'staff');
  update public.tables set qr_token = 'tok' || label;
`)

// run a query as a Supabase role
async function as(role, uid, sql, params = []) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false);`)
  try {
    return (await db.query(sql, params)).rows
  } finally {
    await db.exec(`reset role;`)
  }
}
const anon = (sql, p) => as('anon', null, sql, p)
const staff = (sql, p) => as('authenticated', STAFF, sql, p)
const owner = (sql, p) => as('authenticated', OWNER, sql, p)
const rando = (sql, p) => as('authenticated', RANDO, sql, p)

async function rejects(promise, pattern, label) {
  try { await promise } catch (e) {
    assert.match(e.message, pattern, `${label}: got "${e.message}"`)
    return
  }
  assert.fail(`${label}: expected error ${pattern}`)
}

const ids = {}
for (const r of (await db.query(`select id, name from public.menu_items`)).rows) ids[r.name] = r.id
for (const r of (await db.query(`select id, name from public.options`)).rows) ids[r.name] = r.id

const order = (token, items) =>
  anon(`select public.place_order($1, $2::jsonb) as r`, [token, JSON.stringify(items)]).then((r) => r[0].r)

let passed = 0
const test = async (name, fn) => { await fn(); passed++; console.log('  ✓', name) }

// reset between rate-limit-sensitive tests
const clearOrders = () => db.exec(`delete from public.table_sessions;`)

await test('anon reads menu, nothing else', async () => {
  assert.ok((await anon(`select * from public.menu_items`)).length >= 5)
  assert.ok((await anon(`select * from public.options`)).length > 0)
  for (const t of ['tables', 'table_sessions', 'orders', 'order_items', 'order_item_options', 'staff_profiles'])
    await rejects(anon(`select * from public.${t}`), /permission denied/, `anon select ${t}`)
  await rejects(anon(`update public.menu_items set is_available = false`), /permission denied/, 'anon update menu')
  await rejects(anon(`insert into public.orders(session_id) values (1)`), /permission denied/, 'anon insert order')
  await rejects(anon(`select public.close_table(1, 'cash', 100)`), /permission denied/, 'anon close_table')
  await rejects(anon(`select public.report_month(2026, 11)`), /permission denied/, 'anon report')
})

await test('price computed in DB; client price ignored', async () => {
  const r = await order('tok1', [
    { menu_item_id: ids['ขนมจีน'], qty: 2, price: 1, unit_price: 1, note: '  ไม่ใส่ผัก ',
      option_ids: [ids['แกงไตปลา'], ids['พิเศษ'], ids['ไข่ต้ม']] },
    { menu_item_id: ids['ชาเย็น'], qty: 1, option_ids: [ids['หวานน้อย']] },
  ])
  assert.equal(r.ok, true)
  const lines = await db.query(`select name, unit_price, qty, note from public.order_items order by id`)
  assert.equal(Number(lines.rows[0].unit_price), 45 + 10 + 15 + 10)
  assert.equal(lines.rows[0].note, 'ไม่ใส่ผัก')
  assert.equal(Number(lines.rows[1].unit_price), 25)
  const st = (await anon(`select public.get_table_status('tok1') r`))[0].r
  assert.equal(Number(st.total), 80 * 2 + 25)
  assert.equal(st.table, '1')
  assert.equal(st.orders[0].items[0].options.length, 3)
  assert.equal((await db.query(`select source from public.orders`)).rows[0].source, 'customer')
})

await test('validation errors', async () => {
  const K = ids['ขนมจีน']
  const ok = [ids['น้ำยากะทิ'], ids['ธรรมดา']]
  const cases = [
    ['tokX', [{ menu_item_id: K, qty: 1, option_ids: ok }], /invalid_table/],
    ['tok2', [], /empty_order/],
    ['tok2', Array.from({ length: 31 }, () => ({ menu_item_id: ids['น้ำเปล่า'], qty: 1 })), /too_many_lines/],
    ['tok2', [{ menu_item_id: 99999, qty: 1 }], /invalid_item/],
    ['tok2', [{ menu_item_id: '1', qty: 1 }], /invalid_item/],
    ['tok2', [{ menu_item_id: K, qty: 0, option_ids: ok }], /invalid_qty/],
    ['tok2', [{ menu_item_id: K, qty: 21, option_ids: ok }], /invalid_qty/],
    ['tok2', [{ menu_item_id: K, qty: 1.5, option_ids: ok }], /invalid_qty/],
    ['tok2', [{ menu_item_id: K, qty: 1, note: 'ก'.repeat(121), option_ids: ok }], /note_too_long/],
    ['tok2', [{ menu_item_id: K, qty: 1, option_ids: [ids['ธรรมดา']] }], /option_count/],           // no curry
    ['tok2', [{ menu_item_id: K, qty: 1, option_ids: [...ok, ids['น้ำยาป่า']] }], /option_count/],   // two curries
    ['tok2', [{ menu_item_id: K, qty: 1, option_ids: [...ok, ids['หวานน้อย']] }], /invalid_option/], // other item's group
    ['tok2', [{ menu_item_id: K, qty: 1, option_ids: [...ok, ok[0]] }], /invalid_option/],           // duplicate
    ['tok2', [{ menu_item_id: K, qty: 1, option_ids: [...ok, ids['ไข่ต้ม'], ids['เส้นเพิ่ม'], ids['ลูกชิ้นปลา'], 9999] }], /invalid_option/],
  ]
  for (const [tok, items, re] of cases) await rejects(order(tok, items), re, re.source)
  assert.equal((await db.query(`select count(*)::int n from public.table_sessions t join public.tables x on x.id = t.table_id where x.label = '2'`)).rows[0].n, 0, 'no session opened by bad orders')
  // 3 extras at max is fine
  const r = await order('tok2', [{ menu_item_id: K, qty: 1, option_ids: [...ok, ids['ไข่ต้ม'], ids['เส้นเพิ่ม'], ids['ลูกชิ้นปลา']] }])
  assert.equal(r.ok, true)
})

await test('sold-out item / option returns unavailable names, writes nothing', async () => {
  await db.exec(`update public.menu_items set is_available = false where name = 'ทอดมันปลากราย';
                 update public.options set is_available = false where name = 'น้ำยาป่า';`)
  const before = (await db.query(`select count(*)::int n from public.orders`)).rows[0].n
  const r = await order('tok3', [
    { menu_item_id: ids['ทอดมันปลากราย'], qty: 1 },
    { menu_item_id: ids['ขนมจีน'], qty: 1, option_ids: [ids['น้ำยาป่า'], ids['ธรรมดา']] },
    { menu_item_id: ids['น้ำเปล่า'], qty: 1 },
  ])
  assert.deepEqual(r, { ok: false, unavailable: ['ทอดมันปลากราย', 'ขนมจีน (น้ำยาป่า)'] })
  assert.equal((await db.query(`select count(*)::int n from public.orders`)).rows[0].n, before)
  await db.exec(`update public.menu_items set is_available = true; update public.options set is_available = true;`)
})

await test('rate limit 6 orders/min per session (customers only)', async () => {
  await clearOrders()
  const line = [{ menu_item_id: ids['น้ำเปล่า'], qty: 1 }]
  for (let i = 0; i < 6; i++) assert.equal((await order('tok4', line)).ok, true)
  await rejects(order('tok4', line), /rate_limited/, 'rate limit')
  const r = await staff(`select public.place_order('tok4', $1::jsonb) r`, [JSON.stringify(line)])
  assert.equal(r[0].r.ok, true, 'staff not rate limited')
  const src = await db.query(`select source, created_by from public.orders order by id desc limit 1`)
  assert.equal(src.rows[0].source, 'staff')
  assert.equal(src.rows[0].created_by, STAFF)
})

await test('call_staff', async () => {
  await clearOrders()
  await rejects(anon(`select public.call_staff('tok5', 'bill')`), /no_order/, 'bill without order')
  await anon(`select public.call_staff('tok5', 'staff')`)
  assert.equal((await anon(`select public.get_table_status('tok5') r`))[0].r.session.call_status, 'staff')
  await order('tok5', [{ menu_item_id: ids['น้ำเปล่า'], qty: 1 }])
  await anon(`select public.call_staff('tok5', 'bill')`)
  await anon(`select public.call_staff('tok5', 'staff')`) // bill wins
  assert.equal((await anon(`select public.get_table_status('tok5') r`))[0].r.session.call_status, 'bill')
  await rejects(anon(`select public.call_staff('tok5', 'x')`), /invalid_kind/, 'kind')
})

await test('staff RLS: read + status only; non-staff sees nothing', async () => {
  assert.ok((await staff(`select * from public.orders`)).length > 0)
  assert.equal((await rando(`select * from public.orders`)).length, 0)
  assert.equal((await rando(`select * from public.tables`)).length, 0)
  const [{ id }] = await staff(`select id from public.order_items limit 1`)
  await staff(`update public.order_items set status = 'cooking' where id = $1`, [id])
  assert.equal((await db.query(`select status from public.order_items where id = $1`, [id])).rows[0].status, 'cooking')
  await rejects(staff(`update public.order_items set unit_price = 0 where id = $1`, [id]), /permission denied/, 'price edit')
  await rejects(staff(`update public.order_items set status = 'eaten' where id = $1`, [id]), /check constraint/, 'bad status')
  await rando(`update public.order_items set status = 'cancelled' where id = $1`, [id])
  assert.equal((await db.query(`select status from public.order_items where id = $1`, [id])).rows[0].status, 'cooking', 'rando update ignored')
  await staff(`update public.menu_items set is_available = false where id = $1`, [ids['ชาเย็น']])
  await rejects(staff(`update public.menu_items set price = 1`), /permission denied/, 'staff price edit')
  await staff(`update public.table_sessions set call_status = null`)
  await rejects(staff(`update public.table_sessions set paid_total = 0`), /permission denied/, 'paid_total edit')
  await db.exec(`update public.menu_items set is_available = true`)
})

await test('close / reopen table', async () => {
  await clearOrders()
  await order('tok6', [{ menu_item_id: ids['ขนมจีน'], qty: 3, option_ids: [ids['น้ำยากะทิ'], ids['ธรรมดา']] }]) // 135
  await order('tok6', [{ menu_item_id: ids['ชาเย็น'], qty: 1, option_ids: [ids['ไม่หวาน']] }])               // 25
  const [{ sid }] = await db.query(`select id sid from public.table_sessions`).then((r) => r.rows)
  // cancelled items are not billed
  await db.exec(`update public.order_items set status = 'cancelled' where name = 'ชาเย็น'`)
  await rejects(rando(`select public.close_table($1, 'cash', 500)`, [sid]), /not_staff/, 'rando close')
  await rejects(staff(`select public.close_table($1, 'cash', 100)`, [sid]), /cash_short/, 'cash short')
  const r = (await staff(`select public.close_table($1, 'cash', 500) r`, [sid]))[0].r
  assert.equal(Number(r.total), 135)
  assert.equal(Number(r.change), 365)
  await rejects(staff(`select public.close_table($1, 'promptpay')`, [sid]), /already_closed/, 'double close')
  // new order opens a new session
  await order('tok6', [{ menu_item_id: ids['น้ำเปล่า'], qty: 1 }])
  await rejects(staff(`select public.reopen_table($1)`, [sid]), /table_in_use/, 'reopen while in use')
  await db.exec(`delete from public.table_sessions where closed_at is null`)
  assert.equal((await staff(`select public.reopen_table($1) r`, [sid]))[0].r.ok, true)
  assert.equal(Number((await anon(`select public.get_table_status('tok6') r`))[0].r.total), 135)
  await staff(`select public.close_table($1, 'promptpay')`, [sid])
  await db.exec(`update public.table_sessions set closed_at = now() - interval '11 minutes' where id = ${sid}`)
  await rejects(staff(`select public.reopen_table($1)`, [sid]), /reopen_expired/, 'reopen expired')
})

await test('sales_today + report_month (owner only, Bangkok month boundaries)', async () => {
  const today = (await staff(`select public.sales_today() r`))[0].r
  assert.equal(Number(today.promptpay), 135)
  assert.equal(today.bills, 1)
  await rejects(staff(`select public.report_month(2026, 11)`), /not_owner/, 'staff report')

  await clearOrders()
  // 30 Nov 23:30 BKK (Nov) and 1 Dec 00:30 BKK (Dec)
  for (const [tok, closed] of [['tok7', '2026-11-30 16:30+00'], ['tok8', '2026-11-30 17:30+00']]) {
    await order(tok, [{ menu_item_id: ids['น้ำเปล่า'], qty: 2 }])
    await staff(`select public.close_table(id, 'cash', 100) from public.table_sessions where closed_at is null`)
    await db.exec(`update public.table_sessions set closed_at = '${closed}', opened_at = '${closed}' where table_id = (select id from public.tables where qr_token = '${tok}')`)
  }
  const nov = (await owner(`select public.report_month(2026, 11) r`))[0].r
  const dec = (await owner(`select public.report_month(2026, 12) r`))[0].r
  assert.equal(nov.summary.bills, 1); assert.equal(Number(nov.summary.total), 20)
  assert.equal(nov.bills[0].table, '7'); assert.equal(nov.daily[0].date, '2026-11-30')
  assert.equal(dec.summary.bills, 1); assert.equal(dec.bills[0].table, '8'); assert.equal(dec.daily[0].date, '2026-12-01')
  assert.equal(dec.lines[0].name, 'น้ำเปล่า'); assert.equal(dec.items[0].qty, 2)
  assert.equal(dec.bills[0].closed_by, 'น้อง')
})

console.log(`\n${passed} SQL test groups passed`)
