import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errorText } from '../lib/supabase'
import { useLive } from '../lib/useLive'
import { timeTH, minutesSince } from '../lib/format'
import { Icon } from '../components/Art'
import { signOut } from '../components/RequireStaff'

const NEXT = { new: 'cooking', cooking: 'served', served: 'new' }
const ACTIVE = new Set(['new', 'cooking'])
const LATE_MIN = 10
const K_TEXT = { new: 'ใหม่', cooking: 'กำลังทำ', served: 'เสิร์ฟแล้ว', cancelled: 'ยกเลิก' }

async function fetchBoard() {
  const since = new Date(Date.now() - 16 * 3600e3).toISOString()
  const [orders, groups] = await Promise.all([
    supabase.from('orders')
      .select('id, created_at, source, table_sessions!inner(id, closed_at, tables(label)), order_items(id, name, qty, note, status, status_changed_at, order_item_options(id, group_id, group_name, name))')
      .gte('created_at', since)
      .order('created_at'),
    supabase.from('option_groups').select('id').eq('kitchen_tally', true),
  ])
  if (orders.error) throw orders.error
  if (groups.error) throw groups.error
  return { orders: orders.data, tallyGroups: new Set(groups.data.map((g) => g.id)) }
}

function beep() {
  try {
    const ctx = beep.ctx || (beep.ctx = new (window.AudioContext || window.webkitAudioContext)())
    const t = ctx.currentTime
    for (const [i, f] of [880, 1320].entries()) {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = f
      g.gain.setValueAtTime(0.0001, t + i * 0.22)
      g.gain.exponentialRampToValueAtTime(0.4, t + i * 0.22 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.22 + 0.2)
      o.connect(g).connect(ctx.destination)
      o.start(t + i * 0.22)
      o.stop(t + i * 0.22 + 0.21)
    }
  } catch { /* no audio */ }
}

export default function KitchenPage() {
  const { data, error, loading, setData, refresh } = useLive(['orders', 'order_items'], fetchBoard, { interval: 20000 })
  const [sound, setSound] = useState(() => localStorage.getItem('kitchen-sound') === '1')
  const [now, setNow] = useState(Date.now())
  const [undo, setUndo] = useState(null)       // { id, prev, name }
  const [arming, setArming] = useState(null)   // item id awaiting cancel confirm
  const [actionError, setActionError] = useState('')
  const seen = useRef(null)

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t) }, [])
  useEffect(() => { localStorage.setItem('kitchen-sound', sound ? '1' : '0') }, [sound])
  useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(null), 8000); return () => clearTimeout(t) }, [undo])
  useEffect(() => { if (!arming) return; const t = setTimeout(() => setArming(null), 4000); return () => clearTimeout(t) }, [arming])

  const tickets = useMemo(() => (data?.orders ?? [])
    .filter((o) => o.order_items.some((i) => ACTIVE.has(i.status)))
    .map((o) => ({ ...o, order_items: [...o.order_items].sort((a, b) => a.id - b.id) })), [data])

  // sound on new tickets (not on first load)
  useEffect(() => {
    if (!data) return
    const ids = new Set(data.orders.map((o) => o.id))
    if (seen.current) {
      const fresh = tickets.some((t) => !seen.current.has(t.id))
      if (fresh && sound) beep()
    }
    seen.current = ids
  }, [data, tickets, sound])

  const tally = useMemo(() => {
    const curry = new Map()
    const dishes = new Map()
    for (const t of tickets) for (const i of t.order_items) {
      if (!ACTIVE.has(i.status)) continue
      dishes.set(i.name, (dishes.get(i.name) ?? 0) + i.qty)
      for (const o of i.order_item_options)
        if (data.tallyGroups.has(o.group_id)) curry.set(o.name, (curry.get(o.name) ?? 0) + i.qty)
    }
    const sort = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])
    return { curry: sort(curry), dishes: sort(dishes) }
  }, [tickets, data])

  async function setStatus(item, status, { record = true } = {}) {
    setActionError('')
    const prev = item.status
    const patch = (s) => setData((d) => d && ({
      ...d,
      orders: d.orders.map((o) => ({ ...o, order_items: o.order_items.map((i) => (i.id === item.id ? { ...i, status: s } : i)) })),
    }))
    patch(status)
    if (record) setUndo({ id: item.id, prev, name: item.name, status })
    const { error } = await supabase.from('order_items').update({ status }).eq('id', item.id)
    if (error) {
      patch(prev)
      setUndo(null)
      setActionError(errorText(error))
    }
  }

  function tapCancel(item) {
    if (arming === item.id) { setArming(null); setStatus(item, 'cancelled') }
    else setArming(item.id)
  }

  return (
    <div className="kitchen page">
      <header className="appbar">
        <div className="inner">
          <Icon name="chef" />
          <span className="shop-name grow">ครัว</span>
          <span aria-live="polite" className="small" style={{ whiteSpace: 'nowrap' }}>{tickets.length} บิลรอ</span>
          <button className="icon-btn" onClick={() => { setSound((s) => !s); if (!sound) beep() }}
            aria-pressed={sound} aria-label={sound ? 'ปิดเสียงแจ้งเตือน' : 'เปิดเสียงแจ้งเตือน'}>
            <Icon name={sound ? 'sound' : 'mute'} />
          </button>
          <Link to="/staff" className="btn btn-sm btn-outline" style={{ borderColor: 'rgb(255 255 255 / .45)' }}>หน้าพนักงาน</Link>
          <button className="icon-btn" onClick={signOut} aria-label="ออกจากระบบ"><Icon name="logout" /></button>
        </div>
      </header>

      {!sound && (
        <div className="alert alert-info" style={{ margin: '12px 16px 0' }}>
          <Icon name="mute" /><span className="grow">เสียงแจ้งออร์เดอร์ใหม่ปิดอยู่</span>
          <button className="btn btn-sm btn-warn" onClick={() => { setSound(true); beep() }}>เปิดเสียง</button>
        </div>
      )}
      {(error || actionError) && (
        <div className="alert alert-error" role="alert" style={{ margin: '12px 16px 0' }}>
          <Icon name="wifiOff" /><span className="grow">{actionError || `${errorText(error)} — ใช้กระดาษไปก่อน ระบบจะลองใหม่เอง`}</span>
          <button className="btn btn-sm btn-outline" onClick={refresh}>ลองใหม่</button>
        </div>
      )}

      <div className="kitchen-layout">
        <section aria-label="ออร์เดอร์ที่รอทำ">
          {loading && !data ? <div className="spinner" role="status" aria-label="กำลังโหลด" style={{ marginTop: 60 }} />
            : tickets.length === 0 ? <p className="empty">ไม่มีออร์เดอร์ค้าง</p>
              : (
                <div className="rail">
                  {tickets.map((t) => {
                    const waiting = minutesSince(t.created_at, now)
                    const late = waiting >= LATE_MIN
                    return (
                      <article key={t.id} className={`ticket ${late ? 'late' : ''}`} aria-label={`โต๊ะ ${t.table_sessions.tables.label}`}>
                        <div className="ticket-head">
                          <span className="tno">โต๊ะ {t.table_sessions.tables.label}</span>
                          <span className="stack" style={{ gap: 2, alignItems: 'flex-end' }}>
                            <span className="small">{timeTH(t.created_at)}</span>
                            {late
                              ? <span className="kstat cancelled"><Icon name="alert" size={14} /> ช้า {waiting} นาที</span>
                              : <span className="small">{waiting} นาที</span>}
                          </span>
                        </div>
                        {t.source === 'staff' && <div className="small" style={{ marginBottom: 4 }}><Icon name="user" size={14} /> พนักงานสั่งแทน</div>}
                        {t.order_items.map((i) => (
                          <div key={i.id} className="row" style={{ gap: 4, alignItems: 'stretch' }}>
                            <button className={`dish ${i.status}`} disabled={i.status === 'cancelled'}
                              onClick={() => setStatus(i, NEXT[i.status])}
                              aria-label={`${i.qty} ${i.name} สถานะ ${K_TEXT[i.status]} แตะเพื่อเปลี่ยน`}>
                              <span className="qty">{i.qty}</span>
                              <span className="grow">
                                <span className="dname" style={{ fontWeight: 700, fontSize: 18 }}>{i.name}</span>{' '}
                                <span className={`kstat ${i.status}`}>{K_TEXT[i.status]}</span>
                                {i.order_item_options.length > 0 && (
                                  <span style={{ display: 'block' }}>{i.order_item_options.map((o) => o.name).join(' · ')}</span>
                                )}
                                {i.note && <span className="note" style={{ display: 'block' }}>※ {i.note}</span>}
                              </span>
                            </button>
                            {ACTIVE.has(i.status) && (
                              <button className={`btn btn-sm ${arming === i.id ? 'btn-danger' : 'btn-ghost'}`}
                                style={{ minWidth: 48, padding: '0 8px', color: arming === i.id ? undefined : '#8E1D16' }}
                                onClick={() => tapCancel(i)}
                                aria-label={arming === i.id ? `ยืนยันยกเลิก ${i.name}` : `ยกเลิก ${i.name}`}>
                                {arming === i.id ? 'ยืนยัน' : <Icon name="x" />}
                              </button>
                            )}
                          </div>
                        ))}
                      </article>
                    )
                  })}
                </div>
              )}
        </section>

        <aside className="sidebar" aria-label="ยอดที่ต้องตัก">
          <h2>ต้องตักทั้งหมด</h2>
          {tally.curry.length === 0 && <p className="small">—</p>}
          {tally.curry.map(([name, n]) => <div key={name} className="tally"><span>{name}</span><b>{n}</b></div>)}
          <h2 style={{ marginTop: 16 }}>จานที่ค้าง</h2>
          {tally.dishes.length === 0 && <p className="small">—</p>}
          {tally.dishes.map(([name, n]) => <div key={name} className="tally"><span>{name}</span><b>{n}</b></div>)}
          <p className="small" style={{ marginTop: 12 }}>แตะจานเพื่อเปลี่ยน: ใหม่ → กำลังทำ → เสิร์ฟแล้ว</p>
        </aside>
      </div>

      {undo && (
        <div className="undo-bar" role="status">
          <span>{undo.name}: {K_TEXT[undo.status]}</span>
          <button className="btn btn-sm btn-warn" onClick={() => {
            const item = data.orders.flatMap((o) => o.order_items).find((i) => i.id === undo.id)
            if (item) setStatus(item, undo.prev, { record: false })
            setUndo(null)
          }}><Icon name="undo" />ย้อนกลับ</button>
        </div>
      )}
    </div>
  )
}
