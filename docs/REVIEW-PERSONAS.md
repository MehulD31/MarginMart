# Persona review gate

Every milestone must pass this review before the next one starts. Each persona is a real person in Shobhit's business. The automated suite is `tests/review/personas.spec.ts`, run with `npm run review`, on a phone (390×844) and a laptop (1366×820).

Test accounts (PIN 482915, reserved numbers 90000001xx, test data only):

| Persona | Phone | Notes |
|---|---|---|
| Admin (Mehul/Shobhit) | 9000000101 | |
| Manager | 9000000102 | |
| Driver | 9000000103 | |
| Shop owner (set up) | 9000000104 | QA Shop One |
| Shop owner (first login) | 9000000105 | QA Shop Two, must change PIN |
| Helper | — | No login by design (PRD §3) |

## What each persona checks

### Every persona, every screen
- Logs in with phone + PIN and lands on their own home, never someone else's.
- No browser errors. Nothing scrolls sideways on a phone.
- Every input has a visible label. Every button has a name.
- Hindi toggle switches the text and the page language.
- Typing a URL for another role's area sends them back to their own.

### Admin
- Can reach Shops, Catalogue, Price lists, Routes & vehicles, Users, Join requests from the sidebar (laptop) and bottom bar + More (phone).
- Adding a shop with a phone shows the one-time PIN with a WhatsApp button.
- Bad input is blocked before saving (wrong phone, no route).
- Sees a clear warning while no price list is live, and a "Make live" action on the draft.
- Can open a pack and see its flavours.

### Manager
- Lands in admin. Can manage shops.
- Catalogue is read-only, with a notice that explains why.
- Price list has no "Make live", no edit boxes.
- Cannot create staff users, only shops (from Shops). Server refuses if they try.

### Shop owner
- First login forces a new PIN; a weak PIN (123456) is refused.
- Lands on the shop home and can log out.
- The database refuses: reading another shop, reading draft prices, editing their own credit limit.

### Driver
- Lands on the driver home and can log out.
- Cannot read shops or users through the API.

### Helper
- No login. Their work is the printed loading sheet (M4) and riding with the driver. Review: confirm no helper role exists that could be misused; re-check the printable loading sheet in M4.

## Result log
Results are written to `docs/reviews/` per milestone.
