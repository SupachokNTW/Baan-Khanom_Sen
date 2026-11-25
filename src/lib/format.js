const TZ = 'Asia/Bangkok'

export function baht(n) {
  const v = Number(n || 0)
  return '฿' + v.toLocaleString('th-TH', {
    minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
    maximumFractionDigits: 2,
  })
}

export function timeTH(iso) {
  return new Date(iso).toLocaleTimeString('th-TH', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
}

export function dateTH(iso) {
  return new Date(iso).toLocaleDateString('th-TH', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' })
}

export function minutesSince(iso, now = Date.now()) {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000))
}

export function ago(iso, now) {
  const m = minutesSince(iso, now)
  if (m < 1) return 'เมื่อกี้'
  if (m < 60) return `${m} นาทีที่แล้ว`
  return `${Math.floor(m / 60)} ชม. ${m % 60} นาทีที่แล้ว`
}

// year/month "now" in Bangkok
export function bangkokYearMonth(d = new Date()) {
  const [y, m] = d.toLocaleDateString('en-CA', { timeZone: TZ }).split('-')
  return { year: Number(y), month: Number(m) }
}

export const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']

export const STATUS_TEXT = {
  new: 'รับออร์เดอร์แล้ว',
  cooking: 'กำลังทำ',
  served: 'เสิร์ฟแล้ว',
  cancelled: 'ยกเลิก',
}

export const lineTotal = (it) => Number(it.unit_price) * it.qty
