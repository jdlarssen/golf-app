# Kontrakt — #1383: foreldet `?step`-lenke starter veiviseren på steg 1

Kilde: kontrakt-smedens kommentar på [#1383](https://github.com/jdlarssen/golf-app/issues/1383).
PR: [#1652](https://github.com/jdlarssen/golf-app/pull/1652). Klasse: bruker-synlig. Produktvalg: nei.

## Problem

`WizardBody` initialiserer steget fra URL-en uansett tilstand, mens all skjema-state starter
på defaults. På `?step=5` uten noe å gjenoppta viser «Klar?»-oppsummeringen «Best ball», tom
roster og «Ikke valgt» bane — verdier arrangøren aldri har valgt. `canPublish` hindrer
feilpublisering, men flaten er en blindvei fire «Forrige»-trykk fra start. Restproblemet etter
#1380 (sessionStorage-utkast) er `?step=N`-URL UTEN utkast: ny fane, annen enhet, tømt
sessionStorage.

## Success Criteria

- [x] **1.** `/admin/games/new?step=5` i fersk fane (tom sessionStorage) → veiviseren viser
      steg 1, URL-en er uten `?step`.
      **Evidens:** staging-driver AP1 — URL endte `/admin/games/new` (ingen query),
      `[role=radiogroup]`×1. Enhetstest: `GameWizardStepHistory.test.tsx:167` («sender blank
      flyt tilbake til steg 1…»). Rød→grønn bevist: med `GameWizard.tsx` stashet feiler den på
      `expected "vi.fn()" to be called 1 times, but got 0 times`.
- [x] **2.** `/opprett-spill?intent=cup&step=3` i fersk fane → steg 1 og `?intent=cup` BEVART.
      **Evidens:** staging-driver AP2 — URL endte `/opprett-spill?intent=cup`. Samme
      enhetstest asserter `replace('/admin/games/new?intent=cup', { scroll: false })`.
- [x] **3.** Fyll ut steg 1–2, reload på `?step=3` i samme fane → gjenopptas som i dag med
      utkast (regresjonsvern for #1380).
      **Evidens:** staging-driver AP3 — etter intent-valg + «Neste» og reload forble URL-en
      `/admin/games/new?step=2` med 1 utkast-nøkkel i sessionStorage. Ingen reset.
- [x] **4.** Én reset-test i `GameWizardStepHistory.test.tsx`; de to testene som knekker med
      vilje er oppdatert, og valget dokumentert i commit-body.
      **Evidens:** commit `9e8a1f2b`. «Forrige pusher også» og «skriver ikke URL-en når den
      allerede speiler steget» er gitt `SEEDED_BY_ROUTE` (rute-seed `course_id`) framfor endret
      forventning — de tester fortsatt det de ble skrevet for, og dekker samtidig at reset-en
      holder seg unna seedede flyter. Begrunnelsen står i commit-body-en.
- [x] **5.** `tsc` + `lint` + `vitest` grønn.
      **Evidens:** `npx vitest run "app/[locale]/admin/games/new"` → 20 filer / 244 tester
      passed. `npx tsc --noEmit` → exit 0. `npm run lint` → 0 errors (55 pre-eksisterende
      warnings i urørte filer). I tillegg `npm run build` → exit 0 (eneste porten som fanger
      `useSearchParams`/Suspense-feil).

## Gates

- [x] `tsc` + `lint` + `vitest` — se kriterium 5.
- [x] **Staging-klikkrunde** (bruker-synlig): AP1–AP3 kjørt mot `torny-staging` med
      Playwright-driveren. Bevis-kommentar + `staging-verified`-label på PR #1652.

## Design som ble bygget

1. Reset-avgjørelsen ligger i ytre `GameWizard`-skall, i samme effekt som `loadWizardDraft` —
   skallet er stedet som allerede vet om utkast finnes.
2. «Blank flyt»-predikatet (`isSeededFlow`) ser forbi tee-off-defaulten: admin-ruta sender
   ALLTID `scheduled_tee_off_at` (#1171), så tilstedeværelsen av `initialValues` er ikke
   signal. Alt annet er det.
3. Param-bevarende `router.replace`: `new URLSearchParams` → `delete('step')` → replace.
   `?intent=`/`?klubb=`/`?bane=`/`?fra=` overlever.
4. `useRouter`/`useSearchParams` lagt til i skallet; begge sider wrapper allerede `GameWizard`
   i `<Suspense>`, så ingen ny boundary trengs (bekreftet av grønn `npm run build`).
5. `didResetStep`-ref lukker vinduet før `searchParams` oppdateres etter replace-rundturen.

## Runde 2 — evaluator-funn og retting (commit `a1265506`)

Den skeptiske evaluatoren avviste runde 1 (`NEEDS WORK`) på ett reelt funn, verifisert
live mot staging — ikke i en mock:

- **F1 (HIGH, RETTET):** `searchParamsString` i effektens dep-array gjorde reset-en om fra
  en mount-avgjørelse til en per-navigasjon-avgjørelse. Da er utkastet eneste
  «finnes noe å gjenoppta»-signal — og cup-grenen (`isNewCupFlow`, `GameWizard.tsx:510–518`)
  sletter utkastet med vilje og skriver aldri et nytt. Arrangørens FØRSTE «Neste» etter å ha
  valgt Cup ble derfor lest som en foreldet lenke og kastet tilbake til steg 1, på begge
  dørene. **Fiks:** dep-arrayet tilbake til `[storageKey, draftContext]` + en kommentar som
  forklarer hvorfor URL-en ikke hører hjemme der. F2 (samme bounce innenfor 400 ms-debouncen)
  og F3 (remount av kroppen ved første navigasjon etter at et utkast dukket opp) hadde samme
  rot-årsak og faller med samme fiks.
- **F5 (LOW, RETTET):** `isSeededFlow` telte nøkler, ikke verdier — et alltid-tilstedeværende
  `undefined`-felt ville slått av fiksen stille. Ser nå på verdien.
- **F6 (INFO, RETTET):** testriggen kunne strukturelt ikke se F1–F3 (`searchString` var
  statisk). `push`/`replace`-mockene speiler nå den ekte router-en, og regresjonslåsen
  re-rendrer skallet etter «Neste». Rød→grønn bevist: med det gamle dep-arrayet feiler den
  på «replace kalt 1 gang».
- **F4 (LOW/MED, IKKE RETTET — akseptert restrisiko):** et ett-felts rute-seed (`?bane=`)
  slår av reset-en, så `/opprett-spill?bane=<uuid>&step=5` viser fortsatt den oppdiktede
  oppsummeringen. Kontraktens Key Decision er at seedede flyter ikke resettes; å gjøre
  terskelen steg-avhengig er et designvalg utenfor denne kontrakten. Filet som
  [#1653](https://github.com/jdlarssen/golf-app/issues/1653).
- **F7 (INFO, ingen handling):** de to endrede testene ble tilpasset, ikke svekket
  (assertions ordrett uendret). Merknaden om at «blank flyt på `?step=2`» ikke lenger har
  egen test er korrekt, men premisset er nettopp det fiksen inverterer — blank flyt på
  `?step=2` SKAL nå resettes, og det dekkes av reset-testen.

**Staging runde 2** (samme rigg, port 3457 verifisert til denne worktreen): cup + «Neste»
blir stående på steg 2 på BEGGE dørene med tomt utkast-lager — nøyaktig tilstanden som
brøt — og AP1–AP3 er uendret grønne. Console-errors `[]`, failed requests `[]`, eneste
Supabase-host `snwmueecmfqqdurxedxv.supabase.co`.

## Avvik fra kontrakten

Ingen i scope. Kontraktens fil-liste (`GameWizard.tsx` + `GameWizardStepHistory.test.tsx`)
holdt gjennom begge runder; i tillegg kom `.changes/1383-veiviser-foreldet-steglenke.md`
som versjonsdisiplinen krever. F4 er eneste bevisst utsatte del, sporet i #1653.
