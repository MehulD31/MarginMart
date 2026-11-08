// Revert buttons on the live database, with a QA van and QA shop only. Run alone, then tests/db/cleanup.sql.
//   undo load -> stock back; undo unload -> stock off again; reopen closed trip; restore cancelled bill; restore cancelled order.
import { randomUUID } from 'node:crypto'
import { call, check, done, login, rest, today } from './lib.mjs'
const a = await login('8871565551', '1234')
const err = (r) => r.body?.message
const cat = (await call('counter_catalog', {}, a)).body
const STING = cat.find((c) => c.label === 'Sting PET 250ml (Red)')
const stockOf = async () => (await rest(`stock?select=on_hand&variant_id=eq.${STING.variant_id}`, a))[0].on_hand
const s0 = await stockOf()
const van = (await rest('vehicle', a, { method: 'POST', body: JSON.stringify({ name: 'QA Van R', capacity_cases: 20 }) }))[0]
const route = (await rest('route?select=id&name=eq.Direct%20sales', a))[0].id
const shop = (await rest('shop', a, { method: 'POST', body: JSON.stringify({ name: 'QA REVERT Shop', route_id: route }) }))[0]
const plan = (await call('trip_open', { p_vehicle: van.id, p_date: today }, a)).body
const load = () => call('trip_load', { p_plan: plan, p_driver: null, p_lines: [{ variant_id: STING.variant_id, qty: 4 }] }, a)

console.log('[undo load]')
check((await load()).status === 200 && (await stockOf()) === s0 - 4, 'loaded 4: godown -4')
check((await call('trip_undo_load', { p_plan: plan }, a)).status === 200, 'undo load ok')
check((await stockOf()) === s0, 'godown back to start')
const p1 = (await rest(`route_day_plan?select=status&id=eq.${plan}`, a))[0]
check(p1.status === 'planning', 'trip back to not loaded')

console.log('[undo unload]')
await load()
const bill = await call('counter_sale_save', { p_id: null, p_action: randomUUID(), p_shop: shop.id, p_mode: 'cash', p_lines: [{ variant_id: STING.variant_id, qty: 1, price_paise: 50000 }], p_discount: 0, p_plan: plan }, a)
check(bill.status === 200, 'truck bill 1 case')
check(err(await call('trip_undo_load', { p_plan: plan }, a)) === 'TRIP_STARTED', 'undo load refused once something is sold')
await call('trip_unload', { p_plan: plan, p_returned: [{ variant_id: STING.variant_id, qty: 3 }] }, a)
check((await stockOf()) === s0 - 1, 'unloaded 3: godown -1 (the bill)')
check((await call('trip_undo_unload', { p_plan: plan }, a)).status === 200, 'undo unload ok')
check((await stockOf()) === s0 - 4, 'godown -4 again (3 back on truck)')
const p2 = (await rest(`route_day_plan?select=status,unloaded_at&id=eq.${plan}`, a))[0]
check(p2.unloaded_at === null && p2.status === 'out', 'trip on road again')

console.log('[reopen]')
await call('trip_unload', { p_plan: plan, p_returned: [{ variant_id: STING.variant_id, qty: 2 }] }, a)
check((await call('trip_close', { p_plan: plan, p_reason: 'QA one missing' }, a)).status === 200, 'closed with 1 short')
const sClosed = await stockOf()
check((await call('trip_reopen', { p_plan: plan }, a)).status === 200, 'reopen ok')
const p3 = (await rest(`route_day_plan?select=status,short_cases,close_note&id=eq.${plan}`, a))[0]
check(p3.status === 'out' && p3.short_cases === 0 && p3.close_note === null, 'reopened: shortage + reason cleared')
check((await stockOf()) === sClosed, 'reopen keeps godown stock as it was')
check(err(await call('trip_reopen', { p_plan: plan }, a)) === 'TRIP_NOT_CLOSED', 'reopen twice refused')
await call('trip_unload', { p_plan: plan, p_returned: [{ variant_id: STING.variant_id, qty: 3 }] }, a)
check((await call('trip_close', { p_plan: plan, p_reason: null }, a)).status === 200, 'fixed unload (3 back) closes clean')
check((await stockOf()) === s0 - 1, 'godown = start - 1 billed')

console.log('[restore bill]')
const cb = await call('counter_sale_save', { p_id: null, p_action: randomUUID(), p_shop: shop.id, p_mode: 'cash', p_lines: [{ variant_id: STING.variant_id, qty: 2, price_paise: 50000 }], p_discount: 0 }, a)
const id = cb.body.id
check((await stockOf()) === s0 - 3, 'counter bill 2: godown -2')
await call('void_cash_sale', { p_id: id, p_reason: 'QA test' }, a)
check((await stockOf()) === s0 - 1, 'cancelled: stock back')
check((await call('unvoid_cash_sale', { p_id: id }, a)).status === 200, 'restore ok')
check((await stockOf()) === s0 - 3, 'restored: stock out again')
check(err(await call('unvoid_cash_sale', { p_id: id }, a)) === 'NOT_VOIDED', 'restore twice refused')

console.log('[restore order]')
const tomorrowPlan = (await rest(`route_day_plan?select=id&route_id=eq.${route}&status=eq.planning&date=gt.${today}&order=date&limit=1`, a))[0]
if (tomorrowPlan) {
  await call('save_order', { p_shop_id: shop.id, p_plan_id: tomorrowPlan.id, p_lines: [{ variant_id: STING.variant_id, qty: 1, price_paise: 50000 }] }, a)
  const o = (await rest(`orders?select=id&shop_id=eq.${shop.id}&route_day_plan_id=eq.${tomorrowPlan.id}`, a))[0]
  await call('cancel_order', { p_order_id: o.id, p_reason: 'QA' }, a)
  check((await call('restore_order', { p_order_id: o.id }, a)).status === 204, 'restore order ok')
  check((await rest(`orders?select=status&id=eq.${o.id}`, a))[0].status === 'placed', 'order placed again')
} else console.log('  (no planning day ahead on Direct sales, order restore skipped)')
done()
