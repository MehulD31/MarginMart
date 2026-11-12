# MarginMart ads: Click-to-WhatsApp test (owner approved 12 Nov 2026)

Based on Vajra (WhatsApp ads ₹3–5/chat vs ₹16/lead form; best ads = organic winners promoted).

## Setup
- Ad account: MarginMart Ads `act_993539680466090` (INR, Asia/Calcutta). Page: MarginMart `1428432177022562`. IG `17841449663127112`.
- Campaign: `MarginMart | CTWA | Bhilai | Test-1` `120247068930560540`, OUTCOME_ENGAGEMENT, ad-set budgets, PAUSED.
- Ad set A, new shops: 12 km around Bhilai (21.2092, 81.3780; Meta's city radius minimum is 17 km, so a pin is used),
  ages 22–55, people living or recently there, Advantage+ audience off, exclude the known-shops list. ₹100/day.
  Audience ≈ 9.3–11 lakh people.
- Ad set B, known shops: Custom Audience from the 717 shop phone numbers (hashed by Meta). ₹50/day.
  Message: join the WhatsApp group + repeat orders.
- Optimisation: Conversations, destination WhatsApp 96300 12636, lowest cost. Placements Advantage+ (Reels/Stories 9:16).
- 14 days ≈ ₹2,100 + 18% GST.

## Ads
1. Nayi Gaadi Reel (live post) → "Bhilai ki har dukaan tak daily delivery". Prefilled: "Hi, mujhe aaj ka rate aur delivery chahiye. Dukaan: ___, Area: ___"
2–3. The next two Reels that beat the median reach organically.
Rules: no prices, MarginMart brand (Pepsi only as a product name), Bhilai only in text, no snacks.

## Automation (scripts/ops/ads.mjs, with the 08:00 morning job)
- Pause an ad after ₹60 spent with 0 chats, or > 1.8× the best ad's cost per chat. Keep ≥ 2 running; resume the best
  paused ad (not ones we paused in the last 7 days). Never changes budgets, bids, targeting or money.
- Telegram: 7-day spend, chats, ₹/chat per ad, what was paused/resumed, payment/account problems.

## Blocked on the owner (Meta clicks)
1. Payment method on MarginMart Ads (none yet).
2. WhatsApp Business 96300 12636 linked to the MarginMart Page (Meta: "Page is not linked to a WhatsApp account").
3. System user "MarginMart" → assign MarginMart Ads (Manage) → token with ads_management, ads_read → GitHub secret META_ADS_TOKEN.
4. Accept Custom Audience terms for the account (needed for the 717-shop list).

## Live (12 Nov 2026): Messenger DM only (no WhatsApp Business number yet)
- Campaign 120247068930560540 renamed 'MarginMart | Messenger DM | Bhilai | Test-1', ACTIVE.
- Ad set 120247070453180540: Messenger destination, Conversations, Rs150/day, 12 km Bhilai pin, 22-55, ends 26 Nov 23:59 IST (max ~Rs2,100). Shown on Facebook + Instagram placements; taps open Messenger.
- Ad 120247070458640540 'Nayi Gaadi Reel · Messenger' (creative 1657561349432068, CTA Send message). Preview https://fb.me/2brM2TUtJR22JlP
- Meta's minimum campaign spend cap is Rs5,000, so the end date is the safety limit instead.
- Multi-destination (Messenger + Instagram DM) needs a DOF creative that the API kept turning into a plain link ad; switch to it in Ads Manager later if Instagram DM is wanted.
- When a WhatsApp Business number exists: new CTWA ad set in the same campaign, same targeting.
