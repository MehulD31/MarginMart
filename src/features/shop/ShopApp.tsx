import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BookOpen, CalendarClock, ClipboardList, LogOut, Package, RotateCcw, ShoppingBag, ShoppingCart, Trash2, UserRound } from 'lucide-react'
import { useAuth } from '../../shared/api/auth'
import { supabase } from '../../shared/api/supabase'
import { formatPaise } from '../../shared/money'
import { netRate, shopMargin } from '../../shared/pricing'
import { errorMessage } from '../../shared/ui/errors'
import { Alert, Brand, Empty, Sheet, Skeleton, type Msg } from '../../shared/ui/kit'
import { LanguageToggle } from '../../shared/ui/LanguageToggle'
import { Stepper } from '../../shared/ui/Stepper'
import { ProductImage } from '../../shared/ui/ProductImage'
import { initials } from '../../shared/ui/util'
import { useConfirm } from '../../shared/ui/confirm'
import { useBills, useCreditStatus, useLedger } from '../../shared/ledger'
import { BalanceCards, LedgerList } from '../../shared/ui/Khata'
import { cartCases, useCart, type Cart } from './cart'
import { orderCases, orderTotal, useMyOrders, useNextDelivery, useShopCatalog, type CatalogItem, type Order } from './data'

const useLocale = () => (useTranslation().i18n.language === 'hi' ? 'hi-IN' : 'en-IN')
const dayLabel = (iso: string, locale: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' })
const timeLabel = (iso: string, locale: string) =>
  new Date(iso).toLocaleString(locale, { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })

export default function ShopApp() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const cart = useCart(profile!.shop_id!)
  return (
    <div className="app-shell">
      <header className="mobile-header always"><Brand size={16} /><LanguageToggle /></header>
      <main className="app-main">
        <Routes>
          <Route index element={<OrderScreen cart={cart} />} />
          <Route path="orders" element={<OrdersScreen onEdit={cart.replace} />} />
          <Route path="khata" element={<KhataScreen />} />
          <Route path="account" element={<AccountScreen />} />
          <Route path="*" element={<Navigate to="/shop" replace />} />
        </Routes>
      </main>
      <nav className="bottom-nav always" aria-label={t('nav.shop')}>
        <NavLink to="/shop" end><ShoppingBag size={20} aria-hidden="true" /><span>{t('shop.tabOrder')}</span></NavLink>
        <NavLink to="/shop/orders"><ClipboardList size={20} aria-hidden="true" /><span>{t('shop.tabOrders')}</span></NavLink>
        <NavLink to="/shop/khata"><BookOpen size={20} aria-hidden="true" /><span>{t('khata.title')}</span></NavLink>
        <NavLink to="/shop/account"><UserRound size={20} aria-hidden="true" /><span>{t('shop.tabAccount')}</span></NavLink>
      </nav>
    </div>
  )
}

type CartApi = ReturnType<typeof useCart>

function OrderScreen({ cart }: { cart: CartApi }) {
  const { t, i18n } = useTranslation()
  const locale = useLocale()
  const qc = useQueryClient()
  const catalog = useShopCatalog()
  const delivery = useNextDelivery()
  const orders = useMyOrders()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const [placed, setPlaced] = useState<{ total: number; date: string } | null>(null)
  const credit = useCreditStatus()
  const hi = i18n.language === 'hi'

  // The saved order for the next visit, if any. An empty cart picks it up so editing feels natural.
  const openOrder = orders.data?.find((o) => o.status === 'placed' && o.route_day_plan.id === delivery.data?.plan_id)
  // Seed once per saved order (not once per page), so it also works right after placing.
  const seededFor = useRef<string | null>(null)
  const { replace } = cart
  const cartEmpty = cartCases(cart.cart) === 0
  useEffect(() => {
    if (!openOrder || seededFor.current === openOrder.id) return
    seededFor.current = openOrder.id
    if (cartEmpty) replace(Object.fromEntries(openOrder.order_line.map((l) => [l.variant_id, l.qty_ordered])))
  }, [openOrder, cartEmpty, replace])

  const items = useMemo(() => catalog.data ?? [], [catalog.data])
  const byVariant = useMemo(() => {
    const m = new Map<string, { item: CatalogItem; name: string }>()
    for (const it of items) for (const v of it.variants) m.set(v.id, { item: it, name: variantName(it, v.id, hi) })
    return m
  }, [items, hi])
  const lines = Object.entries(cart.cart).filter(([id]) => byVariant.has(id))
  const total = lines.reduce((s, [id, qty]) => s + qty * netRate(byVariant.get(id)!.item.price), 0)
  const cases = lines.reduce((s, [, qty]) => s + qty, 0)
  const dirty = openOrder ? !sameCart(cart.cart, openOrder) : cases > 0

  const lastOrder = orders.data?.find((o) => o.status !== 'cancelled' && o.id !== openOrder?.id && o.order_line.length)
  const reorder = () => {
    if (!lastOrder) return
    cart.replace(Object.fromEntries(lastOrder.order_line.filter((l) => byVariant.has(l.variant_id)).map((l) => [l.variant_id, l.qty_ordered])))
    setMsg({ kind: 'success', text: t('shop.reordered') })
  }

  const place = async () => {
    setBusy(true); setMsg(null)
    const { data, error } = await supabase.rpc('save_order', { p_lines: lines.map(([variant_id, qty]) => ({ variant_id, qty })) })
    setBusy(false)
    if (error) { setMsg({ kind: 'error', text: errorMessage(t, error) }); setOpen(false); return }
    const r = data as { total_paise: number; delivery_date: string }
    cart.clear(); setOpen(false)
    setPlaced({ total: r.total_paise, date: r.delivery_date })
    void qc.invalidateQueries({ queryKey: ['my-orders'] })
  }

  const filtered = items.filter((it) => !q || `${it.pack.name_en} ${it.pack.name_hi ?? ''} ${it.variants.map((v) => `${v.flavour_en} ${v.flavour_hi ?? ''}`).join(' ')}`.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="stack-lg">
      <DeliveryCard delivery={delivery.data} loading={delivery.isLoading} locale={locale} />
      {credit.data?.blocked && <Alert msg={{ kind: 'error', text: t('khata.blocked', { amount: formatPaise(credit.data.overdue_paise || credit.data.balance_paise) }) }} />}
      {openOrder && !dirty && <Alert msg={{ kind: 'success', text: t('shop.savedOrder', { n: orderCases(openOrder), total: formatPaise(orderTotal(openOrder)) }) }} />}
      {lastOrder && cases === 0 && (
        <button type="button" className="reorder" onClick={reorder}>
          <RotateCcw size={20} aria-hidden="true" />
          <span className="grow"><strong>{t('shop.reorder')}</strong><span className="cell-sub">{t('shop.reorderSub', { n: orderCases(lastOrder), date: dayLabel(lastOrder.route_day_plan.date, locale) })}</span></span>
        </button>
      )}
      <Alert msg={msg} />
      <input type="search" aria-label={t('shop.search')} placeholder={t('shop.search')} value={q} onChange={(e) => setQ(e.target.value)} />

      {catalog.isLoading ? <Skeleton rows={5} /> : catalog.isError ? <Alert msg={{ kind: 'error', text: errorMessage(t, catalog.error) }} />
        : items.length === 0 ? <div className="card"><Empty icon={<Package size={26} />} title={t('shop.noProducts')}><p>{t('shop.noProductsHint')}</p></Empty></div>
        : filtered.length === 0 ? <p className="muted">{t('common.noMatches')}</p>
        : <div className="product-list">{filtered.map((it) => <PackCard key={it.pack.id} item={it} cart={cart} hi={hi} disabled={!delivery.data} />)}</div>}

      {cases > 0 && (
        <div className="cart-bar" role="region" aria-label={t('shop.cart')}>
          <div className="grow"><strong>{t('shop.casesCount', { count: cases })} · {formatPaise(total)}</strong>
            <span className="cell-sub">{dirty ? (openOrder ? t('shop.unsaved') : t('shop.notPlaced')) : t('shop.saved')}</span></div>
          <button type="button" className="primary" onClick={() => setOpen(true)}><ShoppingCart size={18} aria-hidden="true" />{t('shop.viewCart')}</button>
        </div>
      )}

      <Sheet open={open} title={t('shop.cart')} onClose={() => setOpen(false)}>
        <div className="stack">
          {delivery.data && <p className="muted row"><CalendarClock size={16} aria-hidden="true" />{t('shop.deliveryOn', { date: dayLabel(delivery.data.delivery_date, locale) })}</p>}
          <ul className="plain-list">
            {lines.map(([id, qty]) => {
              const { item, name } = byVariant.get(id)!
              return (
                <li key={id} className="cart-line">
                  <div className="grow"><div className="cell-title">{name}</div>
                    <div className="cell-sub num">{formatPaise(netRate(item.price))} × {qty} = <strong>{formatPaise(netRate(item.price) * qty)}</strong></div></div>
                  <Stepper value={qty} onChange={(n) => cart.set(id, n)} label={name} />
                </li>
              )
            })}
          </ul>
          <div className="row-between total-row"><span>{t('shop.total')}</span><strong className="num">{formatPaise(total)}</strong></div>
          <p className="muted">{t('shop.payNote')}</p>
          <div className="sheet-foot">
            <button type="button" className="danger" onClick={() => { cart.clear(); setOpen(false) }}><Trash2 size={18} aria-hidden="true" />{t('shop.clear')}</button>
            <button type="button" className="primary" disabled={busy || !delivery.data || !dirty} onClick={() => void place()}>
              {busy ? t('common.loading') : openOrder ? t('shop.update') : t('shop.place')}</button>
          </div>
        </div>
      </Sheet>

      <Sheet open={!!placed} title={t('shop.placedTitle')} onClose={() => setPlaced(null)}>
        {placed && <div className="stack">
          <div className="pin-reveal"><span className="muted">{t('shop.deliveryOn', { date: dayLabel(placed.date, locale) })}</span><span className="digits" style={{ letterSpacing: 0 }}>{formatPaise(placed.total)}</span></div>
          <p className="muted">{t('shop.placedText')}</p>
          <div className="sheet-foot"><button type="button" className="primary" onClick={() => setPlaced(null)}>OK</button></div>
        </div>}
      </Sheet>
    </div>
  )
}

/** Current time, refreshed every minute, so the countdown stays honest without impure renders. */
function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(id) }, [])
  return now
}

function sameCart(cart: Cart, o: Order) {
  const a = Object.entries(cart)
  return a.length === o.order_line.length && o.order_line.every((l) => cart[l.variant_id] === l.qty_ordered)
}

function variantName(it: CatalogItem, variantId: string, hi: boolean) {
  const v = it.variants.find((x) => x.id === variantId)!
  const flavour = (hi && v.flavour_hi) || v.flavour_en
  const pack = (hi && it.pack.name_hi) || it.pack.name_en
  return it.variants.length === 1 && v.flavour_en === it.pack.name_en ? pack : `${flavour} · ${pack}`
}

function DeliveryCard({ delivery, loading, locale }: { delivery?: { delivery_date: string; cutoff: string } | null; loading: boolean; locale: string }) {
  const { t } = useTranslation()
  const now = useNow()
  if (loading) return <div className="skeleton" style={{ minHeight: 88 }} />
  if (!delivery) return <Alert msg={{ kind: 'warn', text: t('shop.noDelivery') }} />
  const hoursLeft = Math.max(0, Math.floor((new Date(delivery.cutoff).getTime() - now) / 3_600_000))
  return (
    <div className="delivery-card">
      <CalendarClock size={28} aria-hidden="true" />
      <div className="grow">
        <div className="label">{t('shop.nextDelivery')}</div>
        <div className="date">{dayLabel(delivery.delivery_date, locale)}</div>
        <div className="cutoff">{t('shop.orderBy', { time: timeLabel(delivery.cutoff, locale) })}{hoursLeft < 24 && <> · <strong>{t('shop.hoursLeft', { count: hoursLeft })}</strong></>}</div>
      </div>
    </div>
  )
}

function PackCard({ item, cart, hi, disabled }: { item: CatalogItem; cart: CartApi; hi: boolean; disabled: boolean }) {
  const { t } = useTranslation()
  const { pack, price, variants } = item
  const rate = netRate(price)
  const margin = shopMargin({ ...price, units_per_case: pack.units_per_case, mrp_paise: pack.mrp_paise })
  const name = (hi && pack.name_hi) || pack.name_en
  const single = variants.length === 1
  return (
    <article className="product">
      <div className="product-head">
        <ProductImage path={variants.find((v) => v.image_path)?.image_path} name={pack.name_en} size={76} />
        <div className="grow">
          <h2 className="product-name">{name}</h2>
          <div className="cell-sub">{t('catalog.caseOf', { n: pack.units_per_case })} · MRP {formatPaise(pack.mrp_paise)}</div>
          <div className="price-row">
            <strong className="num">{formatPaise(rate)}</strong><span className="cell-sub">/{t('shop.case')}</span>
            {price.scheme_value_paise > 0 && <s className="cell-sub num">{formatPaise(price.trade_price_paise)}</s>}
          </div>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <span className="badge badge-green">{t('shop.youEarn', { amount: formatPaise(margin) })}</span>
            {price.scheme_type === 'bogo_on_mrp' && <span className="badge badge-amber">{t('shop.bogo')}</span>}
          </div>
        </div>
        {single && <Stepper value={cart.cart[variants[0].id] ?? 0} onChange={(n) => cart.set(variants[0].id, n)} label={name} disabled={disabled} />}
      </div>
      {!single && (
        <ul className="flavours">
          {variants.map((v) => {
            const fl = (hi && v.flavour_hi) || v.flavour_en
            return (
              <li key={v.id}>
                <span className="row"><ProductImage path={v.image_path} name={`{v.flavour_en} {pack.name_en}`} size={40} /><span>{fl}</span></span>
                <Stepper value={cart.cart[v.id] ?? 0} onChange={(n) => cart.set(v.id, n)} label={`${fl} · ${name}`} disabled={disabled} />
              </li>
            )
          })}
        </ul>
      )}
    </article>
  )
}

function OrdersScreen({ onEdit }: { onEdit: (c: Cart) => void }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const orders = useMyOrders()
  const delivery = useNextDelivery()
  const [msg, setMsg] = useState<Msg>(null)

  const cancel = async (o: Order) => {
    if (!(await confirm({ title: t('shop.cancel'), body: t('shop.confirmCancel'), confirm: t('shop.cancel'), danger: true }))) return
    const { error } = await supabase.rpc('cancel_order', { p_order_id: o.id, p_reason: 'cancelled by shop' })
    if (error) setMsg({ kind: 'error', text: errorMessage(t, error) })
    else { setMsg({ kind: 'success', text: t('shop.cancelled') }); void qc.invalidateQueries({ queryKey: ['my-orders'] }) }
  }
  const editable = (o: Order) => o.status === 'placed' && o.route_day_plan.id === delivery.data?.plan_id

  return (
    <div className="stack-lg">
      <h1>{t('shop.tabOrders')}</h1>
      <Alert msg={msg} />
      {orders.isLoading ? <Skeleton rows={3} /> : !orders.data?.length ? (
        <div className="card"><Empty icon={<ClipboardList size={26} />} title={t('shop.noOrders')}><p>{t('shop.noOrdersHint')}</p>
          <NavLink to="/shop" end className="button primary" style={{ marginTop: 8 }}>{t('shop.startOrder')}</NavLink></Empty></div>
      ) : orders.data.map((o) => (
        <article key={o.id} className={`card stack ${o.status === 'cancelled' ? 'dim' : ''}`}>
          <div className="row-between">
            <div><div className="cell-title">{dayLabel(o.route_day_plan.date, locale)}</div>
              <div className="cell-sub">{t('shop.casesCount', { count: orderCases(o) })} · {formatPaise(orderTotal(o))}</div></div>
            <span className={`badge ${STATUS_BADGE[o.status]}`}>{t(`shop.status.${o.status}`)}</span>
          </div>
          {editable(o) && (
            <div className="row">
              <button type="button" className="grow" onClick={() => { onEdit(Object.fromEntries(o.order_line.map((l) => [l.variant_id, l.qty_ordered]))); navigate('/shop') }}>{t('shop.edit')}</button>
              <button type="button" className="danger grow" onClick={() => void cancel(o)}>{t('shop.cancel')}</button>
            </div>
          )}
        </article>
      ))}
    </div>
  )
}

const STATUS_BADGE: Record<Order['status'], string> = {
  placed: 'badge-blue', locked: 'badge-amber', delivered: 'badge-green', partially_delivered: 'badge-green', cancelled: '',
}

function AccountScreen() {
  const { t } = useTranslation()
  const { profile, signOut } = useAuth()
  return (
    <div className="stack-lg">
      <h1>{t('shop.tabAccount')}</h1>
      <div className="card row">
        <span className="avatar-sm" aria-hidden="true">{initials(profile?.name ?? '')}</span>
        <div className="grow"><div className="cell-title">{profile?.name}</div><div className="cell-sub num">{profile?.phone}</div></div>
      </div>
      <div className="card stack">
        <div className="row-between"><span>{t('shop.language')}</span><LanguageToggle className="" /></div>
        <p className="muted">{t('login.forgot')}</p>
      </div>
      <button type="button" className="danger btn-block" onClick={() => void signOut()}><LogOut size={18} aria-hidden="true" />{t('nav.logout')}</button>
    </div>
  )
}

function KhataScreen() {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const credit = useCreditStatus()
  const ledger = useLedger(profile?.shop_id)
  const bills = useBills(profile?.shop_id)
  const catalog = useShopCatalog()
  const [open, setOpen] = useState<string | null>(null)
  const hi = i18n.language === 'hi'
  const names = new Map((catalog.data ?? []).flatMap((it) => it.variants.map((v) => [v.id, variantName(it, v.id, hi)] as const)))
  const bill = bills.data?.find((b) => b.id === open)
  return (
    <div className="stack-lg">
      <h1>{t('khata.title')}</h1>
      <BalanceCards status={credit.data} />
      <p className="muted">{t('khata.shopHint')}</p>
      {!!bills.data?.length && (
        <div className="stack">
          <h2>{t('khata.bills')}</h2>
          <div className="pack-grid">{bills.data.slice(0, 6).map((b) => (
            <button key={b.id} type="button" className={`pack-card ${b.status === 'void' ? 'dim' : ''}`} onClick={() => setOpen(b.id)}>
              <div className="grow"><div className="cell-title num">{b.number}</div><div className="cell-sub">{new Date(b.created_at).toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' })}</div></div>
              <strong className="num">{formatPaise(b.total_paise)}</strong>
            </button>))}
          </div>
        </div>
      )}
      <h2>{t('khata.entries')}</h2>
      <LedgerList entries={ledger.data} loading={ledger.isLoading} />
      <Sheet open={!!bill} title={bill?.number} onClose={() => setOpen(null)}>
        {bill && <ul className="plain-list">{bill.delivery_line.filter((l) => l.qty_delivered > 0).map((l) => (
          <li key={l.variant_id} className="row-between pin-row"><span>{names.get(l.variant_id) ?? '—'} × {l.qty_delivered}{l.qty_delivered < l.qty_ordered ? ` (${t('khata.of', { n: l.qty_ordered })})` : ''}</span><span className="num">{formatPaise(l.qty_delivered * l.unit_price_paise)}</span></li>))}
          <li className="row-between total-row"><span>{t('shop.total')}</span><strong className="num">{formatPaise(bill.total_paise)}</strong></li></ul>}
      </Sheet>
    </div>
  )
}