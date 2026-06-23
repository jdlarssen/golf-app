# Evaluation: Spiller-Klubbhuset — adaptivt rom (#892)

VERDICT: ACCEPT

Evaluated independently against `.forge/contracts/892-player-klubbhuset-adaptive-room.md`
on branch `claude/angry-dirac-bc7dc7`. All gates re-run with Node 22; criteria verified by
reading the actual code, not trusting the contract checkboxes.

## Gate results

| Gate | Result | Key output |
|------|--------|-----------|
| `npx tsc --noEmit` | **PASS** | exit 0, no diagnostics |
| `npx vitest run "app/[locale]/admin/PlayerKlubbhus.test"` | **PASS** | 1 file, 4 tests passed |
| `npm run build` | **PASS** | exit 0, full route map prerendered |
| `npm run lint` | **PASS** | ✖ 50 problems (0 errors, 50 warnings) — all 50 are pre-existing complexity warnings (sendCode, GameWizard, useGameFormState, HolePage, …); **zero new warnings/errors in any touched file** |
| `npx vitest run messages/catalogParity.test.ts` | **PASS** | 2 tests passed — no/en locale key parity holds |

## Per-criterion verification

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| K1 | Joiner room: invitation + cup link + no-club line + tools, no empty list | **VERIFIED** | `PlayerKlubbhusViews.tsx:145-165` renders the `player-invite-primary`→`/opprett-spill` LinkButton + `player-invite-cup`→`/opprett-spill?intent=cup` when `games.length===0`; `ClubsView` empty branch (`:207-219`) renders `player-no-club`→`/klubber`; `ToolsView` always shown. Test K1 (`PlayerKlubbhus.test.tsx:29-67`) asserts all hrefs + absence of list/cup/see-all/new-round. |
| K2 | Club member sees clubs as inline rows → `/klubber/[id]` | **VERIFIED** | `ClubsView` (`:221-251`) maps clubs to `player-club-row`→`/klubber/${club.id}`. Test K2 (`:69-79`) asserts 2 rows → `/klubber/club-1`, `/klubber/club-2`, and absence of `player-no-club`. |
| K3 | Arranger: capped list (≤4) + «Se alle» + quiet «+ Ny runde» + cup row, no hero | **VERIFIED** | `MAX_ARRANGED=4` (`PlayerKlubbhus.tsx:23`); fetcher fetches limit+1 and computes `hasMore` (`:77,87`). View (`:88-143`) renders `player-arranged-game`→`/games/${id}`, `player-new-round`→`/opprett-spill`, `player-see-all`→`/klubbhuset`; cup row `player-cup-row`→`/admin/cup` when `cupCount>0` (`:167-184`). Test K3 (`:81-99`) asserts all + absence of `player-invite-primary`. |
| K4 | Streaming: greeting+tools immediate, arrangement+clubs each behind own Suspense; request-scoped client; no surplus admin/name query | **VERIFIED** | `grep getAdminClient\|users.select\|getAdminContext` in both player files = **empty**. Exactly **2 `<Suspense`** in `PlayerKlubbhus.tsx` (`:51,55`), wrapping ArrangementSection + ClubsSection; `GreetingView` + `ToolsView` rendered OUTSIDE them (`:49,59`). Both fetchers use `getServerClient()` (request-scoped, `:65,101`). Greeting name comes from already-loaded `role.name`, no fresh users round-trip. Player files import nothing from `_dashboardContext`. |
| K5 | ClubStamp + pull-quote gone from player view | **VERIFIED** | `grep ClubStamp\|PullQuote` in player files returns only the JSDoc comment at `PlayerKlubbhusViews.tsx:41` stating they were dropped — **no JSX usage**. (They remain in the admin `page.tsx`, which is correct — that's the admin Sekretariat view, out of scope for K5.) |
| K6 | `?intent=cup` → cup setup; `?klubb=` still pre-selects club intent; explicit intent wins | **VERIFIED** | `opprett-spill/page.tsx:79-80`: `parseIntent(first(sp.intent)) ?? (first(sp.klubb) ? 'klubb' : undefined)` → `initialIntent` → passed to `GameWizard` (`:222`) → `useGameFormState({ initialIntent })` (`GameWizard.tsx:198`) → `useState<Intent>(initialIntent)` (`useGameFormState.ts:295`). `??` gives explicit `?intent=` precedence over `?klubb=`; `parseIntent` only accepts valid Intent values. |
| K7 | Flow-map + version bump | **VERIFIED** | `package.json` = `1.141.0`; `CHANGELOG.md:24` `### [1.141.0] - 2026-06-24 · #892`; `docs/user-flows.md` diff updates §0-mermaid PlayerKlub node, the nav paragraph, and §A4 to describe the adaptive room. |

## Cross-checks (problems the contract didn't anticipate)

- **Locale parity** — both `messages/no.json` and `messages/en.json` add the same 9 `player*` keys and remove the same 4 stale ones (`playerSpill`, `playerSpillMeta`, `playerKlubber`, `playerKlubberMeta`, `playerPullQuote`). catalogParity test passes. **No regression.**
- **Removed-key references** — grep across `app/ lib/ components/` for each removed key returns clean (only `playerSpillformater*` survive, which were not removed). **No dangling references.**
- **TilesGrid refactor / dead imports** — `TileGridView`, `CompactTileGrid`, `Tile`, `TileBadge`, `TileIcon` extracted to `TilesView.tsx`. Both consumers (`TilesGrid.tsx:7`, `PlayerKlubbhusViews.tsx:7`) import from `./TilesView`. No file imports the moved exports from `./TilesGrid`. Admin dashboard tile grid (`TilesGrid.tsx`) still builds the core+more tiers and renders `TileGridView`/`CompactTileGrid` — **no admin-dashboard regression** (build passes, all routes prerendered).
- **Test copy discipline** — `PlayerKlubbhus.test.tsx` has **no** `getByText`/`queryByText`/`toHaveTextContent` on Norwegian copy. The two `getByRole('link', { name: /baner|spillformater/i })` queries assert on `href` and use a case-insensitive role accessible-name match on generic golf terms — this is the role-based path the contract explicitly permits ("data-testid/role/href"), not a copy lock. **Compliant.**
- **import paths** — `page.tsx:14` imports `PlayerKlubbhus` from `./PlayerKlubbhus` (new module); `firstName`, `getMyClubs`, `getServerClient`, `AdminRoleContext` all resolve (build exit 0).

## Issues found

**None.** All 5 gates pass, all 7 criteria verified against the actual code, no dead code,
no broken/stale imports, no copy-assertion violations, locale parity holds.
