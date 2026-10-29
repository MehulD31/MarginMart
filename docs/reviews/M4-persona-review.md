# M4 persona review: orders and loading sheet (2026-10-29)

Suite: `npm run review`, phone 390×844 + laptop 1366×820. Result: **39 / 39 passed**.

| Persona | What was checked | Result |
|---|---|---|
| Manager | Lands on "Next delivery" dashboard with call list; Orders by day and route; edits a phoned-in change (3 → 4 cases, ₹3,100); loading sheet sums orders, adds spare (4 + 2 = 6), checks truck capacity, needs vehicle + driver, locks; cannot unlock | pass |
| Manager (abuse) | Lock refused with a non-driver as driver or a bogus spare item; locked orders can't be edited (ORDER_LOCKED); unlock refused (admin only) | pass |
| Admin | All 9 admin pages reachable on phone and laptop, no sideways scroll, labelled controls | pass |
| Shop owner | Their order shows "On the truck" (locked) after loading; ordering flow from M3 still passes | pass |
| Driver | Cannot read load sheets yet (they get their own view in M5) | pass |
| Helper | Printed A4 sheet: route + date heading, vehicle and driver, load list with tick column, stops in route order with items, cases and amount; app chrome hidden | pass |

## Defects found and fixed
1. **Laptop pages stretched sideways** when many date chips were shown (grid item with auto margins sized to its content). Fixed with an explicit width.
2. **Phone loading table cut off the Total column.** Tightened columns; all four now fit on a 390px screen.
3. Cancelled orders cluttered the day's list. Now hidden behind "Show cancelled (n)".

## Known limits (by design, later milestones)
- Stock on hand is not checked when locking (stock arrives in R2).
- The driver's own view of the load comes with the driver app (M5).
