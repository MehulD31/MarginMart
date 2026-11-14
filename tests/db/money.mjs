// "Paid into" + money held by partners, against the live database. Makes its own QA shop, cleans up through
// admin_delete / void; the ledger + transfer leftovers are removed by tests/db/cleanup-qa.mjs (run it after).
// Run: node tests/db/money.mjs
import { randomUUID } from 'node:crypto'
import { call, check, done, env, login, rest, today } from './lib.mjs'

const admin = await login('8871565551', '1234')
const driver = await login('1111111111', '1111')
const err = (r) => r.body?.message
const accounts = (await call('money_accounts', {}, admin)).body
const acc = (kind, name) => accounts.find((a) => a.kind === kind && (!name || a.name.startsWith(name)))
const BANK = acc('company'), SHOBHIT = acc('personal', 'Shobhit'), CASH = acc('cash')
check(BANK && SHOBHIT && CASH, 'seeded accounts: Company bank, Shobhit (personal), Cash', accounts)

const cat = (await call('counter_catalog', {}, admin)).body
const STING = cat.find((c) => c.label === 'Sting PET 250ml (Red)').variant_id
const route = (await rest('route?select=id&name=eq.Direct%20sales', admin))[0].id
const shop = (await rest('shop', admin, { method: 'POST', body: JSON.stringify({ name: 'QA MONEY Shop', route_id: route }) }))[0]
const hold = async (id) => (await call('money_holdings', {}, admin)).body.find((h) => h.account_id === id) ?? { holding_paise: 0, received_paise: 0, moved_paise: 0 }
const pays = async () => (await call('money_payments', { p_from: today, p_to: today }, admin)).body.filter((p) => p.shop === 'QA MONEY Shop')
const h0 = { shobhit: (await hold(SHOBHIT.id)).holding_paise, cash: (await hold(CASH.id)).holding_paise }

console.log('[counter sales]')
const line = [{ variant_id: STING, qty: 1, price_paise: 50000 }]
let r = await call('counter_sale_save_into', { p_id: null, p_action: randomUUID(), p_shop: shop.id, p_mode: 'cash', p_lines: line, p_account: null }, admin)
const cashBill = r.body
check(r.status === 200 && cashBill.number, `cash bill ${cashBill.number} saved`, r)
check((await pays()).find((p) => p.ref_id === cashBill.id)?.account_id === CASH.id, 'no choice + cash -> Cash account (default)')
check((await hold(CASH.id)).holding_paise === h0.cash + 50000, 'Cash box holds +₹500')

const act = randomUUID()
r = await call('counter_sale_save_into', { p_id: null, p_action: act, p_shop: shop.id, p_mode: 'upi', p_lines: [{ variant_id: STING, qty: 2, price_paise: 50000 }], p_account: SHOBHIT.id }, admin)
const upiBill = r.body
let p = (await pays()).find((x) => x.ref_id === upiBill.id)
check(p?.account_id === SHOBHIT.id && p.explicit, `UPI bill ${upiBill.number} paid into Shobhit`)
let h = await hold(SHOBHIT.id)
check(h.holding_paise === h0.shobhit + 100000 && h.oldest_days >= 0, 'Shobhit holds +₹1,000 more than before', h)
r = await call('counter_sale_save_into', { p_id: null, p_action: act, p_shop: shop.id, p_mode: 'upi', p_lines: [{ variant_id: STING, qty: 2, price_paise: 50000 }], p_account: SHOBHIT.id }, admin)
check(r.body.id === upiBill.id && (await hold(SHOBHIT.id)).holding_paise === h0.shobhit + 100000, 'double tap: same bill, no double count')
const noAcc = await call('counter_sale_save_into', { p_id: null, p_action: randomUUID(), p_shop: shop.id, p_mode: 'upi', p_lines: line, p_account: randomUUID() }, admin)
check(err(noAcc) === 'ACCOUNT_NOT_FOUND', 'unknown account refused (and no bill made)', noAcc)
check((await pays()).length === 2, 'refused save left no bill behind')
const nextNo = (await call('counter_sale_save_into', { p_id: null, p_action: randomUUID(), p_shop: shop.id, p_mode: 'cash', p_lines: line, p_account: null }, admin)).body
check(Number(nextNo.number.slice(3)) === Number(upiBill.number.slice(3)) + 1, `refusal did not use up a bill number (next is ${nextNo.number})`)
await call('admin_delete', { p_kind: 'counter_sale', p_id: nextNo.id }, admin)

console.log('[change where an old payment went]')
r = await call('set_payment_account', { p_kind: 'counter_sale', p_ref: upiBill.id, p_account: BANK.id }, admin)
check(r.status < 300 && (await hold(SHOBHIT.id)).holding_paise === h0.shobhit, 'moved to Company bank -> Shobhit back to before', r)
await call('set_payment_account', { p_kind: 'counter_sale', p_ref: upiBill.id, p_account: SHOBHIT.id }, admin)
check((await hold(SHOBHIT.id)).holding_paise === h0.shobhit + 100000, 'marked Shobhit again')
const audit = await rest(`audit_log?select=action&table_name=eq.payment_account&row_id=eq.counter_sale:${upiBill.id}`, admin)
check(Array.isArray(audit) && audit.length >= 3, `every change is in change history (${audit?.length})`, audit)
r = await call('counter_sale_save_into', { p_id: upiBill.id, p_action: randomUUID(), p_shop: shop.id, p_mode: 'upi', p_lines: [{ variant_id: STING, qty: 3, price_paise: 50000 }], p_account: SHOBHIT.id }, admin)
check((await hold(SHOBHIT.id)).holding_paise === h0.shobhit + 150000, 'edit bill to 3 cases -> Shobhit holds +₹1,500', r)

console.log('[khata payment]')
const pact = randomUUID()
r = await call('record_payment_into', { p_action_id: pact, p_shop_id: shop.id, p_mode: 'upi', p_amount_paise: 70000, p_upi_ref: 'QA123', p_account: SHOBHIT.id }, admin)
check(r.status === 200, 'khata payment ₹700 saved', r)
check((await hold(SHOBHIT.id)).holding_paise === h0.shobhit + 220000, 'Shobhit holds +₹2,200')
await call('record_payment_into', { p_action_id: pact, p_shop_id: shop.id, p_mode: 'upi', p_amount_paise: 70000, p_upi_ref: 'QA123', p_account: SHOBHIT.id }, admin)
check((await hold(SHOBHIT.id)).holding_paise === h0.shobhit + 220000 && (await pays()).filter((x) => x.kind === 'payment').length === 1, 'repeat payment: counted once')

console.log('[moved to company]')
const total = (await hold(SHOBHIT.id)).holding_paise
r = await call('record_money_transfer', { p_action: randomUUID(), p_account: SHOBHIT.id, p_amount_paise: total + 1, p_on: today }, admin)
check(err(r) === 'MORE_THAN_HELD', 'cannot move more than held', r)
r = await call('record_money_transfer', { p_action: randomUUID(), p_account: BANK.id, p_amount_paise: 100, p_on: today }, admin)
check(err(r) === 'INVALID_INPUT', 'company bank has nothing to move', r)
r = await call('record_money_transfer', { p_action: randomUUID(), p_account: SHOBHIT.id, p_amount_paise: 100, p_on: '2099-01-01' }, admin)
check(err(r) === 'INVALID_INPUT', 'future date refused', r)
const tact = randomUUID()
r = await call('record_money_transfer', { p_action: tact, p_account: SHOBHIT.id, p_amount_paise: 120000, p_on: today, p_note: 'QA move' }, admin)
check(r.status === 200 && r.body.holding_paise === total - 120000, 'moved ₹1,200 -> holding goes down', r)
const tid = r.body.id
r = await call('record_money_transfer', { p_action: tact, p_account: SHOBHIT.id, p_amount_paise: 120000, p_on: today }, admin)
check(r.body.repeat && (await hold(SHOBHIT.id)).holding_paise === total - 120000, 'double tap on move: counted once')
h = await hold(SHOBHIT.id)
check(h.moved_paise >= 120000 && h.oldest_at, 'oldest not-yet-moved payment still shown', h)
check((await call('money_transfers', {}, admin)).body.some((t) => t.id === tid && t.note === 'QA move'), 'move is listed')
r = await call('void_money_transfer', { p_id: tid, p_reason: 'qa' }, admin)
check(r.status < 300 && (await hold(SHOBHIT.id)).holding_paise === total, 'undo the move -> holding back', r)
check(err(await call('void_money_transfer', { p_id: tid, p_reason: 'qa' }, admin)) === 'NOT_FOUND', 'cannot undo twice')

console.log('[cancel / delete a bill]')
await call('void_cash_sale', { p_id: cashBill.id, p_reason: 'qa' }, admin)
check((await hold(CASH.id)).holding_paise === h0.cash, 'cancelled bill no longer counts as money held')

console.log('[Telegram]')
const bact = randomUUID()
r = await call('bot_record_sale_into', { p_key: env.KD_BOT_KEY, p_action: bact, p_shop: shop.id, p_lines: line, p_mode: 'upi', p_by: 'QA', p_account: SHOBHIT.id })
check(r.status === 200 && r.body.account === SHOBHIT.name, `bot sale into Shobhit (${r.body?.number})`, r)
const afterBot = (await hold(SHOBHIT.id)).holding_paise
r = await call('bot_record_sale_into', { p_key: env.KD_BOT_KEY, p_action: bact, p_shop: shop.id, p_lines: line, p_mode: 'upi', p_by: 'QA', p_account: BANK.id })
check(r.body.repeat && (await hold(SHOBHIT.id)).holding_paise === afterBot, 'bot double tap: no new bill, account unchanged')
check(err(await call('bot_record_sale_into', { p_key: 'x'.repeat(48), p_action: randomUUID(), p_shop: shop.id, p_lines: line, p_mode: 'upi', p_by: 'QA', p_account: null })) === 'FORBIDDEN', 'bot: wrong key refused')
check((await call('bot_money_accounts', { p_key: env.KD_BOT_KEY })).body.length >= 3, 'bot can list accounts')
check((await call('bot_money_holdings', { p_key: env.KD_BOT_KEY })).body.some((x) => x.account_id === SHOBHIT.id && x.holding_paise === afterBot), 'bot sees the same holding')

console.log('[who can see it]')
check(err(await call('money_holdings', {}, driver)) === 'FORBIDDEN', 'driver cannot see money held')
check(err(await call('record_money_transfer', { p_action: randomUUID(), p_account: SHOBHIT.id, p_amount_paise: 100, p_on: today }, driver)) === 'FORBIDDEN', 'driver cannot record a move')
check((await call('_money_holdings', {})).status >= 400, 'internal function not callable from outside')
check((await rest('money_transfer?select=id', admin)).length === 0, 'transfers table not readable directly (only via functions)')
check(err(await call('money_account_save', { p_id: null, p_name: 'Shobhit (personal)', p_kind: 'personal' }, admin)) === 'ACCOUNT_EXISTS', 'duplicate account name refused')

console.log('[clean up]')
for (const b of (await pays()).filter((x) => x.kind === 'counter_sale')) await call('admin_delete', { p_kind: 'counter_sale', p_id: b.ref_id }, admin)
await call('admin_delete', { p_kind: 'counter_sale', p_id: cashBill.id }, admin)
check((await pays()).filter((x) => x.kind === 'counter_sale').length === 0, 'QA bills deleted (stock put back)')
done()
