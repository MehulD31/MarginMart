// After every Playwright run, remove the QA / TEST records the tests made (test data must never stay on the live site).
import { readFileSync } from 'node:fs'

export default async function globalTeardown() {
  const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]))
  const U = env.VITE_SUPABASE_URL, A = env.VITE_SUPABASE_ANON_KEY
  try {
    const login = await (await fetch(`${U}/functions/v1/pin-login`, { method: 'POST', headers: { apikey: A, Authorization: `Bearer ${A}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '8871565551', pin: '1234' }) })).json()
    const r = await fetch(`${U}/rest/v1/rpc/qa_cleanup`, { method: 'POST', headers: { apikey: A, Authorization: `Bearer ${login.access_token}`, 'Content-Type': 'application/json' }, body: '{}' })
    console.log('QA cleanup:', r.status, await r.text())
  } catch (e) { console.log('QA cleanup FAILED:', (e as Error).message) }
}
