// Daily content (thumb rule: social runs itself). Runs in GitHub Actions (.github/workflows/content.yml), 18:00 IST.
// For every purchase (Pepsi stock arrived) since the last run: render a "माल आ गया" poster from the real items + photos,
// upload it, queue it in public.social_post (posted at 19:30 by ops.yml mode=social), and show a preview in the KD group
// with a ❌ button (api/_ops.js -> bot_social_skip). No prices on the poster (public post).
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { db, env, tgPhoto, todayIST, upload } from '../scheme-bot/lib.mjs'
import { item } from './format.mjs'

const img = (p) => `${env('SUPABASE_URL')}/storage/v1/object/public/product-images/${p}`
const since = new Date(Date.now() - 3 * 864e5).toISOString()   // look back 3 days; ops_log/social_post stop repeats
const purchases = await db(`purchase?created_at=gte.${encodeURIComponent(since)}&select=id,created_at,purchase_line(qty,variant(flavour_en,image_path,pack(name_en,sort)))&order=created_at`)
let made = 0
for (const p of purchases) {
  const exists = await db(`social_post?kind=eq.stock&source_id=eq.${p.id}&select=id`)
  if (exists.length) continue
  // biggest lines first; one entry per product name
  const lines = (p.purchase_line ?? []).filter((l) => l.variant).sort((a, b) => b.qty - a.qty)
  const names = [...new Set(lines.map((l) => item(`${l.variant.pack?.name_en ?? ''} ${l.variant.flavour_en ?? ''}`).replace(/\s*\(MRP \d+\)/, '')))]
  if (!names.length) continue
  const images = [...new Set(lines.map((l) => l.variant.image_path).filter(Boolean))].slice(0, 5).map(img)
  fs.writeFileSync('stock.json', JSON.stringify({ items: names.slice(0, 6), images }))
  execFileSync('node', ['scripts/poster/render.mjs', 'stock.json', 'stock.jpg', 'stock'], { stdio: 'inherit' })
  const url = await upload(`posters/stock-${p.id}.jpg`, 'stock.jpg')
  const caption = `🚚 Taaza maal aa gaya! ${names.slice(0, 4).join(', ')}${names.length > 4 ? ' aur bhi' : ''}.\n\nDukandar bhaiyon, aaj hi order karo: KD Foods MarginMart app ya WhatsApp/call.\n\n#PepsiDistributor #ColdDrinkWholesale #KDFoods #MarginMart #Durg #Bhilai #Raipur`
  const [row] = await db('social_post?on_conflict=kind,source_id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({ kind: 'stock', source_id: p.id, image_url: url, caption }) })
  if (!row) continue
  await tgPhoto('stock.jpg', `📣 Naya post taiyaar (aaj 19:30 ko jayega):\n\n${caption}`.slice(0, 1000),
    { inline_keyboard: [[{ text: '❌ Mat daalo', callback_data: `sp:no:${row.id}` }]] })
  made++
}
console.log('content', todayIST(), 'purchases', purchases.length, 'posts made', made)
