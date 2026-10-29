import { useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BookOpen, Boxes, Calculator, Radio, ShoppingCart, ClipboardCheck, ClipboardList, Ellipsis, History, Inbox, LayoutDashboard, LogOut, Package, Route as RouteIcon, Store, Tags, Truck, Users, type LucideIcon } from 'lucide-react'
import { useAuth } from '../../shared/api/auth'
import { isLowStock, useStock } from '../../shared/api/db'
import { supabase } from '../../shared/api/supabase'
import { LanguageToggle } from '../../shared/ui/LanguageToggle'
import { Brand, Sheet } from '../../shared/ui/kit'
import { initials } from '../../shared/ui/util'
import UsersPage from './UsersPage'
import JoinRequestsPage from './JoinRequestsPage'
import ShopsPage from './ShopsPage'
import CatalogPage from './CatalogPage'
import PriceListsPage from './PriceListsPage'
import NetworkPage from './NetworkPage'
import DashboardPage from './DashboardPage'
import OrdersPage from './OrdersPage'
import LoadingPage from './LoadingPage'
import KhataPage from './KhataPage'
import ClosingPage, { needsAttention, useClosings } from './ClosingPage'
import AuditPage from './AuditPage'
import InventoryPage from './InventoryPage'
import PurchasesPage from './PurchasesPage'
import PricingPage from './PricingPage'
import LivePage from './LivePage'

interface Item { to: string; label: string; icon: LucideIcon; badge?: number }

const usePendingJoins = () => useQuery({
  queryKey: ['join_requests', 'count'],
  queryFn: async () => {
    const { count } = await supabase.from('join_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')
    return count ?? 0
  },
  refetchInterval: 60_000,
})

export default function AdminApp() {
  const { t } = useTranslation()
  const { profile, signOut } = useAuth()
  const { pathname } = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const joins = usePendingJoins().data ?? 0
  // Closed days whose cash is not yet confirmed, or that came back with differences.
  const attention = (useClosings().data ?? []).filter((p) => p.status === 'closed' && needsAttention(p)).length

  const lowStock = (useStock().data ?? []).filter(isLowStock).length
  const ops: Item[] = [
    { to: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
    { to: 'orders', label: t('nav.orders'), icon: ClipboardList },
    { to: 'loading', label: t('nav.loading'), icon: Truck },
    { to: 'live', label: t('nav.live'), icon: Radio },
    { to: 'khata', label: t('nav.khata'), icon: BookOpen },
    { to: 'closing', label: t('nav.closing'), icon: ClipboardCheck, badge: attention },
  ]
  const setup: Item[] = [
    { to: 'inventory', label: t('nav.inventory'), icon: Boxes, badge: lowStock },
    { to: 'purchases', label: t('nav.purchases'), icon: ShoppingCart },
    { to: 'pricing', label: t('nav.pricing'), icon: Calculator },
    { to: 'shops', label: t('nav.shops'), icon: Store },
    { to: 'catalog', label: t('nav.catalog'), icon: Package },
    { to: 'prices', label: t('nav.prices'), icon: Tags },
    { to: 'network', label: t('nav.network'), icon: RouteIcon },
  ]
  const people: Item[] = [
    { to: 'join-requests', label: t('nav.joinRequests'), icon: Inbox, badge: joins },
    { to: 'users', label: t('nav.users'), icon: Users },
    { to: 'audit', label: t('nav.audit'), icon: History },
  ]
  // Bottom bar holds the four most used destinations; the rest live under "More".
  const bottom = ops.slice(0, 3)
  const more = [...ops.slice(3), ...setup, ...people]
  const moreActive = more.some((i) => pathname.includes(`/admin/${i.to}`))

  const link = (i: Item) => (
    <NavLink key={i.to} to={`/admin/${i.to}`} onClick={() => setMoreOpen(false)}>
      <i.icon size={20} aria-hidden="true" /><span>{i.label}</span>
      {!!i.badge && <span className="count" aria-label={t('nav.pendingCount', { n: i.badge })}>{i.badge}</span>}
    </NavLink>
  )

  return (
    <div className="shell">
      <aside className="sidebar on-dark">
        <Brand />
        <nav aria-label={t('nav.admin')}>
          <span className="nav-label">{t('nav.daily')}</span>
          {ops.map(link)}
          <span className="nav-label">{t('nav.setup')}</span>
          {setup.map(link)}
          <span className="nav-label">{t('nav.people')}</span>
          {people.map(link)}
        </nav>
        <div className="sidebar-foot">
          <div className="user-chip">
            <span className="avatar" aria-hidden="true">{initials(profile?.name ?? '')}</span>
            <span className="who"><strong>{profile?.name}</strong><span>{profile && t(`roles.${profile.role}`)}</span></span>
          </div>
          <LanguageToggle className="" />
          <button type="button" onClick={() => void signOut()}><LogOut size={18} aria-hidden="true" />{t('nav.logout')}</button>
        </div>
      </aside>

      <header className="mobile-header">
        <Brand size={16} />
        <LanguageToggle />
      </header>

      <main className="content" id="main">
        <Routes>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="loading" element={<LoadingPage />} />
          <Route path="live" element={<LivePage />} />
          <Route path="khata" element={<KhataPage />} />
          <Route path="closing" element={<ClosingPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="purchases" element={<PurchasesPage />} />
          <Route path="pricing" element={<PricingPage />} />
          <Route path="shops" element={<ShopsPage />} />
          <Route path="catalog" element={<CatalogPage />} />
          <Route path="prices" element={<PriceListsPage />} />
          <Route path="network" element={<NetworkPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="join-requests" element={<JoinRequestsPage />} />
        </Routes>
      </main>

      <nav className="bottom-nav" aria-label={t('nav.admin')}>
        {bottom.map(link)}
        <button type="button" className={moreActive ? 'active' : ''} aria-haspopup="dialog" onClick={() => setMoreOpen(true)}>
          <Ellipsis size={20} aria-hidden="true" /><span>{t('nav.more')}</span>
          {joins > 0 && <span className="count">{joins}</span>}
        </button>
      </nav>

      <Sheet open={moreOpen} title={t('nav.more')} onClose={() => setMoreOpen(false)}>
        <div className="stack-lg">
          <div className="row">
            <span className="avatar-sm" aria-hidden="true">{initials(profile?.name ?? '')}</span>
            <div><strong>{profile?.name}</strong><div className="muted">{profile && t(`roles.${profile.role}`)} · {profile?.phone}</div></div>
          </div>
          <nav className="more-list" aria-label={t('nav.more')}>{more.map(link)}</nav>
          <button type="button" className="danger" onClick={() => void signOut()}><LogOut size={18} aria-hidden="true" />{t('nav.logout')}</button>
        </div>
      </Sheet>
    </div>
  )
}
