import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { rpc, errorText, SHOP_NAME } from '../lib/supabase'
import { CATEGORIES, itemSoldOut, unitPrice, useMenu } from '../lib/useMenu'
import { baht, timeTH, STATUS_TEXT } from '../lib/format'
import { Icon, MenuArt } from '../components/Art'

const STATUS_ICON = { new: 'receipt', cooking: 'chef', served: 'check', cancelled: 'x' }

// ── cart in sessionStorage (survives reloads / LINE browser switching tabs) ──
function useCart(token) {
  const key = `cart:${token}`
  const [cart, setCart] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(key)) || [] } catch { return [] }
  })
  useEffect(() => {
    try { sessionStorage.setItem(key, JSON.stringify(cart)) } catch { /* private mode */ }
  }, [key, cart])
  return [cart, setCart]
}
const lineKey = (l) => `${l.menu_item_id}|${[...l.option_ids].sort((a, b) => a - b).join(',')}|${l.note}`

export default function CustomerPage() {
  const { token } = useParams()
  const [params] = useSearchParams()
  const onBehalf = params.get('staff') === '1'
  const menu = useMenu()
  const [cart, setCart] = useCart(token)
  const [view, setView] = useState('menu') // menu | cart | status
  const [picking, setPicking] = useState(null)
  const [toast, setToast] = useState('')
  const [status, setStatus] = useState(null)
  const [statusError, setStatusError] = useState(null)
  const [online, setOnline] = useState(navigator.onLine)

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await rpc('get_table_status', { p_token: token }))
      setStatusError(null)
    } catch (e) {
      setStatusError(e)
    }
  }, [token])

  useEffect(() => {
    loadStatus()
    const t = setInterval(loadStatus, 5000)
    const on = () => { setOnline(true); loadStatus() }
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { clearInterval(t); window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [loadStatus])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 3500)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => { window.scrollTo(0, 0) }, [view])

  if (statusError && /invalid_table/.test(statusError.message)) {
    return (
      <div className="page">
        <header className="appbar"><div className="inner"><span className="shop-name">{SHOP_NAME}</span></div></header>
        <div className="center-screen">
          <div className="alert alert-error" role="alert"><Icon name="alert" />{errorText(statusError)}</div>
        </div>
      </div>
    )
  }

  const itemsById = new Map((menu.data?.items ?? []).map((i) => [i.id, i]))
  const cartCount = cart.reduce((s, l) => s + l.qty, 0)
  const orderedCount = (status?.orders ?? []).reduce(
    (s, o) => s + o.items.filter((i) => i.status !== 'cancelled').reduce((a, i) => a + i.qty, 0), 0)

  function addToCart(line) {
    setCart((c) => {
      const k = lineKey(line)
      const i = c.findIndex((l) => lineKey(l) === k)
      if (i < 0) return [...c, line]
      const next = [...c]
      next[i] = { ...next[i], qty: Math.min(20, next[i].qty + line.qty) }
      return next
    })
    setPicking(null)
    setToast(`เพิ่ม ${line.name} แล้ว`)
  }

  return (
    <div className="page">
      <header className="appbar">
        <div className="inner">
          {view !== 'menu' ? (
            <button className="icon-btn" onClick={() => setView('menu')} aria-label="กลับไปหน้าเมนู"><Icon name="back" /></button>
          ) : null}
          <span className="shop-name grow">{SHOP_NAME}</span>
          {status && <span className="table-badge">โต๊ะ <b>{status.table}</b></span>}
        </div>
      </header>

      {onBehalf && (
        <div className="alert alert-info no-print" style={{ borderRadius: 0 }}>
          <Icon name="user" />
          <span className="grow">กำลังสั่งแทนลูกค้า โต๊ะ {status?.table}</span>
          <Link to="/staff" className="btn btn-sm btn-outline">กลับหน้าพนักงาน</Link>
        </div>
      )}
      {!online && (
        <div className="alert alert-error" role="status" style={{ borderRadius: 0 }}>
          <Icon name="wifiOff" />ไม่มีอินเทอร์เน็ต — สั่งกับพนักงานได้เลย
        </div>
      )}

      {view === 'menu' && (
        <MenuView menu={menu} onPick={setPicking} orderedCount={orderedCount} onStatus={() => setView('status')} />
      )}
      {view === 'cart' && (
        <CartView
          token={token} cart={cart} setCart={setCart} itemsById={itemsById}
          onPlaced={() => { setCart([]); setView('status'); setToast('ส่งรายการเข้าครัวแล้ว'); loadStatus() }}
          onMore={() => setView('menu')}
        />
      )}
      {view === 'status' && (
        <StatusView token={token} status={status} error={statusError} reload={loadStatus} setToast={setToast} onMenu={() => setView('menu')} />
      )}

      {view === 'menu' && cartCount > 0 && (
        <div className="cart-bar">
          <button className="btn btn-primary" onClick={() => setView('cart')}>
            <span className="row"><span className="count-pill">{cartCount}</span> ตรวจรายการก่อนสั่ง</span>
            <span>{baht(cart.reduce((s, l) => s + l.unit_price * l.qty, 0))}</span>
          </button>
        </div>
      )}

      {picking && <ItemSheet item={itemsById.get(picking) } onClose={() => setPicking(null)} onAdd={addToCart} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}

// ───────────────────────── menu ─────────────────────────
function MenuView({ menu, onPick, orderedCount, onStatus }) {
  const [cat, setCat] = useState('noodle')
  const refs = useRef({})

  if (menu.loading) return <div className="center-screen"><div className="spinner" role="status" aria-label="กำลังโหลดเมนู" /></div>
  if (!menu.data) {
    return (
      <div className="container stack">
        <div className="alert alert-error" role="alert"><Icon name="alert" />{errorText(menu.error)}</div>
        <button className="btn btn-primary" onClick={menu.refresh}>ลองใหม่</button>
      </div>
    )
  }
  const cats = CATEGORIES.filter((c) => menu.data.items.some((i) => i.category === c.key))

  return (
    <>
      <nav className="cat-tabs" aria-label="หมวดเมนู">
        {cats.map((c) => (
          <button key={c.key} className="btn" aria-current={cat === c.key}
            onClick={() => { setCat(c.key); refs.current[c.key]?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>
            {c.label}
          </button>
        ))}
        {orderedCount > 0 && (
          <button className="btn btn-warn" onClick={onStatus}><Icon name="receipt" />สั่งแล้ว {orderedCount}</button>
        )}
      </nav>
      <main className="container stack" style={{ paddingBottom: 100 }}>
        {cats.map((c) => (
          <section key={c.key} ref={(el) => (refs.current[c.key] = el)} style={{ scrollMarginTop: 140 }} className="stack">
            <h2 style={{ fontSize: 22, marginTop: 8 }}>{c.label}</h2>
            <div className="menu-grid">
              {menu.data.items.filter((i) => i.category === c.key).map((item) => {
                const sold = itemSoldOut(item)
                return (
                  <button key={item.id} className={`card menu-card ${sold ? 'sold' : ''}`} disabled={sold} onClick={() => onPick(item.id)}
                    aria-label={`${item.name} ${baht(item.price)}${sold ? ' หมดแล้ว' : ''}`}>
                    <div className="media">
                      <MenuArt item={item} />
                      {sold && <span className="chip chip-sold"><Icon name="x" size={16} />หมดแล้ว</span>}
                    </div>
                    <div className="body">
                      <div className="row between"><span className="name">{item.name}</span><span className="price">{baht(item.price)}</span></div>
                      {item.description && <span className="muted small">{item.description}</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </main>
    </>
  )
}

// ───────────────────────── item options sheet ─────────────────────────
function groupHint(g) {
  if (g.min_select > 0 && g.min_select === g.max_select) return `ต้องเลือก ${g.min_select}`
  if (g.min_select > 0) return `ต้องเลือก ${g.min_select}–${g.max_select}`
  return g.max_select > 1 ? `เลือกได้ไม่เกิน ${g.max_select}` : 'ไม่บังคับ'
}

export function ItemSheet({ item, onClose, onAdd }) {
  const [picked, setPicked] = useState(() => {
    // preselect the only/first available option in required single-choice groups that have one obvious default
    const init = {}
    for (const g of item?.groups ?? []) {
      const avail = g.options.filter((o) => o.is_available)
      init[g.id] = g.min_select === 1 && g.max_select === 1 && avail.length === 1 ? [avail[0].id] : []
    }
    return init
  })
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)
  const sheetRef = useRef(null)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    sheetRef.current?.focus()
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])

  if (!item) return null
  const optionIds = Object.values(picked).flat()
  const missing = item.groups.filter((g) => (picked[g.id]?.length ?? 0) < g.min_select)
  const unit = unitPrice(item, optionIds)
  const sold = itemSoldOut(item)

  function toggle(g, o) {
    setPicked((p) => {
      const cur = p[g.id] ?? []
      if (g.max_select === 1) return { ...p, [g.id]: [o.id] }
      if (cur.includes(o.id)) return { ...p, [g.id]: cur.filter((x) => x !== o.id) }
      if (cur.length >= g.max_select) return p
      return { ...p, [g.id]: [...cur, o.id] }
    })
  }

  function add() {
    setTried(true)
    if (missing.length || sold) return
    const opts = item.groups.flatMap((g) => g.options.filter((o) => optionIds.includes(o.id)).map((o) => o.name))
    onAdd({ menu_item_id: item.id, name: item.name, option_ids: optionIds, option_names: opts, note: note.trim(), qty, unit_price: unit })
  }

  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabIndex={-1} ref={sheetRef}>
        <div className="sheet-head">
          <h2 id="sheet-title" className="grow" style={{ fontSize: 22 }}>{item.name}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="ปิด"><Icon name="x" /></button>
        </div>
        <div className="container stack" style={{ gap: 20 }}>
          <div className="media" style={{ borderRadius: 'var(--radius)' }}><MenuArt item={item} /></div>
          {item.description && <p className="muted" style={{ margin: 0 }}>{item.description}</p>}

          {item.groups.map((g) => {
            const sel = picked[g.id] ?? []
            const isMissing = tried && sel.length < g.min_select
            return (
              <fieldset key={g.id} className="opt-group" aria-describedby={isMissing ? `miss-${g.id}` : undefined}>
                <legend>
                  {g.name}
                  <span className={g.min_select > 0 ? 'required' : 'muted small'}>{groupHint(g)}</span>
                </legend>
                {isMissing && <p id={`miss-${g.id}`} className="missing" role="alert" style={{ margin: '0 0 8px' }}>กรุณาเลือก{g.name}</p>}
                {g.options.map((o) => {
                  const checked = sel.includes(o.id)
                  const full = g.max_select > 1 && !checked && sel.length >= g.max_select
                  return (
                    <label key={o.id} className="opt">
                      <input
                        type={g.max_select === 1 ? 'radio' : 'checkbox'}
                        name={`g${g.id}`}
                        checked={checked}
                        disabled={!o.is_available || full}
                        onChange={() => toggle(g, o)}
                      />
                      <span className="grow">{o.name}</span>
                      {!o.is_available
                        ? <span className="chip chip-sold">หมด</span>
                        : Number(o.price_delta) !== 0 && <span className="price">+{baht(o.price_delta)}</span>}
                    </label>
                  )
                })}
              </fieldset>
            )
          })}

          <div className="field">
            <label htmlFor="note">หมายเหตุถึงครัว (ถ้ามี)</label>
            <textarea id="note" className="input" rows={2} maxLength={120} value={note}
              placeholder="เช่น ไม่ใส่ผัก, เผ็ดน้อย" onChange={(e) => setNote(e.target.value)} />
            <span className="muted small" style={{ textAlign: 'right' }}>{note.length}/120</span>
          </div>

          <div className="row between">
            <span style={{ fontFamily: 'var(--font-head)' }}>จำนวน</span>
            <Stepper value={qty} onChange={setQty} label={item.name} />
          </div>
        </div>
        <div className="sheet-foot">
          {tried && missing.length > 0 && (
            <p className="missing" style={{ margin: '0 0 8px' }}>ยังไม่ได้เลือก: {missing.map((g) => g.name).join(', ')}</p>
          )}
          <button className="btn btn-primary btn-block" onClick={add} disabled={sold}>
            {sold ? 'เมนูนี้หมดแล้ว' : <>ใส่ตะกร้า · {baht(unit * qty)}</>}
          </button>
        </div>
      </div>
    </div>
  )
}

function Stepper({ value, onChange, label, min = 1, max = 20 }) {
  return (
    <div className="stepper" role="group" aria-label={`จำนวน ${label}`}>
      <button className="icon-btn" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="ลดจำนวน"><Icon name="minus" /></button>
      <output aria-live="polite">{value}</output>
      <button className="icon-btn" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="เพิ่มจำนวน"><Icon name="plus" /></button>
    </div>
  )
}

// ───────────────────────── cart review ─────────────────────────
function CartView({ token, cart, setCart, itemsById, onPlaced, onMore }) {
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [unavailable, setUnavailable] = useState([])

  // lines whose item / option sold out since they were added (live menu)
  const soldLines = useMemo(() => new Set(cart.filter((l) => {
    const it = itemsById.get(l.menu_item_id)
    if (!it) return itemsById.size > 0
    if (!it.is_available) return true
    return it.groups.some((g) => g.options.some((o) => l.option_ids.includes(o.id) && !o.is_available))
  }).map(lineKey)), [cart, itemsById])

  const total = cart.reduce((s, l) => s + l.unit_price * l.qty, 0)
  const setQty = (k, q) => setCart((c) => c.map((l) => (lineKey(l) === k ? { ...l, qty: q } : l)))
  const remove = (k) => setCart((c) => c.filter((l) => lineKey(l) !== k))

  async function send() {
    setSending(true)
    setError('')
    setUnavailable([])
    try {
      const res = await rpc('place_order', {
        p_token: token,
        p_items: cart.map((l) => ({ menu_item_id: l.menu_item_id, qty: l.qty, note: l.note || null, option_ids: l.option_ids })),
      })
      if (res?.ok) onPlaced()
      else setUnavailable(res?.unavailable ?? [])
    } catch (e) {
      setError(errorText(e))
    } finally {
      setSending(false)
    }
  }

  if (cart.length === 0) {
    return (
      <main className="container center-screen">
        <div className="stack">
          <p className="muted">ยังไม่มีรายการในตะกร้า</p>
          <button className="btn btn-primary" onClick={onMore}>ดูเมนู</button>
        </div>
      </main>
    )
  }

  return (
    <main className="container stack" style={{ paddingBottom: 32 }}>
      <h1 style={{ fontSize: 24 }}>ตรวจรายการก่อนสั่ง</h1>
      <p className="muted" style={{ margin: 0 }}>ตรวจให้ครบ แล้วกด “ยืนยันสั่งอาหาร” ครัวจะเริ่มทำทันที</p>

      {unavailable.length > 0 && (
        <div className="alert alert-error" role="alert">
          <Icon name="alert" />
          <div>เพิ่งหมดไปเมื่อสักครู่: <b>{unavailable.join(', ')}</b><br />กรุณาลบออกหรือเปลี่ยนตัวเลือก แล้วสั่งอีกครั้ง</div>
        </div>
      )}

      <ul className="card status-list" style={{ padding: '4px 16px' }}>
        {cart.map((l) => {
          const k = lineKey(l)
          const sold = soldLines.has(k)
          return (
            <li key={k} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div className="row between" style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <div style={{ fontFamily: 'var(--font-head)', fontSize: 18 }}>{l.name}</div>
                  {l.option_names.length > 0 && <div className="opts-line">{l.option_names.join(' · ')}</div>}
                  {l.note && <div className="note-line">หมายเหตุ: {l.note}</div>}
                  {sold && <span className="chip chip-sold" style={{ marginTop: 4 }}><Icon name="x" size={16} />หมดแล้ว — ลบรายการนี้</span>}
                </div>
                <span className="price">{baht(l.unit_price * l.qty)}</span>
              </div>
              <div className="row between">
                <button className="btn btn-sm btn-ghost" onClick={() => remove(k)} style={{ color: 'var(--chili)' }}><Icon name="trash" />ลบ</button>
                <Stepper value={l.qty} onChange={(q) => setQty(k, q)} label={l.name} />
              </div>
            </li>
          )
        })}
      </ul>

      <div className="row between card">
        <span style={{ fontFamily: 'var(--font-head)' }}>รวม</span>
        <span className="total">{baht(total)}</span>
      </div>

      {error && <div className="alert alert-error" role="alert"><Icon name="alert" />{error}</div>}

      <button className="btn btn-primary btn-block" onClick={send} disabled={sending || soldLines.size > 0}>
        {sending ? 'กำลังส่ง…' : soldLines.size > 0 ? 'ลบรายการที่หมดก่อน' : 'ยืนยันสั่งอาหาร'}
      </button>
      <button className="btn btn-outline btn-block" onClick={onMore}><Icon name="plus" />เพิ่มเมนูอีก</button>
    </main>
  )
}

// ───────────────────────── order status ─────────────────────────
function StatusView({ token, status, error, reload, setToast, onMenu }) {
  const [calling, setCalling] = useState('')
  const [err, setErr] = useState('')

  async function call(kind) {
    setCalling(kind)
    setErr('')
    try {
      await rpc('call_staff', { p_token: token, p_kind: kind })
      setToast(kind === 'bill' ? 'แจ้งขอเช็คบิลแล้ว พนักงานกำลังมา' : 'เรียกพนักงานแล้ว')
      reload()
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setCalling('')
    }
  }

  if (!status) {
    return error
      ? <main className="container"><div className="alert alert-error" role="alert"><Icon name="alert" />{errorText(error)}</div></main>
      : <div className="center-screen"><div className="spinner" role="status" aria-label="กำลังโหลด" /></div>
  }
  const call_status = status.session?.call_status

  return (
    <main className="container stack" style={{ paddingBottom: 32 }}>
      <div className="row between">
        <h1 style={{ fontSize: 24 }}>รายการที่สั่ง</h1>
        <span className="muted small" aria-live="polite">อัปเดตอัตโนมัติ</span>
      </div>
      {error && <div className="alert alert-error" role="status"><Icon name="wifiOff" />เชื่อมต่อไม่ได้ชั่วคราว กำลังลองใหม่…</div>}

      {status.orders.length === 0 && <p className="muted">ยังไม่มีรายการสั่ง</p>}
      {status.orders.map((o, idx) => (
        <section key={o.id} className="card">
          <div className="row between muted small">
            <span>ครั้งที่ {idx + 1}</span><span><Icon name="clock" size={16} /> {timeTH(o.created_at)}</span>
          </div>
          <ul className="status-list">
            {o.items.map((i) => (
              <li key={i.id}>
                <span style={{ fontFamily: 'var(--font-display)', minWidth: 28 }}>{i.qty}×</span>
                <div className="grow">
                  <div style={{ textDecoration: i.status === 'cancelled' ? 'line-through' : 'none' }}>{i.name}</div>
                  {i.options.length > 0 && <div className="opts-line">{i.options.map((x) => x.name).join(' · ')}</div>}
                  {i.note && <div className="note-line">หมายเหตุ: {i.note}</div>}
                </div>
                <span className={`chip chip-${i.status}`}><Icon name={STATUS_ICON[i.status]} size={16} />{STATUS_TEXT[i.status]}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {status.orders.length > 0 && (
        <div className="row between card">
          <span style={{ fontFamily: 'var(--font-head)' }}>ยอดรวม</span>
          <span className="total">{baht(status.total)}</span>
        </div>
      )}

      {call_status && (
        <div className="alert alert-info" role="status">
          <Icon name="bell" />{call_status === 'bill' ? 'แจ้งขอเช็คบิลแล้ว รอพนักงานสักครู่' : 'เรียกพนักงานแล้ว รอสักครู่'}
        </div>
      )}
      {err && <div className="alert alert-error" role="alert"><Icon name="alert" />{err}</div>}

      <button className="btn btn-primary btn-block" onClick={onMenu}><Icon name="plus" />สั่งเพิ่ม</button>
      <div className="row">
        <button className="btn btn-outline grow" disabled={!!calling} onClick={() => call('staff')}><Icon name="bell" />เรียกพนักงาน</button>
        <button className="btn btn-warn grow" disabled={!!calling || status.orders.length === 0 || call_status === 'bill'} onClick={() => call('bill')}>
          <Icon name="receipt" />ขอเช็คบิล
        </button>
      </div>
    </main>
  )
}

