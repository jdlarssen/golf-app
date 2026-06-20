# Contract: ux/liga — Liga-page UX polish (4 issues)

Worktree: `.claude/worktrees/ux-polish-liga` · Branch: `claude/ux-polish-liga` (off origin/main @ ee34b5fd)
Parent: see `.forge/contracts/ux-polish-set2.md` for common rules (npm install, hooks,
atomic-commit-per-issue, version-bump+CHANGELOG, humanizer, gate-per-file, one PR).

## Dependencies
None. Source files disjoint from set 1 and from ux/spill. Only shared files:
`messages/no.json`, `messages/en.json`, `package.json`, `CHANGELOG.md`.

## File boundaries
ONLY touch: `app/[locale]/liga/[id]/page.tsx`, `lib/league/getLigaSnapshot.ts`,
`app/[locale]/admin/liga/[id]/LigaAddPlayers.tsx`, the 4 shared files, and a
co-located test if you add one. Do NOT modify `lib/league/actions.ts` (it's the
read-only reference for the gate) unless strictly required — prefer not to.

## Recommended build order (atomic commit per issue)
`#772` → `#774` → `#773` → `#740` (smallest/most-isolated first; #740 is the
correctness-sensitive one and touches both page.tsx and getLigaSnapshot.ts).

---

## #772 — Map raw error codes in "Legg til deltakere" through t()  `fix(liga)`
**Problem:** On network/RLS failure, `LigaAddPlayers.tsx` renders the raw server
code (`players_failed`/`players`/`missing`) verbatim — code-like English leak.
Sister component `LigaAddRound.tsx` already maps codes via an allow-list + `t()`.

**Current code** — `app/[locale]/admin/liga/[id]/LigaAddPlayers.tsx:107-109`:
```tsx
{state.error && state.error !== '' && (
  <p className="font-sans text-[12px] text-danger">{state.error}</p>
)}
```
**Server error codes** (`lib/league/actions.ts` addLeaguePlayers): `'missing'`
(line ~375), `'players'` (~383, JSON parse), `'players_failed'` (~417, DB upsert),
`''` (success).

**Reference pattern to copy** — `LigaAddRound.tsx:24-30` (allow-list + fallback):
```tsx
const error = state.error
  ? (['missing', 'window', 'not_found', 'insert_failed'] as const).includes(
      state.error as 'missing' | 'window' | 'not_found' | 'insert_failed',
    )
    ? t(`errors.${state.error as ...}`)
    : t('errors.fallback')
  : null;
```

**Fix:**
- Add `liga.addPlayers.errors.{missing, players, players_failed, fallback}` to
  `no.json` + `en.json` (the `liga.addPlayers` namespace exists ~no.json:3616; it
  currently has NO `errors` subsection — add it).
- In `LigaAddPlayers.tsx`, replace the raw render with the allow-list+`t()` pattern.
  The component uses `useTranslations('liga.addPlayers')` (verify the namespace it
  already binds; if it binds a different one, mirror LigaAddRound's binding). Unknown
  codes fall to `fallback` (safer than today's raw render).

**Norwegian copy (run humanizer, then add EN twins):**
- `players_failed`: "Klarte ikke å legge til spillerne. Prøv igjen." (from issue)
- `missing`: something like "Mangler ligainformasjon." / `players`: "Ugyldig
  spillerliste." / `fallback`: "Noe gikk galt." — pick concise, idiomatic Norwegian
  matching the `liga.addRound.errors` tone; EN twins clean English.

**Gate:** tsc + i18n parity + lint. Bump patch + CHANGELOG.

---

## #774 — "Sesongen er ferdig"-banner on finished liga  `fix(liga)` (enhancement)
**Problem:** A finished liga looks almost identical to an active one — only a 10px
status chip differs. Anticlimactic end to the core loop.

**Current code** — `app/[locale]/liga/[id]/page.tsx`: `Banner` is already imported
(~line 12) and `league.status` is available (`'draft' | 'active' | 'finished'`).
The rounds table renders around line 231; the status chip is an inline-style span
~line 187-197. `Banner` supports `tone: 'success' | 'error' | 'info' | 'warning'`.

**Fix:** When `league.status === 'finished'`, render a single
`<Banner tone="success">{t('seasonFinishedBanner')}</Banner>` ABOVE the standings
table (~line 231, before the rounds/standings section). One conditional Banner +
one i18n key. **Do NOT include leader names** (net/brutto ambiguity + empty-table
edges + userId-not-name — explicitly out of scope, separate larger task).

**Norwegian copy (run humanizer):** "Sesongen er ferdig. Slik endte tabellen."
EN twin: e.g. "The season is over. Here's how the table finished." Key:
`liga.player.seasonFinishedBanner` in `no.json` + `en.json`.

**Gate:** tsc + i18n parity + lint. Bump patch + CHANGELOG.

---

## #773 — "Åpner {dato}" in action column for upcoming rounds  `fix(liga)` (enhancement)
**Problem:** When no round is open, the action column is empty for every
"Kommer"/"Lukket" round; the player can't tell whether they missed something or
just need to wait. The date sits in muted small-text but nothing elevates it.

**Current code** — `app/[locale]/liga/[id]/page.tsx:258-308`:
- `ws = windowStatus(round.opensAt, round.closesAt)` returns
  `'open' | 'upcoming' | 'closed'` (NOT 'active').
- `fmtWindow(iso, locale)` formats a date (already used line 284).
- Action area is the `<div className="shrink-0 self-center">` at line 294-308.

**Fix:** In the action-area conditional, add a branch: when `ws === 'upcoming'`
(strictly upcoming — NOT closed), render muted text
`{t('opensOn', { date: fmtWindow(round.opensAt, locale) })}`. Keep it as the last
branch so it doesn't pre-empt the `canPlay` / `notReadyYet` branches. New key
`liga.player.opensOn`.

**Norwegian copy (run humanizer):** "Åpner {date}". EN twin: "Opens {date}". Key:
`liga.player.opensOn` in both catalogs.

**Gate:** tsc + i18n parity + lint. Bump patch + CHANGELOG.

---

## #740 — Show "Levert ✓" instead of "Spill" on an already-delivered round  `fix(liga)` ⚠️ CORRECTNESS
**Problem:** The "Spill" CTA stays unchanged on a round the player has already
delivered while the window is still open. They tap through, check markers, press
"Start flight" — and are rejected ONLY THEN with "Du har allerede spilt denne
runden". A 3-tap dead-end mid core-loop.

### ⚠️ The gate must be mirrored EXACTLY — this is the whole risk of the issue
**Server gate** — `lib/league/actions.ts:656-663` (startLeagueRoundFlight):
```ts
const { data: priorGames } = await supabase
  .from('games')
  .select('id, status, game_players!inner(user_id, withdrawn_at)')
  .eq('league_round_id', roundId)
  .eq('status', 'finished')
  .eq('game_players.user_id', user.id);
if ((priorGames ?? []).some((g) =>
      g.game_players.some((p) => p.withdrawn_at === null)))
  return { error: 'already_played' };
```
So "already delivered THIS round" ≡ **there exists a game with
`league_round_id === round.id` AND `status === 'finished'` AND a `game_player` row
for this user with `withdrawn_at === null`.**

**DO NOT use the `submitted_at`-based `hasPlayed`** that the snapshot already
computes (`getLigaSnapshot.ts:213-215`). That flag is (a) global across all rounds
and (b) `submitted_at`-based — wrong on both axes. A withdrawn player must still see
"Spill" (can start fresh); a started-but-not-finished player must still see "Spill"
(can complete). Only finished + non-withdrawn = "Levert ✓".

### Implementation
1. **`lib/league/getLigaSnapshot.ts`:** expose a per-round set of users who have a
   finished, non-withdrawn flight on that round.
   - The snapshot already loads `game_players` (`playersRes`, with `withdrawn_at`,
     `game_id`) and the per-round games (used for `flightCount`). Find where games
     are fetched (above line 170 — it derives `gameIds` and per-round flight counts;
     it must already have each game's `id`, `league_round_id`, and `status`). If the
     games fetch does not already select `status` and `league_round_id`, add them.
   - Build `Map<roundId, Set<userId>>`: for each game with `status === 'finished'`,
     map `game.league_round_id` → add every `game_player.user_id` where that gp's
     `withdrawn_at === null`. (Mirror the gate: finished + non-withdrawn.)
   - Add `playedUserIds: string[]` to the `LeagueRoundView` type and populate it per
     round from that map. (Name it clearly, e.g. `deliveredUserIds`, to avoid
     confusion with the snapshot's global `playedUserIds` Set — your call.)
2. **`app/[locale]/liga/[id]/page.tsx`:** the current user is `currentUserId`
   (line 101). In the round loop (line 258), compute
   `const alreadyDelivered = isParticipant && currentUserId != null &&
     round.deliveredUserIds.includes(currentUserId);`
   In the action area (line 294), make `alreadyDelivered` the FIRST branch:
   ```tsx
   {alreadyDelivered ? (
     <span className="text-xs text-muted ..." aria-label={t('deliveredAria')}>
       {t('delivered')}
     </span>
   ) : canPlay ? ( ...existing LinkButton... )
     : isParticipant && ws === 'open' && !roundReady ? ( ...notReadyYet... )
     : /* #773 upcoming branch */ ...
     : null}
   ```
   Render it calmly (muted text + check glyph), with an aria-label.

**Norwegian copy (run humanizer):** visible: "Levert ✓" (key `liga.player.delivered`
= "Levert" rendered with a ✓, or include the ✓ in the string — your call but keep
the ✓ out of the aria text). aria-label key `liga.player.deliveredAria` =
"Du har levert denne runden". EN twins: "Delivered" / "You delivered this round".

**Tests:** add focused coverage for the snapshot's per-round delivered-set logic if
`getLigaSnapshot` has co-located tests (mirror the gate: finished+non-withdrawn
included; withdrawn excluded; started-not-finished excluded). If page.tsx has a
co-located test (`liga-round` testid exists), assert the delivered state renders the
status not the button. Keep it to ONE render test (Type C discipline).

**Gate:** tsc + co-located tests + i18n parity + lint. Bump patch + CHANGELOG.

---

## Closing (for the coordinator, not the builder)
The coordinator (main session) writes the mandatory per-issue closing comments and
opens the PR. Builder: just land clean atomic commits + leave the branch ready.
