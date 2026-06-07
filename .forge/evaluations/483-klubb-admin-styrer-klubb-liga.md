# VERDICT: ACCEPT

Skeptical evaluation of #483 — *klubb-admin styrer sin egen klubb-liga* (league-aware auth gate + full styring). Base `47655c5`, head `438da7d`. Every contract claim was independently re-verified; the live RLS boundary was re-probed from scratch (not trusting the self-eval). It checks out.

## Per-criterion table

| Criterion | Result | Evidence |
|---|---|---|
| `requireAdminOrClubAdminOfLeague` exists; null group_id → `requireAdmin`, set → `requireAdminOrClubAdmin` | PASS | `lib/admin/auth.ts:156-169`. Resolves `group_id` via `getAdminClient()` (RLS-independent), then delegates exactly as specified. |
| Uses admin client for the group_id lookup (authz ≠ caller's RLS visibility) | PASS | `lib/admin/auth.ts:160` `getAdminClient().from('leagues').select('group_id')`. Correct — authz decision doesn't depend on request-scoped RLS. |
| All 9 actions + setLeagueStatus + page + slett use the new gate; only bare `requireAdmin(supabase)` left is createLeagueDraft's standalone branch | PASS | `grep` confirms: updateLeagueRound:195, addLeagueRound:235, overrideRoundWindow:278, addLeaguePlayers:298, removeLeaguePlayer:350, setLeagueStatus:366, startLeague:381, deleteLeague:412 → all `requireAdminOrClubAdminOfLeague`. finishLeague delegates to setLeagueStatus. page.tsx:64 + slett/page.tsx:46 swapped. Only `requireAdmin(supabase)` is createLeagueDraft:64 (frittstående branch). No miss. |
| Club-admin (is_admin=false) can start/finish/manage OWN club-liga; not another club's / not frittstående | PASS | Live RLS probe (rolled back). Probe A: own-club UPDATE status→active → **1 row**. Probe B: other-club UPDATE → **0**. Probe C: frittstående UPDATE → **0**. Probe D: own-club DELETE → **1**. Fixture `6a351800…` confirmed `owner`/`is_admin=false`. |
| Regular member (non-admin) blocked from UPDATE (and DELETE) | PASS | Probe F: member `8ed0ce8b…` UPDATE own-club league → **0**. Probe G: DELETE → **0**. `is_group_admin` correctly requires owner/admin role. |
| Confused-deputy: RLS rejects manipulated round_id belonging to a different league | PASS | Probe E: club-admin UPDATEs a `league_rounds` row whose parent league is ANOTHER club → **0 rows**. 0083 child-table WRITE policy evaluates `league_group_id(league_id)` (SECURITY DEFINER) → contract claim holds. |
| Picker sources club members for club-liga | PASS | `app/admin/liga/[id]/page.tsx:80-89` — `getClubMemberOptionsForClub(groupId)` when group_id set, else `getFriendPlayerOptions(userId)`. `addLeaguePlayers` also server-filters to members (`actions.ts:310-326`). |
| Club-aware chrome (back-link to club page, club-name kicker) | PASS | `page.tsx:109` backHref `/klubber/${groupId}`; `:110` kicker = clubName (admin-client `groups.name` lookup); `:112` BrassRibbon `Klubb-liga · {status}`. Frittstående unchanged (`/admin/liga`, kicker `Klubbhuset`). |
| «Styr» link only for owner/admin → `/admin/liga/[ligaId]` | PASS | `ClubLeaguesSection.tsx:57-64` gated on `canManage`; `page.tsx:276` passes `canManage={isAdmin}`. Type-C test verified non-tautological (tamper probe below). |
| Frittstående league management unchanged | PASS | gate falls to `requireAdmin` when group_id null; createLeagueDraft frittstående branch untouched; deleteLeague frittstående redirect `/admin/liga?status=deleted` (`actions.ts:425`). |
| deleteLeague redirect (club-liga → `/klubber/[groupId]`) | PASS | `actions.ts:415-425` captures group_id before delete, redirects to `/klubber/${groupId}` else `/admin/liga`. |
| addLeaguePlayers member-filter | PASS | `actions.ts:310-326` — loads league.group_id, intersects posted ids with `group_members`. Mirrors createLeagueDraft guardrail. |
| Type-C test not tautological | PASS | Tamper: forced `{true &&}` in component → test `shows «Styr» link … (#483)` went RED ("Found multiple elements role link name Styr" on the canManage=false rerender). Reverted cleanly; `git diff` empty. |
| MINOR bump 1.87.0 + CHANGELOG new series, prior collapsed | PASS | `package.json` `1.87.0`; CHANGELOG `## 1.87.y` open, `1.86.y` wrapped in `<details>`. Tagline action-oriented norsk. |

## Gates

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | PASS — exit 0, no output |
| `npx vitest run "app/klubber/[id]/ClubLeaguesSection.test.tsx" lib/league` | PASS — 3 files, **21/21** tests |
| `npm run lint` | PASS — **0 errors**, 24 warnings (all pre-existing: unused `_gameId`/`Button`/`userId` in unrelated files) |
| `npm run build` | PASS — "✓ Compiled successfully in 3.1s"; route manifest includes `/admin/liga/[id]` + `/admin/liga/[id]/slett` |
| Humanizer (new norsk copy) | PASS — new strings ("Ingen andre medlemmer i klubben ennå.", "Alle klubbmedlemmene er allerede deltakere.", "Styr", "Klubb-liga") are idiomatic; no «X-spillet», «vennligst», em-dash chains. BrassRibbon "·" is a separator dot, not em-dash. |

## Live RLS+gate probe (full record, all rolled back)

Fixtures verified live: `6a351800-2598-479d-91e4-39e20eb15b6f` = `owner` of `e41770a7…`, `is_admin=false`; `8ed0ce8b-f938-4cb8-a309-4e08f8c79a6e` = plain `member` of `32806a13…`, `is_admin=false`. All probes run with `set local role authenticated` + JWT `sub` claim, seeded via privileged role inside the tx.

| Probe | Expected | Got |
|---|---|---|
| A — club-admin UPDATE own-club league (start) | allowed | **1** |
| B — club-admin UPDATE other-club league | blocked | **0** |
| C — club-admin UPDATE frittstående league | blocked | **0** |
| D — club-admin DELETE own-club league | allowed | **1** |
| E — club-admin UPDATE round of ANOTHER club's league (confused-deputy) | blocked | **0** |
| F — regular member UPDATE own-club league | blocked | **0** |
| G — regular member DELETE own-club league | blocked | **0** |

The RLS WRITE policies (migration 0083) are confirmed as the genuine security boundary independent of the app-gate: a non-global club-admin can mutate only leagues/rounds scoped to a club they admin, and the child-table policies evaluate each row's *actual* parent-league club via `league_group_id()` — so a manipulated `round_id` belonging to a foreign league is rejected (Probe E). The app-gate is UX-only, exactly as the contract argues.

## UI verification method (no live browser)

Per the task note, no logged-in prod browser session was available, so the live Safari/Playwright smoke test was NOT run. UI was instead verified via: (a) the Type-C render test (incl. a tamper probe proving it's load-bearing), (b) the build route manifest (`/admin/liga/[id]` present), and (c) direct reading of `page.tsx` / `ClubLeaguesSection.tsx` / `LigaAddPlayers.tsx` / `klubber/[id]/page.tsx`. I do **not** claim a live UI check.

## Concerns / gaps

- **MCP probe hygiene (process note, fully remediated):** The Supabase MCP `execute_sql` autocommits multi-statement calls that lack an explicit `BEGIN…ROLLBACK`. One intermediate negative-probe call (without explicit tx control) committed two inert seed rows (`PROBE other-club` status `draft`, `PROBE frittstående` status `draft`). They were RLS-locked, never user-visible (PROBE names, no real club flow surfaces them), and were **deleted immediately**; a final `select count(*) … = 0` confirms zero residue (leagues + rounds). All subsequent probes used explicit `BEGIN…ROLLBACK` and left no trace. No production data was modified. This is an evaluator tooling caveat, not a defect in #483.
- **`finishLeague` is the only action that gates indirectly** (via `setLeagueStatus`, which itself gates). Not a gap — both layers gate; just noting the indirection so a future reader doesn't read finishLeague as ungated.
- **`AdminShell` retained for club-admins** (admin chrome on a club-scoped page) is an accepted tradeoff per the contract's Prior Decisions; the dedicated `/klubber/[id]/liga/[ligaId]` flow is explicitly deferred as a follow-up. Not a defect.
- No regressions found: frittstående league path, createLeagueDraft authz, and the #463 accepted_at semantics are all untouched/intact.

**Bottom line:** The gate swap is complete and consistent, the new gate resolves group_id RLS-independently, the RLS boundary genuinely enforces club scoping (re-probed live, incl. the confused-deputy case), the Type-C test is load-bearing, and all four gates are green. ACCEPT.
