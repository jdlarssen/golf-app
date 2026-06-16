# Forge-evaluering: #640 — QA-polish fra modus-gjennomgang

**VERDICT: ACCEPT**

Evaluated branch `origin/claude/640-qa-polish-modus` @ `c4df36cd` (detached, fresh
`npm install`) against `.forge/contracts/640-qa-polish-modus-gjennomgang.md`.
Item 4 (Vercel log) was out of scope and not evaluated. Version/CHANGELOG numbering
ignored per instructions (handled on rebase).

All five in-scope items are implemented correctly, reuse the canonical predicates
they should, and add appropriate co-located tests. Gates green.

---

## Item 1 — Course handicap display before start (ACCEPT)

- `lib/scoring/courseHandicap.ts:39-53` adds `displayCourseHandicap`. It **reuses**
  `calculateCourseHandicap` + `applyAllowance` (lines 46-52) — no formula fork.
  Verified the body composes the exact same pipeline `startScheduledGame` freezes.
- Type A test present: `lib/scoring/courseHandicap.test.ts:50-67` asserts
  `displayCourseHandicap(...) === applyAllowance(calculateCourseHandicap(...), 85)`.
  Plus null-guards (missing tee rating → null:81-91, non-finite hcp → null:93-103).
- Page wiring `app/[locale]/games/[id]/(home)/page.tsx:409-432`:
  `displayedCourseHandicap` is initialized to `me.course_handicap`, and the
  on-the-fly compute **only** runs `if (displayedCourseHandicap == null && playerRating)`.
  Both render sites (lines 893, 909) read `displayedCourseHandicap ?? '—'`.

**Adversarial — never overrides frozen value:** confirmed. Post-start path is
untouched: when `me.course_handicap` is non-null the override branch is skipped
entirely (no extra fetch, frozen value shown verbatim).

**Adversarial — throw/wrong on missing data:** `playerRating` comes from
`getRatingForGender` (`lib/games/teeRating.ts:24-33`) which returns `Rating` with
non-null slope/cr/par or `null`. When null, the fallback compute is skipped → «—»
(documented behavior). If `hcp_index` is `undefined`, `Number(undefined)=NaN` →
`displayCourseHandicap` returns null via `Number.isFinite` guard → «—». No throw.
(Minor: a literal DB `null` hcp_index would `Number(null)=0` and show CH-for-scratch,
but a player without an hcp index cannot be assigned a course handicap at start
anyway; not a regression and out of practical reach pre-start.)

## Item 2 — Withdrawal messaging, copy-only (ACCEPT)

- `git diff origin/main...HEAD -- lib/scoring/modes/types.ts` is **empty**:
  `supportsWithdrawal` (types.ts:269-296) is UNCHANGED. Exclusions kept by design.
- `git diff ... -- app/[locale]/games/[id]/avslutt/page.tsx` is **empty**: the page
  (incl. checkbox rendering gated on `allowWd`, line 216) is untouched.
- The fix is the `explanationNoWd` string in both `messages/no.json` and
  `messages/en.json`. avslutt page already renders it for `!supportsWithdrawal`
  (`avslutt/page.tsx:182` + `:216`). WD-format checkbox path verified untouched.

**Adversarial — accidental scoring/checkbox change:** none. Commit `c4df36cd`
touches only the two message files (+ changelog/version).

## Item 3 — "4 4 spillere" double-count (ACCEPT)

- `ReadyStep.tsx:108` now calls `t('playersUnassigned', { playerWord: base })`
  (was `{ count, playerWord: base }`).
- Template in both locales changed `{count} {playerWord} (…)` → `{playerWord} (…)`
  (`messages/no.json` "playersUnassigned": "{playerWord} (ikke fordelt)").
  Since `playerWord` already = "4 spillere", count renders ONCE: "4 spillere (ikke fordelt)".
- Only consumer of `playersUnassigned` is ReadyStep.tsx:108 (grep-confirmed); no
  stray `{count}` placeholder remains in template or call. Both sides consistent.
- **Catalog parity:** no.json and en.json both 3411 keys, zero orphans either way.

## Item 5 — Extend team signup to all team formats (ACCEPT) — highest-risk item

- `lib/games/registration.ts:49-51`: `gameModeSupportsTeams(mode) =
  formatPlayStyle(mode) === 'team' && !isMatchplayFamily(mode)`. Canonical predicate,
  NOT a hardcoded best_ball/texas list.
- Resolved truth-set by reading `formatPlayStyle` (types.ts:203-236) ∩
  `!isMatchplayFamily` (types.ts:125-131 + `isAlternateShotMatchplay` 104-111):
  - **true**: best_ball, texas_scramble, ambrose, florida_scramble, shamble, patsome
  - **false**: singles/fourball/foursomes/greensome/chapman/gruesome_matchplay,
    solo_strokeplay, wolf/nassau/skins/bbb/nines/round_robin/acey_deucey,
    stableford/modified_stableford.
  Matches contract exactly.
- Render/unit test: `lib/games/registration.test.ts:22-54` covers ambrose/florida/
  shamble/patsome → true, matchplay-family → false, solo/stableford → false.
- Restrictive copy removed: `teamNotSupportedNote` (both locales) changed from
  "best ball and Texas scramble" → "team formats like best ball and scramble".
  No other restrictive team-registration copy remains (grep-verified).

### UI-vs-server validation consistency check: **PASS**

Single source of truth — every gate imports `gameModeSupportsTeams` from
`lib/games/registration.ts`:
  - server validation: `lib/games/gamePayload.ts:2285-2286`
    (`(type === 'team' || 'both') && !gameModeSupportsTeams(mode)` →
    `team_registration_unsupported_mode`)
  - wizard UI: `app/[locale]/admin/games/new/useGameFormState.ts:518, 575`
  - public signup page: `app/[locale]/signup/[shortId]/page.tsx:174, 423`
  - signup team action: `app/[locale]/signup/[shortId]/teamActions.ts:236`

By construction the UI and server cannot disagree about which modes support teams.
No hardcoded competing list exists anywhere (grep-confirmed: 5 usages, all import
the same function).

**Secondary runtime guard examined:** `teamActions.ts:240-243` also requires
`resolveTeamSize(mode_config) != null` (team_size ≥ 2). For all newly-enabled
formats the publish validators set `mode_config.team_size` to 2 or 4 and reject
otherwise (`unsupported_mode_size_combo`: gamePayload.ts texas:742, ambrose:848,
florida:955, shamble:2090, patsome hardcoded 2:2179). So a published team-format
game always has team_size ≥ 2 → no "UI offers / server rejects" gap. This guard
pre-existed identically for best_ball/texas, so it is no new regression; worst case
(impossible draft state) degrades gracefully to `mode_does_not_support_teams`, not a crash.

## Item 6 — Locale default for signed-in NULL-locale users (ACCEPT)

- `lib/i18n/resolveLocale.ts:59-71` adds `signedIn?: boolean`; precedence is
  `userLocale -> cookieLocale -> (signedIn ? null : matchAcceptLanguage) -> default`.
  Explicit `users.locale` (step 1) and cookie (step 2) are both evaluated BEFORE
  the `signedIn` short-circuit, so explicit/cookie choices still win.
- `proxy.ts:101-104` passes `signedIn: true` only on the authenticated branch
  (after the `!user` redirect guard at :61-75). Anonymous visitors route through
  `handleI18nRouting` (createIntlMiddleware, localeDetection defaults true since
  `i18n/routing.ts` doesn't disable it) → Accept-Language preserved for anon.
- Unit test `lib/i18n/resolveLocale.test.ts:93-134` covers all required cases:
  signed-in+null→no (:97), signed-in+explicit-en→en (:107), anon+en-header→en
  (:128), cookie-wins (:117), plus existing precedence tests (:52-91).

**Adversarial — could a signed-in en-preferring user be forced to no?** No. If they
set `users.locale='en'`, `toSupportedLocale('en')='en'` resolves at step 1 before
the signedIn branch is ever reached. Explicit locale wins. Verified by test :107-115.
**Anonymous Accept-Language still works?** Yes — anon never reaches the signedIn:true
call; their detection is next-intl's, unchanged.

---

## Gates

```
$ npx tsc --noEmit
TSC_EXIT=0

$ npx vitest run lib/scoring lib/i18n lib/games "app/[locale]/admin/games/new" messages
 Test Files  83 passed (83)
      Tests  1769 passed (1769)
VITEST_EXIT=0

$ npx vitest run lib/scoring/courseHandicap lib/i18n/resolveLocale lib/games/registration
 Test Files  3 passed (3)
      Tests  64 passed (64)
```

Catalog parity (no.json vs en.json): 3411 keys each, zero orphans either direction.

## Non-goals respected

- courseHandicap formula unchanged (only reused). ✓
- No per-team WD for matchplay/team. ✓ (types.ts unchanged)
- Anonymous default-locale behavior unchanged. ✓
- Item 4 skipped. ✓

## Copy quality note (non-gating)

New Norwegian strings (`explanationNoWd`, `teamNotSupportedNote`, `playersUnassigned`)
read as idiomatic bokmål — action-oriented, no em-dash chains, no «vennligst»,
consistent with existing voice. No AI-tells observed.
