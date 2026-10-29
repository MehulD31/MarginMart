# M3 persona review: shop ordering (2026-10-29)

Suite: `npm run review` (personas + ordering specs), phone 390×844 + laptop 1366×820.
Result: **33 / 33 passed**, plus a database rules check (rolled back, no data changed).

| Persona | What was checked | Result |
|---|---|---|
| Shop owner | Next delivery and cutoff shown; adds flavours with the stepper; sees "You earn ₹185" margin; cart total ₹2,325 for 3 cases; cart survives a reload; places order; saved order reloads into the cart; changes it and updates (4 cases, ₹3,100); cancels from My orders; Hindi screens; no sideways scroll, labelled controls | pass |
| Shop owner (abuse) | Cannot order for another shop, choose a delivery, send 0 / negative / 1000 / 1.5 / text quantities or duplicates, or insert orders directly | pass |
| Shop owner (money) | BOGO pack bills net rate (2 × ₹420 = ₹840); line stores trade, scheme, net and MRP at order time | pass |
| Manager | Sees the shop's order; takes a phoned-in order into the same order (one order per visit); can edit after cutoff; blocked once the truck is loaded | pass |
| Driver | Sees no orders; cannot place orders | pass |
| Admin | Everything from M2 still passes; price list now shows Live and read-only | pass |
| Helper | No login (unchanged) | pass |

Database rules (rolled back): order placed for Mon 2 Nov → after cutoff the shop's cancel is refused (CUTOFF_PASSED) and a new order goes to the next visit → manager still edits after cutoff → manager blocked when loaded (ORDER_LOCKED).

## Defects found and fixed
1. **Cart didn't survive a page reload in the test**: the test itself cleared it on every load. Fixed the test so the reload check is real.
2. **After placing an order, the saved order did not come back into the cart** (high: the shop would see an empty screen and think the order was lost). Fixed: the cart refills once per saved order.
3. Stale assumptions in M2 tests (shop owner name moved to Account; shop may read the live price list). Updated.
4. Lint: impure clock in render; replaced with a one-minute clock hook.
