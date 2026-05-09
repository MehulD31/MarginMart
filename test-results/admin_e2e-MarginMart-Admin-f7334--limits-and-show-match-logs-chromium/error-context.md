# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin_e2e.spec.ts >> MarginMart Admin E2E Flow >> should enforce watchlist limits and show match logs
- Location: tests\admin_e2e.spec.ts:67:3

# Error details

```
Error: dialog.accept: Cannot accept dialog which is already handled!
```

```
Error: locator.click: Test ended.
Call log:
  - waiting for locator('button:has-text("Add")')
    - locator resolved to <button class="btn-pro-primary">…</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not stable
    - retrying click action
    - waiting 20ms

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - complementary [ref=e5]:
    - generic [ref=e6]:
      - img [ref=e7]
      - generic [ref=e9]: MarginMart ADMIN PRO
    - navigation [ref=e10]:
      - button "Overview" [ref=e11] [cursor=pointer]:
        - img [ref=e12]
        - text: Overview
      - button "Partners" [ref=e17] [cursor=pointer]:
        - img [ref=e18]
        - text: Partners
      - button "Match Simulator" [ref=e23] [cursor=pointer]:
        - img [ref=e24]
        - text: Match Simulator
      - button "Fulfillment" [ref=e28] [cursor=pointer]:
        - img [ref=e29]
        - text: Fulfillment
      - button "Match Log" [ref=e33] [cursor=pointer]:
        - img [ref=e34]
        - text: Match Log
      - button "Billing" [ref=e37] [cursor=pointer]:
        - img [ref=e38]
        - text: Billing
      - button "Exit Admin" [ref=e42] [cursor=pointer]:
        - img [ref=e43]
        - text: Exit Admin
  - main [ref=e45]:
    - generic [ref=e46]:
      - generic [ref=e47]:
        - button "Back" [ref=e48] [cursor=pointer]:
          - img [ref=e49]
          - text: Back
        - generic [ref=e51]: T
        - heading "Test Partner 1778322740863" [level=2] [ref=e52]
        - generic [ref=e53]:
          - button "Log Fulfillment" [ref=e54] [cursor=pointer]:
            - img [ref=e55]
            - text: Log Fulfillment
          - button "Edit Profile" [ref=e58] [cursor=pointer]:
            - img [ref=e59]
            - text: Edit Profile
      - generic [ref=e61]:
        - generic [ref=e62]:
          - textbox "Type product keyword..." [active] [ref=e63]: NewProductX
          - button "Add" [ref=e64] [cursor=pointer]:
            - img [ref=e65]
            - text: Add
        - generic [ref=e66]:
          - button "+ Dove" [ref=e67] [cursor=pointer]
          - button "+ Maggi" [ref=e68] [cursor=pointer]
          - button "+ Pampers" [ref=e69] [cursor=pointer]
          - button "+ Atta" [ref=e70] [cursor=pointer]
          - button "+ Surf Excel" [ref=e71] [cursor=pointer]
          - button "+ Cooking Oil" [ref=e72] [cursor=pointer]
          - button "+ Rice" [ref=e73] [cursor=pointer]
          - button "+ Sugar" [ref=e74] [cursor=pointer]
          - button "+ Shampoo" [ref=e75] [cursor=pointer]
          - button "+ Soap" [ref=e76] [cursor=pointer]
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | test.describe('MarginMart Admin E2E Flow', () => {
  4   |   test.beforeEach(async ({ page }) => {
  5   |     // 1. Navigate to the landing page
  6   |     await page.goto('http://localhost:5173');
  7   |     
  8   |     // 2. Toggle Admin Portal from footer
  9   |     const adminBtn = page.locator('button:has-text("Admin Portal")');
  10  |     await adminBtn.scrollIntoViewIfNeeded();
  11  |     await adminBtn.click();
  12  |     
  13  |     // 3. Login with PIN
  14  |     page.on('dialog', dialog => dialog.dismiss()); 
  15  |     await expect(page.locator('h2:has-text("Admin Access")')).toBeVisible();
  16  |     await page.locator('input[type="password"]').fill('1234');
  17  |     await page.locator('button:has-text("Unlock Dashboard")').click();
  18  |     
  19  |     // 4. Verify successful login
  20  |     await expect(page.locator('h1:has-text("Business Overview")')).toBeVisible({ timeout: 15000 });
  21  |   });
  22  | 
  23  |   test('should manage partners and watchlists', async ({ page }) => {
  24  |     await page.locator('.nav-item:has-text("Partners")').click();
  25  |     const partnerName = `Test Partner ${Date.now()}`;
  26  |     await page.locator('button:has-text("Add Partner")').click();
  27  |     await page.locator('label:has-text("Name") + input').fill(partnerName);
  28  |     await page.locator('label:has-text("WhatsApp") + input').fill('9999999999');
  29  |     await page.locator('label:has-text("Address") + textarea').fill('123 Test Street, Automation City');
  30  |     await page.locator('button:has-text("Save Profile")').click();
  31  |     await expect(page.locator(`h4:has-text("${partnerName}")`)).toBeVisible({ timeout: 10000 });
  32  |   });
  33  | 
  34  |   test('should verify billing and invoicing flow', async ({ page }) => {
  35  |     // 1. Ensure we have at least one partner and one order
  36  |     await page.locator('.nav-item:has-text("Partners")').click();
  37  |     const partnerRow = page.locator('.sk-row').first();
  38  |     const partnerName = await partnerRow.locator('h4').textContent();
  39  |     
  40  |     await partnerRow.locator('button:has-text("Manage")').click();
  41  |     const prodName = `InvoiceItem ${Date.now()}`;
  42  |     await page.locator('button:has-text("Log Fulfillment")').click();
  43  |     await page.locator('label:has-text("Product Name") + input').fill(prodName);
  44  |     await page.locator('input[type="number"]').first().fill('100');
  45  |     await page.locator('input[type="number"]').last().fill('150');
  46  |     await page.keyboard.press('Enter');
  47  |     await expect(page.locator('.modal')).not.toBeVisible({ timeout: 10000 });
  48  | 
  49  |     // 2. Go to Billing tab
  50  |     await page.locator('.nav-item:has-text("Billing")').click();
  51  |     await expect(page.locator('h1:has-text("Billing & Statements")')).toBeVisible();
  52  |     
  53  |     // 3. Select the partner
  54  |     await page.locator(`.sk-row:has-text("${partnerName}")`).click();
  55  |     
  56  |     // 4. Verify item exists in itemized list
  57  |     await expect(page.locator(`.watchlist-card:has-text("${prodName}")`)).toBeVisible();
  58  |     
  59  |     // 5. Generate Invoice
  60  |     await page.locator('button:has-text("Generate Invoice")').click();
  61  |     await expect(page.locator('h3:has-text("Weekly Statement")')).toBeVisible();
  62  |     
  63  |     // 6. Verify Total in Invoice Modal
  64  |     await expect(page.locator('#invoice-content h2:has-text("₹")')).toBeVisible();
  65  |   });
  66  | 
  67  |   test('should enforce watchlist limits and show match logs', async ({ page }) => {
  68  |     // 1. Check Match Log Tab
  69  |     await page.locator('.nav-item:has-text("Match Log")').click();
  70  |     await expect(page.locator('h1:has-text("Detections Log")')).toBeVisible();
  71  | 
  72  |     // 2. Test Match Simulator & Save to Log
  73  |     await page.locator('.nav-item:has-text("Match Simulator")').click();
  74  |     await page.locator('textarea').fill('Special deal on Dove and Maggi for partners');
  75  |     await page.locator('button:has-text("Run Logic Test")').click();
  76  |     
  77  |     // Check if result appears and save it
  78  |     const saveBtn = page.locator('button:has-text("Save to Log")').first();
  79  |     await expect(saveBtn).toBeVisible();
  80  |     
  81  |     page.on('dialog', dialog => dialog.accept());
  82  |     await saveBtn.click();
  83  | 
  84  |     // 3. Verify it appears in Match Log
  85  |     await page.locator('.nav-item:has-text("Match Log")').click();
  86  |     await expect(page.locator('.sk-row').first()).toBeVisible();
  87  | 
  88  |     // 4. Test Watchlist Limit
  89  |     await page.locator('.nav-item:has-text("Partners")').click();
  90  |     await page.locator('button:has-text("Manage")').first().click();
  91  |     
  92  |     // Try adding many items (more than 20 is hard to do quickly in test, let's just check the logic)
  93  |     // We can mock the watchlist length or just trust the alert if we were doing unit tests, 
  94  |     // but for E2E we'll just check if the "Add" button works for a valid item.
  95  |     const input = page.locator('input[placeholder="Type product keyword..."]');
  96  |     await input.fill('NewProductX');
> 97  |     await page.locator('button:has-text("Add")').click();
      |                                                  ^ Error: locator.click: Test ended.
  98  |     await expect(page.locator('.product-tag:has-text("NewProductX")')).toBeVisible();
  99  |   });
  100 | });
  101 | 
```