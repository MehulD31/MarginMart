// Vehicle trips end to end on the live database, with a test vehicle "QA Van" and test shops only.
// Run alone: node tests/db/trips.mjs   then run tests/db/cleanup.sql (removes QA vehicles' trips + QA shops).
import { randomUUID } from 'node:crypto'
import { call, check, done, env, fnc, login, rest, today } from './lib.mjs'

const admin = await login('8871565551', '1234')
// a temporary QA manager login, so the manager role is really tested (removed by tests/db/cleanup.sql)
const mPhone = '6' + String(Date.now()).slice(-9)
const made = await fnc('admin-users', { action: 'create', role: 'manager', name: 'QA TRIP Manager', phone: mPhone }, admin)
const manager = await login(mPhone, made.pin)
const driver = await login('1111111111', '1111')
const err = (r) => r.body?.message
const cat = (await call('counter_catalog', {}, admin)).body
const STING = cat.find((c) => c.label === 'Sting PET 250ml (Red)').variant_id
const NIMBOOZ = cat.find((c) => /^Nimbooz/.test(c.label)).variant_id
const stockOf = async (v) => (await rest(`stock?select=on_hand&variant_id=eq.${v}`, admin))[0].on_hand
const s0 = await stockOf(STING), n0 = await stockOf(NIMBOOZ)

const van = (await rest('vehicle', admin, { method: 'POST', body: JSON.stringify({ name: 'QA Van', capacity_cases: 20 }) }))[0]
const route = (await rest('route?select=id&name=eq.Direct%20sales', admin))[0].id
const shop = (await rest('shop', admin, { method: 'POST', body: JSON.stringify({ name: 'QA TRIP Shop', route_id: route }) }))[0]
check(van?.id && shop?.id, 'QA van + QA shop made')

console.log('[board + open]')
check(err(await call('trip_board', { p_date: today }, driver)) === 'FORBIDDEN', 'driver cannot see the trip board')
let board = (await call('trip_board', { p_date: today }, manager)).body
check(board.some((b) => b.vehicle_id === van.id && b.plan_id === null), 'manager sees QA Van, no trip yet')
const plan = (await call('trip_open', { p_vehicle: van.id, p_date: today }, manager)).body
check(typeof plan === 'string', 'manager opens a trip for QA Van')
check((await call('trip_open', { p_vehicle: van.id, p_date: today }, manager)).body === plan, 'opening again gives the same trip')

console.log('[load]')
let r = await call('trip_load', { p_plan: plan, p_driver: null, p_lines: [{ variant_id: STING, qty: s0 + 1 }] }, manager)
check(err(r) === 'NOT_ENOUGH_STOCK', 'cannot load more than the godown has', r.body)
r = await call('trip_load', { p_plan: plan, p_driver: null, p_lines: [{ variant_id: STING, qty: 0 }] }, manager)
check(err(r) === 'NOTHING_TO_LOAD', 'empty load refused')
r = await call('trip_load', { p_plan: plan, p_driver: null, p_lines: [{ variant_id: STING, qty: 6 }, { variant_id: NIMBOOZ, qty: 4 }] }, manager)
check(r.status === 200 && r.body.cases === 10, 'manager loads 10 cases (no driver needed)', r.body)
check((await stockOf(STING)) === s0 - 6 && (await stockOf(NIMBOOZ)) === n0 - 4, 'godown stock down by the load')
r = await call('trip_load', { p_plan: plan, p_driver: null, p_lines: [{ variant_id: STING, qty: 5 }, { variant_id: NIMBOOZ, qty: 4 }] }, manager)
check(r.status === 200 && (await stockOf(STING)) === s0 - 5, 'change the load before anything is sold: Sting 6 -> 5, stock follows')
let d = (await call('trip_detail', { p_plan: plan }, manager)).body
const it = (v) => d.items.find((x) => x.variant_id === v)
check(d.plan.status === 'loaded' && it(STING).loaded === 5 && it(STING).left === 5 && it(NIMBOOZ).left === 4, 'detail: 9 on the truck')

console.log('[truck bills]')
const line = (v, qty) => ({ variant_id: v, qty, price_paise: 50000 })
r = await call('counter_sale_save_into', { p_id: null, p_action: randomUUID(), p_shop: shop.id, p_mode: 'cash', p_lines: [line(STING, 6)], p_account: null, p_discount: 0, p_plan: plan }, manager)
check(err(r) === 'NOT_ON_TRUCK', 'cannot bill more than is on the truck (6 > 5)', r.body)
const seqAfterRefusal = (await rest('rpc/counter_sales', manager, { method: 'POST', body: JSON.stringify({ p_from: today, p_to: today }) })) ?? []
const OTHER = cat.find((c) => c.on_hand > 0 && c.variant_id !== STING && c.variant_id !== NIMBOOZ).variant_id
r = await call('counter_sale_save_into', { p_id: null, p_action: randomUUID(), p_shop: shop.id, p_mode: 'cash', p_lines: [line(OTHER, 1)], p_account: null, p_discount: 0, p_plan: plan }, manager)
check(err(r) === 'NOT_ON_TRUCK', 'cannot bill an item that is not on the truck')
const sBefore = await stockOf(STING)
const lastNo = Math.max(0, ...seqAfterRefusal.map((x) => Number(x.number.slice(3))))
const b1 = (await call('counter_sale_save_into', { p_id: null, p_action: randomUUID(), p_shop: shop.id, p_mode: 'cash', p_lines: [line(STING, 2)], p_account: null, p_discount: 5000, p_plan: plan }, manager)).body
check(b1?.number && b1.total_paise === 95000, `truck bill ${b1?.number}: 2 Sting, ₹50 discount -> ₹950`, b1)
check(Number(b1.number.slice(3)) === lastNo + 1, `refused truck bills did not use up bill numbers (next was ${b1.number})`)
check((await stockOf(STING)) === sBefore, 'truck bill does NOT take godown stock again')
const b2 = (await call('counter_sale_save_into', { p_id: null, p_action: randomUUID(), p_shop: shop.id, p_mode: 'upi', p_lines: [line(NIMBOOZ, 3)], p_account: null, p_discount: 0, p_plan: plan }, manager)).body
d = (await call('trip_detail', { p_plan: plan }, manager)).body
check(it(STING).billed === 2 && it(STING).left === 3 && it(NIMBOOZ).left === 1 && d.bills.length === 2 && d.plan.status === 'out', 'after 2 bills: Sting left 3, Nimbooz left 1, trip on road')
r = await call('counter_sale_save_into', { p_id: b1.id, p_action: randomUUID(), p_shop: shop.id, p_mode: 'cash', p_lines: [line(STING, 6)], p_account: null, p_discount: 0 }, manager)
check(err(r) === 'NOT_ON_TRUCK', 'edit a truck bill above what the truck had -> refused')
r = await call('counter_sale_save_into', { p_id: b1.id, p_action: randomUUID(), p_shop: shop.id, p_mode: 'cash', p_lines: [line(STING, 3)], p_account: null, p_discount: 0 }, manager)
check(r.status === 200 && (await stockOf(STING)) === sBefore, 'edit truck bill 2 -> 3 cases: allowed, godown unchanged')
const sales = (await call('counter_sales', { p_from: today, p_to: today }, manager)).body
check(sales.find((x) => x.id === b1.id)?.vehicle === 'QA Van', 'Counter sales list shows "QA Van" on the bill')
check(err(await call('trip_load', { p_plan: plan, p_driver: null, p_lines: [{ variant_id: STING, qty: 9 }] }, manager)) === 'TRIP_STARTED', 'load can no longer change once billing started')

console.log('[unload]')
check(err(await call('trip_close', { p_plan: plan, p_reason: null }, manager)) === 'UNLOAD_FIRST', 'cannot close before unloading')
r = await call('trip_unload', { p_plan: plan, p_returned: [{ variant_id: STING, qty: 3 }] }, manager)
check(err(r) === 'MORE_THAN_ON_TRUCK', 'cannot unload more than is left (3 > 2)')
const sU = await stockOf(STING)
r = await call('trip_unload', { p_plan: plan, p_returned: [{ variant_id: STING, qty: 1 }] }, manager)
check(r.status === 200 && (await stockOf(STING)) === sU + 1, '1 Sting came back -> godown +1 straight away', r.body)
r = await call('trip_unload', { p_plan: plan, p_returned: [{ variant_id: STING, qty: 2 }] }, manager)
check((await stockOf(STING)) === sU + 2, 'correct the unload 1 -> 2: godown follows (+1 more)')
d = (await call('trip_detail', { p_plan: plan }, manager)).body
check(it(STING).left === 0 && it(NIMBOOZ).left === 1 && d.plan.unloaded_at, 'Sting balanced, Nimbooz 1 still unaccounted')

console.log('[close]')
r = await call('trip_close', { p_plan: plan, p_reason: '' }, manager)
check(err(r) === 'REASON_REQUIRED', '1 case short: closing needs a reason')
r = await call('trip_close', { p_plan: plan, p_reason: 'QA test: 1 Nimbooz broken' }, manager)
check(r.status === 200 && r.body.short === 1, 'closed with reason, 1 short', r.body)
const nAfter = await stockOf(NIMBOOZ)
check(nAfter === n0 - 4, 'Nimbooz godown: -4 loaded, 0 came back (3 billed + 1 broken) -> stock right, no double return on close')
check((await stockOf(STING)) === s0 - 3, 'Sting godown: -5 loaded +2 back = -3 (= billed) -> stock right after close')
board = (await call('trip_board', { p_date: today }, manager)).body
const card = board.find((b) => b.vehicle_id === van.id)
check(card.status === 'closed' && card.short_cases === 1 && card.sold === 6 && card.returned === 2 && card.loaded === 9, 'board: closed, 9 out, 2 back, 6 sold, 1 short', card)
check(err(await call('counter_sale_save_into', { p_id: null, p_action: randomUUID(), p_shop: shop.id, p_mode: 'cash', p_lines: [line(STING, 1)], p_account: null, p_discount: 0, p_plan: plan }, manager)) === 'TRIP_NOT_OUT', 'no new truck bills after close')
check(err(await call('void_cash_sale', { p_id: b2.id, p_reason: 'qa' }, admin)) === 'TRIP_CLOSED', 'bills of a closed trip cannot be cancelled')
const day = (await call('bot_day', { p_key: env.KD_BOT_KEY, p_day: today })).body
const t = (day.trucks ?? []).find((x) => x.vehicle === 'QA Van')
check(t?.short_cases === 1 && /broken/.test(t.close_note ?? ''), 'nightly report data has the shortage + reason', t)

console.log('[old counter sale still works]')
const sc = await stockOf(STING)
const cb = (await call('counter_sale_save_into', { p_id: null, p_action: randomUUID(), p_shop: shop.id, p_mode: 'cash', p_lines: [line(STING, 1)], p_account: null }, manager)).body
check(cb?.number && (await stockOf(STING)) === sc - 1, 'normal counter sale (no truck) still takes godown stock')
await call('admin_delete', { p_kind: 'counter_sale', p_id: cb.id }, admin)
check((await stockOf(STING)) === sc, 'and deleting it puts the stock back')
done()
