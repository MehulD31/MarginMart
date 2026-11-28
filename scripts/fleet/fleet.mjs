// Pure helpers for the Euler Shepherd vehicle poller (scripts/fleet/poll.mjs). No network here, so it is unit-tested.
export const LOW_SOC = 20            // % battery: alert once a day below this
export const NIGHT = { from: 22 * 60, to: 6 * 60 }   // IST minutes: moving between 22:00 and 06:00 is reported
export const MOVING_KMH = 5

/** Euler v6/rvd response -> one fleet_vehicle row (without vehicle_id, which the website sets). */
export function parseRvd(j, fallback = {}) {
  const d = j?.data ?? {}
  const c = d.location?.coordinate ?? {}
  const num = (x) => (x == null || x === '' || Number.isNaN(Number(x)) ? null : Number(x))
  const lua = num(d.lua?.location) ?? num(d.lua?.vehicle)
  const st = d.states ?? {}
  return {
    imei: String(d.imei ?? fallback.imei ?? ''),
    euler_id: fallback.euler_id ?? null,
    reg_no: d.meta?.registration_number ?? fallback.reg_no ?? '',
    model: d.meta?.vehicle_type ?? fallback.model ?? null,
    lat: num(c.latitude), lng: num(c.longitude), heading: num(d.location?.heading),
    speed: num(d.speed), soc: num(d.battery?.soc), range_km: num(d.distance?.range), km_today: num(d.distance?.today), odo: num(d.distance?.odo),
    state: st.vehicle_state?.value ?? null,
    online: st.connectivity_state?.value ? st.connectivity_state.value !== 'Offline' : null,
    seen_at: lua ? new Date(lua * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
  }
}

/** Minutes since midnight in IST. */
export const istMinutes = (d = new Date()) => { const t = new Date(d.getTime() + 330 * 60000); return t.getUTCHours() * 60 + t.getUTCMinutes() }
/** IST date; a night (22:00-06:00) belongs to the evening's date so one night = one key. */
export function nightKey(d = new Date()) {
  const t = new Date(d.getTime() + 330 * 60000 - (istMinutes(d) < NIGHT.to ? 86400000 : 0))
  return t.toISOString().slice(0, 10)
}
export const isNight = (d = new Date()) => { const m = istMinutes(d); return m >= NIGHT.from || m < NIGHT.to }
export const mapLink = (lat, lng) => `https://maps.google.com/?q=${lat},${lng}`

/** Alerts for one reading: [{ job, key, text }]. The caller sends each only if ops_log has no row (job, key). */
export function alertsFor(v, now = new Date()) {
  const out = []
  const name = v.label ?? v.reg_no
  const day = new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 10)
  if (v.soc != null && v.soc < LOW_SOC) {
    out.push({ job: 'fleet-low-battery', key: `${v.imei}:${day}`,
      text: `🔋 ${name}: battery ${Math.round(v.soc)}%${v.range_km != null ? ` (range ~${Math.round(v.range_km)} km)` : ''}. Charge kar lo.` })
  }
  if (v.speed != null && v.speed > MOVING_KMH && isNight(now) && v.lat != null) {
    const t = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })
    out.push({ job: 'fleet-night-move', key: `${v.imei}:${nightKey(now)}`,
      text: `🌙 ${name} raat ${t} baje chal rahi hai (${Math.round(v.speed)} km/h). Location: ${mapLink(v.lat, v.lng)}` })
  }
  return out
}

/** A new route point only when the vehicle reported a new position time. */
export const isNewPoint = (prevSeenAt, row) => !!row.seen_at && row.lat != null && row.lng != null && row.seen_at !== prevSeenAt
