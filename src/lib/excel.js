import { THAI_MONTHS } from './format'

const SOURCE = { customer: 'ลูกค้า', staff: 'พนักงาน' }
const METHOD = { cash: 'เงินสด', promptpay: 'พร้อมเพย์' }
const STATUS = { new: 'ใหม่', cooking: 'กำลังทำ', served: 'เสิร์ฟแล้ว', cancelled: 'ยกเลิก' }
const MONEY = '#,##0.00'

// report = report_month() result. exceljs is loaded only when someone downloads.
export async function downloadMonthReport(report, shopName) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = shopName
  const title = `${shopName} — ${THAI_MONTHS[report.month - 1]} ${report.year + 543}`

  const sheet = (name, columns, rows) => {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] })
    ws.columns = columns.map(([header, key, width, fmt]) => ({ header, key, width, style: fmt ? { numFmt: fmt } : {} }))
    ws.getRow(1).font = { bold: true }
    ws.addRows(rows)
    return ws
  }

  const s = report.summary
  const ws = sheet('สรุป', [['หัวข้อ', 'k', 28], ['ค่า', 'v', 30, MONEY]], [
    { k: 'รายงาน', v: title },
    { k: 'จำนวนบิล', v: s.bills },
    { k: 'ยอดขายรวม', v: Number(s.total) },
    { k: 'เงินสด', v: Number(s.cash) },
    { k: 'พร้อมเพย์', v: Number(s.promptpay) },
    { k: 'เฉลี่ยต่อบิล', v: Number(s.avg_bill) },
  ])
  ws.getCell('B3').numFmt = '0' // bill count is not money

  sheet('รายวัน', [['วันที่', 'date', 14], ['บิล', 'bills', 8], ['ยอดรวม', 'total', 14, MONEY],
    ['เงินสด', 'cash', 14, MONEY], ['พร้อมเพย์', 'promptpay', 14, MONEY]],
  report.daily.map((d) => ({ ...d, total: +d.total, cash: +d.cash, promptpay: +d.promptpay })))

  sheet('เมนูขายดี', [['เมนู', 'name', 28], ['จำนวน', 'qty', 10], ['ยอดเงิน', 'amount', 14, MONEY]],
    report.items.map((i) => ({ ...i, qty: +i.qty, amount: +i.amount })))

  sheet('บิล', [['เลขบิล', 'session_id', 10], ['โต๊ะ', 'table', 8], ['เปิด', 'opened_at', 18], ['ปิด', 'closed_at', 18],
    ['ชำระด้วย', 'method', 12], ['ยอด', 'total', 12, MONEY], ['รับเงิน', 'cash_received', 12, MONEY], ['ปิดโดย', 'closed_by', 14]],
  report.bills.map((b) => ({ ...b, method: METHOD[b.method] ?? b.method, total: +b.total,
    cash_received: b.cash_received == null ? null : +b.cash_received })))

  sheet('รายการทั้งหมด', [['เลขบิล', 'session_id', 10], ['โต๊ะ', 'table', 8], ['เวลาสั่ง', 'ordered_at', 18],
    ['สั่งโดย', 'source', 10], ['เมนู', 'name', 22], ['ตัวเลือก', 'options', 30], ['หมายเหตุ', 'note', 24],
    ['จำนวน', 'qty', 8], ['ราคา/หน่วย', 'unit_price', 12, MONEY], ['สถานะ', 'status', 12], ['ยอด', 'amount', 12, MONEY]],
  report.lines.map((l) => ({ ...l, source: SOURCE[l.source] ?? l.source, status: STATUS[l.status] ?? l.status,
    unit_price: +l.unit_price, amount: +l.amount })))

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `ยอดขาย-${report.year}-${String(report.month).padStart(2, '0')}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
