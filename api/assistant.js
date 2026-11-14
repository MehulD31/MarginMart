// Website "Ask" chat: POST { messages: [{ role: 'user'|'ai', text }], image?: base64 JPEG, lang } with the caller's
// Supabase login (admin or manager). Collects the live business numbers (stock, buy/trade price, TS per case, Pepsi portal
// price and credit, running schemes, sales, dues) and lets Gemini (free key) answer, reading the photo too (e.g. a Pepsi
// scheme sheet). Read-only: it never writes anything. The Gemini key stays on the server.
const env = new Proxy({}, { get: (_, k) => String(process.env[k] ?? '').trim() })
const todayIST = (d = 0) => new Date(Date.now() + 330 * 60000 + d * 864e5).toISOString().slice(0, 10)

async function caller(tok) {
  if (!tok || tok === env.SUPABASE_ANON_KEY) return null
  const h = { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${tok}` }
  const u = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: h }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  if (!u?.id) return null
  const p = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?select=role,active,name&user_id=eq.${encodeURIComponent(u.id)}`, { headers: h })
    .then((r) => (r.ok ? r.json() : [])).catch(() => [])
  return p[0]?.active && ['admin', 'manager'].includes(p[0].role) ? p[0] : null
}

/** Everything the assistant may use, read with the caller's own login (so it sees only what they may see). */
async function facts(tok) {
  const h = { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${tok}` }
  const get = (p) => fetch(`${env.SUPABASE_URL}/rest/v1/${p}`, { headers: h }).then((r) => (r.ok ? r.json() : [])).catch(() => [])
  const bot = (fn, args = {}) => fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { ...h, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_key: env.KD_BOT_KEY, ...args }) }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  const [packs, variants, prices, stock, map, sku, schemes, oms, orders, carry, today, yday, week, due, reorder] = await Promise.all([
    get('pack?select=id,name_en,units_per_case,mrp_paise&active=eq.true'),
    get('variant?select=id,pack_id,flavour_en&active=eq.true'),
    get('price_list_item?select=pack_id,trade_price_paise,scheme_value_paise,price_list!inner(status)&price_list.status=eq.active'),
    get('stock?select=variant_id,on_hand,avg_cost_paise'),
    get('oms_map?select=variant_id,sku_code'),
    get('oms_sku?select=sku_code,description,price_paise,mrp_paise'),
    get(`scheme?select=pack_id,kind,amount_paise,starts_on,ends_on,note&active=eq.true&ends_on=gte.${todayIST()}`),
    get('oms_state?id=eq.1&select=synced_at,credit_paise,credit_at,distributor_code'),
    get('oms_order?select=order_no,ordered_on,status,asked,invoiced,value_paise&order=ordered_on.desc&limit=8'),
    get('vehicle_carry?select=variant_id,qty'),
    bot('bot_day', { p_day: todayIST() }), bot('bot_day', { p_day: todayIST(-1) }), bot('bot_week', { p_end: todayIST() }),
    bot('bot_due'), bot('bot_reorder'),
  ])
  const trade = new Map(prices.map((p) => [p.pack_id, p]))
  const st = new Map(stock.map((s) => [s.variant_id, s]))
  const portal = new Map(sku.map((s) => [s.sku_code, s]))
  const skuOf = new Map(map.map((m) => [m.variant_id, m.sku_code]))
  const onTruck = new Map(); for (const c of carry) onTruck.set(c.variant_id, (onTruck.get(c.variant_id) ?? 0) + c.qty)
  const rs = (p) => (p == null ? null : Math.round(Number(p)) / 100)
  const items = packs.filter((p) => trade.has(p.id)).map((p) => {
    const tp = trade.get(p.id).trade_price_paise, mrpCase = p.units_per_case * p.mrp_paise
    const fl = variants.filter((v) => v.pack_id === p.id).map((v) => {
      const s = st.get(v.id), o = portal.get(skuOf.get(v.id))
      return { flavour: v.flavour_en, stock_cases: s?.on_hand ?? 0, on_truck: onTruck.get(v.id) ?? 0, avg_cost_rs: rs(s?.avg_cost_paise || null), pepsi_portal_price_rs: rs(o?.price_paise ?? null) }
    })
    return { item: p.name_en, bottles_per_case: p.units_per_case, mrp_rs: p.mrp_paise / 100, case_mrp_value_rs: mrpCase / 100,
      our_trade_price_rs: tp / 100, shop_ts_now_rs: (mrpCase - tp) / 100, flavours: fl }
  })
  return {
    today: todayIST(), our_distributor_code: oms[0]?.distributor_code ?? '198626',
    items, running_schemes: schemes.map((s) => ({ ...s, amount_rs: s.amount_paise / 100, item: packs.find((p) => p.id === s.pack_id)?.name_en })),
    pepsi_portal: { credit_rs: rs(oms[0]?.credit_paise), credit_at: oms[0]?.credit_at, synced_at: oms[0]?.synced_at, recent_orders: orders },
    sales_today: today, sales_yesterday: yday, last_7_days: week?.days ?? week, dues: due, suggested_pepsi_order: reorder,
  }
}

export function systemPrompt(who, lang, data) {
  const language = lang === 'hi' ? 'simple Hindi (Devanagari)' : 'simple Hinglish (Hindi in English letters, like a WhatsApp message)'
  return [
    'You are the business assistant inside the MarginMart app of K.D. Foods, a Pepsi beverages dealer in Bhilai, India',
    '(drinks, water and milk drinks; never snacks): Pepsi, 7UP, Mirinda, Mountain Dew, Sting, Slice, Tropicana, Nimbooz, Aquafina, Gatorade, plus Creambell milk drinks.',
    `You talk to ${who.name ?? 'the owner'} (${who.role}). Sales are in cases (peti).`,
    'Business terms: TS (trade scheme / trade spend) = what a shop earns per case = case MRP value minus the price the shop pays.',
    'shop_ts_now_rs in DATA is the TS shops get today at our trade price. If Pepsi announces "TS 80" for an item whose TS now is 65, the shop must get',
    '15 more per case (sell 15 cheaper), and Pepsi normally pays that 15 back to us (our margin stays the same). Say this clearly when relevant.',
    'Our buy price for the next case = pepsi_portal_price_rs (with GST). Our margin per case = our_trade_price_rs minus that.',
    'When the user sends a PHOTO (usually a Pepsi sheet or WhatsApp message): first say in 1-2 lines what it is, then what it means for us using DATA',
    '(our stock of that item, buy, trade, TS now vs new TS, how much to sell/order, dates left), then the questions to ask the Pepsi salesman if anything is unclear.',
    'Use ONLY numbers from DATA or the photo. Never invent shops, items, prices or dates. If DATA cannot answer, say which app page has it',
    '(Orders, Loading, Counter sales, Khata, Inventory, Purchases, Pricing, Pepsi portal, Schemes).',
    'You cannot change anything in the app. To start a scheme, tell them to use the Schemes page (or forward the Pepsi photo with a caption in the Telegram group).',
    `Reply in ${language}. Short: max 150 words, plain text, bullets start with "• ", rupees as ₹ with Indian commas. No markdown headings, no bold.`,
    `DATA (live, money in rupees): ${JSON.stringify(data).slice(0, 30000)}`,
  ].join('\n')
}

const clean = (t) => String(t).replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,6}\s*/gm, '').replace(/^\s*(?:[-*+])\s+/gm, '\u2022 ').replace(/\n{3,}/g, '\n\n').trim()

async function gemini(system, messages, image) {
  const deadline = Date.now() + 50_000
  const contents = messages.slice(-12).map((m, i, a) => ({
    role: m.role === 'ai' ? 'model' : 'user',
    parts: [{ text: String(m.text ?? '').slice(0, 2000) || '(photo)' }, ...(i === a.length - 1 && image ? [{ inline_data: { mime_type: 'image/jpeg', data: image } }] : [])],
  }))
  for (const model of ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.5-flash']) {
    if (Date.now() > deadline - 4000) break
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', signal: AbortSignal.timeout(Math.max(3000, Math.min(30_000, deadline - Date.now()))),
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_KEY },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { temperature: 0.3, maxOutputTokens: 4096 } }) })
      const j = await r.json().catch(() => ({}))
      const c = j?.candidates?.[0]
      const t = c?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? '').join('').trim()
      if (t) return clean(t)
      console.log('assistant', model, r.status, c?.finishReason, JSON.stringify(j).slice(0, 160))
      if (r.status === 429) await new Promise((ok) => setTimeout(ok, 1500))
    } catch (e) { console.log('assistant error', model, e.message) }
  }
  throw new Error('AI abhi busy hai, 1 minute baad dobara poochho.')
}

for (const ev of ['unhandledRejection', 'uncaughtException']) process.on(ev, (e) => console.error('assistant', ev, e))
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const tok = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
    const who = await caller(tok)
    if (!who) return res.status(401).json({ error: 'Login dobara karo (sirf admin/manager).' })
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}
    const messages = Array.isArray(b.messages) ? b.messages.filter((m) => m && (m.role === 'user' || m.role === 'ai')) : []
    if (!messages.length || messages[messages.length - 1].role !== 'user') return res.status(400).json({ error: 'Sawal likho' })
    const image = typeof b.image === 'string' && b.image.length < 6_000_000 ? b.image : undefined
    const text = await gemini(systemPrompt(who, b.lang, await facts(tok)), messages, image)
    return res.status(200).json({ text })
  } catch (e) {
    console.error('assistant', e?.message)
    return res.status(503).json({ error: String(e?.message ?? 'AI error').slice(0, 200) })
  }
}
