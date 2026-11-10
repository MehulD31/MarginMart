# KD Foods social page setup (one time, owner clicks, about 15 min)

Meta has no API to create a Page or an Instagram account, so these clicks are the owner's. After this everything posts by itself: an approved scheme poster goes into `public.social_post` and `ops.yml` (mode `social`, 19:30 IST) posts it to Facebook and Instagram.

The Meta account currently has 4 Pages (Vajra Formwork, Fibbi, Getmeflat, Planstalk), none for KD Foods.

## 1. Facebook Page (facebook.com/pages/create, logged in as Mehul)
- **Name:** `K.D. Foods Bhilai` (keep "Pepsi" out of the page name; put it in the bio) (change the city if needed)
- **Category:** Wholesale & Supply Store, plus Beverage Company
- **Bio (≤255):** `Pepsi cold drinks dealer for Durg–Bhilai. Pepsi, 7UP, Mirinda, Dew, Sting, Slice, Aquafina at trade rates. Daily truck delivery to your shop. Order on the MarginMart app or WhatsApp.`
- **Phone / WhatsApp:** the KD order number. **Address:** the godown. **Hours:** godown hours.
- **Button:** "Send WhatsApp message" (connect the KD WhatsApp Business number).
- **Website:** https://kdfoods.vercel.app/join (the join request page).
- **Profile photo:** KD Foods logo. **Cover:** the godown or a truck with Pepsi crates.

## 2. Instagram
- In the Instagram app: create `@kdfoods.durg` (or similar), then Settings → Account type → **Business**, category Wholesaler.
- Same bio, plus "Order: MarginMart app" and the link https://kdfoods.vercel.app/join.
- Link it to the Page: Facebook Page → Settings → Linked accounts → Instagram.

## 3. Let the autopilot post (the part I can finish once 1 and 2 exist)
1. In Meta Business Suite → Settings → Business assets, add the new Page and Instagram account to the business.
2. Give the existing system user (or app "Vajra" 971433526020162) the Page with Content + Insights permissions and make a **never-expiring Page token**. Tell me in chat when this is done and I'll make the token and set the secrets myself.
3. GitHub secrets (repo MehulD31/MarginMart): `META_PAGE_TOKEN`, `FB_PAGE_ID`, `IG_USER_ID`.

Until then `ops.yml` keeps approved posters queued and tells the KD group once a day that the page isn't connected yet.

## 4. Later (after posting runs)
- WhatsApp Business: catalogue of packs + Status every morning with the day's scheme poster.
- Google Business Profile: "Pepsi cold drinks dealer Durg", for wedding and bulk buyers searching "cold drink wholesale near me".
- Ads: Click-to-WhatsApp from the best organic post, ₹150–300/day, 15–20 km around the routes. This only starts after the owner OKs the budget (money rule).
