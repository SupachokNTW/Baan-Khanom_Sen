import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import CustomerPage from './pages/CustomerPage'
import RequireStaff from './components/RequireStaff'
import { supabaseConfigured } from './lib/supabase'

// shop pages are split out so the customer bundle stays small
const KitchenPage = lazy(() => import('./pages/KitchenPage'))
const StaffPage = lazy(() => import('./pages/StaffPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))

const Loading = () => <div className="center-screen"><div className="spinner" role="status" aria-label="กำลังโหลด" /></div>

export default function App() {
  if (!supabaseConfigured) {
    return (
      <div className="center-screen">
        <div className="alert alert-error" role="alert" style={{ maxWidth: 480 }}>
          ยังไม่ได้ตั้งค่า VITE_SUPABASE_URL และ VITE_SUPABASE_ANON_KEY (ดู .env.example)
        </div>
      </div>
    )
  }
  return (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/t/:token" element={<CustomerPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/kitchen" element={<RequireStaff><KitchenPage /></RequireStaff>} />
          <Route path="/staff" element={<RequireStaff><StaffPage /></RequireStaff>} />
          <Route path="*" element={<Navigate to="/staff" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
