# Evaluation — #480 Fase 1: klubb-scopet liga (group_id på leagues)

**VERDICT: ACCEPT**

Branch `claude/pedantic-dhawan-38ecf2`, base `9b3533f`, head `43dfdd7`. Evaluated 2026-06-07 by an
independent skeptical pass: all four gates re-run, every Success Criterion cross-checked against the
actual code, a live RLS probe run as simulated club-owner / regular-member / non-member inside an
aborted transaction, the migration's prod state verified against the migration file, and a tamper
probe applied to the Type-C test (then cleanly reverted — working tree confirmed clean).

---

## Per-criterion table

| # | Success Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Migrasjon `0083` (group_id + scoped SELECT + admin/klubb-admin WRITE + `league_group_id()`) applyt; `database.types.ts` har `leagues.group_id` | **PASS** | `list_migrations` → `20260607092646 leagues_group_scoping` present in prod. Prod `pg_policy` dump matches the migration file byte-for-intent (see Gates/RLS). `database.types.ts`: `leagues.group_id: string \| null` in Row(1335)/Insert(1356)/Update(1377) + `leagues_group_id_fkey` relation(1407). Migration file `supabase/migrations/0083_leagues_group_scoping.sql` matches the contract design §1. |
| 2 | Klubb-eier/admin oppretter klubb-liga fra `/klubber/[id]`; ligaen får `group_id = klubben` | **PASS** | Route `/klubber/[id]/liga/ny` present in build route tree. `app/klubber/[id]/liga/ny/page.tsx:28` gates via `requireAdminOrClubAdmin`; passes `groupId={id}` to `CreateLigaForm`. `lib/league/actions.ts:127` inserts `group_id: groupId`. Live RLS probe **A**: club-owner (`is_admin=false`) INSERT of a `group_id`-scoped league succeeded. |
| 3 | Pickeren viser KUN klubbens medlemmer (ikke venner) | **PASS** | `page.tsx:34-37` feeds `getClubMemberOptionsForClub(id)` (not `getFriendPlayerOptions`) into `players`. `lib/clubs/getClubMemberOptionsForClub.ts` sources `group_members` for the exact `clubId` via admin-client, e-post-free (selects only id/name/nickname/hcp_index/profile_completed_at/gender/level — no email). Form copy switches to «medlemmer» (`CreateLigaForm.tsx:108`). |
| 4 | Medlemmer ser «Klubbens ligaer»; «Ny liga» kun for eier/admin | **PASS** | `ClubLeaguesSection.tsx` renders list + gates button on `canCreate`. `app/klubber/[id]/page.tsx:272-276` passes `canCreate={isAdmin && !frozen}`. Type-C test (3 cases) green AND proven non-tautological by tamper probe (see Concerns §Tamper). |
| 5 | RLS: medlem SELECT-er, ikke-medlem ikke; klubb-admin INSERT-er, vanlig medlem avvises; frittstående uendret | **PASS** | Live probe (rollback tx): **C** non-member SELECT=0; **D** member SELECT=1; **E** member INSERT league = DENIED(42501); **F** member INSERT league_players = DENIED; **G** club-admin INSERT league_players = OK (child write via SECURITY DEFINER, no recursion); **H** club-admin INSERT standalone(group_id null) = DENIED. SELECT policy `(group_id IS NULL OR is_admin() OR is_group_member(group_id))` keeps standalone visible. |
| 6 | Ikke-medlem på `/liga/[id]` får `notFound()`; medlem/admin ser den | **PASS (w/ noted widening)** | `app/liga/[id]/page.tsx:132-154`: when `league.group_id` set, `allowed` = participant OR member OR global-admin; else `notFound()`. Snapshot uses admin-client (RLS-bypass), so this app-layer gate is the real shield. NOTE: the gate also admits **participants who aren't members** — a deliberate widening vs the contract's literal «ikke-medlem → notFound()». Justified + benign (see Concerns §Gate-widening). |
| 7 | `requireAdminOrClubAdmin` gater opprett-ruten (medlem→redirect, admin/klubb-admin→inn) | **PASS** | `lib/admin/auth.ts:124-138`: global admin passes; else reads own `group_members.role`, allows `owner`/`admin`, else `redirect(/klubber/${clubId})`. Mirrors `requireAdminOrCreator`. Reads the caller's own membership row via request-scoped client (RLS-safe). |
| 8 | Flyt-diagram oppdatert; MINOR-bump `1.86.0` + CHANGELOG-serie | **PASS** | `docs/flows/06-liga-fremtid.svg` contains «NY · klubb-liga #480» branch (6 klubb-refs); PNG regenerated (diffstat: 485331→523916 bytes). `package.json` = `1.86.0`. CHANGELOG has `## 1.86.y — Klubb-liga` theme + `[1.86.0]` tagline + Teknisk details; prior `1.85.y` series collapsed under `<details>`. |

---

## Gates (exact results I ran)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** — `TSC_EXIT=0`, no output. |
| `npx vitest run "app/klubber/[id]/ClubLeaguesSection.test.tsx" lib/league` | **PASS** — `Test Files 3 passed (3)`, `Tests 20 passed (20)`. |
| `npm run lint` | **PASS** — `✖ 24 problems (0 errors, 24 warnings)`. All 24 warnings are pre-existing `_gameId`/`_gameStatus`/`Button`/`userId` unused-vars in leaderboard views + statistikk/page — **none in the #480 files**. |
| `npm run build` | **PASS** — `Compiled successfully`; route tree includes both `ƒ /klubber/[id]/liga/ny` and `ƒ /liga/[id]`. |

### RLS — prod policy state vs migration file

`pg_policy` dump on `leagues`/`league_rounds`/`league_players` (prod) exactly matches the migration:
- `leagues select scoped` SELECT: `(group_id IS NULL OR is_admin() OR is_group_member(group_id))` — standalone stays public, no regression.
- `leagues admin or club-admin write` ALL using+check: `(is_admin() OR (group_id IS NOT NULL AND is_group_admin(group_id)))` — standalone stays admin-only.
- `league_rounds`/`league_players admin or club-admin write` ALL: `(is_admin() OR (league_group_id(league_id) IS NOT NULL AND is_group_admin(league_group_id(league_id))))` — child writes route through SECURITY DEFINER `league_group_id()`, avoiding RLS recursion. SELECT on both children remains `using(true)` (unchanged — lesing via admin-client snapshot; deliberate per Design §1).

### RLS — independent live probe (begin … abort, fully rolled back)

Fixtures confirmed: owner `6a351800` = `owner` of `e41770a7` (is_admin=false); `8ed0ce8b` = non-member
of `e41770a7` (is_admin=false), temporarily inserted as a `member` inside the tx for the member cases.
Probe used `set local role authenticated` + `set_config('request.jwt.claims', {sub}, true)`.

```
A.owner_INSERT_club=OK
B.owner_SELECT=1(exp1)
C.nonmember_SELECT=0(exp0)
D.member_SELECT=1(exp1)
E.member_INSERT_league=DENIED(ok)
F.member_INSERT_players=DENIED(ok)
G.owner_INSERT_players=OK
H.owner_INSERT_standalone=DENIED(ok)
```

Post-probe cleanup check: `probe_leagues_left=0`, `temp_member_left=0`. Nothing committed.

### Security advisors

`get_advisors(security)`: new `league_group_id` appears only in the `anon_/authenticated_security_definer_function_executable` WARN classes — **the identical class that every pre-existing RLS helper** (`is_admin`, `is_group_member`, `is_group_admin`, `same_flight`, …) already populates. No new finding class, no ERROR-level finding on the three touched tables. Self-eval claim verified.

---

## Concerns / gaps

All minor; none block ACCEPT.

- **Gate-widening on `/liga/[id]` (criterion 6).** The member-gate admits anyone in `participants` even if
  they are not a `group_members` row of the club. The contract's literal wording was «ikke-medlem →
  notFound()», but the self-eval explicitly states «medlem/deltaker/global admin», so this is a documented,
  intentional widening — and it is the *correct* behavior: a person an admin added to the league roster
  must be able to view the league they're in even if they later left/never joined the club. With the
  member-source picker + server-side member-filter in `createLeagueDraft`, the only way a non-member lands
  in `participants` is a global-admin acting deliberately, so the surface is benign. Flagging for the record,
  not as a defect.

- **`standalone_leagues_total = 0` in prod.** The "existing standalone leagues stay visible (no regression)"
  case is currently *data-vacuous* — there are zero `group_id IS NULL` leagues in prod right now. Regression
  safety rests on policy logic (`group_id IS NULL OR …`), which is verified correct, plus probe **H** which
  confirms the standalone WRITE path is still admin-only. No live standalone SELECT row exists to demonstrate
  visibility, but the policy makes it unconditional. Acceptable.

- **Over-fetch (cosmetic).** `app/klubber/[id]/page.tsx:74-78` selects `season_start, season_end` for
  `clubLeagues`, but `ClubLeagueRow` / `ClubLeaguesSection` only consume `id, name, status`. Harmless dead
  columns; not worth a change.

- **`createLeagueDraft` redirect target.** On success the club-liga path redirects to `/admin/liga/${id}`
  (line 178), same as the standalone path. That is an admin-only route, so a *non-global-admin* club-admin
  who just created a league will hit `requireAdmin` and be redirected to `/` (or `/admin` if trusted). This
  is consistent with the contract's explicit Out-of-Scope note that `/admin/liga/[id]` management stays
  global-admin-only this phase — the club-admin's created league is still visible to them via «Klubbens
  ligaer» → `/liga/[id]`. Worth being aware of as a slightly rough post-create UX, but it is within the
  declared scope boundary, not a contract violation.

- **Type-C tamper probe (positive finding).** Forcing the button to always render (`{canCreate && …}` →
  `{true && …}`) made `ClubLeaguesSection.test.tsx:37` go red (`expect(queryByRole('link',{name:'Ny liga'})).toBeNull()`).
  Reverted cleanly; `git status --short` empty afterward; test back to 3/3 green. The gating assertion is
  real, not tautological.

- **UI not exercised live.** Per the single-Supabase-prod setup, no logged-in browser/Playwright session was
  run. UI criteria (4, 6) were verified via the Type-C render test, the build route manifest, and direct
  component reads — explicitly NOT via a live UI click-through. Stated here per the task's honesty requirement.

## Deviations from contract (as declared by implementer, verified accurate)

1. `/admin/liga/[id]` management of club-leagues stays global-admin-only this phase — confirmed in code
   (`updateLeagueRound`/`addLeagueRound`/`addLeaguePlayers`/etc. all still `requireAdmin`). Matches Out of Scope.
2. Child-table SELECT (`league_rounds`/`league_players`) stays `using(true)`; only WRITE tightened. Confirmed
   in prod policy dump. Matches Design §1.

Both are accurate and intentional.
