# Spec: Vis typisk slope/CR-range som hint på tee-rating-skjemaet

**Issue:** [#235](https://github.com/jdlarssen/golf-app/issues/235) — utsatt fra Fase 1 av [#223](https://github.com/jdlarssen/golf-app/issues/223)
**Berører:** `/admin/courses/new` + `/admin/courses/[id]/edit` (samme `CourseForm`-komponent)
**Bump:** PATCH — UX-polish uten ny capability

## Problem

Slope- og CR-feltene i tee-rating-blokken aksepterer hele WHS-grensen (slope 55–155, CR 50–80) uten å gi admin noen indikasjon på hva som faktisk er typisk. På norske 18-hulls baner ligger herre-tee normalt slope 110–135 og CR 67–72. Admin kan taste 75 for slope ved en feiltagelse (kanskje fra «CR-koden satt seg fast i hodet») og lagre uten å oppdage avviket. Feltet aksepterer det, formen lagrer det, og course handicap-beregningen på neste spill blir feil.

Dagens UX gir kun en `placeholder="113"` / `placeholder="70.0"` på herre-blokken — den forsvinner i det øyeblikket admin begynner å taste. Dame- og junior-blokkene har ingen placeholder.

## Research Findings

Ingen eksterne biblioteker. Funn fra kode-scouting:

- **`Input`-komponenten ([components/ui/Input.tsx:29-31](components/ui/Input.tsx:29)) støtter allerede en `hint`-prop** som rendres som muted `<p className="text-xs text-muted mt-1.5">`-tekst under feltet. Banelengde-feltet bruker den allerede ([CourseForm.tsx:310](app/admin/courses/CourseForm.tsx:310)). Ingen ny UI-komponent kreves.
- **`GenderRatingBlock` ([CourseForm.tsx:461-541](app/admin/courses/CourseForm.tsx:461)) får `gender: 'mens' | 'ladies' | 'juniors'`** som prop. Hint-tekst kan slås opp fra en const-map per gender uten ny prop-overflate.
- **DB-grensen er strikt: slope 55–155, CR 50–80** ([0001_initial_schema.sql:tee_boxes](supabase/migrations/0001_initial_schema.sql)) — håndheves av `min`/`max`-attributter på Input-feltene allerede. Hint-tekst trenger ikke duplisere DB-grensen, kun foreslå *typisk* range innenfor den.
- **Tørny støtter foreløpig kun norske 18-hulls baner** (per CLAUDE.md). Typisk-range-verdiene under er kalibrert for det.

## Prior Decisions

- **Fra [223-courses-phase1-vedlikehold-og-filter.md](.forge/contracts/223-courses-phase2-vedlikehold-og-filter.md):** Lengde-sanity-warning ble droppet i Fase 1. Dette issuet er det smale slope/CR-hint-stykket som ble utsatt — fortsatt under epic-paraplyen til #223 men separat fra Fase 2/3/4.
- **Fra Fase 1:** `MAX_TEE_BOXES = 7`, `DEFAULT_TEE` har `slope_mens: '113'` og `course_rating_mens: '70.0'` som default-verdier (allerede pre-utfylt) — beholdes uendret. Hint-tekst er supplerende.
- **Fra diskusjon (denne sesjonen):** Statisk hint, ingen dynamisk soft-warning. Range-tall gjelder for alle tre kjønn.

## Design

### Hint-tekst per kjønn

Legg til en `HINTS`-const i `CourseForm.tsx` (close-by til `DEFAULT_TEE`):

```ts
const TYPICAL_HINTS: Record<'mens' | 'ladies' | 'juniors', { slope: string; cr: string }> = {
  mens: { slope: 'Typisk 110–135', cr: 'Typisk 67–72' },
  ladies: { slope: 'Typisk 115–140', cr: 'Typisk 68–73' },
  juniors: { slope: 'Typisk 95–125', cr: 'Typisk 60–68' },
};
```

I `GenderRatingBlock` videresend `hint`-prop til hver `Input`:

```tsx
<Input
  // ... eksisterende props ...
  hint={TYPICAL_HINTS[gender].slope}
/>
<Input
  // ... eksisterende props ...
  hint={TYPICAL_HINTS[gender].cr}
/>
```

Tekst bruker norsk lang-tankestrek (`–`, U+2013) for tall-intervaller per CLAUDE.md-konvensjon.

### Plassering og visuell vekt

`Input`-komponenten rendrer `hint` som muted `text-xs` rett under feltet. Det gir nøyaktig den lette, alltid-synlige tekst-luftigheten issue-en ber om — ingen ekstra spacing, ingen kontraster med error-rødt. Hint-en er identisk i look til «Valgfritt. Total bane-lengde …» på banelengde-feltet, så den glir inn med eksisterende mønster.

Hver `GenderRatingBlock` får dermed:

```
┌─ HERRER ──────────────────────────────┐
│  ┌──────────┐    ┌──────────┐         │
│  │ Slope    │    │ CR       │         │
│  │ 113      │    │ 70.0     │         │
│  └──────────┘    └──────────┘         │
│  Typisk 110–135  Typisk 67–72         │  ← ny hint-rad
│                                       │
│  Par-total: 72 (sum av hullene)       │
└───────────────────────────────────────┘
```

### Placeholder-håndtering

Beholder dagens herre-placeholder (`113` / `70.0`) som suggested-value uendret. Damer/junior beholder tomme placeholders — vi vil ikke pre-foreslå konkrete tall der admin oftere taster verdier som *avviker* fra suggested-value (dame-slope varierer mer enn herre-slope).

### Ingen dynamisk warning

Soft-warning når verdi er innenfor DB-grense men utenfor typisk range (f.eks. slope=75 for menn) ble vurdert og droppet. Begrunnelse:
- Krever ny visuell state i `Input`-komponenten (warning ≠ error)
- Faren er at warning-en støyer på legitime randverdier (klubb-Cup-tee med slope 105)
- Statisk hint fanger den dominerende feilen («jeg taster CR-tall i slope-feltet») ved at admin ser intervallet før de taster

Hvis admin-bruksdata senere viser at faktiske taste-feil slipper gjennom hint-en, kan dynamisk warning legges til som follow-up uten å berøre hint-en.

## Edge Cases & Guardrails

- **Eksisterende lagrede tees med ratings utenfor typisk range:** Hint-en er *alltid* synlig — den skifter aldri farge eller blir borte basert på lagret verdi. Eksisterende rader påvirkes ikke; admin ser bare hint-en når de åpner edit-formen.
- **Dame/junior-blokk kollapset:** Hint-en rendres innenfor `GenderRatingBlock`, så når blokken er kollapset (replaced av «+ Legg til dame-rating»-knappen) vises ingen hint — det er riktig oppførsel.
- **Hint-tekst i error-tilstand:** `Input`-komponenten viser enten hint *eller* error ([Input.tsx:29-32](components/ui/Input.tsx:29)) — aldri begge. Hvis vi senere legger til client-side validering med error-meldinger, vil hint-en automatisk gi plass. Ingen konflikt i dag (formen har ingen client-side error-state på slope/CR).
- **Tegn-bredde på smal viewport:** Hint-tekst ligger på samme rad-nivå som feltet, og grid er `grid-cols-2 gap-2` ([CourseForm.tsx:500](app/admin/courses/CourseForm.tsx:500)). «Typisk 110–135» er 16 tegn, «Typisk 67–72» er 13 tegn — passer trygt i halv-bredde-kolonne selv på iPhone SE (320px viewport).
- **Snapshot-tester eller stress-tester på existing CourseForm:** Snapshot-tester finnes ikke. CourseForm.test.tsx har 20+ tester som ikke asserter mot hint-tekst (de tester par-knapper, par-total, gender-toggle). Eksisterende tester påvirkes ikke.

## Key Decisions

- **Statisk hint, ingen dynamisk warning.** Bruker valgte dette i diskusjonen. Lavt scope, fanger dominerende feil-modus, ingen ny UI-state-kompleksitet.
- **Hint på alle tre kjønn (mens/ladies/juniors), ikke bare herre.** Bruker valgte dette i diskusjonen. Symmetrisk UX og hjelper også admins som først lærer å rate dame/junior-tees.
- **PATCH-bump, ikke MINOR.** Dette er polish av en eksisterende feature, ikke ny capability. Brukeren kan gjøre nøyaktig samme handling som før — bare med bedre veiledning.
- **Norsk lang-tankestrek (–, U+2013) for tall-intervaller.** Per CLAUDE.md humanizer-konvensjon. Ikke hyphen (-), ikke em-dash (—).
- **Range-tall:**
  - Menn: slope **110–135**, CR **67–72** (fra issue-en, kalibrert mot norske herre-tees)
  - Damer: slope **115–140**, CR **68–73** (litt høyere — damer spiller ofte fra kortere tee men slope-formelen tar hensyn til lengde-fordel-forskjell)
  - Junior: slope **95–125**, CR **60–68** (lavere — kortere tee, mindre vanskelighetsgrad)

**Claude's Discretion:**
- Eksakt navngiving av const (`TYPICAL_HINTS` vs `HINTS_PER_GENDER` vs `SLOPE_CR_HINTS`). Anbefales: `TYPICAL_HINTS` — kort og selvforklarende.
- Plassering av const-en i fila (over eller under `DEFAULT_TEE`). Anbefales: rett under `DEFAULT_TEE` for tematisk nærhet.
- Om hint-teksten skal være sentrert med feltet eller venstrejustert. Anbefales: behold default (venstrejustert, samme som banelengde-hint).

## Success Criteria

- [ ] `TYPICAL_HINTS`-const eksisterer i `CourseForm.tsx` med eksakte tall: menn 110–135/67–72, damer 115–140/68–73, junior 95–125/60–68. Verifikasjon: `grep -n "TYPICAL_HINTS" app/admin/courses/CourseForm.tsx` + visuell sjekk av const-innhold.
- [ ] Slope-feltet under «HERRER»-fieldset rendrer `<p>` med teksten «Typisk 110–135» rett under input-en. Verifikasjon: vitest-case som rendrer `CourseForm` uten initialData (default mens-blokk åpen) og asserter `screen.getByText('Typisk 110–135')` finnes.
- [ ] CR-feltet under «HERRER»-fieldset rendrer `<p>` med teksten «Typisk 67–72» rett under input-en. Verifikasjon: vitest-case som asserter `screen.getByText('Typisk 67–72')` finnes.
- [ ] Dame-blokken (når ekspandert) rendrer hint «Typisk 115–140» og «Typisk 68–73». Verifikasjon: vitest-case som ekspanderer dame-blokken via «+ Legg til dame-rating»-knapp og asserter hint-tekstene.
- [ ] Junior-blokken (når ekspandert) rendrer hint «Typisk 95–125» og «Typisk 60–68». Verifikasjon: tilsvarende vitest-case for junior-blokken.
- [ ] Eksisterende 20+ CourseForm-tester forblir grønne. Verifikasjon: `npx vitest run app/admin/courses/CourseForm.test.tsx`.
- [ ] Versjon bumpet (PATCH) i `package.json` og `CHANGELOG.md` har ny oppføring under nåværende minor-serie med tagline om typisk-range-hint. Verifikasjon: `git diff package.json CHANGELOG.md` viser bump + entry.

## Gates

- [ ] `npx tsc --noEmit` passerer
- [ ] `npx vitest run app/admin/courses/CourseForm.test.tsx` passerer (eksisterende + nye tester)
- [ ] `npx eslint app/admin/courses/CourseForm.tsx` ingen errors
- [ ] Pre-commit-hook (humanizer): ingen advarsler på «Typisk 110–135» etc — tankestrek er U+2013 (riktig), ingen anglisismer
- [ ] Commit-msg-hook godtar `fix(...)` med samtidig bump av `package.json` + CHANGELOG.md

## Files Likely Touched

- `app/admin/courses/CourseForm.tsx` — legg til `TYPICAL_HINTS` const + `hint`-prop på de to `Input`-feltene i `GenderRatingBlock`
- `app/admin/courses/CourseForm.test.tsx` — nye tester (3 kjønn × 2 felt = 6 assertions, kan grupperes til 1-2 describe-blokker)
- `package.json` — PATCH bump
- `CHANGELOG.md` — ny oppføring under aktiv minor-serie med tagline («Når du legger til en tee og taster slope/CR, ser du nå …»)

## Out of Scope

- **Dynamisk soft-warning** når verdi er utenfor typisk range (vurdert og droppet — kan legges til senere uten å berøre hint-en).
- **Pre-utfylling av damer/junior** med suggested-default på linje med dagens herre-default (113/70.0). Hint er guideline, ikke pre-fill.
- **Validering eller blokk** av slope/CR-verdier utenfor typisk range. DB-grensen (55–155 / 50–80) håndheves uendret.
- **Hint på banelengde, par eller hull-SI-feltene.** Banelengde har allerede hint; par-knapper har egen tap-UI; SI er strikt 1–18.
- **Endring av `DEFAULT_TEE`-verdier eller `Input`-komponenten.** Vi gjenbruker eksisterende `hint`-prop som-er.
- **Database-migration.** Ingen DB-endring kreves.
- **Per-bane-overstyring av typisk-range** (forskjellig hjemme-bane vs. par-3-bane). Range-tall er hardkodet for «norske 18-hulls baner» som dekker dagens Tørny-bruk.
