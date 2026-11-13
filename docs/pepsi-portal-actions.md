# Pepsi portal: what it offers, what we use, what to do (13 Nov 2026)

Portal: oms.rjcorp.in (Varun Beverages distributor system). Our code: FORTIFIT NUTRITION PVT LTD, ship-to 198626, Raipur Depot (1042), channel Traditional Trade.
Everything below was read read-only (login, `get-*` calls, report data). Nothing was saved or submitted on the portal.
Constraint: the portal allows **one session per user**. Each sync logs in, takes the session over (the person on the website is logged out), reads, and logs out.

## What we read today
Price list, SKU master, credit, order history, End to End and Order Summary reports (60 days), invoice lines, "invoice not yet in Purchases", price-change alerts, credit shown on the Pepsi order card.

## What the exploration found

| # | Finding | Evidence |
|---|---|---|
| F1 | Pepsi adds lines to our orders: **Specific MRP** (type 5) and **Near Expiry (NS01)** (type 8). 30 Oct order had 15 cases of Pepsi 1.25 L PROMO as Near Expiry; 13 Nov order had 100 cases Specific MRP + 5 cases Near Expiry. We do not show or track this anywhere. | End to End report, "Order Type Description" per line |
| F2 | Orders are sized to the **truck**: 8,000 kg truck (Default TL 8000), `filler_truck_threshold` 0.7 (below 70% full Pepsi adds Filler SKUs, order type 12). 13 Nov order = 684 cases = 8,049 kg = exactly 1 truck. 3 Nov: we asked 990 cases, Pepsi corrected to 1,636. | masters-data params, allocated-order rows (`gross_weight`, `truck_utl`), E2E |
| F3 | Pepsi staff key in or correct our orders (created by kaman.patel@rjcorp.in, deepak.sharma8@rjcorp.in, and the shobhit login). | E2E "Created By Oms" |
| F4 | Two 30 Oct orders were **Short Closed** (RO30102601544: asked 776, Pepsi corrected to 2,048, invoiced 0; RO30102601700: asked 2,105, deleted, reason code "PFA"). The portal's short-close reasons include **Invalid Credit**, Partial Truck Load, Extra SKU assigned. We do not know which applied. | oms_order, E2E "Delete Reason Oms", action_reason_masters |
| F5 | **Credit** available is ₹8,605 (type CREDIT; RGB 0), while one truck is about ₹2.5 to 3 lakh. "Invalid Credit" is a Pepsi short-close/unallocate reason. | get-credit-master |
| F6 | **Must Bill list for Nov**: 14 parent SKUs (Nimbooz Cloudy Lemon 345, Tropicana Guava 500 and Fruitz Mixed Fruit 500, 8 Creambell 180 flavours, 7UP Fizz 1.25, Mirinda 1.25, Pepsi 1.25, Sting Classic 180 can), valid 1-30 Nov. System and user must-bill quantities are all **0** (no target set for us yet). | must_bill_dbr_target_report |
| F7 | **Range SKU orders** (type 13): Pepsi tracks month-to-date range quantities per SKU (Nimbooz Cloudy Lemon 100, Creambell Chocolate 10, Coffee 10, from our 3 Nov order). Reward or rule not visible in the portal. | range_target_report, E2E order types |
| F8 | **PDP adherence** (planned order day) is tracked per SKU with class A/B/C, norm quantity, stock in hand and Pepsi's own suggested quantity. For us these fields are all 0/empty: **norms, PDP days and distributor stock are not set up**, so Pepsi's suggested orders (call returns HTTP 500) and adherence cannot work. | pdp_adherence_report, get-next-pdp-date (null), get-suggested-orders (500) |
| F9 | Portal pages we never touch: Inventory, Inventory Norms, Reorder Lead Time, Transit Lead Time, Allocation Appointment, Sales Order view, SKU handling, Order Purchase, Training videos, User guide, Power BI reports. | front-end route list |
| F10 | **Access-control gap on Pepsi's side**: the report "OT End to End Report All" returns every distributor's rows (122,082 rows seen, other companies' orders). We do not use it and stored none of it. | report-data |
| F11 | One Pepsi invoice is **not yet in Purchases**: 5348045407, 13 Nov, 684 cases, ₹2,08,433 before GST. (Only the 4 Nov purchase, 1,636 cases, is entered.) | oms_invoice_line vs purchase |
| F12 | Price rows: 3,193 price rows for 101 SKUs. We keep the highest price per SKU. Some SKUs have several prices (promo / specific MRP). Not yet checked that our cost matches what is invoiced. | get_price_list |
| F13 | Reports empty for us: CRS, Must Bill Target (non DBR), OT E2E summary, Pricing Deviation V2. Nothing to do. | report-data |

## Action items (status as we go)

### P0, no owner decision needed
- [x] **A1. Order lines table** (done 13 Nov: `oms_order_line`, 87 lines stored) (`oms_order_line`): per order and SKU, with order type (General / Specific MRP / Near Expiry / Range / Must Bill / Filler), asked, corrected, allocated, invoiced, delete or rejection reason. Foundation for A2 to A4. (F1, F2, F4)
- [x] **A2. Telegram + Pepsi page: "Near Expiry / Specific MRP lines on your order"**: which SKUs, how many cases, "sell these first". (F1)
- [x] **A3. Why Pepsi changed or cut an order**: add the reason (deleted reason, SAP rejection reason, truck fill, filler added) to the existing change alert and the Pepsi page. (F2, F4)
- [x] **A4. Credit check on the order card** (was already there, priced from portal prices incl. GST; now warns when some items fall back to our average cost): show "credit ₹X vs this order ₹Y, short by ₹Z" and a warning when credit is below the order value. (F5)
- [ ] **A5. Truck meter on the order card**: kg and % of an 8,000 kg truck for the suggested order (weights from allocated lines), warn under 70%. (F2)
- [ ] **A6. Must Bill and Range SKUs** shown on the Pepsi page and marked on the order card; show month-to-date range quantities. (F6, F7)
- [ ] **A7. Sync schedule that does not log the team out**: fixed quiet times only (no 10-minute polling), and skip the sync when the portal session is in use. (constraint above)
- [ ] **A8. Tell the owner now: book invoice 5348045407 in Purchases when the goods arrive.** (F11)
- [ ] **A9. Price check**: compare invoiced price per case with our current cost per SKU and flag differences. (F12)

### P1, needs a conversation with Pepsi's rep (Kaman Patel / Deepak Sharma)
- [ ] **B1.** Ask what Must Bill and Range SKUs earn (this is the open question about the ₹11 support), and get the November targets set (all 0 today). (F6, F7)
- [ ] **B2.** Ask for norms, PDP (planned order) days and lead times to be set up so Pepsi's suggested orders and adherence report work. (F8)
- [ ] **B3.** Ask what "PFA" means as a delete reason, and why the 30 Oct orders were short-closed. (F4)
- [ ] **B4.** Decide whether to report our stock to the portal (Inventory page) once B2 is done. Needs owner OK (writes to the portal).

### P2, owner decision
- [ ] **C1. Draft order from our reorder list** (portal `save-draft-order`; submit stays with a person). Only after we know who places orders (F3). Needs owner OK.
- [ ] **C2.** Report F10 to Pepsi, or leave it. Our decision: do not use that report.

## Do not do
- Never call `submit-orders`, `update-*`, `delete-*`, `push-to-sap`, `short-close-*` or any save endpoint without the owner's OK.
- Never use the "OT End to End Report All" report.
