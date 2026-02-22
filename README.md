# NBA All-Time Random Draft Lineup

A production-style MVP built with Next.js App Router + TypeScript + Tailwind + Prisma (SQLite).

## What This App Does

- Plays one round of 5 draws.
- Draws NBA franchises uniformly at random without replacement.
- On each draw, user picks exactly one player from that franchise's all-time top 15 list.
- Each player shows their years with that franchise in the draft UI.
- Players are restricted to realistic position eligibility.
- Each draw has a 24-second shot clock. If it expires, a random open slot is auto-filled with a 0-point penalty.
- User assigns one player to one open lineup slot: `PG`, `SG`, `SF`, `PF`, `C`.
- Filled slots lock for the rest of the round.
- Base Team Score is built from four player categories:
  - personal accolades
  - team accolades
  - box stats value
  - advanced impact value
- Chemistry is computed from role coverage, complementarity, usage balance, two-way balance, and culture.
- Final Team Score = `Base Team Score x Chemistry Multiplier`, where multiplier is bounded to `1.0 - 2.0`.
- Completed runs are stored with share codes and can be compared on a group leaderboard.

## Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Prisma + SQLite
- Vitest (unit tests)
- Playwright (smoke e2e)

## Local Development

### Prerequisites

- Node.js 20+
- npm 10+

### Setup

1. Install dependencies:

```bash
npm install
```

2. Ensure env file exists (`.env` is included):

```env
DATABASE_URL="file:./dev.db"
```

3. Start dev server:

```bash
npm run dev
```

`predev` creates `prisma/dev.db` (if missing) and runs `prisma migrate deploy`, so the local SQLite DB is initialized automatically.

## Testing

Unit tests:

```bash
npm run test:unit
```

Playwright smoke test:

```bash
npx playwright install
npm run test:e2e
```

## Data Model (All-Time)

Core seed file:

- `src/lib/all-time-seed.ts`

It contains top 15 players per franchise, with:

- player name
- franchise year range (displayed in draft)
- position eligibility
- optional career length and title count inputs for weighting

Derived franchise greatness metrics are computed in:

- `src/lib/data.ts`

## Refresh All-Time Seed Data (Live)

This project includes a live sync script that rebuilds `src/lib/all-time-seed.ts` from NBA stats endpoints.

Run:

```bash
npm run data:sync:all-time
```

Optional tuning (larger candidate pool = slower, but can improve edge cases):

```bash
ALL_TIME_CANDIDATE_LIMIT=45 npm run data:sync:all-time
```

What the script does:

- pulls franchise career totals per team
- enriches candidates with player position, career seasons, and awards
- builds 4 contribution categories per player:
  - player accolades (MVP, All-NBA tiers, etc.)
  - team accolades (titles, franchise win percentage, etc.)
  - stats (points, rebounds, assists, steals, blocks, turnovers)
  - advanced impact proxy
- computes a franchise score using:
  - personal accolades
  - team accolades
  - franchise box production
  - advanced impact proxy
- applies tenure penalty so short late-career stints rank lower
- writes top 15 per franchise with `years`, `positions`, `careerYears`, and `championships`

If a player/team lookup fails, it automatically falls back to the existing local seed entry so the file is still complete.

## Scoring Configuration

Scoring logic lives in:

- `src/lib/scoring.ts`

Default weights:

- personal accolades: `0.30`
- team accolades: `0.25`
- box stats: `0.25`
- advanced impact: `0.20`

To rebalance gameplay, update `METRIC_WEIGHTS`.

Chemistry multiplier:

- bounded to `1.0 - 2.0`
- computed in `computeChemistry` inside `src/lib/scoring.ts`

## Deterministic Randomness

- Optional `seed` at game start.
- Same seed => same 5-team draw sequence.
- Seed is saved in run results.

## Routes

- `/` Home (start game, name, group code, seed, rules)
- `/draft` Draft board
- `/results/[shareCode]` Read-only run results
- `/leaderboard` Friend leaderboard filtered by group code
  - supports `All-time` and `Daily` views

## Prisma

Schema:

- `prisma/schema.prisma`

Migrations:

- `prisma/migrations/20260220000000_init/migration.sql`
- `prisma/migrations/20260220100000_shot_clock_penalties/migration.sql`
- `prisma/migrations/20260221131000_add_user_name/migration.sql`
- `prisma/migrations/20260222133000_add_chemistry_fields/migration.sql`

## Deploy (Render)

1. Push `/Users/andrew.oh/nba-all-time-draft-lineup` to GitHub.
2. In Render: `New +` -> `Blueprint`.
3. Select repo; Render reads `render.yaml`.
4. Deploy.

Notes:

- Current `render.yaml` uses a persistent Render disk at `/var/data/dev.db`.
- If you deploy with `/tmp/dev.db`, leaderboard history will reset whenever the instance restarts.
