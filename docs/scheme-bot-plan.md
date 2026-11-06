# K.D. Foods scheme bot — plan

Status: draft for approval. Nothing built yet.

## Goal
When the Pepsi person sends a scheme message, Shobhit pastes it into a Telegram group. Within about a minute he gets:
1. A Hinglish explanation of what it means and what it means for K.D. Foods (with live numbers from the app).
2. A ready poster for retailers.
3. Buttons: ✅ Approve (saves the scheme in the app with an end date) or ✏️ Change.
Shobhit forwards the poster to the retailers' WhatsApp Community by hand.

## Decisions (agreed)
| Topic | Decision |
|---|---|
| Bot / group | New bot + new private group "KD Schemes", separate from VAJRA |
| Who can use it | Only Mehul and Shobhit (Telegram user ids whitelisted) |
| AI | New free Gemini key for K.D. Foods; Groq as backup |
| Poster | Fixed HTML template (no AI drawing), Hindi/Hinglish, shows "₹X off per case", never our selling price |
| Code location | MarginMart repo, pushed as MehulDeshlahra |
| App change | Yes: schemes with start/end date that change staff order prices |
| WhatsApp | Manual forward to a WhatsApp Community announcement group (free, no ban risk) |

## How it works (same pattern as VAJRA)
```
Shobhit (Telegram "KD Schemes")
   │ pastes Pepsi message
   ▼
Google Apps Script (free; polls every minute, instant via relay later)
   │ only whitelisted users / this chat
   ▼
GitHub Actions job "scheme.yml" (MarginMart repo, free minutes)
   ├─ Gemini (free key): message → JSON facts + Hinglish explanation
   ├─ Supabase (service key, read-only for this step): buy price, margin, stock, last 30 days sales
   ├─ Headless Chromium (Playwright): poster template → 1080×1350 JPG
   └─ Telegram: explanation + poster + buttons
   ▼
✅ Approve → second job writes the scheme into Supabase → order prices change until end date
```

## Step 1 — App: schemes with dates
- New table `scheme`: product (pack, optionally flavours), type (`buy_discount` = cheaper from Pepsi, `shop_discount` = passed to shops), ₹ per case, start date, end date, note, source message, created_by.
- Pricing: during the dates, `shop_discount` lowers the suggested staff order price by the amount; `buy_discount` lowers the assumed buy price on Pricing & margin. Outside the dates nothing changes.
- Admin page: list of active and past schemes, end early, edit.
- Shops never see schemes (as agreed earlier). Existing price-list schemes (Aquafina ₹5, BOGO) are not touched.
- Security: admin-only writes (same rule as the rest of the app).

## Step 2 — Telegram bot
- Create bot with @BotFather; create group "KD Schemes"; add bot; note chat id and both user ids.
- Apps Script copied from VAJRA's `telegram-webhook.gs`, cut down to: message → dispatch `scheme.yml`; button tap → dispatch `scheme-approve.yml`.
- Secrets (GitHub + Apps Script properties): `KD_BOT_TOKEN`, `KD_CHAT_ID`, `KD_ALLOWED_USERS`, `GEMINI_FREE_KEY`, `GROQ_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GH_TOKEN`.

## Step 3 — Explanation (Gemini)
Gemini returns JSON: product(s), flavours, ₹ per case, type, start/end dates, confidence, open questions.
The bot message (Hinglish), e.g.:
> **Matlab:** 400 ml PET pe 4 din ke liye ₹10/peti extra. Shop ka TS ₹70 se ₹80.
> **Hamare liye:** abhi buy ₹491.50–499, stock 357 peti, pichhle 30 din me ~X peti/din. 4 din me ~Y peti bik sakti hai → Z peti order karna theek.
> **Pepsi se poochho:** ye hamare bill pe hai ya shop ke liye? Kaun si dates?
Rules: never invent numbers; if dates or amount are unclear, say so and don't make a poster until answered.

## Step 4 — Poster
- `scripts/poster/scheme.html` template + `render.mjs` (Playwright, already a dev dependency).
- Fields: product, flavours, "₹X chhoot har peti pe", dates, phone 96300 12636, K.D. Foods placeholder logo.
- Hindi font embedded locally (Noto Sans Devanagari) so Hindi never breaks.
- Sample below (not final design).

## Step 5 — Approve / change
- ✅ Approve → `scheme-approve.yml` inserts the scheme (Step 1) and replies "Saved, active till 9 Nov".
- ✏️ Reply to the bot with a correction → new explanation + poster.
- ❌ Ignore → nothing saved.

## Testing
- Unit tests for the scheme price rule (in dates / out of dates / pack vs flavour).
- Run the bot on 3 real Pepsi messages (the ₹80 TS one included) and check facts, poster text and dates by hand.
- Check a non-whitelisted Telegram user gets no reply.

## Cost
₹0: Telegram, Apps Script, GitHub Actions minutes, Gemini free tier, Supabase free tier.

## Open points
- Retailer WhatsApp Community: you create it (I can give steps).
- Logo is still the "KD" placeholder; poster will switch when the real logo arrives.
