# Tørny

> Fire up a golf tournament in a couple of minutes.

Tørny is a mobile-first PWA for running golf tournaments. It scales from four friends on a Saturday round to a club event with 150 players. You create the game, invite the group, and everyone taps their strokes while they walk the course. The app handles the rest: scoring, the live leaderboard, side tournaments, and the mail that goes out when a game ends.

Live at [tornygolf.no](https://tornygolf.no) (also `tørny.no`).

## What you get

- More than twenty tournament formats, all on WHS net handicap. The full list is below.
- A leaderboard that updates live while your flight taps scores.
- Offline-first scoring. Tap in a dead spot on the course and it syncs once your phone has signal again.
- Side tournaments for longest drive and closest to the pin. Winners are picked when the game ends.
- An inbox for invitations, peer approvals, submitted scorecards, and finished games. Mail only goes out when you're not already in the app.
- Installable on your home screen. It opens like a native app, with no browser bar on top.
- GDPR self-service. Export or delete your data from your profile page without emailing anyone.

## Formats

Tørny ships more than twenty scoring modes. Each one comes with a short rules card in the app, so a player can pick something they've never tried and still know how to score it.

- Solo: stroke play, Stableford, modified Stableford
- Matchplay: singles, fourball, foursomes, greensome, gruesome, Chapman, patsome, round robin
- Team: best ball, Texas and Florida scramble, Ambrose, shamble
- Betting games: Wolf, Nassau, Skins, Bingo Bango Bongo, Nines, Acey Deucey

Browse them all at [/spillformer](https://tornygolf.no/spillformer).

## Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Styling | Tailwind v4, forest-and-champagne palette |
| Database and auth | Supabase (Postgres + Auth + Realtime, EU region) |
| Offline sync | Dexie (IndexedDB) with a last-write-wins RPC |
| Mail | Resend, through the verified `tornygolf.no` domain |
| Testing | Vitest + Testing Library + Playwright |
| Hosting | Vercel, auto-deploy on push to `main` |

Auth uses a one-time code by mail. Magic links went in the bin because iOS PWA handoff and mail scanners each broke the flow in their own way at the same time.

## Running it locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You need a `.env.local` with Supabase and Resend keys, which aren't in the repo. Ask Jørgen.

```bash
npm test          # vitest (2000+ unit + integration)
npm run e2e       # playwright
npm run lint
npm run build
```

## How it fits together

The scoring logic ([`lib/scoring/`](lib/scoring/)) is plain TypeScript with no Supabase dependency. It has its own tests and its own TDD discipline, so don't touch it without writing a new test first. This is where the WHS formula, stroke allocation, best-ball aggregation, the five-tier tiebreaker, and all twenty-odd game modes live.

Offline sync ([`lib/sync/`](lib/sync/)) writes to Dexie first and drains the queue against Supabase once the phone has signal again. Last write wins, keyed on `client_updated_at`. The Dexie database is named `'golf-app'` for historical reasons. Don't rename it, or you'll wipe local data for every existing user.

RLS is enforced strictly in Postgres. You see your own scores, same-flight scores during an active game, and every score once the admin has ended the game. Realtime needs an explicit `supabase.realtime.setAuth()`; auto-propagation doesn't work for the WebSocket channel, which is a known quirk.

Migrations live in [`supabase/migrations/`](supabase/migrations/) (60+ files, chronological).

## Where the rest lives

- [CLAUDE.md](CLAUDE.md) is the main reference: working model, conventions, brand voice, and the files worth knowing.
- [AGENTS.md](AGENTS.md) is short but it matters. Next.js 16 has breaking changes against what you think you know.
- [CHANGELOG.md](CHANGELOG.md) is the version history, with plain-language taglines and the technical detail collapsed underneath.
- [GitHub Issues](https://github.com/jdlarssen/golf-app/issues) is the whole work queue, tagged by type, area, and scope.
- [`docs/`](docs/) holds the launch checklist, mail templates, and the original design notes.

## Versioning

Semver. Every user-visible change bumps `package.json` and adds a CHANGELOG entry in the same commit. The discipline isn't optional: `.githooks/commit-msg` blocks any `feat`, `fix`, or `perf` commit that doesn't stage both files. The production footer reads its version from `package.json` at build time, so the bump shows up as soon as Vercel deploys.
