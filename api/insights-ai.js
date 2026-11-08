// Dashboard "AI advisor": POST { facts, question?, lang } with the caller's Supabase login (admin or manager).
// facts = factsForAI(analyze(...)) computed in the browser from the caller's own data; Gemini (free key) turns it into
// a short plan, or answers the question. The key never reaches the browser. Nothing is written anywhere.
const env = new Proxy({}, { get: (_, k) => String(process.env[k] ?? '').trim() })

async function caller(req) {
  const tok = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  if (!tok || tok === env.SUPABASE_ANON_KEY) return null
  const h = { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${tok}` }
  const u = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: h }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  if (!u?.id) return null
  const p = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?select=role,active,name&user_id=eq.${encodeURIComponent(u.id)}`, { headers: h })
    .then((r) => (r.ok ? r.json() : [])).catch(() => [])
  return p[0]?.active && ['admin', 'manager'].includes(p[0].role) ? p[0] : null
}

export function buildPrompt(facts, question, lang, who) {
  const language = lang === 'hi' ? 'simple Hindi (Devanagari)' : 'simple Hinglish (Hindi words in English letters, like a WhatsApp message)'
  return [
    `You are the business advisor of K.D. Foods, a small PepsiCo distributor in Durg-Bhilai, India (cold drinks, Sting, Nimbooz, Aquafina, Creambell, Lays etc.).`,
    `Sales are in cases (peti). The reader is ${who?.name ?? 'the owner'} (${who?.role ?? 'admin'}), busy, reads on a phone.`,
    `Use ONLY the numbers in DATA. Never invent shops, items or figures. If history is short (history_days < 14), say once that patterns are early.`,
    question
      ? `Answer this question: "${String(question).slice(0, 300)}". Be specific: shop names, items, cases, rupees. Max 120 words.`
      : `Write today's plan: 4-6 bullet points, most money-making first. Each bullet = one action + why (a number). Cover: who to call/visit and what to offer them, stock to order or push, any risk (dues, loss, running out), one growth idea (new shops in areas where we already sell, items to cross-sell). Max 130 words.`,
    `Reply in ${language}. Plain text, bullets start with "• ". No markdown headings, no bold.`,
    `DATA: ${JSON.stringify(facts).slice(0, 12000)}`,
  ].join('\n')
}

export async function ask(prompt) {
  for (const round of [0, 1]) {
    if (round) await new Promise((ok) => setTimeout(ok, 2000))
    for (const model of ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest']) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_KEY },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 700 } }) })
        const j = await r.json()
        const t = j?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim()
        if (t) return { text: t, model }
        console.log('insights-ai', model, r.status, JSON.stringify(j).slice(0, 160))
      } catch (e) { console.log('insights-ai error', model, e.message) }
    }
  }
  throw new Error('AI abhi busy hai, 1 minute baad dobara try karo.')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const who = await caller(req)
    if (!who) return res.status(401).json({ error: 'Login dobara karo (sirf admin/manager).' })
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}
    if (!b.facts || typeof b.facts !== 'object') return res.status(400).json({ error: 'No data' })
    const out = await ask(buildPrompt(b.facts, typeof b.question === 'string' ? b.question.trim() : '', b.lang, who))
    return res.status(200).json(out)
  } catch (e) {
    console.error('insights-ai', e?.message)
    return res.status(503).json({ error: String(e?.message ?? 'AI error').slice(0, 200) })
  }
}
