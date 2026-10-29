# MarginMart

B2B ordering and distribution platform for a beverage dealer (PepsiCo first). Shops order from their phones, the manager plans truck loads, drivers deliver and collect, and admins see dues, stock and profit.

Docs: [PRD](docs/PRD.md), [HLD](docs/HLD.md), [Release 1 tasks](docs/TASKS-R1.md).

## Stack
React 19, Vite, TypeScript, React Router, TanStack Query, i18next (Hindi/English). Supabase handles Postgres, auth and storage. Hosted on Vercel. Everything runs on free tiers.

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

## Database
Schema changes go only through SQL migrations in `supabase/migrations/`, never through the dashboard. The old deal-sourcing app is archived at git tag `v0-deal-sourcing`.

## Backups
`.github/workflows/backup.yml` runs every night at 03:00 IST (and on demand from the Actions tab). It dumps the `public` and `auth` schemas, encrypts the dump with AES-256, and keeps it as a workflow artifact for 30 days.

One-time setup in GitHub → Settings → Secrets and variables → Actions:
| Secret | What |
|---|---|
| `SUPABASE_DB_URL` | Supabase → Connect → **Session pooler** connection string, with the database password filled in |
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

Before the pilot, run `supabase/qa/teardown.sql` to remove test data and restart bill numbers.
