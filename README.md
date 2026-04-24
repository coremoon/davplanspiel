# Insurance Planning Game (*Versicherungsplanspiel*)

A multiplayer insurance management simulation game.

Teams compete as insurance companies over multiple rounds, setting premiums and dividends  
while managing solvency ratios. The game master controls the simulation from a central dashboard.

**Live demo:** https://coremoon.github.io/davplanspiel

---

## Architecture

```
Browser  (Vite + TypeScript – static bundle, no server)
    │
    │  HTTPS / WebSocket
    ▼
Supabase  (PostgreSQL + Realtime + Auth)
    – Game state, group inputs, results
    – Live updates via Supabase Realtime
    – Row Level Security enforces access control
    – Supabase Auth manages game master accounts

GitHub Pages
    – Serves the static bundle (dist/)
    – Automatic deployment via GitHub Actions on push to main
```

---

## Prerequisites

- **Node.js** 20+ and **npm** 10+
- A free **Supabase** account → https://supabase.com
- A **Supabase Personal Access Token** (PAT) for `make db-init`  
  → https://supabase.com/dashboard/account/tokens

---

## Local Setup

### 1. Clone and install

```bash
git clone https://github.com/coremoon/davplanspiel.git
cd davplanspiel
make install
```

### 2. Create a Supabase project

1. Go to https://supabase.com/dashboard → **New project**
2. Choose a name and a region close to your users
3. Wait ~1 minute for the project to initialise

### 3. Collect your Supabase credentials

In the Supabase Dashboard → **Project Settings → API**:

| Credential | Where to find it | Used for |
|---|---|---|
| Project URL | API settings page | All DB and Auth calls |
| `anon` / public key | API settings page | Browser bundle (safe to expose) |
| Personal Access Token | Account → Tokens | `make db-init` only – never in browser |

### 4. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
# ── Required for the app ───────────────────────────────────────────────────
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...

# ── Required for make db-init only (never goes into the browser bundle) ────
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_PAT=sbp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ── hCaptcha (optional – set false to skip during development) ────────────
VITE_CAPTCHA_ENABLED=false
VITE_HCAPTCHA_SITEKEY=your-hcaptcha-site-key

# ── GitHub Pages base URL (set for production deploy) ─────────────────────
# VITE_BASE_URL=/davplanspiel/
```

> `.env` is listed in `.gitignore` and will never be committed.  
> `VITE_*` variables are embedded into the JS bundle and are visible in DevTools –  
> this is intentional and safe for the anon key. The PAT must never appear in `VITE_*`.

### 5. Initialise the database

```bash
make db-init
```

This drops and recreates all tables, RLS policies, triggers, and audit logging.  
Type `YES` to confirm. Requires `SUPABASE_URL` and `SUPABASE_PAT` in `.env`.

Alternatively, run `scripts/supabase_schema.sql` manually in the  
[Supabase SQL Editor](https://supabase.com/dashboard/project/_/sql/new).

### 6. Configure allowed origins in Supabase

In the Supabase Dashboard → **Authentication → URL Configuration**:

- **Site URL:** `http://localhost:5173`
- **Redirect URLs:** add `http://localhost:5173` and your production URL

### 7. Start the dev server

```bash
make dev
# → http://localhost:5173
```

Register as a game master, create a game, and share the 4-word game ID with participants.

---

## Deployment to GitHub Pages

### One-time setup

**1. Push to GitHub:**

```bash
git remote add origin https://github.com/YOUR-USERNAME/REPO-NAME.git
git push -u origin main
```

**2. Enable GitHub Pages:**

Repository → Settings → Pages → Source: **GitHub Actions**

**3. Add GitHub Secrets:**

Repository → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Value |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `VITE_HCAPTCHA_SITEKEY` | Your hCaptcha site key (if using CAPTCHA) |

**4. Add GitHub Variables:**

Repository → Settings → Secrets and variables → Actions → Variables:

| Variable | Value |
|---|---|
| `VITE_BASE_URL` | `/REPO-NAME/` (with leading and trailing slash) |
| `VITE_CAPTCHA_ENABLED` | `true` |

After the first push, the workflow builds and deploys automatically.  
The deployment URL is shown in the GitHub Actions run summary.

**5. Update Supabase allowed origins:**

Add your GitHub Pages URL to Supabase → Authentication → URL Configuration.

---

## Game ID system

Game IDs are human-readable 4-word phrases, one word per letter of the alphabet:

```
apfel-hund-katze-stern   (DE)
apple-horse-kite-star    (EN)
AHKS                     (compact form)
a h k s                  (letter form)
```

All forms resolve to the same game. Word order is irrelevant.  
Typos are corrected automatically using Levenshtein distance matching.

The internal representation is a language-independent index key (`00-07-10-18`),  
so German and English speakers can join the same game using their own language's words.

---

## User roles

| Role | Auth | Access |
|---|---|---|
| **Game Master** | Supabase Auth (email + password) | Creates and controls games, runs the algorithm |
| **Group** | Anonymous (game ID is the shared secret) | Submits premium and dividend decisions each round |
| **Spectator** | Anonymous (game ID required) | Read-only view of group analysis |

---

## Security

- **Game master passwords** are managed by Supabase Auth (bcrypt internally)
- **Group access** is controlled by the game ID – no per-group password
- **Row Level Security** on all tables – the anon key cannot bypass ownership checks
- **Group capacity** is enforced by a Postgres trigger (atomic, race-condition safe)
- **Audit log** records all game lifecycle events (creation, rounds, group joins) via DB triggers

---

## Available commands

```bash
make install        # Install npm dependencies
make dev            # Start dev server (localhost:5173)
make build          # Production build
make test           # Run all tests (Vitest, 114 tests)
make check          # TypeScript type check
make simulate       # Headless simulation (no browser)
make sim-quick      # 4 groups, 3 rounds
make sim-full       # 6 groups, 6 rounds, random mode
make db-init        # ⚠️  Drop + recreate all DB tables
make db-reset       # ⚠️  Delete all game data (keep schema)
make deploy-check   # Run tests + build before git push
```

---

## Project structure

```
src/
├── main.ts                  Entry point, boot sequence
├── i18n/                    Translations (de, en; fr/es ready to add)
│   ├── index.ts             i18next wrapper: t(), setLang(), getLang()
│   ├── de.json
│   └── en.json
├── auth/
│   └── session.ts           Session token management
├── core/
│   ├── config.ts            Game parameters (StaticConfig)
│   ├── stats.ts             qlnorm, plnorm, qnorm (ported from R)
│   ├── algorithmus.ts       Game engine (port of alg.R)
│   ├── algorithmus.test.ts
│   ├── gameId.ts            4-word ID system, Levenshtein fuzzy matching
│   └── gameId.test.ts
├── store/
│   └── supabase.ts          All DB operations
└── ui/
    ├── router.ts
    ├── state.ts
    ├── langSwitcher.ts      🇩🇪 🇬🇧 flag switcher (fixed top-right)
    ├── styles.css
    ├── components/
    │   ├── charts.ts        ApexCharts wrappers
    │   └── widgets.ts       Reusable UI elements
    └── pages/
        ├── login.ts         Game master + group + spectator login
        ├── home.ts          Game master dashboard / group input form
        ├── analyse_gruppe.ts
        ├── analyse_markt.ts
        ├── overview.ts      Admin-only raw data view
        └── sieger.ts        Final rankings

scripts/
├── db_init.ts               Deploy schema via Supabase Management API
├── simulate.ts              Headless end-to-end simulation
├── supabase_schema.sql      Full DB schema (v2.3)
└── reset_supabase.sh        Delete all game data via REST API
```

---

## Algorithm

The game engine is a TypeScript port of the original R implementation (`alg.R`).  
It models collective insurance losses using a lognormal approximation,  
customer switching behaviour via price elasticity and market share,  
and solvency constraints on dividend payouts.

Key functions: `kern_algorithmus()`, `start_algorithmus()`, `computeRanking()`  
Statistics: `qlnorm()`, `plnorm()`, `qnorm()` (Acklam approximation, matches R output)

All 28 algorithm tests pass deterministically against known R reference values.

---

## Internationalisation

The UI supports **German** and **English** out of the box.  
**French** and **Spanish** are prepared in the game ID word lists and can be activated  
by adding `fr.json` / `es.json` translation files and uncommenting two lines in `src/i18n/index.ts`.

Language is detected from `localStorage` → `navigator.language` → German fallback.  
A flag switcher (🇩🇪 🇬🇧) is always visible in the top-right corner.

---

## License

© DGVFM – Deutsche Gesellschaft für Versicherungs- und Finanzmathematik  
See [LICENSE](LICENSE) for details.
