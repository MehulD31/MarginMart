// Render a poster: node scripts/poster/render.mjs <data.json> <out.jpg> [scheme|combo]
// data.json fields: amount, product, flavours[], images[] (public URLs), valid, validSub, tag, pre, unit, note, phone
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'

const [dataFile, out = 'poster.jpg', template = 'scheme'] = process.argv.slice(2)
const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'))
const b64 = Buffer.from(JSON.stringify(data), 'utf8').toString('base64')
const url = pathToFileURL(path.resolve(`scripts/poster/${template}.html`)).href + '?d=' + encodeURIComponent(b64)

const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1080, height: 1350 } })
await p.goto(url, { waitUntil: 'load', timeout: 60_000 })
await p.evaluate(() => document.fonts.ready)
// Wait for product photos; drop any that fail so the shelf never shows a broken icon.
await p.evaluate(() => Promise.all([...document.images].map((i) => i.complete ? null : new Promise((r) => { i.onload = i.onerror = r }))))
await p.evaluate(() => [...document.images].forEach((i) => { if (!i.naturalWidth) i.remove() }))
const fontsOk = await p.evaluate(() => document.fonts.check('800 40px "Baloo 2"') && document.fonts.check('700 32px Mukta'))
if (!fontsOk) { await b.close(); throw new Error('FONT_FAILED: Hindi fonts did not load') }
await p.screenshot({ path: out, type: 'jpeg', quality: 92 })
await b.close()
console.log('ok', out)
