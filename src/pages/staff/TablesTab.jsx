import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { supabase, rpc, errorText, PROMPTPAY_ID } from '../../lib/supabase'
import { useLive } from '../../lib/useLive'
import { baht, timeTH, minutesSince, lineTotal, STATUS_TEXT } from '../../lib/format'
import { promptpayPayload } from '../../lib/promptpay'
import { Icon } from '../../components/Art'

const REOPEN_MIN = 10
const NOTES = [20, 50, 100, 500, 1000]

async function fetchTables() {
  const since = new Date(Date.now() - REOPEN_MIN * 60e3).toISOString()
  const [tables, sessions] = await Promise.all([
    supabase.from('tables').select('id, label, qr_token').order('id'),
    supabase.from('table_sessions')
      .select('*, orders(id, created_at, source, order_items(id, name, qty, unit_price, note, status, order_item_options(id, name)))')
      .or(`closed_at.is.null,closed_at.gte.${since}`)
      .order('opened_at'),
  ])
  if (tables.error) throw tables.error
  if (sessions.error) throw sessions.error
  return { tables: tables.data, sessions: sessions.data }
}

function summarize(session, now) {
  const items = session.orders.flatMap((o) => o.order_items.map((i) => ({ ...i, created_at: o.created_at })))
  const live = items.filter((i) => i.status !== 'cancelled')
  return {
    items,
    total: live.reduce((s, i) => s + lineTotal(i), 0),
    count: live.reduce((s, i) => s + i.qty, 0),
    pending: live.filter((i) => i.status === 'new' || i.status === 'cooking'),
    late: live.some((i) => (i.status === 'new' || i.status === 'cooking') && minutesSince(i.created_at, now) >= 10),
  }
}

export default function TablesTab() {
  const { data, error, loading, refresh } = useLive(['table_sessions', 'orders', 'order_items'], fetchTables, { interval: 20000 })
  const [selected, setSelected] = useState(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t) }, [])

  const rows = useMemo(() => (data?.tables ?? []).map((t) => {
    const open = data.sessions.find((s) => s.table_id === t.id && !s.closed_at)
    const closed = data.sessions.filter((s) => s.table_id === t.id && s.closed_at)
      .sort((a, b) => b.closed_at.localeCompare(a.closed_at))[0]
    const sum = open && summarize(open, now)
    let state = 'free', words = 'ว่าง'
    if (open) {
      state = 'busy'; words = `${sum.count} รายการ`
      if (sum.late) { state = 'late'; words = 'มีจานรอเกิน 10 นาที' }
      if (open.call_status === 'staff') { state = 'call'; words = 'เรียกพนักงาน' }
      if (open.call_status === 'bill') { state = 'bill'; words = 'ขอเช็คบิล' }
    } else if (closed) { state = 'closed'; words = 'เพิ่งปิดบิล' }
    return { table: t, open, closed, sum, state, words }
  }), [data, now])

  if (loading && !data) return <div className="spinner" role="status" aria-label="กำลังโหลด" style={{ marginTop: 40 }} />
  const sel = rows.find((r) => r.table.id === selected)
  const calls = rows.filter((r) => r.open?.call_status)

  return (
    <div className="stack">
      {error && (
        <div className="alert alert-error" role="alert">
          <Icon name="wifiOff" /><span className="grow">{errorText(error)} — ใช้กระดาษไปก่อน แล้วค่อยคีย์ผ่าน “สั่งแทนลูกค้า”</span>
          <button className="btn btn-sm btn-outline" onClick={refresh}>ลองใหม่</button>
        </div>
      )}
      {calls.length > 0 && (
        <div className="alert alert-info" role="status">
          <Icon name="bell" />
          <span>{calls.map((r) => `โต๊ะ ${r.table.label} ${r.open.call_status === 'bill' ? 'ขอเช็คบิล' : 'เรียกพนักงาน'}`).join(' · ')}</span>
        </div>
      )}
      <div className="staff-layout">
        <div className="tiles">
          {rows.map((r) => (
            <button key={r.table.id} className={`card tile s-${r.state}`} aria-pressed={selected === r.table.id}
              onClick={() => setSelected(r.table.id)}>
              <span className="tno">{r.table.label}</span>
              <span style={{ fontFamily: 'var(--font-head)', fontWeight: 500 }}>
                {(r.state === 'call' || r.state === 'bill') && <Icon name="bell" size={18} />}
                {r.state === 'late' && <Icon name="alert" size={18} />} {r.words}
              </span>
              {r.open && <span className="price">{baht(r.sum.total)}</span>}
              {r.open && <span className="muted small">ตั้งแต่ {timeTH(r.open.opened_at)}</span>}
            </button>
          ))}
        </div>
        <div className="bill-panel">
          {sel ? <BillPanel key={sel.table.id} row={sel} refresh={refresh} /> : <p className="card muted">แตะโต๊ะเพื่อดูบิล</p>}
        </div>
      </div>
    </div>
  )
}

function BillPanel({ row, refresh }) {
  const { table, open, closed, sum } = row
  const [method, setMethod] = useState('cash')
  const [received, setReceived] = useState(0)
  const [custom, setCustom] = useState('')
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(null)

  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t) }, [armed])

  const orderLink = `/t/${table.qr_token}?staff=1`
  const total = sum?.total ?? 0
  const cash = custom !== '' ? Number(custom) : received
  const change = cash - total

  async function act(fn) {
    setBusy(true); setErr('')
    try { await fn(); refresh() } catch (e) { setErr(errorText(e)) } finally { setBusy(false); setArmed(false) }
  }

  const close = () => act(async () => {
    const r = await rpc('close_table', { p_session_id: open.id, p_method: method, p_cash_received: method === 'cash' ? cash : null })
    setDone({ total: Number(r.total), change: Number(r.change), method })
  })
  const ack = () => act(async () => {
    const { error } = await supabase.from('table_sessions').update({ call_status: null }).eq('id', open.id)
    if (error) throw error
  })
  const reopen = () => act(async () => { await rpc('reopen_table', { p_session_id: closed.id }); setDone(null) })

  if (done) {
    return (
      <div className="card stack">
        <h2>โต๊ะ {table.label} ปิดบิลแล้ว</h2>
        <div className="row between"><span>ยอด</span><span className="total">{baht(done.total)}</span></div>
        {done.method === 'cash' && (
          <div className="alert alert-ok"><Icon name="cash" /><span className="grow">ทอนเงิน</span><span className="change">{baht(done.change)}</span></div>
        )}
        {closed && <button className="btn btn-outline" disabled={busy} onClick={reopen}><Icon name="undo" />เปิดบิลคืน (ภายใน 10 นาที)</button>}
        {err && <div className="alert alert-error" role="alert"><Icon name="alert" />{err}</div>}
      </div>
    )
  }

  if (!open) {
    const canReopen = closed && minutesSince(closed.closed_at) < REOPEN_MIN
    return (
      <div className="card stack">
        <div className="row between"><h2>โต๊ะ {table.label}</h2><span className="chip">{closed ? 'เพิ่งปิดบิล' : 'ว่าง'}</span></div>
        {closed && <p style={{ margin: 0 }}>ปิดเมื่อ {timeTH(closed.closed_at)} · {baht(closed.paid_total)} · {closed.payment_method === 'cash' ? 'เงินสด' : 'พร้อมเพย์'}</p>}
        {canReopen && <button className="btn btn-outline" disabled={busy} onClick={reopen}><Icon name="undo" />เปิดบิลคืน</button>}
        <Link to={orderLink} className="btn btn-primary"><Icon name="plus" />สั่งแทนลูกค้า</Link>
        {err && <div className="alert alert-error" role="alert"><Icon name="alert" />{err}</div>}
      </div>
    )
  }

  let qr = null
  if (method === 'promptpay' && PROMPTPAY_ID && total > 0) {
    try { qr = promptpayPayload(PROMPTPAY_ID, total) } catch { qr = null }
  }

  return (
    <div className="card stack">
      <div className="row between">
        <h2>โต๊ะ {table.label}</h2>
        <span className="muted small">เปิด {timeTH(open.opened_at)}</span>
      </div>

      {open.call_status && (
        <div className="alert alert-info">
          <Icon name="bell" /><span className="grow">{open.call_status === 'bill' ? 'ลูกค้าขอเช็คบิล' : 'ลูกค้าเรียกพนักงาน'}</span>
          <button className="btn btn-sm btn-outline" disabled={busy} onClick={ack}><Icon name="check" />รับทราบ</button>
        </div>
      )}

      <ul className="bill-lines">
        {sum.items.map((i) => (
          <li key={i.id}>
            <span style={{ minWidth: 28, fontFamily: 'var(--font-head)' }}>{i.qty}×</span>
            <span className="grow" style={{ textDecoration: i.status === 'cancelled' ? 'line-through' : 'none' }}>
              {i.name}
              {i.order_item_options.length > 0 && <span className="opts-line" style={{ display: 'block' }}>{i.order_item_options.map((o) => o.name).join(' · ')}</span>}
              {i.status !== 'served' && <span className={`chip chip-${i.status}`} style={{ fontSize: 13 }}>{STATUS_TEXT[i.status]}</span>}
            </span>
            <span className="price">{i.status === 'cancelled' ? '—' : baht(lineTotal(i))}</span>
          </li>
        ))}
      </ul>
      <div className="row between"><span style={{ fontFamily: 'var(--font-head)' }}>รวม</span><span className="total">{baht(total)}</span></div>
      {sum.pending.length > 0 && (
        <div className="alert alert-info"><Icon name="clock" />ยังมี {sum.pending.length} จานที่ยังไม่เสิร์ฟ</div>
      )}

      <Link to={orderLink} className="btn btn-outline"><Icon name="plus" />สั่งแทนลูกค้า</Link>

      <div className="row" role="radiogroup" aria-label="วิธีชำระเงิน">
        {[['cash', 'เงินสด', 'cash'], ['promptpay', 'พร้อมเพย์', 'qr']].map(([k, label, icon]) => (
          <button key={k} role="radio" aria-checked={method === k} className={`btn grow ${method === k ? 'btn-primary' : 'btn-outline'}`}
            style={{ minHeight: 48 }} onClick={() => { setMethod(k); setArmed(false) }}>
            <Icon name={icon} />{label}
          </button>
        ))}
      </div>

      {method === 'cash' ? (
        <div className="stack">
          <span className="muted small">แตะแบงก์ที่ลูกค้าจ่าย (แตะซ้ำเพื่อบวกเพิ่ม)</span>
          <div className="notes-grid">
            {NOTES.map((n) => (
              <button key={n} className="btn" onClick={() => { setCustom(''); setReceived((r) => r + n) }}>{n}</button>
            ))}
            <button className="btn" onClick={() => { setCustom(''); setReceived(total) }}>พอดี</button>
          </div>
          <div className="row">
            <input className="input grow" inputMode="decimal" placeholder="หรือพิมพ์จำนวนเงิน" aria-label="จำนวนเงินที่รับ"
              value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, ''))} />
            <button className="btn btn-outline" onClick={() => { setReceived(0); setCustom('') }}>ล้าง</button>
          </div>
          <div className="row between"><span>รับเงิน</span><b style={{ fontSize: 22 }}>{baht(cash)}</b></div>
          <div className={`alert ${cash >= total && cash > 0 ? 'alert-ok' : 'alert-info'}`}>
            <Icon name="cash" /><span className="grow">{cash < total ? 'ยังขาดอีก' : 'ทอน'}</span>
            <span className="change">{baht(Math.abs(change))}</span>
          </div>
        </div>
      ) : (
        <div className="qr-box">
          {qr ? <><QRCodeSVG value={qr} size={220} marginSize={2} title={`พร้อมเพย์ ${baht(total)}`} /><b>สแกนจ่าย {baht(total)}</b></>
            : <span>{PROMPTPAY_ID ? 'ยอดเป็น 0' : 'ยังไม่ได้ตั้งค่าเบอร์พร้อมเพย์ (VITE_PROMPTPAY_ID)'}</span>}
        </div>
      )}

      {err && <div className="alert alert-error" role="alert"><Icon name="alert" />{err}</div>}
      <button className={`btn btn-block ${armed ? 'btn-danger' : 'btn-primary'}`}
        disabled={busy || (method === 'cash' && cash < total)}
        onClick={() => (armed ? close() : setArmed(true))}>
        {busy ? 'กำลังปิดบิล…' : armed ? 'แตะอีกครั้งเพื่อยืนยันปิดบิล' : `ปิดบิล ${baht(total)}`}
      </button>
    </div>
  )
}
