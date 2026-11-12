// Auto-edit a Reel from the media library (GitHub Actions, .github/workflows/reel.yml). Owner, 11 Nov 2026.
// 1. Wait until the owners stop sending (newest fresh item >= 90 s old), then claim every fresh item (photo or video).
// 2. ffmpeg: frames at 30 fps, 1080x1920 (non-vertical media gets a blurred fill).
// 3. AI (Gemini, sees one frame per shot) writes the Hinglish hook, cards and caption; safe defaults if it fails.
// 4. Playwright seeks template.html frame by frame -> three files:
//      final.mp4  (music, ends on phone number)      -> Facebook + Instagram + Telegram channel after approval
//      manual.mp4 (same edit, no music)              -> owner posts on Instagram by hand with Instagram's music
//      wa.mp4     (music, ends on WhatsApp group QR) -> sent to the group for Status / forwarding
// 5. Preview in the KD group with ✅ ⚡ 📘 ❌ (api/_ops.js). Nothing is public before a tap.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { db, env, say } from '../scheme-bot/lib.mjs'
import { buildText, planShots, reelButtons, reelPrompt, totalSeconds, voLines, FPS, SHOT } from './plan.mjs'
import { finishCaption, fallbackCaption } from '../ops/media.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const WORK = path.join(HERE, 'work'); fs.rmSync(WORK, { recursive: true, force: true }); fs.mkdirSync(WORK, { recursive: true })
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'] }).toString()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const QUIET = Number(process.env.QUIET_SECONDS || 90)
// local test: LOCAL=a.mp4,b.jpg node scripts/reel/reel.mjs  (no database, no Telegram; files land in scripts/reel/work)
const LOCAL = process.env.LOCAL ? process.env.LOCAL.split(',').map((x) => ({ id: x, local: x, kind: /\.(jpe?g|png|webp)$/i.test(x) ? 'image' : 'video', note: process.env.NOTE || '', created_at: new Date().toISOString() })) : null

// ---- 1. wait for the batch to settle, then claim it ----
let fresh = LOCAL ?? []
for (let i = 0; !LOCAL && i < 12; i++) {
  fresh = await db('media_library?edited_into=is.null&order=created_at&select=*')
  if (!fresh.length) { console.log('nothing to edit'); process.exit(0) }
  const age = (Date.now() - Date.parse(fresh.at(-1).created_at)) / 1000
  if (age >= QUIET) break
  console.log(`newest item ${age.toFixed(0)} s old, waiting`); await sleep(Math.max(5, QUIET - age) * 1000)
}
const postId = randomUUID()
if (!LOCAL) await db('social_post', { method: 'POST', body: JSON.stringify({ id: postId, kind: 'reel', source_id: postId, media_type: 'video', image_url: '', caption: '', status: 'draft', made_by: fresh.map((x) => x.who).filter(Boolean)[0] ?? null }) })
const claimed = LOCAL ?? await db(`media_library?id=in.(${fresh.map((x) => x.id).join(',')})&edited_into=is.null`, { method: 'PATCH', body: JSON.stringify({ edited_into: postId }) })
if (!claimed.length) { await db(`social_post?id=eq.${postId}`, { method: 'DELETE' }); console.log('another run took them'); process.exit(0) }
claimed.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
console.log('editing', claimed.length, 'items into', postId)

try {
  // ---- 2. download + frames ----
  const FILL = 'split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=40:2,eq=brightness=-0.08[bg];' +
    '[b]scale=1080:1920:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,unsharp=5:5:0.5,eq=contrast=1.06:saturation=1.15'
  const items = []
  for (const [i, m] of claimed.entries()) {
    const src = path.join(WORK, `src${i}.${m.kind === 'video' ? 'mp4' : 'jpg'}`)
    if (m.local) fs.copyFileSync(m.local, src); else fs.writeFileSync(src, Buffer.from(await (await fetch(m.url)).arrayBuffer()))
    const dir = path.join(WORK, `m${i}`); fs.mkdirSync(dir)
    let duration = 0
    if (m.kind === 'video') {
      duration = Number(sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src]).trim()) || 0
      sh('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', `fps=${FPS},${FILL}`, '-q:v', '3', path.join(dir, '%04d.jpg')])
    } else sh('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', FILL, '-frames:v', '1', '-q:v', '2', path.join(dir, '0001.jpg')])
    items.push({ ...m, kind: m.kind, duration, dir: `work/m${i}`, n: fs.readdirSync(dir).length })
  }

  // ---- 3. shots + AI text ----
  const shots = planShots(items).map((s) => ({ ...s, dir: items[s.idx].dir, n: items[s.idx].n, from: items[s.idx].kind === 'image' ? 0 : s.from }))
  const note = claimed.map((x) => x.note).filter(Boolean).join(' / ').slice(0, 500)
  let ai = null
  try {
    const parts = [{ text: reelPrompt(note, shots.length) }]
    for (const s of shots) {
      const f = path.join(HERE, s.dir, String(Math.min(s.n, Math.floor((s.from + 1) * FPS) + 1)).padStart(4, '0') + '.jpg')
      const small = path.join(WORK, `ai-${parts.length}.jpg`)
      sh('ffmpeg', ['-v', 'error', '-y', '-i', f, '-vf', 'scale=432:-2', small])
      parts.push({ inline_data: { mime_type: 'image/jpeg', data: fs.readFileSync(small).toString('base64') } })
    }
    ai = await askVision(parts)
    console.log('ai', JSON.stringify(ai).slice(0, 600))
  } catch (e) { console.log('ai failed, using defaults:', e.message) }
  const plan = buildText(shots, ai)
  // voiceover first (Gemini TTS, free key), so the end card can be held until the last spoken word is out
  let voParts = null
  try { voParts = await synthVo(voLines(shots, ai)) } catch (e) { console.log('voiceover failed, music only:', e.message) }
  const lastWord = voParts ? Math.max(...voParts.map((x) => x.at + x.len)) : 0
  const T = Math.max(totalSeconds(shots), Math.ceil((lastWord + 0.8) * 2) / 2), brandAt = shots.length * SHOT
  console.log('length', T, 's, last word at', lastWord.toFixed(2))
  let caption = finishCaption(ai?.caption)
  if (!ai?.caption || caption.length < 60) caption = fallbackCaption(note, 'video')
  if (!/comment/i.test(caption)) caption = caption.replace(/\n\n#/, '\n👉 Follow karein aur comment mein RATE likhein, rate list DM mein bhejenge 📩\n\n#')
  fs.writeFileSync(path.join(WORK, 'plan.json'), JSON.stringify(plan, null, 1))

  // ---- 4. render ----
  for (const d of ['ig', 'wa']) fs.mkdirSync(path.join(WORK, d))
  const b = await chromium.launch()
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } })
  await p.goto(pathToFileURL(path.join(HERE, 'template.html')).href)
  await p.evaluate(() => document.fonts.ready)
  for (const which of ['ig', 'wa']) {
    await p.evaluate(([pl, w]) => window.init(pl, w), [plan, which])
    await p.waitForTimeout(400)
    const from = which === 'ig' ? 0 : (brandAt + 2) * FPS          // the WhatsApp cut only differs on the end card
    for (let f = from; f < T * FPS; f++) {
      await p.evaluate((t) => window.seek(t), f / FPS)
      await p.screenshot({ path: path.join(WORK, which, String(f).padStart(4, '0') + '.jpg'), type: 'jpeg', quality: 90 })
    }
  }
  await b.close()
  for (let f = 0; f < (brandAt + 2) * FPS; f++) fs.copyFileSync(path.join(WORK, 'ig', String(f).padStart(4, '0') + '.jpg'), path.join(WORK, 'wa', String(f).padStart(4, '0') + '.jpg'))
  sh(process.env.PYTHON || 'python3', [path.join(HERE, 'music.py'), path.join(WORK, 'music.wav'), String(T), String(brandAt)])
  const enc = (dir, out, music) => sh('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', path.join(WORK, dir, '%04d.jpg'),
    ...(music ? ['-i', path.join(WORK, 'music.wav'), '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '160k', '-shortest'] : []),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', path.join(WORK, out)])
  // voice lines at their shot starts on one track of length T; music ducks under the voice
  const vo = voParts ? mixVo(voParts, T, 'ig') : null, voWa = voParts ? mixVo(voParts, T, 'wa') : null
  enc('ig', 'silent-ig.mp4', false); enc('wa', 'silent-wa.mp4', false)
  const music = path.join(WORK, 'music.wav')
  const bed = (v, out) => v
    ? sh('ffmpeg', ['-v', 'error', '-y', '-i', v, '-i', music, '-filter_complex',
      '[1:a]volume=0.55[mu];[0:a]asplit[v1][v2];[mu][v1]sidechaincompress=threshold=0.03:ratio=8:attack=15:release=350[duck];[duck][v2]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]',
      '-map', '[a]', '-c:a', 'aac', '-b:a', '160k', '-t', String(T), out])
    : sh('ffmpeg', ['-v', 'error', '-y', '-i', music, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '160k', '-t', String(T), out])
  const fullIg = path.join(WORK, 'full-ig.m4a'), fullWa = path.join(WORK, 'full-wa.m4a')
  bed(vo, fullIg); bed(voWa, fullWa)
  const mux = (v, a, out) => sh('ffmpeg', ['-v', 'error', '-y', '-i', path.join(WORK, v), ...(a ? ['-i', a, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '160k', '-shortest'] : []), '-c:v', 'copy', '-movflags', '+faststart', path.join(WORK, out)])
  mux('silent-ig.mp4', fullIg, 'final.mp4'); mux('silent-wa.mp4', fullWa, 'wa.mp4')
  mux('silent-ig.mp4', vo, 'manual.mp4')          // for Instagram by hand: voice only, Instagram's music goes under it

  if (LOCAL) { console.log('LOCAL done:', WORK, JSON.stringify({ T, caption })); process.exit(0) }
  // ---- 5. store, preview ----
  const put = async (name) => {
    const key = `reels/${postId}/${name}`
    const r = await fetch(`${env('SUPABASE_URL')}/storage/v1/object/social-media/${key}`, { method: 'POST', headers: { apikey: env('SUPABASE_SERVICE_KEY'),
      Authorization: `Bearer ${env('SUPABASE_SERVICE_KEY')}`, 'Content-Type': 'video/mp4', 'x-upsert': 'true' }, body: fs.readFileSync(path.join(WORK, name)) })
    if (!r.ok) throw new Error(`upload ${r.status}: ${(await r.text()).slice(0, 200)}`)
    return `${env('SUPABASE_URL')}/storage/v1/object/public/social-media/${key}`
  }
  const url = await put('final.mp4'), manual = await put('manual.mp4')
  await db(`social_post?id=eq.${postId}`, { method: 'PATCH', body: JSON.stringify({ image_url: url, manual_url: manual, caption }) })
  const what = claimed.map((x) => x.kind === 'video' ? 'video' : 'photo')
  const head = `🎬 Reel taiyaar (${what.length} ${what.length > 1 ? 'cheezein' : 'cheez'}: ${[...new Set(what)].join(' + ')}, ${T} sec, ${vo ? '🎙 voiceover + music' : 'sirf music, voiceover nahi ban paya'})\n\n`
  const tail = '\n\n✏️ Caption badalna ho to is message ka reply karke naya likho.\n📘 = Facebook + Telegram abhi, Insta ke liye bina-music video milega.'
  const msg = await tgVideo(path.join(WORK, 'final.mp4'), (head + caption).slice(0, 1024 - tail.length) + tail, reelButtons(postId))
  await tgVideo(path.join(WORK, 'wa.mp4'), '📲 WhatsApp Status / group ke liye (end me group ka QR). Ise seedha forward karo.')
  await db('ops_log?on_conflict=job,key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ job: 'preview', key: postId, detail: { message_id: msg.message_id } }) })
  console.log('preview sent', postId)
} catch (e) {
  // give the media back to the library so the watchdog / next send retries it; tell the group
  if (LOCAL) throw e
  await db(`media_library?edited_into=eq.${postId}`, { method: 'PATCH', body: JSON.stringify({ edited_into: null }) }).catch(() => {})
  await db(`social_post?id=eq.${postId}`, { method: 'PATCH', body: JSON.stringify({ status: 'failed', error: String(e.message).slice(0, 300) }) }).catch(() => {})
  await say(`⚠️ Reel edit nahi ho paya: ${String(e.message).slice(0, 200)}. Media library me safe hai, watchdog dobara try karega.`).catch(() => {})
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
          body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.4 } }) })
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

// ---- voiceover: Gemini 3.8 Flash TTS (Interactions API, free tier). Each line is synthesized and sped up only if it
// would overrun its slot (max 1.3x; the last line max 1.1x because the end card is held until it finishes).
async function synthVo(lines) {
  const key = env('GEMINI_FREE_KEY', false)
  if (!key || !lines.length) throw new Error('no key or no lines')
  const out = []
  for (const [i, l] of lines.entries()) {
    const raw = path.join(WORK, `vo${i}.wav`)
    await tts(key, l.text, raw)
    const fit = path.join(WORK, `vo${i}f.wav`)
    sh('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse', path.join(WORK, `vo${i}t.wav`)])
    const d = Number(sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(WORK, `vo${i}t.wav`)]).trim()) || 0
    const last = !!l.only                                    // end-card line: the card waits for it
    const tempo = Math.min(last ? 1.1 : 1.3, Math.max(1, d / l.slot))
    sh('ffmpeg', ['-v', 'error', '-y', '-i', path.join(WORK, `vo${i}t.wav`), '-af', `atempo=${tempo.toFixed(3)},aresample=48000,aformat=channel_layouts=stereo`, fit])
    out.push({ f: fit, at: l.at, len: d / tempo, only: l.only })
    console.log('vo', i, JSON.stringify(l.text), d.toFixed(2), 's x', tempo.toFixed(2))
  }
  return out
}
function mixVo(all, T, which) {
  const parts = all.filter((x) => !x.only || x.only === which)
  const out = path.join(WORK, `vo-${which}.wav`)
  const fc = parts.map((x, i) => `[${i}:a]adelay=${Math.round(x.at * 1000)}|${Math.round(x.at * 1000)}[v${i}]`).join(';') +
    `;${parts.map((_, i) => `[v${i}]`).join('')}amix=inputs=${parts.length}:normalize=0,apad,atrim=0:${T},volume=1.6,alimiter=limit=0.95[o]`
  sh('ffmpeg', ['-v', 'error', '-y', ...parts.flatMap((x) => ['-i', x.f]), '-filter_complex', fc, '-map', '[o]', out])
  return out
}// free tier allows 3 TTS requests a minute: keep 21 s between calls, and on 429 wait as long as Google asks
let lastTts = 0
async function tts(key, text, file) {
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
      await sleep((wait + 2) * 1000)
    }
  }
  throw new Error(`tts failed: ${last}`)
}