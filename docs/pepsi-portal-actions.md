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
- [x] **A5. Truck meter on the order card**: kg and % of an 8,000 kg truck for the suggested order (weights from allocated lines), warn under 70%. (F2)
- [x] **A6. Must Bill and Range SKUs** (page card + Telegram when Pepsi sets a Must Bill quantity; not marked on the order card) shown on the Pepsi page and marked on the order card; show month-to-date range quantities. (F6, F7)
- [x] **A7. Sync that does not log the team out**: logs in without taking over (the portal answers "User Already Logged In" when someone is on it), waits up to 4.5 min, then skips quietly; takes over only if the data is over 20 h old or FORCE=1. Runs once a day (08:00) plus a refresh before an order card if the data is over 3 h old. (constraint above)
- [x] **A8. Tell the owner now: book invoice 5348045407 in Purchases when the goods arrive.** (F11)
- [x] **A9. Price check** (done 13 Nov): invoiced price per case equals the portal base price for 28 of 29 SKUs; the one exception (Sting Classic 180 ml can, ₹406 vs ₹488) was a Near Expiry line. Our recorded stock cost equals the portal price incl. GST, same basis as the order card. No fix needed. Note: Near Expiry and Specific MRP lines can be invoiced at a different price, so check the invoice price when entering the purchase. (F12)

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

## Message for Pepsi's rep (covers B1 to B4, edit before sending)

Namaste. Portal dekhte hue kuch sawaal hain, K.D. Foods (Fortifit, code 198626):

1. **Must Bill aur Range SKU**: Nov ki Must Bill list me 14 SKU hain par quantity sab ki 0 hai. Kya hamare liye koi target hai? Aur Must Bill / Range SKU bill karne par hamein kya milta hai (support, scheme, incentive)?
2. **Norms, PDP aur lead time**: hamare portal me norms, PDP (order ka din) aur lead time set nahi hain, isliye Suggested Order kaam nahi karta (error aata hai). Kya ye set ho sakta hai? Hamara order din aur lead time aap batayein.
3. **30 Oct ke 2 order**: RO30102601544 (Short Closed) aur RO30102601700 (reason "PFA"). "PFA" ka matlab kya hai, aur ye kyun cancel hue (credit, truck load, ya kuch aur)?
4. **Near Expiry aur Specific MRP**: har order me ye lines Pepsi jodti hai. Near Expiry maal ki expiry date aur rate pehle se pata chal sakta hai? Kya hum ye lene se mana kar sakte hain?
5. **Truck**: 8,000 kg ka truck aur 70% se kam par filler. Kya hum chhota order de sakte hain bina filler ke?
6. **Ek jankari**: portal me "OT End to End Report All" naam ki report sab distributors ka data dikha rahi hai (hamne use nahi kiya, sirf bata rahe hain).

Dhanyavaad.

## Discrepancies: Pepsi portal vs our catalogue, stock and website (13 Nov 2026)

Checked: 4 Nov purchase vs the two 4 Nov Pepsi invoices, every portal-to-catalogue mapping, MRPs, prices, stock moves, and the unbooked 13 Nov invoice.

What matches: the 4 Nov purchase has the same 1,636 cases as the invoices (28 lines each), and the quantities and costs per item agree. Stock balances add up from the stock moves. Our recorded costs equal the portal price including GST. All active items we buy have a portal SKU. The price list covers every active pack.

| # | Discrepancy | Status |
|---|---|---|
| D1 | **7UP 400 ml PET** was mapped by hand to the **750 ml** SKU 1778 (₹779). Pepsi invoiced 7UP Zero 400 ml (SKU 4057, ₹489). Made the "400ml PET" pack look like a ₹-249 margin item and priced the reorder at ₹779. | **Fixed** (mapped to 4057, manual) |
| D2 | **300ml Soda** was mapped by hand to **Aquafina 500 ml water** (SKU 4736). Right item: Lehar Evervess Soda 300 ml RGB (SKU 2628, MRP ₹10, ₹166). Never bought, no stock. | **Fixed** (mapped to 2628, manual) |
| D3 | **Invoice 5348045407** (13 Nov, 684 cases, ₹2,08,433 before GST) is not in Purchases, so the website stock is short by those cases if the goods arrived. | **Waiting**: owner will say when the goods arrive, then we enter the purchase |
| D4 | **330 ml Can** pack has only Pepsi and Pepsi Black. Pepsi invoiced 3 cases each of **Mirinda, 7UP, Mountain Dew 330 ml cans** on 13 Nov (SKUs 4060, 4062, 5550241). | **Fixed** (Mirinda, 7UP, Mountain Dew added to "330ml Can", mapped to 4060, 4062, 5550241; same price list line as the pack; stock 0 until the 13 Nov purchase is entered) |
| D5 | **Pepsi Black 300 ml can**: our MRP 40, portal's current SKU 5550341 has MRP 50 (₹979). The 4 Nov invoice billed SKU 4068 at MRP 40 (₹734), a SKU no longer in the portal list. | **Closed**: the 4 Nov invoice shows MRP ₹40 (SKU 4068), so our ₹40 is right. The portal now lists only the MRP-50 SKU, which we do not use for cost (flagged "Check", cost falls back to our average cost) |
| D6 | **Mountain Dew 2.25 L**: our MRP 90, portal 100. | **Open**: not on either invoice. Flagged "Check"; check the MRP on the next invoice |
| D7 | **Tropicana 1 L**: we have 5 packs for 3 portal SKUs. MRP 105 and 115 both map to Apple (portal 105). Cranberry 140 and "Cranberry 120" both map to Cranberry (portal 140). | **Open**: none of these are on either invoice. Left as they are; check the MRP on the next Tropicana invoice |
| D8 | **Sting Gold 180 ml can** is mapped to Pepsi's "Sting Classic 180 ml can" (SKU 5550221). Same product? | **Open**: owner does not know; ask the Pepsi rep |
| D9 | **Pepsi 1.25 L**: mapped to the old PROMO SKU 1892; Pepsi invoices the current SKU 5550224. Same ₹630. | **Fixed** (mapped to 5550224) |
| D11 | Six rate-sheet placeholder items showed "not on portal" (never bought, sold or ordered; stock 0): Mix Fruit/Apple/Litchi Tetra 125ml, 750ml (MRP 35), Slice 1.2L, Trop PET 1L, VAD (MRP 20), VAD Rest (MRP 30). | **Fixed** (Tetra 125ml mapped to Fruitz Mixed Fruit 8339, 750ml MRP 35 to Mountain Dew 750 ml 5550247, the other four hidden; hidden items can be shown again from Catalogue) |
| D10 | Portal sells **37 priced SKUs** we have no item for (see Pepsi page, "Not matched"). Not an error; shows what we could stock. | Info |
