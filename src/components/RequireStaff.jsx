import { createContext, useContext, useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { supabase, errorText } from '../lib/supabase'
import { Icon } from './Art'

const StaffContext = createContext(null)
export const useStaff = () => useContext(StaffContext)

export async function signOut() {
  await supabase.auth.signOut()
  window.location.href = '/login'
}

export default function RequireStaff({ children }) {
  const location = useLocation()
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    let alive = true
    async function check(session) {
      if (!session) return alive && setState({ status: 'out' })
      const { data, error } = await supabase
        .from('staff_profiles').select('*').eq('user_id', session.user.id).maybeSingle()
      if (!alive) return
      if (error) setState({ status: 'error', error })
      else if (!data) setState({ status: 'notstaff', email: session.user.email })
      else setState({ status: 'ok', profile: data })
    }
    supabase.auth.getSession().then(({ data }) => check(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') setState({ status: 'out' })
      else if (event === 'SIGNED_IN') check(session)
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  if (state.status === 'loading') return <div className="center-screen"><div className="spinner" role="status" aria-label="กำลังโหลด" /></div>
  if (state.status === 'out') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (state.status === 'error' || state.status === 'notstaff') {
    return (
      <div className="center-screen">
        <div className="stack" style={{ maxWidth: 420 }}>
          <div className="alert alert-error" role="alert">
            <Icon name="alert" />
            <span>{state.status === 'error' ? errorText(state.error) : `บัญชี ${state.email} ยังไม่ได้ลงทะเบียนเป็นพนักงาน ให้เจ้าของร้านเพิ่มให้ก่อน`}</span>
          </div>
          <button className="btn btn-outline" onClick={signOut}><Icon name="logout" />ออกจากระบบ</button>
        </div>
      </div>
    )
  }
  return <StaffContext.Provider value={state.profile}>{children}</StaffContext.Provider>
}
