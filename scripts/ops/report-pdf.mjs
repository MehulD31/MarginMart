// Sales report PDF -> Telegram (owner, 13 Nov 2026). Runs in .github/workflows/report.yml (needs Playwright's Chromium).
// PERIOD = till | week | lastweek | month | lastmonth | today (default till). Same document as the website's "Download PDF".
// Idempotent per period+day via ops_log (FORCE=1 sends again).
import { chromium } from 'playwright'
import { db, env, todayIST } from '../scheme-bot/lib.mjs'
import { periodOf, reportHtml, rupees, itemName } from '../../src/shared/salesReport.js'

const kind = process.env.PERIOD || 'till', force = process.env.FORCE === '1'
const today = todayIST(), p = periodOf(kind, today), key = `${kind}:${today}`
const done = (await db(`ops_log?job=eq.report-pdf&key=eq.${encodeURIComponent(key)}&select=job`)).length > 0
if (done && !force) { console.log('already sent', key); process.exit(0) }

const r = await db('rpc/sales_report', { method: 'POST', body: JSON.stringify({ p_from: p.from, p_to: p.to }) })
const html = reportHtml(r, { title: 'Sales report', label: p.label, generatedAt: new Date().toISOString() })
const b = await chromium.launch()
const page = await b.newPage()
await page.setContent(html, { waitUntil: 'load' })
const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '14mm', bottom: '16mm', left: '12mm', right: '12mm' },
  displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="font-size:8px;color:#94a3b8;width:100%;text-align:center">Page <span class="pageNumber"></span> / <span class="totalPages"></span></div>' })
await b.close()

const t = r.totals ?? {}, top = (r.by_item ?? []).slice(0, 3).map((i) => `${itemName(i.item)} ${i.cases}`).join(', ')
const caption = Number(t.bills)
  ? `📊 Sales report · ${p.label}\n${rupees(t.net_paise)} · ${t.cases} peti · ${t.bills} bill · ${t.shops} dukan\nMargin ${rupees(t.margin_paise)}\nSabse zyada: ${top}\nWebsite: Sales report page (kabhi bhi dekho)`
  : `📊 Sales report · ${p.label}: is period me koi bikri nahi.`
const fd = new FormData()
fd.append('chat_id', env('KD_CHAT_ID'))
fd.append('caption', caption.slice(0, 1000))
fd.append('document', new Blob([pdf], { type: 'application/pdf' }), `MarginMart-sales-${kind}-${today}.pdf`)
const res = await (await fetch(`https://api.telegram.org/bot${env('KD_BOT_TOKEN')}/sendDocument`, { method: 'POST', body: fd })).json()
if (!res.ok) throw new Error(`telegram sendDocument: ${JSON.stringify(res).slice(0, 200)}`)
await db('ops_log?on_conflict=job,key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ job: 'report-pdf', key, status: 'ok', detail: { bytes: pdf.length } }) })
console.log('sent', key, pdf.length, 'bytes')
