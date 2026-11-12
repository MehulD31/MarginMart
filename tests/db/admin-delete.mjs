// DB test of admin_delete for every kind: allowed deletes, refusals with the right code, stock put back, permissions.
// Runs against the live database with real logins; makes its own "QA DEL" records and removes them again.
// Usage: node tests/db/admin-delete.mjs   (needs .env.local with VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, KD_SHEET_KEY)
import { env, call, rest, fnc, login, today, check, done, qaFixture } from './lib.mjs'
import { randomUUID } from 'node:crypto'

const admin = await login('8871565551', '1234'), driverTok = await login('1111111111', '1111')
const me = (await rest('profiles?select=user_id&phone=eq.8871565551', admin))[0].user_id
const del = (kind, id, t = admin) => call('admin_delete', { p_kind: kind, p_id: id }, t)
const code = (r) => (typeof r.body === 'object' && r.body?.message) || String(r.body)
const refused = async (kind, id, c, label) => { const r = await del(kind, id); check(r.status >= 400 && code(r) === c, `${label} -> ${c}`, r) }
const stockOf = async (vid) => (await rest(`stock?select=on_hand&variant_id=eq.${vid}`, admin))[0]?.on_hand ?? 0
const cat = (await call('counter_catalog', {}, admin)).body
// Real Sting is only used for read-only refusals; everything that moves stock or bills a shop uses the QA fixture.
const REAL_STING = cat.find((c) => c.label === 'Sting PET 250ml (Red)').variant_id
const direct0 = (await rest('route?select=id&name=eq.Direct%20sales', admin))[0]
const qa = await qaFixture((p, i) => rest(p, admin, i), direct0.id)
const STING = qa.variantId, ZERO = qa.variantId, anyShop = qa.shop.id
const s0 = await stockOf(STING), z0 = s0, realS0 = await stockOf(REAL_STING)

console.log('[permissions]')
check(code(await del('scheme', randomUUID(), driverTok)) === 'FORBIDDEN', 'driver cannot delete')
check((await call('admin_delete', { p_kind: 'scheme', p_id: randomUUID() })).status >= 400, 'logged-out cannot delete')
await refused('scheme', randomUUID(), 'NOT_FOUND', 'unknown id')
check(code(await del('nonsense', randomUUID())) === 'INVALID_INPUT', 'unknown kind refused')

console.log('[counter sale]')
let r = await call('counter_sale_save', { p_id: null, p_action: randomUUID(), p_shop: anyShop, p_mode: 'cash', p_lines: [{ variant_id: STING, qty: 4, price_paise: 50000 }] }, admin)
const billA = r.body
check((await stockOf(STING)) === s0 - 4, `bill ${billA.number} took 4 Sting`)
check((await del('counter_sale', billA.id)).status === 204 && (await stockOf(STING)) === s0, 'delete live bill: gone, stock back')
check(!(await call('counter_sales', { p_from: today, p_to: today }, admin)).body.some((b) => b.id === billA.id), 'bill no longer listed in the app')
check(!(await call('sheet_rows', { p_key: env.KD_SHEET_KEY, p_after: 0 })).body.some((x) => x.bill_no === billA.number), 'bill gone from the sheet feed')
r = await call('counter_sale_save', { p_id: null, p_action: randomUUID(), p_shop: anyShop, p_mode: 'cash', p_lines: [{ variant_id: STING, qty: 2, price_paise: 50000 }] }, admin)
await call('void_cash_sale', { p_id: r.body.id, p_reason: 'qa' }, admin)
check((await stockOf(STING)) === s0 && (await del('counter_sale', r.body.id)).status === 204 && (await stockOf(STING)) === s0, 'delete cancelled bill: stock unchanged (already back)')

console.log('[purchase + supplier]')
const supp = (await rest('supplier', admin, { method: 'POST', body: JSON.stringify({ name: 'QA DEL Supplier' }) }))[0]
r = await call('record_purchase', { p_supplier_id: supp.id, p_invoice_no: 'QA-DEL-1', p_date: today, p_lines: [{ variant_id: ZERO, qty: 3, cost_paise: 30000 }], p_note: 'qa' }, admin)
const pur = (await rest('purchase?select=id&invoice_no=eq.QA-DEL-1', admin))[0]
check(pur && (await stockOf(ZERO)) === z0 + 3, 'purchase added 3 cases', r)
const sold = (await call('counter_sale_save', { p_id: null, p_action: randomUUID(), p_shop: anyShop, p_mode: 'cash', p_lines: [{ variant_id: ZERO, qty: 2, price_paise: 50000 }] }, admin)).body
await refused('purchase', pur.id, 'PURCHASE_STOCK_USED', 'purchase whose cases were sold')
await refused('supplier', supp.id, 'SUPPLIER_HAS_PURCHASES', 'supplier with purchases')
await del('counter_sale', sold.id)
check((await del('purchase', pur.id)).status === 204 && (await stockOf(ZERO)) === z0, 'delete purchase: gone, its cases taken out of stock')
check((await del('supplier', supp.id)).status === 204, 'delete supplier without purchases')
const realSupp = (await rest('supplier?select=id,name&order=name&limit=5', admin)).find((s) => s.name !== 'QA DEL Supplier')
if (realSupp) await refused('supplier', realSupp.id, 'SUPPLIER_HAS_PURCHASES', `real supplier (${realSupp.name}) protected`)

console.log('[route, order, vehicle, user]')
const isoDow = ((new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).getDay() + 6) % 7) + 1
const route = (await rest('route', admin, { method: 'POST', body: JSON.stringify({ name: 'QA DEL Route', visit_days: [isoDow] }) }))[0]
const shop = (await rest('shop', admin, { method: 'POST', body: JSON.stringify({ name: 'QA DEL Shop', route_id: route.id }) }))[0]
await refused('route', route.id, 'ROUTE_HAS_SHOPS', 'route with a shop')
const direct = (await rest('route?select=id&name=eq.Direct%20sales', admin))[0]
await refused('route', direct.id, 'ROUTE_PROTECTED', 'Direct sales route (used by the bot)')
const plan = (await rest(`route_day_plan?select=id&route_id=eq.${route.id}&date=eq.${today}`, admin))[0]
let o = await call('save_order', { p_shop_id: shop.id, p_plan_id: plan.id, p_lines: [{ variant_id: STING, qty: 1 }] }, admin)
check(o.status === 200, 'order placed', o)
check((await del('order', o.body.order_id)).status === 204 && !(await rest(`orders?select=id&id=eq.${o.body.order_id}`, admin)).length, 'delete a placed order')
o = await call('save_order', { p_shop_id: shop.id, p_plan_id: plan.id, p_lines: [{ variant_id: STING, qty: 1 }] }, admin)
const veh = (await rest('vehicle?select=id&name=eq.Vehicle%201', admin))[0]
const drv = (await rest('profiles?select=user_id&phone=eq.1111111111', admin))[0]
const lock = await call('lock_load', { p_plan_id: plan.id, p_vehicle_id: veh.id, p_driver_id: drv.user_id, p_spares: [] }, admin)
check(lock.status < 300, 'truck loaded', lock)
await refused('order', o.body.order_id, 'ORDER_LOCKED', 'order on a loaded truck')
await refused('user', drv.user_id, 'USER_HAS_HISTORY', 'driver login with trips')
await refused('vehicle', veh.id, 'VEHICLE_HAS_LOGIN', 'vehicle with a driver login')
const unlock = await call('unlock_load', { p_plan_id: plan.id }, admin)
check(unlock.status < 300 && (await stockOf(STING)) === s0, 'unloaded again, stock back', unlock)
await rest(`route_day_plan?id=eq.${plan.id}`, admin, { method: 'PATCH', body: JSON.stringify({ driver_id: null, vehicle_id: null }) })
check((await call('delete_shop', { p_shop_id: shop.id }, admin)).status >= 400, 'shop with an order cannot be deleted (existing rule)')
await del('order', o.body.order_id)
check((await call('delete_shop', { p_shop_id: shop.id }, admin)).status === 204, 'shop deleted after its order')
await refused('route', route.id, 'ROUTE_HAS_ORDERS', 'route whose truck was loaded once (history)')
const fresh = (await rest('route', admin, { method: 'POST', body: JSON.stringify({ name: 'QA DEL Route 2', visit_days: [1, 4] }) }))[0]
check((await rest(`route_day_plan?select=id&route_id=eq.${fresh.id}`, admin)).length > 0, 'new route got its delivery days')
check((await del('route', fresh.id)).status === 204 && !(await rest(`route?select=id&id=eq.${fresh.id}`, admin)).length && !(await rest(`route_day_plan?select=id&route_id=eq.${fresh.id}`, admin)).length, 'delete unused route (+ its empty delivery days)')
const v2 = (await rest('vehicle', admin, { method: 'POST', body: JSON.stringify({ name: 'QA DEL Van', capacity_cases: 50 }) }))[0]
check((await del('vehicle', v2.id)).status === 204, 'delete unused vehicle')
await refused('user', me, 'CANNOT_DELETE_SELF', 'own login')
const qaPhone = '6' + String(Date.now()).slice(-9)
const made = await fnc('admin-users', { action: 'create', role: 'manager', name: 'QA DEL Manager', phone: qaPhone }, admin)
check(!!made.user_id, 'made a test login', made)
check((await del('user', made.user_id)).status === 204 && !(await rest(`profiles?select=user_id&user_id=eq.${made.user_id}`, admin)).length, 'delete a login without history')
check(!!(await fnc('pin-login', { phone: qaPhone, pin: made.pin })).error, 'deleted login can no longer sign in')

console.log('[scheme, catalogue, join request]')
const anyPack = { id: qa.packId }
const sch = (await rest('scheme', admin, { method: 'POST', body: JSON.stringify({ pack_id: anyPack.id, kind: 'pass_through', amount_paise: 1000, starts_on: today, ends_on: today, note: 'QA DEL' }) }))[0]
check((await del('scheme', sch.id)).status === 204, 'delete a scheme')
await refused('variant', REAL_STING, 'ITEM_IN_USE', 'Sting (has stock and history)')
const stingPack = (await rest(`variant?select=pack_id&id=eq.${REAL_STING}`, admin))[0].pack_id
await refused('pack', stingPack, 'ITEM_IN_USE', 'Sting pack')
const brand = (await rest('brand?select=id&limit=1', admin))[0]
const pk = (await rest('pack', admin, { method: 'POST', body: JSON.stringify({ brand_id: brand.id, name_en: 'QA DEL Pack', units_per_case: 24, mrp_paise: 2000 }) }))[0]
const v1 = (await rest('variant', admin, { method: 'POST', body: JSON.stringify({ pack_id: pk.id, flavour_en: 'QA Flavour A' }) }))[0]
await rest('variant', admin, { method: 'POST', body: JSON.stringify({ pack_id: pk.id, flavour_en: 'QA Flavour B' }) })
check((await del('variant', v1.id)).status === 204, 'delete an unused flavour')
check((await del('pack', pk.id)).status === 204 && !(await rest(`variant?select=id&pack_id=eq.${pk.id}`, admin)).length, 'delete an unused product with its flavours')
await call('submit_join_request', { p_phone: '6' + String(Date.now() + 5).slice(-9), p_shop_name: 'QA DEL Join', p_owner_name: 'QA', p_address: 'x' })
const jr = (await rest('join_requests?select=id&shop_name=eq.QA%20DEL%20Join', admin))[0]
check(jr && (await del('join_request', jr.id)).status === 204, 'delete a join request', jr)

console.log('[change history + stock]')
const log = await rest('audit_log?select=table_name,action&action=eq.delete&order=id.desc&limit=40', admin)
check(['counter_sale', 'purchase', 'supplier', 'order', 'route', 'vehicle', 'user', 'scheme', 'variant', 'pack', 'join_request'].every((k) => log.some((x) => x.table_name === k)), 'every delete is in Change history')
check((await stockOf(STING)) === s0, 'QA stock exactly as before the test')
check((await stockOf(REAL_STING)) === realS0, 'real Sting stock never touched')
await qa.hide()
done()
