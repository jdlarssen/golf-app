# Evaluering: «Tøm dette kjønnet»-knapp på tee-rating-skjemaet (#238)

**Dato:** 2026-05-26
**Verdikt:** ACCEPT

## Kriterium-for-kriterium

### 1. Alle tre gender-blokker rendrer «Tøm dette kjønnet»-link i headeren
✅ **PASS**

- `GenderRatingBlock` (CourseForm.tsx:520–528) rendrer `{showClear && (<button ...>Tøm dette kjønnet</button>)}` plassert i flex-headeren ved siden av `<legend>{label}</legend>`.
- Stil: `text-[11px] font-medium text-muted hover:text-danger transition-colors` — identisk med den gamle Fjern-link-stilen.
- Alle tre call-sites bruker samme `GenderRatingBlock` (mens linje 341, ladies linje 360, juniors linje 389) — én komponent gir konsekvent rendering.
- Test «viser Tøm-knappen for hver gender-blokk som har innhold på edit-flyten (3 knapper for full tee)» (test.tsx:318–344) asserterer `getAllByRole('button', { name: /tøm dette kjønnet/i }).length).toBe(3)`. Streng nok — fanger både manglende knapp og duplikat-render.

### 2. Herrer-blokken på new-flyten: Tøm IKKE synlig så lenge defaults intakte
✅ **PASS**

- CourseForm.tsx:351–354: `showClear={(loadedFromInitialData || !isMensAtDefault(tee)) && (tee.slope_mens !== '' || tee.course_rating_mens !== '')}`.
- `loadedFromInitialData = initialData !== undefined` (linje 119) er `false` på new-flyt.
- `isMensAtDefault` (linje 102–107) sammenligner mot `DEFAULT_TEE.slope_mens === '113'` og `DEFAULT_TEE.course_rating_mens === '70.0'`.
- På new-flyt + defaults: første ledd er `(false || !true) === false` → `showClear === false`. ✓
- Tests:
  - «viser IKKE Tøm-knappen på herrer-blokken på new-flyten når defaults er intakte» (test.tsx:184–190) — assert `queryByRole(...) === null`.
  - «viser Tøm-knappen på herrer-blokken så snart admin endrer slope vekk fra default» (test.tsx:192–203) — etter `fireEvent.change` til '120', assert exactly 1 Tøm-knapp.

**Edge case verifisert mentalt:** Hvis admin endrer slope til '113' (samme verdi som default), `isMensAtDefault` er fortsatt true → knappen forblir skjult. Konsistent med kontrakten («knappen skjules så lenge feltene matcher default»). ✓

### 3. Klikk på Tøm på herrer (new-flyt) nullstiller begge felter; knapp forsvinner
✅ **PASS**

- `clearGender` (CourseForm.tsx:205–213) kaller `updateTee(index, { [`slope_${gender}`]: '', [`course_rating_${gender}`]: '' })`.
- Test «nullstiller begge feltene og skjuler Tøm-knappen igjen ved klikk på herrer» (test.tsx:261–278): endrer slope til '120', klikker Tøm, asserterer `mensSlope.value === ''`, `mensCr.value === ''`, og `queryByRole('button', ...) === null`. Streng nok — verifiserer både state-clearing OG visibility-regelen kicker tilbake.

### 4. Herrer-blokken på edit-flyt: synlig så snart minst ett felt har innhold
✅ **PASS**

- `loadedFromInitialData === true` på edit-flyt → første ledd alltid true → andre ledd bestemmer.
- Test «viser Tøm-knappen på herrer-blokken på edit-flyten selv om verdiene matcher defaults» (test.tsx:205–231): `initialData` med slope `'113'`/CR `'70.0'` → assert 1 Tøm-knapp. Selv om verdiene er identiske med defaults, regnes de som «lagrede tall» fordi de kom inn via `initialData`. ✓
- Test «skjuler Tøm-knappen på herrer-blokken på edit-flyten når BÅDE slope og CR er tomme» (test.tsx:233–259): begge tomme → assert ingen knapp. Verifiserer at andre clause (`!== ''`) faktisk er restriktiv.

### 5. Damer/Junior-blokker: Tøm IKKE synlig så lenge begge felter tomme
✅ **PASS**

- CourseForm.tsx:371–374 (damer) og 400–403 (juniors): `showClear={tee.slope_X !== '' || tee.course_rating_X !== ''}`.
- Test «viser ikke Tøm-knappen i dame-blokken så lenge feltene er tomme etter ekspander» (test.tsx:141–150).
- Test «viser Tøm-knappen på damer-blokken så snart admin fyller ett felt» (test.tsx:280–292): først 0, etter `fireEvent.change` til '120', exactly 1 knapp.

### 6. Damer/Junior: Tøm nullstiller feltene MEN beholder blokken ekspandert
✅ **PASS**

- `clearGender` (linje 205–213) oppdaterer KUN `tee`-state via `updateTee`. Den rører ikke `setExpandedLadies` eller `setExpandedJuniors`. Bekreftet ved kode-lesing.
- `expandGender` (linje 196–199) er nå en separat helper som kun setter expand `true` — det gamle `toggleGenderExpand`-mønsteret (som koblet tøm-state med kollaps) er borte.
- Test «nullstiller damer-feltene MEN beholder blokken ekspandert etter Tøm» (test.tsx:294–316): fyller begge felt, klikker Tøm, asserterer:
  - `ladiesSlope.value === ''` og `ladiesCr.value === ''`
  - `screen.getByText('Damer')` finnes (blokken er åpen)
  - `queryByRole('button', { name: /legg til dame-rating/i }) === null` (collapsed-state-knappen er IKKE der)

Begge assertion-paret er strenge — `getByText('Damer')` ville feilet hvis blokken kollapset, og den negative collapsed-knapp-assertion-en fanger eventuell utilsiktet kollaps.

### 7. «Fjern X-rating»-tekstene finnes ikke lenger i UI
✅ **PASS**

- `grep -n "Fjern" app/admin/courses/CourseForm.tsx` returnerer kun tee-nivå «Fjern»-knappen på linje 301 (tee-removal — ingen relasjon til gender-rating). Ingen «Fjern dame-rating» / «Fjern junior-rating»-tekster i koden.
- Diff (`git show HEAD~1`) bekrefter at de gamle tekstene er erstattet av «Tøm dette kjønnet».
- Test «viser ikke «Fjern X-rating»-knapper i UI-en (erstattet av Tøm)» (test.tsx:132–139): ekspanderer begge blokker, asserterer `queryByRole(..., /fjern dame-rating/i) === null` og samme for junior.

### 8. «+ Legg til X-rating»-flyt for collapsed-state uberørt
✅ **PASS**

- CourseForm.tsx:379–385 (damer) og 408–414 (juniors): collapsed-state-knappene har uendret tekst «+ Legg til dame-rating» / «+ Legg til junior-rating» og klassenavn. `onClick={() => expandGender(index, 'ladies'|'juniors')}` — kaller nå `expandGender` (ny helper som kun setter expand=true), ikke det gamle `toggleGenderExpand`. Funksjonelt identisk: kun expand-state endres, ikke tee-data.
- Test «viser kun herre-rating som default; ingen dame/junior-input synlig» (test.tsx:114–122) verifiserer at collapsed-knappene rendres på new-flyt. Passerer.
- Test «eksponerer dame-rating-blokk når «+ Legg til dame-rating» klikkes» (test.tsx:124–130) verifiserer ekspander-flyten. Passerer.

### 9. Submit-flyt uberørt (server-actions ikke endret)
✅ **PASS**

- `git show HEAD~1 --stat`:
  ```
  .forge/contracts/238-tom-kjonn-knapp.md
  CHANGELOG.md
  app/admin/courses/CourseForm.test.tsx
  app/admin/courses/CourseForm.tsx
  package.json
  ```
  Ingen `app/admin/courses/new/actions.ts` eller `[id]/edit/actions.ts` blant endrede filer. ✓
- Ingen endring av FormData-konvensjoner i `GenderRatingBlock` — inputs har samme `name`-attributter (`tee_${i}_slope_${gender}`, `tee_${i}_cr_${gender}`).

## Funn

Ingen funn som blokkerer ACCEPT. Implementasjonen matcher kontrakten både i ånd og bokstav.

Mindre observasjoner (ikke-blocker, ikke krav om endring):

- `clearGender` aksepterer `gender: 'mens' | 'ladies' | 'juniors'` men nullstillingen via `as Partial<TeeBoxData>` er typesikker fordi `TeeBoxData` har eksakt disse seks key-ene. ✓
- `expandGender` er begrenset til `'ladies' | 'juniors'` (siden herrer aldri kollapses) — riktig type-snevring.
- Hjelpefunksjonen `isMensAtDefault` sammenligner mot `DEFAULT_TEE`-konstanten istedenfor å hardkode '113'/'70.0'-strenger inline — gjør at en framtidig endring av DEFAULT_TEE automatisk holder visibility-regelen synkronisert. God praksis.

## Gates

- `npm test -- CourseForm`: **PASS** — 25/25 tester grønne (969ms).
- `npx tsc --noEmit`: **PASS** — ingen type-feil (eksitt-kode 0, ingen output).
- (`npm run lint` ikke kjørt — kontrakten flagger pre-eksisterende eslint-feil i `e2e/sync/offline-sync.spec.ts` som out-of-scope.)

## Konklusjon

Implementasjonen oppfyller alle ni suksess-kriterier i kontrakten med streng test-dekning og verifiserbar evidens i kode + diff. Den asymmetriske new-vs-edit-regelen for herrer er korrekt implementert via `loadedFromInitialData`-flagget og hjelpefunksjonen `isMensAtDefault`, server-actions er uberørt, og 25/25 tester samt typecheck er grønne. Klar for merge.
