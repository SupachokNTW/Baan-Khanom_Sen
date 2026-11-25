// Compare src/lib/promptpay.js with the reference `promptpay-qr` package.   npm run test:promptpay
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { promptpayPayload } from '../src/lib/promptpay.js'

const reference = createRequire(import.meta.url)('promptpay-qr')

const targets = ['0812345678', '081-234-5678', '1234567890123', '004999000288505']
const amounts = [undefined, 0.01, 45, 135.5, 1234.75, 99999]
let n = 0
for (const t of targets)
  for (const a of amounts) {
    assert.equal(promptpayPayload(t, a), reference(t, a === undefined ? {} : { amount: a }), `${t} ${a}`)
    n++
  }
console.log(`${n} PromptPay payloads match promptpay-qr`)
