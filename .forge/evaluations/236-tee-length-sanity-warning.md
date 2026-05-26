# Evaluation: #236 Sanity-warning for tee-lengde

**Verdict:** ACCEPT
**Date:** 2026-05-26
**Evaluator:** fresh-context sub-agent

## Criterion verdicts

- **K1 — Pure helper finnes:** ACCEPT
  - `lib/courses/teeLengthWarning.ts` eksporterer `getTeeLengthWarning(tee: TeeLengthWarningInput): string | null` (linje 57–75).
  - Modulen er ren: ingen `import`-statements som har sideeffekter, ingen `console.*`, ingen `window`/`document`/`localStorage`. Kun konstanter (`GENDER_RANGES`, `ALL_GENDERS`) og private helpers (`isActiveGender`, `genderText`) som er deterministiske funksjoner av input.
  - Eksporterer også `TeeLengthWarningInput`-typen for typesikker integrasjon.

- **K2 — Helper håndterer alle 8 gender-kombinasjoner:** ACCEPT
  - `lib/courses/teeLengthWarning.test.ts` har 25 tester organisert i 9 `describe`-blokker som dekker:
    - `no active gender` → null selv ved ekstreme verdier (500/12000)
    - `mens only` — boundaries 5300/6600 → null, mid → null, 4500 → "kort", 7500 → "lang"
    - `ladies only` — 5000 → null, 4500 → "kort", 6100 → "lang"
    - `juniors only` — 5000 → null, 5700 → "lang", 4000 → "kort"
    - `mens + ladies` — union-boundaries 4700/6600 → null, 4500 → "kort dame-/herretee", 6700 → "lang dame-/herretee"
    - `mens + juniors` — 6800 → "lang herre-/juniortee"
    - `ladies + juniors` — 6100 → "lang dame-/juniortee"
    - `all three genders` — boundaries 4400/6600 → null, 7000 → "lang tee for alle kjønn", 4000 → "kort tee for alle kjønn"
    - `partial gender activation` — verifiserer at kun-slope eller kun-CR teller som aktiv
    - `invalid or empty length` — `""`, `"abc"`, `"   "` → null
  - Alle 8 gender-konfigurasjoner i kontrakt-tabellen er dekket. Boundary-tester er på rett side av inkluderende-grensen.
  - Test-run: `npm run test -- lib/courses/teeLengthWarning` → 25/25 passed (590ms).

- **K3 — `Input`-komponenten støtter `warning`-prop:** ACCEPT
  - `components/ui/Input.tsx` linje 5 destrukturerer `warning`, linje 14 deklarerer `warning?: string | null` i type-shape.
  - Render-prioritet (linje 31–37): `error` (rød) først, deretter `warning` (`text-warning`-token, amber), til slutt `hint` (muted). Match kontrakt-prioriteten error > warning > hint. `hint` skjules når enten error eller warning er aktiv.
  - Posisjonen er identisk med `hint` (samme `<p>`-wrapper, samme `text-xs mt-1.5`).
  - Eksisterende callsites upåvirket: `npx tsc --noEmit` → exit 0, ingen utdata (alle eksisterende `<Input ... hint=... error=... />`-callsites kompilerer fortsatt).

- **K4 — `CourseForm` viser warning under banelengde:** ACCEPT
  - `app/admin/courses/CourseForm.tsx` linje 6 importerer `getTeeLengthWarning` fra `@/lib/courses/teeLengthWarning`.
  - Linje 312 sender `warning={getTeeLengthWarning(tee)}` til Banelengde-input-en (`id={tee_${index}_length_meters}`). Siden komponenten re-renders ved endring av tee-staten, oppdateres warning reaktivt ved length-endringer OG ved gender-blokk-toggling.

- **K5 — Lagring ikke blokkert (ingen actions.ts-endringer):** ACCEPT
  - `git diff --name-only d6fae05~1..HEAD` lister kun: `.forge/contracts/236-...md`, `CHANGELOG.md`, `app/admin/courses/CourseForm.tsx`, `components/ui/Input.tsx`, `lib/courses/teeLengthWarning.ts`, `lib/courses/teeLengthWarning.test.ts`, `package.json`.
  - Ingen `actions.ts`-filer i diff. Verifisert at `app/admin/courses/new/actions.ts` og `app/admin/courses/[id]/edit/actions.ts` ikke berøres.

- **K6 — Versjon + CHANGELOG:** ACCEPT
  - `package.json` linje 3: `"version": "1.30.0"` (bumpet fra 1.29.0).
  - `CHANGELOG.md` har nytt `## 1.30.y — Trygghetsnett for tee-lengde` tema-heading (linje 13–15) med stakeholder-sammendrag, etterfulgt av `### [1.30.0] - 2026-05-26` med tagline (linje 19) som blockquote: «Når du taster inn banelengde for en tee i bane-admin, sier appen nå fra hvis tallet ser uvanlig ut…».
  - Forrige 1.29.y-serie wrappet i `<details>` (linje 41–70). Pattern matcher CLAUDE.md sin policy.
  - `git show --stat 969f9f0` bekrefter at `package.json`, `CHANGELOG.md` og `CourseForm.tsx` + `Input.tsx` ble committet sammen (i SAMME commit som den bruker-synlige endringen). Helper-filen ble committet separat som `chore(courses)` i d6fae05 (prep), men siden helperen ikke var bruker-synlig før den ble wired i CourseForm, er bump på den «aktiverende» commiten korrekt.
  - En oppfølger-commit (d4e12c1, `docs(changelog)`) polerte vekk `range` og `Soft-warning`-anglisismer i CHANGELOG-prosa.

- **K7 — Norsk språk-kvalitet:** ACCEPT
  - User-visible warning-template i `lib/courses/teeLengthWarning.ts` linje 74: `Uvanlig ${direction} for norsk ${genderText(active)} (${min}–${max} m).` Bruker idiomatisk norsk, ingen anglisismer.
  - Gender-tekst-mapping (linje 48–54): «herretee», «dametee», «juniortee», «dame-/herretee», «herre-/juniortee», «dame-/juniortee», «tee for alle kjønn». Konsistent norsk.
  - CHANGELOG 1.30.y-seksjonen (linje 13–35): Tagline-en er på «Jørgen-språk» med «Når du …»/«Du blir ikke stoppet …». Polert i d4e12c1: `range → intervall`, `Soft-warning → Et mykt varsel`.
  - Ingen «Vennligst», ingen em-dash-kjeder (X — Y — Z; enkelt-em-dash er OK og brukes naturlig), ingen «Tap»-anglism, ingen «X-spillet»-redundans.
  - Note: Code-comments i `teeLengthWarning.ts` linje 1 inneholder «Sanity-warning», «Soft-warning», «typisk norsk range» — men dette er developer-prosa (kommentarer), ikke user-visible. Utenfor K7-scope per CLAUDE.md sin distinksjon.

## Gates

- **typecheck:** PASS — `npx tsc --noEmit` exit 0, ingen utdata.
- **lint:** PASS — `npm run lint -- components/ui/Input.tsx app/admin/courses/CourseForm.tsx lib/courses/teeLengthWarning.ts lib/courses/teeLengthWarning.test.ts` clean, ingen utdata.
- **test:** PASS — 1206/1206 (103 test-files). Helper-spesifikk: 25/25 (`teeLengthWarning.test.ts`).
- **build:** PASS — `npm run build` → «Compiled successfully in 2.7s», 27 sider generert.

## Issues found

Ingen blokkerende issues.

Mindre observasjoner (ikke blokkerende):

1. **Code-comments i `lib/courses/teeLengthWarning.ts` (linje 1–7)** inneholder dev-prosa-anglismer («Sanity-warning», «Soft-warning», «norsk range»). Disse er ikke user-visible og er bevisst utenfor humanizer-scope per CLAUDE.md («tester, kommentarer og console.log skannes ikke»). Kunne strammes ved en senere code-comment-pass hvis ønskelig, men er ingen kontrakt-brudd.

2. **Test-blokken `juniors only` mid-range bruker 5000 m** — det er innenfor union 4400–5600 for kun-juniors og verifiserer null. Coverage er solid; ingen mangler.

## Notes / residual risks

- **Manuell UI-verifikasjon ikke kjørt** — Playwright MCP er ikke satt opp i denne sub-agent-sessionen. Test-planen i kontrakten (steg 1–7 mot `/admin/courses/new` og `/admin/courses/[id]/edit`) bør spot-sjekkes manuelt av brukeren før merge. Risikoen er lav siden:
  - Helper-en er ren og fullt dekket av 25 unit-tester.
  - Input-komponenten testes implisitt via tsc + build, og posisjons-rendring av warning under feltet er rett analog til eksisterende `hint`-rendring.
  - Reaktivitet kommer gratis fra React siden `getTeeLengthWarning(tee)` kjøres på hver render og `tee` er kontrollert state.

- **Range-grenser (±100m romsligere enn issue-en)** — bevisst beslutning dokumentert i contract «Gray areas → 1». Hvis brukeren tester med en grenseverdi som 6550 m og forventer warning, vil de ikke se det. Dette er korrekt design (issue-tallene var indikative, ikke harde grenser).

- **Helper-filen og bruker-aktiverende endring i ulike commits** — d6fae05 (helper + tester, `chore`) og 969f9f0 (wiring + bump + CHANGELOG, `feat`). Det er innenfor commit-msg-hookens regler siden `chore`-commiten er pre-feature-prep og ikke bruker-synlig isolert. Bump-en lander på `feat`-commiten der det blir bruker-synlig — riktig per CLAUDE.md-disiplinen.
