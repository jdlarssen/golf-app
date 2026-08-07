# Evaluation: 1475-liga-form-autoreset — Round 1

**Commit under evaluation:** `90d7f70d` (HEAD of `claude/1475-liga-form-autoreset`)
**Evaluator:** fresh-context skeptic, 2026-08-07
**Verdict: ACCEPT** (staging criterion deferred to PR stage by instruction — open item, not a failure)

## Per-criterion evidence

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | onSubmit guard in `CreateLigaForm.tsx` | PASS | `e.preventDefault()`; `new FormData(e.currentTarget)` built synchronously BEFORE the transition; `startTransition(() => formAction(formData))`; `action={formAction}` retained as pre-hydration fallback. Verified in diff and in the file at HEAD (clean tree, `git status --porcelain` empty at `90d7f70d`). |
| 2 | Error banner `testId="liga-create-error"` | PASS | `<Banner tone="error" testId="liga-create-error">` at the error block; `components/ui/Banner.tsx` accepts the `testId` prop and stamps `data-testid`. |
| 3 | Pending-state preserved | PASS | `const [state, formAction, isPending] = useActionState(...)` — third tuple element wired as `pending={isPending}` on shared `Button` with `pendingLabel={t('submitPending')}`. `components/ui/Button.tsx` supports `pending`/`pendingLabel`/`type="submit"`. `components/ui/SubmitButton.tsx` still exists; repo-wide grep shows ~15 other consumers (liga, klubber, admin/liga), none touched by this commit. |
| 4 | Regression test non-vacuous | PASS — independently re-proved | Test drives `fireEvent.change` on the name input → `fireEvent.submit` → `findByTestId('liga-create-error')` → asserts `nameInput.value === 'Torsdagsligaen'` (input VALUE, not banner presence). Skeptic re-proof isolating the guard: checked out the parent form (`90d7f70d^`) and added ONLY the Banner testId → test fails with `AssertionError: expected '' to be 'Torsdagsligaen'` (the wipe, exactly the red the builder recorded). Restored HEAD version → green. First naive re-proof (parent file verbatim) failed at `findByTestId` instead because the testId was added in the same commit — the isolated run above is the authoritative red. |
| 5 | `npx vitest run lib/league "app/[locale]/admin/liga/new/CreateLigaForm.test.tsx"` | PASS | 10 files, 98/98 tests green on Node 22 (vitest 4.1.6). |
| 6 | `npm run build` | PASS | Full route table printed, no errors, Node 22. |
| 7 | `npm run lint` | PASS | 0 errors, 57 warnings — all pre-existing (sideTournament/fitsPlayerCount complexity etc.), none in touched files. |
| 8 | Version + CHANGELOG | PASS | Parent `package.json` = `1.218.8` (`git show 90d7f70d^:package.json`), commit = `1.218.9` — exactly one patch. `package-lock.json` bumped in both places. CHANGELOG Feilrettinger line cites `1.218.9` + [#1475]; August-summary bumped 17 → 18 and actual entry count in the section = 18 (awk/grep count). |
| 9 | Staging verification (`/admin/liga/new` repro + SQL oracle + label) | DEFERRED | Per evaluation instructions: handled at PR stage. Must happen before merge (staging-verified label + bevis-kommentar). |

## Skeptic pass

- **Files outside contract list:** only `.forge/contracts/1475-liga-form-autoreset.md` — the mid-build useFormStatus correction (I1), which the evaluation instructions declare part of the contract. Everything else (`CreateLigaForm.tsx`, `CreateLigaForm.test.tsx`, `package.json`, `package-lock.json`, `CHANGELOG.md`) is on the contract's list. No drive-bys.
- **Success path unswallowed:** no try/catch around the dispatch; server-side `redirect()` propagates through the transition, per the proven fb242957/CupSetup pattern. `lib/league/actions.ts` untouched, as required.
- **Klubb-route consumer:** `app/[locale]/klubber/[id]/liga/ny/page.tsx` imports the shared `CreateLigaForm`; the component's props are unchanged, so the route gets the fix for free and compiles (build green covers it).
- **useFormStatus correction is real, not cosmetic:** without the swap, SubmitButton's `useFormStatus().pending` would never fire on manual dispatches — the isPending wiring restores pending UI with the app's standard Button API.
- **Norwegian CHANGELOG line:** «Samme retting for liga-skjemaet: feiler opprettingen (for eksempel sluttdato før startdato), beholder skjemaet alt du fylte ut i stedet for å tømme seg.» — idiomatic conditional inversion, matches the tone and structure of the sibling #1397 line directly below it.
- **Guard comment:** adapted from CupSetup's (adds #1475 and the isPending rationale) rather than copied verbatim — spirit of «identisk … inkl. kommentaren» met.

## Findings

None blocking. One open item: staging verification (criterion 9) is a merge gate at PR stage, not part of this evaluation.
