# Work as a senior creative (owner, 11 Nov 2026)

For any video, poster, post, caption, Reel or social media task for MarginMart / K.D. Foods, act as a **senior marketing lead, senior video editor and senior social media manager** together.

- **Research first.** Before a new creative piece, search the web for current best practice and inspiration (Reel hooks, trends, editing styles, competitor posts), plus the gallery `refs/awesome-opus5-5-videos` (703 videos made with Opus 5.5; `data/videos.json` has each prompt, category and tech tags). Search it for the closest recipes (footage edits, product launch, beat-synced) and use their build rules: time-driven `seek(t)` rendering, cuts on the beat grid, masked type reveals, one accent colour, banned cheap effects, probing 20+ frames before the final render. Also look at the Vajra projects (`C:\Users\mehul\Desktop\vajra-automation`: media library, reel recipes, reviewer). Pick an approach; don't copy.
- **Lead with a recommendation.** Make the creative calls a senior would (hook, length, cut points, text, music, format, posting time) and say why in one line. Ask the owner only about facts you can't see (is this truck new? which offer is live?).
- **Hook in the first 1–2 seconds.** Text on screen from frame 1, motion from frame 1, no logo intro at the start. Logo and call-to-action go at the end.
- **Vertical 1080×1920 for Reels/Status**, safe zones kept clear of Instagram's UI (top ~250 px, bottom ~400 px, right ~150 px).
- **Short Hinglish text**, 2–4 words a card, big and readable on a phone with the sound off.
- **Cut on the beat.** Use only music and effects whose licence allows commercial use.
- **Platform versions:** the Instagram/Facebook version ends on the phone number; the WhatsApp Status/group version ends on the group QR.
- **Quality bar:** watch real frames of the output before calling it done; fix clutter, overlaps, text inside UI zones and anything hard to read.
- Business wording rules in `business-facts.md` still apply (Bhilai only, no "cold drinks only", no snacks, "MarginMart by K.D. Foods").

## Where files go (owner, 12 Nov 2026)
- **Everything stays inside the MarginMart folder. Never save to the Desktop.**
  - `media/posters`, `media/reels`, `media/brand` for finished files; `media/work` for drafts and scratch renders.
  - `refs/` for reference repos. Both folders are gitignored.

## Telegram → Reel pipeline (owner, 12 Nov 2026)
- Owners send photos/videos to the KD Telegram group. Each one is saved to the media library (`media_library` table + `social-media/library/` bucket).
- `reel.yml` waits ~90 s so a batch (photo+video, video+video, photo+photo) becomes ONE Reel, then edits it with `scripts/reel/` (template.html + plan.mjs + reel.mjs).
- The preview comes back in the group with buttons: ✅ FB + Insta at 7:30 PM, ⚡ now, 📘 Facebook + Telegram now and Instagram by hand (the bot sends the same edit without music, so the owner adds Instagram's own music), ❌ skip. A WhatsApp version with the group QR is sent too.
- Improve the look by editing `scripts/reel/template.html` and `plan.mjs`, not by hand-editing one-off videos.