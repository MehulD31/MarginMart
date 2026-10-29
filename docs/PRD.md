# MarginMart — Distribution Platform PRD

| | |
|---|---|
| Status | Draft v0.1 |
| Date | 2026-10-29 |
| Owners | Mehul, Shobhit (admins) |
| Replaces | MarginMart deal-sourcing app (retired) and the Pepsi Telegram bot prototype |

## 1. Background

Shobhit is becoming the PepsiCo dealer for an area. He serves **150 retail stores** on **3 routes**. Each route is visited **twice a week** (Mon/Thu, Tue/Fri, Wed/Sat), so there are about 50 deliveries a day. The team is 4 vehicles, 4 drivers, 4 helpers and 1 manager.

A Telegram bot backed by Google Sheets proved the workflow: ordering, route loading, partial deliveries, cancellations, ledger and inventory. It has problems that make it unfit to run the business on:
- It has no real access control.
- Anyone can type free text into the sheet (for example "Mon/Thu", "MON/THU" and "vehical").
- It has no transactions and no GST invoicing.

MarginMart's original deal-sourcing business is discontinued. MarginMart will be rebuilt as a **generic B2B distribution platform**, with PepsiCo as the first brand.

## 2. Goals

1. Shops place orders themselves from their phones before the cutoff, so orders aren't missed or arrive late.
2. Every morning, each truck has an accurate loading sheet that includes spare cases.
3. Drivers record what was actually delivered, sold, collected and returned at each shop.
4. Every rupee and every crate a shop owes is visible and correct (khata).
5. GST-compliant invoices are generated automatically.
6. Admins can see stock, dues and monthly profit.

### Non-goals (v1)
- Volume or slab discounts, and per-shop custom prices
- An online payment gateway (UPI is recorded manually)
- Paid WhatsApp/SMS notifications, and the Telegram bot (retired)
- Route optimisation and GPS tracking
- Purchase orders to PepsiCo (stock received is entered manually)
- Hosting more than one dealer on the platform

## 3. Users and roles

| Role | Who | Device | Access |
|---|---|---|---|
| Admin | Mehul, Shobhit | Desktop / phone | Everything, including price lists, users, settings, and voiding ledger entries |
| Manager | 1 | Desktop | Operations and money: shops, orders, loading, stock, collections, reports. Cannot edit prices, settings or users, and cannot void ledger entries |
| Driver | 4 | Phone | Only today's route for their vehicle: deliveries, van sales, collections, empties, end-of-day return |
| Shopkeeper | ~150 | Phone (low-end Android) | Only their own shop: catalogue, orders, invoices, balance |

Helpers ride with drivers and do not get logins.

## 4. Domain rules (from PepsiCo price sheet dated 01-09-26 and the sample data)

- **Two-level catalogue.** PepsiCo prices by **pack** (e.g. "400ml PET all flavours"). The shop picks a **variant** (flavour: Pepsi, Dew, 7UP, Mirinda…).
  - Pack: name, size, units per case, MRP, brand.
  - Variant: flavour name (Hindi and English), photo, active flag.
  - There are about 39 packs today, with roughly 23 or more flavour images.
- **Unit of sale is the case.** Quantities are whole cases.
- **Monthly price list.** Each list has an effective date. Every pack has a trade price (per case), a scheme value (per case), a scheme type (`Net Rate` or `BOGO on MRP`) and remarks. Net rate = trade price − scheme value, and that is what the shop pays.
  - Shop margin shown in the app = MRP × units − net rate.
  - An order line **snapshots** the price when it is placed. Later price changes never alter past orders.
- **Buy price** (what Shobhit pays PepsiCo) is entered from the PepsiCo invoice each time stock is received. Profit is calculated from it. It does not need to be known in advance.
- **Orders bill what was delivered**, not what was ordered.
- **Partial delivery** is normal and needs a reason (out of stock, shop refused, damaged).
- **Van sales.** Trucks carry spare cases. A driver can sell extra cases at any shop on the route. These are recorded as delivered lines with no ordered quantity.
- **Payments.** Cash, UPI and credit are all accepted. About 80% of shops pay at delivery. Overpayments become an advance (credit balance).
- **Credit.** Each shop has a credit limit (₹) and credit days (default **7**). An unpaid invoice older than its credit days is **overdue**.
- **Returnable glass** (e.g. 200ml RGB CSD and 200ml RGB Slice). Crates and bottles given to and returned by each shop are tracked. The deposit per unit is an admin setting, default ₹0.
- **GST.** Shobhit is registered. Whether the trade price **includes** GST is an admin setting on the price list. Rates (GST plus cess for aerated drinks) and HSN codes are set per pack and must be confirmed by a CA.

## 5. Functional requirements

Priority: **R1** = Release 1, **R2** = Release 2.

### 5.1 Auth and access
| ID | Requirement | Rel |
|---|---|---|
| A1 | Phone number + 6-digit PIN login for all roles. The manager sets or resets PINs and shares them on WhatsApp. No SMS cost. | R1 |
| A2 | Only known phone numbers can log in. An unknown number can submit a "Request to join" (shop name, address, phone), which goes to the manager's approval queue. | R1 |
| A3 | Permissions are enforced in the database (row-level security), not only in the UI. | R1 |
| A4 | Admins add and remove users and assign roles and vehicles. | R1 |

### 5.2 Catalogue and pricing
| ID | Requirement | Rel |
|---|---|---|
| C1 | Admin manages brands, packs and variants, with photos. | R1 |
| C2 | Admin creates a price list with an effective date, either by entering it or by importing CSV/Excel in the PepsiCo sheet layout. Only one list is active at a time, and earlier lists are kept. | R1 |
| C3 | The active price list drives the shop app, cart and invoices. | R1 |
| C4 | GST rate, cess and HSN per pack, plus a "price includes GST" flag per list. | R2 |

### 5.3 Shops and routes
| ID | Requirement | Rel |
|---|---|---|
| S1 | Routes (name and visit days) and vehicles (name, capacity in cases) are fixed lists. No free text. | R1 |
| S2 | Shop: name, owner, phone(s), address, GSTIN (optional), route, stop sequence, credit limit, credit days, active flag. | R1 |
| S3 | Bulk import shops from CSV. | R1 |
| S4 | Manager approves or rejects join requests and assigns a route. | R1 |

### 5.4 Shop app (mobile web, Hindi/English)
| ID | Requirement | Rel |
|---|---|---|
| O1 | Home shows the next delivery date and the order cutoff, e.g. "Delivery Thursday, order by Wednesday 11:59 PM". | R1 |
| O2 | Product grid by flavour, grouped by pack. Shows net rate per case, MRP, the shop's margin per case and a scheme badge (e.g. BOGO). | R1 |
| O3 | +/− quantity in cases, a cart with a total, and order placement. | R1 |
| O4 | "Reorder last order" in one tap. | R1 |
| O5 | Edit or cancel an order until the cutoff (**midnight before the route day**). Orders placed after the cutoff go to the next visit. | R1 |
| O6 | My orders, my invoices and my balance (due, overdue, advance). | R1 |
| O7 | If the shop is over its credit limit or has overdue bills, ordering is blocked with a message. Manager can override. | R1 |
| O8 | Empty crates/bottles currently held. | R2 |

### 5.5 Admin and manager
| ID | Requirement | Rel |
|---|---|---|
| M1 | Dashboard: today's orders, cases per route, today's collections, total outstanding, overdue shops. | R1 |
| M2 | Order list with filters (date, route, shop, status). Place an order on behalf of a shop, since many will still phone in. | R1 |
| M3 | Cancel an order or line, with a reason from a fixed list. | R1 |
| M4 | **Loading sheet** per vehicle per day: cases per variant from orders, plus manager-added spare cases, a total against vehicle capacity, and a stop list. Printable. | R1 |
| M5 | Lock the loading sheet when the truck leaves. | R1 |
| M6 | Ledger per shop and overall: invoices, payments, adjustments, balance, ageing. | R1 |
| M7 | Record a payment against a shop (cash, UPI with reference). | R1 |
| M8 | **End-of-day reconciliation** per vehicle: loaded − delivered = returned stock. Expected cash/UPI vs handed over. Discrepancies are flagged. | R1 |
| M9 | GST tax invoice, PDF, with sequential number per financial year. | R2 |
| M10 | Stock: receive from PepsiCo (variant, cases, buy price, invoice no.). Live stock = received − delivered + returned. | R2 |
| M11 | Empties ledger per shop: given, returned, balance, optional deposit. | R2 |
| M12 | Expenses and other income (salaries, rent, electricity, fuel, PepsiCo incentives) by month. | R2 |
| M13 | Monthly profit = revenue − cost of goods (from buy prices) − expenses + other income. | R2 |
| M14 | Audit log: who changed what, and when, for prices, ledger, orders and settings. | R1 |

### 5.6 Driver app (mobile web)
| ID | Requirement | Rel |
|---|---|---|
| D1 | Today's stops for my vehicle in route order, with each shop's order and dues. | R1 |
| D2 | At a shop: confirm delivered quantity per line (full or partial with a reason), and add van-sale cases from the truck's spare stock. | R1 |
| D3 | Record payment received (cash or UPI) and show the shop's balance after it. | R1 |
| D4 | Share the delivery bill or invoice via WhatsApp (share link, no paid API). | R1 |
| D5 | Works on a weak network: actions queue offline and sync when back online. | R1 |
| D6 | Record empties collected. | R2 |
| D7 | End of day: report unsold stock and cash in hand, for M8. | R1 |

## 6. Non-functional requirements

- **Scale.** About 150 shops, about 50 deliveries a day, around 40 packs, and 1–2k order lines a week. No performance concerns at this size.
- **Mobile first.** Shop and driver screens are usable on a 5" Android over 3G/4G, and the initial load is under 3 seconds on 4G.
- **Language.** Hindi and English with a toggle. Product names are stored in both.
- **Money correctness.** The ledger is append-only. Corrections are reversal entries, never edits or deletes. All amounts are stored in paise (integers).
- **Security.** Phone + PIN auth with lockout, and database row-level security per role. No secrets in the frontend bundle.
- **Availability.** Downtime is tolerated during off-hours. Nightly off-site database backups.
- **Cost.** **₹0/month.** Only free tiers (Supabase Free, Vercel Hobby, GitHub Actions, Sentry free). No SMS or paid APIs.

## 7. Releases

| Release | Scope | Done when |
|---|---|---|
| R1: Ordering and delivery | Auth, catalogue, price list, shops/routes, shop app, orders, loading sheet, driver app, basic ledger and payments, reconciliation, audit log | One route runs end to end for a week with real shops |
| R2: Money and stock | GST invoices, stock and buy prices, empties, expenses, profit | Month-end close done from the system |
| Later | Volume slabs, per-shop prices, WhatsApp notifications, purchase orders, analytics, multiple dealers | — |

Before R1 work starts, tag the current repo as `v0-deal-sourcing`, then remove the deal-sourcing code and Supabase tables.

## 8. Success metrics (first 8 weeks after R1)

- At least 60% of orders placed by shops themselves (the rest by manager or driver)
- Zero orders missed because they were "not received in time"
- Loading sheet ready by 7 AM every route day
- End-of-day cash discrepancies resolved within 24 h
- Outstanding balances agree with a manual cross-check at month end

## 9. Open questions

| # | Question | Owner | Blocks |
|---|---|---|---|
| Q1 | Does PepsiCo charge a deposit on glass bottles and crates? How much? | Shobhit | M11 (default ₹0 until answered) |
| Q2 | Does the trade price include GST? Which GST, cess and HSN apply per pack? | Shobhit / CA | M9, C4 |
| Q3 | Does PepsiCo pay incentives or commissions outside the invoice? | Shobhit | M12, M13 |
| Q4 | Clarify ambiguous price rows: two "750ml" rows, four "Tropicana LTR Tetra" rows, Cream Bell and Lehar pricing | Shobhit | C2 |
| Q6 | Is a 7-day credit period right as the default, and what credit limit per shop? | Shobhit | O7 |

## 10. Assumptions

- Each shop has one route and one regular visit pattern.
- One driver per vehicle per day. Vehicle capacity is set by the admin.
- The cutoff is midnight before the route day, and manager/admin can override it.
- Prices shown to shops are per case and include taxes when "price includes GST" is on.
- The existing Google Sheet holds only test data, so no migration is needed.
