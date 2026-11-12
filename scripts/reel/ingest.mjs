// Add local files to the media library, as if they were sent on Telegram (reel.yml, input "release").
// Usage: WHO=.. NOTE=.. node scripts/reel/ingest.mjs file1 [file2 ...]
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { db, env, todayIST } from '../scheme-bot/lib.mjs'

for (const f of process.argv.slice(2)) {
  const ext = path.extname(f).toLowerCase()
  const kind = ['.mp4', '.mov'].includes(ext) ? 'video' : ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? 'image' : null
  if (!kind) { console.log('skip', f); continue }
  const key = `library/${todayIST()}/${randomUUID()}.${kind === 'video' ? 'mp4' : 'jpg'}`
  const r = await fetch(`${env('SUPABASE_URL')}/storage/v1/object/social-media/${key}`, { method: 'POST',
    headers: { apikey: env('SUPABASE_SERVICE_KEY'), Authorization: `Bearer ${env('SUPABASE_SERVICE_KEY')}`, 'Content-Type': kind === 'video' ? 'video/mp4' : 'image/jpeg', 'x-upsert': 'true' },
    body: fs.readFileSync(f) })
  if (!r.ok) throw new Error(`upload ${r.status}: ${(await r.text()).slice(0, 200)}`)
  await db('media_library', { method: 'POST', body: JSON.stringify({ kind, url: `${env('SUPABASE_URL')}/storage/v1/object/public/social-media/${key}`, who: process.env.WHO || null, note: process.env.NOTE || null }) })
  console.log('added', f, kind)
}
