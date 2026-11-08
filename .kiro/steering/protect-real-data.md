# Never delete real business data (owner rule, 8 Nov 2026)

The live database holds the owner's real work: counter bills (parchis), orders, khata, payments, purchases, stock moves, shops and logins.

- **Never run a bulk delete or reset on real data** (`delete from cash_sale`, `delete from orders`, a stock reset, `setval` back to 1, and so on) as part of a fix, a feature or a test clean-up.
- **Tests clean up only what they created**:
  - test shops are named `QA …`;
  - use `tests/db/cleanup.sql`, which touches only `QA %` / `TEST %` shops and their records;
  - never widen that script.
- **Tests should not write to real shops.** If one must, it deletes its own records by id through `admin_delete` at the end.
- **Deleting or changing any real record needs the owner's explicit OK first.** Show exactly what will go (number, shop, amount) and wait for "yes".
- **Before any clean-up, list what would be deleted** and check that every row belongs to a QA shop.
- **Recovery source:** `audit_log` keeps a full `before` copy of every deleted bill (`cash_sale`) and bill line (`cash_sale_line`). The 8 Nov incident was restored from it.
