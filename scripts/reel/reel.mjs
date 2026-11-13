// Auto-edit Reels from the media library (GitHub Actions, .github/workflows/reel.yml). Owner, 11 + 13 Nov 2026.
// 1. Wait until the owners stop sending (newest fresh item >= 90 s old), then claim every fresh item (photo or video).
// 2. Mix: the new footage is split into windows and dealt across 1-3 Reels; short Reels are topped up with the
//    least-used older clips from the library (media_use counts every use). Each Reel gets a different editing style
//    (punch / story / frame, rotated after the last posted style) and a different story angle.
// 3. Per Reel: AI (Gemini, sees one frame per shot) writes hook, cards, voiceover and caption for that angle;
//    voiceover (Gemini TTS, Edge TTS as free fallback) is made FIRST and the shot lengths follow the voice.
// 4. Playwright seeks template.html frame by frame -> final.mp4 (music + voice, phone number end) / manual.mp4
//    (voice only, Insta by hand) / wa.mp4 (WhatsApp group QR end).
// 5. Each Reel is its own preview in the KD group with ✅ ⚡ 📘 ❌. ✅ queues it: one Reel goes out each evening.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { db, env, say } from '../scheme-bot/lib.mjs'
import { buildText, mixReels, reelButtons, reelPrompt, timeShots, voTexts, FPS, STYLES } from './plan.mjs'
import { finishCaption, fallbackCaption } from '../ops/media.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const WORK = path.join(HERE, 'work'); fs.rmSync(WORK, { recursive: true, force: true }); fs.mkdirSync(WORK, { recursive: true })
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'] }).toString()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const QUIET = Number(process.env.QUIET_SECONDS || 90)
const cache = new Map()          // voice lines by engine + text, shared by the Reels of one batch
let lastTts = 0                  // Gemini TTS free tier: 3 requests a minute
const probe = (src) => Number(sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src]).trim()) || 0
// local test: LOCAL=a.mp4,b.jpg node scripts/reel/reel.mjs  (no database, no Telegram; files land in scripts/reel/work)
const LOCAL = process.env.LOCAL ? process.env.LOCAL.split(',').map((x, i) => ({ id: `local${i}`, local: x, url: x, kind: /\.(jpe?g|png|webp)$/i.test(x) ? 'image' : 'video', note: process.env.NOTE || '', created_at: new Date().toISOString() })) : null

// ---- 1. wait for the batch to settle, then claim it ----
let fresh = LOCAL ?? []
for (let i = 0; !LOCAL && i < 12; i++) {
  fresh = await db('media_library?edited_into=is.null&order=created_at&select=*')
  if (!fresh.length) { console.log('nothing to edit'); process.exit(0) }
  const age = (Date.now() - Date.parse(fresh.at(-1).created_at)) / 1000
  if (age >= QUIET) break
  console.log(`newest item ${age.toFixed(0)} s old, waiting`); await sleep(Math.max(5, QUIET - age) * 1000)
}
const batchId = randomUUID()
const madeBy = fresh.map((x) => x.who).filter(Boolean)[0] ?? null
if (!LOCAL) await db('social_post', { method: 'POST', body: JSON.stringify({ id: batchId, kind: 'reel', source_id: batchId, media_type: 'video', image_url: '', caption: '', status: 'draft', made_by: madeBy }) })
const claimed = LOCAL ?? await db(`media_library?id=in.(${fresh.map((x) => x.id).join(',')})&edited_into=is.null`, { method: 'PATCH', body: JSON.stringify({ edited_into: batchId }) })
if (!claimed.length) { await db(`social_post?id=eq.${batchId}`, { method: 'DELETE' }); console.log('another run took them'); process.exit(0) }
claimed.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
console.log('batch', batchId, claimed.length, 'new items')

const made = []
try {
  // ---- 2. durations, library candidates, the mix ----
  for (const m of claimed) m.duration = m.kind === 'video' ? probe(m.local ?? m.url) : 0
  let old = []
  if (!LOCAL) {
    const lib = await db(`media_library?edited_into=not.is.null&edited_into=neq.${batchId}&order=created_at.desc&limit=40&select=id,kind,url,note,created_at`)
    const uses = await db(`media_use?media_id=in.(${lib.map((x) => x.id).join(',') || '00000000-0000-0000-0000-000000000000'})&select=media_id`)
    for (const it of lib) it.uses = uses.filter((u) => u.media_id === it.id).length
    old = lib.sort((a, b) => a.uses - b.uses).slice(0, 8)
    for (const it of old) { try { it.duration = it.kind === 'video' ? probe(it.url) : 0 } catch { it.duration = 0 } }
    old = old.filter((x) => x.kind === 'image' || x.duration > 3)
  }
  const recent = LOCAL ? [process.env.AFTER_STYLE].filter(Boolean) : (await db('social_post?kind=eq.reel&style=not.is.null&order=created_at.desc&limit=3&select=style')).map((x) => x.style)
  const plans = mixReels(claimed, old, recent)
  console.log('plan', JSON.stringify(plans.map((p) => ({ style: p.style, shots: p.shots.map((s) => `${String(s.id).slice(0, 6)}@${s.from}${s.fresh ? '' : '(lib)'}`) }))))

  // frames: every source used by any Reel, 30 fps, 1080x1920 (non-vertical media gets a blurred fill)
  const FILL = 'split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=40:2,eq=brightness=-0.08[bg];' +
    '[b]scale=1080:1920:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,unsharp=5:5:0.5,eq=contrast=1.06:saturation=1.15'
  const byId = new Map([...claimed, ...old].map((x) => [x.id, x]))
  const src = new Map()
  for (const id of new Set(plans.flatMap((p) => p.shots.map((s) => s.id)))) {
    const m = byId.get(id), k = src.size
    const file = path.join(WORK, `src${k}.${m.kind === 'video' ? 'mp4' : 'jpg'}`)
    if (m.local) fs.copyFileSync(m.local, file); else fs.writeFileSync(file, Buffer.from(await (await fetch(m.url)).arrayBuffer()))
    const dir = path.join(WORK, `m${k}`); fs.mkdirSync(dir)
    if (m.kind === 'video') sh('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', `fps=${FPS},${FILL}`, '-q:v', '3', path.join(dir, '%04d.jpg')])
    else sh('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', FILL, '-frames:v', '1', '-q:v', '2', path.join(dir, '0001.jpg')])
    src.set(id, { dir: `work/m${k}`, n: fs.readdirSync(dir).length, kind: m.kind, duration: m.duration, note: m.note })
  }
  const note = [...new Set(claimed.map((x) => x.note).filter(Boolean))].join(' / ').slice(0, 500)

  const b = await chromium.launch()
  const page = await b.newPage({ viewport: { width: 1080, height: 1920 } })
  await page.goto(pathToFileURL(path.join(HERE, 'template.html')).href)
  await page.evaluate(() => document.fonts.ready)
  const hooks = []
  for (const [r, plan] of plans.entries()) {
    const postId = r === 0 ? batchId : randomUUID()
    try { made.push(await editOne(plan, postId, r, plans.length)) } catch (e) {
      console.log('reel', r + 1, 'failed', e.stack)
      if (r > 0) await db(`social_post?id=eq.${postId}`, { method: 'PATCH', body: JSON.stringify({ status: 'failed', error: String(e.message).slice(0, 300) }) }).catch(() => {})
      if (r === 0) { await db(`social_post?id=eq.${batchId}`, { method: 'PATCH', body: JSON.stringify({ status: 'failed', error: String(e.message).slice(0, 300) }) }).catch(() => {}) }
    }
  }
  await b.close()
  if (!made.length) throw new Error('koi bhi Reel nahi bani')
  if (!LOCAL && made.length > 1) await say(`🎬 ${claimed.length} nayi cheezon se ${made.length} alag Reels bani (${made.map((x) => STYLES[x.style].name).join(', ')}). Har ek ka ✅ dabao: roz 7:30 PM ek Reel jayegi, sabse purani pehle.`)
  console.log('done', JSON.stringify(made))

  // ---- one Reel: text, voice, timing, render, mix, upload, preview ----
  async function editOne(plan, postId, r, of) {
    const W = path.join(WORK, `r${r}`); fs.mkdirSync(W)
    let shots = plan.shots.map((s) => {
      const m = src.get(s.id), len = 4
      const from = m.kind === 'image' ? 0 : Math.max(0, Math.min(s.from, m.duration - len - 0.15))
      return { ...s, from, dir: m.dir, n: m.n }
    })
    // AI text for this angle; it also sees the hooks already used by the other Reels of this batch
    let ai = null
    try {
      const parts = [{ text: reelPrompt(note, shots.length, plan.style, hooks) }]
      for (const [k, s] of shots.entries()) {
        const f = path.join(HERE, s.dir, String(Math.min(s.n, Math.floor((s.from + 1) * FPS) + 1)).padStart(4, '0') + '.jpg')
        const small = path.join(W, `ai-${k}.jpg`)
        sh('ffmpeg', ['-v', 'error', '-y', '-i', f, '-vf', 'scale=432:-2', small])
        parts.push({ inline_data: { mime_type: 'image/jpeg', data: fs.readFileSync(small).toString('base64') } })
      }
      ai = await askVision(parts)
      console.log('ai', r + 1, JSON.stringify(ai).slice(0, 500))
    } catch (e) { console.log('ai failed, using defaults:', e.message) }
    hooks.push(ai?.hook ?? {})
    const text = buildText(shots, ai)
    const vt = voTexts(shots.length, ai, plan.style)
    // voice first: shot lengths follow the spoken lines
    const vo = await synthAll([...vt.shots, vt.brand, vt.end.ig, vt.end.wa], W)
    const timed = timeShots(text.shots, vo.slice(0, shots.length).map((x) => x.len), plan.style)
    shots = timed.shots.map((s, k) => ({ ...s, vo: { text: vt.shots[k], at: s.at + 0.15, len: vo[k].len } }))
    const { brandAt, endAt } = timed
    const placed = [
      ...shots.map((s, k) => ({ ...vo[k], at: s.at + 0.15 })),
      { ...vo[shots.length], at: brandAt + 0.2 },
      { ...vo[shots.length + 1], at: endAt + 0.4, only: 'ig' },
      { ...vo[shots.length + 2], at: endAt + 0.4, only: 'wa' },
    ]
    const lastWord = Math.max(...placed.map((x) => x.at + x.len))
    const T = Math.max(endAt + 4, Math.ceil((lastWord + 0.8) * 2) / 2)
    console.log('reel', r + 1, plan.style, 'length', T, 's')
    const full = { style: plan.style, accent: STYLES[plan.style].accent, shots, brand: text.brand, brandAt, endAt }
    fs.writeFileSync(path.join(W, 'plan.json'), JSON.stringify(full, null, 1))

    // render: the WhatsApp cut only differs on the end card
    for (const d of ['ig', 'wa']) fs.mkdirSync(path.join(W, d))
    for (const which of ['ig', 'wa']) {
      await page.evaluate(([pl, w]) => window.init(pl, w), [full, which])
      await page.waitForTimeout(400)
      const from = which === 'ig' ? 0 : Math.floor(endAt * FPS)
      for (let f = from; f < T * FPS; f++) {
        await page.evaluate((t) => window.seek(t), f / FPS)
        await page.screenshot({ path: path.join(W, which, String(f).padStart(4, '0') + '.jpg'), type: 'jpeg', quality: 90 })
      }
    }
    for (let f = 0; f < Math.floor(endAt * FPS); f++) fs.copyFileSync(path.join(W, 'ig', String(f).padStart(4, '0') + '.jpg'), path.join(W, 'wa', String(f).padStart(4, '0') + '.jpg'))
    const cuts = shots.slice(1).map((s) => s.at.toFixed(2)).join(',')
    sh(process.env.PYTHON || 'python3', [path.join(HERE, 'music.py'), path.join(W, 'music.wav'), String(T), String(brandAt), cuts, plan.style])
    const enc = (dir, out) => sh('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', path.join(W, dir, '%04d.jpg'),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', path.join(W, out)])
    enc('ig', 'silent-ig.mp4'); enc('wa', 'silent-wa.mp4')
    const voIg = mixVo(placed, T, 'ig', W), voWa = mixVo(placed, T, 'wa', W)
    const music = path.join(W, 'music.wav')
    const duckGain = plan.style === 'story' ? 0.4 : 0.55       // the story edit is voice-led: music sits lower
    const bed = (v, out) => sh('ffmpeg', ['-v', 'error', '-y', '-i', v, '-i', music, '-filter_complex',
      `[1:a]volume=${duckGain}[mu];[0:a]asplit[v1][v2];[mu][v1]sidechaincompress=threshold=0.03:ratio=8:attack=15:release=350[duck];[duck][v2]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]`,
      '-map', '[a]', '-c:a', 'aac', '-b:a', '160k', '-t', String(T), out])
    const fullIg = path.join(W, 'full-ig.m4a'), fullWa = path.join(W, 'full-wa.m4a')
    bed(voIg, fullIg); bed(voWa, fullWa)
    const mux = (v, a, out) => sh('ffmpeg', ['-v', 'error', '-y', '-i', path.join(W, v), '-i', a, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-c:v', 'copy', '-movflags', '+faststart', path.join(W, out)])
    mux('silent-ig.mp4', fullIg, 'final.mp4'); mux('silent-wa.mp4', fullWa, 'wa.mp4')
    mux('silent-ig.mp4', voIg, 'manual.mp4')          // for Instagram by hand: voice only, Instagram's music goes under it

    let caption = finishCaption(ai?.caption)
    if (!ai?.caption || caption.length < 60) caption = fallbackCaption(note, 'video')
    if (!/comment/i.test(caption)) caption = caption.replace(/\n\n#/, '\n👉 Follow karein aur comment mein RATE likhein, rate list DM mein bhejenge 📩\n\n#')
    if (LOCAL) { fs.copyFileSync(path.join(W, 'final.mp4'), path.join(WORK, `reel${r + 1}-${plan.style}.mp4`)); return { style: plan.style, T, caption, voice: vo[0].engine } }

    // store, preview
    if (r > 0) await db('social_post', { method: 'POST', body: JSON.stringify({ id: postId, kind: 'reel', source_id: postId, media_type: 'video', image_url: '', caption: '', status: 'draft', made_by: madeBy }) })
    const put = async (name) => {
      const key = `reels/${postId}/${name}`
      const res = await fetch(`${env('SUPABASE_URL')}/storage/v1/object/social-media/${key}`, { method: 'POST', headers: { apikey: env('SUPABASE_SERVICE_KEY'),
        Authorization: `Bearer ${env('SUPABASE_SERVICE_KEY')}`, 'Content-Type': 'video/mp4', 'x-upsert': 'true' }, body: fs.readFileSync(path.join(W, name)) })
      if (!res.ok) throw new Error(`upload ${res.status}: ${(await res.text()).slice(0, 200)}`)
      return `${env('SUPABASE_URL')}/storage/v1/object/public/social-media/${key}`
    }
    const url = await put('final.mp4'), manual = await put('manual.mp4')
    await db(`social_post?id=eq.${postId}`, { method: 'PATCH', body: JSON.stringify({ image_url: url, manual_url: manual, caption, style: plan.style }) })
    await db('media_use?on_conflict=media_id,post_id,from_s', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify([...new Map(plan.shots.map((s) => [`${s.id}|${s.from}`, { media_id: s.id, post_id: postId, from_s: s.from, style: plan.style }])).values()]) })
    const nNew = new Set(plan.shots.filter((s) => s.fresh).map((s) => s.id)).size, nOld = new Set(plan.shots.filter((s) => !s.fresh).map((s) => s.id)).size
    const head = `🎬 Reel ${of > 1 ? `${r + 1}/${of} ` : ''}· ${STYLES[plan.style].name} · ${T} sec · 🎙 voiceover (${vo[0].engine})\n` +
      `${nNew} nayi${nOld ? ` + ${nOld} purani library se` : ''} clips/photos\n\n`
    const tail = '\n\n✏️ Caption badalna ho to is message ka reply karke naya likho.\n📘 = Facebook + Telegram abhi, Insta ke liye bina-music video milega.'
    const msg = await tgVideo(path.join(W, 'final.mp4'), (head + caption).slice(0, 1024 - tail.length) + tail, reelButtons(postId))
    await tgVideo(path.join(W, 'wa.mp4'), `📲 Reel ${of > 1 ? `${r + 1} ` : ''}WhatsApp Status / group ke liye (end me group ka QR). Ise seedha forward karo.`)
    await db('ops_log?on_conflict=job,key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ job: 'preview', key: postId, detail: { message_id: msg.message_id } }) })
    console.log('preview sent', postId)
    return { postId, style: plan.style, T }
  }
} catch (e) {
  // nothing made: give the media back to the library so the watchdog / next send retries it; tell the group
  if (LOCAL) throw e
  if (!made.length) {
    await db(`media_library?edited_into=eq.${batchId}`, { method: 'PATCH', body: JSON.stringify({ edited_into: null }) }).catch(() => {})
    await db(`social_post?id=eq.${batchId}`, { method: 'PATCH', body: JSON.stringify({ status: 'failed', error: String(e.message).slice(0, 300) }) }).catch(() => {})
    await say(`⚠️ Reel edit nahi ho paya: ${String(e.message).slice(0, 200)}. Media library me safe hai, watchdog dobara try karega.`).catch(() => {})
  }
  throw e
}

async function tgVideo(file, caption, keyboard) {
  const fd = new FormData()
  fd.append('chat_id', env('KD_CHAT_ID'))
  fd.append('video', new Blob([fs.readFileSync(file)], { type: 'video/mp4' }), path.basename(file))
  fd.append('supports_streaming', 'true'); fd.append('width', '1080'); fd.append('height', '1920')
  if (caption) fd.append('caption', caption.slice(0, 1024))
  if (keyboard) fd.append('reply_markup', JSON.stringify(keyboard))
  const r = await fetch(`https://api.telegram.org/bot${env('KD_BOT_TOKEN')}/sendVideo`, { method: 'POST', body: fd })
  const j = await r.json(); if (!j.ok) throw new Error(`telegram sendVideo: ${JSON.stringify(j).slice(0, 300)}`)
  return j.result
}

// Gemini with images (free key). Same model fallback list as scheme-bot/lib.mjs askJson.
async function askVision(parts) {
  const key = env('GEMINI_FREE_KEY', false)
  if (!key) throw new Error('no GEMINI_FREE_KEY')
  for (const model of ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest']) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.7 } }) })
        const j = await r.json()
        const text = j?.candidates?.[0]?.content?.parts?.[0]?.text
        if (text) return JSON.parse(text)
        console.log('gemini', model, r.status, JSON.stringify(j).slice(0, 200))
        if (r.status !== 503 && r.status !== 429) break
      } catch (e) { console.log('gemini error', model, e.message) }
      await sleep(5000)
    }
  }
  throw new Error('vision AI unavailable')
}

// ---- voiceover. One voice per Reel: Gemini TTS (free tier, 3 requests/minute) for every line; if any line fails,
// the whole Reel is voiced again with Edge TTS (free, no key) so the voice never changes mid-Reel. Lines are cached
// by text across the batch (the end-card lines repeat). Silence is trimmed; nothing is sped up (shots follow the voice).
async function synthAll(lines, W) {
  const key = env('GEMINI_FREE_KEY', false)
  for (const engine of key && process.env.TTS !== 'edge' ? ['gemini', 'edge'] : ['edge']) {
    try {
      const out = []
      for (const [i, text] of lines.entries()) {
        const ck = `${engine}|${text}`
        if (!cache.has(ck)) {
          const raw = path.join(W, `vo${i}-${engine}.raw`)
          if (engine === 'gemini') await ttsGemini(key, text, raw); else ttsEdge(text, raw)
          const f = path.join(W, `vo${i}-${engine}.wav`)
          sh('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,aresample=48000,aformat=channel_layouts=stereo', f])
          cache.set(ck, { f, len: probe(f), engine })
        }
        out.push(cache.get(ck))
        console.log('vo', engine, i, JSON.stringify(text), cache.get(ck).len.toFixed(2), 's')
      }
      return out
    } catch (e) { console.log('voice', engine, 'failed:', e.message) }
  }
  throw new Error('voiceover nahi bana (Gemini aur Edge dono fail)')
}
function ttsEdge(text, file) {
  sh(process.env.PYTHON || 'python3', ['-m', 'edge_tts', '--voice', 'hi-IN-MadhurNeural', '--rate=+8%', '--text', text, '--write-media', file])
}
function mixVo(all, T, which, W) {
  const parts = all.filter((x) => !x.only || x.only === which)
  const out = path.join(W, `vo-${which}.wav`)
  const fc = parts.map((x, i) => `[${i}:a]adelay=${Math.round(x.at * 1000)}|${Math.round(x.at * 1000)}[v${i}]`).join(';') +
    `;${parts.map((_, i) => `[v${i}]`).join('')}amix=inputs=${parts.length}:normalize=0,apad,atrim=0:${T},volume=1.6,alimiter=limit=0.95[o]`
  sh('ffmpeg', ['-v', 'error', '-y', ...parts.flatMap((x) => ['-i', x.f]), '-filter_complex', fc, '-map', '[o]', out])
  return out
}
// free tier allows 3 TTS requests a minute: keep 21 s between calls, and on 429 wait as long as Google asks
async function ttsGemini(key, text, file) {
  let last
  for (const model of ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts']) {
    for (let attempt = 0; attempt < 3; attempt++) {
      await sleep(Math.max(0, lastTts + 21000 - Date.now())); lastTts = Date.now()
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ model, response_format: { type: 'audio' }, generation_config: { speech_config: [{ voice: 'Charon' }] },
          input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata',
            style: 'confident Indian male, natural Hinglish, warm and energetic, a Bhilai wholesale dealer talking to shopkeepers, quick pace' }] }] }] }) })
      const j = await r.json().catch(() => ({}))
      for (const s of j.steps ?? []) for (const c of s.content ?? []) if (c.data && /audio/.test(c.mime_type ?? c.type ?? '')) { fs.writeFileSync(file, Buffer.from(c.data, 'base64')); return }
      last = `${model} ${r.status} ${JSON.stringify(j).slice(0, 200)}`; console.log('tts', last)
      if (r.status !== 429 && r.status !== 503 && r.status !== 500) break
      const wait = Number(/retry in (\d+)/i.exec(JSON.stringify(j))?.[1] ?? 10)
      if (wait > 90) break                                    // daily quota gone: go straight to Edge
      await sleep((wait + 2) * 1000)
    }
  }
  throw new Error(`tts failed: ${last}`)
}
