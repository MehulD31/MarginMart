// Pure helpers for the Reel editor (unit-tested in plan.test.mjs). No I/O here.
// A Reel = N shots of 2 s (cut on the 120 BPM grid), then a 2 s BHILAI brand card, then a 3 s end card.
export const SHOT = 2, BRAND = 2, ENDCARD = 4, FPS = 30      // end card 4 s: room for the spoken phone number
export const MIN_SHOTS = 3, MAX_SHOTS = 6

/** items: [{ kind: 'video'|'image', duration }] in the order they were sent. Returns shots in story order. */
export function planShots(items) {
  const want = []
  for (const [idx, it] of items.entries()) {
    if (it.kind === 'image') { want.push({ idx, from: 0 }); continue }
    const d = Math.max(0, Number(it.duration) || 0)
    const k = Math.max(1, Math.min(3, Math.round(d / 3)))        // ~1 shot per 3 s of footage, max 3 per clip
    const span = Math.max(0, d - 0.6 - SHOT)
    for (let i = 0; i < k; i++) want.push({ idx, from: +(0.3 + (k > 1 ? (span * i) / (k - 1) : Math.min(span, 0.3))).toFixed(2) })
  }
  // too many: keep an even spread (first and last always in); too few: reuse with a different framing
  let shots = want
  if (shots.length > MAX_SHOTS) shots = Array.from({ length: MAX_SHOTS }, (_, i) => want[Math.round((i * (want.length - 1)) / (MAX_SHOTS - 1))])
  for (let r = 0; shots.length && shots.length < MIN_SHOTS; r++) shots = [...shots, { ...shots[r % shots.length], again: true }]
  // camera: alternate push-in / pull-out, a tighter crop on repeats, so no two neighbours move the same way
  return shots.map((s, i) => {
    const push = i % 2 === 0
    const tight = s.again ? 0.18 : 0
    return { ...s, z0: +(push ? 1.0 + tight : 1.12 + tight).toFixed(2), z1: +(push ? 1.12 + tight : 1.0 + tight).toFixed(2), ox: [50, 42, 58][i % 3], oy: [45, 55, 50][i % 3] }
  })
}

export const totalSeconds = (shots) => shots.length * SHOT + BRAND + ENDCARD

// On-screen text: short, no emoji (the render box has no emoji font), no prices, no Durg, max length per line.
export function cleanLine(s, max = 18) {
  let t = String(s ?? '').replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').replace(/₹\s*\d[\d,.]*|\b\d+\s*(rs|rupaye|rupees)\b/gi, '')
  t = t.replace(/durg[\s–-]*/gi, '').replace(/\s+/g, ' ').trim()
  if (t.length > max) t = t.slice(0, max).replace(/\s+\S*$/, '').trim()
  return t
}

export const FALLBACK = [
  { a: 'Full load', b: 'taiyaar' },
  { a: 'Roz subah', b: 'loading' },
  { a: 'Seedha aapki', b: 'dukaan tak' },
  { a: 'Wholesale', b: 'best rate pe' },
  { a: 'Har maal', b: 'ek call pe' },
]
export const FALLBACK_HOOK = { small: 'MarginMart se', a: 'AAJ KA', b: 'MAAL', c: 'taiyaar hai' }

/** Merge the AI's answer with safe defaults. ai = { hook:{small,a,b,c}, cards:[{a,b,chips?}], brand, caption } */
export function buildText(shots, ai) {
  const h = ai?.hook ?? {}
  const hook = { small: cleanLine(h.small, 22) || FALLBACK_HOOK.small, a: cleanLine(h.a, 9).toUpperCase() || FALLBACK_HOOK.a, b: cleanLine(h.b, 9).toUpperCase() || FALLBACK_HOOK.b, c: cleanLine(h.c, 16) }
  const cards = Array.isArray(ai?.cards) ? ai.cards : []
  const out = shots.map((s, i) => {
    if (i === 0) return { ...s, text: hook }
    const c = cards[i - 1] ?? FALLBACK[(i - 1) % FALLBACK.length]
    const chips = Array.isArray(c.chips) ? c.chips.map((x) => cleanLine(x, 14)).filter(Boolean).slice(0, 3) : []
    return { ...s, text: { a: cleanLine(c.a, 14) || FALLBACK[(i - 1) % FALLBACK.length].a, b: cleanLine(c.b, 16) || FALLBACK[(i - 1) % FALLBACK.length].b, chips } }
  })
  const brand = { small: cleanLine(ai?.brand?.small, 24) || 'Har din, har dukaan', b: cleanLine(ai?.brand?.b, 16) || 'Daily delivery' }
  return { shots: out, brand }
}

/** Voiceover line: speakable Hinglish, no prices/Durg, max ~9 words. */
export function cleanVo(s) {
  const t = cleanLine(s, 80).replace(/[#*_]/g, '')
  return t.split(' ').slice(0, 9).join(' ')
}
// spoken digit by digit so the TTS doesn't read it as one big number
export const VO_END = 'Order karein: 9 6 3 0 0, 1 2 6 3 6.'

/** Voice lines with their start times: one per shot, the brand line, the phone line on the end card. */
export function voLines(shots, ai) {
  const v = Array.isArray(ai?.vo) ? ai.vo : []
  const out = shots.map((_, i) => ({ at: i * SHOT + 0.15, slot: SHOT - 0.2, text: cleanVo(v[i]) })).filter((x) => x.text)
  const brandAt = shots.length * SHOT
  out.push({ at: brandAt + 0.2, slot: BRAND - 0.3, text: cleanVo(ai?.vo_brand) || 'MarginMart, Bhilai mein daily delivery.' })
  out.push({ at: brandAt + BRAND + 0.4, slot: ENDCARD - 0.6, text: VO_END })
  return out
}

export function reelPrompt(note, n) {
  return [
    'You are the senior social media manager and video editor of MarginMart (by K.D. Foods), a wholesale distributor in Bhilai, India.',
    'It sells drinks (Pepsi, 7UP, Mirinda, Mountain Dew, Sting, Slice, Tropicana, Nimbooz, Gatorade), Aquafina water, Creambell milk drinks and more. Never call it a PepsiCo distributor. Never mention snacks. Never write "cold drinks" alone. Say Bhilai, never Durg. No prices, no scheme amounts.',
    'Readers: kirana and shop owners in Bhilai, watching a Reel on mute. The Reel is cut from the photos/clips attached, one image per shot, in order.',
    note ? `The owner wrote with the media: "${note}"` : 'The owner wrote nothing; read the images.',
    `Write on-screen text in simple Hinglish (Hindi in English letters). Shot 1 is the hook and must stop the scroll in 1 second: say what is special in THIS footage (new truck, fresh stock, big load, new item...). Lines are very short.`,
    `Return JSON: {"hook":{"small":"2-3 words","a":"1 word, max 8 letters","b":"1 word, max 8 letters","c":"2-3 words"},` +
    `"cards":[${n - 1} items, one per shot 2..${n}: {"a":"1-3 words","b":"1-3 words","chips":["optional, up to 3 product names you can SEE in that image"]}],` +
    `"brand":{"small":"3-4 words","b":"2 words"},"vo":[{n} voiceover lines, one per shot, each 4-7 words so it fits in 2 seconds, spoken Hinglish like a friendly dealer talking to shopkeepers, together one flowing message about what is shown],"vo_brand":"one line, max 7 words, e.g. MarginMart, Bhilai mein daily delivery","caption":"Instagram/Facebook caption in Hinglish, 2-4 short lines, 1-3 emojis, ends with: 📞 Order: 96300 12636 and 4-6 hashtags incl. #Bhilai #MarginMart"}`,
    'Only describe what is really in the images. Do not invent offers.',
  ].join('\n')
}

// Telegram preview buttons for an edited Reel
export const reelButtons = (id) => ({ inline_keyboard: [
  [{ text: '✅ FB + Insta (7:30 PM)', callback_data: `sp:ok:${id}` }, { text: '⚡ Abhi daalo', callback_data: `sp:now:${id}` }],
  [{ text: '📘 Sirf FB · Insta main khud (music ke saath)', callback_data: `sp:fb:${id}` }],
  [{ text: '❌ Mat daalo', callback_data: `sp:no:${id}` }],
] })
