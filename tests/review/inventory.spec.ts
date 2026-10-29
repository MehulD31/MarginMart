import { expect, test } from '@playwright/test'
import { ACCOUNTS, login, rest, screenIsSound, token, watchErrors } from './helpers'

// Read-only checks plus permission probes; no stock is changed.
test('admin sees inventory, purchases and low stock', async ({ page }, info) => {
  const errors = watchErrors(page)
  await login(page, ACCOUNTS.admin)
  await page.goto('/admin/inventory')
  await expect(page.getByRole('heading', { name: 'Inventory', level: 1 })).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible()
  await screenIsSound(page, 'inventory')
  await page.screenshot({ path: `scratch/inv-${info.project.name}.png`, fullPage: true })
  await page.getByRole('button', { name: 'Edit' }).first().click()
  await expect(page.getByRole('heading', { name: 'Adjust stock' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save adjustment' })).toBeDisabled()
  await page.screenshot({ path: `scratch/inv-sheet-${info.project.name}.png` })
  await page.keyboard.press('Escape')
  await page.goto('/admin/purchases')
  await expect(page.getByRole('heading', { name: 'Purchases', level: 1 })).toBeVisible()
  await screenIsSound(page, 'purchases')
  await page.screenshot({ path: `scratch/pur-${info.project.name}.png`, fullPage: true })
  expect(errors).toEqual([])
})

test('only admin changes stock; shops cannot read it but still get every item', async () => {
  const [admin, manager, shop] = await Promise.all([token(ACCOUNTS.admin), token(ACCOUNTS.manager), token(ACCOUNTS.shop)])
  const v = (await rest(admin, 'variant?select=id&limit=1')).body[0].id
  const bad = await rest(manager, 'rpc/adjust_stock', { method: 'POST', body: JSON.stringify({ p_variant_id: v, p_mode: 'delta', p_qty: 1, p_reason: 'qa' }) })
  expect(bad.body?.message).toBe('FORBIDDEN')
  const shopAdj = await rest(shop, 'rpc/set_stock_threshold', { method: 'POST', body: JSON.stringify({ p_variant_id: v, p_threshold: 1 }) })
  expect(shopAdj.body?.message).toBe('FORBIDDEN')
  expect((await rest(shop, 'stock?select=variant_id')).body).toEqual([])
  expect((await rest(shop, 'supplier?select=id')).body).toEqual([])
  const all = (await rest(admin, 'variant?select=id&active=eq.true')).body.length
  expect((await rest(shop, 'variant?select=id&active=eq.true')).body.length).toBe(all)
})
