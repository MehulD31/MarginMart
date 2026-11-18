// Part paid / not paid bills and the Khata, with the hidden QA item and a QA shop only. Run: node tests/db/partpaid.mjs
import { randomUUID } from 'node:crypto'
import { call, check, done, login, rest, today } from './lib.mjs'
const admin = await login('8871565551', '1234')
const driver = await login('1111111111', '1111')
const err = (r) => r.body?.message
const fx = (await call('qa_fixture', {}, admin)).body
await rest(`pack?id=eq.${fx.pack_id}`, admin, { method: 'PATCH', body: JSON.stringify({ active: true }) })
await call('adjust_stock', { p_variant_id: fx.variant_id, p_mode: 'count', p_qty: 20, p_reason: 'QA part-paid test' }, admin)
const route = (await rest('route?select=id&name=eq.Direct%20sales', admin))[0].id
const shop = (await rest('shop', admin, { method: 'POST', body: JSON.stringify({ name: 'QA PARTPAID Shop', route_id: route }) }))[0]
const bal = async () => Number((await rest(`v_shop_balance?select=balance_paise&shop_id=eq.${shop.id}`, admin))[0]?.balance_paise ?? 0)
const items = async () => (await call('khata_open_items', { p_shop: shop.id }, admin)).body
const line = (qty) => ({ variant_id: fx.variant_id, qty, price_paise: 10000 })
const save = (id, qty, received, action = randomUUID()) => call('counter_sale_save_into', { p_id: id, p_action: action, p_shop: shop.id, p_mode: 'cash', p_lines: [line(qty)], p_account: null, p_discount: 0, p_plan: null, p_received: received }, admin)

let r = await save(null, 2, 5000)
const id = r.body?.id
check(r.status === 200 && r.body.total_paise === 20000 && r.body.received_paise === 5000, 'bill 200, received 50', r.body)
check((await bal()) === 15000, 'Khata shows 150 due')
let it = await items()
check(it.length === 1 && it[0].remaining_paise === 15000 && it[0].label === r.body.number, 'open items: this bill, 150 left', it)
check(err(await save(null, 1, 20000)) === 'PAID_MORE_THAN_BILL', 'cannot receive more than the bill')
check(err(await call('khata_open_items', {}, driver)) === 'FORBIDDEN', 'driver cannot see dues')

r = await call('record_payment_into', { p_action_id: randomUUID(), p_shop_id: shop.id, p_mode: 'cash', p_amount_paise: 6000, p_upi_ref: null, p_note: null, p_account: null }, admin)
check(r.status === 200 && (await bal()) === 9000, 'later payment of 60: 90 left')
it = await items()
check(it[0].remaining_paise === 9000 && it[0].paid_paise === 6000, 'bill now 90 left, 60 matched', it)

r = await save(id, 3, 5000, randomUUID())
check(r.status === 200 && (await bal()) === 19000, 'edit to 3 cases: 300 - 50 - 60 = 190 due')
r = await save(id, 3, 0)
check((await bal()) === 24000, 'not paid at all: 300 - 60 = 240 due')
let pays = (await call('money_payments', { p_from: today, p_to: today }, admin)).body
check(!pays.some((p) => p.ref_id === id), 'an unpaid bill is not counted as money received')
r = await save(id, 3, null)
check((await bal()) === -6000, 'fully paid again: only the later 60 is left as advance')
pays = (await call('money_payments', { p_from: today, p_to: today }, admin)).body
check(pays.some((p) => p.ref_id === id && p.amount_paise === 30000), 'fully paid bill counts 300 received')

r = await save(id, 3, 10000)
check((await bal()) === 14000, 'part paid 100 of 300 -> 200 - 60 = 140 due')
r = await call('admin_delete', { p_kind: 'counter_sale', p_id: id }, admin)
check(r.status < 300 && (await bal()) === -6000, 'deleting the bill releases its due', r.status)
done()
