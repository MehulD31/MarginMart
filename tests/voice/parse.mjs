// Voice/typed sale parser, end to end against the live endpoint (https://kdfoods.vercel.app/api/voice-sale).
// Text phrases check the parser; tests/voice/*.wav clips (if present) check real speech -> text -> parse.
// Nothing is saved: the endpoint only returns a prefill. Run: node tests/voice/parse.mjs [baseUrl]
import fs from 'node:fs'
import { check, done, login, rest } from '../db/lib.mjs'

const BASE = process.argv[2] ?? 'https://kdfoods.vercel.app'
const tok = await login('8871565551', '1234')
const cat = await rest('rpc/counter_catalog', tok, { method: 'POST', body: '{}' })
const vid = (label) => cat.find((c) => c.label === label)?.variant_id
const STING = vid('Sting PET 250ml (Red)'), NIMBOOZ = vid('Nimbooz 345ml'), AQ1 = vid('Aquafina 1L'), KESAR = cat.find((c) => /kesar badam/i.test(c.label))?.variant_id
const MARUTI = 'Shri Maruti Kirana'

const nap = () => new Promise((ok) => setTimeout(ok, 4000)) // free Gemini key: stay under the per-minute limit
async function ask(body, auth = tok) {
  await nap()
  const go = () => fetch(`${BASE}/api/voice-sale`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` }, body: JSON.stringify(body) })
  const r = await go().catch(async () => { await nap(); return go() }) // one retry on a network blip
  return { status: r.status, body: await r.json().catch(() => null) }
}
const line = (b, id) => b?.lines?.find((l) => l.variant_id === id)

// [phrase, expectation(body) -> [cond, label][]]
const cases = [
  ['maruti kirana sting 50 crate 495', (b) => [[b.shop?.name === MARUTI, 'shop'], [line(b, STING)?.qty === 50, 'qty 50'], [line(b, STING)?.price_paise === 49500, 'rate 495'], [b.lines.length === 1, 'one line']]],
  ['maruti kirana sting pachaas peti chaar sau pachaanve', (b) => [[b.shop?.name === MARUTI, 'shop'], [line(b, STING)?.qty === 50, 'qty 50 (Hindi words)'], [line(b, STING)?.price_paise === 49500, 'rate 495 (Hindi words)']]],
  ['maruti kirana sting 50 case 495, nimbooz 30 peti 515, upi', (b) => [[b.lines.length === 2, 'two lines'], [line(b, NIMBOOZ)?.qty === 30 && line(b, NIMBOOZ)?.price_paise === 51500, 'nimbooz 30 @515'], [b.mode === 'upi', 'upi']]],
  ['shri maruti kirana ko sting 20 crate 490 cash', (b) => [[b.shop?.name === MARUTI, 'shop'], [line(b, STING)?.qty === 20 && line(b, STING)?.price_paise === 49000, '20 @490'], [b.mode === 'cash', 'cash']]],
  ['maaruti kirana sting 10 peti 500 rupay', (b) => [[b.shop?.name === MARUTI, 'misspelt shop'], [line(b, STING)?.qty === 10 && line(b, STING)?.price_paise === 50000, '10 @500']]],
  ['maruti kirana aquafina 1 litre 5 peti 160', (b) => [[line(b, AQ1)?.qty === 5 && line(b, AQ1)?.price_paise === 16000, 'aquafina 1L 5 @160']]],
  ['maruti kirana kesar badam 4 dabba 380 online', (b) => [[line(b, KESAR)?.qty === 4, 'kesar 4'], [b.mode === 'upi', 'online = upi']]],
  ['maruti kirana sting 50 crate', (b) => [[!line(b, STING), 'missing rate -> no line'], [b.unclear.length > 0, 'asks for rate']]],
  ['maruti kirana sting 495', (b) => [[!line(b, STING) || line(b, STING).qty !== 495, 'rate is not taken as cases']]],
  ['gupta new general store sting 5 crate 495', (b) => [[!b.shop, 'unknown shop -> no match'], [/gupta/i.test(b.shopHint ?? ''), 'spoken name kept as hint'], [line(b, STING)?.qty === 5, 'item still read']]],
  ['maruti kirana pepsi 10 peti 300', (b) => [[b.lines.length === 0, 'pepsi without size -> not guessed'], [b.unclear.length > 0, 'asks which size']]],
  ['maruti kirana sting 50 crate 495 nimbooz 20 crate 515', (b) => [[b.lines.length === 2, 'two items without commas']]],
  ['Maruti Kirana: sting 50 @495, cash', (b) => [[b.shop?.name === MARUTI && line(b, STING)?.qty === 50 && line(b, STING)?.price_paise === 49500, 'old typed format still works'], [b.mode === 'cash', 'cash']]],
  // typed 'saat' (7) vs 'saath' (60) is ambiguous in Roman script; speech is written as digits by the transcriber, so test a clear word
  ['maruti kirana sting sattar peti paanch sau', (b) => [[line(b, STING)?.qty === 70 && line(b, STING)?.price_paise === 50000, '70 @500 (Hindi words)']]],
  ['maruti kirana', (b) => [[b.shop?.name === MARUTI, 'shop only'], [b.lines.length === 0, 'no lines']]],
  ['hello kya haal hai', (b) => [[b.lines.length === 0 && !b.shop, 'chit-chat -> nothing']]],
]

for (const [text, exp] of cases) {
  const r = await ask({ text })
  if (r.status !== 200) { check(false, `"${text}" -> HTTP ${r.status}`, r.body); continue }
  for (const [c, l] of exp(r.body)) check(c, `"${text}": ${l}`, { shop: r.body.shop?.name, hint: r.body.shopHint, lines: r.body.lines, mode: r.body.mode, unclear: r.body.unclear })
}

// Security: no login, a shop login, and an empty body are refused.
check((await ask({ text: 'maruti kirana sting 5 crate 495' }, 'x')).status === 401, 'no login -> 401')
check((await ask({})).status === 400, 'no audio and no text -> 400 with a message')

// Real speech clips made by tests/voice/make-clips.ps1
const dir = new URL('./clips/', import.meta.url)
const want = { 'c1.mp3': [MARUTI, STING, 50, 49500], 'c2.mp3': [MARUTI, NIMBOOZ, 30, 51500], 'c3.mp3': [MARUTI, STING, 20, 49000], 'c4.mp3': [MARUTI, STING, 50, 49500] }
for (const [f, [shop, id, qty, price]] of Object.entries(want)) {
  const p = new URL(f, dir)
  if (!fs.existsSync(p)) { console.log('  skip', f, '(no clip)'); continue }
  const r = await ask({ audio: fs.readFileSync(p).toString('base64'), mime: 'audio/mpeg' })
  const l = line(r.body, id)
  check(r.status === 200 && r.body.shop?.name === shop && l?.qty === qty && l?.price_paise === price, `audio ${f}: heard "${r.body?.heard}"`, r.body)
}
// Silence clip -> friendly error, never a crash.
const sil = new URL('silence.wav', dir)
if (fs.existsSync(sil)) {
  const r = await ask({ audio: fs.readFileSync(sil).toString('base64'), mime: 'audio/wav' })
  check((r.status === 422 && typeof r.body?.error === 'string') || (r.status === 200 && !r.body.lines.length), 'silence -> friendly message', r)
}
done()
