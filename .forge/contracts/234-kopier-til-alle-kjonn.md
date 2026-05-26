# Kontrakt: «Kopier til alle kjønn»-helper på tee-rating-skjemaet

**Issue:** [#234](https://github.com/jdlarssen/golf-app/issues/234)
**Branch:** `claude/stoic-sammet-5a66ab`
**Status:** Implemented — evaluating

## Evidence

- Knapp + plassering: [app/admin/courses/CourseForm.tsx:351-364](app/admin/courses/CourseForm.tsx) — `text-[11px] font-medium text-muted` text-link mellom herrer-block og dame-toggle.
- Visibility: same lines — `tee.slope_mens !== '' && tee.course_rating_mens !== '' && (tee.slope_ladies === '' || ... || tee.course_rating_juniors === '')`.
- Click handler: [app/admin/courses/CourseForm.tsx:198-210](app/admin/courses/CourseForm.tsx) `copyMensToAllGenders(index)`.
- Per-tee: handler is index-scoped; verified by test "skjuler kopier-knappen på den tee-en hvor klikket skjedde, men ikke på andre tee-er".
- Tests: 6 new cases in [app/admin/courses/CourseForm.test.tsx:272-451](app/admin/courses/CourseForm.test.tsx). `npx vitest run` → 1187 passed (102 files).
- Lint: `npx eslint app/admin/courses/CourseForm.tsx CourseForm.test.tsx` clean (pre-existing baseline errors in `e2e/sync/offline-sync.spec.ts` are unrelated).
- Typecheck: `npx tsc --noEmit` clean.
- Bump + CHANGELOG: package.json 1.29.0 → 1.29.1, oppføring under `## 1.29.y` ([CHANGELOG.md:17-37](CHANGELOG.md)).
- Commit: `d724b7a feat(admin/courses): «Kopier til alle kjønn»-helper på tee-rating`.

## Bakgrunn

Fase 1 av epic [#223](https://github.com/jdlarssen/golf-app/issues/223) (commit `3f19e4c`, 2026-05-25) innførte progressiv disclosure for slope/CR per kjønn på tee-rating-skjemaet i `app/admin/courses/CourseForm.tsx`. Herrer-blokken er alltid synlig; dame- og junior-blokkene kollapses bak «+ Legg til dame-rating» / «+ Legg til junior-rating»-knapper og åpnes når admin trenger dem.

For mange baner — særlig gul tee — er slope/CR nær identisk for herrer, damer og junior (typisk +1–2 på slope for damer, marginal CR-forskjell). Etter at herrer-tallene er tastet inn, må admin i dag eksplisitt: (1) åpne dame-blokken, (2) taste samme verdier, (3) åpne junior-blokken, (4) taste samme verdier. «Kopier til alle kjønn»-knappen gjør hele dette i ett klikk og lar admin justere etterpå hvis nødvendig.

## Scope

**In scope:**
- Én ny knapp under herrer-`GenderRatingBlock` i `CourseForm.tsx`.
- Synlighets-logikk basert på herrer-utfylt + minst ett av dame/junior har manglende slope eller CR.
- Klikk-handler som auto-ekspanderer kollapsede dame/junior-blokker og fyller slope + CR med herrer-verdier (overskriver alltid eksisterende verdier).
- Tester for synlighet, klikk-ekspansjon og overskriv-semantikk.
- CHANGELOG-oppføring + patch-bump.

**Out of scope:**
- Kopiere `par_total` (er auto-beregnet fra hull, ikke editerbart per kjønn — kun visningsverdi).
- Per-kjønn kopi-knapper («Kopier til damer», «Kopier til junior») — issue spec-er én samlet handling.
- Ny progressive-disclosure-oppførsel for andre felt på tee-en (navn, lengde).
- Database-migrasjoner — ingen schema-endring nødvendig.
- Andre QoL-helpere som ble nevnt i [#223](https://github.com/jdlarssen/golf-app/issues/223) Fase 1 men utsatt.

## Success Criteria

- [x] **Knappen finnes og er korrekt plassert.** En text-link-stil knapp (`type="button"`) med teksten «Kopier til alle kjønn» rendres mellom herrer-`GenderRatingBlock` og dame-seksjonen, per tee-boks. Stil-mønster: liten tekst, samme subtile lenke-følelse som «Fjern dame-rating»-knappen (text-[11px] eller -xs, font-medium, text-muted/text-text-hover).
- [x] **Synlighets-logikk.** Knappen vises kun når **alle disse** er sanne for nåværende tee:
  1. `slope_mens` er ikke tom streng.
  2. `course_rating_mens` er ikke tom streng.
  3. Minst én av: `slope_ladies`, `course_rating_ladies`, `slope_juniors`, `course_rating_juniors` er tom streng.
  
  Når begge dame- og junior-blokkene har komplette slope+CR-verdier (uansett om de matcher herrer eller ikke), skjules knappen.
- [x] **Klikk-handler oppfører seg korrekt.** Klikk utfører atomisk:
  1. Setter `slope_ladies` og `course_rating_ladies` til herrer-verdiene (overskriver eksisterende).
  2. Setter `slope_juniors` og `course_rating_juniors` til herrer-verdiene (overskriver eksisterende).
  3. Ekspanderer dame-blokken hvis kollapset.
  4. Ekspanderer junior-blokken hvis kollapset.
  5. Skjuler seg selv (siden begge nå har data).
- [x] **Per-tee uavhengighet.** I et skjema med flere tee-bokser (f.eks. Gul + Rød): klikk på Gul sin kopier-knapp påvirker kun Gul-radens dame/junior-felt, ikke Rød.
- [x] **Form-submit funker som vanlig.** Etter klikk skal FormData inneholde `tee_${index}_slope_ladies` og `_juniors` (samme verdier som `_mens`). Eksisterende server-action-validering (partial vs. complete per kjønn) i `[id]/edit/actions.ts` passerer fordi alle tre kjønn nå er komplette.
- [x] **Tester.** Minst tre nye tester i `CourseForm.test.tsx` som dekker:
  - Synlighet: knapp vises ikke før herrer er fylt, vises når herrer fylt + dame/junior tomme, skjules når begge andre kjønn fullt utfylt.
  - Klikk-effekt: knapp ekspanderer + fyller begge kollapsede blokker.
  - Overskriv: gitt dame har eksisterende verdier ulik herrer, fyller klikket med herrer-verdiene.
- [x] **CHANGELOG + version-bump.** Patch-bump (1.29.0 → 1.29.1) med stakeholder-tagline + Teknisk-seksjon. Norsk på tagline, kjørt mentalt gjennom humanizer (ingen anglisismer, ingen «X-spillet»-redundans, ingen em-dash-kjeder).

## UX-detaljer

**Knappe-tekst:** «Kopier til alle kjønn» (eksakt fra issue-tittel). Vurder å legge til en liten chevron/pil eller annet visuelt hint senere; for nå holdes det tekst-only for konsistens med «Fjern dame-rating»-knappen.

**Stil:** `text-[11px] font-medium text-muted hover:text-text transition-colors` eller tilsvarende. Plassering: full bredde, midt-justert eller venstre-justert under herrer-fieldset, med `mt-1` eller `my-2`-spacing. Skal IKKE være full-bredde dashed-border-knapp som dame/junior-«Legg til»-knappene — det ville visuelt konkurrere med disse.

**Tilgjengelighet:** `type="button"` (ikke submit). Ingen ekstra ARIA — tekst i seg selv er beskrivende. Min 44px tap-target via padding/spacing rundt (mobile-first).

**Brand-stemme:** Sjekk at «Kopier til alle kjønn» går klar gjennom humanizer-skill — «kopier» er fin imperativ-norsk, ingen anglisisme. (Sammenlign: «Copy to all genders» = tap.)

## Gates

Disse kjøres etter hver build-chunk:

```bash
npm run lint
npm run test -- CourseForm
# (Hele test-suiten kjøres som siste pre-evaluator-gate.)
```

TypeScript-check kjøres som del av `next build`, men for raskere feedback under build:
```bash
npx tsc --noEmit
```

## Filer som forventes endret

- `app/admin/courses/CourseForm.tsx` — knappe-render, klikk-handler, synlighets-logikk.
- `app/admin/courses/CourseForm.test.tsx` — nye tester.
- `package.json` — version-bump.
- `CHANGELOG.md` — ny oppføring under `## 1.29.y`-temaet (eller åpne ny minor-serie hvis stakeholder mener dette fortjener egen minor).

## Beslutninger (fra gråsone-diskusjonen)

1. **Overskriv-semantikk:** Knappen overskriver alltid eksisterende dame/junior-verdier. Issue-teksten støtter dette: «admin kan fortsatt justere etterpå om de vil ha forskjellige verdier».
2. **Plassering:** Tekst-lenke under herrer-blokken, ikke inni fieldset, ikke dashed-border full bredde.
3. **par_total kopieres ikke:** Det er en read-only auto-beregnet verdi per kjønn, ikke en input. Slope + CR er de eneste editerbare per-kjønn-feltene per kjønn.

## Non-goals (eksplisitt)

- Ingen toast-bekreftelse, ingen «Tilbakestill»-knapp. Klikket er ikke-destruktivt i den forstand at admin kan endre verdiene umiddelbart etter; ingen overengineering.
- Ingen telemetri/analytics-event.
- Ingen endring av eksisterende «Fjern dame-rating» / «+ Legg til dame-rating»-mønster.
- Ingen håndtering av case der herrer-verdiene er ugyldige (utenfor 55-155 slope, 50-80 CR). Klikket kopierer det som står; server-action-validering tar høyde for ugyldige tall ved submit.
