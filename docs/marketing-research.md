# Social media research for KD Foods (Nov 2026)

Goal: sell more crates. Sources: public Instagram data (via Apify), the public Meta Ad Library website (India, active ads), web search and GitHub. Numbers were collected on 8 Nov 2026.

## 1. What Pepsi and cold-drink agencies post on Instagram

### Reels that worked
| Account | Views | What it was |
|---|---|---|
| `priyranjan7390` (Anmol Online Centre & Drink Zone agency, Bihar) | 97,030 | **Shopkeeper offer in Hindi**: buy 4 boxes of Pepsi/7UP/Mirinda/Dew and get 36 Aquafina 1 L free. "दुकानदार भाइयों…", phone number in caption |
| `umair_shaikh__62` ("5 brother's Pepsi agency") | 66,575 | "Cold drink ka maal load ho chuka hai! Godown se aapki shop tak", WhatsApp number |
| `fmcg_distributors` (Srinagar) | 259,372 | "Book your **wedding orders** with us", phone, "send list, address, dates" |
| `khanawithmarjina` (Jaipur food creator) | 83,822, 3,171 shares | A food creator visited a wholesale cold-drink shop: "mix carton available", location |
| `sri_sai_tradingcompany` (Bikaner) | 20,486 | Truck unloading, labour, godown |
| `shahgroupofcompanie` (Hyderabad) | 12,643 | "All brands at wholesale rates, bulk orders, fast delivery" |
| `chit_chat_enterprise` (Dewas) | 7,693 | "Dewas ka trusted soft drink wholesale supplier", city name used many times in the caption |

### Reels that didn't
| Account | Views | What it was |
|---|---|---|
| `pepsi_parle_agro_distributor` | 45–1,800 | #महादेव, trending audio, no offer |
| `noorfoods.up` | 50–450 | Festival wishes (Navratri, Ganesh, Patel Jayanti) |
| `colddrinkwholsale`, `sayani_traders_wholesale` | 77–1,200 | Clips with no caption |
| `varunbeverageslimited` (12.6k followers) | 3–8k | Corporate posts (awards, festivals) |
| `udaan.official`, `jumbotail` | 11–40 likes | Team and farewell photos. Big B2B apps don't use Instagram to sell |

### Kirana-owner content (#kiranastore)
Shopkeepers watch reels made by other shopkeepers:
- `marwadi_kirana_dukandar`: "rice rates are going up", 244k views and 1,503 shares. Price and rate news gets shared.
- `kirana_club_24k`: "Panchmeva for ₹20", 851k views.
- `kiranashop.04`: shop-life attitude reel, 178k views and 3,045 shares.
- `shree.raamtraders`: a wholesale shop tour, 190k views.

### Patterns
1. The winners all have **a concrete offer, Hindi aimed at "dukandar bhai", and a phone number**: scheme or combo offers, "stock arrived", wedding bulk orders.
2. A local **food creator visiting your godown** (83k views, 3k shares) beat almost all distributor-made reels.
3. **City name in the caption and hashtags** (Dewas, Bikaner, Hyderabad) gets local reach.
4. Festival wishes, #महादेव trends and clips without captions get about 50–1,000 views. Don't make them.
5. Followers stay small even for winners: about 100–1,300. Count calls and WhatsApp messages, not followers.

## 2. Meta Ad Library (India, active ads)
- **"pepsi distributor"**: 4 results. One is a real distributor, *Dutta Enterprise, Kandi*: "your trusted distributor of Pepsi… stock up your favourites", phone number. **Almost no Pepsi distributor runs ads, so the space is empty.**
- **"campa"**: about 280 active ads. Reliance runs national festival ads plus creator tie-ups (influencers "with Campa Cola"), and cafés bundle Campa into ₹100 combos. Campa outspends everyone in consumer ads.
- **"kirana wholesale app"**: about 52 ads. Flipkart Best Price ("apne dukaan ke sabse zyada bikne waale samaan par top discounts"), CityMall, RatePe (Nagpur, aimed at kirana, hotels and restaurants), Shri Ganesh Trading ("Join 1000+ Nagpur businesses", WhatsApp button). **B2B apps target shopkeepers with "best wholesale rate + install app / WhatsApp" ads.** These are what your shops see.
- **"cold drink wholesale"**: about 65 results, mostly unrelated. Relevant ones: Fairdeal.Market ("best wholesale app in Gurgaon", Click-to-WhatsApp) and Zingysip (bulk tea for hotels, Click-to-WhatsApp).
- **The common format is Click-to-WhatsApp**: a short video with a "Send WhatsApp message" button.

The official Ad Library API returns no data for Indian commercial ads, so this section comes from the public website.

## 3. Facebook pages
Facebook page search needs a login, so I couldn't browse pages directly. The Ad Library above covers Facebook and Instagram ads.

## 4. Market context
- **Campa Cola (Reliance)** gives trade partners 6–8% margin, about twice the industry level, and lower trade prices so kiranas display it prominently ([ET](https://m.economictimes.com/industry/cons-products/fmcg/after-cola-push-reliance-in-disruptive-mode-again/articleshow/115707704.cms), [ETRetail](https://retail.economictimes.indiatimes.com/news/food-entertainment/personal-care-pet-supplies-liquor/reliances-not-so-secret-weapon-makes-tata-sound-alarm-as-new-disruption-hits/114410237)). Coke and Pepsi responded with ₹10 packs ([source](https://theopportunitycost.beehiiv.com/p/cola-wars-2-0-the-10-disruption)). Your posts compete for the shopkeeper's attention against Campa's margin.
- **Kiranas still hold about 91% of grocery** (Redseer, Jan 2026, via [Dezerv](https://www.dezerv.in/blog/the-91-market-share-shocker-why-indias-600-billion-grocery-economy-still-belongs-to-kiranas/)). Distributors run on 3–5% margins ([Kotak](https://kotakinsights.substack.com/p/fmcg-distributor-disruption-quick-commerce)).
- **Instagram ranking (2026):** watch time and completion first, then DM shares ("sends"), then likes ([SocialPilot](https://www.socialpilot.co/blog/instagram-reels-algorithm), [Hootsuite](https://blog.hootsuite.com/instagram-reels/)). The hook in the first 1–2 seconds decides reach.
- **WhatsApp** has over 535M Indian users. Broadcasts convert about 5–15%, according to vendor figures that are likely optimistic ([iMark](https://www.imarkinfotech.com/whatsapp-business-marketing-in-india-the-channel-driving-11x-roas-most-brands-still-underuse/)).
- Meta ads can target a 1–70 km radius around a pin ([Coinis](https://coinis.com/how-to/radius-targeting-facebook-ads)).

## 5. GitHub
These are similar order and distributor apps, useful for features, not for marketing:
- [orderdesk-](https://github.com/shivamguptadrps/orderdesk-): shops add a distributor by code and order from it. This is close to MarginMart.
- [RouteFlow (Flutter)](https://github.com/thisisrakeshhhh/flutter): offline-first distributor app for kirana/FMCG.
- [kirana-agent](https://github.com/11DDBOY11/kirana-agent), [Parchi](https://dev.to/yash_adake/parchi-whatsapp-orders-to-bills-for-kirana-stores-with-gemma-4-on-the-shops-own-laptop-2l4g): WhatsApp-first ordering and billing.
- [wholesale-distribution on Google Sheets](https://github.com/rameezscripts/wholesale-distribution-management-system-google-sheets-apps-script).
No repo had a marketing playbook. The common idea is "order on WhatsApp", which supports making WhatsApp your order channel.

## 6. Recommendations
1. **Main reel format:** a weekly Pepsi scheme or combo in Hindi for "dukandar bhai", 15–20 seconds, with the phone number on screen. This copies the 97k-view combo reel, and your bot already makes the scheme posters.
2. **Second format:** "Maal aa gaya" truck-loading and godown clips (66k and 20k views).
3. **Third format:** wedding and function bulk orders (259k views). It's a separate buyer group that buys 20–100 crates.
4. **Once a month:** invite a local food or city creator to the godown (83k views and 3k shares for one creator visit).
5. **Ads:** ₹150–300 a day Click-to-WhatsApp ads on the best reel, 15–20 km around your routes. Almost no Pepsi distributor advertises, while Flipkart Wholesale, CityMall and Campa compete for the same shopkeepers.
6. **Captions:** city and area names, "Pepsi distributor [city]", "cold drink wholesale [city]". No festival wishes or generic trends.
7. **Before paid ads, check with the Pepsi or VBL area team** about logo use and any co-marketing money. A Campa-style margin story will draw a response from them.
