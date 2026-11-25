import { useEffect, useState } from 'react'
import { rpc, errorText, SHOP_NAME } from '../../lib/supabase'
import { baht, bangkokYearMonth, THAI_MONTHS } from '../../lib/format'
import { downloadMonthReport } from '../../lib/excel'
import { Icon } from '../../components/Art'

export default function ReportTab() {
  const [ym, setYm] = useState(bangkokYearMonth)
  const [report, setReport] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    setReport(null); setErr('')
    rpc('report_month', { p_year: ym.year, p_month: ym.month })
      .then((r) => alive && setReport(r))
      .catch((e) => alive && setErr(errorText(e)))
    return () => { alive = false }
  }, [ym])

  const thisYear = bangkokYearMonth().year
  const years = [thisYear - 2, thisYear - 1, thisYear]

  async function download() {
    setBusy(true)
    try { await downloadMonthReport(report, SHOP_NAME) } catch (e) { setErr(errorText(e)) } finally { setBusy(false) }
  }

  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <select className="input" style={{ width: 'auto' }} aria-label="เดือน" value={ym.month}
          onChange={(e) => setYm((v) => ({ ...v, month: Number(e.target.value) }))}>
          {THAI_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select className="input" style={{ width: 'auto' }} aria-label="ปี" value={ym.year}
          onChange={(e) => setYm((v) => ({ ...v, year: Number(e.target.value) }))}>
          {years.map((y) => <option key={y} value={y}>{y + 543}</option>)}
        </select>
        <button className="btn btn-primary" disabled={!report || busy} onClick={download}>
          <Icon name="download" />{busy ? 'กำลังสร้างไฟล์…' : 'ดาวน์โหลด Excel'}
        </button>
      </div>
      {err && <div className="alert alert-error" role="alert"><Icon name="alert" />{err}</div>}
      {!report && !err && <div className="spinner" role="status" aria-label="กำลังโหลด" />}
      {report && (
        <>
          <div className="stats">
            <div className="card stat"><span className="muted small">ยอดขายรวม</span><b>{baht(report.summary.total)}</b></div>
            <div className="card stat"><span className="muted small">จำนวนบิล</span><b>{report.summary.bills}</b></div>
            <div className="card stat"><span className="muted small">เฉลี่ยต่อบิล</span><b>{baht(report.summary.avg_bill)}</b></div>
            <div className="card stat"><span className="muted small">เงินสด</span><b>{baht(report.summary.cash)}</b></div>
            <div className="card stat"><span className="muted small">พร้อมเพย์</span><b>{baht(report.summary.promptpay)}</b></div>
          </div>
          <section className="card">
            <h3 style={{ marginBottom: 8 }}>รายวัน</h3>
            {report.daily.length === 0 ? <p className="muted">ไม่มียอดขายในเดือนนี้</p> : (
              <table className="data">
                <thead><tr><th>วันที่</th><th className="num">บิล</th><th className="num">ยอด</th></tr></thead>
                <tbody>{report.daily.map((d) => (
                  <tr key={d.date}><td>{Number(d.date.slice(8))} {THAI_MONTHS[report.month - 1]}</td><td className="num">{d.bills}</td><td className="num">{baht(d.total)}</td></tr>
                ))}</tbody>
              </table>
            )}
          </section>
          <p className="muted small">ไฟล์ Excel มี 5 แผ่น: สรุป, รายวัน, เมนูขายดี, บิล, รายการทั้งหมด</p>
        </>
      )}
    </div>
  )
}
