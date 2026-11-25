import { lazy, Suspense } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { SHOP_NAME } from '../lib/supabase'
import { useStaff, signOut } from '../components/RequireStaff'
import { Icon } from '../components/Art'
import TablesTab from './staff/TablesTab'
import MenuTab from './staff/MenuTab'
import TodayTab from './staff/TodayTab'

const ReportTab = lazy(() => import('./staff/ReportTab'))
const QrTab = lazy(() => import('./staff/QrTab'))

const TABS = [
  { key: 'tables', label: 'โต๊ะ', el: TablesTab },
  { key: 'menu', label: 'ของหมด', el: MenuTab },
  { key: 'today', label: 'ยอดวันนี้', el: TodayTab },
  { key: 'report', label: 'รายงานเดือน', el: ReportTab, owner: true },
  { key: 'qr', label: 'พิมพ์ QR โต๊ะ', el: QrTab, owner: true },
]

export default function StaffPage() {
  const me = useStaff()
  const [params, setParams] = useSearchParams()
  const tabs = TABS.filter((t) => !t.owner || me.role === 'owner')
  const current = tabs.find((t) => t.key === params.get('tab')) ?? tabs[0]
  const Tab = current.el

  return (
    <div className="page">
      <header className="appbar no-print">
        <div className="inner">
          <span className="shop-name grow">{SHOP_NAME}</span>
          <span className="small hide-narrow">{me.display_name}{me.role === 'owner' ? ' (เจ้าของ)' : ''}</span>
          <Link to="/kitchen" className="btn btn-sm btn-outline" style={{ borderColor: 'rgb(255 255 255 / .45)' }}><Icon name="chef" />ครัว</Link>
          <button className="icon-btn" onClick={signOut} aria-label="ออกจากระบบ"><Icon name="logout" /></button>
        </div>
      </header>
      <nav className="tabs no-print" role="tablist" aria-label="เมนูพนักงาน">
        {tabs.map((t) => (
          <button key={t.key} role="tab" className="btn" aria-selected={t.key === current.key}
            onClick={() => setParams({ tab: t.key }, { replace: true })}>
            {t.label}
          </button>
        ))}
      </nav>
      <main className="container wide" role="tabpanel" aria-label={current.label}>
        <Suspense fallback={<div className="spinner" role="status" aria-label="กำลังโหลด" style={{ marginTop: 40 }} />}>
          <Tab />
        </Suspense>
      </main>
    </div>
  )
}
