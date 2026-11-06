// Shared helpers for the K.D. Foods scheme bot (runs in GitHub Actions; no npm packages beyond Playwright).
// Env: KD_BOT_TOKEN, KD_CHAT_ID, SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMINI_FREE_KEY, GROQ_API_KEY (optional)
export const env = (k, req = true) => { const v = process.env[k]; if (req && !v) throw new Error(`missing env ${k}`); return v }

// ---------- Supabase REST (service role: bypasses RLS, server-side only) ----------
export async function db(path, init = {}) {
  const r = await fetch(`${env('SUPABASE_URL')}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: env('SUPABASE_SERVICE_KEY'), Authorization: `Bearer ${env('SUPABASE_SERVICE_KEY')}`,
      'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers ?? {}) },
  })
  const body = await r.text()
  if (!r.ok) throw new Error(`db ${r.status} ${path}: ${body.slice(0, 300)}`)
  return body ? JSON.parse(body) : null
}

// ---------- Telegram ----------
export async function tg(method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${env('KD_BOT_TOKEN')}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  const j = await r.json()
  if (!j.ok) throw new Error(`telegram ${method}: ${JSON.stringify(j).slice(0, 300)}`)
  return j.result
}
export async function tgPhoto(file, caption, keyboard) {
  const fs = await import('node:fs')
  const fd = new FormData()
  fd.append('chat_id', env('KD_CHAT_ID'))
  fd.append('photo', new Blob([fs.readFileSync(file)], { type: 'image/jpeg' }), 'poster.jpg')
  if (caption) fd.append('caption', caption.slice(0, 1024))
  if (keyboard) fd.append('reply_markup', JSON.stringify(keyboard))
  const r = await fetch(`https://api.telegram.org/bot${env('KD_BOT_TOKEN')}/sendPhoto`, { method: 'POST', body: fd })
  const j = await r.json(); if (!j.ok) throw new Error(`telegram sendPhoto: ${JSON.stringify(j).slice(0, 300)}`)
  return j.result
}
export const say = (text, extra = {}) => tg('sendMessage', { chat_id: env('KD_CHAT_ID'), text: text.slice(0, 4000), ...extra })

// ---------- AI: Gemini free key first, Groq as backup ----------
export async function askJson(prompt) {
  const key = env('GEMINI_FREE_KEY', false)
  if (key) {
    // Google retires models often (2.0 and 2.5 flash are already gone); VAJRA uses gemini-3.8-flash. Retry when busy (503/429).
    for (const model of ['gemini-3.8-flash']) {
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } }) })
          const j = await r.json()
          const text = j?.candidates?.[0]?.content?.parts?.[0]?.text
          if (text) return JSON.parse(text)
          console.log('gemini', model, r.status, JSON.stringify(j).slice(0, 200))
          if (r.status !== 503 && r.status !== 429) break
        } catch (e) { console.log('gemini error', model, e.message) }
        await new Promise((res) => setTimeout(res, 8000 * (attempt + 1)))
      }
    }
  }
  const g = env('GROQ_API_KEY', false)
  if (!g) throw new Error('AI unavailable (no working Gemini or Groq key)')
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${g}` },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', temperature: 0.2, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }) })
  const j = await r.json()
  return JSON.parse(j.choices[0].message.content)
}

export const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
export const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
export const rs = (paise) => '₹' + (paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })
const HI_MONTHS = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर']
export const hiDate = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${HI_MONTHS[m - 1]}` }
