// Daily Meta ads check for MarginMart (ported from vajra-automation/social/ads_manager.py, owner 12 Nov 2026).
// Hard rule: NEVER changes budgets, bids, targeting or money. It only pauses / resumes ads that already exist,
// and reports to Telegram. Spend and top-ups are the owner's decision.
export const ACCOUNT = 'act_993539680466090'          // MarginMart Ads
export const RULES = { minSpend: 60, worse: 1.8, minActive: 2, cooldownDays: 7, lowBalanceDays: 2 }

/** Chats (WhatsApp/Messenger conversations started) from an insights row. */
export const chats = (row) => (row?.actions ?? [])
  .filter((a) => /onsite_conversion\.messaging_conversation_started_7d|messaging_conversation_started/.test(a.action_type))
  .reduce((m, a) => Math.max(m, Number(a.value) || 0), 0)

/**
 * Decide what to pause / resume. ads = [{ id, name, status, spend7, chats7, lifeSpend, lifeChats, pausedByUsAt }]
 * Returns { pause: [{id, why}], resume: [{id, why}] }.
 */
export function decide(ads, now = Date.now(), R = RULES) {
  const active = ads.filter((a) => a.status === 'ACTIVE')
  const cpc = (a) => (a.chats7 > 0 ? a.spend7 / a.chats7 : Infinity)
  const judged = active.filter((a) => a.spend7 >= R.minSpend)
  const best = Math.min(...active.filter((a) => a.chats7 > 0).map(cpc))
  const pause = []
  for (const a of judged) {
    if (a.chats7 === 0) pause.push({ id: a.id, why: `₹${Math.round(a.spend7)} kharch, 0 chat` })
    else if (Number.isFinite(best) && cpc(a) > R.worse * best) pause.push({ id: a.id, why: `₹${Math.round(cpc(a))}/chat (best ₹${Math.round(best)})` })
  }
  // never leave fewer than minActive running: drop the mildest pauses first
  while (pause.length && active.length - pause.length < R.minActive) pause.pop()
  const resume = []
  const left = active.length - pause.length
  if (left < R.minActive) {
    const cool = R.cooldownDays * 864e5
    const pool = ads.filter((a) => a.status === 'PAUSED' && a.lifeChats > 0 && !(a.pausedByUsAt && now - a.pausedByUsAt < cool))
      .sort((x, y) => x.lifeSpend / x.lifeChats - y.lifeSpend / y.lifeChats)
    for (const a of pool.slice(0, R.minActive - left)) resume.push({ id: a.id, why: `lifetime ₹${Math.round(a.lifeSpend / a.lifeChats)}/chat` })
  }
  return { pause, resume }
}

/** Telegram summary (HTML). */
export function report(ads, acted, money) {
  const L = ['<b>📢 MarginMart ads (7 din)</b>']
  const run = ads.filter((a) => a.status === 'ACTIVE')
  const spend = run.reduce((s, a) => s + a.spend7, 0), ch = run.reduce((s, a) => s + a.chats7, 0)
  L.push(`Chal rahe: ${run.length} ad · kharch <b>₹${Math.round(spend)}</b> · <b>${ch}</b> WhatsApp chat${ch ? ` · ₹${Math.round(spend / ch)}/chat` : ''}`)
  for (const a of run.sort((x, y) => y.chats7 - x.chats7).slice(0, 6)) L.push(`• ${a.name}: ${a.chats7} chat · ₹${Math.round(a.spend7)}`)
  for (const p of acted.pause) L.push(`⏸ Roka: ${ads.find((a) => a.id === p.id)?.name} (${p.why})`)
  for (const r of acted.resume) L.push(`▶️ Chalu kiya: ${ads.find((a) => a.id === r.id)?.name} (${r.why})`)
  if (money?.problem) L.push(`⚠️ ${money.problem}`)
  return L.join('\n')
}

/** Phone as Meta wants it before hashing: digits only, with country code (India 91). null if not a mobile number. */
export function phoneKey(raw) {
  const d = String(raw ?? '').replace(/\D/g, '').replace(/^0+/, '')
  const ten = d.length === 12 && d.startsWith('91') ? d.slice(2) : d
  return /^[6-9]\d{9}$/.test(ten) ? '91' + ten : null
}
