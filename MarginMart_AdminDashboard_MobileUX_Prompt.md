# MarginMart Admin Dashboard — Mobile UX Overhaul
### Prompt for Antigravity

---

## Context & Operating Reality

MarginMart is operated primarily from **mobile phones**. The admin dashboard (`AdminDashboard.tsx`) is the nerve center — accessed via `/admin` — and contains 7 tabs: **Automation, Overview, Partners, Match Simulator, Order Logs, AI Detections, Billing**. The operator logs orders, manages partner watchlists, checks billing, and monitors the Telegram bot — all on a small screen, often on the go.

The current implementation has solid foundations (bottom nav, keyboard detection, modal drag handles) but several flows are **desktop-first in disguise** — tables with 5–7 columns, side-by-side detail views, dense forms, and billing tables that require horizontal scrolling. This document specifies every change needed to make the dashboard genuinely mobile-native.

---

## 1. GLOBAL / STRUCTURAL CHANGES

### 1.1 Bottom Navigation — Fix Overflow
**Problem:** 7 tabs in the bottom nav is too many. On a 375px phone, each tab gets ~53px. Labels truncate or icons overlap.

**Fix:**
- Reduce to **5 visible tabs** in the bottom nav: `Overview`, `Partners`, `Orders`, `Billing`, `More`
- The `More` tab opens a slide-up drawer containing: **Automation, Match Simulator, AI Detections**
- These three are low-frequency operations; they don't need prime nav real estate
- Tab labels: keep them, but use `font-size: 0.6rem` and ensure min tap target is `44px` height

```
Bottom Nav (5 slots):
[ Overview ] [ Partners ] [ Orders ] [ Billing ] [ ⋯ More ]

"More" drawer:
[ ⚡ Automation ] [ 🎯 Simulator ] [ 🔔 Detections ]
```

### 1.2 Mobile Header — Simplify
**Current:** Logo + Refresh button + Operator name + Logout button all crammed in one row.

**Fix:**
- Remove operator name text from the header (it's already shown in sidebar footer — irrelevant on mobile)
- Keep: Logo | Refresh | Logout
- Make the Refresh button slightly larger (tap target: 36×36px minimum)

### 1.3 Remove the Desktop Sidebar Entirely on Mobile
The sidebar (`admin-sidebar`) is already hidden on mobile via CSS. Confirm it has `display: none` below `768px`. Do not render it at all on mobile to save DOM weight — wrap in a `{!isMobile && <aside>}` check or a CSS class.

### 1.4 Page Header Actions — Stack Vertically on Mobile
**Problem:** `header.page-header` uses `display: flex; justify-content: space-between` — on mobile this squishes the title and the action buttons together.

**Fix:** On screens `< 640px`, change the page header to:
```css
.page-header {
  flex-direction: column;
  gap: 0.75rem;
  align-items: flex-start;
}
.header-actions {
  width: 100%;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.header-actions button, .header-actions .search-bar-premium {
  flex: 1 1 auto;
  min-width: 120px;
}
```

### 1.5 Toast Notifications — Move to Top on Mobile
**Current:** Toasts animate from the bottom. On mobile, they are often hidden behind the bottom nav bar.

**Fix:** On mobile (`< 768px`), position toasts at the **top center** of the screen:
```css
@media (max-width: 768px) {
  .toast-notification {
    bottom: auto;
    top: 1rem;
    left: 50%;
    transform: translateX(-50%);
    width: calc(100% - 2rem);
  }
}
```

### 1.6 Add Pull-to-Refresh Behavior (Optional Enhancement)
Add a subtle pull-down indicator that calls `fetchOrders(); fetchMatches(); fetchShopkeepers()` — same as the refresh button. This is a native mobile pattern operators will intuitively use.

---

## 2. LOGIN SCREEN

**Current flow:** Operator name → 4-digit PIN → Unlock button.

### 2.1 Auto-submit on 4th digit
Already partially implemented (`if (val.length === 4) setTimeout(() => checkPin(val), 150)`). Good — keep this.

### 2.2 Keyboard type
Ensure the hidden PIN input has `inputMode="numeric"` and `pattern="[0-9]*"` so the **numeric keyboard** appears automatically on iOS/Android.

```tsx
<input
  type="password"
  inputMode="numeric"
  pattern="[0-9]*"
  maxLength={4}
  ...
/>
```

### 2.3 Operator Name — Remember It
Already saving to `localStorage`. Good. But on the login screen, pre-fill and auto-focus the PIN input if operatorName is already saved, skipping the name field. The operator doesn't need to re-enter their name every session.

```tsx
// On mount, if localStorage has operator name, skip to PIN input
useEffect(() => {
  const saved = localStorage.getItem('mm_operator_name');
  if (saved) setOperatorName(saved);
  // auto-focus PIN input
}, []);
```

### 2.4 Cancel Button
Keep `onBack` but rename the button label to **"← Back to Site"** for clarity.

---

## 3. OVERVIEW TAB

**Current:** 4 stat cards + a 2-column grid (Recent Orders table + Team Contribution).

### 3.1 Stat Cards — Already Good
The 4 `stat-card-mini` cards in a 2×2 grid work well on mobile. Keep them.

### 3.2 Two-Column Grid — Must Stack
**Problem:** `gridTemplateColumns: 'clamp(200px, 60%, 1.5fr) 1fr'` — on a phone, this renders as two tiny columns side by side.

**Fix:** Add a class `overview-two-col` and in CSS:
```css
@media (max-width: 768px) {
  .overview-two-col {
    grid-template-columns: 1fr !important;
  }
}
```

### 3.3 Recent Orders List — Simplify Columns
In the Overview recent orders, the current `sk-row` tries to render: Name | Product | Operator | Status | Amount — too many on mobile.

**Fix for mobile:** Show a simpler card layout (not a table row) for the overview's recent orders:
```
┌──────────────────────────────┐
│ Ramesh Gupta    [ordered]    │
│ Maggi 12-pack          ₹145  │
└──────────────────────────────┘
```
Use `flex-direction: column` on mobile for the `sk-name-cell` and hide the Operator column on `< 640px`.

### 3.4 Team Contribution — Simplify
The progress bar + stats work fine. Just ensure text doesn't truncate on small screens. Add `word-break: break-word`.

---

## 4. PARTNERS TAB

This is one of the most-used tabs. Most flows happen here: add partner → manage → watchlist → log order.

### 4.1 Partner List — Redesign Rows for Mobile
**Current:** Table with 5 columns: `Partner Info | Location | Status | Fulfillment | Manage` — columns 3, 4, 5 are extremely cramped on mobile.

**Fix:** Switch to a **card-based layout** on mobile (`< 768px`):
```
┌────────────────────────────────────┐
│ [R]  Ramesh Gupta                  │
│      9876543210  💬                │
│      Dwarka, Delhi    [Verified]   │
│                                    │
│  [Log Order]   [Manage →]  [🗑]    │
└────────────────────────────────────┘
```

```css
@media (max-width: 768px) {
  .sk-row {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
  }
  .sk-row .partner-actions {
    display: flex;
    gap: 0.5rem;
    width: 100%;
  }
  .sk-row .partner-actions button {
    flex: 1;
  }
  /* Hide the header row on mobile */
  .sk-row.header-row {
    display: none;
  }
}
```

### 4.2 Add Partner Button — Full Width on Mobile
The `Add Partner` button should be full-width on mobile, placed below the search bar:
```
[ 🔍 Search partners...          ]
[ + Add New Partner              ]  ← full width, green
```

### 4.3 Partner Detail / Watchlist View
When a partner is selected (`selectedShopkeeper` state), the current layout works decently. However:

**Fix — Watchlist Input:**
The input + Add button grid (`1fr auto`) is good. But on mobile, ensure the input doesn't get squished:
```css
@media (max-width: 640px) {
  .add-product-row .form-group {
    grid-template-columns: 1fr 48px;
  }
}
```

**Fix — Quick Suggestion Tags:**
Currently these are `flex-wrap: wrap` — perfect for mobile. Keep as-is.

**Fix — "Log Order" & "Edit Profile" buttons:**
Already stacked vertically in the info-card. Good.

**Fix — Back Navigation:**
The `.mobile-back-bar` with "← Back to Partners" is good. Ensure it's sticky at the top:
```css
.mobile-back-bar {
  position: sticky;
  top: 56px; /* below mobile header */
  z-index: 10;
  background: white;
  padding: 0.5rem 0;
  border-bottom: 1px solid #f1f5f9;
}
```

### 4.4 WhatsApp Button — Make More Prominent
Currently the WhatsApp icon is a tiny 14px button next to the phone number. On mobile this is hard to tap.

**Fix:** In the card layout, make it a proper button:
```
[💬 WhatsApp]   — secondary style, full label on card view
```

---

## 5. ORDER LOG MODAL (Log Order Form)

This is a **critical flow** — operators use this constantly. The current modal has a complex multi-field form with calculated fields.

### 5.1 Modal Height — Allow Full-Screen on Mobile
**Fix:** On mobile, the modal should slide up from the bottom as a **bottom sheet**, taking 90% of screen height with scrollable content:
```css
@media (max-width: 768px) {
  .modal-overlay {
    align-items: flex-end;
  }
  .modal {
    border-radius: 24px 24px 0 0;
    max-height: 90vh;
    overflow-y: auto;
    width: 100%;
    max-width: 100%;
    padding-bottom: calc(1.5rem + env(safe-area-inset-bottom));
  }
}
```

### 5.2 Form Field Layout — Single Column on Mobile
**Current:** Fields are in a 2-column grid (`order-price-grid`).

**Fix:**
```css
@media (max-width: 640px) {
  .order-price-grid {
    grid-template-columns: 1fr !important;
  }
}
```

### 5.3 Field Order — Optimize for Thumb Input
Reorder the form fields to match the natural order operators think in:

1. **Product Name** (text, full width)
2. **MRP per Piece** (number)
3. **Our Rate per Piece** (number) → auto-shows Savings/Pc
4. **Quantity** (number, default 1)
5. **Platform Fee** (number, default 0)
6. **Total Deal Price** (auto-calculated, read-only — show in a highlighted box, not a plain input)
7. **Total Selling Price** (number)
8. **Est. Profit** (auto-calculated, read-only — show in a green highlighted box)

**Replace read-only inputs with styled display boxes:**
```tsx
{/* Instead of a disabled input for calculated values */}
<div className="calc-display-box">
  <span className="calc-label">Total Deal Price</span>
  <strong className="calc-value">₹{orderForm.deal_price || '0'}</strong>
</div>
```
This reduces visual noise and prevents accidental taps.

### 5.4 Input Types
Ensure all numeric fields have:
```tsx
type="number"
inputMode="decimal"
pattern="[0-9]*"
```

### 5.5 Submit Button — Make it Sticky
The Log Order button should be sticky at the bottom of the bottom sheet so operators don't need to scroll to submit:
```css
.modal form .btn-pro-primary[type="submit"] {
  position: sticky;
  bottom: 0;
  margin: 0 -1.5rem -1.5rem;
  border-radius: 0;
  padding: 1.25rem;
}
```

---

## 6. ADD/EDIT PARTNER MODAL

Simpler form (Name, WhatsApp, Address). Same bottom-sheet treatment as above.

**Fix — Address field:** Use `rows={2}` instead of `rows={3}` on mobile to save screen space.

**Fix — Input Labels:** Consider `placeholder`-as-label pattern on mobile (remove the `<label>` text, use descriptive placeholders like "Full Name", "WhatsApp Number (10-digit)", "Shop Address"). This saves vertical space.

---

## 7. ORDER LOGS TAB

**Current:** Complex table with 7 columns: Checkbox | Partner & Product | Date | Operator | Status Update | Financials | Delete.

This is completely unusable on a phone as a table.

### 7.1 Redesign as Cards on Mobile

```
┌──────────────────────────────────────┐
│ □  Ramesh Gupta · Today              │
│    Maggi 12-pack (Qty: 6)            │
│    ₹1,200  •  Profit: ₹180           │
│                                      │
│  [⏰ Ordered] [📦 Delivered] [✓ Paid] │
│                                      │
│  Handled by: Rahul                [🗑]│
└──────────────────────────────────────┘
```

```css
@media (max-width: 768px) {
  .sk-row.header-row { display: none; }
  .sk-row {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .order-status-buttons {
    display: flex;
    gap: 0.5rem;
    width: 100%;
  }
  .order-status-buttons button {
    flex: 1;
    padding: 0.6rem;
    font-size: 0.75rem;
  }
}
```

### 7.2 Search + Filter — Stack on Mobile
```
[ 🔍 Search orders...           ]
[ Filter: All ▾ ]  [ Export CSV ]
```
Stack these vertically on mobile, make the filter a proper select with more padding.

### 7.3 Bulk Select — Simplify
On mobile, bulk-select via checkboxes is awkward. Add a **"Select All / Deselect"** button at the top that appears when any checkbox is checked, and show the delete count in a fixed bar at the bottom:
```
─────────────────────────────────────
  3 orders selected    [ Delete All ]
─────────────────────────────────────
```

### 7.4 Export CSV Button
On mobile, download triggers are inconsistent. Label the button: **"⬇ Export"** and keep it — but de-emphasize it (secondary style) since it's not the primary mobile use case.

---

## 8. AI DETECTIONS TAB

**Current:** Table with 5 columns: `Partner & Product | Detection Date | Operator | Matched Keyword | Source (View Msg)`.

### 8.1 Card Layout on Mobile
```
┌──────────────────────────────────────┐
│ Ramesh Gupta                         │
│ Product: Maggi                       │
│ Keyword: "maggi"  •  @deals          │
│ 10 May 2026, 3:45 PM  •  By Rahul   │
│                        [View Msg →]  │
└──────────────────────────────────────┘
```

### 8.2 View Message Modal
Already implemented — good. Just ensure it gets the bottom-sheet treatment on mobile (same as other modals).

---

## 9. BILLING TAB

This tab has the most complexity. **Current layout:** Two-column side-by-side — Partner list (350px) + Billing detail panel. Totally broken on mobile.

### 9.1 Full Two-Step Navigation Flow

On mobile, billing must be a **two-screen flow**, not side-by-side:

**Screen 1 — Partner List:**
```
Billing & Statements

[ 🔍 Search partner... ]

┌────────────────────────────────┐
│ [R] Ramesh Gupta               │
│     3 orders  •  ₹1,450 due   →│
└────────────────────────────────┘
┌────────────────────────────────┐
│ [N] Neha Kapoor                │
│     1 order  •  ₹890 due      →│
└────────────────────────────────┘
```

**Screen 2 — Partner Billing Detail (replaces the panel):**
Full-screen view with sticky back button + sticky total at bottom.

```css
@media (max-width: 768px) {
  .detail-view {
    grid-template-columns: 1fr !important;
  }
  /* When a partner is selected, hide the list and show only detail */
  .detail-view .data-table-container:first-child {
    display: none;
  }
  /* The watchlist-card (billing detail panel) takes full width */
  .watchlist-card {
    width: 100%;
  }
}
```

Alternatively, use a React state flag: `billingView: 'list' | 'detail'` toggled when a partner is selected on mobile.

### 9.2 Billing Detail Header — Stack Action Buttons
**Current:** `Copy Text | Mark All Paid | Preview PDF | Issue Official Invoice` — 4 buttons in a row.

**Fix on mobile:**
```
[Partner Name]
Statement for current period

[ Copy Text ]  [ Mark All Paid ]
[ Preview PDF ]  [ Issue Invoice ]
```
Two-column grid, full width, all four buttons visible without scrolling.

### 9.3 Invoice Table — Horizontal Scroll
The invoice table has `minWidth: 850px`. On mobile this creates a scrollable horizontal table which is bad.

**Fix — Simplified Mobile Invoice View:**
Replace the table entirely on mobile with a line-item card list:

```
┌──────────────────────────────────────┐
│ Maggi 12-pack                        │
│ Qty: 6  •  Rate: ₹115  •  MRP: ₹168 │
│ Saving/pc: ₹53           Total: ₹690 │
│ 10 May 2026                          │
└──────────────────────────────────────┘
```

```css
@media (max-width: 768px) {
  .invoice-table-header { display: none; }
  .invoice-item-row {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #f1f5f9;
    min-width: unset !important;
    grid-template-columns: unset !important;
  }
}
```

### 9.4 Sticky Total Bar at Bottom
On the billing detail page (mobile), show a sticky total at the bottom:
```
─────────────────────────────────────
  Total Due: ₹3,450   [Mark All Paid]
─────────────────────────────────────
```

### 9.5 Invoice History Table — Same Treatment
Same `minWidth: 600px` issue. Apply the same card-style fix for mobile.

---

## 10. MATCH SIMULATOR TAB

### 10.1 Textarea — Better Mobile UX
**Current:** `rows={6}` textarea. On mobile this works but keyboard pushes it up awkwardly.

**Fix:**
- Set `rows={4}` on mobile
- Add `placeholder` text: `"Paste Telegram deal message here..."`
- When keyboard opens (the existing `keyboardOpen` state), scroll the textarea into view

### 10.2 Run Button — Full Width
```css
.btn-pro-primary[onClick="runSimulator"] {
  width: 100%;
}
```
Already has `width: 100%`. Good — keep.

### 10.3 Simulator Results — Card Layout
Current simulator result rows have 3 columns. On mobile:
```
┌──────────────────────────────────────┐
│ Ramesh Gupta                         │
│ Matches: "maggi"                     │
│                [View Text] [Save →]  │
└──────────────────────────────────────┘
```

---

## 11. AUTOMATION TAB

### 11.1 Two-Column Automation Grid — Stack on Mobile
```css
@media (max-width: 768px) {
  .automation-grid {
    grid-template-columns: 1fr !important;
  }
}
```

### 11.2 Telegram Listener Card — Simplify
The Cloud Engine Endpoint (step 1) shows a `<code>` block with the URL. On mobile, this text overflows. Fix:
```css
code {
  overflow-x: auto;
  display: block;
  white-space: nowrap;
  -webkit-overflow-scrolling: touch;
}
```

### 11.3 Channel Tags — Already Mobile-Friendly
The `flex-wrap: wrap` channel pill tags are fine on mobile.

### 11.4 Add Channel Input + Button
The `flex` row with input + Add button works on mobile. Ensure the input has:
```tsx
inputMode="text"
autoCapitalize="none"
autoCorrect="off"
```

---

## 12. CONFIRM DIALOG

**Current:** Centered modal overlay with Cancel + Confirm buttons.

**Fix:** On mobile, make this a bottom sheet:
```css
@media (max-width: 768px) {
  .modal[style*="maxWidth: 360px"] {
    /* Confirm dialog */
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    border-radius: 20px 20px 0 0;
    padding-bottom: calc(1.5rem + env(safe-area-inset-bottom));
  }
}
```

Or pass a prop to the confirm dialog to use bottom-sheet style.

---

## 13. SWIPE GESTURES (Enhancement)

Add swipe-to-dismiss on all modals/bottom sheets:
```tsx
// Simple swipe detection on modal
const [startY, setStartY] = useState(0);

onTouchStart={(e) => setStartY(e.touches[0].clientY)}
onTouchEnd={(e) => {
  if (e.changedTouches[0].clientY - startY > 80) {
    closeModal(); // dismiss if swiped down 80px
  }
}}
```

---

## 14. THINGS TO REMOVE / SIMPLIFY

### 14.1 Remove: Operator Column in All Tables
The "Handled by: Rahul" info is useful but not critical for every row. On mobile, remove it from table/card views. It's already in the order record; it can be revealed in a detail tap if needed.

### 14.2 Remove: "Status" Column Showing "Verified" Badge
Every partner shows a green "Verified" badge in the Status column. This adds no actionable information. Remove this column entirely — it's noise.

### 14.3 Remove: `Download Partners CSV` from Mobile View
CSV downloads are a desktop/accounting function. Hide this button on `< 768px`. Keep Export for Orders (it's more useful) but grey it out or move it to a "⋯" overflow menu.

### 14.4 Remove: Redundant "Back" Button in Detail View
The partner detail view has two back buttons: one in `.mobile-back-bar` and one as `mobile-back-btn` inside `.info-card`. **Keep only the sticky top one**, remove the redundant one inside the card.

### 14.5 Remove: `operatorName` from Mobile Header
It's visible on login, stored in session, shown at bottom of sidebar. The mobile header doesn't need to repeat it.

### 14.6 Simplify: Overview "Team Contribution" Section
On mobile this section is deep below the fold. Consider moving it to the **bottom** of the Overview tab or removing it from mobile view entirely — operators care more about revenue/orders than team attribution on their phone.

---

## 15. THINGS TO ADD

### 15.1 Quick Action FAB (Floating Action Button)
On the **Partners tab**, add a green `+` FAB in the bottom-right corner (above the bottom nav) for instant "Add Partner":
```
                           ┌──┐
                           │ +│  ← fixed, 56px circle, green
                           └──┘
[ Overview ] [ Partners ] [ Orders ] [ Billing ] [ ⋯ ]
```

### 15.2 Order Count Badge on Orders Tab
Show a badge on the Orders bottom-nav tab with count of non-paid orders:
```tsx
const pendingCount = orders.filter(o => o.status !== 'paid').length;
// Show badge if pendingCount > 0
```

### 15.3 Empty State Illustrations
When tabs are empty (no orders, no partners, no matches), show a friendly empty state instead of just greyed text. A simple emoji + headline + CTA works:
```
📦
No orders yet
[Log your first order →]
```

### 15.4 Haptic Feedback Hints
On successful save operations, consider `navigator.vibrate(50)` (where supported) for subtle confirmation. Pair with the existing toast.

### 15.5 "Copy WhatsApp Statement" — One-Tap Share
On billing detail, add a **Share button** that uses the native share sheet:
```tsx
navigator.share({
  title: `MarginMart Statement — ${partnerName}`,
  text: statementText
});
```
Falls back to `navigator.clipboard.writeText()` if share isn't available. Much better than clipboard-only on mobile.

---

## 16. CSS VARIABLES & SAFE AREAS

Add these to the global admin CSS:
```css
:root {
  --mobile-bottom-nav-height: 60px;
  --mobile-header-height: 56px;
  --safe-bottom: env(safe-area-inset-bottom, 0px);
}

/* Ensure main content isn't hidden under bottom nav on mobile */
@media (max-width: 768px) {
  .admin-main {
    padding-bottom: calc(var(--mobile-bottom-nav-height) + var(--safe-bottom) + 1rem);
  }
}

/* Admin bottom nav respects home indicator on iPhone */
.admin-mobile-bottom-nav {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
```

---

## 17. PRIORITY ORDER FOR IMPLEMENTATION

Implement in this order (highest ROI first):

| Priority | Change | Impact |
|---|---|---|
| 🔴 P0 | Log Order modal → bottom sheet, single column, sticky submit | Daily use |
| 🔴 P0 | Order Logs tab → card layout | Daily use |
| 🔴 P0 | Bottom nav overflow → 5 tabs + More drawer | Navigation |
| 🟠 P1 | Partners tab → card layout | Daily use |
| 🟠 P1 | Billing tab → two-screen flow + card items | Weekly use |
| 🟠 P1 | Toast → top position on mobile | Always visible |
| 🟡 P2 | Page headers → stack on mobile | All tabs |
| 🟡 P2 | Overview grid → stack on mobile | Daily use |
| 🟡 P2 | Add Partner modal → bottom sheet | Frequent use |
| 🟢 P3 | WhatsApp Share on billing | Nice-to-have |
| 🟢 P3 | FAB for Add Partner | Nice-to-have |
| 🟢 P3 | Order badge on nav | Nice-to-have |
| 🟢 P3 | Swipe to dismiss modals | Polish |

---

## 18. BREAKPOINTS REFERENCE

Use these consistently throughout:
```css
/* Mobile only */
@media (max-width: 640px) { ... }

/* Mobile + tablet */
@media (max-width: 768px) { ... }

/* Desktop only */
@media (min-width: 769px) { ... }
```

The existing `admin-pro-theme` CSS already has some mobile overrides — extend them rather than duplicating.

---

## Summary of Core Principle

> **Every interaction on mobile should require no horizontal scrolling, no pinching, and no squinting.** Tables become cards. Side-by-side becomes stacked. Modals become bottom sheets. Actions are thumb-reachable. Data is scannable at a glance.

The admin is managing their business from their phone — probably standing at a shopkeeper's store, or messaging a partner on WhatsApp. The UI should feel as fast and natural as the WhatsApp itself.
