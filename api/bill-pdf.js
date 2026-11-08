// Bill PDF for one counter sale.
//   GET /api/bill-pdf?id=<bill>&t=<token>   -> the PDF (the signed link sent to shops on WhatsApp; no login needed)
//   GET /api/bill-pdf?id=<bill>&link=1      -> { url } with that signed link (admin/manager login required)
//   GET /api/bill-pdf?id=<bill>             -> the PDF (admin/manager login required)
// The token is an HMAC of the bill id, so links can't be guessed and only open that one bill.
import { billPdf, billToken, billTokenOk } from './_billpdf.js'

const env = new Proxy({}, { get: (_, k) => String(process.env[k] ?? '').trim() })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SITE = 'https://kdfoods.vercel.app'

async function rpc(fn, args, tok) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', body: JSON.stringify(args),
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${tok ?? env.SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' } })
  const t = await r.text()
  if (!r.ok) { let m = t; try { m = JSON.parse(t).message } catch { /* keep */ } throw Object.assign(new Error(m || `rpc ${r.status}`), { status: r.status }) }
  return t ? JSON.parse(t) : null
}

export const billLink = (id) => `${SITE}/api/bill-pdf?id=${id}&t=${billToken(id, env.KD_BOT_KEY)}`

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' })
  const id = String(req.query?.id ?? '')
  if (!UUID.test(id)) return res.status(400).json({ error: 'Bill id missing' })
  try {
    const token = typeof req.query?.t === 'string' ? req.query.t : null
    const user = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
    let bill
    if (token) {
      if (!billTokenOk(id, token, env.KD_BOT_KEY)) return res.status(403).json({ error: 'Link galat hai ya purana hai.' })
      bill = await rpc('bot_bill', { p_key: env.KD_BOT_KEY, p_id: id })
    } else {
      if (!user || user === env.SUPABASE_ANON_KEY) return res.status(401).json({ error: 'Login dobara karo.' })
      bill = await rpc('bill_data', { p_id: id }, user)            // FORBIDDEN unless admin/manager
      if (req.query?.link) return res.status(bill ? 200 : 404).json(bill ? { url: billLink(id), number: bill.number, phone: bill.buyer?.phone ?? null, total_paise: bill.total_paise, shop: bill.buyer?.name ?? '' } : { error: 'Bill nahi mila.' })
    }
    if (!bill) return res.status(404).json({ error: 'Bill nahi mila.' })
    const pdf = await billPdf(bill)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${bill.number}.pdf"`)
    res.setHeader('Cache-Control', 'private, no-store')
    return res.status(200).send(Buffer.from(pdf))
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'FORBIDDEN' || e?.status === 401) return res.status(403).json({ error: 'Sirf admin/manager.' })
    console.error('bill-pdf', msg)
    return res.status(500).json({ error: 'Bill PDF nahi bana, dobara try karo.' })
  }
}
