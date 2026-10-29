# M5 persona review: driver app, bills, khata, payments (2026-10-29)

Suite: `npm run review`, phone 390×844 + laptop 1366×820. Result: **52 passed** (10 database-only checks run once, on laptop).
Each run builds its own route, two shops and a truck for today, so results never depend on earlier test data.

| Persona | What was checked | Result |
|---|---|---|
| Driver | Today's route with progress ring, cash/UPI totals, truck stock (7 cases). Delivers 2 of 3 Pepsi: a reason is required before completing. Adds 1 Mirinda off the truck (only free spare is offered). Takes ₹3,000 of a ₹3,875 bill; sees ₹875 left owing. Bill with WhatsApp link to the shop's number. | pass |
| Driver, offline | Network off at the next stop: van sale + UPI saved on the phone, bill marked "number comes after sync", stop shows Saved and header shows Offline. Network back: syncs on its own, stop becomes Done, truck shows 1 case left. | pass |
| Driver (abuse) | Second delivery to the same shop refused (ALREADY_DELIVERED); more than the truck carried refused (NOT_ON_TRUCK); cannot void entries or write the ledger directly. | pass |
| Shop owner | Khata tab: ₹875 due, Bill and "Paid · Cash" entries with running balance, bill detail "Pepsi × 2 (of 3)". Cannot record payments for itself; sees only its own entries. Ordering pauses with a clear message when overdue or over limit. | pass |
| Manager / Admin | Khata list sorted by overdue, search, ₹875 due. Records ₹500 cash → ₹375. Admin voids it with a reason → back to ₹875, original shown as voided, a Correction entry added. | pass |
| Helper | No login (unchanged). | pass |

Database rules (rolled back, no data kept): bill total ₹10,850 for 8+4+2 cases; retry with the same action id returns the same bill; spare limit enforced; UPI overpayment leaves an advance (−₹25); shop over its credit limit is blocked from ordering; ledger rows cannot be updated (APPEND_ONLY).

## Defects found and fixed
1. **Row-security loop** between shops and delivery days (would have broken every shop and driver screen). Fixed with helper functions.
2. **Offline first load showed "[object Object]"**. Now a clear message; once loaded, the day works offline.
3. **Shop bill showed a broken "×" character** (file encoding). Fixed.
4. **Closing a nested panel also closed the one behind it** (Void inside a shop's khata). Fixed in the shared panel.
5. Panels shared one title id; each now has its own, so screen readers announce the right title.
6. "1 cases" grammar fixed with proper singular/plural.

## Before the pilot
Run `supabase/qa/teardown.sql` to remove all test routes, shops, bills and accounts, and restart bill numbers at 000001.
