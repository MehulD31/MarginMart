// Report texts shared by the automatic reports (scripts/ops/ops.mjs) and the instant bot answers (api/_brain.js).
// Pure: numbers in (from ops_daily / ops_weekly), Hinglish text out. Unit-tested in report.test.mjs.
import { item } from './format.mjs'

export const n = (x) => Number(x ?? 0)
export const rs = (paise) => '₹' + (n(paise) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })
export const hi = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** One day's hisaab (night report and /aaj). */
export function dayText(d, title = `🌙 Aaj ka hisaab, ${hi(d.day)}`) {
  const c = d.counter, r = d.route
  const cases = n(c.cases) + n(r.cases)
  const L = [title, '']
  if (!cases && !n(d.collected.cash_paise) && !n(d.collected.upi_paise)) L.push('Abhi tak koi bikri ya vasooli nahi.')
  else L.push(
    `📦 Kul ${cases} peti · ${rs(n(c.total_paise) + n(r.total_paise))}`,
    `• Counter: ${c.bills} bill, ${c.cases} peti, ${rs(c.total_paise)} (cash ${rs(c.cash_paise)}, UPI ${rs(c.upi_paise)})`,
    `• Route: ${r.bills} bill, ${r.cases} peti, ${rs(r.total_paise)}`,
    `• Vasooli: cash ${rs(d.collected.cash_paise)}, UPI ${rs(d.collected.upi_paise)}`,
    `• Counter margin: ${rs(c.margin_paise)}`)
  if (n(c.below_cost_lines) > 0) L.push(`⚠️ ${c.below_cost_lines} line buy price se kam pe biki. Counter sales page me dekho.`)
  if (d.top_items?.length) L.push('', '🏆 Sabse zyada: ' + d.top_items.map((t) => `${item(t.item)} ${t.cases}`).join(', '))
  const probs = []
  for (const t of d.trucks ?? []) {
    const who = t.vehicle || t.route
    if (['loaded', 'out'].includes(t.status) && !t.closed) probs.push(`${who}: truck abhi tak close nahi hua`)
    else if (t.closed && !t.cash_received) probs.push(`${who}: cash ${rs(t.handed_cash_paise)} abhi receive nahi kiya`)
    if (t.closed && n(t.handed_cash_paise) < n(t.expected_cash_paise)) probs.push(`${who}: cash ${rs(n(t.expected_cash_paise) - n(t.handed_cash_paise))} kam`)
    // Trip closed with cases missing (loaded - sold - came back): red, with the manager's reason.
    if (n(t.short_cases) > 0) probs.push(`🔴 ${who}: ${t.short_cases} peti kam${t.close_note ? ` (${t.close_note})` : ''}`)
  }
  if (probs.length) L.push('', '🚨 Closing:', ...probs.map((p) => '• ' + p))
  if (d.open_orders_tomorrow) L.push('', `📝 Kal ke ${d.open_orders_tomorrow} order taiyaar.`)
  return { text: L.join('\n'), cases }
}

/** Last 7 days (weekly report and /week). */
export function weekText(w, sleeping = [], waLink = () => null) {
  const days = w.days ?? []
  const sum = (f) => days.reduce((a, d) => a + f(d), 0)
  const dc = (d) => n(d.counter.cases) + n(d.route.cases)
  const cases = sum(dc)
  const prev = n(w.prev_week_counter_cases) + n(w.prev_week_route_cases)
  const best = days.reduce((b, d) => (dc(d) > (b ? dc(b) : 0) ? d : b), null)
  const items = new Map()
  for (const d of days) for (const t of d.top_items ?? []) items.set(item(t.item), (items.get(item(t.item)) ?? 0) + n(t.cases))
  const L = [`📊 Hafte ka report (${hi(days[0]?.day ?? w.end)}–${hi(days.at(-1)?.day ?? w.end)})`, '',
    `📦 ${cases} peti${prev ? ` (pichhla hafta ${prev}, ${cases >= prev ? '+' : ''}${Math.round(((cases - prev) / prev) * 100)}%)` : ''}`,
    `💵 Bikri ${rs(sum((d) => n(d.counter.total_paise) + n(d.route.total_paise)))} · vasooli ${rs(sum((d) => n(d.collected.cash_paise) + n(d.collected.upi_paise)))}`,
    `📈 Counter margin ${rs(sum((d) => n(d.counter.margin_paise)))}`,
    `🏪 Nayi dukan: ${n(w.new_shops)}`]
  if (best) L.push(`⭐ Best din: ${hi(best.day)} (${dc(best)} peti)`)
  if (items.size) L.push('', '🏆 Top: ' + [...items].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${v}`).join(', '))
  const t = w.today
  if (t?.dues) {
    L.push('', `💰 Udhaar ${rs(t.dues.total_paise)} · overdue ${rs(t.dues.overdue_paise)}`)
    for (const s of t.dues.top.slice(0, 5)) L.push(`• ${s.name}: ${rs(s.balance)}`)
  }
  if (sleeping.length) {
    L.push('', `😴 Ye dukane 10+ din se order nahi kar rahi (${sleeping.length}):`)
    for (const s of sleeping.slice(0, 8)) {
      const link = waLink(s.phone, `Namaste ${s.name}, K.D. Foods se. Kai din se order nahi aaya, koi dikkat hai? Is hafte ke offer ke liye batayein.`)
      L.push(`• ${s.name}${s.locality ? ' · ' + s.locality : ''}: ${s.days} din${link ? '\n  ' + link : ''}`)
    }
  }
  return { text: L.join('\n'), cases }
}
