import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BatteryMedium, MapPin, Navigation, Truck } from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../../shared/api/supabase'
import { must, useVehicles } from '../../shared/api/db'
import { errorMessage } from '../../shared/ui/errors'
import { Alert, Empty, PageHeader, Skeleton, type Msg } from '../../shared/ui/kit'

// Live vehicles (owner, 28 Nov 2026): where each Euler truck is now and where it went today. Data comes from Euler Shepherd via
// scripts/fleet/poll.mjs (one reading a minute); this page refreshes every 30 seconds. Map: OpenStreetMap through Leaflet (free).
interface FleetVehicle {
  imei: string; reg_no: string; model: string | null; vehicle_id: string | null; vehicle: string | null
  lat: number | null; lng: number | null; speed: number | null; soc: number | null; range_km: number | null; km_today: number | null
  state: string | null; online: boolean | null; seen_at: string | null; updated_at: string; route: [number, number][]
}
const COLORS = ['#16a34a', '#2563eb', '#d97706', '#9333ea']
const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

const useFleet = (day?: string) => useQuery({
  queryKey: ['fleet-live', day ?? 'today'],
  queryFn: () => must<{ day: string; vehicles: FleetVehicle[] }>(supabase.rpc('fleet_live', { p_day: day ?? null })),
  refetchInterval: 30_000,
})

/** "running" when it moved in the last few minutes, else what Euler says (Sleep / Parked / Offline). */
function liveState(v: FleetVehicle, now: number) {
  const fresh = v.seen_at ? now - Date.parse(v.seen_at) < 5 * 60000 : false
  if (fresh && (v.speed ?? 0) > 3) return 'running'
  if (v.state && /run/i.test(v.state)) return fresh ? 'running' : 'parked'
  return /sleep/i.test(v.state ?? '') ? 'sleep' : v.online === false ? 'offline' : 'parked'
}
function ago(iso: string | null, t: (k: string, o?: Record<string, unknown>) => string, now: number) {
  if (!iso) return '—'
  const m = Math.round((now - Date.parse(iso)) / 60000)
  if (m < 1) return t('fleet.justNow')
  if (m < 60) return t('fleet.minAgo', { n: m })
  const h = Math.floor(m / 60)
  return h < 24 ? t('fleet.hrAgo', { n: h }) : new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

function FleetMap({ vehicles }: { vehicles: FleetVehicle[] }) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const fitted = useRef(false)
  useEffect(() => {
    if (!el.current || map.current) return
    map.current = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([21.21, 81.38], 12)   // Bhilai
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    return () => { map.current?.remove(); map.current = null; fitted.current = false }
  }, [])
  useEffect(() => {
    const m = map.current, g = layer.current
    if (!m || !g) return
    g.clearLayers()
    const pts: L.LatLngExpression[] = []
    vehicles.forEach((v, i) => {
      const color = COLORS[i % COLORS.length]
      if (v.route.length > 1) L.polyline(v.route, { color, weight: 4, opacity: 0.7 }).addTo(g)
      if (v.lat == null || v.lng == null) return
      const name = v.vehicle ?? v.reg_no
      const icon = L.divIcon({ className: 'fleet-pin', iconSize: [0, 0],
        html: `<div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center"><span style="background:${color};color:#fff;font:600 12px/1.2 system-ui;padding:3px 7px;border-radius:999px;white-space:nowrap;box-shadow:0 1px 4px #0004">${name.replace(/</g, '')}</span><span style="width:10px;height:10px;border-radius:50%;background:${color};border:2px solid #fff;margin-top:2px;box-shadow:0 1px 3px #0005"></span></div>` })
      L.marker([v.lat, v.lng], { icon }).addTo(g)
      pts.push([v.lat, v.lng]); v.route.forEach((p) => pts.push(p))
    })
    if (pts.length && !fitted.current) { m.fitBounds(L.latLngBounds(pts).pad(0.25), { maxZoom: 15 }); fitted.current = true }
  }, [vehicles])
  return <div ref={el} data-testid="fleet-map" style={{ height: 'min(60vh, 460px)', borderRadius: 16, overflow: 'hidden', zIndex: 0 }} />
}

export default function FleetPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [day, setDay] = useState(todayIST())
  const fleet = useFleet(day === todayIST() ? undefined : day)
  const vehicles = useVehicles()
  const [msg, setMsg] = useState<Msg>(null)
  const [now, setNow] = useState(() => Date.now())   // "x min ago" and running/parked follow the clock, not only the data
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(i) }, [])
  const list = useMemo(() => fleet.data?.vehicles ?? [], [fleet.data])
  const ours = (vehicles.data ?? []).filter((v) => v.active && !/^QA /.test(v.name))
  const link = async (imei: string, vehicleId: string) => {
    setMsg(null)
    try { await must(supabase.rpc('fleet_link', { p_imei: imei, p_vehicle: vehicleId || null })); void qc.invalidateQueries({ queryKey: ['fleet-live'] }) }
    catch (e) { setMsg({ kind: 'error', text: errorMessage(t, e) }) }
  }
  const stale = list.length > 0 && list.every((v) => now - Date.parse(v.updated_at) > 15 * 60000)
  return (
    <section className="stack-lg">
      <PageHeader title={t('fleet.title')} sub={t('fleet.sub')} />
      <label className="field" style={{ maxWidth: 220 }}><span>{t('fleet.day')}</span>
        <input type="date" value={day} max={todayIST()} onChange={(e) => setDay(e.target.value || todayIST())} /></label>
      {fleet.isError && <Alert msg={{ kind: 'error', text: errorMessage(t, fleet.error) }} />}
      {stale && <Alert msg={{ kind: 'warn', text: t('fleet.stale', { at: ago(list[0].updated_at, t, now) }) }} />}
      <Alert msg={msg} />
      {fleet.isLoading ? <Skeleton rows={4} /> : list.length === 0 ? (
        <div className="card"><Empty icon={<Truck size={26} />} title={t('fleet.none')} /></div>
      ) : <>
        <FleetMap vehicles={list} />
        <div className="stack" data-testid="fleet-list">{list.map((v, i) => {
          const s = liveState(v, now)
          return (
            <div key={v.imei} className="card stack" style={{ gap: 8, borderLeft: `5px solid ${COLORS[i % COLORS.length]}` }} data-testid="fleet-card">
              <div className="row-between" style={{ gap: 8, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="cell-title">{v.vehicle ? `${v.vehicle} · ${v.reg_no}` : v.reg_no}</div>
                  <div className="cell-sub">{v.model ?? ''}{v.model ? ' · ' : ''}{t('fleet.updated', { at: ago(v.seen_at ?? v.updated_at, t, now) })}</div>
                </div>
                <span className={`badge ${s === 'running' ? 'badge-green' : s === 'offline' ? 'badge-red' : 'badge-amber'}`} data-testid="fleet-state">
                  {t(`fleet.state.${s}`)}{s === 'running' && v.speed ? ` · ${Math.round(v.speed)} km/h` : ''}</span>
              </div>
              <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
                <span className="cell-sub num"><BatteryMedium size={16} aria-hidden="true" style={{ verticalAlign: '-3px' }} /> {v.soc != null ? `${Math.round(v.soc)}%` : '—'}{v.range_km != null ? ` · ${t('fleet.range', { n: Math.round(v.range_km) })}` : ''}</span>
                <span className="cell-sub num"><Navigation size={16} aria-hidden="true" style={{ verticalAlign: '-3px' }} /> {t('fleet.kmToday', { n: v.km_today != null ? Math.round(v.km_today * 10) / 10 : 0 })}</span>
                {v.lat != null && v.lng != null && <a className="cell-sub" href={`https://maps.google.com/?q=${v.lat},${v.lng}`} target="_blank" rel="noreferrer"><MapPin size={16} aria-hidden="true" style={{ verticalAlign: '-3px' }} /> {t('fleet.openMap')}</a>}
              </div>
              <label className="field" style={{ maxWidth: 260 }}><span className="cell-sub">{t('fleet.whichTruck')}</span>
                <select value={v.vehicle_id ?? ''} onChange={(e) => void link(v.imei, e.target.value)} aria-label={`${t('fleet.whichTruck')}: ${v.reg_no}`}>
                  <option value="">{t('fleet.notLinked')}</option>
                  {ours.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select></label>
            </div>)
        })}</div>
      </>}
    </section>
  )
}
