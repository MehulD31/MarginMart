// Pieces (partial cases) on the live database, with the hidden QA item only (24 per case): a truck bill of 18 pieces, 6 come back,
// a counter sale of 6 pieces. Removes its own data at the end (qa_cleanup).
import { randomUUID } from 'node:crypto'
import { call, check, done, login, qaFixture, rest, today } from './lib.mjs'

const admin = await login('8871565551', '1234')
const err = (r) => r.body?.message
const num = (x) => Number(x)
const route = (await rest('route?select=id&name=eq.Direct%20sales', admin))[0].id
const qa = await qaFixture((p, i) => rest(p, admin, i), route)
const V = qa.variantId, shop = qa.shop
const stockOf = async () => num((await rest(`stock?select=on_hand&variant_id=eq.${V}`, admin))[0]?.on_hand ?? 0)
const van = (await rest('vehicle', admin, { method: 'POST', body: JSON.stringify({ name: 'QA Van Pieces', capacity_cases: 20 }) }))[0]
check(van?.id && shop?.id, 'QA van + QA shop made')

await call('adjust_stock', { p_variant_id: V, p_mode: 'count', p_qty: 10, p_reason: 'QA pieces test' }, admin)
check((await stockOf()) === 10, 'QA item: 10 cases in the godown')
const rate = 52800   // ₹528 per case of 24 -> ₹22 a piece
const cat = (await call('counter_catalog', {}, admin)).body
check(cat.find((c) => c.variant_id === V)?.units === 24, 'catalog tells the form: 24 pieces per case', cat.find((c) => c.variant_id === V))

console.log('[truck: 2 cases out, 18 pieces sold, 6 pieces back]')
const plan = (await call('trip_open', { p_vehicle: van.id, p_date: today }, admin)).body
let r = await call('trip_load', { p_plan: plan, p_driver: null, p_lines: [{ variant_id: V, qty: 2 }] }, admin)
check(r.status === 200 && (await stockOf()) === 8, 'loaded 2 cases: godown 8', r.body)
const bill = (qty, extra = {}) => call('counter_sale_save_into', { p_id: null, p_action: randomUUID(), p_shop: shop.id, p_mode: 'cash',
  p_lines: [{ variant_id: V, qty, price_paise: rate }], p_account: null, p_discount: 0, p_plan: plan, ...extra }, admin)
r = await bill(0.7)
check(err(r) === 'INVALID_INPUT', '0.7 case is not a whole number of pieces (16.8) -> refused', r.body)
r = await bill(2.25)
check(err(r) === 'NOT_ON_TRUCK', 'more than the truck has (2.25 of 2) -> refused', r.body)
r = await bill(0.75)
check(r.status === 200 && r.body.total_paise === 39600, '18 pieces = 0.75 case = ₹396 (18 x ₹22)', r.body)
const billId = r.body.id
check((await stockOf()) === 8, 'truck bill does not touch godown stock')
let d = (await call('trip_detail', { p_plan: plan }, admin)).body
const it = () => d.items.find((x) => x.variant_id === V)
check(num(it().billed) === 0.75 && num(it().left) === 1.25 && it().units === 24, 'truck shows billed 0.75, left 1.25 (1 case 6 pieces)', it())
r = await call('trip_unload', { p_plan: plan, p_returned: [{ variant_id: V, qty: 1.5 }] }, admin)
check(err(r) === 'MORE_THAN_ON_TRUCK', 'cannot bring back more than is left', r.body)
r = await call('trip_unload', { p_plan: plan, p_returned: [{ variant_id: V, qty: 1.25 }] }, admin)
check(r.status === 200 && (await stockOf()) === 9.25, '1 case + 6 pieces came back: godown 9.25', r.body)
d = (await call('trip_detail', { p_plan: plan }, admin)).body
check(num(it().left) === 0 && num(it().returned) === 1.25, 'nothing unaccounted: left 0', it())
const carry = await rest(`vehicle_carry?select=qty&vehicle_id=eq.${van.id}`, admin)
check(carry.length === 1 && Number(carry[0].qty) === 1, 'only the whole case stays on the truck for tomorrow (the 6 pieces are in the godown)', carry)
r = await call('trip_close', { p_plan: plan, p_reason: null }, admin)
check(r.status === 200 && r.body.short === 0, 'trip closes with no shortage', r.body)

console.log('[counter sale of pieces + edit + cancel]')
r = await call('counter_sale_save_into', { p_id: null, p_action: randomUUID(), p_shop: shop.id, p_mode: 'upi', p_lines: [{ variant_id: V, qty: 0.25, price_paise: rate }], p_account: null, p_discount: 0 }, admin)
check(r.status === 200 && r.body.total_paise === 13200 && (await stockOf()) === 9, '6 pieces at the counter = ₹132, godown 9.25 -> 9', r.body)
const sid = r.body.id
r = await call('counter_sale_save_into', { p_id: sid, p_action: randomUUID(), p_shop: shop.id, p_mode: 'upi', p_lines: [{ variant_id: V, qty: 0.5, price_paise: rate }], p_account: null, p_discount: 0 }, admin)
check(r.status === 200 && r.body.total_paise === 26400 && (await stockOf()) === 8.75, 'edit to 12 pieces = ₹264, godown 8.75', r.body)
const sales = (await call('counter_sales', { p_from: today, p_to: today }, admin)).body
check(Number(sales.find((x) => x.id === sid)?.lines?.[0]?.qty) === 0.5, 'counter sales list shows the line as 0.5 case')
r = await call('admin_delete', { p_kind: 'counter_sale', p_id: sid }, admin)
check(r.status < 300 && (await stockOf()) === 9.25, 'deleting the bill puts the 12 pieces back: godown 8.75 -> 9.25', r.body)
const rep = await call('sales_report', { p_from: today, p_to: today }, admin)
check(rep.status === 200, 'sales report still works with pieces', rep.status === 200 ? '' : rep.body)
const ms = await call('month_stats', {}, admin)
check(ms.status === 200, 'month stats still work', ms.status === 200 ? '' : ms.body)
for (const fn of ['stock_watch', 'trip_board']) {
  const x = await call(fn, fn === 'trip_board' ? { p_date: today } : {}, admin)
  check(x.status === 200, `${fn} still works`, x.status === 200 ? '' : x.body)
}
void billId
done()
