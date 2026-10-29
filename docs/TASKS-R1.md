# Release 1 task list

Based on [PRD.md](./PRD.md) and [HLD.md](./HLD.md). Each milestone ends with something that can be demoed. Work top to bottom.

Legend: **[DB]** migration/RPC/RLS, **[FE]** frontend, **[T]** tests, **[OPS]** setup.

## M0. Clean slate
- [x] 0.1 [OPS] Tag the current commit `v0-deal-sourcing` and push the tag.
- [x] 0.2 [OPS] Decide which Supabase project to use (see "Decisions needed").
- [x] 0.3 [DB] In the old project, unschedule the `pg_cron` spy job, then drop the old tables: `shopkeepers`, `watchlists`, `orders`, `admin_settings`, `matches`, `telegram_configs`, `spy_trackers`, `invoices`, `monitor_health`. This is only needed if we reuse the project.
- [x] 0.4 [FE] Delete `src/components/*`, `src/config/admin.ts`, `src/utils/invoiceGenerator.ts` (we'll rewrite it later), `scripts/`, `telegram-mcp/`, `marginmart_monitor.session`, `monitor.log`, `Procfile`, `requirements.txt`, the old `tests/`, `test-results/`, `playwright-report/` and `scratch/pepsi`.
- [x] 0.5 [OPS] Add `*.session`, `*.log`, `__pycache__/`, `test-results/`, `playwright-report/` and `supabase/.temp/` to `.gitignore`, and untrack the files already committed.
- [ ] 0.6 [OPS] Install the Supabase CLI. Run `supabase init` and `supabase link`. From here on, every schema change is a migration file in `supabase/migrations/`.
- [x] 0.7 [FE] Add pinned dependencies: `react-router`, `@tanstack/react-query`, `i18next`, `react-i18next`, `vite-plugin-pwa`, `idb`, `exceljs` and `vitest`. Use the folder layout from HLD §3.
- [x] 0.8 [OPS] Rewrite the README with setup steps, environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) and the commands.

**Done when:** the app builds as an empty shell, and the database has no tables in `public`.

## M1. Base schema and auth
- [x] 1.1 [DB] Enums and tables: `profiles`, `join_requests`, `settings` (singleton), `audit_log` and the audit trigger function.
- [x] 1.2 [DB] `auth_role()`, `auth_shop_id()` and `auth_vehicle_id()` helpers (security definer, stable).
- [x] 1.3 [DB] Phone + PIN login:
  - `admin_create_user(phone, name, role, shop_id?, vehicle_id?, pin)` creates the auth user (email `<phone>@login.marginmart.app`) and its profile. This runs in an Edge Function that uses the service role.
  - `admin_reset_pin` does the same for resets.
  - `login_attempts` table plus a lockout check.
- [x] 1.4 [FE] Login screen: phone number plus a 6-digit PIN pad, in Hindi and English. After login, route to `/shop`, `/driver` or `/admin` by role.
- [x] 1.5 [FE] "Request to join" form, available to anyone without logging in. It goes through an RPC with rate limiting.
- [x] 1.6 [FE] Admin: Users screen (list, create, reset PIN, deactivate) and Join requests queue.
- [x] 1.7 [FE] Set up i18n with `en.json` and `hi.json`, plus a language toggle.
- [x] 1.8 [T] pgTAP: each role sees only its own profile, and anonymous users see nothing.

**Done when:** both admins and one test shop can log in and land on the right screen.

## M2. Catalogue, prices and network
- [x] 2.1 [DB] Tables: `brand`, `pack`, `variant`, `price_list`, `price_list_item` (generated `net_rate`), `route`, `vehicle`, `shop`. Add RLS and audit triggers.
- [x] 2.2 [DB] `activate_price_list(id)` RPC, with a partial unique index so only one list can be active.
- [x] 2.3 [DB] Seed file: brand PepsiCo, 39 packs from the 01-09-26 sheet, variants from the product photo, 3 routes (Mon/Thu, Tue/Fri, Wed/Sat), 4 vehicles, and price list 01-09-26.
- [x] 2.4 [FE] Admin catalogue: packs and variants, with photo upload to Storage. Compress photos in the browser to about 100 KB WebP each.
- [x] 2.5 [FE] Admin price lists: create a draft, edit it in a grid, import from Excel (match rows by pack name, show the unmatched ones), then activate.
- [x] 2.6 [FE] Admin routes and vehicles: plain create/edit forms.
- [x] 2.7 [FE] Admin shops: list, filter by route, edit, stop order. Bulk CSV import that also creates logins with PINs. Export the list of PINs so they can be shared on WhatsApp.
- [x] 2.8 [T] Vitest for net rate, shop margin and money formatting.

**Done when:** the PepsiCo sheet is imported, and 150 test shops exist across the 3 routes.

## M3. Shop ordering
- [x] 3.1 [DB] Tables: `route_day_plan`, `orders`, `order_line`. Use `orders`, not `order`, because `order` is a reserved word in SQL.
- [x] 3.2 [DB] A `pg_cron` daily job that creates plans for the next 14 days for each route.
- [x] 3.3 [DB] Order RPCs:
  - `place_order` resolves which plan the order belongs to, checks the cutoff, merges into the shop's existing order for that plan, saves the prices at that moment, and checks credit (balance is 0 until M5).
  - `update_order` and `cancel_order`.
- [x] 3.4 [FE] Shop home: next delivery date and cutoff countdown, plus a "Reorder last order" button.
- [x] 3.5 [FE] Shop catalogue: flavour tiles grouped by pack, showing net rate, MRP, margin and a BOGO badge, with a quantity stepper.
- [x] 3.6 [FE] Cart and checkout. My orders, with edit or cancel until the cutoff.
- [ ] 3.7 [FE] PWA manifest, install prompt and Hindi labels throughout.
- [x] 3.8 [T] pgTAP: cutoff, merging orders, price snapshot, and that a shop can't read another shop's orders.

**Done when:** a shopkeeper on a phone places, edits and cancels an order before the cutoff.

## M4. Operations: orders and loading sheet
- [x] 4.1 [FE] Admin orders list with filters. Place an order on behalf of a shop. Cancel a line, with a reason.
- [x] 4.2 [DB] `v_route_load` view. `load_line` table. `lock_load(plan_id, spares[], vehicle_id, driver_id)` RPC.
- [x] 4.3 [FE] Loading sheet for each route and day: cases per variant, editable spare cases, check against truck capacity, list of stops. Printable, and lockable.
- [x] 4.4 [FE] Dashboard v1: today's orders, cases per route, and which shops haven't ordered yet.

**Done when:** the manager can print and lock tomorrow's loading sheet.

## M5. Driver app, ledger and payments
- [x] 5.1 [DB] Tables: `delivery_line`, `ledger_entry` (insert only), `invoice` (simple bill in R1) and `invoice_counter`. Add `v_shop_balance`, which includes the overdue calculation.
- [x] 5.2 [DB] `record_delivery` RPC as in HLD §6.4. Repeating the same `client_action_id` must not create a second delivery. Van-sale cases are checked against the truck's remaining spares.
- [x] 5.3 [DB] `record_payment` and `void_ledger_entry` RPCs. The void creates a reversal entry and is admin-only.
- [x] 5.4 [DB] Turn on the credit block in `place_order`, with a manager override.
- [x] 5.5 [FE] Driver screens: today's plan, stops in route order, and a shop screen for delivering full or partial quantities with a reason, adding van-sale items and taking payment.
- [x] 5.6 [FE] Printable HTML bill (print CSS), shared to WhatsApp through the phone's share menu.
- [x] 5.7 [FE] Offline mode:
  - Save the day's data on the phone (IndexedDB).
  - Queue actions while offline and sync them later, showing "N pending".
  - Mark bills created offline as "provisional".
- [x] 5.8 [FE] Shop app: My balance (due, overdue, advance) and my bills. Admin: ledger per shop, payment entry, ageing report.
- [x] 5.9 [T] pgTAP:
  - Repeating a delivery doesn't double-charge.
  - Partial delivery bills only what was delivered.
  - Paying more than owed leaves an advance.
  - A driver can't touch another vehicle's plan.

**Done when:** a driver completes a route with a partial delivery, a van sale and a payment while offline, and the balances come out right after sync.

## M6. End of day, audit and pilot
- [x] 6.1 [DB] `cash_handover` table. `close_day` RPC: compare returned stock and collected cash with what's expected, and flag differences.
- [x] 6.2 [FE] Driver end-of-day screen. It's blocked while there are unsynced actions.
- [x] 6.3 [FE] Admin reconciliation view. Dashboard v2 adds collections, outstanding, overdue shops and flagged differences.
- [x] 6.4 [FE] Audit log viewer for admin and manager.
- [ ] 6.5 [OPS] GitHub Actions nightly backup: run `pg_dump`, encrypt it, keep it 30 days. Do one restore test. (Workflow written; needs secrets and a restore test by the owner.)
- [x] 6.6 [T] Playwright end-to-end tests against local Supabase:
  - Order → lock → deliver → pay → close.
  - The credit block.
  - Offline sync.
- [ ] 6.7 [OPS] Check Supabase security advisors. Deploy to Vercel. (Advisors checked; deploy by the owner.)
- [ ] 6.8 Pilot: one route for one week with real shops, then fix what comes up.

## Decisions needed before M0
1. **Supabase project.** The current `marginmart` project contains old deal-sourcing data. That includes 3,102 matches and 23 orders, and an old migration (`allow_anon_all_orders`) that lets anyone with the public key read and write orders.
   - **Option A:** reuse it and drop everything. We keep the URL and keys, and it's still free.
   - **Option B:** create a new project. This is cleaner, but the free plan allows only 2 active projects per account, and you have 3 connected (marginmart, planstalk, propertypassport). So B may mean pausing one of them.
   - I recommend **A**, after the git tag. Dropping is irreversible, so I'll ask before running it.
2. **Old data backup.** Do you want a CSV export of the old tables before they're dropped?
