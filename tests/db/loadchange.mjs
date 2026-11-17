// Change the load of a truck after selling has started (QA Van + QA shop only). Run: node tests/db/loadchange.mjs
import { randomUUID } from 'node:crypto'
import { call, check, done, login, rest, today } from './lib.mjs'
const admin = await login('8871565551', '1234')
const driver = await login('1111111111', '1111')
const err = (r) => r.body?.message
const cat = (await call('counter_catalog', {}, admin)).body
const STING = cat.find((c) => c.label === 'Sting PET 250ml (Red)').variant_id
const NIMBOOZ = cat.find((c) => /^Nimbooz/.test(c.label)).variant_id
const stockOf = async (v) => (await rest(`stock?select=on_hand&variant_id=eq.${v}`, admin))[0].on_hand
const s0 = await stockOf(STING), n0 = await stockOf(NIMBOOZ)
const van = (await rest('vehicle', admin, { method: 'POST', body: JSON.stringify({ name: 'QA Van', capacity_cases: 20 }) }))[0]
const route = (await rest('route?select=id&name=eq.Direct%20sales', admin))[0].id
const shop = (await rest('shop', admin, { method: 'POST', body: JSON.stringify({ name: 'QA LOADCHANGE Shop', route_id: route }) }))[0]
const plan = (await call('trip_open', { p_vehicle: van.id, p_date: today }, admin)).body
let r = await call('trip_load', { p_plan: plan, p_driver: null, p_lines: [{ variant_id: STING, qty: 4 }] }, admin)
check(r.status === 200, 'load 4 Sting')
const line = (v, qty) => ({ variant_id: v, qty, price_paise: 50000 })
r = await call('counter_sale_save_into', { p_id: null, p_action: randomUUID(), p_shop: shop.id, p_mode: 'cash', p_lines: [line(STING, 3)], p_account: null, p_discount: 0, p_plan: plan }, admin)
check(r.status === 200, 'bill 3 Sting from the truck')
r = await call('trip_load', { p_plan: plan, p_driver: null, p_lines: [{ variant_id: STING, qty: 5 }] }, admin)
check(err(r) === 'TRIP_STARTED', 'normal change is locked once selling started')
check(err(await call('trip_load_change', { p_plan: plan, p_lines: [{ variant_id: STING, qty: 4 }] }, driver)) === 'FORBIDDEN', 'driver cannot change the load')
r = await call('trip_load_change', { p_plan: plan, p_lines: [{ variant_id: STING, qty: 2 }] }, admin)
check(err(r) === 'BELOW_SOLD', 'cannot go below what is sold (3)', r.body)
r = await call('trip_load_change', { p_plan: plan, p_lines: [{ variant_id: STING, qty: s0 + 50 }] }, admin)
check(err(r) === 'NOT_ENOUGH_STOCK', 'cannot add more than the godown has')
r = await call('trip_load_change', { p_plan: plan, p_lines: [{ variant_id: STING, qty: 4 }, { variant_id: NIMBOOZ, qty: 2 }] }, admin)
check(r.status === 200 && r.body.added === 2 && r.body.removed === 0, 'forgotten item added (Nimbooz 2)', r.body)
check((await stockOf(NIMBOOZ)) === n0 - 2 && (await stockOf(STING)) === s0 - 4, 'godown stock follows')
let d = (await call('trip_detail', { p_plan: plan }, admin)).body
const it = (v) => d.items.find((x) => x.variant_id === v)
check(it(NIMBOOZ).loaded === 2 && it(NIMBOOZ).left === 2 && it(STING).left === 1, 'truck shows the new load')
r = await call('trip_load_change', { p_plan: plan, p_lines: [{ variant_id: STING, qty: 3 }] }, admin)
check(r.status === 200 && r.body.removed === 3, 'take back the unsold part (Sting 4 -> 3, Nimbooz 2 -> 0)', r.body)
check((await stockOf(NIMBOOZ)) === n0 && (await stockOf(STING)) === s0 - 3, 'stock back in the godown')
r = await call('trip_load_change', { p_plan: plan, p_lines: [{ variant_id: STING, qty: 5 }] }, admin)
check(r.status === 200, 'Sting 3 -> 5 (2 spare)')
r = await call('trip_unload', { p_plan: plan, p_returned: [{ variant_id: STING, qty: 2 }], p_keep: false }, admin)
check(r.status === 200, 'truck comes back with 2')
r = await call('trip_load_change', { p_plan: plan, p_lines: [{ variant_id: STING, qty: 4 }] }, admin)
check(err(r) === 'BELOW_SOLD', 'after coming back, load cannot go below sold + came back')
r = await call('trip_load_change', { p_plan: plan, p_lines: [{ variant_id: STING, qty: 6 }] }, admin)
check(r.status === 200, 'forgotten case added even after Came back')
d = (await call('trip_detail', { p_plan: plan }, admin)).body
check(it(STING).loaded === 6 && it(STING).left === 1, 'the extra case shows as due (parchi not entered)')
done()
