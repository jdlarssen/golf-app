# Evaluation: #367 — Wizard påmeldingsvalg viser synlighet i «Finn turneringer»

**Commit:** `201e5e2` (feat(ui): vis at påmeldingsvalg styrer synlighet i «Finn turneringer»)
**Contract:** `.forge/contracts/367-wizard-paameldingsvalg-synlighet.md`
**Evaluator:** Fresh-context skeptical evaluation
**Date:** 2026-06-02

## Verdict: ACCEPT

All five success criteria pass with concrete evidence, all six gates pass, and the single highest-risk item (badge mapping matching `getDiscoverableGames`) is verified exact. The one finding is cosmetic (en-dash vs em-dash) and does not block.

## Success Criteria

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | Each mode shows a visibility badge: `invite_only`→«Privat», `manual_approval`+`open`→«Oppdagbar» | PASS | `RegistrationSection.tsx:100-101` maps over all 3 `MODE_OPTIONS`, derives `discoverable = isDiscoverableRegistrationMode(opt.value)`, renders `<VisibilityBadge discoverable={discoverable}/>` (line 121) for each. `VisibilityBadge` (196-208) renders «Oppdagbar» when true else «Privat». Helper returns true for `open`+`manual_approval`, false for `invite_only` (`registration.ts:57-59`). Confirmed by unit test (12 passed). |
| 2 | Each mode's hint states in plain text whether the game becomes discoverable or private | PASS | All THREE hints rewritten (`RegistrationSection.tsx:50,55,60`): invite_only = "Privat. Vises ikke i Finn turneringer…", manual_approval = "Dukker opp i Finn turneringer. Folk ber om plass…", open = "Dukker opp i Finn turneringer så hvem som helst med lenken…". Each names the «Finn turneringer» consequence explicitly. |
| 3 | `isDiscoverableRegistrationMode` is pure, unit-tested, and matches `getDiscoverableGames` | PASS | Pure function (`registration.ts:57-59`, no side effects). Three tests added (`registration.test.ts:64-84`): open+manual_approval true, invite_only false, plus a partition guard asserting `REGISTRATION_MODES.filter(m => !isDiscoverable(m))` equals exactly `['invite_only']`. `getDiscoverableGames.ts:69` filters `.in('registration_mode', ['open','manual_approval'])` — identical partition. Helper cannot drift silently. |
| 4 | Change applies to both wizard step and full GameForm (shared component, no duplication) | PASS | Single component edited. Imported at `GameForm.tsx:17` (rendered :760) and `GameWizard.tsx:44` (rendered :694 with `hideHeading`). One edit covers both; no duplication introduced. |
| 5 | No new DB column; default stays `invite_only` | PASS | Commit touches only CHANGELOG, RegistrationSection, registration.ts, registration.test.ts, package.json, package-lock.json (`git show --name-only`). `useGameFormState.ts:448` still `initialValues?.registration_mode ?? 'invite_only'` (not in commit). No `gamePayload.ts` exists in `app/admin/games/new/` and no payload/migration touched. |

## Gates

| Gate | Result | Evidence |
|------|--------|----------|
| `npx tsc --noEmit` | PASS | Exit code 0, no output. |
| `npx vitest run lib/games/registration.test.ts` | PASS | 1 file, 12 tests passed. |
| `npx eslint` on changed files | PASS | Exit code 0, no output. |
| `npm run build` | PASS | Exit code 0. Only warning is a pre-existing Next.js workspace-root inference notice (lockfile heuristics), unrelated to this change. |
| PATCH bump + CHANGELOG | PASS | `package.json`/`package-lock.json` 1.67.0→1.67.1 (PATCH, correct for clarity/polish). CHANGELOG adds `[1.67.1]` block with tagline + Teknisk/Changed/Added/Tests, plus a one-line addendum to the 1.67.y series intro. Commit-msg hook (feat prefix) was satisfied. |
| Playwright/preview waived | N/A (waived) | Admin-gated route; verified via code + helper test per contract. |

## Skeptic deep-checks

- **Badge mapping vs #357:** EXACT match. `isDiscoverableRegistrationMode` (`open`||`manual_approval`) === `getDiscoverableGames.ts:69` `.in(..., ['open','manual_approval'])`. The partition guard test locks it. No lie to the admin.
- **All three hints rewritten:** Yes — verified line by line. Not just one.
- **Badge renders when locked (`lockGameMode`):** Yes. `disabled={lockGameMode}` (line 113) disables only the radio `<input>`. The badge + hint live in the sibling `<div>` (116-124) inside the same map, rendered unconditionally. Edit-on-published flow still shows visibility info.
- **Default untouched:** `useGameFormState.ts:448` unchanged, not in commit.
- **Helper test meaningful:** Not vacuous. The guard (`registration.test.ts:78-83`) asserts the exact private set is `['invite_only']` — would fail if a new mode were added without classification, and pins exactly-invite_only-is-private.
- **Both import sites confirmed:** GameForm + GameWizard.
- **Palette tokens valid:** `bg-primary-soft`, `text-primary`, `bg-surface-2`, `text-muted` all map to registered Tailwind color vars in `globals.css` (lines 260-266) and are used elsewhere in the codebase (Banner, BottomNav, HandicapChip, etc.). Badge has light+dark variants via the CSS vars.

## Issues (by severity)

### Cosmetic (non-blocking)
1. **En-dash vs em-dash in `manual_approval` title.** `RegistrationSection.tsx:54` changed `'Forespørsel — jeg godkjenner'` (em-dash, pre-commit) to `'Forespørsel – jeg godkjenner'` (en-dash). The rest of the codebase and the contract's example copy use em-dash (—). This is a single dash, not an em-dash *chain*, so it is not a humanizer-flagged violation and the humanizer pass found the copy otherwise clean. It is a minor, possibly unintentional inconsistency with house convention. Not worth blocking; could be flipped back to — in a follow-up touch if the owner cares about dash consistency.

No correctness, scope, test-quality, or copy-quality issues found.
