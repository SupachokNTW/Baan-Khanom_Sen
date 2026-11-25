import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase, errorText, SHOP_NAME } from '../../lib/supabase'
import { Icon } from '../../components/Art'

export default function QrTab() {
  const [tables, setTables] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    supabase.from('tables').select('id, label, qr_token').order('id').then(({ data, error }) => {
      if (error) setErr(errorText(error))
      else setTables(data)
    })
  }, [])

  if (err) return <div className="alert alert-error" role="alert"><Icon name="alert" />{err}</div>
  if (!tables) return <div className="spinner" role="status" aria-label="กำลังโหลด" style={{ marginTop: 40 }} />

  return (
    <div className="stack">
      <div className="row between no-print">
        <p className="muted" style={{ margin: 0 }}>พิมพ์แล้วติดที่โต๊ะ — ลูกค้าสแกนแล้วสั่งได้เลย ไม่ต้องลงทะเบียน</p>
        <button className="btn btn-primary" onClick={() => window.print()}><Icon name="printer" />พิมพ์</button>
      </div>
      <div className="qr-grid">
        {tables.map((t) => (
          <div key={t.id} className="qr-card">
            <div className="shop">{SHOP_NAME}</div>
            <div className="tno">โต๊ะ {t.label}</div>
            <QRCodeSVG value={`${window.location.origin}/t/${t.qr_token}`} size={180} marginSize={2} level="M" title={`QR โต๊ะ ${t.label}`} />
            <div>สแกนเพื่อสั่งอาหาร</div>
          </div>
        ))}
      </div>
    </div>
  )
}
