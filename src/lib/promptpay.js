// PromptPay QR payload (EMVCo merchant-presented, Thai BOT spec).
// Written here because the `promptpay-qr` package needs Node's Buffer.
// tests/promptpay.test.mjs compares this against that package.

const f = (id, value) => id + String(value.length).padStart(2, '0') + value

function crc16(str) {
  // CRC-16/CCITT-FALSE (xmodem polynomial 0x1021, initial 0xFFFF) over UTF-8 bytes
  let crc = 0xffff
  for (const byte of new TextEncoder().encode(str)) {
    crc ^= byte << 8
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

export function promptpayPayload(target, amount) {
  const id = String(target || '').replace(/\D/g, '')
  if (!id) throw new Error('no_promptpay_id')
  const type = id.length >= 15 ? '03' : id.length >= 13 ? '02' : '01'
  const formatted = id.length >= 13 ? id : ('0000000000000' + id.replace(/^0/, '66')).slice(-13)

  let data =
    f('00', '01') +
    f('01', amount ? '12' : '11') +
    f('29', f('00', 'A000000677010111') + f(type, formatted)) +
    f('58', 'TH') +
    f('53', '764') +
    (amount ? f('54', Number(amount).toFixed(2)) : '')
  data += '6304'
  return data + crc16(data)
}
