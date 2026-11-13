// Captures the first two screens of every admin/manager page for a human look (what the measurements can't judge).
//   node tests/mobile/visual.mjs --base=http://localhost:5173 --out=scratch/mobile-audit/visual --size=390x844 --lang=en --role=admin --pages=orders,loading
import { chromium } from 'playwright'
import fs from 'node:fs'
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d }
const BASE = arg('base', 'https://kdfoods.vercel.app'), OUT = arg('out', 'scratch/mobile-audit/visual')
const [w, h] = arg('size', '390x844').split('x').map(Number), lang = arg('lang', 'en'), role = arg('role', 'admin')
const ACC = { admin: ['8871565551', '1234'], manager: ['6000000001', '1234'] }
const COMMON = ['dashboard', 'orders', 'loading', 'live', 'sales', 'khata', 'money', 'closing', 'inventory', 'schemes', 'shops', 'catalog', 'network', 'join-requests']
const ADMIN = ['report', 'products', 'kharcha', 'purchases', 'pricing', 'prices', 'pepsi', 'users', 'audit']
const pages = arg('pages', '') ? arg('pages', '').split(',') : role === 'admin' ? [...COMMON, ...ADMIN] : COMMON
fs.mkdirSync(OUT, { recursive: true })
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: w < 500 })
await ctx.addInitScript((l) => localStorage.setItem('lang', l), lang)
await ctx.route(/supabase\.co\/(rest|functions)\/v1\//, (r) => { const q = r.request(); const write = (q.method() === 'POST' && /\/rest\/v1\/(?!rpc\/)/.test(q.url())) || ['PATCH', 'PUT', 'DELETE'].includes(q.method()); return write ? r.fulfill({ status: 200, body: '[]' }) : r.continue() })
const p = await ctx.newPage()
await p.goto(`${BASE}/login`); await p.locator('input').nth(0).fill(ACC[role][0]); await p.locator('input').nth(1).fill(ACC[role][1])
await p.getByRole('button', { name: /log in|लॉग/i }).click(); await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 })
for (const pg of pages) {
  await p.goto(`${BASE}/admin/${pg}`, { waitUntil: 'domcontentloaded' }); await p.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {}); await p.waitForTimeout(1200)
  const name = `${role}-${lang}-${w}-${pg.replace(/\W+/g, '_')}`
  await p.screenshot({ path: `${OUT}/${name}-a.png` })
  const total = await p.evaluate(() => document.documentElement.scrollHeight)
  if (total > h * 1.3) { await p.evaluate((y) => window.scrollTo(0, y), h - 120); await p.waitForTimeout(500); await p.screenshot({ path: `${OUT}/${name}-b.png` }) }
}
await b.close(); console.log('done', pages.length)
