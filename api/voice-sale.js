// Website voice sale (Counter sales -> New sale -> mic). POST { audio: base64, mime } or { text }.
// Needs the caller's Supabase login (admin or manager). Gemini runs here, so the AI key never reaches the browser.
// Returns what was heard and the parsed bill; the browser only PREFILLS the form, nothing is saved here.
import { parseLine, transcribe } from './_sale.js'

const env = new Proxy({}, { get: (_, k) => String(process.env[k] ?? '').trim() })

async function caller(req) {
  const tok = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  if (!tok || tok === env.SUPABASE_ANON_KEY) return null
  const h = { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${tok}` }
  const u = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: h }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  if (!u?.id) return null
  const p = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?select=role,active&user_id=eq.${encodeURIComponent(u.id)}`, { headers: h })
    .then((r) => (r.ok ? r.json() : [])).catch(() => [])
  return p[0]?.active && ['admin', 'manager'].includes(p[0].role) ? p[0] : null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    if (!(await caller(req))) return res.status(401).json({ error: 'Login dobara karo (sirf admin/manager).' })
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}
    let heard = typeof b.text === 'string' ? b.text.trim().slice(0, 500) : ''
    if (!heard) {
      if (typeof b.audio !== 'string' || !b.audio) return res.status(400).json({ error: 'Awaaz nahi mili, dobara bolo.' })
      heard = await transcribe(Buffer.from(b.audio, 'base64'), String(b.mime ?? 'audio/webm'))
    }
    const p = await parseLine(heard)
    return res.status(200).json({
      heard,
      shop: p.shop ? { id: p.shop.id, name: p.shop.name, phone: p.shop.phone ?? null, locality: p.shop.locality ?? null } : null,
      shopHint: p.ambiguous ?? p.newName ?? null,
      lines: p.lines.map((l) => ({ variant_id: l.variant_id, qty: l.qty, price_paise: l.price })),
      mode: p.mode, account_id: p.account?.id ?? null, unclear: p.unclear,
    })
  } catch (e) {
    console.error('voice-sale', e?.message)
    return res.status(422).json({ error: String(e?.message ?? 'Kuch gadbad hui').slice(0, 200) })
  }
}
