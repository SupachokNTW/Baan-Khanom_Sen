import { rpc, errorText } from '../../lib/supabase'
import { useLive } from '../../lib/useLive'
import { baht } from '../../lib/format'
import { Icon } from '../../components/Art'

export default function TodayTab() {
  const { data, error, loading, refresh } = useLive(['table_sessions'], () => rpc('sales_today'), { interval: 60000 })

  if (loading && !data) return <div className="spinner" role="status" aria-label="กำลังโหลด" style={{ marginTop: 40 }} />
  if (!data) return <div className="alert alert-error" role="alert"><Icon name="alert" />{errorText(error)}</div>

  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <div className="row between">
        <h2>ยอดขายวันนี้</h2>
        <button className="btn btn-sm btn-outline" onClick={refresh}>รีเฟรช</button>
      </div>
      <div className="stats">
        <div className="card stat"><span className="muted small">ยอดรวม (ปิดบิลแล้ว)</span><b>{baht(data.total)}</b></div>
        <div className="card stat"><span className="muted small">จำนวนบิล</span><b>{data.bills}</b></div>
        <div className="card stat"><span className="muted small">เงินสด</span><b>{baht(data.cash)}</b></div>
        <div className="card stat"><span className="muted small">พร้อมเพย์</span><b>{baht(data.promptpay)}</b></div>
        <div className="card stat"><span className="muted small">โต๊ะที่ยังไม่ปิด</span><b>{data.open_tables}</b></div>
      </div>
      <section className="card">
        <h3 style={{ marginBottom: 8 }}>เมนูที่ขายได้</h3>
        {data.items.length === 0 ? <p className="muted">ยังไม่มี</p> : (
          <table className="data">
            <thead><tr><th>เมนู</th><th className="num">จำนวน</th><th className="num">ยอด</th></tr></thead>
            <tbody>{data.items.map((i) => (
              <tr key={i.name}><td>{i.name}</td><td className="num">{i.qty}</td><td className="num">{baht(i.amount)}</td></tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </div>
  )
}
