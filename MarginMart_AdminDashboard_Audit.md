# MarginMart Admin Dashboard — Full Code Audit
### For: Antigravity Dev Team
### Based on: `MarginMart-main1.zip` (May 2026 build)

---

## Executive Summary

The admin dashboard has a solid architecture — Supabase integration, motion animations, modular components, and a genuine mobile-first structure with bottom nav, pull-to-refresh, and haptic feedback. However, there are **confirmed bugs**, **mobile UX gaps that were specified but not fully implemented**, **security concerns**, and **several missing features** that need to be addressed before this can be considered production-ready.

---

## 1. CONFIRMED BUGS

### 🔴 BUG-01 — Playwright E2E Test Failure: Dialog Race Condition
**File:** `tests/admin_e2e.spec.ts` (line 97)
**Error:** `Cannot accept dialog which is already handled!`

**Root Cause:** The test registers `page.on('dialog', ...)` in `beforeEach` with `dialog.dismiss()`, then re-registers it mid-test with `dialog.accept()`. This creates a double-handler conflict. Additionally, the `Add` button click fails because the element is unstable — likely still animating from the Framer Motion `motion.div` or re-rendering from a Supabase fetch.

**What to Fix:**
- Remove the global `page.on('dialog', dialog => dialog.dismiss())` from `beforeEach` — it interferes with tests that need to accept dialogs
- Add `await page.waitForLoadState('networkidle')` before clicking `Add`
- Or use `page.locator('button:has-text("Add")').waitFor({ state: 'stable' })` before clicking

---

### 🔴 BUG-02 — Bulk Delete on Mobile Calls `deleteOrder()` in a Loop (No Await Handling)
**File:** `AdminDashboard.tsx` — Bulk Select Bar (bottom of file)

```tsx
// CURRENT (broken):
onConfirm: async () => {
  for (const id of selectedOrderIds) {
    await deleteOrder(id);  // deleteOrder() calls showConfirm() internally!
  }
}
```

`deleteOrder()` itself triggers another `showConfirm()` dialog — meaning calling it in a loop opens multiple confirm modals. This is a logic bug.

**Fix:** The bulk delete path should call `supabase.from('orders').delete().in('id', selectedOrderIds)` directly (which already exists as `bulkDeleteOrders()`). The mobile bulk bar should call `bulkDeleteOrders()`, not loop through `deleteOrder()`.

---

### 🔴 BUG-03 — `isMobile` Detected Once at Mount, Never Updates on Resize
**File:** `AdminDashboard.tsx`

```tsx
const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
```

There is no `resize` event listener. If a user rotates their device or resizes a browser window, the layout breaks and never recovers without a full page reload.

**Fix:**
```tsx
useEffect(() => {
  const handler = () => setIsMobile(window.innerWidth < 768);
  window.addEventListener('resize', handler);
  return () => window.removeEventListener('resize', handler);
}, []);
```

---

### 🔴 BUG-04 — `handleTouchMove` Attached to Outer `div`, Not `admin-layout`
**File:** `AdminDashboard.tsx`

The pull-to-refresh touch handlers are on the outer `admin-pro-theme` div:
```tsx
<div className="admin-pro-theme" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
```

But `handleTouchMove` is on the inner `admin-layout` div. This means `pullDistance` can get set by the outer div's `onTouchStart`, but `handleTouchMove` only fires if the user's finger moves within `admin-layout`. This creates inconsistent pull-to-refresh behavior.

**Fix:** Place all three handlers (`onTouchStart`, `onTouchMove`, `onTouchEnd`) on the same `admin-layout` div.

---

### 🟠 BUG-05 — Order Status Filter Option Mismatch
**File:** `AdminDashboard.tsx` — Order Logs filter dropdown

```tsx
<option value="pending">Pending</option>
```

But the actual order status value stored in Supabase and used in logic is `'ordered'`, not `'pending'`. The filter for "Pending" will always return 0 results.

**Fix:** Change `value="pending"` to `value="ordered"`, and update the label accordingly — or map `'ordered'` → `'Pending'` in the display layer.

---

### 🟠 BUG-06 — Auto-Sync `setInterval` Has Stale Closure on Fetch Functions
**File:** `AdminDashboard.tsx`

```tsx
const syncInterval = setInterval(() => {
  if (sessionStorage.getItem('adminAuth') === 'true') {
    fetchOrders();
    fetchMatches();
  }
}, 60000);
```

This is inside a `useEffect` with an empty dependency array `[]`. The `fetchOrders` and `fetchMatches` references captured at mount may be stale. While in practice these functions don't close over frequently-changing state, this is a React anti-pattern that can cause subtle bugs.

**Fix:** Add `fetchOrders` and `fetchMatches` to the dependency array, or use `useRef` to hold the latest function references.

---

### 🟠 BUG-07 — `handleTouchMove` Missing from `onTouchMove` Handler (Pull-to-Refresh Broken on Some Devices)
**File:** `AdminDashboard.tsx`

The outer `admin-pro-theme` div does not have an `onTouchMove` handler, so `pullDistance` is never updated from user touch movement. The pull-to-refresh indicator renders (`pullDistance > 0`) but `pullDistance` stays at 0 because `handleTouchMove` is never actually called from that div.

---

### 🟡 BUG-08 — Hardcoded Operator Names in Login Datalist
**File:** `AdminDashboard.tsx`

```tsx
<datalist id="operators">
  <option value="Admin" />
  <option value="Rahul" />
  <option value="Priya" />
</datalist>
```

These are hardcoded. If the team changes, the code must be updated. This should come from a config table in Supabase (`admin_settings` or a new `operators` table), or at minimum from an environment variable.

---

## 2. MOBILE FRIENDLINESS AUDIT

### What's Already Working Well ✅
- Bottom navigation with 5 tabs + More drawer — correctly implemented
- Pull-to-refresh gesture skeleton (partially working — see BUG-04, BUG-07)
- Bottom-sheet modals for Log Order and Add Partner on mobile
- Drag-to-dismiss on modals (via Framer Motion `drag="y"`)
- Haptic feedback (`navigator.vibrate`) on status updates and saves
- Order badge count on Orders bottom nav tab
- Empty state components throughout
- Quick action FAB for Add Partner and Log Order tabs
- Offline banner at top when `navigator.onLine === false`
- Toasts positioned at top on mobile (`toast-mobile-top` class applied)

---

### What's Missing or Broken on Mobile ⚠️

#### M-01 — Order Logs Desktop Table Still Renders on Mobile
The `sk-row` desktop table layout (with 6 columns: checkbox, partner, date, status, financials, delete) appears to be conditionally rendered — but the `header-row` inside is NOT hidden on mobile because it's rendered inside `!isMobile ? ... : ...` conditional. Verify this renders the `OrderCard` component on mobile and not the desktop row. From the code it appears correct, but the `<div className="table-body">` wrapper is always rendered even on mobile, which can cause layout issues.

#### M-02 — Partners Tab Desktop Header Row Visible on Mobile
```tsx
<div className="sk-row header-row" style={{ '--grid-cols': '1.5fr 1fr 140px 140px' }}>
  <span>Partner Info</span>
  ...
</div>
```
This header row renders unconditionally — before the `isMobile ? <PartnerCard> : <sk-row>` split. On mobile, the header row is visible above the card list. It should be hidden on mobile with CSS `display: none` or wrapped in `{!isMobile && ...}`.

#### M-03 — Billing Tab Action Buttons Overflow on Mobile
In `BillingDetail.tsx`, the action button row contains 5-6 buttons: `Issue Official Invoice | Email | Preview PDF | Copy Text | WhatsApp | Mark Paid`. The `billing-action-grid` class is applied on mobile, but without seeing the CSS, the spec called for a 2-column grid. Needs visual verification — 6 buttons in a small grid will likely still overflow.

#### M-04 — Billing Detail Back Button Missing When Navigating from Partner List
On mobile, when a user selects a partner in the Billing tab, `selectedBillPartner` is set and `BillingDetail` renders. The `BillingDetail` component has its own back button (`ArrowLeft`) on mobile. However, if the user navigates to Billing directly from the bottom nav after already having a `selectedBillPartner` in state, they'll land on the detail view with no obvious path back. The `selectedBillPartner` state persists across tab switches.

**Fix:** Clear `selectedBillPartner` when switching away from the billing tab:
```tsx
useEffect(() => {
  if (activeTab !== 'billing') setSelectedBillPartner(null);
}, [activeTab]);
```

#### M-05 — Page Header Actions Not Stacked on Mobile (Orders Tab)
The Orders tab header contains a dense row of controls: Select All | Delete button | Filter dropdown | Search bar | Export button. On mobile these are conditionally adjusted but the `header-actions-mobile-stack` class is applied without a CSS definition visible in this codebase — it likely does nothing unless that class is defined in `index.css`.

#### M-06 — Confirm Modal Not a Bottom Sheet on Mobile
The `ConfirmModal` component receives an `isMobile` prop but looking at its usage, there's no bottom-sheet styling applied. The spec (Section 12) specified this should slide up from the bottom on mobile. Currently it's a centered overlay — which is harder to reach with thumbs.

#### M-07 — Watchlist Detail View Not Full-Screen on Mobile
When viewing a partner's watchlist (`selectedShopkeeper` view in the Partners tab), the layout uses `detail-view` which is a 2-column grid on desktop. On mobile this should be a full-screen stacked view. The CSS class `detail-view` may or may not have a mobile override — this needs confirmation.

#### M-08 — `keyboardOpen` State Declared but Never Set
```tsx
const [keyboardOpen, setKeyboardOpen] = useState(false);
```
This state exists in `AdminDashboard.tsx` but there is no code that ever calls `setKeyboardOpen(true)`. The spec (Section 10.1) said to scroll the textarea into view when the keyboard opens. This feature is completely unimplemented.

---

## 3. SECURITY CONCERNS

### 🔴 SEC-01 — PIN Auth Uses Client-Side Session Storage Only
```tsx
sessionStorage.setItem('adminAuth', 'true');
```
The entire admin auth relies on `sessionStorage`. Anyone who can run JavaScript in the browser console can bypass it with `sessionStorage.setItem('adminAuth', 'true')`. There's no server-side session token, no JWT, no row-level security enforcement tied to admin status.

**This is acceptable for an MVP used by a known small team, but must be addressed before wider deployment.** Consider:
- Supabase Auth with an admin role
- Or at minimum, a signed token returned from a Supabase Edge Function after PIN verification

### 🟠 SEC-02 — Supabase Client Key Exposed in Frontend
`src/lib/supabase.ts` will contain the public Supabase anon key. Ensure:
- Row Level Security (RLS) is enabled on all tables (`shopkeepers`, `orders`, `matches`, `watchlists`, `admin_settings`)
- The anon key cannot read `admin_settings.value` where PIN is stored without auth — this is a critical data exposure risk

### 🟡 SEC-03 — Admin PIN Stored in Plain Text in Supabase
```tsx
const { data } = await supabase.from('admin_settings').select('value').eq('key', 'admin_pin').single();
if (data && data.value === pinToVerify) { ... }
```
The PIN is stored as a plain text value in the database and compared directly. It should be hashed (bcrypt or similar) — though for a 4-digit PIN the security value of hashing is limited, it's still best practice.

---

## 4. IMPROVEMENTS NEEDED

### Code Quality

#### I-01 — `handleTouchMove` Not Registered — Pull-to-Refresh Only Half Implemented
As noted in BUG-04 and BUG-07, the pull-to-refresh has the state and UI but the touch move handler isn't wired correctly. This needs a full revisit.

#### I-02 — `copyStatementText` and `shareStatement` Are Duplicated
These two functions share ~80% of their logic (building the statement string). Extract into a single `buildStatementText(shopkeeperId)` helper and call it from both.

#### I-03 — `formState` Type Has `id` as Optional String, But Supabase Expects UUID
```tsx
const [formState, setFormState] = useState({ id: '', name: '', phone: '', address: '' });
```
When editing a partner, `formState.id` is set from `selectedShopkeeper.id`. When creating, it's `''`. The update query checks `if (id)` — an empty string is falsy, which is fine. But TypeScript won't catch if `id` is accidentally undefined vs `''`. Add explicit type annotation.

#### I-04 — `runSimulator` Uses `matches` as Variable Name, Shadowing State
```tsx
async function runSimulator() {
  const matches: { name: string, ... }[] = []; // local variable
  // but `matches` is also a state variable (Supabase matches)
```
This shadows the outer `matches` state variable. Rename the local array to `localMatches` or `simMatches` to avoid confusion.

#### I-05 — No Loading State on Initial Page Load (Data Fetching)
When `isAuthorized` becomes true, three fetches run in parallel (`fetchShopkeepers`, `fetchOrders`, `fetchMatches`). The `loading` state only covers `shopkeepers`. The Overview tab's stat cards can flash `₹0` briefly before data loads. Add a global `dataReady` state or show skeleton loaders on the Overview cards.

---

### UX Improvements

#### I-06 — No Validation on Phone Number Format
The Add/Edit Partner form accepts any input for the phone field. There is `pattern="[0-9]*"` but no `minLength` or `maxLength`. A user could save a partner with a 3-digit phone number. Add `minLength={10}` and `maxLength={13}`.

#### I-07 — Log Order Modal: Partner Not Pre-Selected When Opened from Order Logs Tab
When the user clicks the FAB on the Orders tab (`setShowOrderModal(true)`), `orderPartner` is `null`. The modal renders `Log Order — undefined`. The user has no partner selection UI in the modal itself. Either:
- Add a partner selector dropdown inside the modal
- Or disable the FAB on Orders tab when `orderPartner` is null and route user to Partners tab first

#### I-08 — Simulator Results: "Save" Button Has No Visual Feedback After Saving
When a match is saved via `saveSimMatch()`, the toast fires but the Save button itself doesn't change state (e.g., show a checkmark or disable). A user could accidentally save the same match multiple times.

#### I-09 — Automation Tab: Bot Status is Read-Only, No Way to Toggle It
The status pill shows `Listener: Active / Offline` but there's no toggle button. `isBotActive` is fetched but there's no UI to change it. Either add a toggle or remove the status pill if it's purely informational.

#### I-10 — No Pagination or Infinite Scroll on Partners List
All shopkeepers are fetched in one query with no limit. At 50+ partners this will be slow and the list will be very long on mobile. Add a limit + offset pattern or at minimum virtual scrolling.

---

## 5. MISSING FEATURES (From Spec vs Implementation)

The existing `MarginMart_AdminDashboard_MobileUX_Prompt.md` file in the repo contains a detailed spec. Here's what was specified but not yet implemented:

| Spec Section | Feature | Status |
|---|---|---|
| §3.4 | Team Contribution: `word-break: break-word` on operator names | ❌ Not confirmed |
| §10.1 | Keyboard open → scroll textarea into view (`keyboardOpen` state) | ❌ Not implemented |
| §12 | Confirm dialog → bottom sheet on mobile | ❌ Not implemented |
| §13 | Swipe-to-dismiss on modals (beyond LogOrder/Partner modals) | ⚠️ Partial |
| §14.2 | Remove "Verified" badge column from Partner list | ❌ Not confirmed |
| §14.3 | Hide Download Partners CSV on mobile | ❌ Not confirmed |
| §14.4 | Remove redundant back button in partner detail info-card | ❌ Not confirmed |
| §16 | `env(safe-area-inset-bottom)` on bottom nav | ⚠️ Needs CSS confirmation |
| §15.1 | FAB on Partners tab | ✅ Implemented |
| §15.2 | Order count badge on Orders nav tab | ✅ Implemented |
| §15.4 | Haptic feedback on saves | ✅ Implemented |
| §15.5 | WhatsApp share on billing | ✅ Implemented |

---

## 6. WHAT'S WORKING WELL (Don't Touch)

- **Supabase integration** — clean query patterns, error handling throughout
- **Framer Motion animations** — well-applied, not overdone
- **Toast notification system** — solid, auto-dismisses, success/error variants
- **Confirm dialog pattern** — prevents accidental deletes everywhere
- **CSV export** — works for both orders and partners
- **Invoice generation** — offloaded to `invoiceGenerator.ts` utility, clean separation
- **Match Simulator logic** — keyword deduplication per partner works correctly
- **WhatsApp deep-link** — correct `+91` prefixing for 10-digit numbers
- **`React.memo` on `OrderCard` and `PartnerCard`** — good performance practice
- **Offline detection banner** — clean implementation

---

## 7. PRIORITY ACTION LIST FOR ANTIGRAVITY

### 🔴 Must Fix Before Release
1. **BUG-05** — Fix order status filter `'pending'` → `'ordered'` (users can't filter orders correctly)
2. **BUG-02** — Fix mobile bulk delete (currently chains confirm dialogs)
3. **BUG-03** — Add resize listener for `isMobile` detection
4. **BUG-04 + BUG-07** — Fix pull-to-refresh touch handler wiring
5. **M-04** — Clear `selectedBillPartner` on tab switch
6. **SEC-02** — Confirm RLS is enabled on Supabase tables (especially `admin_settings`)
7. **I-07** — Fix Log Order modal when opened from Orders tab with no partner selected

### 🟠 Fix Before Public Beta
8. **BUG-01** — Fix Playwright E2E test (dialog double-handler)
9. **M-02** — Hide Partners desktop header row on mobile
10. **M-08** — Either implement `keyboardOpen` keyboard detection or remove the dead state
11. **I-02** — Deduplicate `copyStatementText` / `shareStatement` logic
12. **I-04** — Rename `matches` local variable in `runSimulator` to avoid state shadowing
13. **I-06** — Add `minLength={10}` validation on phone input
14. **I-08** — Disable Save button after match is saved in Simulator

### 🟡 Polish Pass
15. **I-05** — Add skeleton loaders or loading state on Overview stat cards
16. **I-09** — Add bot toggle or remove the status pill in Automation
17. **I-10** — Add pagination on Partners list (prepare for scale)
18. **I-03** — Tighten TypeScript types on `formState`
19. **SEC-03** — Consider hashing PIN (low urgency for MVP team)
20. **BUG-08** — Move operator names to Supabase config

---

*Audit performed on codebase snapshot: `MarginMart-main1.zip`, May 11 2026*
*Covers: `AdminDashboard.tsx`, `BillingDetail.tsx`, `LogOrderModal.tsx`, `PartnerFormModal.tsx`, `ConfirmModal.tsx`, `MessageModal.tsx`, `OrderCard.tsx`, `PartnerCard.tsx`, `invoiceGenerator.ts`, `admin_e2e.spec.ts`, `playwright-report/`*
