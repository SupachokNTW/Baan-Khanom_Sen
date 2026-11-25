import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(url && key)
export const supabase = createClient(url || 'http://localhost:54321', key || 'missing-anon-key')

// placeholders until the family confirms (see .env.example)
export const SHOP_NAME = import.meta.env.VITE_SHOP_NAME || 'บ้านขนมเส้น'
export const PROMPTPAY_ID = import.meta.env.VITE_PROMPTPAY_ID || ''

// error codes raised by the SQL functions → Thai
const TEXT = {
  invalid_table: 'ไม่พบโต๊ะนี้ ลองสแกน QR ที่โต๊ะอีกครั้ง',
  empty_order: 'ยังไม่ได้เลือกเมนู',
  too_many_lines: 'สั่งได้ครั้งละไม่เกิน 30 รายการ แบ่งส่งเป็น 2 ครั้งนะคะ',
  invalid_item: 'มีเมนูที่ไม่มีในร้านแล้ว ลองเลือกใหม่',
  invalid_qty: 'จำนวนต้องอยู่ระหว่าง 1–20',
  invalid_note: 'หมายเหตุไม่ถูกต้อง',
  note_too_long: 'หมายเหตุยาวเกิน 120 ตัวอักษร',
  invalid_option: 'ตัวเลือกไม่ถูกต้อง ลองเลือกใหม่',
  option_count: 'ยังเลือกตัวเลือกไม่ครบ',
  rate_limited: 'สั่งถี่เกินไป รอสักครู่แล้วลองใหม่',
  invalid_kind: 'คำขอไม่ถูกต้อง',
  no_order: 'ยังไม่มีรายการสั่ง จึงยังเรียกเก็บเงินไม่ได้',
  not_staff: 'ต้องเข้าสู่ระบบด้วยบัญชีพนักงาน',
  not_owner: 'เฉพาะเจ้าของร้านเท่านั้น',
  invalid_method: 'วิธีชำระเงินไม่ถูกต้อง',
  invalid_session: 'ไม่พบบิลนี้',
  already_closed: 'โต๊ะนี้ปิดบิลไปแล้ว',
  cash_short: 'รับเงินมาน้อยกว่ายอดที่ต้องจ่าย',
  not_closed: 'โต๊ะนี้ยังไม่ได้ปิดบิล',
  reopen_expired: 'เปิดบิลคืนได้ภายใน 10 นาทีหลังปิดเท่านั้น',
  table_in_use: 'โต๊ะนี้มีลูกค้าใหม่สั่งแล้ว เปิดบิลเดิมคืนไม่ได้',
  invalid_month: 'เดือนไม่ถูกต้อง',
}

export function errorText(err) {
  const msg = err?.message || String(err ?? '')
  for (const code of Object.keys(TEXT)) if (msg.includes(code)) return TEXT[code]
  if (/fetch|network|timeout|offline/i.test(msg)) return 'อินเทอร์เน็ตขัดข้อง ลองใหม่อีกครั้ง'
  if (/JWT|permission denied/i.test(msg)) return 'สิทธิ์ไม่พอ ลองเข้าสู่ระบบใหม่'
  return 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง'
}

export async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw error
  return data
}
