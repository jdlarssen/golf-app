# Forge-evaluering: #643 — Skjul påmeldings-valg for klubb-turnering

**Verdict: ACCEPT**

Branch: `claude/643-klubb-skjul-paameldingsvalg`
Evaluert: 2026-06-16 (skeptisk, kode lest direkte + gates kjørt lokalt)

## Sammendrag

Alle 6 suksess-kriterier er oppfylt. Endringen er minimal og kirurgisk: ett nytt
`hideModeChoice`-prop på `RegistrationSection` (wrapper kun «hvem»-fieldsetet), ett
avledet `isClubScoped`-flagg + en `useEffect` som tvinger `registration_mode='invite_only'`
for klubb-spill, og wiring i `GameWizard`. Type-valget (solo/lag) beholdes for klubb-spill.
Ikke-klubb-spill er uberørt. Gates grønne.

## Per-kriterium funn

### 1. RegistrationSection skjuler «Hvem kan melde seg på?»-fieldsetet for klubb — ACCEPT
- `GameWizard.tsx:815-819` sender `hideModeChoice={state.isClubScoped}`.
- `RegistrationSection.tsx:104` wrapper KUN «whoLegend»-fieldsetet i `{!hideModeChoice && ( ... )}`,
  lukket på `:167`. «whatLegend» (solo/lag-type) på `:169-212` står utenfor wrapperen og rendres
  alltid — verifisert. Adversarial sjekk «skjuler den ved et uhell type-valget?» → NEI.
- Betingelse = `isClubScoped = groupId !== ''` (`useGameFormState.ts:504`), robust og groupId-basert.
  Når klubb fjernes («Ingen klubb» → groupId='') vises fieldsetet igjen.

### 2. Klubb-spill publiserer registration_mode='invite_only' — ACCEPT
- Effekt: `useGameFormState.ts:505-509` — `if (isClubScoped && registrationMode !== 'invite_only') setRegistrationMode('invite_only')`.
  Dekker fersk klubb-valg, `?klubb=`-deep-link (groupId initialisert non-empty på mount → effekt fyrer)
  og pre-fylt klubb-spill med annen modus (mount-normalisering, testet).
- Payload-stier:
  - Hidden input `GameWizard.tsx:1006` — `<input name="registration_mode" value={registrationMode}/>`.
    `registrationMode` destruktureres fra `state` i `FormDataInputs` (`:984`), serialiseres UANSETT
    montert steg / om fieldsetet rendres. Dette er primær wizard-submit-sti.
  - Fallback advanced-view: `GameWizard.tsx:421` — `registration_mode: state.registrationMode`.
  Begge leser samme tvungne state-verdi.
- «Neste»/publish blokkeres ikke: `canAdvance()` for steg 2 (`:329-335`) krever kun
  `state.formatChosen` — ingen avhengighet av mode-fieldsetet. `playersStepOptional` =
  `registrationMode !== 'invite_only'` (`:519`) → for tvungen invite_only blir steg 4 obligatorisk,
  identisk med default-invite_only-spill (ingen regresjon).

### 3. Villedende copy («Vises ikke i Finn turneringer») vises aldri for klubb-spill — ACCEPT
- Strengen er `modeInviteHint` («Privat. Vises ikke i Finn turneringer…», no.json) og rendres KUN
  inne i mode-fieldsetet via `modeHint(mode)` (`RegistrationSection.tsx:135`). Fieldsetet skjules
  synkront fra `groupId !== ''` — ingen effekt-timing-gap for selve copyen.
- `selfSignupNote` (`:214`) gates på `registrationMode !== 'invite_only'`; siden klubb tvinges til
  invite_only rendres heller ikke den. (Selv om denne har et teoretisk 1-render-vindu via effekten,
  er teksten uansett ikke den villedende «Finn turneringer»-strengen.)

### 4. ClubPicker-hint dekker forventningen — ACCEPT
- `wizard.club.hint` = «Medlemmene kan se og melde seg på alle spill du setter opp for klubben.»
  (no.json:882). Merk: kontrakten skrev stien `wizard.sections.club.hint`, men nøkkelen ligger på
  `wizard.club.hint` — innholdet er korrekt og rendres.
- ClubPicker (`GameWizard.tsx:1364-1366`) rendrer `t('club.hint')` rett under select-en, i SAMME steg 2,
  umiddelbart etter RegistrationSection (`:822-828`). Arrangøren ser altså forklaringen der valget pleide
  å stå. Ingen ny nøkkel nødvendig — eksisterende hint dekker behovet.

### 5. Ikke-klubb-spill uendret (ingen regresjon) — ACCEPT
- For kompis/cup/solo er `groupId=''` → `isClubScoped=false` → `hideModeChoice=false` → alle tre moduser
  (invite_only/manual_approval/open) rendres og er valgbare.
- Betingelsen er groupId-basert, IKKE intent-basert. `setIntent` (`:492-495`) nullstiller groupId til ''
  når intent forlater 'klubb', og `?klubb=`-deep-link setter alltid intent='klubb' (page.tsx:112), så det
  finnes ingen sti der et ikke-klubb-spill har non-empty groupId.
- Eksisterende GameWizard-tester (registration_mode default invite_only / open-bytte / FormData) passerer
  uendret (52/52 grønne) → ingen regresjon i fellesstien.

### 6. Gates grønne — ACCEPT
```
$ npx tsc --noEmit
TSC_EXIT=0

$ npx vitest run "app/[locale]/admin/games/new/useGameFormState.test.ts" \
                 "app/[locale]/admin/games/new/GameWizard.test.tsx"
 Test Files  2 passed (2)
      Tests  52 passed (52)
VITEST_EXIT=0
```

## Test-kvalitet (adversarial)
Nye tester i `useGameFormState.test.ts:418-466` er meningsfulle — de asserter faktisk den tvungne
verdien, ikke trivielt grønne:
- `:419` setter modus til 'open', velger klubb, asserter overgang til invite_only + isClubScoped=true.
- `:439` pre-fyller klubb-spill med `registration_mode:'open'`, asserter mount-normalisering til invite_only.
- `:455` ikke-klubb beholder 'open' (bekrefter at tvangen IKKE over-fyrer / ingen regresjon).

## Mindre observasjon (ikke-blokkerende)
- Kode-kommentaren `useGameFormState.ts:502` nevner «edit av et eldre klubb-spill». GameWizard er i praksis
  create-flaten (initialValues stammer fra cup-game-konstruksjon, ikke edit av eksisterende klubb-spill;
  edit bruker GameForm direkte). Effekten + mount-test håndterer scenarioet korrekt uansett, så dette er
  en kommentar-nyanse, ikke en funksjonell defekt.
- Kontraktens fil-referanse «wizard.sections.club.hint» er feil sti (faktisk `wizard.club.hint`).
  Implementasjonen treffer riktig nøkkel; kun kontrakt-dokumentet var upresist.

Begge er kosmetiske og påvirker ingen suksess-kriterier.
