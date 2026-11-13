// Puts the screenshots of a few pages side by side in one image: node tests/mobile/montage.mjs <dir> <out.png> <prefix> <page1,page2,...>
import { chromium } from 'playwright'
import fs from 'node:fs'
const [, , dir, out, prefix, pages] = process.argv
const files = []
for (const pg of pages.split(',')) for (const s of ['a', 'b']) { const f = `${dir}/${prefix}-${pg.replace(/\W+/g, '_')}-${s}.png`; if (fs.existsSync(f)) files.push([pg + ' ' + s, f]) }
const html = `<body style="margin:0;background:#334155;display:flex;gap:10px;padding:10px;font:12px sans-serif;color:#fff">${files.map(([n, f]) =>
  `<div><div style="padding:2px 0">${n}</div><img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}" style="display:block"></div>`).join('')}</body>`
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 800, height: 600 } })
await p.setContent(html); await p.screenshot({ path: out, fullPage: true }); await b.close(); console.log('ok', files.length)
