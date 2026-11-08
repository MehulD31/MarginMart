// Discount on counter sales, live database. Run: node tests/db/discount.mjs (then tests/db/cleanup.sql)
import { randomUUID } from 'node:crypto'
import { call, check, done, env, login, rest, today } from './lib.mjs'

const t = await login('8871565551', '1234')
const cat = (await call('counter_catalog', {}, t)).body
const STING = cat.find((c) => c.label === 'Sting PET 250ml (Red)')
const route = (await rest('route?select=id&name=eq.Direct%20sales', t))[0].id
const shop = (await rest('shop', t, { method: 'POST', body: JSON.stringify({ name: 'QA DISC Shop', route_id: route }) }))[0]
const line = [{ variant_id: STING.variant_id, qty: 10, price_paise: 50000 }]   // ₹5,000
const get = async (id) => (await call('counter_sales', { p_from: today, p_to: today }, t)).body.find((b) => b.id === id)

let r = await call('counter_sale_save_into', { p_id: null, p_action: randomUUID(), p_shop: shop.id, p_mode: 'cash', p_lines: line, p_account: null, p_discount: 29500 }, t)
check(r.status === 200 && r.body.total_paise === 470500, `bill ${r.body?.number}: ₹5,000 − ₹295 = ₹4,705`, r.body)
let b = await get(r.body.id)
check(b.discount_paise === 29500, 'list shows discount ₹295')
check(b.margin_paise === 10 * (50000 - STING.buy_paise) - 29500, `margin goes down by the discount (${b.margin_paise / 100})`)
const id = r.body.id

r = await call('counter_sale_save_into', { p_id: id, p_action: randomUUID(), p_shop: shop.id, p_mode: 'cash', p_lines: line, p_account: null, p_discount: 0 }, t)
check((await get(id)).total_paise === 500000, 'edit: discount removed -> ₹5,000')
r = await call('counter_sale_save_into', { p_id: id, p_action: randomUUID(), p_shop: shop.id, p_mode: 'cash', p_lines: line, p_account: null, p_discount: 10000 }, t)
check((await get(id)).total_paise === 490000, 'edit: discount ₹100 -> ₹4,900')
r = await call('counter_sale_save_into', { p_id: id, p_action: randomUUID(), p_shop: shop.id, p_mode: 'cash', p_lines: [{ ...line[0], qty: 2 }], p_account: null, p_discount: 10000 }, t)
check((await get(id)).total_paise === 90000, 'edit: fewer cases keeps discount -> ₹1,000 − ₹100 = ₹900')

r = await call('counter_sale_save_into', { p_id: null, p_action: randomUUID(), p_shop: shop.id, p_mode: 'cash', p_lines: line, p_account: null, p_discount: 500001 }, t)
check(r.body?.message === 'DISCOUNT_TOO_BIG', 'discount bigger than bill refused', r.body)
r = await call('counter_sale_save_into', { p_id: null, p_action: randomUUID(), p_shop: shop.id, p_mode: 'cash', p_lines: line, p_account: null, p_discount: -1 }, t)
check(r.body?.message === 'INVALID_INPUT', 'negative discount refused')
r = await call('counter_sale_save_into', { p_id: id, p_action: randomUUID(), p_shop: shop.id, p_mode: 'cash', p_lines: [{ ...line[0], qty: 1 }], p_account: null, p_discount: 60000 }, t)
check(r.body?.message === 'DISCOUNT_TOO_BIG' && (await get(id)).total_paise === 90000, 'edit that makes discount > bill refused, bill unchanged')

r = await call('counter_sale_save_into', { p_id: null, p_action: randomUUID(), p_shop: shop.id, p_mode: 'upi', p_lines: line, p_account: null }, t)
check(r.status === 200 && r.body.total_paise === 500000, 'no discount sent -> full price (old callers still work)')

const bact = randomUUID()
r = await call('bot_record_sale_into', { p_key: env.KD_BOT_KEY, p_action: bact, p_shop: shop.id, p_lines: line, p_mode: 'cash', p_by: 'QA', p_account: null, p_discount: 20000 })
check(r.body.total_paise === 480000 && r.body.margin_paise === 10 * (50000 - STING.buy_paise) - 20000, 'Telegram: ₹200 off -> ₹4,800, margin down ₹200', r.body)
r = await call('bot_record_sale_into', { p_key: env.KD_BOT_KEY, p_action: bact, p_shop: shop.id, p_lines: line, p_mode: 'cash', p_by: 'QA', p_account: null, p_discount: 20000 })
check(r.body.repeat === true, 'Telegram double tap: one bill')

const day = (await call('bot_day', { p_key: env.KD_BOT_KEY, p_day: today })).body
check(day?.counter != null, `nightly numbers still build (margin ${day?.counter?.margin_paise / 100})`)

for (const x of (await call('counter_sales', { p_from: today, p_to: today }, t)).body.filter((x) => x.shop === 'QA DISC Shop')) await call('admin_delete', { p_kind: 'counter_sale', p_id: x.id }, t)
check(!(await call('counter_sales', { p_from: today, p_to: today }, t)).body.some((x) => x.shop === 'QA DISC Shop'), 'QA bills deleted')
done()
