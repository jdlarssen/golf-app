# Evaluation: Wolf støtter 3–5 spillere (#465)

**Verdict: ACCEPT**

The change correctly generalizes Wolf from exactly-4 to 3–5 players. All three gates pass, every acceptance criterion is independently verified in the source (not just the tests), the n=4 path is byte-identical, and the test suite genuinely locks the new n=3/n=5 economy. The only findings are stale documentation comments — no logic, copy, or behavior defects.

---

## Gate results

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **clean** (exit 0, no output) |
| Scoped vitest (6 files) | **6 files passed, 493 tests passed** |
| `npm run build` (Vercel parity) | **exit 0**, no error/failed lines |

The scoped vitest run covered `wolf.test.ts`, `wolfRotation.test.ts`, `gamePayload.test.ts`, `fitsPlayerCount.test.ts`, `useGameFormState.test.ts`, `WolfSetup.test.tsx`.

---

## Per-criterion verification (against SOURCE)

### 1. Rotation R = floor(18/n)*n, trailing R+1..18

- `lib/scoring/modes/wolf.ts:98-113` — `const n = players.length; const R = Math.floor(18/n)*n;` Holes 1..R use `slot = ((holeNumber-1) % n) + 1`; holes R+1..18 fall through to trailing sort `(totalPoints ASC, teamNumber ASC)`. **Correct.**
  - n=3 → R=18 → trailing branch never reached (the `holeNumber <= R` guard is true for all 1..18). No off-by-one, no empty-array hazard — `players.find` over the rotation always returns a valid player when team_numbers are contiguous 1..n.
  - n=4 → R=16, trailing 17-18 (unchanged). n=5 → R=15, trailing 16-18.
- `app/games/[id]/holes/[holeNumber]/wolfRotation.ts:50-64` — **MIRRORS exactly**: same `n = players.length`, same `R = Math.floor(18/n)*n`, same `((holeNumber-1) % n)+1`, same trailing sort. No server/client divergence. **Correct.**

### 2. Scoring economy: lone=n, blind=n+2; partner & opponent unchanged

- `wolf.ts:265` — lone win = `players.length * stake` (= n).
- `wolf.ts:268` — blind win = `(players.length + 2) * stake` (= n+2).
- `wolf.ts:260-262` — partner win = `2 * stake` each (unchanged).
- `wolf.ts:277-289` — opponent payouts: partner/lone loss = `1 * stake`, blind loss = `2 * stake` (unchanged).
- Traced n=3: lone=3, blind=5. Traced n=5: lone=5, blind=7. n=4: lone=4, blind=6 (unchanged). **All correct.**
- Tests genuinely lock these: `wolf.test.ts:888-923` (n=3: lone→3, blind→5, opp +1/+2, partner 2 each) and `wolf.test.ts:988-1037` (n=5: lone→5, blind→7, opp +1/+2 to 4 opponents, partner 2 each). Assertions use `toEqual` on full point maps — not vacuous.

### 3. n=4 byte-identical

- `git diff origin/main...HEAD -- lib/scoring/modes/wolf.test.ts` shows **216 insertions, 0 removed/changed assertions** — no existing n=4 fixture was touched. The n=4 logic path is structurally unchanged (same formula evaluates to R=16, lone=4, blind=6). **Confirmed.**

### 4. validateWolf (gamePayload.ts:1478-1536)

- Reads **6 slots** (`for i<6`, comment line 1486 explains: one over cap to catch a 6th player). **Correct.**
- Publish: `<3 → min_players_for_mode` (1509), `>5 → too_many_players_for_mode` (1512). Rejects 2 and 6. **Correct.**
- Requires **contiguous team_numbers 1..n** (sorted, `every((tn,idx) => tn === idx+1)`, line 1517-1522) → `team_balance` on failure. Stronger than the contract's "distinct !== n" sketch but equivalent-or-better; rejects gappy slots that would leave a rotation hole unassigned. **Correct.**
- `team_number` range gate 1..5 (1497-1502) → `bad_team`. **Correct.**
- `teams_count: players.length` (1532). **Correct.**

### 5. fitsPlayerCount.ts

- `case 'wolf': return n >= 3 && n <= 5;` (line 55-56). **Correct.**
- **Exact-4 formats NOT loosened:** `round_robin, acey_deucey, fourball_matchplay, foursomes_matchplay, greensome_matchplay, chapman_matchplay, gruesome_matchplay` all still `n === 4` (line 59-66). `nines` still `n === 3` (line 79). `singles_matchplay` still `n === 2` (line 33). **No accidental collateral.**

### 6. useGameFormState.ts

- `wolfPlayersValid = isWolf && selectedPlayerIds.length >= 3 && <= 5` (line 1145-1146). **Correct.**
- `wolfOrder` slices to 5 (`selectedPlayerIds.slice(0, 5)`, line 893), returns `[]` when `<3` (line 891). **Correct.**
- `orderedPayload` Wolf branch emits contiguous `team_number: idx+1` over `wolfOrder` (line 932-936); `<3` emits slot-free rows for draft tolerance (925-931). **Correct.**
- Publish error copy: "minst 3" / "for mange spillere — Wolf tar 3 til 5" (line 1409-1416). **Correct.**

### 7. WolfSetup.tsx

- Dynamic slot count: `slots = Array.from({length: n}, ...)` where `n = wolfOrder.length` (line 55-60). **Correct.**
- R-based hole distribution per slot: `holesForSlot(slot, n, R)` iterates `h = slot; h <= R; h += n` (line 30-34, 151). **Correct.**
- Trailing-note rendered **only when R < 18** (`{R < 18 && (...)}`, line 157). For n=3 (R=18) the note is suppressed; for n=4/n=5 it shows "Hull {R+1}–18 …". **Correct.**
- `canShuffle = !disabled && hasRotation` where `hasRotation = n >= 3 && n <= 5` (line 56, 61). **Correct.**

### 8. WolfChoiceModal.tsx

- `const n = otherPlayers.length + 1` (line 171). **Correct.**
- Lone subtitle: "Vinner du, får du {n}." (line 245). Blind: "Vinner du, får du {n + 2}." (line 257). **Correct.**
- Partner subtitle: "Vinner-siden får 2 hver" — no "2v2"/"2x" framing (line 231). **Correct.**
- Renders one partner button per `otherPlayers` element (line 221-233) → n-1 options for any n. **Correct.**

### 9. HoleClient.tsx

- Badge: lone → `(Lone Wolf — ${wolfPlayerCount} poeng)` (line 459), blind → `(Blind Wolf — ${wolfPlayerCount + 2} poeng)` (line 461), where `wolfPlayerCount = wolfPlayers?.length` (line 449). Shows actual points, no "2x/3x". **Correct.**
- `otherWolfPlayers` = all players except `myUserId` (line 466-468). Since the modal only mounts when `iAmWolfForHole` (myUserId === wolf), this is exactly the n-1 non-wolf players. **Correct.**

### 10. modeGuide.ts

- Line 144: "Tre til fem spillere bytter på å være «ulv» …" — no longer "Fire spillere". **Correct.** (Lines 190/199 mention "Fire spillere" but belong to round_robin / nines summaries, out of scope #465.)

### page.tsx (no-change touch-point, verified)

- `wolfPlayersForClient` (page.tsx:308-314) is built generically: `allPlayers.filter(team_number != null).map(...)` — no cap at 4, works for any n. **Correct.**

### types.ts (necessary widening — contract said "no change", implementer correctly changed it)

- `lib/scoring/modes/types.ts:380` — `teams_count` widened from literal `4` to `number`. This is **required**: without it, `validateWolf` returning `teams_count: players.length` (3 or 5) would be a tsc error. The contract's "ingen endring nødvendig" note for types.ts was wrong; the implementer caught it. tsc is clean because of this. **Correct and necessary.**

### Version + CHANGELOG

- `package.json` version = **1.83.15** (correct, patch under open 1.83.y series).
- `CHANGELOG.md:24` — `### [1.83.15] - 2026-06-07 · #465` with tagline, "Hvorfor", and a "Teknisk" file-by-file list. **Present and well-formed.**

---

## Bugs / gaps found (severity-ranked)

### None blocking.

### LOW — stale documentation comments (cosmetic, no behavior impact)

These header/doc comments were not updated when the logic was generalized. None affect runtime, user-facing copy, or types. Worth a follow-up tidy but not blocking.

1. `lib/scoring/modes/types.ts:1213-1234` — Wolf section header block still says "4-spiller", "team_number 1-4", "Hull 1-16", "Hull 17-18", `% 4`, "2v2 / 1v3", "2x stake / 3x stake", "lone win: 4 × stake", "blind win: 6 × stake". This is the canonical design-doc comment for the Wolf type and is now inaccurate (should be n / n+2, R-based holes).
2. `lib/scoring/modes/wolf.ts:16-17` — header comment still says "Multiplier (2x for lone, 3x for blind)". The function-level comments at lines 264/267 are correct; only this top-of-file summary is stale.
3. `app/games/[id]/leaderboard/page.tsx:418` and `:2170-2172` — JSDoc still says "4-spiller rotating partner-format" and "teams_count: 4 … team_number 1-4". The `renderWolf` function body has no hardcoded-4 logic (verified) and iterates generically.
4. `lib/games/gamePayload.ts:1910` (and `:1898`) — comments in `validateRoundRobin` say "speiler Wolf" while describing the exactly-4 unique-slots check. Round Robin is genuinely still 4, so the logic is correct; the "speiler Wolf" wording is just outdated since Wolf no longer uses that exact-4 check.

### Adversarial sweep results (negative — clean)

- Broad grep for `=== 4 / % 4 / slice(0,4) / "fire" / 2x / 2v2` in app/+lib touching Wolf: only the comments above; no live logic hardcodes 4.
- `WolfView.tsx` / `WolfPodium.tsx`: no hardcoded-4 (iterate generically) — `NO_HARDCODED_4_IN_VIEW_OR_PODIUM`.
- e2e: `NO_WOLF_4_IN_E2E`.
- n=3 edge case (R=18, trailing never runs): handled — rotation guard covers all 18 holes, no empty array.
- No assumption of exactly 4 partner buttons / 4 leaderboard rows / 4 podium slots found.

---

## Recommendation

**ACCEPT.** The implementation is correct, type-safe, builds for Vercel, and is backed by genuine (non-vacuous) tests that lock the n=3/n=4/n=5 economy and rotation. The four stale-comment items are LOW severity and out of the change's behavioral scope; they can be swept in a follow-up `docs(...)` commit but should not block merge.
