# Forge-kontrakt: «Tøm dette kjønnet»-knapp på tee-rating-skjemaet

**Issue:** [#238](https://github.com/jdlarssen/golf-app/issues/238)
**Branch:** `claude/dreamy-khayyam-f6a685`
**Type:** UX-fix på admin-flyten — defensiv mot partial-rating-feilen.

## Kontekst

Partial-rating-feilmeldingen i admin-flyten — «Hver tee må ha både slope og CR (eller ingen av dem) per kjønn. Du kan ikke lagre halve sett» — trigger når admin har fylt bare ett av to felt for et kjønn. I dag er recovery å manuelt nullstille begge feltene, og for herrer er det den eneste utveien (herre-blokken er alltid synlig og har ingen Fjern-knapp).

[GenderRatingBlock](app/admin/courses/CourseForm.tsx:461) rendrer hver kjønns-rating som et fieldset med slope+CR-inputs. Damer/Junior har i dag en «Fjern X-rating»-knapp i legend-headeren som *både* tømmer felter OG kollapser blokken (via `toggleGenderExpand`). Herrer har ingen tilsvarende affordance.

Denne kontrakten erstatter Fjern-mønsteret med en konsekvent «Tøm dette kjønnet»-link på alle tre kjønn — single-purpose: nullstill slope+CR, behold blokk-state.

## Beslutninger fra diskusjon (gråsoner)

1. **Scope: alle tre kjønn.** Damer/Junior beholder ikke en separat Fjern-knapp — Tøm erstatter den. Block-state håndteres som default: damer/junior kollapser fra start (new-flyt) eller åpner seg på edit hvis data finnes. Etter Tøm står blokken åpen med tomme felt; tom slope + tom CR for et kjønn er gyldig submit-state (ingen rating for det kjønnet), så ingen UI-affordance for å re-kollapse er nødvendig.
2. **Visibility på herrer-blokken: new vs. edit asymmetrisk.**
   - **Edit-flyt** (`initialData` finnes): Tøm-knappen vises når minst ett felt har innhold.
   - **New-flyt** (`initialData` undefined): Tøm-knappen skjules så lenge herrer-feltene er identiske med default (`slope: '113', CR: '70.0'`). Så snart admin redigerer ett av feltene til noe annet enn defaulten, vises Tøm.
   - Begrunnelse: hindrer at admin på new-flyten utilsiktet tømmer prefylte defaults før de har lagt til noe eget.
3. **Visibility på damer/junior:** Vises når minst ett felt har innhold. Default er tom for begge kjønn på begge flyter, så ingen new-vs-edit-asymmetri.
4. **Plassering:** I legend-headeren ved siden av (og som erstatning for) den eksisterende Fjern-knappen — samme link-stil som `text-[11px] font-medium text-muted hover:text-danger`.
5. **Copy:** Eksakt «Tøm dette kjønnet» per issue-spec. Lik tekst på alle tre kjønn — legenden ved siden av («Herrer» / «Damer» / «Junior») gjør konteksten klar.
6. **Tilstøtende kollaps-knapp på damer/junior i collapsed-state:** beholdes som i dag («+ Legg til X-rating»). Tøm-flyten endrer kun expanded-state.

## Filer

- **Endre:** [app/admin/courses/CourseForm.tsx](app/admin/courses/CourseForm.tsx)
  - Fjern `onRemove`-prop og «Fjern X-rating»-knappen fra `GenderRatingBlock`.
  - Legg til ny `onClear` + `showClear`-prop som rendrer «Tøm dette kjønnet»-link i headeren når `showClear` er true.
  - Slett `toggleGenderExpand(..., gender, false)`-handler-callsites (erstattes av ren clear-action som ikke endrer expand-state).
  - For damer/junior: Tøm-handler kaller `updateTee(index, { [`slope_${gender}`]: '', [`course_rating_${gender}`]: '' })` — beholder blokken ekspandert.
  - For herrer: samme clear-handler, men `showClear` styres av asymmetrisk new-vs-edit-regel:
    - Track via en `loadedFromInitialData`-flag (boolean på top-level av CourseForm, satt fra `initialData !== undefined`).
    - `showClear` for herrer = `(loadedFromInitialData || !isMensAtDefault(tee)) && (tee.slope_mens !== '' || tee.course_rating_mens !== '')`
    - Hjelpe-funksjon `isMensAtDefault(tee)` = `tee.slope_mens === DEFAULT_TEE.slope_mens && tee.course_rating_mens === DEFAULT_TEE.course_rating_mens`.
  - For damer/junior: `showClear` = `tee[\`slope_${gender}\`] !== '' || tee[\`course_rating_${gender}\`] !== ''`.
- **Endre:** [app/admin/courses/CourseForm.test.tsx](app/admin/courses/CourseForm.test.tsx)
  - Oppdater den eksisterende testen «kollapser dame-rating-blokken og fjerner verdiene når «Fjern dame-rating» klikkes» → forventer «Tøm dette kjønnet»-knapp, ikke kollaps (blokken står åpen etter klikk; felt-verdiene er tomme).
  - Slett evt. test for «Fjern dame-rating»-tekst — erstatt med assertion om at den teksten IKKE finnes lenger.
  - Legg til nye tester (under blocking-criteria nedenfor).

**Ingen** server-action-, migrasjons-, eller backend-endringer.

## Suksess-kriterier

- [x] **Alle tre gender-blokker rendrer «Tøm dette kjønnet»-link i headeren** når visibility-regelen er oppfylt (link-stil identisk med dagens Fjern, plassert i samme posisjon i `<legend>`-headeren).
  - Evidens: [CourseForm.tsx:520-528](app/admin/courses/CourseForm.tsx:520) — `{showClear && (<button ...>Tøm dette kjønnet</button>)}` inni `GenderRatingBlock` legend-header (flex-container med `<legend>`). Test: «viser Tøm-knappen for hver gender-blokk som har innhold på edit-flyten (3 knapper for full tee)».
- [x] **Herrer-blokken på new-flyten (ingen `initialData`):** Tøm-knappen er IKKE synlig så lenge slope_mens === '113' OG course_rating_mens === '70.0' (default). Den vises så snart admin endrer ett av feltene til noe annet.
  - Evidens: [CourseForm.tsx:351-354](app/admin/courses/CourseForm.tsx:351) `showClear={(loadedFromInitialData || !isMensAtDefault(tee)) && (...)}` — på new-flyt med `loadedFromInitialData === false` og `isMensAtDefault(tee) === true` (113/70.0) blir første ledd false → showClear false. Tester: «viser IKKE Tøm-knappen på herrer-blokken på new-flyten når defaults er intakte» + «viser Tøm-knappen på herrer-blokken så snart admin endrer slope vekk fra default».
- [x] **Herrer-blokken på new-flyten:** etter at admin endrer slope til f.eks. '120' og klikker «Tøm dette kjønnet», blir BÅDE slope og CR satt til tom streng (knappen forsvinner etter klikk siden begge felt nå er tomme — visibility-regelen krever minst ett ikke-tomt felt).
  - Evidens: Test: «nullstiller begge feltene og skjuler Tøm-knappen igjen ved klikk på herrer» — asserter at både `slope_mens` og `cr_mens` blir tom streng, og at `queryByRole('button', { name: /tøm dette kjønnet/i })` returnerer null etter klikk.
- [x] **Herrer-blokken på edit-flyten (`initialData` med lagrede tall):** Tøm-knappen er synlig så snart minst ett felt har innhold, uansett om verdiene tilfeldigvis matcher defaults.
  - Evidens: Test: «viser Tøm-knappen på herrer-blokken på edit-flyten selv om verdiene matcher defaults» — `initialData` med `slope_mens: '113', course_rating_mens: '70.0'` asserter 1 Tøm-knapp.
- [x] **Damer/Junior-blokker:** Tøm-knappen er IKKE synlig så lenge begge felter er tomme (default-state for kollapsbare blokker). Vises så snart admin fyller ett felt.
  - Evidens: [CourseForm.tsx:371-374](app/admin/courses/CourseForm.tsx:371) `showClear={tee.slope_ladies !== '' || tee.course_rating_ladies !== ''}`. Tester: «viser ikke Tøm-knappen i dame-blokken så lenge feltene er tomme etter ekspander» + «viser Tøm-knappen på damer-blokken så snart admin fyller ett felt».
- [x] **Damer/Junior-blokker:** klikk på «Tøm dette kjønnet» nullstiller BÅDE slope_<gender> og course_rating_<gender> til tom streng, MEN blokken forblir ekspandert (`expandedLadies[index]` / `expandedJuniors[index]` endres ikke).
  - Evidens: [CourseForm.tsx:205-214](app/admin/courses/CourseForm.tsx:205) `clearGender()` oppdaterer kun tee-state, rører ikke expanded-arrays. Test: «nullstiller damer-feltene MEN beholder blokken ekspandert etter Tøm» — asserter at `screen.getByText('Damer')` finnes etter klikk OG at collapsed-state-knappen IKKE finnes.
- [x] **«Fjern dame-rating»- og «Fjern junior-rating»-tekstene finnes ikke lenger i UI-en** (verifiseres med `queryByText`-assertion som returnerer null).
  - Evidens: `grep -n "Fjern" app/admin/courses/CourseForm.tsx` returnerer kun tee-nivå «Fjern»-knappen (linje 284), ingen «Fjern X-rating». Test: «viser ikke «Fjern X-rating»-knapper i UI-en (erstattet av Tøm)».
- [x] **Eksisterende `+ Legg til dame-rating` / `+ Legg til junior-rating`-flyt for collapsed-state er uberørt** (knappene rendres som før når blokken er kollapset; klikk ekspanderer blokken med tomme felt). Verifisert i eksisterende test som ikke skal endres.
  - Evidens: [CourseForm.tsx:379-385](app/admin/courses/CourseForm.tsx:379) og [408-414](app/admin/courses/CourseForm.tsx:408) — knappetekst uendret, kaller `expandGender` som kun setter `expanded*[index] = true`. Test: «viser kun herre-rating som default; ingen dame/junior-input synlig» passerer uendret.
- [x] **Submit-flyten er uberørt** — partial-rating-server-validering trigger fortsatt korrekt hvis admin lar ett felt være halvt utfylt. Server-action-koden i `app/admin/courses/new/actions.ts` og `[id]/edit/actions.ts` endres ikke.
  - Evidens: `git show --stat HEAD` viser kun `CHANGELOG.md`, `CourseForm.tsx`, `CourseForm.test.tsx`, `package.json`, `.forge/contracts/238-tom-kjonn-knapp.md`. Ingen actions.ts eller validerings-fil er endret.

## Gates

- `npm run typecheck` (etter hver endring i CourseForm.tsx)
- `npm test -- CourseForm` (etter hver test-endring eller CourseForm-endring)
- `npm run lint` (én gang før commit)

**Manuell sjekk (ikke-blocker for evaluator, men gjør den selv):** Last `/admin/courses/new` lokalt, åpne Sekretariatet, fyll inn et bane-navn + et tall i slope_mens, verifiser at Tøm-knappen dukker opp i herrer-headeren, klikk den, verifiser at slope_mens-feltet tømmes.

## Out of scope

- Endring av server-side partial-rating-feilmeldingen.
- Endring av andre admin-flyter (spillere, spill-wizard, side-tournaments).
- Visuelle endringer på legend/header-strukturen utover å bytte hvilken knapp som rendres der.
- Animasjoner / micro-transitions ved clear-handling.
- Endring av collapsed-state-knappene («+ Legg til X-rating»).
