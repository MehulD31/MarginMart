// Day / month profit with real kharcha (owner, 12 Nov 2026). Pure, used by the dashboard and the 9:30 pm report.
// Money in paise. Rule against double counting: the fixed line that spends are booked against (spend_line,
// "Miscellaneous" by default) is NOT charged per day; the real spends are charged instead. Every other fixed line
// (EMI, salaries) is charged per working day: monthly amount / working_days, for each day that had sales.

export const CATEGORIES = ['Petrol/Diesel', 'Vehicle rent', 'Repair', 'Tea/Food', 'Labour', 'Other']

/** fixed_costs minus the spend line -> per working day */
export function fixedPerDay(s) {
  const lines = (s?.fixed_costs ?? []).filter((c) => c.label !== (s?.spend_line ?? 'Miscellaneous'))
  const month = lines.reduce((a, c) => a + (Number(c.paise) || 0), 0)
  return Math.round(month / Math.max(1, Number(s?.working_days) || 26))
}
export const variablePerCase = (s) => (Number(s?.loading_paise_per_case) || 0) + Math.round(((Number(s?.cash_discount_paise) || 0) * (Number(s?.on_time_pct) || 0)) / 100)

/**
 * p = { cases, sales_paise, cost_paise, active_days } from pnl_range; spends = [{ amount_paise, category }];
 * days = how many working days to charge fixed for (1 for today, active_days for the month).
 */
export function pnl(p, spends, s, days) {
  const sales = Number(p?.sales_paise) || 0, cost = Number(p?.cost_paise) || 0, cases = Number(p?.cases) || 0
  const margin = sales - cost
  const variable = variablePerCase(s) * cases
  const kharcha = (spends ?? []).reduce((a, e) => a + (Number(e.amount_paise) || 0), 0)
  const fixed = fixedPerDay(s) * Math.max(0, days)
  const profit = margin - variable - kharcha - fixed
  const perCase = cases ? (margin - variable) / cases : null
  const byCat = {}
  for (const e of spends ?? []) byCat[e.category] = (byCat[e.category] ?? 0) + (Number(e.amount_paise) || 0)
  // extra cases needed today to cover kharcha + fixed, at today's margin per case
  const need = profit < 0 && perCase && perCase > 0 ? Math.ceil(-profit / perCase) : 0
  return { sales, cost, cases, margin, variable, kharcha, fixed, profit, perCase, byCat, need }
}

/** Budget vs actual for the spend line this month. */
export function spendBudget(s, monthSpends) {
  const line = s?.spend_line ?? 'Miscellaneous'
  const budget = Number((s?.fixed_costs ?? []).find((c) => c.label === line)?.paise) || 0
  const spent = (monthSpends ?? []).reduce((a, e) => a + (Number(e.amount_paise) || 0), 0)
  return { line, budget, spent, left: budget - spent, over: budget > 0 && spent > budget }
}

/** "petrol 800", "800 petrol gaadi 2", "rent 1500 tata ace" -> { amount_paise, category, note } or null */
export function parseKharcha(text) {
  const t = String(text ?? '').trim()
  const m = /(\d[\d,]*(?:\.\d{1,2})?)/.exec(t)
  if (!m) return null
  const rupees = Number(m[1].replace(/,/g, ''))
  if (!(rupees > 0) || rupees > 500000) return null
  const rest = (t.slice(0, m.index) + ' ' + t.slice(m.index + m[1].length)).replace(/\b(rs|₹|rupaye|rupees|kharcha|kharch|expense)\b/gi, ' ').replace(/[₹]/g, ' ').replace(/\s+/g, ' ').trim()
  const low = rest.toLowerCase()
  const category = /petrol|diesel|fuel|cng|tel\b/.test(low) ? 'Petrol/Diesel'
    : /rent|kiraya|bhada|bhaada|gaadi kiraya/.test(low) ? 'Vehicle rent'
    : /repair|puncture|service|mistri|tyre|tire/.test(low) ? 'Repair'
    : /chai|tea|nashta|khana|food|lunch|paani/.test(low) ? 'Tea/Food'
    : /labour|labor|hammali|majdoor|loading/.test(low) ? 'Labour' : 'Other'
  return { amount_paise: Math.round(rupees * 100), category, note: rest.slice(0, 120) || null }
}
