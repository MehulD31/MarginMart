// Scheme bot, step 2: a button tap. ACTION=ok|no, DRAFT=<scheme_draft id>, WHO=Telegram name.
import { db, env, hiDate, rs, say } from './lib.mjs'

const action = env('ACTION'); const id = env('DRAFT'); const who = process.env.WHO ?? ''
if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('bad draft id')
try {
  const [d] = await db(`scheme_draft?id=eq.${id}&select=*`)
  if (!d) { await say('Ye draft nahi mila.'); process.exit(0) }
  if (d.status !== 'pending') { await say(`Ye pehle hi ${d.status === 'approved' ? 'approve' : 'band'} ho chuka hai.`); process.exit(0) }
  if (action === 'no') {
    await db(`scheme_draft?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'replaced' }) })
    await say(`❌ ${who}: chhod diya, app me kuch nahi badla.`); process.exit(0)
  }
  const f = d.facts
  const [s] = await db('scheme', { method: 'POST', body: JSON.stringify({ pack_id: f.pack_id, variant_ids: f.variant_ids, kind: f.kind,
    amount_paise: f.amount_paise, starts_on: f.starts_on, ends_on: f.ends_on, note: (f.note ?? '').slice(0, 300), source_text: d.source_text }) })
  await db(`scheme_draft?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'approved', scheme_id: s.id }) })
  const [p] = await db(`pack?id=eq.${f.pack_id}&select=name_en`)
  // Queue the poster for Facebook + Instagram (ops.mjs social posts it at 19:30). One row per scheme, so a re-tap can't post twice.
  const caption = `🔥 Dukandar bhaiyon ke liye offer: ${p?.name_en} pe ${rs(f.amount_paise)}/peti extra, ${hiDate(f.starts_on)}–${hiDate(f.ends_on)}.\n\nOrder: KD Foods ke MarginMart app se ya WhatsApp/call karo.\n\n#PepsiDistributor #ColdDrinkWholesale #KDFoods #MarginMart #Durg #Bhilai #Raipur`
  await db('social_post?on_conflict=kind,source_id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ kind: 'scheme', source_id: s.id, caption,
      image_url: `${env('SUPABASE_URL')}/storage/v1/object/public/product-images/posters/${id}.jpg` }) }).catch((e) => console.log('social queue failed', e.message))
  await say(`✅ ${who}: ${p?.name_en} pe ${rs(f.amount_paise)}/peti scheme app me chalu, ${hiDate(f.starts_on)}–${hiDate(f.ends_on)}. Poster retailers ke WhatsApp group me forward kar do.\n(App → Setup → Schemes me dekh/band kar sakte ho.)`)
} catch (e) {
  console.error(e)
  await say(`⚠️ Approve me error: ${String(e.message).slice(0, 300)}`).catch(() => {})
  process.exit(1)
}
