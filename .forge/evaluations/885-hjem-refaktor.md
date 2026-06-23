# Evaluation: #885 — Hjem-refaktor

## Verdict: ACCEPT

Pure, behaviour-preserving refactor. All gates green, all 7 criteria verified
independently against the actual code, and the class-set/DOM-structure review
confirms pixel identity for all three row cards. No behaviour change found —
including the one dropped runtime filter, which is provably dead under the
`!inner` join.

## Gates

| Gate | Command | Result |
|------|---------|--------|
| Types | `npx tsc --noEmit` | **Clean, exit 0** |
| Lint | `npx eslint` on the 5 changed code files | **0 errors, 1 warning** — only the pre-existing `HomeBody complexity 26` (see below). `eslint` script has no `--max-warnings`, so it does not fail. |
| Tests | `npx vitest run components/games/FinishedGameCard.test.tsx "app/[locale]/HomeDiscoverySection.test.tsx"` | **2 files / 4 tests passed** |

**Complexity warning is pre-existing, not introduced.** Stash-test: replacing
the working `page.tsx` with `origin/main:app/[locale]/page.tsx` and linting it
reproduces `Async function 'HomeBody' has a complexity of 26. Maximum allowed is
25` (at line 109 on main; line 133 now after the module-level `activeGamesQuery`
+ `GameRow` were lifted above `HomeBody`). The refactor did not add it.

## Criteria

### C1 — Shared primitive exists and all three consumers use it — PASS
- `components/games/GameRowCard.tsx:21` exports `GameRowCard`; `:72` exports `GameRowMetaLine`. The primitive hardcodes the link frame (`block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40`), the Card (`min-h-[44px] transition-colors p-5` + `border-accent`/`hover:border-primary/30`), the outer `flex items-start justify-between gap-3`, the `min-w-0 flex-1` title column, the serif title span, and renders `trailing` as a **direct, unwrapped sibling**.
- `renderGameCard` (`app/[locale]/page.tsx:317`) → `<GameRowCard>`. No inline Card/SmartLink left.
- `renderActiveGameCard` (`page.tsx:371`) → `<GameRowCard highlighted=…>`. No inline Card/SmartLink left.
- `FinishedGameCard.tsx:35` → `<GameRowCard>`. `SmartLink`/`Card` imports removed (replaced by `GameRowCard`/`GameRowMetaLine`).
- `grep` for `<Card` / `p-5` in the three returns finds nothing outside the primitive — no leftover inline row markup.

### C2 — List semantics — PASS
`page.tsx:577` renders `<ul className="list-none p-0 space-y-3">` and maps
`Children.toArray(children)` to one `<li key=…>{child}</li>` each. `Children.toArray`
drops falsy children (e.g. a `cond && <…>` that is false), so no empty `<li>` is
emitted. `list-none p-0` + Preflight-zeroed `ul` margin keeps it visually
identical to the old `<div className="space-y-3">`. Key uses the child's own key
when it is a valid element, else the index.

### C3 — Dead branch removed — PASS
`StatusPill` prop is now `status: Exclude<GameStatus, 'finished'>` (`page.tsx:590`).
The `bg-border/40 text-muted border-border` else-branch is gone. The three
reachable states keep their exact original classes, verified against
`origin/main`:
- `active` → `bg-primary-soft text-primary border-primary/20` (unchanged)
- `scheduled` → `bg-primary-soft text-primary border-primary/20` (unchanged, #884 comment retained)
- `draft` → `bg-warning/10 text-warning border-warning/30` (unchanged)

`GameStatus` (`lib/games/status.ts:13`) is `'draft' | 'scheduled' | 'active' | 'finished'`, so `Exclude<…,'finished'>` is exactly the three reachable states. (`ActiveStateLabel` is a separate chip and was not in scope — left untouched.)

### C4 — Tee-off dedup — PASS
- `formatTeeOffParts(date, locale)` exists at `lib/i18n/format.ts:142`, a thin composition of `formatTeeOffDateLocale` + `formatTeeOffTimeLocale` returning `{ date, time }`. Logic identical to the two calls it replaces.
- `grep "(() =>" app/[locale]/page.tsx` → **no match**: the inline tee-off IIFE is gone. The render now computes `teeParts = teeOff ? formatTeeOffParts(teeOff, locale) : null` up front (`page.tsx:307`) and consumes `teeParts.date` / `teeParts.time`.
- No leftover direct `formatTeeOffDateLocale`/`formatTeeOffTimeLocale` calls in `page.tsx` (both removed from imports).
- `HomeDiscoverySection.formatTeeOffLine` (`HomeDiscoverySection.tsx:151`) now uses `const { date, time } = formatTeeOffParts(teeOff, locale)`.

### C5 — `GameRow` module-level + derived — PASS
`page.tsx:131` `type GameRow = QueryData<ReturnType<typeof activeGamesQuery>>[number];`
is at module level, derived from the `activeGamesQuery` thunk's select string
(the single source of truth). `.returns<GameRow[]>()` is gone; the call site is
just `activeGamesQuery(supabase, userId!)`. The select string is unchanged from
the old inline query (byte-for-byte same columns + `games!inner(...)`).

### C6 — Pixel identity (class-set + DOM-structure review) — PASS

Class SET per element compared OLD (`origin/main`) vs NEW (primitive's hardcoded
classes ∪ each consumer's props). Tailwind is order-independent, so order diffs
are acceptable; sets must match.

**«Mine spill» (renderGameCard)**
- Link: OLD `block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40` = NEW (primitive hardcodes exactly this; `linkClassName` undefined here). ✓
- Card: OLD `min-h-[44px] transition-colors p-5 hover:border-primary/30` = NEW `min-h-[44px] transition-colors p-5` + `hover:border-primary/30` (highlighted=false). ✓
- Title span `block font-serif text-lg font-medium tracking-tight text-text truncate` (from primitive). ✓
- Course meta `block text-xs text-muted mt-1 truncate` via `GameRowMetaLine`. ✓
- Proximity span kept **inline verbatim** (`block text-xs font-medium text-text mt-1 truncate`) — not routed through the helper, so byte-identical. ✓
- Tee-off line `block text-xs text-muted mt-1 truncate tabular-nums` via `GameRowMetaLine tabular` (order: OLD had `…mt-1 tabular-nums truncate`; same set). ✓
- teamFlight meta `block text-xs text-muted mt-1 truncate`. ✓
- Trailing `<div className="flex items-center gap-3 shrink-0">` with `StatusPill` + `→` — identical, now passed as `trailing`. ✓

**«Pågår nå» (renderActiveGameCard)**
- Card: OLD `min-h-[44px] transition-colors p-5 ${continue ? 'border-accent' : 'hover:border-primary/30'}` = NEW `highlighted={state==='continue'}` → primitive yields `border-accent` vs `hover:border-primary/30`. ✓ #878 gold continue-frame preserved.
- Outer `<div key={g.id} className="space-y-2">` wrapper **retained** around the card.
- `ActiveStateLabel` + `→` passed as `trailing` (unchanged classes).
- Peer-approval nudge (`extras.pendingApprovalsForMe > 0 && <SmartLink …>`) **retained as a SIBLING** under the card inside the `space-y-2` wrapper — unchanged markup and classes. ✓

**FinishedGameCard**
- Card: OLD `min-h-[44px] hover:border-primary/30 transition-colors p-5` = NEW `min-h-[44px] transition-colors p-5 hover:border-primary/30` — same set, order normalized (Tailwind order-independent). ✓
- Mode/course meta line `block text-xs text-muted mt-1 truncate` (the `[…].filter(Boolean).join(' · ')` content is byte-identical). ✓
- `ended_at` line via `GameRowMetaLine tabular` → `…tabular-nums…` (same set). ✓
- Trailing badge span `shrink-0 max-w-[45%] text-right text-sm font-medium leading-snug` + `text-accent`/`text-muted`, or the `🏆` `text-accent shrink-0` span — **byte-identical**, passed as `trailing` (a direct, unwrapped sibling), so the badge keeps `items-start` alignment from the flex row. ✓

**DOM structure** identical across all three: `SmartLink > Card > div.flex.items-start > (div.min-w-0.flex-1 > title span + meta) + trailing`. `trailing` is never wrapped by the primitive.

### C7 — No bump, no new copy — PASS
- `git diff origin/main...HEAD --name-only` = exactly the 6 contract files; **no** `package.json`, `package-lock.json`, `CHANGELOG.md`, or `messages/` touched.
- `git log --format='%s' origin/main..HEAD` → all 5 commits prefixed `refactor(home)`.
- No new i18n keys: all message keys used (`teeOffSeparator`, `proximity.*`, `teamFlight`, `teeOffLine`) pre-exist; the refactor only re-routes existing strings.

## Behaviour-change audit

Checked for dropped filters, changed conditions, changed hrefs, lost keys, and
altered render conditions. Findings:

1. **Dropped `.filter(row => row.games != null)` in `activeGames` — VERIFIED SAFE (not a behaviour change).** The OLD mapping ran `.filter((row) => row.games != null).map(...)`. The NEW mapping drops the filter and maps directly. This is provably dead: the query uses `games!inner(...)` (inner join), so PostgREST excludes rows with a null embedded `games` server-side. I confirmed the `QueryData`-derived `GameRow["games"]` is **non-nullable** by injecting `type _A = GameRow["games"] extends null ? "NULLABLE" : "NONNULL"; const _proof: _A = "NONNULL"` into `page.tsx` and running full-project `tsc` — it compiled clean (would have errored if nullable). The old filter could never have removed a row; removing it changes nothing at runtime.

2. **`game_mode`, `status`, `teamNumber`, `flightNumber` casts** — the new mapping casts `game_mode` to `GameMode`, `status` to `Exclude<GameStatus,'finished'>`, and `team_number`/`flight_number` to `number`. These are type-level narrowings at the data boundary; they don't change runtime values. The old hand-typed `GameRow` already asserted `game_mode: GameMode`, `status: 'draft'|…|'finished'`, and non-null `teamNumber`/`flightNumber`. Same runtime assumptions, now made honest against the generated types.

3. **hrefs unchanged** — `/games/${g.id}` (Mine spill), `extras.href` (Pågår nå), `/games/${game.id}/leaderboard` (FinishedGameCard), `/games/${g.id}/approve` (nudge). All identical to OLD.

4. **keys preserved** — `key={g.id}` flows through `GameRowCard`'s `SmartLink`; the `space-y-2` wrapper `<div>` for the active card still carries `key={g.id}`; `Children.toArray` `<li>` keys derive from the child's own key. No lost or duplicated keys.

5. **Tee-off / proximity rendering condition** — OLD rendered the tee-off block under `g.scheduled_tee_off_at && (…)`; NEW computes `teeParts = teeOff ? formatTeeOffParts(...) : null` and renders under `teeParts && (…)`. `teeOff` is `g.scheduled_tee_off_at ? new Date(...) : null`, so the gate is logically equivalent. Proximity span and tee-off line render under the same conditions and produce the same strings (`formatTeeOffParts` is a literal composition of the two prior helper calls).

6. **`StatusPill`/`ActiveStateLabel` outputs** — reachable status classes unchanged; `ActiveStateLabel` untouched.

No behaviour change found.

## Issues

None. (ACCEPT.)

### Note (non-blocking, not an issue)
The working tree has an **uncommitted** edit to `.forge/contracts/885-hjem-refaktor.md`
flipping the `[ ]` success-criteria checkboxes to `[x]` and adding evidence
lines. This is the builder's self-tracking annotation on the contract markdown —
not code, not in scope of the behaviour evaluation. The committed contract (in
`d7ccea51`) still has the original `[ ]` boxes. Worth committing alongside the
work for a tidy history, but it has zero effect on the verdict.
