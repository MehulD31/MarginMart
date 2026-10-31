import fs from 'node:fs'
import { chromium } from '@playwright/test'

const src = fs.readFileSync('docs/pepsi-meeting-brief.md', 'utf8').replace(/\r/g, '')
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/_{6,}/g, (m) => `<span class="blank" style="width:${Math.min(m.length, 60) * 0.6}em"></span>`)

const out = []; const lines = src.split('\n'); let i = 0
const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
while (i < lines.length) {
  const l = lines[i]
  if (!l.trim()) { i++; continue }
  if (/^---+$/.test(l.trim())) { out.push('<hr>'); i++; continue }
  const h = l.match(/^(#{1,3})\s+(.*)/)
  if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue }
  if (l.trim().startsWith('|')) {
    const head = cells(l); i += 2; const rows = []
    while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]))
    const answer = head.some((x) => /answer|agreed/i.test(x))
    out.push(`<table class="${answer ? 'answer' : ''}"><thead><tr>${head.map((x) => `<th>${inline(x)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((x) => `<td>${inline(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`)
    continue
  }
  if (/^\d+\.\s/.test(l)) {
    const items = []
    while (i < lines.length && /^\d+\.\s/.test(lines[i])) items.push(lines[i++].replace(/^\d+\.\s/, ''))
    out.push(`<ol>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</ol>`); continue
  }
  if (/^_{6,}\s*$/.test(l.trim())) { out.push('<div class="line"></div>'); i++; continue }
  const para = []
  while (i < lines.length && lines[i].trim() && !/^(#|\||---|\d+\.\s)/.test(lines[i]) && !/^_{6,}\s*$/.test(lines[i].trim())) para.push(inline(lines[i++]))
  out.push(`<p>${para.join('<br>')}</p>`)
}

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: A4; margin: 14mm 14mm 16mm; }
* { box-sizing: border-box; }
body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10pt; color: #111827; line-height: 1.4; margin: 0; }
h1 { font-size: 19pt; margin: 0 0 6pt; color: #004b93; border-bottom: 3px solid #004b93; padding-bottom: 4pt; }
h2 { font-size: 13pt; color: #004b93; margin: 10pt 0 5pt; break-after: avoid; }
h3 { font-size: 11pt; margin: 8pt 0 4pt; break-after: avoid; }
p { margin: 4pt 0; }
hr { border: 0; border-top: 1px solid #d1d5db; margin: 8pt 0; }
ol { margin: 3pt 0 3pt 16pt; padding: 0; } li { margin: 2pt 0; }
table { width: 100%; border-collapse: collapse; margin: 4pt 0 6pt; break-inside: auto; }
thead { display: table-header-group; } tr { break-inside: avoid; }
th { background: #004b93; color: #fff; text-align: left; padding: 4pt 6pt; font-size: 9pt; }
td { border: 1px solid #cbd5e1; padding: 4pt 6pt; vertical-align: top; }
tbody tr:nth-child(even) td { background: #f3f6fa; }
table.answer td:last-child { width: 38%; height: 26pt; background: #fff !important; }
table.answer td:first-child { width: 4%; text-align: center; color: #64748b; }
strong { color: #0b1f3a; }
.blank { display: inline-block; border-bottom: 1px solid #111; height: 1em; vertical-align: bottom; }
.line { border-bottom: 1px solid #111; height: 20pt; margin: 4pt 0; }
</style></head><body>${out.join('\n')}</body></html>`

const b = await chromium.launch(); const p = await b.newPage()
await p.setContent(html, { waitUntil: 'load' })
await p.pdf({ path: 'docs/pepsi-meeting-brief.pdf', format: 'A4', printBackground: true, displayHeaderFooter: true,
  headerTemplate: '<span></span>', footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#888">K.D. Foods · Pepsi meeting brief · page <span class="pageNumber"></span>/<span class="totalPages"></span></div>' })
await b.close(); console.log('ok')
