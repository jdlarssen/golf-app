# Evaluation: #347 — Cup-navigasjon (tilbake-lenke + spiller-vei til cup-leaderboard)

**Date:** 2026-05-31
**Branch:** `claude/crazy-tesla-a3678f`
**Evaluated commit:** `8955831084184bfd37c812b75c8c84961fd9bbaf`

---

## Verdict: ACCEPT

All seven acceptance criteria pass. All gates pass. No regressions detected.

---

## AC Results

### AC1 — Tilbake fra cup-detalj går til `/admin/cup` ✅ PASS
`app/admin/cup/[id]/page.tsx` line 98: `<TopBar backHref="/admin/cup" …>`. Changed from `/admin` in commit `8955831`.

### AC2 — Spiller kan nå `/cup/[id]` fra app-UI i alle tilstander ✅ PASS
`CupStandingsLink` renders in two slots in `app/games/[id]/page.tsx`:
- Line 441–447: scheduled-branch (waiting room), wrapped in `<div className="mx-4 mt-4">` then `<Suspense fallback={null}>`
- Lines 705–709: main-branch (draft/active/finished), wrapped in `<Suspense fallback={null}>`

Both render `<SmartLink href={"/cup/${tournamentId}"}…>` with the «Se cup-stillingen» nav-card.

### AC3 — Lenke vises KUN for cup-spill (`tournament_id` satt + cup finnes) ✅ PASS
`CupStandingsLink` (line 1054–1083):
1. Queries `games.tournament_id`; returns `null` if `row?.tournament_id` is null/missing (line 1062).
2. Queries `tournaments` for the id; returns `null` if no row found (line 1069).
Both null-exit paths are explicit.

### AC4 — `/cup/[id]` reachable for non-admin players ✅ PASS
`app/cup/[id]/page.tsx` has no `requireAdmin`. Only calls `getProxyVerifiedUserId()` (line 5/16), which is the standard user-auth helper, not an admin gate.

### AC5 — No regression in `getGameWithPlayers` / `GameForHole` ✅ PASS
`git diff --name-only e257677..HEAD` does not include `lib/games/getGameWithPlayers.ts`. Only 6 files changed: contract, CHANGELOG, `app/admin/cup/[id]/page.tsx`, `app/games/[id]/page.tsx`, `package.json`, `package-lock.json`. Build green.

### AC6 — Copy «Se cup-stillingen» passes humanizer, nav-card matches pattern ✅ PASS
- «Se cup-stillingen» is idiomatic Norwegian: verb «Se» + noun «cup-stillingen» (compound, no særskriving). No anglicisms, no em-dash chains, no «vennligst», no AI tells.
- Nav-card HTML matches existing pattern exactly: `SmartLink className="block"` > `Card min-h-[44px] flex items-center justify-between transition-colors hover:border-primary/30` > `span text-base font-medium text-text` + `span aria-hidden text-muted →` (confirmed against leaderboard/scorecard/hull-for-hull cards at lines 667–688, 679–689).

### AC7 — PATCH bump 1.60.1 → 1.60.2 + CHANGELOG in same commit ✅ PASS
`package.json`: `"version": "1.60.2"`. CHANGELOG entry at `[1.60.2] - 2026-05-31` with correct three-layer format (blockquote tagline + `<details>` Teknisk section). Both staged and committed in `8955831` alongside the code change.

---

## RLS Analysis

**Question:** Can a participating (non-admin) player actually SELECT (a) `games.tournament_id` and (b) the `tournaments` row via `CupStandingsLink`?

**`games` select policy** (`0002_rls_policies.sql`, line 66–71):
```sql
create policy "games select if participant or admin" on public.games
  for select using (
    public.is_admin()
    or exists(select 1 from public.game_players where game_id = public.games.id and user_id = auth.uid())
  );
```
A player who is in the game (which is the prerequisite for being on the `app/games/[id]` page at all) satisfies `exists in game_players`. They can select `tournament_id` from their own game row. ✅

**`tournaments` select policy** (`0039_tournaments.sql`, line 59–62):
```sql
create policy tournaments_select_authenticated
  on public.tournaments for select
  to authenticated
  using (true);
```
All authenticated users can select any tournament row. ✅

**`getGameContext` client** (`app/games/[id]/page.tsx` line 178–182):
```ts
const getGameContext = cache(async () => {
  const supabase = await getServerClient();  // RLS-bound user client
  const userId = await getProxyVerifiedUserId();
  return { supabase, userId };
});
```
Uses `getServerClient()` (user/cookie client), NOT an admin client. Both queries in `CupStandingsLink` go through the user client and are gated by the RLS policies above. **For a participating player in a cup game, both queries will succeed.** The link will render correctly.

**`games.tournament_id` column existence:** Confirmed in `0039_tournaments.sql` lines 42–44:
```sql
alter table public.games
  add column tournament_id uuid references public.tournaments(id) on delete set null,
```
Column exists; also used in `lib/cup/actions.ts` and `app/admin/games/new/page.tsx`.

---

## Gate Results

### `npm run lint` ✅ PASS
```
✖ 18 problems (0 errors, 18 warnings)
```
All 18 warnings are pre-existing `_gameId is defined but never used` in leaderboard views. Zero errors. No new warnings in changed files.

### `npx vitest run app/games` ✅ PASS
```
Test Files  33 passed (33)
      Tests  257 passed (257)
   Duration  4.32s
```

### `npx tsc --noEmit` ✅ PASS (pre-existing errors only)
No errors in `app/games/[id]/page.tsx` or `app/admin/cup/[id]/page.tsx`.
Pre-existing errors remain only in:
- `app/admin/games/[id]/signups/actions.test.ts`
- `app/games/[id]/withdrawActions.test.ts`
- `app/signup/[shortId]/actions.test.ts`
- `app/signup/[shortId]/teamActions.test.ts`

### `npm run build` ✅ PASS
Build completed successfully. No errors. All routes compiled including `/games/[id]` and `/admin/cup/[id]`. Both confirmed as `ƒ (Dynamic)` routes.

---

## Regressions / Concerns

None detected.

Minor observation (not a fail): The second render slot in the main return branch (line 707) renders `CupStandingsLink` without an `mx-4` wrapper, while the scheduled-branch slot (line 443) uses `<div className="mx-4 mt-4">`. This is intentional and correct — the main return branch operates inside a `<div className="space-y-4">` container (line 537) where all nav-cards (Scorecard, Leaderboard, Hull for hull) render without individual `mx-4` wrappers, following the established pattern. The scheduled branch lacks such a container and uses per-element `mx-4` (matching the countdown banner, course card, etc.).
