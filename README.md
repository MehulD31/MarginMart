# MarginMart

B2B ordering and distribution platform for a beverage dealer (PepsiCo first). Shops order from their phones, the manager plans truck loads, drivers deliver and collect, and admins see dues, stock and profit.

Docs: [PRD](docs/PRD.md), [HLD](docs/HLD.md), [Autopilot: what runs by itself](docs/autopilot.md), [Social page setup](docs/social-setup.md).

## What's in it
- **App** (`src/`): shop ordering, driver trips and delivery (works offline), and admin pages for orders, loading, inventory, purchases, price lists, pricing, schemes, counter sales, khata, closing, users, join requests and audit.
- **Database** (`supabase/migrations/`): all business rules live in RPCs with row-level security. Admin delete (`admin_delete`) refuses anything that would break stock or money records.
- **Edge functions** (`supabase/functions/`): `pin-login` (phone + PIN, locks after 5 failures in 15 min) and `admin-users`.
- **Telegram bot** (`api/scheme-tg.js`, `api/_sale.js` on Vercel): `/sale` records counter sales; a pasted Pepsi scheme message starts the `scheme-bot` GitHub workflow (`scripts/scheme-bot/`, `scripts/poster/`), which explains it and makes a poster for approval.
- **Google Sheet sync**: the sheet reads and edits counter sales through key-checked RPCs (`sheet_rows`, `sheet_apply`, `sheet_catalog`, `sheet_shops`).

## Stack
React 19, Vite, TypeScript, React Router, TanStack Query, i18next (Hindi/English). Supabase handles Postgres, auth and storage. Hosted on Vercel at https://kdfoods.vercel.app. Everything runs on free tiers.

## Setup
```powershell
npm install
Copy-Item .env.example .env.local   # then fill in the Supabase URL and anon key
npm run dev
```

| Variable | What |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Public anon key. Never use the service role key here |

## Commands
| Command | What |
|---|---|
| `npm run dev` | Dev server at http://localhost:5173 |
| `npm run build` | Type-check and production build |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest) |
| `npm run review` | Playwright persona review on phone and laptop (needs `supabase/qa/seed.sql` loaded) |

## Database
Schema changes go only through SQL migrations in `supabase/migrations/`, never through the dashboard. The old deal-sourcing app is archived at git tag `v0-deal-sourcing`.

## Backups
`.github/workflows/backup.yml` runs every night at 03:00 IST (and on demand from the Actions tab). It dumps the `public` and `auth` schemas, encrypts the dump with AES-256, and keeps it as a workflow artifact for 30 days.

One-time setup in GitHub → Settings → Secrets and variables → Actions:
| Secret | What |
|---|---|
| `SUPABASE_DB_PASSWORD` | The Supabase database password (just the password) |
| `BACKUP_PASSPHRASE` | A long random passphrase. Store it somewhere safe outside GitHub; without it the backups can't be opened |

Restore (test this once into a scratch project, not production):
```powershell
gpg --decrypt marginmart-<stamp>.dump.gpg > db.dump
pg_restore --no-owner --no-privileges --clean --if-exists -d "<target db url>" db.dump
```

## Deploy (Vercel)
1. Import the GitHub repo in Vercel. Framework preset: Vite. Build `npm run build`, output `dist`.
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under Project → Settings → Environment Variables.
3. `vercel.json` already rewrites all paths to `index.html`, so deep links like `/driver/close` work.
4. In Supabase → Authentication → URL Configuration, set the Site URL to the Vercel domain.
5. For the Telegram bot, add the bot variables listed in `.env.example` (Vercel only), then point the Telegram webhook at `https://<domain>/api/scheme-tg` with `TG_SECRET` as the secret token.

## Scheme bot (GitHub Actions)
`.github/workflows/scheme.yml` is started by the bot on the `main` branch, so bot script changes only take effect once they are on `main`. Repo secrets: `KD_BOT_TOKEN`, `KD_CHAT_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_FREE_KEY`, `GROQ_API_KEY`.

Before the pilot, run `supabase/qa/teardown.sql` to remove test data and restart bill numbers.

## Photo credits

- Creambell Kesar Badam 180 ml product photo: [Open Food Facts](https://world.openfoodfacts.org/product/8906023416656), licensed CC BY-SA 3.0.
