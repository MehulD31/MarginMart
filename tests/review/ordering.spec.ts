/* eslint-disable no-empty-pattern -- Playwright needs a fixtures object even when unused */
import { expect, test } from '@playwright/test'
import { ACCOUNTS, isPhone, login, rest, screenIsSound, SUPABASE_URL, ANON, token, watchErrors } from './helpers'

async function rpc(tok: string, name: string, args: unknown) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}

// Start every ordering test from a clean slate for the QA shop.
test.beforeEach(async ({}, info) => {
  const tok = await token(ACCOUNTS.shop)
  await rpc(tok, 'save_order', { p_lines: [] })
  void info
})

test.describe('Shop owner orders', () => {
  test('places, changes and cancels an order on the phone', async ({ page }) => {
    const errors = watchErrors(page)
    // Clear any saved cart once, not on every load, so the reload check below is real.
    await page.addInitScript(() => { if (!sessionStorage.getItem('qa-cleared')) { for (const k of Object.keys(localStorage)) if (k.startsWith('cart:')) localStorage.removeItem(k); sessionStorage.setItem('qa-cleared', '1') } })
    await login(page, ACCOUNTS.shop)
    await expect(page.getByText('Next delivery')).toBeVisible()
    await expect(page.getByText(/Order by/)).toBeVisible()
    await screenIsSound(page, 'shop order screen')

    // 300ml Can has five flavours; add 2 Pepsi and 1 Mirinda.
    const can = page.locator('.product', { has: page.getByRole('heading', { name: '300ml Can' }) })
    await expect(can.getByText('You earn ₹185')).toBeVisible()
    await can.getByRole('button', { name: 'Add: Pepsi · 300ml Can' }).click()
    await can.getByRole('button', { name: 'One more Pepsi · 300ml Can' }).click()
    await can.getByRole('button', { name: 'Add: Mirinda · 300ml Can' }).click()
    const bar = page.getByRole('region', { name: 'Your order' })
    await expect(bar).toContainText('3 cases · ₹2,325')

    // The cart survives a reload (dropped network, closed tab).
    await page.reload()
    await expect(page.getByRole('region', { name: 'Your order' })).toContainText('3 cases')

    await page.getByRole('button', { name: 'View' }).click()
    const sheet = page.getByRole('dialog')
    await expect(sheet.getByText('₹2,325').last()).toBeVisible()
    await screenIsSound(page, 'cart sheet')
    await sheet.getByRole('button', { name: 'Place order' }).click()
    await expect(page.getByRole('dialog', { name: 'Order placed' })).toBeVisible()
    await page.getByRole('button', { name: 'OK' }).click()

    // Saved order comes back into the cart; change it and update.
    await expect(page.getByText(/Your order is saved: 3 cases/)).toBeVisible()
    await page.getByRole('button', { name: 'One more Mirinda · 300ml Can' }).click()
    await expect(page.getByText('Changes not saved yet')).toBeVisible()
    await page.getByRole('button', { name: 'View' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Update order' }).click()
    await page.getByRole('button', { name: 'OK' }).click()

    await page.getByRole('link', { name: 'My orders' }).click()
    const card = page.locator('article').first()
    await expect(card).toContainText('4 cases · ₹3,100')
    await expect(card).toContainText('Placed')
    await screenIsSound(page, 'my orders')
    await card.getByRole('button', { name: 'Cancel order' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel order' }).click()
    await expect(page.getByText('Order cancelled.')).toBeVisible()
    await expect(page.locator('article').first()).toContainText('Cancelled')
    expect(errors).toEqual([])
  })

  test('Hindi ordering screen reads in Hindi', async ({ page }) => {
    await login(page, ACCOUNTS.shop)
    await page.getByRole('button', { name: 'हिंदी में बदलें' }).click()
    await expect(page.getByText('अगली डिलीवरी')).toBeVisible()
    await expect(page.getByRole('link', { name: 'मेरे ऑर्डर' })).toBeVisible()
    await screenIsSound(page, 'shop hindi')
  })
})

test.describe('Ordering rules held by the database', () => {
  test.beforeEach(({}, info) => test.skip(isPhone(info), 'API checks run once'))

  test('shop cannot order for another shop, pick a plan, or send bad quantities', async () => {
    const tok = await token(ACCOUNTS.shop)
    const variant = (await rest(tok, 'variant?select=id&flavour_en=eq.Pepsi&limit=1')).body[0].id
    const other = await rest(await token(ACCOUNTS.admin), 'shop?select=id&name=eq.QA%20Shop%20Two')
    const asOther = await rpc(tok, 'save_order', { p_lines: [{ variant_id: variant, qty: 1 }], p_shop_id: other.body[0].id })
    expect(asOther.body.message).toBe('FORBIDDEN')
    for (const qty of [0, -1, 1000, 1.5, '3; drop table orders']) {
      const r = await rpc(tok, 'save_order', { p_lines: [{ variant_id: variant, qty }] })
      expect(r.body?.message, `qty ${JSON.stringify(qty)}`).toBe('ITEM_UNAVAILABLE')
    }
    const dup = await rpc(tok, 'save_order', { p_lines: [{ variant_id: variant, qty: 1 }, { variant_id: variant, qty: 2 }] })
    expect(dup.body.message).toBe('INVALID_INPUT')
    const direct = await rest(tok, 'orders', { method: 'POST', body: JSON.stringify({ shop_id: other.body[0].id }) })
    expect(direct.status).toBeGreaterThanOrEqual(400)
  })

  test('orders keep the price they were placed at, and totals are right', async () => {
    const tok = await token(ACCOUNTS.shop)
    const v = (await rest(tok, 'variant?select=id,pack!inner(name_en)&pack.name_en=eq.Slice%201.2L')).body[0].id
    const r = await rpc(tok, 'save_order', { p_lines: [{ variant_id: v, qty: 2 }] })
    expect(r.body.total_paise).toBe(84000) // 2 × ₹420 net rate after BOGO scheme
    const line = (await rest(tok, `order_line?select=unit_price_paise,trade_price_paise,scheme_value_paise,mrp_paise&order_id=eq.${r.body.order_id}`)).body[0]
    expect(line).toEqual({ unit_price_paise: 42000, trade_price_paise: 71000, scheme_value_paise: 29000, mrp_paise: 7000 })
    await rpc(tok, 'save_order', { p_lines: [] })
  })

  test('each role sees only what it should', async () => {
    const shopTok = await token(ACCOUNTS.shop)
    const v = (await rest(shopTok, 'variant?select=id,pack!inner(name_en)&flavour_en=eq.Pepsi&pack.name_en=eq.300ml%20Can')).body[0].id
    const placed = await rpc(shopTok, 'save_order', { p_lines: [{ variant_id: v, qty: 1 }] })
    const driverTok = await token(ACCOUNTS.driver)
    expect((await rest(driverTok, 'orders?select=id')).body).toEqual([])
    expect((await rpc(driverTok, 'save_order', { p_lines: [] })).body.message).toBe('FORBIDDEN')
    const mgrTok = await token(ACCOUNTS.manager)
    expect((await rest(mgrTok, `orders?select=id&id=eq.${placed.body.order_id}`)).body).toHaveLength(1)
    // Manager can take a phoned-in order for the shop.
    const shopId = (await rest(shopTok, 'shop?select=id')).body[0].id
    const byMgr = await rpc(mgrTok, 'save_order', { p_lines: [{ variant_id: v, qty: 5 }], p_shop_id: shopId })
    expect(byMgr.body.order_id).toBe(placed.body.order_id)
    expect(byMgr.body.total_paise).toBe(5 * 77500)
    await rpc(shopTok, 'save_order', { p_lines: [] })
  })
})
