// Fast trigger for the "website update" Telegram messages (owner, 12 Nov 2026: unloading was never reported because
// GitHub's */10 schedule really runs every 1-6 hours). Supabase pg_cron calls this every 2 minutes; it starts the
// ops "events" job only when someone saved something new on the website (or ?force=1, every 10 minutes, for
// orders, DMs and comments). The caller proves itself with the bot key, checked by the database (bot_ok).
const env = process.env

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const key = req.headers['x-bot-key']
  if (!key) return res.status(401).end()
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/bot_tick_due`, {
    method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_key: key }) })
  if (!r.ok) return res.status(r.status === 400 || r.status === 401 ? 401 : 502).json({ error: (await r.text()).slice(0, 200) })
  const due = await r.json()
  const force = req.query?.force === '1'
  if (!due && !force) return res.status(200).json({ started: false })
  const g = await fetch(`https://api.github.com/repos/${env.GH_REPO}/actions/workflows/ops.yml/dispatches`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.GH_DISPATCH_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main', inputs: { mode: 'events' } }) })
  return res.status(200).json({ started: g.ok, due, force, github: g.status })
}
