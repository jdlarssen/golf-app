# Kontrakt: #263 test-disiplin — additiv slice (helautonom)

**Issue:** [#263](https://github.com/jdlarssen/golf-app/issues/263) — Refactor: bring existing test suite in line with new test-disiplin
**Branch:** `claude/exciting-buck-07f0b0`
**Type:** Refactor + test (ingen bruker-synlig oppførselsendring → ingen version-bump)
**Eier-beslutning (2026-06-14):** «Additiv slice (helautonomt)» — ekstraher validering til pure funksjoner + Type A-tester, E2E norsk-streng → data-testid, ingen sletting. Resten av #263 dokumenteres som gjenstående.

## Bakgrunn — hva som faktisk gjenstår

#263 ble skrevet 2026-05-26. Dyp-rekon 2026-06-14 viser at premisset er i stor grad foreldet av akkumulert disiplin i nyere PR-er:

- **Kategori 5 (Resend-konsolidering): allerede shippet** — `lib/mail/__tests__/resend-contract.test.ts` + `_helpers.ts` finnes; de strukturelle testene er fjernet fra `gameFinishedNotification.test.ts`.
- **Kategori 2 (leaderboard Type C): i hovedsak gjort** — 180 tester over 34 filer, men flertallet er allerede 1 render-test/komponent (gjort av #496 hull-for-hull + #576 side-tournament). Rest-klyngen (Solo/Team Stableford+Strokeplay Podium/View) + matchplay-familien (by-design annerledes, jf. `project_matchplay_family_no_podium_no_reveal`). Reduksjon = **sletting → eier-gate** (descopet av eier).
- **Kategori 3 (admin-form): GameForm-validering allerede ekstrahert** til `lib/games/gamePayload.ts` (validateStableford/TexasScramble/Ambrose/SinglesMatchplay m.fl. + `gamePayload.test.ts`). Gjenstår: **CourseForm/course-action-validering**, som ligger inline i `createCourse`/`updateCourse` og er **duplisert** mellom `new/actions.ts` (267 L) og `[id]/edit/actions.ts` (432 L) — samme dup #598 flagger.
- **Kategori 4 (toContain-sweep): overlapper 2+3**; eneste ikke-overlappende fil er `lib/agent-monitor/morning-mail.test.ts`, som ved nærmere ettersyn er **strukturelle/sikkerhets-kontrakter** (HTML-escaping, lenke-URL-form), ikke copy-re-assertion. Per Type B-disiplinen beholdes strukturelle kontrakter som målrettede assertions → **ingen konvertering** (å legge til snapshot ville være gold-plating / PR #261-anti-mønster).
- **Kategori 6 (E2E-sweep): lite** — noen få norske string-literals i `e2e/auth/`.

Den eneste genuint verdifulle, additive, helautonome jobben er derfor **course-payload-validering → pure funksjoner + Type A-tester** (som i tillegg de-dupliserer new↔edit), pluss en liten E2E data-testid-sweep.

## Valg gjort (gråsoner avgjort)

- **Plassering:** `lib/courses/coursePayload.ts` (ikke issuets `lib/validators/`). Speiler `lib/games/gamePayload.ts`-presedensen; `lib/courses/` finnes allerede (`teeLengthWarning.ts`). `lib/validators/` var et 2026-05-26-forslag før gamePayload.ts etablerte mønsteret.
- **Oppførsel bevares 100 %:** de eksisterende action-testene (`new/actions.test.ts`, `[id]/edit/actions.test.ts`) er bevarings-sikringen. Ekstraksjonen er et trofast flytt av eksisterende logikk; action-ene leser FormData og kaller de pure funksjonene, og beholder `fail(code)`/redirect-orkestreringen. Ingen feilkoder endres.
- **Feilkoder, ikke copy:** validatorene returnerer kode-strenger (`bad_par`, `si_duplicate`, `tee_partial_rating` …). Norsk vises via `page.tsx`-mapping — ingen copy i pure-laget, så humanizer/no-nb ikke relevant her.
- **morning-mail:** ingen endring. Dokumenteres som «gjennomgått — strukturelle/sikkerhets-kontrakter, korrekt målrettet».
- **E2E:** kun statiske norske literals byttes til `data-testid` (legg testid på komponenten der det mangler). Playwright kan **ikke kjøres i dette miljøet** (krever dev-server + Supabase) → CI er den reelle gaten; her verifiseres via `tsc` + eksakt streng-paritet mellom komponent og spec.

## Suksesskriterier

- [x] **K1:** `lib/courses/coursePayload.ts` finnes med pure funksjoner som dekker gjeldende inline-logikk: gender-rating-parsing (slope 55–155 int, CR 50–80 finite), `isCompleteRating`, `isPartiallyFilledRating`, length-parsing (1000–12000 int el. null), par-validering (int 3–6), SI-validering (int 1–18) + SI-uniqueness. Ingen FormData/I/O i modulen.
  _Evidens: `lib/courses/coursePayload.ts` (commit dc94f07c) — 7 eksporter, kun rene funksjoner, ingen `FormData`-referanse._
- [x] **K2:** Co-lokalisert `lib/courses/coursePayload.test.ts` (Type A, `it.each` på range-kanter). RED før modulen fantes, så GREEN.
  _Evidens: RED = «Failed to resolve import ./coursePayload»; GREEN = `npx vitest run lib/courses/coursePayload.test.ts` → 36 passed._
- [x] **K3:** `new/actions.ts` + `[id]/edit/actions.ts` importerer fra `@/lib/courses/coursePayload`; de dupliserte inline-helperne + validerings-løkkene er erstattet. Atferd uendret.
  _Evidens: commit 188b0bb2, `git diff --stat` = 63 ins / 123 del (−60 netto duplisering)._
- [x] **K4:** Eksisterende action-tester grønne uendret.
  _Evidens: `npx vitest run new/actions.test.ts edit/actions.test.ts coursePayload.test.ts` → 3 filer / 58 tester passed._
- [x] **K5:** E2E data-testid-sweep: statiske norske `getByText`-literals i `login.spec.ts` + `invitation-flow.spec.ts` byttet til `getByTestId` (invite-toggle, success-banner, self-reg-helper), med matchende `data-testid` på komponenten. `tsc` grønn; streng-paritet 1:1 verifisert. Playwright ikke kjørt (ikke runnable i miljøet) → CI er reell gate. (`getByText(hilsen)` i `manual-approval.spec.ts` beholdt — dynamisk variabel, ikke copy-lås.)
  _Evidens: commit 213ba056; paritet-grep: alle 3 ider component=1/spec=1; «getByText('...')» i swept specs = 0 igjen; SendCodeForm.test.tsx (co-located) fortsatt 3 passed._
- [x] **K6:** Full gate grønn: `npx tsc --noEmit` (exit 0) + `npm run build` (route-manifest generert) + full `npx vitest run` (268 filer / 3414 tester passed, ingen regresjon).
- [ ] **K7:** Issue-kommentar postet på #263 som dokumenterer hva som er gjort + nøyaktig hva som gjenstår.

## Gates (etter hver atomic commit, scoped til endring)

| Gate | Kommando | Krav |
|---|---|---|
| Ny Type A-test | `npx vitest run lib/courses/coursePayload.test.ts` | grønn |
| Action-tester | `npx vitest run "app/[locale]/admin/courses/new/actions.test.ts" "app/[locale]/admin/courses/[id]/edit/actions.test.ts"` | grønne uendret |
| Typer | `npx tsc --noEmit` | 0 feil |
| Build | `npm run build` | grønn |
| Full suite (sluttgate) | `npx vitest run` | ingen regresjon |

## Utenfor scope (descopet med begrunnelse)

- **Kategori 2 leaderboard-sletting** + **kategori 3 admin-form komponenttest-reduksjon** — krever eier-go-ahead per test-disiplin; eier valgte additiv-only. Dokumenteres som gjenstående.
- **morning-mail.test.ts** — ingen endring (strukturelle/sikkerhets-kontrakter, korrekt målrettet).
- **GameForm-validering** — allerede ekstrahert til `lib/games/gamePayload.ts`. Å flytte til `lib/validators/` = meningsløs churn som bryter dusinvis av kommentar-referanser.
- **Migrasjon av eksisterende mail-test-filer til `_helpers.ts`** — separat follow-up (jf. kategori-5-kontrakt).
- **Ingen version-bump** — ren refactor/test, ingen bruker-synlig oppførselsendring.
