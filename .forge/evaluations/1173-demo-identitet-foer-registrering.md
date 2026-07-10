# Evaluation: Demo-spilleren bygger identitet før registrering (#1173)

**Verdict: ACCEPT** (with the documented pre-merge staging gate still open — see below)

**Evaluator:** skeptical forge evaluator (fresh context) · **Date:** 2026-07-11
**Branch:** `claude/intelligent-heyrovsky-a04336` · commits `3b2bae24` (feat), `2acba35e` (test), `5b8f6e2d` (docs) · base `origin/main` (1.188.0)

All gates re-run independently on Node 22 (v22.23.0). Every claim below is backed by output produced in this session, not by prior notes.

---

## Automated gates (re-run, actual output)

| Gate | Result | Evidence |
|---|---|---|
| `npx tsc --noEmit` | PASS | `TSC_EXIT: 0`, no output |
| `npm run lint` | PASS | `✖ 55 problems (0 errors, 55 warnings)` — all 55 are pre-existing complexity/max-depth warnings in untouched files (lib/league, lib/mail, lib/scoring, lib/wizard, …). Grep of full lint output for the five touched files (`DemoGame`, `complete-profile`, `handoff`, `components/ui/Input`) returned **no matches** → zero new warnings introduced. |
| `npx vitest run "app/[locale]/demo" "app/[locale]/complete-profile" messages/catalogParity.test.ts` | PASS | `Test Files 3 passed (3) · Tests 10 passed (10)` |
| `npm run build` | PASS | Completed with full route manifest + Static/PPR/Dynamic legend printed at end |
| grep-guard (#1042) | PASS | `grep -rnE "^import\|from '" app/[locale]/demo lib/demo \| grep -E "writeScore\|startSyncListener\|getBrowserClient\|@/lib/sync\|dexie"` → **empty** (exit 1). Demo imports no sync/write/Dexie. |

---

## Success Criteria

### Criterion 1 — name field updates ScoreCard + leaderboard live; empty → «Deg» — **PASS**
- Code trace: `DemoGame.tsx:43` `const displayName = youName.trim() || youPlayer.name` (youPlayer.name = "Deg" from seed). Consumed in **ScoreCard** `name={displayName}` + `initial={displayName.charAt(0)}` (:148-149) and in **playersById** you-row `name: p.isYou ? displayName : p.name` (:63). Both `playersById` (useMemo dep `[displayName]`, :69) and ScoreCard re-render when `youName` state changes.
- Test evidence: `DemoGame.test.tsx:31-35` fires `change` → `getByText('Jørgen')` present in board, `queryByText('Deg')` absent. Passed in the 10/10 run.
- Live (static) confirmation: loaded `/demo` in a local dev server — name field label «Hva heter du?», ScoreCard shows fallback «Deg» + initial «D» before input. Screenshot captured.
- **Note (no fabrication):** I could not drive the *interactive* swap live — React `onChange` did not fire through the preview eval sandbox. I verified this is a harness artifact, not a bug: the known-good «+1» score button (proven by the render test) also failed to update the board through the same sandbox. The jsdom render test exercises the real React path and passes.

### Criterion 2 — prefill on `/complete-profile`, editable, key removed — **PASS (code-verified)**
- `OnboardingNameField.tsx`: uncontrolled `<Input>` + `ref` (:24, :42). `useEffect` (:26-38) reads `torny-demo-name` **only when `initialName` is empty** (`if (initialName) return;` :28 — #748 echo wins), writes to `inputRef.current.value` (:32), then `removeItem` (:33). Field stays editable — `defaultValue` + `required`, no readonly/disabled.
- Key match: both writer (`DemoGame.tsx:24,97,99`) and reader (`OnboardingNameField.tsx:6,30,33`) import `DEMO_NAME_STORAGE_KEY` from `@/lib/demo/handoff` (`= 'torny-demo-name'`). Single source of truth — string mismatch is impossible.
- "Don't write default «Deg»" guard present: `DemoGame.tsx:96` `if (trimmed && trimmed !== youPlayer.name)` writes, else `removeItem` — whitespace-only and the literal «Deg» both clear the key.
- Private-mode safety: `try/catch` around every localStorage read (`OnboardingNameField.tsx:29-37`) and write (`DemoGame.tsx:93-103`).
- SSR-safe / no set-state-in-effect: `window` touched only inside the effect (client-only); state is never set in the effect (DOM written via ref) → no `set-state-in-effect` lint error. tsc + lint + build all green.
- **End-to-end (login-gated) prefill is OUT OF SCOPE for this verdict** — requires the staging env; code path is correct by reading.

### Criterion 3 — CTA reads «Fortsett»/"Continue", href unchanged — **PASS**
- `messages/no.json:4927` `"ctaButton": "Fortsett"`; `messages/en.json:4927` `"ctaButton": "Continue"`. catalogParity test green.
- Href unchanged: `DemoGame.tsx:198` `<LinkButton href="/login?next=%2F">`; render test asserts `href="/login?next=%2F"`.
- Live confirmation: on `/demo`, CTA `textContent` = "Fortsett", `href` = `/login?next=%2F` (read from live DOM).

### Criterion 5 — one render test per component, genuine assertion — **PASS**
- Only one test file changed vs main: `app/[locale]/demo/DemoGame.test.tsx` (+7). **No new Type C file** for DemoGame or OnboardingNameField.
- New files added are non-test: `OnboardingNameField.tsx`, `lib/demo/handoff.ts`.
- The DemoGame test genuinely asserts the name-swap (change → board shows «Jørgen», «Deg» gone), not a tautology.

### Gate — MINOR bump + CHANGELOG Funksjon-row — **PASS**
- `origin/main` package.json = `1.188.0`; HEAD = `1.189.0` → MINOR bump (correct for `feat`).
- CHANGELOG diff adds a Funksjoner-row under `## Funksjoner`: «1.189 · Sett navnet ditt før du logger inn» with `#1173` link and `↳ /demo · «Fortsett»`.

---

## Staging / e2e — DOCUMENTED PRE-MERGE GATE (NOT verified here, by design)

- [ ] `npx playwright test e2e/demo/demo.spec.ts` against staging env — **not run** (requires staging). e2e drives testid/role, so the copy change does not break it, but this remains the owner's pre-merge step.
- [ ] Staging click-through on `torny-staging`: demo → set name → CTA → login; verify prefill with a reset test user (`profile_completed_at = null`); screenshot on the PR. **This is the contract's last unchecked Success Criterion and MUST remain unchecked until performed on staging.** The login-gated prefill code path is correct by reading, but end-to-end behavior across the two-step OTP login was not exercised in this evaluation.

---

## Gaps / concerns

- **None blocking.** The implementation matches the contract's MINIMAL scope precisely; no scope creep, no drive-by edits (only the 12 files the contract anticipated, all traceable to the task).
- **Minor observation (not a defect):** `components/ui/Input.tsx` gained `ref` forwarding (React 19 ref-as-prop) — a small, correct, reusable primitive change; `ref` is destructured out of `...props` so no double-spread conflict.
- The live interactive swap could not be exercised through the preview harness (React event synthesis limitation, confirmed against a known-good control). Evidence for the demo's runtime behavior therefore rests on the passing jsdom render test + a full code trace, which the contract explicitly sanctions when live driving is impractical.

## Verdict rationale

Every automated gate re-run green with real output; all five in-scope Success Criteria and both in-scope Gates verified against the actual code and catalogs; the #1042 sync/write/Dexie invariant holds. The only remaining items are the explicitly-deferred staging click-through + playwright run, which the contract designates as a pre-merge step. **ACCEPT.**
