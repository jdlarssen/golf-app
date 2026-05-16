# Issue #48 — Kjønn-tag på tee-bokser

**Status:** Design (godkjent)
**Dato:** 2026-05-16
**Issue:** https://github.com/jdlarssen/golf-app/issues/48

## Bakgrunn

I norsk golf har samme fysiske tee-boks (f.eks. «Gul») ulik slope rating og course rating for herrer og damer. Tørny lagrer i dag én rad pr. fysisk tee, med én slope/CR — som betyr at en dame som spiller fra dame-teen får utregnet feil course handicap i et blandet spill.

Issue-en ber om å taggge tee-bokser med kjønn, og målet er at herrer og damer skal kunne spille fra ulike tees i samme spill med korrekt course handicap.

## Designvalg

### Datamodell: én rad pr. tee × kjønn

`tee_boxes` får en ny `gender`-enum-kolonne (`mens` / `ladies` / `juniors`). Samme fysiske tee legges inn som to (eller tre) separate rader — én pr. kjønn-rating — med ulik slope/CR. Dette er enklere enn alternativet (én rad med separate kolonner for `slope_mens` / `slope_ladies` / NULL-håndtering) og passer dataentry-flyten i bane-admin der admin allerede legger inn flere tees.

### Tee per spiller, ikke per spill

`game_players` får en nullable `tee_box_id`-kolonne. NULL betyr «bruk spillets default-tee». Course handicap kalkuleres pr. spiller med slope/CR/par fra spillerens egen tee (med fallback til spillets tee).

### Tournament-mental modell, ikke per-spiller-dropdown

Admin setter to tees i game-formen («Tee for herrer», «Tee for damer»), ikke en tee pr. spiller. Spillerne får en M/D-toggle som resolveres til riktig `tee_box_id` ved save. Dette matcher hvordan en virkelig turnering er satt opp (en regel som gjelder alle spillere av samme kjønn) og holder admin-arbeidet lavt selv ved klubb-skala.

### Ingen `users.gender` i denne leveransen

Vi vurderte å legge til `gender` på user-profilen for auto-default av M/D-toggle, men droppet det fra v1. Tørny er bygget for kompis-gjenger der admin vet hvem som er hvem, og en ekstra profil-felt + onboarding-spørsmål er ikke verdt det. Følges opp i egen issue (se «Oppfølging»).

## Datamodell-endringer

```sql
-- Migration 0028_tee_box_gender.sql
create type tee_box_gender as enum ('mens', 'ladies', 'juniors');

alter table public.tee_boxes
  add column gender tee_box_gender not null default 'mens';

alter table public.game_players
  add column tee_box_id uuid references public.tee_boxes(id);
```

- `tee_boxes.gender` NOT NULL med default `'mens'`. Backfill av eksisterende rader (alle herretees per dagens datasett) skjer via default.
- `game_players.tee_box_id` nullable. NULL = «bruk `games.tee_box_id`».
- Ingen RLS-endringer (`tee_boxes` arver fra courses-policy, `game_players` allerede dekket).

## Bane-edit-flyt — fjerne blokkerings-guard

I dag bruker `app/admin/courses/[id]/edit/actions.ts` en delete-and-reinsert-pattern for tees, med en guard som blokkerer hele edit-flyten hvis ett spill refererer en av tees. Dette må endres for at admin skal kunne legge til `gender` på baner med ferdigspilte spill.

Ny flyt: **diff-basert update**.

- Hver tee-rad i formen får en skjult `id`-input (tom for nye rader).
- Rad med eksisterende `id` → `UPDATE` (UUID holdes, FKs intakt).
- Rad uten id → `INSERT`.
- Eksisterende tee fjernet fra formen → forsøk `DELETE`, men:
  - Hvis tee-en er referert av spill (uansett status): avbryt med feilmelding. Den fysiske FK-en blokkerer uansett.
  - Hvis ikke referert: slett trygt.

Editering (slope/CR/gender/navn) er nå tillatt uansett spill-status. Course handicap er frosset på `game_players.course_handicap` ved publish-tid, så ferdigspilte spill påvirkes ikke.

**Edge case ikke håndtert i v1:** hvis admin endrer slope/CR på en tee referert av et aktivt spill, oppdateres ikke pågående spillers `course_handicap`. Det er konsistent med Tørnys «handicap låses ved game start»-modell. Ingen advarsel vises.

## UX-endringer

### Bane-admin (course form)

Hvert tee-kort får et nytt felt på toppen:

> **For hvem:** ⦿ Herrer  ◯ Damer  ◯ Junior

Default = Herrer. Eksisterende tees vises som Herrer (per default).

### Game-form (admin/games/new + [id]/edit)

Tee-seksjonen får to dropdowns i stedet for én:

- **Tee for herrer** — påkrevd, filtrert til tees med `gender ∈ {mens, juniors}`.
- **Tee for damer** — valgfri, filtrert til `gender = ladies`.

Hver tee-option viser en kjønn-merkelapp (`herre`, `dame`, `junior`) etter navnet.

**Hvis dame-tee er tom:** spiller-listen ser ut som i dag. Ingen M/D-toggle. Dette er den vanlige kompis-spill-flyten.

**Hvis dame-tee er valgt:** hver spiller-rad får en M/D-segmented control (default M):

> Lars  [**M** | D]   Lag 1
> Anne  [M | **D**]   Lag 2

Ved save resolves: `game_players.tee_box_id = (toggle === 'D') ? ladies_tee_id : null`. NULL = «bruk spillets default = herre-tee».

Ved edit: rekonstruér M/D fra `tee_box_id === ladies_tee_id`.

### Game-detalj (admin/games/[id])

Når dame-tee også er satt, vises begge:

> **Tee for herrer:** Gul herre — slope 122 / CR 70.1
> **Tee for damer:** Gul dame — slope 132 / CR 71.5

Hvis bare én tee: vises som i dag.

### Spillerens scorekort (`/games/[id]/scorecard`)

Liten tekst øverst som bekrefter hva spilleren spiller fra:

> Du spiller fra **Gul dame** — slope 132 / CR 71.5

Vises uansett om spillet er enkel- eller blandet kjønn — gir trygghet om at oppsettet er riktig.

### Leaderboard

Ingen endring i v1.

## Scoring-påvirkning

`calculateCourseHandicap` i `lib/scoring/courseHandicap.ts` er uendret — formelen tar slope/CR/par som input. Det som endres er hvor disse hentes fra: pr. spiller fra `game_players.tee_box_id ?? games.tee_box_id`.

Best-ball-logikken (`lib/scoring/bestBall.ts`) er uendret — den bruker pr. spillers `course_handicap`, og det blir nå riktig pr. spiller automatisk.

`lib/leaderboard.ts` leser `course_handicap` fra game_players, ikke fra tees. Bekreftet ved kode-lesning. Ingen endring.

## Tester

- `lib/scoring/courseHandicap.test.ts` — uendret. Formelen er den samme.
- Ny unit-test for tee-resolusjons-helper (M/D-toggle → tee_box_id).
- Manuell prod-test: opprett blandet spill på Byneset, verifiser at herrer og damer får ulik course handicap.

## Oppfølging

Egen issue opprettes for `users.gender` + `users.level` (junior/normal/senior). Når den er på plass:

- Auto-default M/D-toggle basert på `users.gender`.
- Junior-tee-støtte i game-formen (når relevant).
- Mulig admin-flyt: «egendefinert tee»-overstyring per spiller (senior-herre på dame-tee).

## Filer som endres

- `supabase/migrations/0028_tee_box_gender.sql` (ny)
- `lib/database.types.ts` (regen)
- `app/admin/courses/CourseForm.tsx` — gender-select pr. tee
- `app/admin/courses/new/actions.ts` — lese gender fra formData
- `app/admin/courses/[id]/edit/actions.ts` — diff-based tee update + gender
- `app/admin/courses/[id]/edit/page.tsx` — load gender + tee-id pr. rad
- `app/admin/games/new/GameForm.tsx` — dame-tee-dropdown + M/D-toggle
- `app/admin/games/new/actions.ts` — resolve per-player tee_box_id
- `app/admin/games/new/page.tsx` — load tees inkl. gender
- `app/admin/games/[id]/edit/page.tsx` — load dame-tee + per-player tee
- `app/admin/games/[id]/edit/actions.ts` — resolve per-player tee_box_id
- `app/admin/games/[id]/actions.ts` — course handicap fra spillerens tee
- `app/admin/games/[id]/page.tsx` — vis begge tees når satt
- `app/games/[id]/scorecard/page.tsx` — spillerens tee øverst
- `lib/games/getGameWithPlayers.ts` — joine tee_boxes pr. game_player
- (mulig) `lib/scoring/__tests__/tee-resolution.test.ts` — ny

Estimat: 1 migrasjon + ~12-14 filer.
