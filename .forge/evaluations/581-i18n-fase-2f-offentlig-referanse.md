# Evaluation: i18n Fase 2f — offentlig/referanse-flate — #581

**Verdict: ACCEPT**

Evaluated independently against `.forge/contracts/581-i18n-fase-2f-offentlig-referanse.md`.
All 9 success criteria pass; all 5 gates green. The builder's scope call on the
three notification-payload strings (filed as follow-up #583) is defensible per
the contract's Out of Scope. One cosmetic NIT (dead `MODE_LABELS` re-export) — not
a contract violation.

Worktree confirmed: `/Users/jdl/Dokumenter/GitHub/golf-app/.claude/worktrees/trusting-panini-8ca461`.
Work = 9 commits in `git log origin/main..HEAD` (merge-base `8525e84d`). The
`diff --stat origin/main..HEAD` also shows #571/#572 finished-archive files being
"deleted" — that is a **stale-branch artifact** (the branch was cut before #571/#572
landed on origin/main); it is NOT part of the 2f work and was excluded from the audit.

---

## Per-criterion table

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | No hardcoded Norwegian UI literals in scope | **PASS** | Own greps: `"[æøå…]"` quoted-string sweep over all 4 surfaces → only 7 hits, all in JSDoc/`{/* */}` comments (excluded by contract). No-diacritics word sweep (Velg/Lagre/Avbryt/Tilbake/Send/Spiller/Påmelding/Personvern/Lag/Flight/etc.) → 0 user-facing hits. JSX-text `>…<` æøå sweep → 0. Only remaining runtime-Norwegian = 3 notification payloads (`teamActions.ts:535` requester_name, `:768`/`:1085` `'Laget'` fallback) — all `notify()`/`notifyInvitedToTeam()` args, written at send-time, rendered by the 2e-owned NotificationCard; out-of-scope per contract, follow-up #583 filed. Signup FORM/PAGE/DASHBOARD chrome = 0 leftover Norwegian (prose-string heuristic over all 6 signup components = none). |
| 2 | Norwegian byte-identical; full test green | **PASS** | `npm run test`: 265 files / 3379 tests pass, exit 0. Spot-checked 17 home strings against `git show origin/main:app/[locale]/page.tsx` — all byte-identical (`✓ Profilen din er oppdatert.`, `KLUBBHUSET ER ÅPENT`, `Hei, {name}.`, `Pågår nå`, `Mine spill`, `kl.`, `Lag {teamNumber} · Flight {flightNumber}`, …). Assertion edits limited to permitted set: `teamFormValidation.test.ts` (Norwegian strings → discriminated codes, §2), `actions.test.ts`+`teamActions.test.ts` (redirect mock `makeRedirectMock`→`makeLocaleRedirectMock` object-form + `reason:'Bruker ikke funnet'`→`'userNotFound'` code), plus `spillformater/[slug]/page.test.tsx` (+`locale:'no'` param — a test-setup change from the locale-aware metadata pattern, not an assertion change). All justified. |
| 3 | English coverage + catalog parity | **PASS** | `catalogParity.test.ts`: 3/3 pass. `npm run build` exit 0. ICU/rich-tag parity: tokenizer flagged 24 "mismatches" — all are ICU `plural`-branch words that *should* differ per language (NO `plass/plasser` vs EN `slot/slots`); the actual ICU args (`{count}` etc.) and rich tags (`<supabase>`,`<term>`,`<mailto>`) are identical no↔en. 0 genuine arg mismatches. EN reads idiomatically (warm-companion register): "Sign me up", "You're signing up a whole team as captain.", "A great round starts with a good plan."; British "organiser". opus EN pass commit `d88da4b5` present. |
| 4 | Mode/status display localized | **PASS** | home `page.tsx:111` `tStatus=getTranslations('gameStatus')`, StatusPill `:297` `label={tStatus(g.status)}`; finished-card label `:361` `tModes(formatDisplayLabelKey(...))` (key, not Norwegian constant). spillformater/[slug] `generateMetadata:27`+page`:59` use `tModes`; `MODE_LABELS` only feeds `VALID_MODES` set (type-safe key source, allowed §4). signup `page.tsx:237` header `tModes(game.game_mode)`, team-unsupported banner `:430` `tModes`. |
| 5 | Locale-aware dates on home | **PASS** | `page.tsx:368` finished date `formatShortDateLocale(g.ended_at, locale)` (NOT `'no'`); `:288` active tee-off `formatTeeOffDateLocale`/`formatTeeOffTimeLocale` with `locale`; `locale` resolved via `getLocale()` `:60/:109`. |
| 6 | Privacy fully English | **PASS** | `legal.privacy` = 24 keys in both locales (metadata + backLabel + kicker + all 6 GDPR sections s1–s6 + emphasis terms + mailto). EN idiomatic ("Rectification", "Erasure"). Emphasis via `t.rich` tag-maps (`supabase`/`term`/`mailto`), no HTML in catalog. Route still public: `/legal` in `PUBLIC_PATH_PATTERN` (proxy.ts:23); build prerenders `/no/legal/privacy` + `/en/legal/privacy`. |
| 7 | Signup fully bilingual | **PASS** | `signup.*` ~124 keys both locales: branch banners, both forms, validation, team dashboard, not-found. Client `teamFormValidation.ts` returns codes (`teamNameEmpty`/`slotEmailDuplicate`/…); server `teamActions.ts` returns matching codes (`team_name_invalid`/`duplicate_emails`/…); both resolve to the SAME `signup.errors.*` namespace via `t('errors.<code>')` at call-site (TeamRegistrationForm:45/225, slotFailReason:204). `redirect` → `@/i18n/navigation` object-form + `getLocale()` in page/actions/teamActions/team-page; `notFound` stays on `next/navigation`. not-found.tsx fully catalog-driven. |
| 8 | #559 fixed | **PASS** | `page.tsx`: `auth.getUser()` (:66) → unauth `redirect({href:'/login?next='+encodeURIComponent(...)})` (:71-72) **before** `getGameByShortId` (:77) → `notFound()` (:79). `npx playwright test e2e/signup/open-register.spec.ts -g "uautentisert"` → **1 passed** (asserts `/login?next=%2Fsignup%2Fabcd1234`). `Closes #559` (PR-level). |
| 9 | PPR shape holds | **PASS** | `npm run build` exit 0. All 4 scope routes ◐ (PPR): `/[locale]/legal/privacy`, `/[locale]/signup/[shortId]`, `/[locale]/signup/[shortId]/team`, `/[locale]/spillformater`, `/[locale]/spillformater/[slug]`. No `export const dynamic='force-dynamic'` added in any scope file (only a pre-existing *comment* in spillformater/page.tsx, identical on origin/main). No new force-dynamic. |
| 10 | Version + CHANGELOG | **PASS** | package.json = `1.119.1`. CHANGELOG: `## 1.119.y` theme open with 1.119.1 (#559 url-encode follow-up) + 1.119.0 (#581 feat); prior `1.118.y` series collapsed in `<details><summary><strong>…</strong></summary>` (1.118.1 #559 reorder + 1.118.0 #573), then 1.117.y collapsed below — nesting well-formed (verified `</details></details>` close before 1.117 opens). feat commit `15475d50` co-stages package.json(→1.119.0)+CHANGELOG+messages/README.md; fix commit `2c27500f` co-stages package.json(→1.119.1)+CHANGELOG+page.tsx. commit-msg hook discipline satisfied. |

**Pass count: 9 / 9 success criteria.**

---

## Gate results

| Gate | Command | Outcome |
|------|---------|---------|
| Typecheck | `npx tsc --noEmit` | **PASS** — exit 0, zero errors (no new next-intl module-resolution noise; clean). |
| Full test | `npm run test` | **PASS** — 265 files, 3379 tests, exit 0 (38.66s). |
| Catalog parity | `npx vitest run messages/catalogParity.test.ts` | **PASS** — 3/3, exit 0. |
| Build | `npm run build` | **PASS** — exit 0; PPR route-shape holds (all 4 scope routes ◐). |
| #559 smoke | `npx playwright test e2e/signup/open-register.spec.ts -g "uautentisert"` | **PASS** — 1 passed; asserts `/login?next=%2Fsignup%2Fabcd1234`. |

---

## Issues found

### Contract violations (must-fix)
None.

### Out-of-scope (defensible — no action this phase)
- **3 notification-payload Norwegian strings** in `app/[locale]/signup/[shortId]/teamActions.ts`:
  `:535` `requester_name: \`${captainName} (kaptein for ${teamName})\``, `:768` and `:1085`
  `'Laget'` fallback. All are `notify()`/`notifyInvitedToTeam()` arguments written at send-time
  (recipient locale unknown) and rendered by the 2e-owned NotificationCard. Contract's Out of Scope
  (mail / 2e-owned payloads) covers these; follow-up **#583** filed. Correct scope call.

### Nits (cosmetic, not blocking)
- **Dead `MODE_LABELS` re-export** — `app/[locale]/signup/[shortId]/page.tsx:15` imports `MODE_LABELS`
  and `:505-506` re-exports it (`export { MODE_LABELS }`) with comment "Keep … for type-safety
  elsewhere; display now uses tModes." No module imports this re-export (verified via grep) — it's a
  workaround for an unused-import lint warning. The constant is *allowed* to stay for typing per §4,
  but a `void MODE_LABELS` / removing the unused import would be cleaner. Severity: trivial.

---

## Notes
- The two #559 CHANGELOG entries (1.118.1 reorder + 1.119.1 url-encode) are both legitimate: the
  1.118.1 reorder *unblocked* the redirect, which then surfaced the unencoded-`next` bug fixed in
  1.119.1. Both correctly nest under their respective i18n themes (patch-under-open-theme convention).
- `messages/README.md` namespace list was updated (contract requirement) in commit `15475d50`.
