// Pure helpers for the Reel editor (unit-tested in plan.test.mjs). No I/O here.
// Owner, 13 Nov 2026: everything sent goes into the media library; each batch becomes SEVERAL Reels that mix the new
// footage with older library clips, each Reel in a different editing style, all with a Hinglish voiceover.
export const BRAND = 2, ENDCARD = 4, FPS = 30, BEAT = 0.5       // 120 BPM: every cut lands on a half-second beat
export const MIN_SHOTS = 4, MAX_SHOTS = 6, MAX_REELS = 3

// Three edits that look and feel different (studied from the opus-5.5 gallery footage recipes: one accent colour,
// masked type, cuts on the beat, no cheap effects). Each has its own pace, type, transitions and story angle.
export const STYLES = {
  // min/max = shot length in seconds. Shots also always outlast their voice line by a breath (timeShots).
  punch: { name: 'Fast cut', min: 3, max: 4, accent: '#3ddc6a', angle: 'SPEED and SCALE: how much maal, how fast it moves out. Short punchy hype lines.' },
  story: { name: 'Voice story + subtitles', min: 3.5, max: 5, accent: '#ffd23f', angle: 'TRUST STORY told by the dealer himself: our daily routine, we load early, we deliver on time, shopkeepers rely on us. Warm, personal, like talking to a shopkeeper.' },
  frame: { name: 'Clean frame + list', min: 3, max: 4, accent: '#ff5a36', angle: 'RANGE LIST: what a shopkeeper can get from one call (brands you can see, water, milk drinks, full peti, daily delivery). Each shot is one numbered point.' },
}
export const STYLE_KEYS = Object.keys(STYLES)

/** Styles for n new Reels: rotate through all three, starting after the style used most recently. */
export function pickStyles(n, recent = []) {
  const last = recent.find((s) => STYLE_KEYS.includes(s))
  const start = last ? (STYLE_KEYS.indexOf(last) + 1) % STYLE_KEYS.length : 0
  return Array.from({ length: n }, (_, i) => STYLE_KEYS[(start + i) % STYLE_KEYS.length])
}

/** Usable 2-4 s windows in one item: a video gives one window per ~2.6 s of footage (max 6), a photo gives one. */
export function windows(item) {
  if (item.kind === 'image') return [0]
  const d = Math.max(0, Number(item.duration) || 0)
  const k = Math.max(1, Math.min(6, Math.floor((d - 0.6) / 4)))     // shots are 3-5 s now: one per ~4 s of footage
  const span = Math.max(0, d - 0.6 - 3.5)
  return Array.from({ length: k }, (_, i) => +(0.3 + (k > 1 ? (span * i) / (k - 1) : Math.min(span, 0.3))).toFixed(2))
}

/**
 * fresh: new items [{ id, kind, duration }] (sent in this batch); old: library items [{ id, kind, duration, uses }].
 * Returns [{ style, shots: [{ id, from, fresh, again? }] }]: 1-3 Reels, each 4-6 shots, every Reel opens on a
 * different new clip, no window of the new footage is used twice in one batch, gaps are filled with the
 * least-used older library footage. recent = styles of the last posts, newest first.
 */
export function mixReels(fresh, old = [], recent = []) {
  if (!fresh.length) return []
  const pool = fresh.map((it) => windows(it).map((from, w) => ({ id: it.id, from, w, fresh: true })))
  const supply = pool.reduce((a, p) => a + p.length, 0)
  const n = Math.min(MAX_REELS, supply >= 9 ? 3 : supply >= 4 ? 2 : 1)   // short Reels are topped up from the library
  // deal windows across Reels: take the w-th window of every source in turn, so each Reel sees several sources
  const order = []
  for (let w = 0; order.length < supply; w++) for (const p of pool) if (p[w]) order.push(p[w])
  const reels = Array.from({ length: n }, () => [])
  // each Reel's opener: a different new source (rotated), its first window
  order.forEach((s, k) => reels[k % n].push(s))
  for (const [r, shots] of reels.entries()) {
    const lead = shots.findIndex((s) => s.id === fresh[r % fresh.length].id)
    if (lead > 0) shots.unshift(...shots.splice(lead, 1))
    shots.splice(MAX_SHOTS)
  }
  // fill short Reels from the library: least used first, videos before photos, a fresh offset per use
  const lib = [...old].sort((a, b) => (a.uses ?? 0) - (b.uses ?? 0) || (a.kind === 'video' ? -1 : 1) - (b.kind === 'video' ? -1 : 1))
  let li = 0
  for (const shots of reels) {
    for (let guard = 0; shots.length < MIN_SHOTS && lib.length && guard < lib.length; guard++, li++) {
      const it = lib[li % lib.length], ws = windows(it)
      const from = ws[((it.uses ?? 0) + Math.floor(li / lib.length)) % ws.length]
      if (!shots.some((s) => s.id === it.id && s.from === from)) shots.push({ id: it.id, from, fresh: false })
    }
    // still short (tiny library): reuse this Reel's own footage with a tighter crop
    for (let r = 0; shots.length && shots.length < MIN_SHOTS; r++) shots.push({ ...shots[r % shots.length], again: true })
  }
  const styles = pickStyles(n, recent)
  return reels.map((shots, r) => ({ style: styles[r], shots: camera(shots) }))
}

// camera: alternate push-in / pull-out, a tighter crop on repeats, so no two neighbours move the same way
function camera(shots) {
  return shots.map((s, i) => {
    const push = i % 2 === 0, tight = s.again ? 0.18 : 0
    return { ...s, z0: +(push ? 1.0 + tight : 1.12 + tight).toFixed(2), z1: +(push ? 1.12 + tight : 1.0 + tight).toFixed(2), ox: [50, 42, 58][i % 3], oy: [45, 55, 50][i % 3] }
  })
}

/**
 * Shot lengths follow the voice: each shot lasts as long as its spoken line + a breath, snapped up to the beat grid
 * and kept inside the style's range. voLen[i] = seconds of shot i's voice line (0 = none). Adds at/len to each shot.
 */
export function timeShots(shots, voLen, style) {
  const st = STYLES[style] ?? STYLES.punch
  let at = 0
  const out = shots.map((s, i) => {
    const want = Math.ceil(((voLen[i] || 0) + 0.15 + 0.45) / BEAT) * BEAT     // start offset + line + a breath before the cut
    const len = Math.max(st.min, want)        // never shorter than its voice line, or two lines would overlap
    if (len > st.max) console.log(`shot ${i + 1}: voice needs ${len} s (style max ${st.max})`)
    const r = { ...s, at, len }; at += len; return r
  })
  return { shots: out, brandAt: at, endAt: at + BRAND }
}

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
export const FALLBACK_VO = ['Aaj ka maal taiyaar hai', 'Roz subah gaadi load hoti hai', 'Seedha aapki dukaan tak', 'Har peti time pe pahunchti hai', 'Bas ek call kijiye', 'Wholesale rate pe poora range']

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

/** Voiceover line: speakable Hinglish, no prices/Durg, max words depend on the style's shot length. */
// Never cut a sentence: a line that is too long is dropped (the fallback line is used), not chopped mid-thought.
export function cleanVo(s, words = 14) {
  const t = String(s ?? '').replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}#*_]/gu, '').replace(/₹\s*\d[\d,.]*/g, '').replace(/durg[\s–-]*/gi, '').replace(/\s+/g, ' ').trim()
  if (!t || t.split(' ').length > words) return ''
  return /[.!?।]$/.test(t) ? t : t + '.'
}
// end-card call to action. Instagram/Facebook: follow + comment RATE (the bot DMs the rate list). WhatsApp: join the group.
// kept short: the end card holds until the last word, and a long hold loses viewers
export const VO_END = { ig: 'Follow karein, comment mein RATE likhiye.', wa: 'QR scan karke group join karein.' }

/** Voice text per shot (never empty: a Reel always has a voice), plus the brand line and the two end lines. */
export function voTexts(n, ai, style) {
  const v = Array.isArray(ai?.vo) ? ai.vo : []
  const words = style === 'story' ? 14 : 10
  return {
    shots: Array.from({ length: n }, (_, i) => cleanVo(v[i], words) || FALLBACK_VO[(i + 2 * Math.max(0, STYLE_KEYS.indexOf(style))) % FALLBACK_VO.length]),
    brand: cleanVo(ai?.vo_brand) || 'MarginMart, Bhilai mein daily delivery.',
    end: VO_END,
  }
}

export function reelPrompt(note, n, style, siblings = []) {
  const st = STYLES[style] ?? STYLES.punch
  const secs = style === 'story' ? '3-4' : '2.5-3'
  return [
    'You are the senior social media manager and video editor of MarginMart (by K.D. Foods), a wholesale distributor in Bhilai, India.',
    'It sells drinks (Pepsi, 7UP, Mirinda, Mountain Dew, Sting, Slice, Tropicana, Nimbooz, Gatorade), Aquafina water, Creambell milk drinks and more. Never call it a PepsiCo distributor. Never mention snacks. Never write "cold drinks" alone. Say Bhilai, never Durg. No prices, no scheme amounts.',
    'Readers: kirana and shop owners in Bhilai, watching a Reel, often on mute. The Reel is cut from the images attached, one image per shot, in order.',
    note ? `The owner wrote with the media: "${note}"` : 'The owner wrote nothing; read the images.',
    `This Reel's angle: ${st.angle}`,
    siblings.length ? `Other Reels made from the same footage already use these hooks, so yours must be clearly different: ${siblings.map((s) => JSON.stringify(s)).join(', ')}` : '',
    `Write on-screen text in simple Hinglish (Hindi in English letters). Shot 1 is the hook and must stop the scroll in 1 second: say what is special in THIS footage (new truck, fresh stock, big load, new item...). Lines are very short.`,
    `Return JSON: {"hook":{"small":"2-3 words","a":"1 word, max 8 letters","b":"1 word, max 8 letters","c":"2-3 words"},` +
    `"cards":[${n - 1} items, one per shot 2..${n}: {"a":"1-3 words","b":"1-3 words","chips":["optional, up to 3 product names you can SEE in that image"]}],` +
    `"brand":{"small":"3-4 words","b":"2 words"},"vo":[${n} voiceover lines, one per shot. Each line is ONE COMPLETE short sentence (${style === 'story' ? '6-10' : '4-7'} words, never more), spoken calmly in about ${secs} seconds, Hinglish like a friendly dealer talking to shopkeepers, together one flowing message that follows the angle],"vo_brand":"one line, max 7 words, e.g. MarginMart, Bhilai mein daily delivery","caption":"Instagram/Facebook caption in Hinglish, 2-4 short lines that follow the angle, 1-3 emojis, second-last line exactly: 👉 Follow karein aur comment mein RATE likhein, rate list DM mein bhejenge 📩 ; last line: 📞 Order: 96300 12636 ; then 4-6 hashtags incl. #Bhilai #MarginMart"}`,
    'Only describe what is really in the images. Do not invent offers.',
  ].filter(Boolean).join('\n')
}

// Telegram preview buttons for an edited Reel. ✅ queues it: Reels go out one per evening at 7:30 PM, oldest first.
// waUrl: the WhatsApp cut (group QR on the end card) is NOT sent as a second video; it is a link button instead.
export const reelButtons = (id, waUrl) => ({ inline_keyboard: [
  [{ text: '✅ Queue (roz 7:30 PM, ek-ek)', callback_data: `sp:ok:${id}` }, { text: '⚡ Abhi daalo', callback_data: `sp:now:${id}` }],
  [{ text: '📘 Sirf FB · Insta main khud (music ke saath)', callback_data: `sp:fb:${id}` }],
  ...(waUrl ? [[{ text: '📲 WhatsApp Status wala video (QR ke saath)', url: waUrl }]] : []),
  [{ text: '❌ Mat daalo', callback_data: `sp:no:${id}` }],
] })
