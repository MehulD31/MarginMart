// Sales report as a printable A4 HTML document (owner, 13 Nov 2026). Pure: no network.
// Used by the website (Sales report page -> "Download PDF" prints this) and by scripts/ops/report-pdf.mjs (Playwright -> PDF -> Telegram),
// so the PDF in Telegram and the one downloaded from the website are the same document.
// Input: the jsonb from public.sales_report(from, to). Money in paise.

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export const rupees = (p, dec = 0) => '₹' + (Number(p ?? 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec })
const int = (n) => Number(n ?? 0).toLocaleString('en-IN')
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—')
export const niceDate = (iso) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—')
// The catalogue sometimes repeats the pack name ("Nimbooz 345ml Nimbooz 345ml"): show once.
export const itemName = (s) => { const w = String(s ?? '').trim().split(/\s+/), h = w.length / 2; return Number.isInteger(h) && h > 0 && w.slice(0, h).join(' ') === w.slice(h).join(' ') ? w.slice(0, h).join(' ') : String(s ?? '').trim() }
const CHANNEL = { counter: 'Counter / godown', truck: 'Truck (on the route)', route: 'Route orders (delivered)' }
const MODE = { cash: 'Cash', upi: 'UPI', credit: 'Credit (khata)' }

/** IST date ranges for the usual report periods. */
export function periodOf(kind, todayIso) {
  const d = new Date(`${todayIso}T00:00:00Z`), iso = (x) => x.toISOString().slice(0, 10)
  const add = (n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return iso(x) }
  if (kind === 'today') return { from: todayIso, to: todayIso, label: 'Today' }
  if (kind === 'week') return { from: add(-6), to: todayIso, label: 'Last 7 days' }
  if (kind === 'lastweek') { const dow = (d.getUTCDay() + 6) % 7; return { from: add(-dow - 7), to: add(-dow - 1), label: 'Last week (Mon–Sun)' } }
  if (kind === 'month') return { from: todayIso.slice(0, 8) + '01', to: todayIso, label: 'This month' }
  if (kind === 'lastmonth') { const f = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)), t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)); return { from: iso(f), to: iso(t), label: f.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }) } }
  return { from: '2020-01-01', to: todayIso, label: 'Till date' }
}

/** Full HTML document. opts: { title, label, generatedAt (ISO), showMargin (default true) } */
export function reportHtml(r, opts = {}) {
  const t = r.totals ?? {}, showMargin = opts.showMargin !== false
  const from = r.first_sale && r.from < r.first_sale ? r.first_sale : r.from
  const items = r.by_item ?? [], days = r.by_day ?? [], shops = r.top_shops ?? []
  const maxDay = Math.max(1, ...days.map((d) => Number(d.amount_paise)))
  const card = (label, value, sub = '') => `<div class="card"><div class="lbl">${label}</div><div class="val">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`
  const head = (cols) => `<thead><tr>${cols.map(([c, n]) => `<th${n ? ' class="n"' : ''}>${c}</th>`).join('')}</tr></thead>`
  const cases = Number(t.cases) || 0, net = Number(t.net_paise) || 0
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(opts.title ?? 'Sales report')}</title><style>
@page { size: A4; margin: 14mm 12mm 16mm; }
* { box-sizing: border-box; } body { font: 11px/1.45 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; margin: 0; }
.top { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #16a34a; padding-bottom: 8px; margin-bottom: 12px; }
.brand { font-size: 20px; font-weight: 800; } .brand span { color: #16a34a; } .tag { color: #64748b; font-size: 10px; }
h1 { font-size: 16px; margin: 0; text-align: right; } .period { color: #475569; text-align: right; }
.cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
.card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; break-inside: avoid; } .lbl { color: #64748b; font-size: 9.5px; text-transform: uppercase; letter-spacing: .04em; }
.val { font-size: 17px; font-weight: 800; font-variant-numeric: tabular-nums; } .sub { color: #64748b; font-size: 9.5px; }
h2 { font-size: 12.5px; margin: 14px 0 6px; color: #166534; border-left: 3px solid #16a34a; padding-left: 6px; break-after: avoid; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; } th, td { padding: 4px 6px; border-bottom: 1px solid #eef2f7; text-align: left; vertical-align: top; }
th { background: #f1f5f9; font-size: 9.5px; text-transform: uppercase; letter-spacing: .03em; color: #334155; } td.n, th.n { text-align: right; white-space: nowrap; }
tr { break-inside: avoid; } tfoot td { font-weight: 800; border-top: 2px solid #cbd5e1; background: #f8fafc; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .bar { height: 8px; background: #22c55e; border-radius: 4px; display: inline-block; vertical-align: middle; }
.muted { color: #64748b; } .foot { margin-top: 14px; color: #94a3b8; font-size: 9px; border-top: 1px solid #e2e8f0; padding-top: 6px; }
</style></head><body>
<div class="top"><div><div class="brand">Margin<span>Mart</span></div><div class="tag">by K.D. Foods · Pepsi beverages dealer · Bhilai</div></div>
<div><h1>${esc(opts.title ?? 'Sales report')}</h1><div class="period">${esc(opts.label ?? '')} · ${niceDate(from)} – ${niceDate(r.to)}</div></div></div>
${!Number(t.bills) ? '<p>No sales in this period.</p>' : `
<div class="cards">
${card('Total sales', rupees(net), Number(t.discount_paise) ? `after ${rupees(t.discount_paise)} discount` : 'all bills')}
${card('Cases sold', int(cases), `${int(t.units)} bottles / packs`)}
${card('Bills', int(t.bills), `${int(t.days)} selling day${Number(t.days) === 1 ? '' : 's'}`)}
${card('Shops served', int(t.shops), `${int(t.items)} different items`)}
${card('Average bill', rupees(net / Math.max(1, Number(t.bills))), `${(cases / Math.max(1, Number(t.bills))).toFixed(1)} cases a bill`)}
${card('Average per case', rupees(net / Math.max(1, cases)), 'selling rate')}
${card('Per selling day', rupees(net / Math.max(1, Number(t.days))), `${(cases / Math.max(1, Number(t.days))).toFixed(0)} cases a day`)}
${showMargin ? card('Margin (over buy price)', rupees(t.margin_paise), `${pct(Number(t.margin_paise), net)} of sales · ${rupees(Number(t.margin_paise) / Math.max(1, cases))}/case`) : card('Top item', esc(itemName(items[0]?.item ?? '—')), `${int(items[0]?.cases)} cases`)}
</div>

<h2>Items sold</h2>
<table>${head([['#'], ['Item'], ['Cases', 1], ['Bottles', 1], ['Amount', 1], ['Avg rate / case', 1], ...(showMargin ? [['Margin', 1]] : []), ['Shops', 1], ['Last sold', 1]])}
<tbody>${items.map((i, k) => `<tr><td class="muted">${k + 1}</td><td>${esc(itemName(i.item))}<div class="muted">${esc(i.brand)}</div></td><td class="n"><b>${int(i.cases)}</b></td><td class="n">${int(i.units)}</td>
<td class="n">${rupees(i.amount_paise)}</td><td class="n">${rupees(i.avg_rate_paise)}</td>${showMargin ? `<td class="n">${rupees(i.margin_paise)}</td>` : ''}<td class="n">${int(i.shops)}</td><td class="n">${niceDate(i.last_sold)}</td></tr>`).join('')}</tbody>
<tfoot><tr><td></td><td>Total (${items.length} items)</td><td class="n">${int(cases)}</td><td class="n">${int(t.units)}</td><td class="n">${rupees(t.gross_paise)}</td><td class="n">${rupees(Number(t.gross_paise) / Math.max(1, cases))}</td>${showMargin ? `<td class="n">${rupees(Number(t.margin_paise) + Number(t.discount_paise))}</td>` : ''}<td></td><td></td></tr></tfoot></table>
${Number(t.discount_paise) ? `<p class="muted">Item amounts are before bill discounts (${rupees(t.discount_paise)} in total).</p>` : ''}

<div class="two">
<div><h2>By brand</h2><table>${head([['Brand'], ['Cases', 1], ['Amount', 1], ['Share', 1]])}<tbody>${(r.by_brand ?? []).map((b) => `<tr><td>${esc(b.brand)}</td><td class="n">${int(b.cases)}</td><td class="n">${rupees(b.amount_paise)}</td><td class="n">${pct(Number(b.amount_paise), Number(t.gross_paise))}</td></tr>`).join('')}</tbody></table></div>
<div><h2>How it was sold</h2><table>${head([['Where'], ['Bills', 1], ['Cases', 1], ['Amount', 1]])}<tbody>${(r.by_channel ?? []).map((c) => `<tr><td>${CHANNEL[c.channel] ?? esc(c.channel)}</td><td class="n">${int(c.bills)}</td><td class="n">${int(c.cases)}</td><td class="n">${rupees(c.net)}</td></tr>`).join('')}</tbody></table>
<h2>Payment</h2><table>${head([['Mode'], ['Bills', 1], ['Amount', 1]])}<tbody>${(r.by_mode ?? []).map((m) => `<tr><td>${MODE[m.mode] ?? esc(m.mode)}</td><td class="n">${int(m.bills)}</td><td class="n">${rupees(m.net)}</td></tr>`).join('')}</tbody></table></div>
</div>

<h2>Day by day</h2>
<table>${head([['Date'], ['Bills', 1], ['Cases', 1], ['Amount', 1], ['']])}<tbody>${days.map((d) => `<tr><td>${niceDate(d.dy)}</td><td class="n">${int(d.bills)}</td><td class="n">${int(d.cases)}</td><td class="n">${rupees(d.amount_paise)}</td>
<td style="width:35%"><span class="bar" style="width:${Math.max(2, Math.round((Number(d.amount_paise) / maxDay) * 100))}%"></span></td></tr>`).join('')}</tbody></table>

<h2>Top shops</h2>
<table>${head([['#'], ['Shop'], ['Area'], ['Bills', 1], ['Cases', 1], ['Amount', 1]])}<tbody>${shops.map((s, k) => `<tr><td class="muted">${k + 1}</td><td>${esc(s.name)}</td><td class="muted">${esc(s.locality ?? '')}</td><td class="n">${int(s.bills)}</td><td class="n">${int(s.cases)}</td><td class="n">${rupees(s.amount_paise)}</td></tr>`).join('')}</tbody></table>
`}
<div class="foot">Counter bills, truck bills and delivered route orders; cancelled bills are left out. Amounts include GST as billed.${showMargin ? ' Margin = selling price − our buy price for each case, minus bill discounts; it is before salaries, fuel and other running costs (see Kharcha).' : ''}
Generated ${opts.generatedAt ? new Date(opts.generatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''} · MarginMart</div>
</body></html>`
}
