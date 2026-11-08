// Live smoke check after a deploy: the website function reads "upi shobhit" as Shobhit's account, and the
// deployed site serves the Money with partners page. Run: node tests/voice/live-money.mjs
import { login } from '../db/lib.mjs'

const BASE = 'https://kdfoods.vercel.app'
const t = await login('8871565551', '1234')
const ask = async (text) => (await fetch(`${BASE}/api/voice-sale`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify({ text }) })).json()
const a = await ask('maruti kirana sting 50 crate 495 upi shobhit ke account me')
console.log('with shobhit:', a.shop?.name, JSON.stringify(a.lines), a.mode, a.account_id ? 'account set' : 'NO ACCOUNT')
const b = await ask('maruti kirana sting 50 crate 495 upi')
console.log('plain upi   :', b.mode, b.account_id ? 'ACCOUNT SET (wrong)' : 'no account (company bank)')
const html = await (await fetch(`${BASE}/admin`)).text()
const entry = html.match(/\/assets\/index-[^"]+\.js/)[0]
const js = await (await fetch(BASE + entry)).text()
const chunks = [...new Set(js.match(/assets\/[A-Za-z]+-[A-Za-z0-9_-]+\.js/g))]
let live = false
for (const c of chunks) if ((await (await fetch(`${BASE}/${c}`)).text()).includes('money_holdings')) live = true
console.log('money page live:', live)
