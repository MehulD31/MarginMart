# Autopilot (the business runs itself)

Rule: `.kiro/steering/automation-thumb-rule.md`. People only feed data (Telegram, app). Everything below runs on GitHub Actions, Vercel and Supabase with the laptop off. Every job is idempotent (`public.ops_log`), so running it twice never sends, posts or bills twice.

## What runs when (IST)
| When | Job | What it does |
|---|---|---|
| every ~10 min | `ops.yml` events | New join request, new shop order, item out of stock, website down → KD group (each once) |
| 08:00 | `ops.yml` morning | Trucks + orders, scheme starting/ending, low stock with days left, **Pepsi order text** to forward, overdue khata with **tap-to-WhatsApp reminder links** |
| 18:00 | `content.yml` | Each new purchase → "माल आ गया" poster (real items + photos, no prices) → social queue + preview in the group with ❌ |
| 19:30 | `ops.yml` social | Next queued post → Telegram channel (if set) + Facebook + Instagram (once connected). Ended schemes and un-previewed posts never go out |
| 21:30 | `ops.yml` night | Day's crates, sales, cash/UPI, collections, counter margin, below-cost sales, closing problems, one AI tip |
| Mon 09:00 | `ops.yml` weekly | Week vs last week, best day, top items, new shops, biggest dues, **sleeping shops with WhatsApp links** |
| 1st, 09:30 | `ops.yml` month | Last month's sales register + payments as a CSV file for the accountant |
| 10:00, 23:00 | `ops.yml` watchdog | Re-sends a missing report, re-runs a missing backup, bot webhook, failed GitHub runs, social stuck, Supabase free-tier size, the 10-min poller alive |
| 03:00 | `backup.yml` | Encrypted database dump (checked by the watchdog) |
| every push | `ci.yml` | Lint, build, tests. A failure on main → KD group |
| 00:05 (pg_cron) | Supabase | `ensure_route_day_plans(14)` |

## Telegram bot (KD group)
- **Plain Hinglish works**, no slash needed: "aaj ka hisaab", "kal ka hisaab", "is hafte ka report", "sharma ka udhaar", "sting ka stock", "kya mangana hai", "kaunsi dukan order nahi kar rahi", or any business question (answered by AI from live numbers). Owners' chit-chat is ignored; to talk to the bot about anything else, start with "bot ..." or reply to a bot message. Routing rules: `api/_intent.js` (tested in `scripts/ops/intent.test.mjs`).
- **Pepsi scheme**: paste or forward the message. Only messages that look like a scheme go to the (1-minute) scheme reader; if unsure, the bot asks with buttons.
- **Commands** (all instant except `/check`): `/menu` (buttons) · `/sale` · `/aaj` (= `/report`) · `/kal` · `/week` · `/due [shop]` (tap a shop for its khata + WhatsApp reminder) · `/stock [item]` · `/order` (Pepsi order text) · `/sleeping` · `/ask <question>` · `/check` (full system check via GitHub).

## Exact times: cron-job.org (when the account is given)
GitHub's own schedule can run late, and the watchdog covers that. For exact times, create these cron-job.org jobs (timezone Asia/Kolkata):
- POST `https://api.github.com/repos/MehulD31/MarginMart/actions/workflows/ops.yml/dispatches`
- Headers: `Authorization: Bearer <fine-grained token, this repo, Actions read+write>`, `Accept: application/vnd.github+json`
- Body for each job:

| Job | Time | Body |
|---|---|---|
| KD morning | 08:00 daily | `{"ref":"main","inputs":{"mode":"morning"}}` |
| KD social | 19:30 daily | `{"ref":"main","inputs":{"mode":"social"}}` |
| KD night | 21:30 daily | `{"ref":"main","inputs":{"mode":"night"}}` |
| KD weekly | 09:00 Mon | `{"ref":"main","inputs":{"mode":"weekly"}}` |
| KD watchdog | 10:00, 23:00 | `{"ref":"main","inputs":{"mode":"watchdog"}}` |
| KD content | 18:00 daily | same URL with `content.yml`, body `{"ref":"main"}` |

The GitHub schedule stays as a fallback, and the idempotent jobs ignore the second trigger.

## Owner clicks still needed
1. **Facebook Page + Instagram**: see `docs/social-setup.md`, then GitHub secrets `META_PAGE_TOKEN`, `FB_PAGE_ID`, `IG_USER_ID`.
2. **Telegram channel for shopkeepers** (optional, free): create a public channel "KD Foods Offers", add the KD bot as admin, then add GitHub secret `KD_CHANNEL_ID` (e.g. `@kdfoodsoffers`). Posters go there too, from day one.
3. **cron-job.org account**: the table above.
4. **Vercel**: Production Branch = `main`.

## Where the code is
`scripts/ops/ops.mjs` (all ops modes), `scripts/ops/content.mjs` (posters), `scripts/ops/format.mjs` (tested helpers), `api/_ops.js` (quick commands + ❌ button), `supabase/migrations/20261108000700_ops_autopilot.sql`, `…0800_ops_more.sql`, `…0900_bot_social_skip.sql`.
