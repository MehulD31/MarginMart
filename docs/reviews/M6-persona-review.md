# M6 persona review: end of day, change history, backups (2026-10-29)

Suite: `npm run review`, phone 390×844 + laptop 1366×820. Result: **58 passed, 10 skipped** (database-only checks run once, on laptop). In one full run, 3 older laptop checks (printed sheet, ordering, wrong PIN) timed out under load and passed on rerun. They don't touch M6 code.

| Persona | What was checked | Result |
|---|---|---|
| Driver | "End day" is blocked while any delivery or payment is still waiting to sync. Once synced, the screen fills in the expected returns per flavour and the expected cash. The driver counts 0 Pepsi where 1 was expected and hands over ₹3,000. The difference is flagged and sent to the office. The day closes and drops off the driver's list. | pass |
| Manager | End of day page shows the closed route, expected vs handed cash, and the 1-case stock difference. Confirms cash received. The dashboard Money panel shows collections (cash/UPI), outstanding, overdue shops and flagged closings, with links to Khata and End of day. | pass |
| Admin | Change history shows the end-of-day record with who did it and which fields changed. Admin alone can reopen a closed day. | pass |
| Shop / Helper | Unchanged; no access to end of day or change history. | pass |

Database rules: closing twice with the same action id returns the same result. A day that isn't loaded or out can't be closed. Bad return quantities are refused. Undelivered locked orders are cancelled on close and restored on reopen. Drivers can only close their own day. `cash_handover` can't be written directly.

## Defects found and fixed
1. **`expected_returns` had no caller check**, so any signed-in user could read any route's stock. It now allows only staff or that route's driver (migration `20261029100000`).
2. **Dashboard said "4 flagged · all matched"** once all cash was received. It now says "cash received, check differences".

## Ops
- Nightly backup: `.github/workflows/backup.yml` makes an AES-256 encrypted `pg_dump` and keeps it 30 days. The secrets setup and restore steps are in the README. The restore test hasn't been done yet.
- Supabase security advisor: no new risks. The warnings are about functions that signed-in users can call, and each of them checks the caller's role. The 4 notes about tables with no access rules are deliberate. Leaked password protection is off; it doesn't apply to PIN logins.

## Before the pilot
Set the backup secrets, deploy to Vercel, then run `supabase/qa/teardown.sql`.
