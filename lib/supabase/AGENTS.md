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
