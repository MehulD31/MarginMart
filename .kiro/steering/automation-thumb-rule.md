# THUMB RULE: the business runs itself (owner, 8 Nov 2026)

KD Foods / MarginMart must run **fully automatically**, with the laptop off and without the owner asking an agent to do anything.

- **People only feed data:** orders, sales, purchases and photos/clips come in through **Telegram** or the **website/app**. Everything else is automatic: reports, reminders, stock alerts, dues follow-ups, scheme posters, social posts, backups and health checks.
- **Nothing important may depend on the laptop.** Allowed runners, all free tier:
  - GitHub Actions
  - Vercel functions
  - Supabase (pg_cron, edge functions)
  - Oracle Always Free
  - Google Apps Script
- Scheduled triggers come from **cron-job.org** (or pg_cron) calling `workflow_dispatch` or an endpoint. Don't rely on GitHub's own `schedule:` for anything time-critical. It runs hours late, and in Vajra it crossed midnight and posted twice.
- **Every scheduled job gets a watchdog:**
  - If the expected result is missing (for example no report sent or no backup made), re-run the job once and alert the Telegram group.
  - A failure must never be silent, even when the job itself exits "success".
- **Act, then report.** Inside the rules, the system and any agent act without asking, then send a short Hinglish Telegram message about what was done. Never end with "should I…?" for things inside the rules.
- **Ask the owner only for:**
  - Spending money or raising a budget.
  - Deleting money or stock records.
  - Changing prices.
  - Anything irreversible outside our own systems.
  - Clicks only the owner can do (Meta, Google, Pepsi or bank settings).
- **Safe by construction:**
  - Jobs are idempotent: a re-run can't post twice, bill twice or move stock twice.
  - State lives in the database or the repo, never on the laptop.
  - Secrets live in GitHub, Vercel or Supabase secrets, never in files or logs.
- **Zero cost by default:** free tiers and free AI keys first (Gemini free key, Groq, NVIDIA NIM). Paid use needs the owner's OK.
- **Telegram is the control panel:** approvals (✅/❌ buttons), `/ask` questions, alerts, and daily and weekly reports all go there.
- **Check real state before stating facts.** Never claim something ran without checking its output (a message delivered, a row written, a file live).
- **When building any new feature, also build** its trigger, its watchdog and its Telegram report. A feature that needs someone to open the laptop isn't finished.

Reference systems built this way: `C:\Users\mehul\Desktop\vajra-automation` (Instagram, ads and a Telegram brain on GitHub Actions + cron-job.org) and `C:\Users\mehul\Desktop\job` (Oracle server, systemd services, watchdog every 10 min, phone alerts).
