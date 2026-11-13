// Mobile audit for the MarginMart admin + manager screens (13 Nov 2026). Read-only: it opens pages, sheets and forms and measures;
// it NEVER saves. Every write request to Supabase is blocked in the browser as a second safeguard.
//
//   node tests/mobile/audit.mjs                       full matrix on the live site, both roles
//   node tests/mobile/audit.mjs --quick               390 px, English, no sheets (smoke test)
//   node tests/mobile/audit.mjs --roles=manager --sizes=390x844,320x640 --langs=en,hi --pages=dashboard,orders --sheets=1
//   node tests/mobile/audit.mjs --base=http://localhost:5173 --out=scratch/mobile-audit/after
//
// Measures (all in the page, in CSS px): sideways scroll + the elements that cause it, text clipped by an overflow:hidden parent or an ellipsis,
// content under the fixed bottom bar, tap targets under 44 px, text under 12 px and inputs under 16 px, ₹ amounts / phone numbers / bill numbers that
// break across lines, headings and buttons wrapping to 4+ lines, tables wider than the screen, sheets that don't fit the screen, blank pages,
// console errors and failed (4xx/5xx) requests. Findings go to <out>/findings.json; screenshots of problem screens to <out>/shots.
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d }
const flag = (k) => process.argv.includes(`--${k}`)
const BASE = arg('base', 'https://kdfoods.vercel.app').replace(/\/$/, '')
const OUT = arg('out', 'scratch/mobile-audit/run')
const quick = flag('quick')
const SIZES = (arg('sizes', quick ? '390x844' : '320x640,360x800,375x667,390x844,412x915,430x932,740x360,768x1024,1024x768,1366x820')).split(',').map((s) => s.split('x').map(Number))
const LANGS = arg('langs', quick ? 'en' : 'en,hi').split(',')
const ROLES = arg('roles', 'admin,manager').split(',')
const SHEETS = arg('sheets', quick ? '0' : '1') === '1'
const SHEET_SIZES = new Set((arg('sheetsizes', '320x640,390x844,768x1024')).split(','))
const HI_SIZES = new Set((arg('hisizes', '320x640,390x844,768x1024,1366x820')).split(','))
const CONC = Number(arg('conc', '6'))
const ONLY = arg('pages', '') ? arg('pages', '').split(',') : null

const ACCOUNTS = { admin: ['8871565551', '1234'], manager: ['6000000001', '1234'] }
const COMMON = ['dashboard', 'orders', 'loading', 'loading?view=history', 'live', 'sales', 'khata', 'money', 'closing', 'inventory', 'schemes', 'shops', 'catalog', 'network', 'join-requests']
const ADMIN_ONLY = ['report', 'products', 'kharcha', 'purchases', 'pricing', 'prices', 'pepsi', 'users', 'audit']
const pagesFor = (role) => (role === 'admin' ? [...COMMON, ...ADMIN_ONLY] : COMMON).filter((p) => !ONLY || ONLY.includes(p) || ONLY.includes(p.split('?')[0]))
// Manager must be sent away from admin-only pages: checked once per size, not measured.
const MANAGER_BLOCKED = ADMIN_ONLY

fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true })
fs.mkdirSync(path.join(OUT, 'state'), { recursive: true })

// ---------------------------------------------------------------- in-page measurement
const measure = () => {
  const vw = window.innerWidth, vh = window.innerHeight
  const out = []
  const add = (type, sev, el, detail, extra = {}) => out.push({ type, sev, el: el ? desc(el) : '', detail, ...extra })
  function desc(el) {
    if (!(el instanceof Element)) return ''
    const cls = [...el.classList].slice(0, 2).map((c) => '.' + c).join('')
    const txt = (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40)
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls}${txt ? ` "${txt}"` : ''}`
  }
  const cs = (el) => getComputedStyle(el)
  const visible = (el) => {
    const r = el.getBoundingClientRect(), s = cs(el)
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05
  }
  const srOnly = (el) => { for (let p = el; p && p !== document.body; p = p.parentElement) { const c = getComputedStyle(p).clip; if (c && /^rect\(0(px)?,? 0(px)?,? 0(px)?,? 0(px)?\)$/.test(c)) return true } return false }
  const inClosed = (el) => !!el.closest('[aria-hidden="true"], [hidden], .sr-only, .visually-hidden') || srOnly(el)
  const clipperOf = (el) => {           // nearest ancestor that clips or scrolls horizontally
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const o = cs(p).overflowX
      if (o !== 'visible') return p
    }
    return null
  }
  const root = document.querySelector('main') || document.body

  // 1. sideways scroll + culprits
  const de = document.documentElement
  const hscroll = Math.max(de.scrollWidth, document.body.scrollWidth) - vw
  if (hscroll > 1) {
    add('hscroll', 'high', null, `page is ${hscroll}px wider than the screen`)
    let n = 0
    for (const el of document.querySelectorAll('body *')) {
      if (n >= 8) break
      if (!visible(el) || inClosed(el)) continue
      const r = el.getBoundingClientRect()
      if (r.right > vw + 1 && !clipperOf(el) && cs(el).position !== 'fixed') { add('hscroll-culprit', 'high', el, `right edge at ${Math.round(r.right)}px, screen ${vw}px`); n++ }
    }
  }

  // 2. text leaves: clipped, ellipsis, tiny, broken numbers
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const seen = { tiny: new Map(), clip: new Set(), wrap: new Set() }
  const AMOUNT = /₹\s?\d[\d,]*(?:\.\d+)?/g, PHONE = /\b\d{10}\b/g, BILL = /\bKD-\d{3,6}\b/g
  for (let tn = walker.nextNode(); tn; tn = walker.nextNode()) {
    const text = tn.nodeValue.replace(/\s+/g, ' ').trim()
    if (!text) continue
    const el = tn.parentElement
    if (!el || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'OPTION'].includes(el.tagName) || !visible(el) || inClosed(el)) continue
    const range = document.createRange(); range.selectNodeContents(tn)
    const rr = range.getBoundingClientRect()
    if (!rr.width || !rr.height) continue
    const s = cs(el), fs = parseFloat(s.fontSize)
    // tiny text
    if (fs < 12) { const k = desc(el); if (!seen.tiny.has(k)) { seen.tiny.set(k, 1); add('tiny-text', fs < 11 ? 'medium' : 'low', el, `${fs}px: "${text.slice(0, 40)}"`) } }
    // clipped by an overflow:hidden ancestor (or the element itself)
    for (let p = el; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const ps = cs(p)
      if (ps.position === 'fixed') break
      const hx = ps.overflowX === 'hidden' || ps.overflowX === 'clip', hy = ps.overflowY === 'hidden' || ps.overflowY === 'clip'
      if (!hx && !hy) continue
      const pr = p.getBoundingClientRect()
      const padL = parseFloat(ps.paddingLeft) || 0, padR = parseFloat(ps.paddingRight) || 0
      const cutX = hx && (rr.right > pr.right - padR * 0 + 1 || rr.left < pr.left - 1)
      const cutY = hy && rr.bottom > pr.bottom + 1 && ps.overflowY !== 'visible' && pr.height > 0 && p.scrollHeight > p.clientHeight + 1
      if ((cutX || cutY) && pr.right <= vw + 2) {
        const k = desc(p) + '|' + text.slice(0, 20)
        if (!seen.clip.has(k)) { seen.clip.add(k); add('clipped-text', 'medium', el, `"${text.slice(0, 60)}" cut by ${desc(p)} (text right ${Math.round(rr.right)}, box right ${Math.round(pr.right)})`) }
        break
      }
      void padL
    }
    // ellipsis / line-clamp that is actually cutting
    if ((s.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) || (s.webkitLineClamp && s.webkitLineClamp !== 'none' && el.scrollHeight > el.clientHeight + 1)) {
      const k = 'ell|' + desc(el)
      if (!seen.clip.has(k)) { seen.clip.add(k); add('ellipsis', 'medium', el, `"${text.slice(0, 60)}" shortened with … (needs ${el.scrollWidth}px, has ${el.clientWidth}px)`) }
    }
    // amounts, phones, bill numbers split over two lines
    for (const re of [AMOUNT, PHONE, BILL]) {
      re.lastIndex = 0
      for (let m = re.exec(tn.nodeValue); m; m = re.exec(tn.nodeValue)) {
        const r2 = document.createRange(); r2.setStart(tn, m.index); r2.setEnd(tn, m.index + m[0].length)
        const rects = [...r2.getClientRects()].filter((x) => x.width > 0)
        if (new Set(rects.map((x) => Math.round(x.top / 3))).size > 1) { const k = m[0] + desc(el); if (!seen.wrap.has(k)) { seen.wrap.add(k); add('number-split', 'medium', el, `"${m[0]}" breaks over two lines`) } }
      }
    }
  }

  // 3. short labels (headings, buttons, tabs, badges, column heads) wrapping onto many text lines. Counted from the text itself,
  //    not the box height (icons, padding and table-row stretching would give false alarms).
  for (const el of document.querySelectorAll('h1, h2, h3, button, [role="tab"], .badge, th')) {
    if (!visible(el) || inClosed(el)) continue
    const label = (el.innerText || '').trim()
    if (!label || label.length >= 60 || el.querySelector('p, ul, table, h1, h2, h3, h4') || el.children.length > 4) continue
    // lines of the most-wrapped single text run (separate stacked blocks inside a card-button are not "wrapping")
    let most = 0
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (!n.nodeValue.trim()) continue
      const rg = document.createRange(); rg.selectNodeContents(n)
      const tops = []
      for (const q of rg.getClientRects()) if (q.width > 2 && q.height > 4 && !tops.some((t) => Math.abs(t - q.top) < q.height * 0.6)) tops.push(q.top)
      most = Math.max(most, tops.length)
    }
    const w = el.getBoundingClientRect().width
    // A short pill (badge/tab) wrapping to 2-3 lines is only a problem if it had room: flag it when it's narrower than it could be
    // because an ancestor squeezed it, i.e. its single longest word would still fit on fewer lines at the screen width.
    const words = label.split(/\s+/)
    const longest = words.reduce((a, b) => (b.length > a.length ? b : a), '')
    const isPill = el.matches('.badge, [role="tab"], .btn-sm, button:not(.pack-card):not(.route-card):not(.ins-shop-head):not(.ins-shop-row)')
    const limit = el.matches('h1, h2, h3, th') ? 4 : isPill ? Math.max(4, Math.ceil(label.length / 10)) : w < 150 ? 3 : 4
    void longest
    if (most >= limit) add('many-lines', 'medium', el, `"${label.slice(0, 40).replace(/\s+/g, ' ')}" wraps to ${most} lines in ${Math.round(w)}px`)
  }

  // 4. tap targets
  const taps = new Map()
  for (const el of document.querySelectorAll('a[href], button, [role="button"], [role="tab"], select, textarea, summary, input:not([type="hidden"])')) {
    if (!visible(el) || inClosed(el)) continue
    const s = cs(el)
    if (el.tagName === 'A' && s.display === 'inline') continue            // inline links in text are exempt
    let box = el
    if (el.matches('input[type="checkbox"], input[type="radio"]')) box = el.closest('label') || el
    const r = box.getBoundingClientRect()
    if ((r.width < 43.5 || r.height < 43.5) && vw < 960) {            // laptop sidebar/table controls are mouse targets
      const k = desc(el).replace(/ ".*"$/, '')
      const cur = taps.get(k) || { n: 0, w: r.width, h: r.height, el, text: desc(el) }
      cur.n++; cur.w = Math.min(cur.w, r.width); cur.h = Math.min(cur.h, r.height); taps.set(k, cur)
    }
  }
  for (const t of taps.values()) {
    const m = Math.min(t.w, t.h)
    add('tap-target', m < 24 ? 'medium' : 'low', t.el, `${Math.round(t.w)}×${Math.round(t.h)}px (${t.n}x on page)`, { count: t.n })
  }

  // 5. inputs under 16px on phones (iOS zoom on focus)
  if (vw <= 820) for (const el of document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea')) {
    if (!visible(el) || inClosed(el)) continue
    if (parseFloat(cs(el).fontSize) < 16) add('input-font', 'low', el, `${cs(el).fontSize} (iOS zooms the page in below 16px)`)
  }

  // 6. tables
  for (const t of document.querySelectorAll('table')) {
    if (!visible(t) || inClosed(t)) continue
    const c = clipperOf(t), cr = (c || document.body).getBoundingClientRect(), tr = t.getBoundingClientRect()
    if (tr.width > vw + 1 && !c) add('table-wide', 'high', t, `table is ${Math.round(tr.width)}px wide, screen ${vw}px, no scroll box`)
    else if (c && t.scrollWidth > c.clientWidth + 1 && cs(c).overflowX === 'hidden') add('table-wide', 'high', t, `table ${t.scrollWidth}px inside a box that hides overflow (${c.clientWidth}px)`)
    else if (c && t.scrollWidth > c.clientWidth + 1) out.push({ type: 'table-scrolls', sev: 'info', el: desc(t), detail: `scrolls sideways inside its box (${t.scrollWidth}px in ${Math.round(cr.width)}px)` })
  }

  // 7. sheets / dialogs fit the screen
  for (const d of document.querySelectorAll('[role="dialog"], [aria-modal="true"], .sheet')) {
    if (!visible(d) || inClosed(d)) continue
    const r = d.getBoundingClientRect()
    if (r.bottom > vh + 1 || r.top < -1 || r.right > vw + 1 || r.left < -1) add('sheet-fit', 'high', d, `sheet box ${Math.round(r.left)},${Math.round(r.top)} → ${Math.round(r.right)},${Math.round(r.bottom)} in ${vw}×${vh}`)
    const x = d.querySelector('button[aria-label*="lose" i], button[aria-label*="बंद"], .sheet-head button')
    if (x && visible(x)) { const xr = x.getBoundingClientRect(); if (xr.bottom > vh || xr.top < 0 || xr.right > vw) add('sheet-close', 'high', x, 'close button is off screen') }
  }

  // 8. last content hidden under the bottom bar
  const nav = document.querySelector('.bottom-nav')
  if (nav && visible(nav) && !document.querySelector('[role="dialog"], dialog[open]')) {
    const before = window.scrollY
    window.scrollTo(0, document.documentElement.scrollHeight)
    const navTop = nav.getBoundingClientRect().top
    let maxB = 0, who = null
    for (const el of root.querySelectorAll('*')) {
      if (!visible(el) || el.children.length) continue
      const p = cs(el).position
      if (p === 'fixed' || p === 'sticky' || el.closest('.bottom-nav, .trip-bar, .mobile-header')) continue
      const b = el.getBoundingClientRect().bottom
      if (b > maxB && b < vh * 3) { maxB = b; who = el }
    }
    if (who && maxB > navTop + 1) add('under-bottom-bar', 'high', who, `last content ends at ${Math.round(maxB)}px, bottom bar starts at ${Math.round(navTop)}px`)
    window.scrollTo(0, before)
  }

  // 9. blank page
  if ((document.body.innerText || '').trim().length < 25) add('blank', 'high', null, 'page has almost no text')
  return out
}

// ---------------------------------------------------------------- run
const WRITE_RPC = /rpc\/(save|record|create|delete|void|lock|unlock|submit|approve|add|set|mark|update|cancel|close|confirm|bot_|admin_delete|counter_sale_save|invite|assign|move|transfer|reset|import|sync)/i
const blockWrites = async (ctx, blocked) => {
  await ctx.route(/supabase\.co\/(rest|functions|storage)\/v1\//, (route) => {
    const r = route.request(), u = r.url(), m = r.method()
    const write = (m === 'POST' && /\/rest\/v1\/(?!rpc\/)/.test(u)) || ['PATCH', 'PUT', 'DELETE'].includes(m) || (m === 'POST' && WRITE_RPC.test(u)) || (/functions\/v1\/admin-users/.test(u))
    if (write && !/pin-login/.test(u)) { blocked.push(`${m} ${u.split('/v1/')[1].split('?')[0]}`); return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) }
    return route.continue()
  })
}

async function login(browser, role, lang) {
  const file = path.join(OUT, 'state', `${role}.json`)
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 820 } })
  const p = await ctx.newPage()
  await p.addInitScript((l) => localStorage.setItem('lang', l), lang)
  await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await p.getByLabel('Mobile number').fill(ACCOUNTS[role][0]); await p.getByLabel('4-digit PIN').fill(ACCOUNTS[role][1])
  await p.getByRole('button', { name: /log in|लॉग/i }).click()
  await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 })
  await p.waitForTimeout(1500)
  await ctx.storageState({ path: file }); await ctx.close()
  return file
}

const OPENER = /^\+?\s*(add|new|edit|view|details?|settings|filter|invite|create|change|open|नया|जोड़|देख|बदल|सेटिंग|खोल)/i
const NOT_OPENER = /delete|remove|save|submit|confirm|cancel|approve|reject|void|send|post|pay|record|lock|unload|close day|log ?out|reset|issue|download|pdf|हटा|सेव|भेज|रद्द/i

async function auditPage(browser, role, lang, [w, h], page, stateFile, findings, blockedAll) {
  const tag = `${role}-${lang}-${w}x${h}-${page.replace(/[^a-z0-9]+/gi, '_')}`
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, storageState: stateFile, deviceScaleFactor: 1, hasTouch: w < 800, isMobile: w < 500 })
  await ctx.addInitScript((l) => localStorage.setItem('lang', l), lang)
  const blocked = []; await blockWrites(ctx, blocked)
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(['pageerror', e.message.slice(0, 160)]))
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push(['console', m.text().slice(0, 160)]) })
  p.on('response', (r) => { if (r.status() >= 400 && /supabase/.test(r.url()) && !/admin_(stock|fixed)_costs/.test(r.url())) errs.push(['http', `${r.status()} ${r.url().split('/v1/')[1]?.split('?')[0]}`]) })
  const rec = (items, where) => { for (const it of items) findings.push({ role, lang, size: `${w}x${h}`, page, where, ...it }) }
  const shot = async (name, full) => { const f = path.join(OUT, 'shots', `${tag}${name ? '-' + name : ''}.png`); await p.screenshot({ path: f, fullPage: full }).catch(() => {}); return f }
  try {
    await p.goto(`${BASE}/admin/${page}`, { waitUntil: 'domcontentloaded' })
    await p.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {})
    await p.waitForTimeout(1200)
    let items = await p.evaluate(measure)
    if (items.some((i) => i.type === 'blank')) { await p.waitForTimeout(4000); items = await p.evaluate(measure) }   // slow load under heavy parallel runs
    rec(items, 'page')
    const bad = items.filter((i) => i.sev !== 'info' && i.sev !== 'low')
    if (bad.length) { const f = await shot('', true); for (const it of findings.filter((x) => x.page === page && x.role === role && x.size === `${w}x${h}` && x.lang === lang && !x.shot)) it.shot = f }
    else if (w === 390 && lang === 'en') await shot('clean', true)
    // nav "More" sheet on phones, once per role/size
    if (SHEETS && SHEET_SIZES.has(`${w}x${h}`) && w < 720 && page === 'dashboard') {
      const more = p.locator('.bottom-nav button').last()
      if (await more.count()) { await more.click().catch(() => {}); await p.waitForTimeout(600); rec(await p.evaluate(measure), 'sheet:More'); const f = await shot('more', false); void f; await p.keyboard.press('Escape'); await p.waitForTimeout(300) }
    }
    // reachable sheets: click safe openers, measure, close
    if (SHEETS && SHEET_SIZES.has(`${w}x${h}`)) {
      const labels = await p.evaluate(({ opener, notOpener }) => {
        const o = new RegExp(opener, 'i'), n = new RegExp(notOpener, 'i')
        const seen = new Set(), out = []
        for (const b of document.querySelectorAll('main button, main a[role="button"]')) {
          const t = (b.innerText || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ')
          const r = b.getBoundingClientRect()
          if (!t || r.width === 0 || b.disabled || n.test(t) || !o.test(t) || seen.has(t)) continue
          seen.add(t); out.push(t)
        }
        return out.slice(0, 4)
      }, { opener: OPENER.source, notOpener: NOT_OPENER.source })
      for (const label of labels) {
        const url0 = p.url()
        const btn = p.locator('main button', { hasText: label }).first()
        if (!(await btn.count())) continue
        await btn.click({ timeout: 4000 }).catch(() => {})
        await p.waitForTimeout(800)
        if (p.url() !== url0) { await p.goto(url0, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1000); continue }
        if (await p.locator('[role="dialog"], .sheet').count()) {
          const si = await p.evaluate(measure); rec(si, `sheet:${label.slice(0, 30)}`)
          if (si.some((i) => i.sev === 'high' || i.sev === 'medium')) { const f = await shot(`sheet_${label.replace(/[^a-z0-9]+/gi, '_').slice(0, 20)}`, false); for (const it of findings.filter((x) => x.where === `sheet:${label.slice(0, 30)}` && x.page === page && x.role === role && x.size === `${w}x${h}` && x.lang === lang && !x.shot)) it.shot = f }
          await p.keyboard.press('Escape'); await p.waitForTimeout(400)
          if (await p.locator('[role="dialog"], .sheet').count()) { await p.goto(url0, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1000) }
        }
      }
    }
  } catch (e) { findings.push({ role, lang, size: `${w}x${h}`, page, where: 'run', type: 'audit-error', sev: 'high', el: '', detail: String(e.message).slice(0, 200) }) }
  for (const [k, msg] of errs) findings.push({ role, lang, size: `${w}x${h}`, page, where: 'page', type: `console-${k}`, sev: 'medium', el: '', detail: msg })
  blockedAll.push(...blocked)
  await ctx.close()
}

async function managerRedirects(browser, stateFile, findings) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: stateFile }); const p = await ctx.newPage()
  for (const pg of MANAGER_BLOCKED) {
    await p.goto(`${BASE}/admin/${pg}`, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500)
    if (!p.url().endsWith('/admin/dashboard')) findings.push({ role: 'manager', lang: 'en', size: '390x844', page: pg, where: 'access', type: 'manager-access', sev: 'high', el: '', detail: `manager reached ${p.url()}` })
  }
  await ctx.close()
}

const t0 = Date.now()
const browser = await chromium.launch()
const findings = [], blocked = []
const states = {}
for (const role of ROLES) states[role] = await login(browser, role, 'en')
const tasks = []
for (const role of ROLES) for (const lang of LANGS) for (const sz of SIZES) {
  if (lang === 'hi' && !HI_SIZES.has(sz.join('x'))) continue
  for (const pg of pagesFor(role)) tasks.push([role, lang, sz, pg])
}
console.log(`audit ${BASE}: ${tasks.length} page runs, roles ${ROLES}, langs ${LANGS}, ${SIZES.length} sizes, sheets ${SHEETS}`)
let done = 0
await Promise.all(Array.from({ length: CONC }, async () => {
  while (tasks.length) {
    const [role, lang, sz, pg] = tasks.shift()
    await auditPage(browser, role, lang, sz, pg, states[role], findings, blocked)
    if (++done % 25 === 0) console.log(`  ${done} done, ${findings.length} findings, ${Math.round((Date.now() - t0) / 1000)}s`)
  }
}))
if (ROLES.includes('manager') && !ONLY) await managerRedirects(browser, states.manager, findings)
await browser.close()

fs.writeFileSync(path.join(OUT, 'findings.json'), JSON.stringify(findings, null, 1), 'utf8')
// ---- summary
const real = findings.filter((f) => f.sev !== 'info')
const by = (k) => real.reduce((a, f) => ((a[f[k]] = (a[f[k]] ?? 0) + 1), a), {})
console.log(`\nfinished in ${Math.round((Date.now() - t0) / 1000)}s: ${real.length} findings (+${findings.length - real.length} info). blocked write requests: ${blocked.length}${blocked.length ? ' e.g. ' + [...new Set(blocked)].slice(0, 5).join(', ') : ''}`)
console.log('by severity', by('sev')); console.log('by type', by('type'))
const group = new Map()
for (const f of real) { const k = `${f.type}|${f.page}`; const g = group.get(k) ?? { n: 0, sizes: new Set(), roles: new Set(), sample: f }; g.n++; g.sizes.add(f.size); g.roles.add(f.role); group.set(k, g) }
console.log('\nTOP ISSUES (type | page | count | roles | example)')
for (const [k, g] of [...group].sort((a, b) => b[1].n - a[1].n).slice(0, 60)) console.log(`${k.padEnd(34)} ${String(g.n).padStart(4)}  ${[...g.roles].join('/')}  ${g.sample.el.slice(0, 50)} :: ${g.sample.detail.slice(0, 90)}`)
