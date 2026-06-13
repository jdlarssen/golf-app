# Evaluation: i18n Fase M — locale-aware transactional mail + language-neutral code-mail (#594)

**Verdict: ACCEPT**

Independent, skeptical re-derivation of every Success Criterion and Gate in
`.forge/contracts/594-i18n-fase-m-mail.md`. All gates green, all criteria PASS.
Two non-blocking cleanup findings noted (dead catalog keys); neither affects rendering,
parity, or correctness.

Branch `claude/awesome-nightingale-feb088`, range `78f9e733..aa52ed98` (14 commits).

---

## Gate results

| Gate | Result | Evidence |
|---|---|---|
| `npx tsc --noEmit` | **PASS** | exit 0, no output |
| `npx vitest run lib/mail messages/catalogParity.test.ts` | **PASS** | 14 files, **127 tests** passed |
| `npm run build` (placeholder Supabase env) | **PASS** | exit 0, "Compiled successfully in 3.6s", 256 static pages generated, no error/failure lines |
| Broader suite (mail + parity + cup + productUpdates + notifications) | **PASS** | 29 files, **284 tests** passed (matches contract claim) |

---

## Per-criterion verdict

### 1. Locale-param + no residual hardcoded Norwegian — PASS
All 11 `send*` functions in `lib/mail/*.ts` take `locale?: string | null` and render
visible text via `getMailTranslator`/`t()`:
invite, gameFinished, scorecardSubmitted, deliverReminder, cupStarted, cupFinished,
registrationRequest, registrationApproved, registrationRejected, teamInvitation,
productUpdateDigest. (`gameFinishedRecipients.ts` and `i18n.ts` are helpers, not templates.)

Skeptical residual-Norwegian hunt:
- `grep -nE '[æøåÆØÅ]'` over sources (excluding comments + brand) → **0 hits**.
- Per-template scan of inline `>Text<` / subject / string literals → only JSDoc comments matched.
- One observation (informational, not a violation): `inviteToGameActions.ts:223` passes a
  hardcoded `'En arrangør'` fallback as the *inviter display name* (data, not template prose),
  and invites are always `'no'` by design — consistent, no action.

### 2. NO byte-identical (no Norwegian wording change) — PASS
`git diff 78f9e733 -- 'lib/mail/*.test.ts'`: net +544 / −23. Examined every removed line:
- 11× `lang="nb"` → `lang="no"` (the only allowed lang change, one per template).
- All other removals are **whitespace-only collapses** — source HTML that previously broke a
  Norwegian sentence across lines now renders the catalog string on one line with a single
  space. Verified for cupStarted ("...Granskogen. Først til 10 point vinner."), invite
  ("For å komme i gang: gå til ... koden du får tilsendt."), and productUpdate
  ("...du er på Tørny. Meld deg av månedsbrevet, eller styr det fra profilen din.").
  Wording is byte-identical in every case. No Norwegian copy changed.

### 3. EN renders idiomatically — PASS
- Every template has ≥1 EN snapshot case; EN copy is natural idiomatic English with no raw
  keys and no Norwegian leakage. EN `common.footerTagline` = "Tørny — fire up your golf
  tournament in a couple of minutes." (canonical brand subordinate form).
- **gameFinished** has **9 EN cases** covering every distinct copy path:
  - Ordinals via `selectordinal` render correctly: **1st / 2nd / 3rd** place (and "out of N").
  - Plurals via `plural` render correctly: **"1 point"** (singular) vs **"38 points"** (plural).
  - Matchplay **all three branches** covered — won ("You won 3&2 over Per. Congratulations
    on the win!"), lost ("You lost 1up to Per. Well played. Maybe a rematch next round?"),
    tied ("...ended all square (AS). A close one. Maybe next time.").
  - HTML escaping preserved (`3&amp;2`).
- Cross-surface naming verified: commit `b93cb72b` corrected mail EN footer to "Secretariat"
  to match the app's `admin.dashboard.actionsSecretary` = "Secretariat" in `en.json`
  (NO untouched: "Sekretariatet"). This is exactly the "product-surface name mismatch" the
  reviewer brief asked to check — caught and fixed.

### 4. Call-sites — PASS
Every fan-out site passes per-recipient locale:
- `sendGameFinishedNotification` ×2: `app/[locale]/admin/games/[id]/avslutt/actions.ts:232`
  and `app/[locale]/admin/games/[id]/actions.ts:474` both pass `locale: r.locale`.
- `sendProductUpdateDigest` (`lib/productUpdates/digest.ts:128`): selects `locale`, passes `r.locale`.
- `sendCupStartedNotification` (`lib/cup/actions.ts:322`) + `sendCupFinishedNotification`
  (`:416`): cup recipients query selects `users(...locale)` and populates it; both pass `r.locale`.
- `FinishedMailRecipient.locale: string | null` (`gameFinishedRecipients.ts:30`); every
  construction site populates `locale: row.users?.locale ?? null` (lines 134, 211, 242, 305,
  406, 443, 474, 576, 604, 704, 766) — all join selects include `locale`.
- Single-recipient sites resolve recipient locale: scorecardSubmitted (`submit/actions.ts:201`
  `a.locale`), deliverReminder (`deliveryReminder.ts:46` `player.locale ?? null`),
  registrationRequest (`signup/actions.ts:439` extra slim admin lookup → `adminRow.locale`),
  registrationApproved/Rejected (`signups/actions.ts:250/367` select `locale` → `u.locale`).
- Account-less left at default (no locale passed): `sendInviteNotification` (all 4 call-sites)
  and `sendTeamInvitationMail` (`teamActions.ts:498`) → default `'no'`. Correct per contract.

### 5. Fallback — PASS
`lib/mail/i18n.ts`: `resolveMailLocale = toSupportedLocale(locale) ?? routing.defaultLocale('no')`.
`toSupportedLocale` lowercases, matches `routing.locales = ['no','en']`, applies
`LANGUAGE_ALIASES {nb→no, nn→no}`, else `null`. Proven empirically via `npx tsx` rendering a
real mail subject:

```
"gd" => no | "Du er invitert til Tørny"      "ga" => no | (norsk)
"sv" => no | (norsk)                          "xx" => no | (norsk)
null => no | (norsk)                          undefined => no | (norsk)
"nn" => no | (norsk)                          "NB" => no | (norsk)
"EN" => en | "You're invited to Tørny"  (case-insensitive)
```

`gd`/`ga`/unknown/null → Norwegian, never a raw key, never empty. PASS.

### 6. Catalog parity — PASS
`mail` namespace: **111 keys in `no.json`, 111 in `en.json`, identical sets** (0 only-in-NO,
0 only-in-EN). `catalogParity.test.ts` green. Dynamic invite mode-hint reads
(`modes[mode]`, `formatGuide.content[mode].summary`) go through the merged catalog and return
`null` defensively on a miss — a missing key cannot leak `mail.x.y` into a mail.

### 7. Auth-mail doc — PASS
`docs/email-templates.md` §1 (Magic Link / Confirm Signup): genuinely language-neutral —
body is brand wordmark `Tørny.` + `{{ .Token }}` code + decorative hourglass + `60 min`
(language-neutral abbreviation), no translatable prose. Subject `{{ .Token }} · Tørny` is
code-forward. §4 (Confirm Signup) explicitly reuses "nøyaktig samme språknøytrale mal som
seksjon 1". Dashboard paste path present (§"Hvor du limer dem inn", steps 1-5). Rationale
"scales to N languages" documented (lines 30-32) plus the why-no-security-footnote note.
Commit `ba8275fc`.

### 8. Version / CHANGELOG — PASS
`package.json` = **1.126.0**. `CHANGELOG.md` has `## 1.126.y — Mailene på ditt språk` series
with `### [1.126.0] - 2026-06-14 · #594`, three-layer format (theme + tagline blockquote +
Teknisk details). Activation commit `6644fdba` is **`feat`** and stages both `package.json`
(version change) and `CHANGELOG.md` — commit-msg-hook discipline satisfied. The other 12
commits are correctly `refactor`/`docs` (template migrations are non-user-visible until
activation).

### 9. Mail-link locale correctness (extra reviewer check) — PASS
`mailUrl(locale, path)` applies `/en` prefix only for non-default locales, only to the app
base URL. API routes correctly bypass the prefix:
- `productUpdateDigest.ts:67`: unsubscribe uses bare `APP_BASE_URL/api/unsubscribe/...` (no prefix). Correct.
- `teamInvitation.ts:58`: prefix on base only, `next=` path unchanged. Correct.
- gameFinished/cup/registration links all use `mailUrl` for app routes. EN snapshot confirms
  `https://tornygolf.no/en/games/game-1/leaderboard`. Correct.
- All 11 templates derive `<html lang="${loc}">` (never hardcoded).

---

## Findings

### Non-blocking (low severity, cleanup)

1. **Dead catalog keys — defined in both no.json + en.json but never read** (low).
   Parity holds and rendering is unaffected, but these keys are dead cruft:
   - `mail.cupStarted.heading` (= `'{salutation}'`) — never read; cupStarted uses
     `cupStarted.salutationNamed`/`salutationGeneric` instead.
   - `mail.deliverReminder.footerText` — template renders `deliverReminder.footer` (HTML) +
     `common.footerTagline` (text); this key is unused.
   - `mail.registrationApproved.footerText` — same pattern; unused.
   - `mail.scorecardSubmitted.footerText` — same pattern; unused.
   Suggested cleanup: delete the 4 keys from both catalogs (parity-safe). Worth a follow-up
   issue, not a blocker.

2. **`inviteToGameActions.ts:223` `'En arrangør'` fallback** (informational).
   The inviter-name fallback is hardcoded Norwegian. It's data passed into the template (not
   template prose), and invites are always `'no'` by design, so it's consistent today. If
   account-less invites ever localize, this would need a catalog key. No action now.

---

## Conclusion

The implementation fully satisfies the contract. All 11 templates are locale-aware with
per-recipient locale wiring at every fan-out and single-recipient call-site; account-less
invites correctly default to Norwegian; fallback is robust (proven empirically); the Norwegian
output is byte-identical except `lang="nb"→"no"` and whitespace; the English output is
idiomatic with correct ICU ordinals/plurals and full matchplay branch coverage; catalog parity
holds (111/111); the auth-mail doc is genuinely language-neutral and paste-ready. Gates all
green (tsc clean, 127 mail+parity tests, build OK, 284 broader tests). The only findings are
4 dead catalog keys worth a cleanup follow-up.

**ACCEPT.**
