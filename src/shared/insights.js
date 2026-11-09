// Smart dashboard engine: turns raw bills (counter, truck and delivered route orders) into decisions.
// Pure functions, no network: used by the website (DashboardPage) and the Telegram autopilot (scripts/ops).
// Ideas borrowed from distributor tools (FieldAssist / Bizom style): reorder prediction per outlet, RFM segments,
// "frequently bought together" / "shops like this also buy", days of stock cover, untapped outlets by area.

const DAY = 86_400_000
const toDay = (iso) => Date.parse(`${iso}T00:00:00Z`)
const addDays = (iso, n) => new Date(toDay(iso) + n * DAY).toISOString().slice(0, 10)
const between = (a, b) => Math.round((toDay(b) - toDay(a)) / DAY)
const sum = (xs, f = (x) => x) => xs.reduce((a, x) => a + (f(x) || 0), 0)
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const pct = (now, before) => (before > 0 ? Math.round(((now - before) / before) * 100) : now > 0 ? null : 0)

/** Sum of one window of bills. */
function windowStats(bills, from, to, admin) {
  const bs = bills.filter((b) => b.day >= from && b.day <= to)
  const value = sum(bs, (b) => b.value)
  return {
    from, to, bills: bs.length, value, cases: sum(bs, (b) => b.cases),
    margin: admin ? sum(bs, (b) => b.margin) : null,
    shops: new Set(bs.map((b) => b.shop)).size, avgBill: bs.length ? Math.round(value / bs.length) : 0,
  }
}

/**
 * @param {object} data  output of the insights_data RPC
 * @returns {object} everything the dashboard shows
 */
export function analyze(data) {
  const today = data.today
  const admin = !!data.admin
  const itemById = new Map((data.items ?? []).map((i) => [i.id, i]))
  const shopById = new Map((data.shops ?? []).map((s) => [s.id, s]))
  const bills = (data.bills ?? []).map((b) => {
    const lines = b.lines.map(([item, qty, value, cost]) => ({ item, qty, value, cost: cost ?? null }))
    return { ...b, lines, cases: sum(lines, (l) => l.qty), value: sum(lines, (l) => l.value),
      margin: admin ? sum(lines, (l) => l.value - (l.cost ?? 0)) : null }
  })
  const firstDay = bills.length ? bills[0].day : today
  const spanDays = Math.max(1, between(firstDay, today) + 1)       // days of history we really have

  // ---------- headline numbers with comparisons ----------
  const w = (a, b) => windowStats(bills, addDays(today, a), addDays(today, b), admin)
  const kpi = {
    today: w(0, 0), yesterday: w(-1, -1), last7: w(-6, 0), prev7: w(-13, -7), last30: w(-29, 0), prev30: w(-59, -30),
    all: windowStats(bills, '0000-01-01', today, admin),
  }
  kpi.change7 = { value: pct(kpi.last7.value, kpi.prev7.value), cases: pct(kpi.last7.cases, kpi.prev7.cases), shops: pct(kpi.last7.shops, kpi.prev7.shops) }

  // ---------- daily series (last 30 days, zero-filled) + weekday pattern ----------
  const byDay = new Map()
  for (const b of bills) { const d = byDay.get(b.day) ?? { value: 0, cases: 0, bills: 0, margin: 0 }; d.value += b.value; d.cases += b.cases; d.bills++; d.margin += b.margin ?? 0; byDay.set(b.day, d) }
  const daily = Array.from({ length: 30 }, (_, i) => { const day = addDays(today, i - 29); return { day, ...(byDay.get(day) ?? { value: 0, cases: 0, bills: 0, margin: 0 }) } })
  const weekday = Array.from({ length: 7 }, (_, dow) => {
    const days = [...Array(spanDays).keys()].map((i) => addDays(firstDay, i)).filter((d) => new Date(toDay(d)).getUTCDay() === dow)
    return { dow, days: days.length, cases: days.length ? sum(days, (d) => byDay.get(d)?.cases ?? 0) / days.length : 0 }
  })

  // ---------- items ----------
  const itemAgg = new Map()
  for (const b of bills) for (const l of b.lines) {
    const a = itemAgg.get(l.item) ?? { cases: 0, value: 0, margin: 0, cases7: 0, casesPrev7: 0, shops: new Set(), byShop: new Map(), bills: 0, lastDay: null }
    a.byShop.set(b.shop, (a.byShop.get(b.shop) ?? 0) + l.qty)
    a.cases += l.qty; a.value += l.value; a.margin += admin ? l.value - (l.cost ?? 0) : 0; a.shops.add(b.shop); a.bills++
    if (b.day >= addDays(today, -6)) a.cases7 += l.qty
    else if (b.day >= addDays(today, -13)) a.casesPrev7 += l.qty
    if (!a.lastDay || b.day > a.lastDay) a.lastDay = b.day
    itemAgg.set(l.item, a)
  }
  const histDays = Math.min(spanDays, 30)
  const items = (data.items ?? []).map((it) => {
    const a = itemAgg.get(it.id)
    const recent = a ? sum(bills.filter((b) => b.day >= addDays(today, -(histDays - 1))), (b) => sum(b.lines.filter((l) => l.item === it.id), (l) => l.qty)) : 0
    const perDay = recent / histDays
    const cover = perDay > 0 ? it.on_hand / perDay : null
    return {
      id: it.id, label: it.label, brand: it.brand, img: it.img, onHand: it.on_hand, low: it.low,
      cases: a?.cases ?? 0, value: a?.value ?? 0, margin: admin && a ? a.margin : null,
      marginPerCase: admin && a?.cases ? Math.round(a.margin / a.cases) : null,
      shops: a?.shops.size ?? 0,
      topBuyers: a ? [...a.byShop.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([id, cases]) => ({ id, name: shopById.get(id)?.name ?? '?', cases })) : [],
      cases7: a?.cases7 ?? 0, trend: a ? pct(a.cases7, a.casesPrev7) : null,
      perDay: Math.round(perDay * 10) / 10, coverDays: cover == null ? null : Math.floor(cover),
      runOut: cover == null ? null : addDays(today, Math.floor(cover)), lastSold: a?.lastDay ?? null,
      // Pepsi order: enough for 10 days of selling, minus what is in the godown.
      reorder: perDay > 0 ? Math.max(0, Math.ceil(perDay * 10 - Math.max(0, it.on_hand))) : 0,
    }
  })
  const sold = items.filter((i) => i.cases > 0).sort((a, b) => b.cases - a.cases)
  const deadStock = items.filter((i) => i.cases === 0 && i.onHand > 0).sort((a, b) => b.onHand - a.onHand)

  // ---------- shops: frequency, recency, value, segments, next order ----------
  const shopBills = new Map()
  for (const b of bills) shopBills.set(b.shop, [...(shopBills.get(b.shop) ?? []), b])
  const shops = [...shopBills.entries()].map(([id, bs]) => {
    const s = shopById.get(id) ?? { id, name: '?' }
    const days = [...new Set(bs.map((b) => b.day))].sort()
    const gaps = days.slice(1).map((d, i) => between(days[i], d)).filter((g) => g > 0)
    const gap = median(gaps)
    const last = days[days.length - 1]
    const since = between(last, today)
    const usual = new Map()
    for (const b of bs) for (const l of b.lines) usual.set(l.item, [...(usual.get(l.item) ?? []), l.qty])
    const likely = [...usual.entries()].map(([item, qs]) => ({ item, label: itemById.get(item)?.label ?? '?', qty: Math.round(median(qs)), times: qs.length }))
      .sort((a, b) => b.times - a.times || b.qty - a.qty)
    const value = sum(bs, (b) => b.value)
    const due = data.dues?.[id]
    return {
      id, name: s.name, owner: s.owner ?? null, phone: s.phone ?? null, area: s.area ?? null, route: s.route ?? null,
      bills: bs.length, days: days.length, cases: sum(bs, (b) => b.cases), value,
      cases7: sum(bs.filter((b) => b.day >= addDays(today, -6)), (b) => b.cases), margin: admin ? sum(bs, (b) => b.margin) : null,
      first: days[0], last, since, gap, nextDue: gap ? addDays(last, Math.round(gap)) : null,
      lateBy: gap ? since - Math.round(gap) : null, avgBill: Math.round(value / bs.length), likely,
      likelyValue: sum(likely, (l) => l.qty * (sum(bs.flatMap((b) => b.lines.filter((x) => x.item === l.item)), (x) => x.value) / Math.max(1, sum(bs.flatMap((b) => b.lines.filter((x) => x.item === l.item)), (x) => x.qty)))),
      balance: due?.[0] ?? 0, overdue: due?.[1] ?? 0,
    }
  })
  // RFM-style segment, scaled to the history we have (a few days of data must not call everyone "lost").
  const horizon = Math.max(7, Math.min(30, spanDays))
  const topValue = [...shops].sort((a, b) => b.value - a.value)
  const vipCut = topValue[Math.max(0, Math.ceil(topValue.length * 0.2) - 1)]?.value ?? Infinity
  for (const s of shops) {
    const late = s.gap ? s.since > Math.max(s.gap * 1.5, s.gap + 2) : false
    s.segment = s.since > horizon * 2 ? 'lost'
      : late || (s.days === 1 && s.since > horizon) ? 'atRisk'
      : s.days >= 3 && s.value >= vipCut ? 'champion'
      : s.days >= 2 ? 'loyal'
      : s.since <= 7 ? 'new' : 'oneTime'
  }
  shops.sort((a, b) => b.value - a.value)

  // ---------- who to call today ----------
  const callToday = shops.filter((s) => s.phone && ((s.gap && s.lateBy >= 0) || (!s.gap && s.since >= 4)))
    .map((s) => ({ ...s, reason: s.gap ? (s.lateBy > 0 ? 'late' : 'due') : 'firstRepeat' }))
    .sort((a, b) => (b.lateBy ?? b.since) * b.avgBill - (a.lateBy ?? a.since) * a.avgBill)
  const dueSoon = shops.filter((s) => s.gap && s.lateBy < 0 && s.lateBy >= -2).sort((a, b) => b.lateBy - a.lateBy)

  // ---------- recommendations: items bought together + "shops like this also buy" ----------
  const buyers = new Map()                                       // item -> set of shops
  for (const s of shops) for (const l of s.likely) buyers.set(l.item, (buyers.get(l.item) ?? new Set()).add(s.id))
  const pairs = []
  const ids = [...buyers.keys()]
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const A = buyers.get(ids[i]), B = buyers.get(ids[j])
    const both = [...A].filter((x) => B.has(x)).length
    if (both >= 2) pairs.push({ a: ids[i], b: ids[j], aLabel: itemById.get(ids[i])?.label, bLabel: itemById.get(ids[j])?.label, shops: both, score: both / Math.sqrt(A.size * B.size) })
  }
  pairs.sort((x, y) => y.score - x.score || y.shops - x.shops)
  const recommendFor = (shopId, n = 3) => {
    const s = shops.find((x) => x.id === shopId)
    const mine = new Set((s?.likely ?? []).map((l) => l.item))
    const score = new Map()
    for (const it of mine) for (const [other, set] of buyers) {
      if (mine.has(other)) continue
      const A = buyers.get(it); const both = [...A].filter((x) => set.has(x)).length
      if (both) score.set(other, (score.get(other) ?? 0) + both / Math.sqrt(A.size * set.size))
    }
    // Fallback: best sellers this shop never took (popular across shops, in stock).
    for (const it of sold.slice(0, 8)) if (!mine.has(it.id) && !score.has(it.id)) score.set(it.id, 0.05 * it.shops)
    return [...score.entries()].map(([item, sc]) => ({ item, label: itemById.get(item)?.label ?? '?', score: sc, onHand: itemById.get(item)?.on_hand ?? 0 }))
      .filter((r) => r.onHand > 0).sort((a, b) => b.score - a.score).slice(0, n)
  }
  for (const s of shops) s.recommend = recommendFor(s.id)

  // ---------- areas: where we sell, and untapped shops ----------
  const areaAll = new Map()
  for (const s of data.shops ?? []) { const k = s.area ?? '—'; areaAll.set(k, (areaAll.get(k) ?? 0) + 1) }
  const areaSales = new Map()
  for (const s of shops) { const k = s.area ?? '—'; const a = areaSales.get(k) ?? { value: 0, cases: 0, buyers: 0 }; a.value += s.value; a.cases += s.cases; a.buyers++; areaSales.set(k, a) }
  const areas = [...areaAll.entries()].map(([area, total]) => ({ area, total, ...(areaSales.get(area) ?? { value: 0, cases: 0, buyers: 0 }) }))
    .map((a) => ({ ...a, untapped: a.total - a.buyers, reach: a.total ? Math.round((a.buyers / a.total) * 100) : 0 }))
    .sort((a, b) => b.value - a.value || b.total - a.total)
  const bought = new Set(shops.map((s) => s.id))
  // Never-bought shops in areas where we already sell: one truck visit away.
  const prospects = (data.shops ?? []).filter((s) => !bought.has(s.id) && s.phone && areaSales.has(s.area ?? '—'))
    .map((s) => ({ ...s, areaValue: areaSales.get(s.area ?? '—').value })).sort((a, b) => b.areaValue - a.areaValue).slice(0, 25)

  // ---------- concentration ----------
  const total = sum(shops, (s) => s.value)
  const top20 = sum(topValue.slice(0, Math.max(1, Math.ceil(topValue.length * 0.2))), (s) => s.value)
  const concentration = total ? Math.round((top20 / total) * 100) : 0

  // ---------- forecast: next 7 days by weekday pattern (falls back to the plain daily average) ----------
  const avgCases = sum(daily.slice(-histDays), (d) => d.cases) / histDays
  const forecast = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i + 1); const dow = new Date(toDay(day)).getUTCDay()
    const wd = weekday[dow]; const cases = spanDays >= 14 && wd.days >= 2 ? wd.cases : avgCases
    return { day, cases: Math.round(cases) }
  })

  // ---------- alerts, most urgent first ----------
  const alerts = []
  for (const i of sold) if (i.coverDays != null && i.coverDays <= 3) alerts.push({ level: i.coverDays <= 1 ? 'red' : 'amber', kind: 'runOut', item: i.label, days: i.coverDays, onHand: i.onHand, reorder: i.reorder })
  for (const i of items) if (i.onHand < 0) alerts.push({ level: 'red', kind: 'negative', item: i.label, onHand: i.onHand })
  const lateBig = callToday.filter((s) => s.reason === 'late' && s.value >= vipCut).slice(0, 3)
  for (const s of lateBig) alerts.push({ level: 'amber', kind: 'lateShop', shop: s.name, days: s.lateBy, gap: Math.round(s.gap) })
  for (const i of sold) if (i.trend != null && i.trend <= -40 && i.cases7 + 3 >= 5) alerts.push({ level: 'amber', kind: 'itemDown', item: i.label, pct: i.trend })
  for (const i of sold) if (admin && i.marginPerCase != null && i.marginPerCase < 0) alerts.push({ level: 'red', kind: 'loss', item: i.label, perCase: i.marginPerCase })
  if (kpi.change7.value != null && kpi.change7.value <= -25 && kpi.prev7.value > 0) alerts.push({ level: 'amber', kind: 'salesDown', pct: kpi.change7.value })
  if (kpi.change7.value != null && kpi.change7.value >= 25 && kpi.prev7.value > 0) alerts.push({ level: 'green', kind: 'salesUp', pct: kpi.change7.value })
  const overdueShops = shops.filter((s) => s.overdue > 0)
  if (overdueShops.length) alerts.push({ level: 'amber', kind: 'dues', n: overdueShops.length, amount: sum(overdueShops, (s) => s.overdue) })
  if (deadStock.length) alerts.push({ level: 'info', kind: 'deadStock', n: deadStock.length, cases: sum(deadStock, (i) => i.onHand), top: deadStock.slice(0, 3).map((i) => i.label) })
  const order = { red: 0, amber: 1, green: 2, info: 3 }
  alerts.sort((a, b) => order[a.level] - order[b.level])

  return {
    today, admin, spanDays, firstDay, kpi, daily, weekday, forecast, items, sold, deadStock, shops,
    segments: ['champion', 'loyal', 'new', 'oneTime', 'atRisk', 'lost'].map((k) => ({ key: k, shops: shops.filter((s) => s.segment === k) })),
    callToday, dueSoon, pairs: pairs.slice(0, 8), areas, prospects, concentration, totalShops: (data.shops ?? []).length,
    buyers: shops.length, alerts, recommendFor,
  }
}

/** Short plain facts for the AI (Gemini) and for Telegram. Keeps names, numbers and rupees; no ids. */
export function factsForAI(a) {
  const rs = (p) => '₹' + Math.round(p / 100).toLocaleString('en-IN')
  return {
    today: a.today, history_days: a.spanDays,
    sales: { today: [a.kpi.today.cases, rs(a.kpi.today.value)], yesterday: [a.kpi.yesterday.cases, rs(a.kpi.yesterday.value)],
      last7: [a.kpi.last7.cases, rs(a.kpi.last7.value), a.kpi.last7.bills + ' bills'], prev7: [a.kpi.prev7.cases, rs(a.kpi.prev7.value)],
      margin7: a.admin ? rs(a.kpi.last7.margin ?? 0) : undefined },
    top_items: a.sold.slice(0, 8).map((i) => ({ item: i.label, cases: i.cases, shops: i.shops, top_buyers: i.topBuyers.slice(0, 4).map((b) => ` `), stock: i.onHand, days_cover: i.coverDays, trend7: i.trend, margin_per_case: a.admin && i.marginPerCase != null ? rs(i.marginPerCase) : undefined })),
    top_shops: a.shops.slice(0, 8).map((s) => ({ shop: s.name, owner: s.owner, area: s.area, bills: s.bills, cases: s.cases, value: rs(s.value), last: s.last, every_days: s.gap, segment: s.segment })),
    call_today: a.callToday.slice(0, 8).map((s) => ({ shop: s.name, days_since: s.since, usual_every: s.gap, likely: s.likely.slice(0, 3).map((l) => `${l.label} ${l.qty}`) })),
    alerts: a.alerts.slice(0, 10),
    reach: { buying_shops: a.buyers, total_shops: a.totalShops, top_areas: a.areas.slice(0, 6).map((x) => `${x.area}: ${x.buyers}/${x.total} shops, ${rs(x.value)}`) },
    dead_stock: a.deadStock.slice(0, 6).map((i) => `${i.label} ${i.onHand}`),
    bought_together: a.pairs.slice(0, 4).map((p) => `${p.aLabel} + ${p.bLabel} (${p.shops} shops)`),
    top20pct_shops_share: a.concentration + '%',
  }
}
