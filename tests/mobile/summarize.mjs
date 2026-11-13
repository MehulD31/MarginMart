// Summarise a mobile-audit findings file: node tests/mobile/summarize.mjs <dir> [types=a,b] [minSev=medium] [limit=60]
import fs from 'node:fs'
const [, , dir = 'scratch/mobile-audit/before', types = '', minSev = 'medium', limit = '60'] = process.argv
const f = JSON.parse(fs.readFileSync(`${dir}/findings.json`, 'utf8'))
const rank = { info: 0, low: 1, medium: 2, high: 3 }
const want = types ? new Set(types.split(',')) : null
const rows = f.filter((x) => rank[x.sev] >= rank[minSev] && (!want || want.has(x.type)))
const g = new Map()
for (const x of rows) {
  const k = `${x.type} | ${x.page} | ${x.where.startsWith('sheet') ? x.where : 'page'} | ${x.el.replace(/ ".*"$/, '').slice(0, 40)}`
  const e = g.get(k) ?? { n: 0, sizes: new Set(), roles: new Set(), langs: new Set(), ex: x }
  e.n++; e.sizes.add(x.size.split('x')[0]); e.roles.add(x.role[0]); e.langs.add(x.lang); g.set(k, e)
}
console.log(`${rows.length} findings (min ${minSev}) in ${g.size} groups`)
for (const [k, e] of [...g].sort((a, b) => b[1].n - a[1].n).slice(0, Number(limit)))
  console.log(`${String(e.n).padStart(4)} ${k}  w=${[...e.sizes].sort((a, b) => a - b).join(',')} ${[...e.roles].join('')} ${[...e.langs].join('')}\n       ${e.ex.detail.slice(0, 150)}`)
