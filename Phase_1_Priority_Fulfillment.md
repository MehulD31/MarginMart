# Phase 1: The "Match & Notify" Engine

## Goal
Build a system where you store a shopkeeper's "Top 20" items and get an instant alert when those items appear in Telegram deal groups.

---

## 1. The "Zero-Cost" Architecture
- **Storage:** **Supabase** (Free Tier). It's a cloud database that gives you 500MB for free—more than enough for thousands of shopkeepers.
- **Backend:** **Node.js** hosted on **Render.com** (Free Tier). This will run our "Telegram Listener."
- **Matching Engine:** A lightweight script that uses **Regex** or **Fuzzy Matching** to compare Telegram posts with your database.
- **Notification:** A **Private Telegram Bot** that sends a message only to you when a match is found.

---

## 2. Development Phases

### Phase 1.1: The Data Foundation (The Vault) ✅
- [x] **New Table: `matches`**
  - Columns: `id`, `shopkeeper_id`, `product_name`, `matched_keyword`, `original_text`, `telegram_link`, `created_at`.
- [x] **Indices & RLS**
  - Added indices for `created_at` and `shopkeeper_id`.
  - Enabled RLS for admin-only access.
- [x] **Persistent Log UI**
  - Added "Match Log" tab in Admin Dashboard to view historical detections.

### Phase 1.2: Admin Management Enhancements ✅
- [x] **Refined Watchlist UI**
  - Integrated keyword-based matching simulation.
- [x] **Policy Enforcement**
  - **Limit:** Enforced maximum 20 products per shopkeeper to maintain performance.
- [x] **Billing Engine Stability**
  - Verified end-to-end fulfillment and billing workflow via Playwright.

### Phase 1.3: The Telegram Listener (The Spy) [DONE]
- [x] Use the **Telegram Bot API** to "listen" to messages via Supabase Edge Functions.
- [x] Webhook implemented at: `https://oaqdmffxgqjnpfdqejtf.supabase.co/functions/v1/telegram-bot`
- [x] **Jugaad:** Configured `telegram_configs` for Bot Token and Admin Alerting.

### Phase 1.4: The Matching Logic [DONE]
- [x] Automated matching engine inside Edge Function.
- [x] Real-time alerts sent to Admin Telegram Bot.
- [x] Integration with `watchlists` and `matches` tables.
    - **Original Link:** [Telegram Link]

---

## 3. The "Jugaad" List (Staying Free)
- **Database:** Supabase (Free).
- **Hosting:** Render/Railway (Free).
- **Alerts:** Telegram Bot API (Free).
- **Maintenance:** We will use a "Cron Job" (like **Cron-job.org**) to ping our Render server every 10 minutes so it never "goes to sleep" (a common free-tier limitation).

---

## 4. Next Action Items
1. **Supabase Setup:** I can help you generate the SQL to set up your tables.
2. **Shopkeeper UI:** We update `App.tsx` to include a form to add shopkeepers and their lists.
