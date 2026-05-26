# Spec: Forvarsel når admin endrer hull med pågående spill-scores

**Issue:** [#237](https://github.com/jdlarssen/golf-app/issues/237) — utsatt fra Fase 2 av [#223](https://github.com/jdlarssen/golf-app/issues/223)
**Berører:** `/admin/courses/[id]/edit` (page.tsx + CourseForm)
**Bump:** PATCH — liten brukervennlighets-fiks, ingen nye flyter

## Problem

`updateCourse` ([app/admin/courses/[id]/edit/actions.ts:212-222](app/admin/courses/[id]/edit/actions.ts)) gjør delete-and-reinsert på `course_holes` uten å varsle admin om pågående spill. Historisk score-data overlever (scores refererer `hole_number` int, ikke FK til `course_holes`), men netto-beregningen leser `course_holes` live på hver spørring — endring av par eller stroke-indeks mid-spill betyr at allerede-leverte scores beholder gamle netto-resultater mens nye scores beregnes mot nye par. Spillere får ingen melding; forvirring sikret.

Tee-endringer (slope/CR) er trygge fordi `game_players.course_handicap` fryses ved game-start. Det er kun per-hull-par og stroke-indeks som leses live.

## Prior Decisions

- **Fra Fase 2-kontrakt ([223-courses-phase2-vedlikehold-og-filter.md](.forge/contracts/223-courses-phase2-vedlikehold-og-filter.md)):** «`game_players.course_handicap` frosset ved game-start. Slope/CR-edits på en in-use tee påvirker derfor ikke historiske spill.» Konsekvens her: tee-endringer trigger ikke advarselen.
- **Fra Fase 2-kontrakt:** `course_holes` stays delete-and-reinsert — vi endrer ikke skjema eller fjerner historisk-konsistens-fundamentet. Advarselen er rent UX-laget.
- **Fra CLAUDE.md memory `destructive_actions_dedicated_page`:** Destruktive flyter bruker dedikert `/slett`-rute. Dette er ikke destruktivt — det er save-med-warning, så `window.confirm`-mønsteret som [DeleteCourseButton.tsx](app/admin/courses/[id]/edit/DeleteCourseButton.tsx) bruker passer bedre.
- **Fra CLAUDE.md `### Versjonering / CHANGELOG`:** Bruker-synlig fix → PATCH-bump + CHANGELOG-oppføring. Tagline må gjennom humanizer-skill.

## Design

### Server-side: tell aktive/planlagte spill i page.tsx

I [app/admin/courses/[id]/edit/page.tsx](app/admin/courses/[id]/edit/page.tsx), legg til en parallel-fetch ved siden av eksisterende `getArchivedTees`:

```ts
// I EditCourseFormBody (eller hoist til page.tsx):
const { count: affectedGamesCount } = await supabase
  .from('games')
  .select('id', { count: 'exact', head: true })
  .eq('course_id', courseId)
  .in('status', ['active', 'scheduled']);
```

Send `affectedGamesCount` (eller `0`) som ny prop til `<CourseForm>`.

### Client-side: confirm-prompt i CourseForm

`CourseForm` ([app/admin/courses/CourseForm.tsx](app/admin/courses/CourseForm.tsx)) er allerede `'use client'` med stateful `holes`/`teeBoxes`. Legg til:

1. **Ny prop:** `affectedGamesCount: number` (default 0 så `/new` ikke trenger den).
2. **Endring-detektor:** sammenlign `initialData.holes` med current `holes` på par + stroke_index ved submit:

```ts
function hasHoleChanges(
  initialHoles: HoleData[],
  currentHoles: HoleData[],
): boolean {
  if (!initialHoles) return false; // /new — alltid endring, men da er affectedGamesCount=0
  return currentHoles.some((curr, i) => {
    const init = initialHoles[i];
    if (!init) return true;
    return curr.par !== init.par || curr.stroke_index !== init.stroke_index;
  });
}
```

3. **onSubmit-gate** (samme mønster som [DeleteCourseButton.tsx:13-21](app/admin/courses/[id]/edit/DeleteCourseButton.tsx)):

```tsx
<form
  action={action}
  onSubmit={(event) => {
    if (
      affectedGamesCount > 0 &&
      initialData?.holes &&
      hasHoleChanges(initialData.holes, holes)
    ) {
      const ok = window.confirm(buildConfirmMessage(affectedGamesCount));
      if (!ok) event.preventDefault();
    }
  }}
>
```

4. **Dialog-tekst** (norsk, count-aware):

```ts
function buildConfirmMessage(count: number): string {
  const games = count === 1 ? 'ett spill' : `${count} spill`;
  const verb = count === 1 ? 'pågår eller er planlagt' : 'pågår eller er planlagt';
  return (
    `Banen brukes i ${games} som ${verb}. ` +
    `Endring av par eller stroke-indeks vil endre score-beregningen ` +
    `mid-runde for spillere som allerede har levert scorekort. ` +
    `Er du sikker på at du vil fortsette?`
  );
}
```

Brukerens valg → `OK` lar form-en submittes som vanlig, `Avbryt` (`event.preventDefault()`) stopper submit, alle felter beholdes (state i CourseForm uendret).

### Hvorfor server-side count (ikke client-side fetch)

`page.tsx` er allerede en async Server Component med flere parallelle Supabase-fetches. Ett ekstra `head: true`-count koster én rundtur og rendres synkront — ingen loading-spinner, ingen race mellom render og submit. Client-side fetch ville krevd `useEffect` + state for `affectedGamesCount` og kunne lekke gjennom hvis admin trykker Save før count-en var ferdig.

## Edge Cases & Guardrails

- **`/new`-flyten (CourseForm i create-modus):** `initialData?.holes` er undefined, `affectedGamesCount` default 0. Submit går rett gjennom uten confirm. Ingen regresjon.
- **Admin endrer kun bane-navn:** `hasHoleChanges` returnerer `false`, ingen confirm. Riktig — navnet påvirker ikke scoring.
- **Admin endrer kun tee-data (slope/CR/length/legge til ny tee):** `hasHoleChanges` returnerer `false`, ingen confirm. Riktig per design — tee-endringer er trygge.
- **Admin endrer par men `affectedGamesCount = 0`:** Ingen confirm, submit går gjennom. Riktig — ingen spill påvirkes.
- **Admin avbryter (Cancel i dialog):** `event.preventDefault()` stopper form-submit, state beholdes, ingen redirect, ingen DB-skrivning. Form-en kan submittes på nytt med endrede verdier.
- **Race condition: et nytt spill opprettes mellom page-render og submit:** `affectedGamesCount` kan være stale. Akseptabel risiko — admin må gjøre flere uavhengige handlinger på ~sekunder for å treffe dette. Server-action har uansett ingen blokk, kun warning.
- **`game.status` endres på server mellom render og submit:** Samme staleness-aksept. Vi gambler på admin-tempo, ikke realtime-konsistens.
- **JavaScript disabled:** `window.confirm` finnes ikke → `onSubmit` kjører ikke → form submittes uten warning. Akseptabel grace-degradation; admin uten JS er ekstremt sjeldent og scoring-feilen er reversibel ved å re-laste banen.
- **`hasHoleChanges` på initialData som har færre enn 18 hull:** Returnerer `true` ved første undefined. Defensive default — bedre å spørre én gang for mye.

## Key Decisions

- **Dialog-stil: window.confirm** — matcher [DeleteCourseButton.tsx](app/admin/courses/[id]/edit/DeleteCourseButton.tsx). Holder PR-en liten, ingen ny komponent. (Bruker bekreftet.)
- **Trigger: kun ved faktisk par-eller-SI-endring** — admin som retter en typo i bane-navnet skal ikke se advarselen. (Bruker bekreftet.)
- **Status-set: `active` + `scheduled`** — utkast er ikke publisert, advarsel ikke nødvendig. Avsluttede spill er låst (`finished`-status hindrer score-skriving), så ikke relevant. (Bruker bekreftet.)
- **Count-bare-dialog, ikke spill-liste:** `window.confirm` er plain-text, embedding av spill-navn vil bli stygt og 100+ tegn langt ved flere spill. Antall + status-beskrivelse er tilstrekkelig informasjon for admin til å vurdere alvor.
- **Server-side count i page.tsx, ikke client-side fetch:** Synkron-rendret, ingen race-vindu mellom mount og submit.

**Claude's Discretion:**
- Eksakt formulering i confirm-meldingen kan justeres for å passe humanizer-skill-passet (bruk «du»-form, unngå AI-tells, sjekk anglisismer). Variabelen `games`/`verb` er fritt-form per språk-kvalitet.
- Hvor i CourseForm-fil `hasHoleChanges` og `buildConfirmMessage` defineres (top-level vs inline) — det som leser best.
- Test-plassering: legg unit-test for `hasHoleChanges` i ny `CourseForm.test.tsx` (eller forleng eksisterende test-fil om den finnes).

## Success Criteria

- [ ] **Server-side count fetches korrekt:** `app/admin/courses/[id]/edit/page.tsx` kjører en `count: 'exact', head: true`-query mot `games` filtrert på `course_id` + `status IN ('active', 'scheduled')`, og sender resultatet som `affectedGamesCount`-prop til `CourseForm`. Verifiseres ved kode-inspeksjon + manuell prod-test med ett aktivt spill.
- [ ] **Confirm vises ved par-endring + aktive spill:** Manuell test i preview: opprett spill på en bane, sett `status='active'`, åpne `/admin/courses/<id>/edit`, endre par på hull 5 fra 4 til 5, trykk Lagre → `window.confirm` vises med teksten «Banen brukes i ett spill…». Trykk Avbryt → form-en submittes ikke, status-banner viser ingenting.
- [ ] **Confirm vises IKKE ved kun navn-endring:** Samme oppsett, endre kun bane-navnet, trykk Lagre → ingen confirm, lagring lykkes med status=updated-redirect.
- [ ] **Confirm vises IKKE når `affectedGamesCount = 0`:** Endre par på en bane uten aktive spill → ingen confirm. Verifiseres i preview eller via vitest mock.
- [ ] **Confirm vises IKKE ved kun tee-endring (slope/CR/length):** Endre kun slope-mens på en eksisterende tee → ingen confirm selv om spill er aktive. Verifiseres i preview.
- [ ] **`hasHoleChanges`-helper er unit-testet:** Minimum 4 cases — ingen endringer, par-endring, SI-endring, manglende initialData. Kjøres via `npm test -- CourseForm`.
- [ ] **`/admin/courses/new`-flyten upåvirket:** Opprett ny bane i preview → ingen confirm, ingen errors. CourseForm-prop `affectedGamesCount` defaulter til 0.
- [ ] **PATCH-bump + CHANGELOG-oppføring:** `package.json` versjons-bump (PATCH), tagline gjennom humanizer-skill, i samme commit som koden.

## Gates

- [ ] `npm run typecheck` passes
- [ ] `npm test -- CourseForm` passes (ny unit-test for `hasHoleChanges` pluss eventuell eksisterende CourseForm-test)
- [ ] `npm test -- actions.test.ts` (i `app/admin/courses/[id]/edit/`) passes — server-action skal ikke endres, regresjon-sjekk
- [ ] `npm run lint` passes (hvis lint-skript finnes — sjekk package.json)
- [ ] Manuell verifikasjon i preview-deploy: alle 5 confirm-cases over (par-endring/active, navn-endring, tee-endring, ingen-spill, /new) går som forventet

## Files Likely Touched

- `app/admin/courses/[id]/edit/page.tsx` — legge til games-count-fetch (eller hoiste til separat helper)
- `app/admin/courses/CourseForm.tsx` — ny prop `affectedGamesCount`, `hasHoleChanges`-helper, `buildConfirmMessage`-helper, onSubmit-gate
- `app/admin/courses/CourseForm.test.tsx` — ny test-fil (eller forlenge eksisterende hvis den finnes) for `hasHoleChanges`
- `CHANGELOG.md` — PATCH-oppføring under nyeste serie med tagline + Teknisk-seksjon
- `package.json` — PATCH-bump (current er `1.8.7` per CLAUDE.md status; aktuell versjon på branchen sjekkes ved bump-tid)

## Out of Scope

- **Spill-navn i dialog:** Verifisert utelatt under spec-runden — `window.confirm` er plain-text og lange lister vil se stygt ut. Hvis det blir behov senere, oppgradere til custom modal i egen issue.
- **Server-side guard mot par-endring under aktive spill:** Issue-en spesifiserer warning, ikke block. Hvis admin tar bevisst valg om å endre par mid-spill (f.eks. fant feil i original-input), skal det være mulig.
- **Tee-endring under aktive spill:** Eksplisitt utelatt per issue — `course_handicap` fryses ved game-start, så tee-endringer påvirker ikke historiske spill.
- **Bane-navn-endring under aktive spill:** Trivielt, påvirker ikke scoring.
- **Per-kjønn-hull-par-overstyring:** Allerede utsatt i Fase 1 av #223.
- **Email-notifikasjon til spillere ved par-endring:** Egen issue hvis aktuelt — ikke i scope her.
