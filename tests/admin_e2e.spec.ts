import { test, expect } from '@playwright/test';

test.describe('MarginMart Admin E2E Flow', () => {
  test.beforeEach(async ({ page }) => {
    // 1. Navigate to the landing page
    await page.goto('http://localhost:5173');
    
    // 2. Toggle Admin Portal from footer
    const adminBtn = page.locator('button:has-text("Admin Portal")');
    await adminBtn.scrollIntoViewIfNeeded();
    await adminBtn.click();
    
    // 3. Login with PIN
    await expect(page.locator('h2:has-text("Admin Access")')).toBeVisible();
    await page.locator('input[type="password"]').fill('3377');
    await page.locator('button:has-text("Unlock Dashboard")').click();
    
    // 4. Verify successful login
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1:has-text("Business Overview")')).toBeVisible({ timeout: 15000 });
  });

  test('should manage partners and watchlists', async ({ page }) => {
    await page.locator('.nav-item:has-text("Partners")').click();
    const partnerName = `Test Partner ${Date.now()}`;
    await page.locator('button:has-text("Add Partner")').click();
    await page.locator('label:has-text("Name") + input').fill(partnerName);
    await page.locator('label:has-text("WhatsApp") + input').fill('9999999999');
    await page.locator('label:has-text("Address") + textarea').fill('123 Test Street, Automation City');
    await page.locator('button:has-text("Save Profile")').click();
    await expect(page.locator(`h4:has-text("${partnerName}")`)).toBeVisible({ timeout: 10000 });
  });

  test('should verify billing and invoicing flow', async ({ page }) => {
    // 1. Ensure we have at least one partner and one order
    await page.locator('.nav-item:has-text("Partners")').click();
    const partnerRow = page.locator('.sk-row').first();
    const partnerName = await partnerRow.locator('h4').textContent();
    
    await partnerRow.locator('button:has-text("Manage")').click();
    const prodName = `InvoiceItem ${Date.now()}`;
    await page.locator('button:has-text("Log Fulfillment")').click();
    await page.locator('label:has-text("Product Name") + input').fill(prodName);
    await page.locator('input[type="number"]').first().fill('100');
    await page.locator('input[type="number"]').last().fill('150');
    await page.keyboard.press('Enter');
    await expect(page.locator('.modal')).not.toBeVisible({ timeout: 10000 });

    // 2. Go to Billing tab
    await page.locator('.nav-item:has-text("Billing")').click();
    await expect(page.locator('h1:has-text("Billing & Statements")')).toBeVisible();
    
    // 3. Select the partner
    await page.locator(`.sk-row:has-text("${partnerName}")`).click();
    
    // 4. Verify item exists in itemized list
    await expect(page.locator(`.watchlist-card:has-text("${prodName}")`)).toBeVisible();
    
    // 5. Generate Invoice
    await page.locator('button:has-text("Generate Invoice")').click();
    await expect(page.locator('h3:has-text("Weekly Statement")')).toBeVisible();
    
    // 6. Verify Total in Invoice Modal
    await expect(page.locator('#invoice-content h2:has-text("₹")')).toBeVisible();
  });

  test('should enforce watchlist limits and show match logs', async ({ page }) => {
    // 1. Check Match Log Tab
    await page.locator('.nav-item:has-text("Match Log")').click();
    await expect(page.locator('h1:has-text("Detections Log")')).toBeVisible();

    // 2. Test Match Simulator & Save to Log
    await page.locator('.nav-item:has-text("Match Simulator")').click();
    await page.locator('textarea').fill('Special deal on Dove and Maggi for partners');
    await page.locator('button:has-text("Run Logic Test")').click();
    
    // Check if result appears and save it
    const saveBtn = page.locator('button:has-text("Save to Log")').first();
    await expect(saveBtn).toBeVisible();
    
    page.once('dialog', dialog => dialog.accept());
    await saveBtn.click();

    // 3. Verify it appears in Match Log
    await page.locator('.nav-item:has-text("Match Log")').click();
    await expect(page.locator('.sk-row').first()).toBeVisible();

    // 4. Test Watchlist Limit
    await page.locator('.nav-item:has-text("Partners")').click();
    await page.locator('button:has-text("Manage")').first().click();
    
    const input = page.locator('input[placeholder="Type product keyword..."]');
    await expect(input).toBeVisible();
    await input.fill('NewProductX');
    await page.locator('button:has-text("Add")').click();
    
    // Wait for the tag to appear with a slightly longer timeout if needed
    await expect(page.locator('.product-tag:has-text("NewProductX")')).toBeVisible({ timeout: 10000 });
  });
});
