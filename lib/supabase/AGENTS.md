# lib/supabase — DB-write principles

Client factories live here (`getServerClient`, `getAdminClient`, `getBrowserClient`).
Every write that flows through them must obey the principles below.
Full rationale: `../../docs/bug-prevention.md`. Live-schema reference: `../../docs/schema-ground-truth.md`.
Audit that established these rules: `../../docs/audits/2026-06-17-health-audit.md`.

## Principle #2 — 0-row write = failure, never silence

PostgREST returns `error == null` for an UPDATE/DELETE that matched zero rows.
`#704` peer-approval silently matched 0 rows, reported success, and the game could never be finished.

Use `expectAffected` / `expectOne` from `./affectedRows.ts` after every mutation:

```ts
import { expectOne } from '@/lib/supabase/affectedRows';

const result = await supabase
  .from('game_players')
  .update({ approved_at: now })
  .eq('game_id', gameId)
  .eq('user_id', userId)
  .select('user_id');

const row = expectOne(result, 'approveScorecard'); // throws if 0 or >1 rows affected
```

## Sister of #2 — a short read = failure too: page unbounded reads with `selectAllRows`

PostgREST cuts a SELECT at the project's «Max rows» (1 000 — measured on staging,
`content-range 0-999/1897`) and returns `error == null`. `data` is just shorter.
`#1894`/`#2050`: a 150-player game has ~2 700 score rows, so an unpaged read drops
holes from leaderboards, reminders and mail, and made cup deletion read a played
match as «never played».

A read whose row count grows with players or games (a whole game, a whole cup,
a player's whole history) goes through `selectAllRows` / `selectAllRowsResult`
from `./selectAllRows.ts`. The factory orders on a unique column and applies the
window it is given:

```ts
const scores = await selectAllRows(
  (from, to) =>
    supabase.from('scores').select(SCORES_SELECT).eq('game_id', gameId)
      .order('id').range(from, to).returns<ScoreRow[]>(),
  'loadScores',
);
```

`scoresReadSites.test.ts` holds every `from('scores')` read to this: a new site
either pages or joins its allowlist with a one-line reason why it is bounded.

A build-time read that one Supabase 502/503/504 or fetch failure would fail (#2013) wraps in `withTransientRetry` from `./transientRetry.ts` and passes its signal on with `.abortSignal(signal)` (else Next replays the memoized error) — idempotent reads only, never writes.

## Principle #3 — RLS is the real authz layer; app guards are not enough

A client can call PostgREST directly and bypass every TypeScript guard.
`#670` self-approve and `#671` anon email oracle both exploited this gap.

- Every write path needs a **matching RLS policy**.
- Column-level rules (e.g. a player cannot self-approve or lower their own handicap post-start) require a **trigger** — see `guard_game_players_self_update` (migrations `0103`/`0106`).
- Test each write path against a hostile direct PATCH with the `#440` RLS test rig, not just through the server action.

## Private columns on `users` — e-post and friend code (#2207)

`users.email` and `users.friend_code` are not SELECT-able for `authenticated` or `anon` (column grants, migration 0186), not even on the caller's own row. RLS decides *which rows* a caller sees; the service role fills in the two private fields, and only for:

- **(a) the caller's own row**: `getPrivateUserFields([userId])` (`../users/privateUserFields.ts`), or the verified auth user's `email`;
- **(b) admin surfaces behind `requireAdmin`**: switch that one query to `getAdminClient()` (an admin sees every row anyway, so the gate in the route is the enforcement);
- **(c) server-side mail/notification sends**: `getPrivateUserFields` for the ids your own client's read returned; the value never reaches the browser.

Where a non-admin surface needs to tell people apart, send `maskEmail(...)` (`../users/maskEmail.ts`), never the address.

- A bare `.select()` after `.update()` asks for `select=*` and fails: ask back `id`.
- **A new column on `users` needs its own `grant select (column) on public.users to anon, authenticated`**, or the app cannot see it. `supabase/tests/users_private_columns_test.sql` goes red for a column that is neither granted nor private.
- `userPrivateColumnReads.test.ts` lists every read of the two columns with the client that runs it; a new site joins its allowlist with its class as the reason.
- Match addresses exactly with `.filter('email', 'imatch', emailMatchPattern(x))` (`./emailMatch.ts`), never `.ilike`: there `_` and `%` are wildcards.

## Principle #5 — multi-step creation is atomic or compensated

`#675` cup/liga inserted a parent then children with no rollback, leaving orphan rows on any network blip.

- Wrap multi-insert flows in a **compensating delete** (mirror `startLeagueRoundFlight`) or a single RPC.
- Ensure an `error.tsx` covers the route (`#680`) — never expose Next's raw English 500.

## Typed-client rule (#672)

**Never call `.from()` on an untyped client.** All four factories in this directory are typed as `SupabaseClient<Database>`. A red squiggle on a column name means the live schema disagrees with `database.types.ts` — check the live DB (Supabase MCP or `npm run gen:types`), do not cast it away.

See `../../docs/schema-ground-truth.md` for the authoritative schema snapshot and non-obvious runtime facts (nullable columns, CHECK constraints, trigger guards, RLS policies per actor).

## If you are unsure

Stop and query the live DB before building. The typed client catches column-name drift at compile time; runtime CHECK and RLS gaps are only visible in the live schema. Trust the DB, not your memory or any doc snapshot.

## RLS — hvem ser hvilke scores

> Flyttet ordrett fra CLAUDE.md (#2100).

Strengt håndhevet i Postgres. Spillere ser:
- Sine egne scores
- Samme-flight scores under aktivt spill
- Ingenting av et utkast (`games.status = 'draft'`) de står på: det ser bare arrangøren og global admin (#2445, 0202)
- Alle scores i spill **de selv er med i**, etter `games.status = 'finished'`

⚠️ Merk siste punkt: finished-grenen i `scores select gating per mode` krever
fortsatt deltakelse i DET spillet. Et ferdig spill er altså ikke world-read (#1542).
Flater som med vilje viser resultater til et bredere publikum — cup-sidene
(`getCupSnapshot`), `/spectate/[token]`, og kamp-leaderboardet OG hull-drilldownen
via `getResultReadClient` (#1632, eiervalg B: begge svarer likt), og
resultatbildet (`leaderboard/share-image`) og CSV-eksporten (`leaderboard/export`)
med samme gate som tavla (innlogget + ferdig; delern fra sesjonen, aldri fra URL-en,
#2312) — leser derfor med service-role og holder autorisasjonen på call-site. Det
samme gjør arrangøren som ikke spiller: mens runden pågår, ser hen tavla og
hull-drilldownen via `getResultReadClient` (#2202, eierens valg C). Døra er
`nonPlayerGameDoor` (flaten `board`), og vilkåret er `organiserFollowsLiveBoard`
(`games.created_by` = seeren og `status = 'active'`). Legger du til en slik
flate: gaten i ruta ER håndhevelsen, det finnes ingen RLS bak den.

Et utkast (`games.status = 'draft'`) ser bare arrangøren og global admin, også om du
står på lista (#2445, migrasjon 0202). RLS-laget er lesereglen for `games` og
`is_in_game` (som bærer «game_players select shared game»). Tjenesteklient-dører
spillere når (påmelding, «Finn turneringer», invitasjonskortet ved innlogging,
landingen etter innlogging, kalenderfila, trekk deg) sjekker `status === 'draft'` selv.
Medspiller-avledningen har to hjem som må endres sammen: `is_invite_eligible` i
databasen og `lib/users/getCoPlayerIds.ts` i app-koden. Et utkast gjør bare
arrangøren til medspiller.

Helper functions er `SECURITY DEFINER` for å unngå rekursjons-feller.
