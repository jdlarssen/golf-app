# Skeptical evaluation — #485 dedikert klubb-styringsflate

## Verdict: ACCEPT

Independent fresh-eyes verification of the 4-commit re-mounting work on `claude/vibrant-euclid-be91af`. All success criteria verified by reading code + grep; all gates re-run and pass. One genuinely-narrow non-blocking edge case found (broken `/klubber/null/...` URL only reachable by a global admin hand-typing a club URL for a *standalone* league — no UI path produces it, no security/data impact). RLS/auth from #483 confirmed untouched.

---

## Per-criterion

### ✓ Delt `<LigaManagement>` finnes; begge ruter rendrer den; ingen duplisering
- `app/admin/liga/[id]/LigaManagement.tsx` exists, exports `async function LigaManagement({ leagueId, userId, variant })` (line 73). Owns ALL fetching (`getLigaSnapshot` + `getNewGameFormData` + club members/friends + club name), `notFound()` on null snapshot (line 87).
- Imported by both consumers:
  - `app/admin/liga/[id]/page.tsx:3` (`./LigaManagement`)
  - `app/klubber/[id]/liga/[ligaId]/page.tsx:3` (`@/app/admin/liga/[id]/LigaManagement`)
- grep for management JSX strings (`Sesong-modell`, `Legg til deltakere`, `Se sesong-tabellen`) returns hits **only** in `LigaManagement.tsx` (lines 147/174/249). The lone `CreateLigaForm.tsx:308/311` "Sesong-modell" hit is the create-wizard label, not the management body — correctly noted in self-eval. No duplicated management markup anywhere.

### ✓ Ny rute `/klubber/[id]/liga/[ligaId]` gatet, variant="club", AppShell, backHref → /klubber/[id]
- `app/klubber/[id]/liga/[ligaId]/page.tsx`: `force-dynamic`; reads `ligaId` (line 20); gates `requireAdminOrClubAdminOfLeague(supabase, ligaId)` (line 22); renders `<LigaManagement leagueId={ligaId} userId={userId} variant="club" />` (line 23). Gates on the league, not the club param — correct.
- Registered in build output as `ƒ /klubber/[id]/liga/[ligaId]`.
- backHref: `LigaManagement.tsx:127` `backHref = groupId ? \`/klubber/${groupId}\` : '/admin/liga'` → for a club league `groupId` is set, so `/klubber/[id]`. ✓

### ✓ Klubb-admin (is_admin=false) uten admin-chrome
- Shell ternary `LigaManagement.tsx:126`: `const Shell = variant === 'admin' ? AdminShell : AppShell;` → club → `AppShell`. No `AdminShell` rendered for the club route. Both shells imported (lines 3-4), only one used per variant.
- Live auth'd preview correctly NOT attempted: `proxy.ts` 500s every route locally (no Supabase env). Verified by code-reading per environment constraint. Live UI to be checked on Vercel PR-preview.

### ✓ Delt `<LigaDeleteConfirm>`; begge slett-ruter; club AppShell + redirect
- `app/admin/liga/[id]/slett/LigaDeleteConfirm.tsx` exists; exports `async function LigaDeleteConfirm({ leagueId, variant, errorCode })` (line 41); selects `group_id` in league query (line 55); `notFound()` on null (line 67); `ERROR_MESSAGES`/`STATUS_WARNINGS` moved into the component (lines 26-37).
- Both delete routes render it:
  - `app/admin/liga/[id]/slett/page.tsx:31` variant="admin"
  - `app/klubber/[id]/liga/[ligaId]/slett/page.tsx:33` variant="club"
- Club delete route gated (`requireAdminOrClubAdminOfLeague`, line 31), `force-dynamic`, registered in build as `ƒ /klubber/[id]/liga/[ligaId]/slett`.
- Shell ternary `LigaDeleteConfirm.tsx:97` → club → `AppShell`. backHref/Avbjt (lines 98-101) club → `/klubber/${league.group_id}/liga/${leagueId}`.
- `deleteLeague` (lib/league/actions.ts:425) redirects club-league deletion to `/klubber/${groupId}` — unchanged from #483. ✓
- Delete JSX strings (`Slett ligaen for alltid`, `Slettes permanent`) live only in `LigaDeleteConfirm.tsx` (lines 175/136); the other "Slettes permanent" grep hits are unrelated cup/courses/games slett pages.

### ✓ «Styr»-lenke → /klubber/[clubId]/liga/[ligaId]
- `app/klubber/[id]/ClubLeaguesSection.tsx:59` changed `href={\`/admin/liga/${liga.id}\`}` → `href={\`/klubber/${clubId}/liga/${liga.id}\`}` (confirmed via diff).
- Type-C test `ClubLeaguesSection.test.tsx` updated: now asserts `manage[0]` has href `/klubber/c1/liga/l1` (was `/admin/liga/l1`); test title updated to "#485". Passes (part of the 21 green).
- No hardcoded `/admin/liga` URLs remain in `app/klubber/` — only the 2 cross-route component imports + 1 doc-comment reference.

### ✓ Global admin uendret
- `/admin/liga/[id]/page.tsx:19` renders `variant="admin"` → `AdminShell`.
- `/admin/liga/page.tsx` (the list) — NOT in the diff (`git diff --stat` shows it untouched). ✓
- Global admin still reaches `/admin/liga/[id]` via the global list (unchanged).

### ✓ MINOR-bump 1.88.0 + CHANGELOG
- `package.json:3` = `"1.88.0"`.
- New `## 1.88.y — Klubb-liga · dedikert styringsflate` series open at top with `### [1.88.0] - 2026-06-07 · #485`, tagline blockquote + collapsible Teknisk (Added/Changed). Previous `1.87.y` correctly collapsed inside `## Tidligere versjoner` → `<details>` drawer "Klubb-liga (#480, #483) — 2 serier". Top-of-file `<details>` nesting balanced (verified lines 24-110).

---

## Gate results

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | ✓ PASS (exit 0, 0 errors) |
| Build | `npm run build` | ✓ PASS (Compiled successfully in 3.1s; both new routes registered as `ƒ` dynamic) |
| Tests | `npx vitest run app/klubber app/admin/liga lib/league` | ✓ PASS (3 files, 21/21) |
| Lint | `npx eslint` on 9 changed/new files | ✓ PASS (exit 0, 0 output) |
| Humanizer (pre-commit) | new Norwegian copy | ✓ N/A — all component strings are verbatim moves (removals from old page.tsx → additions in shared components); only new copy is CHANGELOG taglines (markdown, not scanned). Commits landed, so version-bump hook passed. |
| Live gate-probe | klubb-admin reaches own / rejected on others | ⏳ Deferred to Vercel preview (local proxy.ts 500s without env — confirmed env constraint, not a defect). Code path verified correct. |
| Preview smoke (Safari) | full club flow | ⏳ Deferred to Vercel preview, same reason. |

Build output confirms both routes registered:
```
ƒ /klubber/[id]/liga/[ligaId]
ƒ /klubber/[id]/liga/[ligaId]/slett
```

---

## lib/league/actions.ts — no unintended changes
`git diff origin/main...HEAD -- lib/league/actions.ts` shows **exactly one addition**: the `handleDeleteLeague` thin void wrapper (lines 434-436) moved next to `deleteLeague`. Nothing else touched. The old `app/admin/liga/[id]/slett/actions.ts` is deleted (diff shows full -8 removal); no dead reference to it remains (`grep` for `slett/actions` only hits the unrelated `games` slett actions). Gate (`requireAdminOrClubAdminOfLeague` in lib/admin/auth.ts:156) is the #483 implementation, unchanged.

---

## Concerns / gaps

### 1. [NON-BLOCKING, narrow edge] Broken `/klubber/null/...` URL for a global admin on a *standalone* league via club route
- **Where:** `LigaManagement.tsx:128-131` (`deleteHref`) and `LigaDeleteConfirm.tsx:98-101` (`backHref`) interpolate `groupId`/`league.group_id` unconditionally for `variant === 'club'`.
- **Trigger:** A *global admin* hand-types `/klubber/<x>/liga/<standalone-league-id>` (group_id null). The gate (`requireAdminOrClubAdminOfLeague`) resolves group_id null → `requireAdmin`, which lets a global admin through (no redirect). The component then renders variant="club" with `groupId=null`, producing `deleteHref = /klubber/null/liga/<id>/slett` and (in the delete page) `backHref = /klubber/null/liga/<id>`.
- **Why non-blocking:**
  - No UI path produces this. The "Styr" link only renders for leagues filtered `group_id = clubId` (club-scoped), so it never points at a standalone league. The contract (Edge Cases) confirms standalone-via-club-route is an expected redirect for non-globals.
  - A **non-global** club-admin hitting this is redirected by `requireAdmin` → never sees the broken URL.
  - It only mis-renders an href (dead link). No security or data impact: `deleteLeague`/RLS key on `league_id`, not the URL; the page still renders and the destructive action still works against the right league.
  - The `backHref` for the *admin* variant already guards this (`groupId ? ... : '/admin/liga'`); only the `club`-variant hrefs assume non-null `groupId`.
- The contract acknowledged the standalone-via-club case but did not explicitly note the global-admin-with-null-groupId broken-href sub-case. A one-line guard (e.g. fall back to `/admin/liga/...` when `groupId` is null even in club variant) would close it, but it is below the bar for blocking given it is unreachable through the product.

### 2. [INFORMATIONAL] Whole-file CHANGELOG `<details>` tag imbalance is pre-existing
- `grep -oE "<details>|</details>"`: branch = 366 open / 353 close (Δ13); origin/main = 364 open / 351 close (Δ13). The delta is **identical** — this PR added exactly 2 balanced open+close pairs (new 1.88 Teknisk + re-wrapped 1.87 drawer). The global imbalance predates #485 and is unrelated. Not introduced here; the visible new/re-wrapped structure (lines 24-110) is correctly nested. Worth a future cleanup issue against the CHANGELOG, but out of scope for #485.

### 3. [NOTED, intentional] Admin-variant backHref is club-aware, deviating from the contract table
- Contract table (line 38) says admin backHref = `/admin/liga`; implementation uses `groupId ? /klubber/${groupId} : /admin/liga` (LigaManagement.tsx:127). This is the documented "Avvik / merknad" in the self-eval and falls under "Claude's Discretion" — it preserves the #483 safety net for a club-admin who lands on the old `/admin/liga/[id]` URL. Reasonable and intentional, not a defect.

No blocking issues. Work matches the contract and the self-eval claims hold up under independent verification.
