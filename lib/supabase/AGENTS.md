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

## Principle #3 — RLS is the real authz layer; app guards are not enough

A client can call PostgREST directly and bypass every TypeScript guard.
`#670` self-approve and `#671` anon email oracle both exploited this gap.

- Every write path needs a **matching RLS policy**.
- Column-level rules (e.g. a player cannot self-approve or lower their own handicap post-start) require a **trigger** — see `guard_game_players_self_update` (migrations `0103`/`0106`).
- Test each write path against a hostile direct PATCH with the `#440` RLS test rig, not just through the server action.

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
- Alle scores i spill **de selv er med i**, etter `games.status = 'finished'`

⚠️ Merk siste punkt: finished-grenen i `scores select gating per mode` krever
fortsatt deltakelse i DET spillet. Et ferdig spill er altså ikke world-read (#1542).
Flater som med vilje viser resultater til et bredere publikum — cup-sidene
(`getCupSnapshot`), `/spectate/[token]`, og kamp-leaderboardet OG hull-drilldownen
via `getResultReadClient` (#1632, eiervalg B: begge svarer likt) — leser derfor
med service-role og holder autorisasjonen på call-site. Legger du til en slik
flate: gaten i ruta ER håndhevelsen, det finnes ingen RLS bak den.

Helper functions er `SECURITY DEFINER` for å unngå rekursjons-feller.
