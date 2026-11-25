// In-memory stand-in for @supabase/supabase-js, for clicking through screens without a project.
// Used only by `npm run dev:mock` (vite.config.js aliases the package in "mock" mode).
// Not a security test: RLS / pricing are tested against Postgres in tests/sql.test.mjs.

const now = () => new Date().toISOString()
const ago = (min) => new Date(Date.now() - min * 60e3).toISOString()
let seq = 1000

const groups = [
  { id: 1, name: 'น้ำยา', min_select: 1, max_select: 1, sort_order: 1, kitchen_tally: true },
  { id: 2, name: 'ขนาด', min_select: 1, max_select: 1, sort_order: 2, kitchen_tally: false },
  { id: 3, name: 'เพิ่มเติม', min_select: 0, max_select: 3, sort_order: 3, kitchen_tally: false },
  { id: 4, name: 'ความหวาน', min_select: 1, max_select: 1, sort_order: 4, kitchen_tally: false },
]
const options = [
  [1, 1, 'น้ำยากะทิ', 0], [2, 1, 'น้ำยาป่า', 0], [3, 1, 'แกงเขียวหวานไก่', 0], [4, 1, 'น้ำพริก', 0], [5, 1, 'แกงไตปลา', 10],
  [6, 2, 'ธรรมดา', 0], [7, 2, 'พิเศษ', 15], [8, 3, 'ไข่ต้ม', 10], [9, 3, 'เส้นเพิ่ม', 10], [10, 3, 'ลูกชิ้นปลา', 15],
  [11, 4, 'หวานปกติ', 0], [12, 4, 'หวานน้อย', 0], [13, 4, 'ไม่หวาน', 0],
].map(([id, group_id, name, price_delta], i) => ({ id, group_id, name, price_delta, is_available: id !== 4, sort_order: i }))
const menu_items = [
  [1, 'ขนมจีน', 'เลือกน้ำยาได้ 1 อย่าง พร้อมผักเครื่องเคียง', 45, 'noodle'],
  [2, 'ทอดมันปลากราย', '5 ชิ้น พร้อมน้ำจิ้ม', 50, 'side'],
  [3, 'ไข่ต้ม', '1 ฟอง', 10, 'side'],
  [4, 'ชาเย็น', '', 25, 'drink'],
  [5, 'น้ำเปล่า', 'ขวดเล็ก', 10, 'drink'],
].map(([id, name, description, price, category], i) => ({ id, name, description, price, category, is_available: id !== 3, sort_order: i, image_url: null }))
const links = [[1, 1], [1, 2], [1, 3], [4, 4]].map(([menu_item_id, group_id], i) => ({ menu_item_id, group_id, sort_order: i }))
const tables = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, label: String(i + 1), qr_token: `tok${i + 1}` }))
const sessions = []
const staff = { user_id: 'u1', display_name: 'แม่', role: 'owner' }
let signedIn = true

function line(menuId, qty, optIds, note, status, createdAt) {
  const m = menu_items.find((x) => x.id === menuId)
  const opts = options.filter((o) => optIds.includes(o.id))
  return {
    id: ++seq, name: m.name, qty, note, status, status_changed_at: createdAt,
    unit_price: m.price + opts.reduce((s, o) => s + o.price_delta, 0),
    order_item_options: opts.map((o) => ({ id: ++seq, group_id: o.group_id, group_name: groups.find((g) => g.id === o.group_id).name, name: o.name })),
  }
}
function addOrder(tableId, items, minutesAgo = 0, source = 'customer') {
  let s = sessions.find((x) => x.table_id === tableId && !x.closed_at)
  if (!s) { s = { id: ++seq, table_id: tableId, opened_at: ago(minutesAgo), closed_at: null, call_status: null, payment_method: null, paid_total: null, cash_received: null, orders: [] }; sessions.push(s) }
  const created_at = ago(minutesAgo)
  s.orders.push({ id: ++seq, created_at, source, order_items: items.map((i) => line(...i, created_at)) })
  return s
}
addOrder(2, [[1, 2, [1, 6], 'ไม่ใส่ผัก', 'cooking'], [4, 1, [12], null, 'new']], 14)
addOrder(5, [[1, 1, [5, 7, 8], null, 'new'], [5, 2, [], null, 'served']], 3).call_status = 'bill'
addOrder(5, [[2, 1, [], null, 'new']], 1, 'staff')

const sessionView = (s) => ({ ...s, tables: tables.find((t) => t.id === s.table_id) })
const total = (s) => s.orders.flatMap((o) => o.order_items).filter((i) => i.status !== 'cancelled').reduce((a, i) => a + i.unit_price * i.qty, 0)

function rows(table) {
  switch (table) {
    case 'menu_items': return menu_items
    case 'option_groups': return groups
    case 'options': return options
    case 'menu_item_option_groups': return links
    case 'tables': return tables
    case 'staff_profiles': return [staff]
    case 'table_sessions': return sessions.filter((s) => !s.closed_at || Date.now() - new Date(s.closed_at) < 10 * 60e3)
    case 'orders': return sessions.flatMap((s) => s.orders.map((o) => ({ ...o, table_sessions: sessionView(s) })))
    case 'order_items': return sessions.flatMap((s) => s.orders.flatMap((o) => o.order_items))
    default: return []
  }
}

class Query {
  constructor(table) { this.table = table; this.filters = []; this.patch = null; this.single = false }
  select() { return this }
  order() { return this }
  gte() { return this }
  or() { return this }
  eq(col, val) { this.filters.push([col, val]); return this }
  maybeSingle() { this.single = true; return this }
  update(patch) { this.patch = patch; return this }
  then(resolve, reject) {
    try {
      let data = rows(this.table).filter((r) => this.filters.every(([c, v]) => r[c] === v))
      if (this.patch) { for (const r of data) Object.assign(r, this.patch); data = null }
      else data = structuredClone(data)
      resolve({ data: this.single ? (data?.[0] ?? null) : data, error: null })
    } catch (e) { reject(e) }
  }
}

const err = (message) => ({ data: null, error: { message } })
async function rpc(name, a) {
  await new Promise((r) => setTimeout(r, 150))
  const t = tables.find((x) => x.qr_token === a?.p_token)
  const open = t && sessions.find((s) => s.table_id === t.id && !s.closed_at)
  switch (name) {
    case 'get_table_status':
      if (!t) return err('invalid_table')
      return { error: null, data: {
        table: t.label,
        session: open ? { id: open.id, opened_at: open.opened_at, call_status: open.call_status } : null,
        orders: open ? structuredClone(open.orders).map((o) => ({ ...o, items: o.order_items.map((i) => ({ ...i, options: i.order_item_options })) })) : [],
        total: open ? total(open) : 0,
      } }
    case 'place_order': {
      if (!t) return err('invalid_table')
      const sold = []
      for (const l of a.p_items) {
        const m = menu_items.find((x) => x.id === l.menu_item_id)
        if (!m.is_available) sold.push(m.name)
        for (const o of options) if (l.option_ids.includes(o.id) && !o.is_available) sold.push(`${m.name} (${o.name})`)
      }
      if (sold.length) return { data: { ok: false, unavailable: sold }, error: null }
      addOrder(t.id, a.p_items.map((l) => [l.menu_item_id, l.qty, l.option_ids, l.note, 'new']), 0, signedIn ? 'staff' : 'customer')
      return { data: { ok: true }, error: null }
    }
    case 'call_staff':
      if (!open && a.p_kind === 'bill') return err('no_order')
      if (open) open.call_status = open.call_status === 'bill' ? 'bill' : a.p_kind
      return { data: { ok: true }, error: null }
    case 'close_table': {
      const s = sessions.find((x) => x.id === a.p_session_id)
      const tot = total(s)
      if (a.p_method === 'cash' && a.p_cash_received < tot) return err('cash_short')
      Object.assign(s, { closed_at: now(), payment_method: a.p_method, paid_total: tot, cash_received: a.p_cash_received, call_status: null })
      return { data: { ok: true, total: tot, change: a.p_method === 'cash' ? a.p_cash_received - tot : 0 }, error: null }
    }
    case 'reopen_table': {
      const s = sessions.find((x) => x.id === a.p_session_id)
      if (sessions.some((x) => x.table_id === s.table_id && !x.closed_at)) return err('table_in_use')
      Object.assign(s, { closed_at: null, payment_method: null, paid_total: null })
      return { data: { ok: true }, error: null }
    }
    case 'sales_today': {
      const closed = sessions.filter((s) => s.closed_at)
      const sum = (f) => closed.filter(f).reduce((x, s) => x + s.paid_total, 0)
      return { error: null, data: { bills: closed.length, total: sum(() => true), cash: sum((s) => s.payment_method === 'cash'),
        promptpay: sum((s) => s.payment_method === 'promptpay'), open_tables: sessions.filter((s) => !s.closed_at).length,
        items: [{ name: 'ขนมจีน', qty: 3, amount: 145 }] } }
    }
    case 'report_month':
      return { error: null, data: { year: a.p_year, month: a.p_month,
        summary: { bills: 2, total: 300, cash: 200, promptpay: 100, avg_bill: 150 },
        daily: [{ date: `${a.p_year}-${String(a.p_month).padStart(2, '0')}-03`, bills: 2, total: 300, cash: 200, promptpay: 100 }],
        items: [{ name: 'ขนมจีน', qty: 4, amount: 200 }],
        bills: [{ session_id: 1, table: '2', opened_at: '2026-11-03 11:00', closed_at: '2026-11-03 11:40', method: 'cash', total: 200, cash_received: 500, closed_by: 'แม่' }],
        lines: [{ session_id: 1, table: '2', ordered_at: '2026-11-03 11:02', source: 'customer', name: 'ขนมจีน', options: 'น้ำยากะทิ, ธรรมดา', note: null, qty: 4, unit_price: 45, status: 'served', amount: 180 }],
      } }
    default: return err('unknown rpc ' + name)
  }
}

export function createClient() {
  const listeners = new Set()
  const session = () => (signedIn ? { user: { id: 'u1', email: 'mom@example.test' } } : null)
  const channel = { on() { return channel }, subscribe() { return channel } }
  return {
    from: (t) => new Query(t),
    rpc,
    channel: () => channel,
    removeChannel() {},
    auth: {
      getSession: async () => ({ data: { session: session() } }),
      onAuthStateChange: (cb) => { listeners.add(cb); return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } } },
      signInWithPassword: async () => { signedIn = true; listeners.forEach((l) => l('SIGNED_IN', session())); return { error: null } },
      signOut: async () => { signedIn = false; listeners.forEach((l) => l('SIGNED_OUT', null)); return { error: null } },
    },
  }
}
