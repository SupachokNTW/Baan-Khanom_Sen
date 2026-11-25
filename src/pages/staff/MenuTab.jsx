import { useState } from 'react'
import { supabase, errorText } from '../../lib/supabase'
import { CATEGORIES, useMenu } from '../../lib/useMenu'
import { baht } from '../../lib/format'
import { Icon } from '../../components/Art'

export default function MenuTab() {
  const { data, error, loading, refresh, setData } = useMenu()
  const [err, setErr] = useState('')

  async function toggle(table, row) {
    setErr('')
    const next = !row.is_available
    const patch = (v) => setData((d) => d && ({
      ...d,
      items: table === 'menu_items'
        ? d.items.map((i) => (i.id === row.id ? { ...i, is_available: v } : i))
        : d.items.map((i) => ({ ...i, groups: i.groups.map((g) => ({ ...g, options: g.options.map((o) => (o.id === row.id ? { ...o, is_available: v } : o)) })) })),
      groups: table === 'options'
        ? d.groups.map((g) => ({ ...g, options: g.options.map((o) => (o.id === row.id ? { ...o, is_available: v } : o)) }))
        : d.groups,
    }))
    patch(next)
    const { error } = await supabase.from(table).update({ is_available: next }).eq('id', row.id)
    if (error) { patch(!next); setErr(errorText(error)) }
  }

  if (loading && !data) return <div className="spinner" role="status" aria-label="กำลังโหลด" style={{ marginTop: 40 }} />
  if (!data) return <div className="alert alert-error" role="alert"><Icon name="alert" />{errorText(error)} <button className="btn btn-sm" onClick={refresh}>ลองใหม่</button></div>

  const Row = ({ table, row, sub }) => (
    <div className="switch-row" style={{ borderBottom: '1px solid var(--line)' }}>
      <span className="grow">
        <span style={{ fontFamily: 'var(--font-head)', fontSize: 18, textDecoration: row.is_available ? 'none' : 'line-through' }}>{row.name}</span>
        {sub && <span className="muted small"> {sub}</span>}
      </span>
      <span className={`chip ${row.is_available ? 'chip-served' : 'chip-sold'}`}>{row.is_available ? 'มีของ' : 'หมด'}</span>
      <button className="switch" role="switch" aria-checked={row.is_available}
        aria-label={`${row.name} ${row.is_available ? 'มีของ แตะเพื่อตั้งเป็นหมด' : 'หมด แตะเพื่อตั้งเป็นมีของ'}`}
        onClick={() => toggle(table, row)} />
    </div>
  )

  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <p className="muted" style={{ margin: 0 }}>ปิดสวิตช์เมื่อของหมด ลูกค้าจะเห็นทันทีและสั่งไม่ได้</p>
      {err && <div className="alert alert-error" role="alert"><Icon name="alert" />{err}</div>}
      {CATEGORIES.map((c) => {
        const items = data.items.filter((i) => i.category === c.key)
        if (!items.length) return null
        return (
          <section key={c.key} className="card" style={{ padding: 0 }}>
            <h2 style={{ padding: '14px 16px 4px' }}>{c.label}</h2>
            {items.map((i) => <Row key={i.id} table="menu_items" row={i} sub={baht(i.price)} />)}
          </section>
        )
      })}
      {data.groups.map((g) => (
        <section key={g.id} className="card" style={{ padding: 0 }}>
          <h2 style={{ padding: '14px 16px 4px' }}>ตัวเลือก: {g.name}</h2>
          {g.options.map((o) => <Row key={o.id} table="options" row={o} sub={Number(o.price_delta) ? `+${baht(o.price_delta)}` : ''} />)}
        </section>
      ))}
    </div>
  )
}
