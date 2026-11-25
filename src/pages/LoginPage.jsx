import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase, SHOP_NAME } from '../lib/supabase'
import { Icon } from '../components/Art'

export default function LoginPage() {
  const nav = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) {
      setError(/invalid/i.test(error.message) ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : 'เข้าสู่ระบบไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่')
      return
    }
    nav(location.state?.from || '/staff', { replace: true })
  }

  return (
    <div className="page">
      <header className="appbar"><div className="inner"><span className="shop-name">{SHOP_NAME}</span></div></header>
      <main className="container" style={{ maxWidth: 440 }}>
        <form className="card stack" onSubmit={submit} style={{ marginTop: 24 }}>
          <h1 style={{ fontSize: 24 }}>เข้าสู่ระบบพนักงาน</h1>
          <div className="field">
            <label htmlFor="email">อีเมล</label>
            <input id="email" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="pw">รหัสผ่าน</label>
            <input id="pw" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <div className="alert alert-error" role="alert"><Icon name="alert" />{error}</div>}
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</button>
        </form>
      </main>
    </div>
  )
}
