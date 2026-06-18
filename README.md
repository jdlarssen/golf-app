# Tørny

> Fire up a golf tournament in a couple of minutes.

<p align="center">
  <img src="docs/podium.jpg" alt="Podium screen crowning the tournament winner" width="200">
  <img src="docs/oppsett.jpg" alt="Setting up a new round" width="200">
  <img src="docs/format.jpg" alt="The in-app format guide" width="200">
  <img src="docs/sideturnering.jpg" alt="A side tournament's points breakdown" width="200">
</p>

Tørny is a mobile-first PWA for running golf tournaments. It scales from four friends on a Saturday round to a club event with 150 players. You create the game, invite the group, and everyone taps their strokes while they walk the course. The app handles the rest: scoring, the live leaderboard, side tournaments, and the mail that goes out when a game ends.

Live at [tornygolf.no](https://tornygolf.no) (also `tørny.no`).

It's invite-only: players sign in with a one-time code by mail, with no open signup and no password to forget. Any signed-in player can set up a game, run it, and finish it themselves, and manage their own games end to end: edit or delete before play starts, add or remove players, invite new people by mail, withdraw someone mid-round, and approve a scorecard on the flight's behalf when a co-player can't. Everyone gets a Klubbhuset tab at the bottom of the screen: your own games gather there, and it's where you set up a new game or add a course. For admins it also holds the full secretariat, where they run club-scale tournaments. Tørny is a solo project, built and run by Jørgen, and it runs in production for real tournaments.

## What you get

- More than twenty tournament formats, all on WHS net handicap.
- A leaderboard that updates live while your flight taps scores.
- Flights that match the course. Four or fewer players walk as one group where anyone can keep score for anyone; bigger fields are split into flights — the organizer can auto-split and adjust them, players can pick their own group in the waiting room, and signup can be closed while the final adjustments are made.
- Offline-first scoring. Tap in a dead spot on the course and it syncs once your phone has signal again.
- A side tournament you can bolt onto any game: a points race across the round, plus longest-drive and closest-to-pin contests.
- Your own cup. Run a team-vs-team Ryder Cup among friends without needing a club: name the two teams, generate the matches from your friends, then start and finish it yourself. A personal cup holds up to four matches and twenty-four players; need more and that's what a club cup is for.
- Clubs, set up through Tørny. A club gathers people and tournaments in one named place; you arrange one with us rather than spinning it up yourself, and each comes with a member cap and a duration. The owner runs it from there: appoint co-admins and owners, add members by mail or a shared join link, approve join requests, and set up rounds every member finds under "Finn turneringer" and joins straight away, even when the round would otherwise be private. An owner or club admin can also set up and run a season-long league for the club: start it, manage its rounds and participants, and finish the season themselves. Members find it on the club page, and can join an upcoming league themselves before it starts, then back out again until they've played a round. They can run a team-vs-team cup the same way: create it from the club page, generate the matches from the members, and start or finish it there. The player picker draws from club members rather than your friends, and members find both the leagues and cups on the club page.
- Friends. Add people you've played with, by mail, or with a share link that connects whoever opens it. Inviting someone to a game by mail also makes you friends once they join, so the list fills itself as you play. Friends turn up when you fill a team, and their games appear under "Finn turneringer" in their own section. Open a round "for friends": tick a box on a request-to-join game and your friends skip the approval and join straight away, while everyone else still asks.
- Leagues. Run a season across several rounds: pick how often you play, keep one course and tee for the whole thing or change it round to round, and rank everyone on net-to-par with a table that updates as flights come in. Players have the full round window to play in their own flights of at least two, missed rounds take a penalty score or drop out, and you decide the winner by total or average.
- An inbox for invitations, friend requests, peer approvals, submitted scorecards, finished games, and requests to join your club. Mail only goes out when you're not already in the app.
- Norwegian and English. Switch language right on the login page, before you've even signed in, or later from your profile. The whole play loop is covered — game page, hole-by-hole scoring, scorecard, leaderboards for every format, and the CSV export — and so is setting things up: the game wizard, quick setup and the course form. The admin console is covered too: the result log, running a game (sign-ups, flights, reminders, finishing), player and course management, the format mapping and launches. So are the club, league and cup surfaces, and the personal side — your profile with stats and history, friends, the inbox with every notification, "Finn turneringer" and the bottom navigation. The home screen, the self-registration flow, the format guide — names, descriptions, rules and examples for every game format — and the legal pages are covered too, so the whole interface is now bilingual. The transactional mail follows your language as well: every notification — invitation, result, reminder, cup and registration mail — goes out in the recipient's language, and the login-code mail is pared down to the code itself so it reads the same in any language. What's left is the draft Gaelic and Irish locales.
- Installable on your home screen. It opens like a native app, with no browser bar on top.
- GDPR self-service. Export or delete your data from your profile page without emailing anyone.

## Formats

Tørny ships more than twenty scoring modes. Each one comes with a short rules card in the app, so a player can pick something they've never tried and still know how to score it.

- Solo: stroke play, Stableford, modified Stableford
- Matchplay: singles, fourball, foursomes, greensome, gruesome, Chapman, patsome, round robin
- Team: best ball, Texas and Florida scramble, Ambrose, shamble
- Betting games: Wolf, Nassau, Skins, Bingo Bango Bongo, Nines, Acey Deucey

## Side tournaments

Any game can carry a side tournament next to the main result. Turn it on and it runs as an automatic points race across the round, and you can switch off any category you don't care about.

The package counts things like the best net front and back nine, King of the par 3s, 4s and 5s, and most birdies and eagles. It also hands out named badges: Turkey for three birdies in a row, Solid for five, and Snowman for a blow-up hole (that last one costs you points).

Then there are the two hole contests, longest drive and closest to the pin, with up to two of each. Those winners can't be read off the scorecard, so you pick them yourself when you end the game.

## Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Styling | Tailwind v4, forest-and-champagne palette |
| Database and auth | Supabase (Postgres + Auth + Realtime, EU region) |
| Offline sync | Dexie (IndexedDB) with a last-write-wins RPC |
| i18n | next-intl — Norwegian default on unprefixed URLs, other locales under `/<locale>/`, catalogs in `messages/` |
| Mail | Resend, through the verified `tornygolf.no` domain |
| Testing | Vitest + Testing Library + Playwright |
| Hosting | Vercel, auto-deploy on push to `main` |

Auth uses a one-time code by mail. Magic links went in the bin because iOS PWA handoff and mail scanners each broke the flow in their own way at the same time.

## Running it locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll need a `.env.local` with Supabase and Resend keys. They're not in the repo, so a fresh clone won't boot on its own. This isn't wired up for outside contributors.

```bash
npm test          # vitest (2000+ unit + integration)
npm run e2e       # playwright
npm run typecheck # tsc --noEmit (Supabase clients are typed, so schema drift fails here)
npm run lint
npm run build
```

CI (GitHub Actions) runs typecheck + tests + lint on every PR to `main`, and a daily schema-drift job regenerates the Supabase types from prod and fails if [`lib/database.types.ts`](lib/database.types.ts) is stale — run `npm run gen:types` to refresh it (needs the Supabase CLI + a `SUPABASE_ACCESS_TOKEN`). An optional authenticated-e2e gate (the scoring golden path + cup/liga smoke) is wired but off by default; set the `RUN_E2E` repo variable and the Supabase service-role + `E2E_*` secrets to activate it. A local `pre-push` git hook ([`.githooks/pre-push`](.githooks/pre-push), enabled automatically by `npm install`) runs the same typecheck + lint + tests before every push, so red code never leaves your machine — it stands in for branch protection, which GitHub paywalls on a private free-tier repo.

## How it fits together

The scoring logic ([`lib/scoring/`](lib/scoring/)) is plain TypeScript with no Supabase dependency. It has its own tests and its own TDD discipline, so don't touch it without writing a new test first. This is where the WHS formula, stroke allocation, best-ball aggregation, the five-tier tiebreaker, and all twenty-odd game modes live.

Offline sync ([`lib/sync/`](lib/sync/)) writes to Dexie first and drains the queue against Supabase once the phone has signal again. Last write wins, keyed on `client_updated_at`. The Dexie database is named `'golf-app'` for historical reasons. Don't rename it, or you'll wipe local data for every existing user.

RLS is enforced strictly in Postgres. You see your own scores, your flight's scores during an active game (a game with four or fewer active players counts as one flight regardless of format — matchplay opponents included — and Wolf is always one group, so everyone sees and can score for everyone), and every score once the admin has ended the game. Realtime needs an explicit `supabase.realtime.setAuth()`; auto-propagation doesn't work for the WebSocket channel, which is a known quirk.

Migrations live in [`supabase/migrations/`](supabase/migrations/) (90+ files, chronological).

## Where the rest lives

- [CLAUDE.md](CLAUDE.md) is the main reference: working model, conventions, brand voice, and the files worth knowing.
- [AGENTS.md](AGENTS.md) is short but it matters. Next.js 16 has breaking changes against what you think you know.
- [CHANGELOG.md](CHANGELOG.md) is the version history, with plain-language taglines and the technical detail collapsed underneath.
- [GitHub Issues](https://github.com/jdlarssen/golf-app/issues) is the whole work queue, tagged by type, area, and scope.
- [`docs/`](docs/) holds the launch checklist, mail templates, and the original design notes.
