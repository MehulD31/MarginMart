# M2 persona review (2026-10-29)

Suite: `npm run review` (tests/review/personas.spec.ts), phone 390×844 + laptop 1366×820.
Result: **26 / 26 passed** after fixes.

| Persona | Checks | Result |
|---|---|---|
| Everyone | login + join usable, wrong PIN message, Hindi toggle | pass |
| Admin | every page reachable from nav, clean, no sideways scroll, labelled inputs; add-shop validation; no-live-price warning + Make live; pack sheet with 5 flavours | pass |
| Manager | lands in admin; catalogue read-only notice; no price editing or Make live; can't create staff (UI + server 403); price edits refused by DB | pass |
| Shop owner | forced PIN change, weak PIN refused; shop home; admin URL redirects; DB refuses other shops, draft prices, self credit edit | pass |
| Driver | driver home; admin URL redirects; no shop/user data via API | pass |
| Helper | no helper role can be created (server 400) | pass |

## Defects found and fixed
1. **Laptop sidebar navigation broken** (high). Links were relative, so a click went to `/admin/shops/shops/catalog`. Fixed: absolute `/admin/...` links.
2. Test harness: login helper didn't wait for the redirect; manager API check sent an update without a filter. Fixed in the suite.

## Notes
- QA accounts and two QA shops (numbers 90000001xx/9000000150-151) live in the database for this gate. Remove before the pilot with `supabase/qa/teardown.sql`.
