# Release 1 end-to-end review (2026-10-29)

Full review of the app across every role (setup/auth, shop owner, driver, manager, admin), run against the live Supabase project with the Playwright review suite plus role walkthroughs. Done through an implement-and-review loop (second-model reviewer gated completion, verdict APPROVED).

## Result
- **tsc** 0 errors · **eslint** 0 · **vitest** 15/15 · **vite build** OK
- **Playwright** `tests/review`: 58 passed / 10 skipped / 0 failed (10 skips are laptop-only database checks, by design)
- Live site serves the latest commit and is connected to Supabase: https://marginmart.vercel.app
- Pilot data intact (see below)

## Issues found and fixed
| Area | Issue | Root cause | Fix |
|---|---|---|---|
| Shop | "Add" did nothing when no delivery day existed | The add control was rendered dead (no disabled state) when `next_delivery` returned nothing | Render a real disabled Stepper, so it's visibly unavailable instead of silently inert |
| Admin/Manager | Orders page opened on an empty day | Default day didn't account for which days had orders | Days now show an order-count badge and the page opens on a day that has orders |
| Loading | Locked-load banner showed a dangling "driver ." | Leftover template fragment | Cleaned up the banner text |
| Tests | `load_line` lock assertion collided with a real pilot order on the shared Mon/Thu plan | Assertion wasn't scoped to the QA variant | Scoped the assertion to the QA variant (not a weakened check) |

No database migration was needed this round — the fixes were UI, test-scope and seed only. No new Supabase security advisory was introduced.

## Seed restoration
The review suite's QA fixtures and the `_qa_make_user` helper had been removed by an earlier teardown and were never committed. They were reconstructed and committed as `supabase/qa/seed.sql`, and `supabase/qa/teardown.sql` was corrected (added `cash_handover`, scoped `audit_log`, widened the shop matcher, reordered deletes). The teardown is strictly QA-scoped.

## Teardown + data-intact verification (after the review)
QA fixtures removed: 0 QA shops, 0 QA staff logins, 0 QA routes left.

Pilot data confirmed present and untouched:
- Admins: Mehul (8871565551), Shobhit (9630012636)
- Shop: Shobh
- Routes: Mon/Thu, Tue/Fri, Wed/Sat
- 1 active price list · 55 product variants · 13 upcoming route-day plans

Note: shop Shobh has 1 test order left from earlier manual testing. It's on your real shop, so it was left in place — cancel it from the app if you don't want it.

## Reviewer's non-blocking notes (no action required)
- The Orders page default day can briefly flip to the nearest day-with-orders once counts load. Acceptable as shipped.
- `useOrderCounts` rebuilds its planIds array each render, matching the existing `useOrdersFor` pattern. React Query serializes the key, so it's not a refetch leak.

## Commits pushed to main
- `9770ee5` restore QA persona-review seed and scope teardown to QA fixtures
- `fabd9f3` fix: live Add button, Orders day badges, clean locked-load banner
- `c96dc99` test: scope load_line lock assertion to the QA variant
