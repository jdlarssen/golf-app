# Evaluation: CupSetup — feil som action-resultat (#1397)

**Contract:** `.forge/contracts/1397-cupsetup-feil-som-action-resultat.md`
**Commits:** `f31c61f0` (fix) + `e795dac5` (cleanup), HEAD = `e795dac5`
**Evaluator:** fresh-context skeptic, 2026-08-07. All gates re-run independently (Node 22.23.0, fresh `npm install` — worktree's node_modules was empty on arrival).

## Success Criteria

### 1. `lib/cup/actions.ts` — return instead of redirect ✓
- `errBase` is gone from the entire repo (grep: zero hits).
- All 12 error branches in `createTournamentDraft` return `{ error: '<code>' }` (lines 146–165 validation, 199–201 insert failure). Codes unchanged.
- Only remaining `redirect()` inside `createTournamentDraft` is the success redirect (lines 206–210, both klubb and standalone branches intact). Auth gates (`requireAdminOrClubAdmin`/`getRoleContext`, lines 172–174) untouched.
- `export type CupActionError = { error: string }` exists (line 116); no league import anywhere in the file (grep: only a comment mentioning the deliberate non-import).
- Remaining `?error=` redirects in the file all belong to `startTournament`/`finishTournament`/`deleteTournament` and target detail/slett pages — explicitly out of scope.

### 2. Test suites green ✓
`npx vitest run lib/cup "app/[locale]/admin/games/new/CupSetup.test.tsx" messages`
→ **16 files, 239 tests, all passed** (2.0s). `catalogParity.test.ts` confirmed present and green in verbose output (en.json leaf keys === no.json leaf keys).

### 3. Build + lint ✓
- `npm run build` → completes successfully (full route table emitted).
- `npm run lint` → **0 errors**, 57 pre-existing warnings (complexity/max-depth in unrelated files).

### 4. Staging click-round — DEFERRED
Handled at PR stage by the orchestrator (staging-verified label before merge). Not evaluated here; not a failure.

### 5. Dead-code / key hygiene ✓
- Grep: zero remaining `?error=` producers targeting `/admin/games/new` or `/klubber/[id]/cup/ny` (also checked `emails=`: zero producers).
- Both page.tsx files: no residue of `errorMessage`/`errorParam`/`buildErrorMessage`/`error?:` SearchParams. `first` import kept in the wizard page and still used (4 call sites); `Banner` kept there for the cupContext info banner.
- JSON parse of both locales: `wizard.errors` contains **zero** `cup_*` keys (all 8 removed in both); `cup.create.errors.unexpected` present in both with `{code}` («Uventet feil: {code}» / “Unexpected error: {code}”).
- `pending_players`/`pending_players_generic` (which used `{list}` in the removed helper) are still consumed via ReadyStep's action-state lookup — no orphaned keys created.

## Trap-guards (contract-specific)

- **useActionState closure:** `CupSetup.tsx:48–52` wraps via client closure `async (_prev, formData) => createTournamentDraft(formData)`; server action signature stays `(formData)`. ✓
- **No NEXT_REDIRECT swallowing:** no try/catch in `CupSetup.tsx`; no try/catch inside `createTournamentDraft` (the file's try/catch blocks all live in the out-of-scope actions, lines 256+). ✓
- **`t.has`-guard + fallback:** `CupSetup.tsx:56–63` — mapped code → `cup.create.errors.<code>`, miss → `errors.unexpected` with `{code}`. Test asserts the mapped path renders the Norwegian message and NOT the fallback. Initial state `{ error: '' }` is falsy → no banner on first render. ✓
- **Type A assertions:** `lib/cup/actions.test.ts` — `it.each` over `cup_name`/`cup_team_dup`/`cup_win_points` asserts `{ error: code }`, **no tournaments insert** (`__fromCalls` inspection), **redirectMock never called**; insert-failure case asserts insert WAS issued and still no redirect; success case asserts a thrown `RedirectError` with URL `/admin/cup/T1?status=created`. ✓

## Skeptic pass

- **Scope:** both commits touch only files in the contract's "Files Likely Touched" list. `tests/serverActionMocks.ts` pre-exists (from an earlier i18n refactor commit), not introduced here.
- **Consumers:** `CupSetup.tsx` is the only importer of `createTournamentDraft`; nothing else breaks on the new return type (grep across app/, lib/, components/, e2e/).
- **Progressive enhancement:** `<form action={formAction}>` — React keeps the server-action reference in markup. ✓
- **Copy mirror:** Norwegian `unexpected` is character-identical to liga's («Uventet feil: {code}»). ✓
- **Version/CHANGELOG:** parent `36d8c014` = 1.218.6 → `f31c61f0` = 1.218.7, exactly one patch bump; CHANGELOG August section 16→17 rettinger, one new `1.218.7` line, consistent. Cleanup commit is `refactor` — correctly no bump, no CHANGELOG line.

## Minor observations (non-blocking)

1. `GameWizard.tsx:396–397` comment still says CupSetup owns `<form action=createTournamentDraft>` — now technically `formAction` (closure over the same action). Cosmetic staleness only; accurate in spirit.
2. The success-redirect test covers only the standalone path, not the klubb branch of the redirect. Acceptable under the contract's "representative slice" language.

VERDICT: ACCEPT

---

## Round 2 — delta evaluation (2026-08-07)

**Delta commits:** `d99cd398` (e2e hooks) + `fb242957` (auto-reset fix), HEAD = `fb242957`.
**Trigger:** staging run found the error banner arriving over a WIPED form — React 19 auto-resets a form when an `action=` submission completes (native reset empties uncontrolled fields, snaps checkboxes to defaultChecked).
**Evaluator:** fresh-context skeptic, round 1 not re-litigated.

### Auto-reset fix (`fb242957`) ✓

- `CupSetup.tsx:103–107`: `onSubmit` calls `e.preventDefault()` first, builds `new FormData(e.currentTarget)` synchronously BEFORE the transition (correct — `currentTarget` is nulled after the handler returns), and dispatches `formAction(formData)` inside `startTransition` (avoids the React "dispatched outside a transition" warning). `startTransition` imported top-level from `react` (line 3).
- `action={formAction}` is still on the form (line 96) — pre-hydration fallback intact; `preventDefault` on the hydrated path stops React's own `action=` dispatch, so no double-submit.
- No try/catch introduced anywhere in the new path. Success path unaffected: `redirect()` at `lib/cup/actions.ts:206` throws NEXT_REDIRECT server-side; the client transition follows the redirect — nothing client-side can swallow it.
- No `useFormStatus` dependency in CupSetup or `components/ui/Button.tsx` (the submit button is a plain `Button type="submit"`, line 242–247), so manual dispatch breaks no pending-state display.
- Version re-pin 1.218.7 → 1.218.8 in package.json + package-lock.json (both entries) + the CHANGELOG #1397 line; grep confirms zero stray `1.218.7` references remain.

### e2e hooks (`d99cd398`) ✓ non-behavioral

- `Banner tone="error" testId="cup-create-error"` — Banner already supports `testId` (`components/ui/Banner.tsx:15,20,24`, renders as `data-testid`).
- `data-testid="wizard-next"` on the WizardFooter next button — passes through `ButtonHTMLAttributes` spread (`Button.tsx:31–39`). Both pure attribute additions; zero logic change.
- Intermediate commit `4d400d7c` (round-1 finding) verified comment-only.

### Gates (re-run independently, Node 22.23.0)

- `npx tsc --noEmit` → clean.
- `npx vitest run lib/cup "app/[locale]/admin/games/new/CupSetup.test.tsx" messages` → 16 files, 239 tests, all passed.
- package.json = package-lock.json = `1.218.8`; CHANGELOG line `1.218.8 · #1397` present. (`1.218.7` is now a skipped number in the CHANGELOG sequence — expected consequence of the re-pin.)

### Out-of-scope finding (REPORTED, not fixed)

**`app/[locale]/admin/liga/new/CreateLigaForm.tsx` has the same wipe-on-error bug.** `<form action={formAction}>` (line 138) + `useActionState` returning `{ error }` on validation failure, with NO onSubmit/preventDefault guard. Uncontrolled fields wiped by the React 19 auto-reset when the action returns an error: `name` (liga name, line 161), `tee_box_id` select (~line 360, resets to placeholder), `best_n_count` (line 469), `penalty_fixed_over_par` (line 591). Controlled fields (dates, radios, course select, player checkboxes) survive. Needs its own issue — same fix pattern as `fb242957`.

(GameWizard/ReadyStep checked as well: its name field is controlled with a value-bound hidden input, so the wizard publish path does not exhibit the wipe.)

VERDICT (round 2): ACCEPT
