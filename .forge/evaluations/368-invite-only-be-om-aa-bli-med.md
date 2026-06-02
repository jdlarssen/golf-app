# Evaluation: #368 invite_only-blindvei → «Be om å bli med»

**Commit:** `230d4b3`
**Contract:** `.forge/contracts/368-invite-only-be-om-aa-bli-med.md`
**Verdict:** ACCEPT

The change converts the invite_only dead-end on `/signup/[shortId]` into a real
«be om å bli med»-action, and — critically — does NOT just relocate the
dead-end to the admin side. The full request loop (signup form → requestApproval
→ pending insert + notify arranger → admin overview pending-count → signups list
→ approve/reject) is verified end-to-end via code reading + the unit test.

## Gate results

| Gate | Command | Result |
|------|---------|--------|
| TypeScript | `npx tsc --noEmit` | PASS (exit 0) |
| Unit test | `npx vitest run app/signup/[shortId]/actions.test.ts` | PASS (15 tests, 1 new) |
| Lint | `npx eslint <5 changed files>` | PASS (exit 0) |
| Build | `npm run build` | PASS (exit 0, "Compiled successfully") |
| Version/CHANGELOG | MINOR bump 1.67.1 → 1.68.0 | PASS (package.json + lock + CHANGELOG, prior 1.67.y series wrapped in `<details>`) |
| Playwright | waived per contract | N/A |

## Success criteria

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | invite_only solo/both (not invited, not requested, not locked) shows request form, not a dead message | PASS | `page.tsx:213-219` renders intro + `<RegistrationForm mode="manual_approval">`. Reached only after `isAlreadyRegistered` (158), `hasOpenPendingRequest` (169), `gameLocked` (177) and `hasPendingInvitation` (187), `team` (202) branches. |
| 2 | `requestApproval` accepts invite_only (insert + notify); open → wrong_mode | PASS | `actions.ts:257-261` gate accepts manual_approval+invite_only, rejects rest. Insert/notify path (280-344) is mode-agnostic. Test `actions.test.ts:377` asserts `{ok:true}` + revalidateTag + notify(ADMIN, registration_request, request_id). Open→wrong_mode test preserved at `actions.test.ts:284`. |
| 3 | Arranger has a standing path: overview renders for invite_only (pending-count + link), signups lists it (not mode-gated) | PASS | `RegistrationOverviewSection.tsx`: `return null` removed; pending count for invite_only (34-47), "Venter" shown via `!== 'open'` (74), "Vis alle påmeldinger →" link (101-106). Call-site `page.tsx:525` unconditional. signups `page.tsx:122-130` request query gated only by game_id+status, NOT mode. |
| 4 | signups invite_only banner no longer claims self-registration impossible | PASS | `signups/page.tsx:188-196` new copy: "Folk som har lenken kan likevel be om å bli med. Forespørslene havner her…". |
| 5 | No new private info leaked on signup page (no arranger name) | PASS | Header (`page.tsx:114-129`) shows only mode-label, game name, tee-off. invite_only branch (213-219) adds only intro + form. No `created_by`/arranger name rendered. |
| 6 | Existing sub-branches intact: pending invitation → innboks; already requested → "venter"; locked → "stengt"; team-only → informative msg | PASS | innboks (187-198) unchanged; pending request (169-174); locked (177-184); team-only (202-208) shows Banner, not a form that would fail with team_not_supported_yet. |

## Skeptic / end-to-end checks

- **Request reaches arranger:** YES. `requestApproval` notify targets `game.created_by` regardless of mode; test asserts notify to ADMIN_USER_ID with request_id.
- **Arranger can SEE it:** YES. Overview renders (early-return gone) + signups request-list query is not mode-gated.
- **Arranger can ACT:** YES. `signups/actions.ts approveRequest`/`rejectRequest` are keyed on `requestId` via `loadDecisionContext`, no registration_mode gate. invite_only requests approve/reject normally.
- **Branch ordering:** correct — already-registered / pending-request / locked all precede the invite_only branch.
- **Team-only invite_only:** shows informative Banner, not the always-failing form. Correct.
- **Share-link decision:** CopyShareLinkButton hidden for invite_only (`RegistrationOverviewSection.tsx:97`), still shown for open/manual_approval. Correct.
- **Open regression:** open still → wrong_mode in requestApproval; overview shows "Påmeldt"/selfRegisteredCount for open (74 else-branch). No flip to pending.
- **No new dead-end introduced:** confirmed — the request lands somewhere the arranger has a standing path to.

## Issues

### Low severity (non-blocking)
1. **Særskriving nit — "invitasjons-basert":** `signups/page.tsx:191` introduces "invitasjons-basert" (hyphenated). Per Norwegian compound rules this should be "invitasjonsbasert" (one word). It's a brand-new string (only occurrence in the codebase), so no consistency excuse, but it's a single cosmetic copy nit, not a functional problem. Optional fix.
2. **Stale comment:** `app/admin/games/[id]/page.tsx:524` still reads `{/* Selv-påmelding-oversikt (#199) — kun for mode != invite_only */}`. The "kun for mode != invite_only" qualifier is now false (the component renders for all modes). Comment-only, no behavior impact. Worth correcting to avoid misleading a future reader.

Neither issue blocks acceptance. No new dead-ends, no leaks, no regressions found.
