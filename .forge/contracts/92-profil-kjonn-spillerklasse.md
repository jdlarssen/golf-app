# Spec: Profil-felt for kjønn og spillerklasse (auto-default i game-wizard)

**Issue:** [#92](https://github.com/jdlarssen/golf-app/issues/92)
**Berører ruter:** `/complete-profile`, `/profile`, `/admin/spillere/[id]`, `/admin/games/new`, `/opprett-spill`
**Bump:** MINOR — `1.23.0` → `1.24.0` (ny bruker-synlig feature; #168 og #203 lå allerede inne i main da denne ble laget)

> **Branch-merknad (2026-05-25):** Kontrakten er kopiert fra GitHub-kommentaren på issue #92 (opprinnelig på branch `claude/adoring-moore-84b8ec`). Bygges nå på `claude/stupefied-blackwell-45897d`. Eneste justering: migrasjons-nummer er endret fra **`0035`** til **`0036`** fordi `0035_product_updates.sql` allerede er shipped via #202.

## Problem

I dag må admin manuelt klikke M/D/J-toggle for hver spiller hver gang et spill opprettes med kjønnsdelt tee — selv for spillere som alltid spiller fra dametee eller juniortee. Default i [`app/admin/games/new/actions.ts:133`](app/admin/games/new/actions.ts:133) er `'M'` (mens) når toggle-en ikke er satt, så damer og juniorer får feil course handicap hvis admin glemmer å flippe knappen. Med `#48`-feature-en (kjønn-tag på tee-bokser, shipped 2026-05-17) har vi datamodellen for å støtte M/D/J per spill, men ingen vedvarende kunnskap om hvilken spillerklasse hver person tilhører.

Målet er å lagre **`gender` og `level` per bruker** og bruke det som standard i game-wizardens M/D/J-toggle. Admin og spillere kan fortsatt overstyre per spill (f.eks. junior som vil prøve herretee for moro skyld), men 90 % av tilfellene bør virke uten manuell tagging.

## Research Findings

Ingen eksterne biblioteker er sentrale — alt bygger på eksisterende stack. Verifisert mot dagens kode:

- **`tee_box_gender`-enum** (`'mens' | 'ladies' | 'juniors'`) er definert i `0028_tee_box_gender.sql` og brukt av `tee_boxes.gender` og `game_players.tee_gender` (sistnevnte ble lagt til i `0029_tee_box_multi_rating.sql`). Verdiene er kanoniske i kodebasen.
- **`PlayerOption`-type** (`app/admin/games/new/GameForm.tsx`) er minimal i dag (`id, name, nickname, hcp_index, email, pending`). Utvidelse med `gender` + `level` følger samme mønster som de andre feltene.
- **`getNewGameFormData`** ([lib/games/newGameFormData.ts:39](lib/games/newGameFormData.ts:39)) er én cached helper som server-er begge create-flows (`/admin/games/new` + `/opprett-spill`). Den joiner allerede `users` — å legge til to felt der propagerer til begge ruter samtidig.
- **Norsk golf-konvensjon** (NGF-håndbok): junior < 21 år, senior ≥ 50 år, men senior-status er typisk selv-erklært (klubb-regler varierer). Junior-status er strengere alders-knyttet, men har ingen kode-mekanisme i Tørny ennå.

## Prior Decisions

- **Fra [#48](https://github.com/jdlarssen/golf-app/issues/48) (kjønn-tag på tee-bokser, shipped 2026-05-17):** `tee_box_gender`-enumen er etablert vokabular. `game_players.tee_gender` er per-spill freeze; `users.gender` blir kun en default-kilde, ikke autoritativ for et aktivt spill.
- **Fra [#168](https://github.com/jdlarssen/golf-app/issues/168) (handicap-prompt, shipped 2026-05-25):** Soft-prompt-mønsteret på `/profile` er etablert (inline `Card` med to-knappers-valg). Vi gjenbruker mønsteret, ikke koden — handicap-prompt sjekker `handicap_updated_at`-staleness, ikke NULL-tilstand.
- **Fra [#203](https://github.com/jdlarssen/golf-app/issues/203) (game-wizard, shipped 2026-05-25):** `useGameFormState` er den nye state-hjemmet, og `PlayersSection` / `TeamsAssignmentSection` er ekstrahert. M/D/J-toggle bor i `TeamsAssignmentSection`. Auto-default-logikken kobles inn via `useGameFormState`s initial state.
- **Solo-flyt:** GameForm bruker `player_${pid}_gender` FormData-key uavhengig av modus, så auto-default virker likt for alle game-moder (best-ball, par, Texas, matchplay, solo).

## Design

### 1. Datamodell

Ny migrasjon `supabase/migrations/0036_users_gender_level.sql`:

```sql
-- Gender for users: bare mens/ladies (juniors er en spillerklasse, ikke et kjønn).
create type user_gender as enum ('mens', 'ladies');

-- Spillerklasse: brukes til å auto-velge juniortee (når banen har en) +
-- fremtidig senior-tee-logikk.
create type player_level as enum ('junior', 'normal', 'senior');

alter table public.users
  add column gender user_gender,
  add column level player_level not null default 'normal';
```

**Hvorfor egen `user_gender`-enum (ikke gjenbruk av `tee_box_gender`):** `tee_box_gender` har tre verdier (mens/ladies/juniors) som beskriver *tee-en*, ikke *spilleren*. En junior gutt har `gender = 'mens'`, `level = 'junior'`, og blir matchet mot en `tee_gender = 'juniors'`-tee. Adskilte enums holder semantikken ren.

**Hvorfor `gender` er nullable:** eksisterende brukere har ikke verdi i dag → null = «ikke svart enda», som driver soft-prompt på `/profile`. Nye brukere får påkrevd valg i onboarding (se § 2).

**Hvorfor `level` har default `'normal'`:** 99 % av spillerne er voksne. Default sparer brukerne for et ekstra påkrevd valg i onboarding hvis vi senere vil gjøre det opsjonelt; per nå er det fortsatt påkrevd UI-radio med pre-valgt «Voksen».

Ingen backfill av `gender` for eksisterende brukere — null forblir null til de besvarer soft-prompt. `level` defaultes til `'normal'` automatisk via DB-default.

### 2. Onboarding (`/complete-profile`)

[`app/complete-profile/page.tsx`](app/complete-profile/page.tsx) og [`actions.ts`](app/complete-profile/actions.ts) utvides med to nye påkrevde felt:

**UI (etter «Handicap-index»-feltet, før «Lagre»-knappen):**

```
Kjønn *
( ) Herre   ( ) Dame

Spillerklasse *
( ) Junior   (●) Voksen   ( ) Senior

(Sub-tekst under begge:)
Brukes til å foreslå riktig tee og beregne course handicap riktig.
```

- `gender`: ingen pre-valg, må aktivt klikkes. Form-validering blokkerer submit hvis null.
- `level`: pre-valgt «Voksen» (mest vanlig). Brukeren kan endre, men trenger ikke.
- Server-action validerer `gender ∈ {'mens', 'ladies'}` og `level ∈ {'junior', 'normal', 'senior'}` før insert.

### 3. Profile-edit (`/profile`)

#### 3a. Vis-state ([app/profile/page.tsx](app/profile/page.tsx))

Legg til to nye linjer i nåværende profil-visning:

```
Kjønn: Herre
Spillerklasse: Voksen
```

Vis `—` hvis verdien er null (kun gender kan være null per § 1).

#### 3b. Edit-form ([app/profile/actions.ts](app/profile/actions.ts) `updateProfile`)

Utvid form-en og server-action-en med begge feltene (samme radio-mønster som onboarding). Begge påkrevd ved lagring. Sub-tekst gjenbrukes.

#### 3c. Soft-prompt (analog til [#168](https://github.com/jdlarssen/golf-app/issues/168))

I [`app/profile/page.tsx`](app/profile/page.tsx) — over edit-form-en — vis et inline `Card` **kun** når `users.gender IS NULL`:

```
┌──────────────────────────────────────────┐
│ Velg kjønn for tee-anbefaling            │
│ Tørny vet ikke hvilken tee du normalt    │
│ spiller fra. Sett det her, så blir spill │
│ enklere å opprette.                      │
│                                          │
│ [ Sett kjønn ]                           │
└──────────────────────────────────────────┘
```

- Bruker eksisterende `Card`- og `Button`-primitives. Plasseres øverst i `/profile`-page, over edit-form.
- «Sett kjønn»-knappen er en `SmartLink` til ankerpunkt `#kjonn` i samme form, scroller dit + auto-fokuserer første radio.
- Kortet forsvinner straks `gender` er satt (re-render etter `updateProfile`).
- Ikke en separat server-action — bruker bare den eksisterende `updateProfile`.

**Ikke** vis soft-prompt for `level` — den har default-verdi («Voksen») som dekker 99 % av tilfellene, så ingen prompt-trigger er nødvendig.

### 4. Admin-spillere (`/admin/spillere/[id]`)

[`app/admin/spillere/[id]/page.tsx`](app/admin/spillere/[id]/page.tsx) og [`actions.ts`](app/admin/spillere/[id]/actions.ts) speiler /profile-edit-mønsteret: legg til samme to radio-grupper i admin-edit-form. Admin kan sette/endre kjønn og spillerklasse for inviterte spillere som ikke har logget på enda — bruker selv overstyrer på neste innlogging hvis ønsket. Samme validering som /profile.

Ingen soft-prompt i admin-flatet — admin har bredere oversikt og kan fikse i bulk fra spillerlisten.

### 5. Auto-default i game-wizard

#### 5a. Hent gender + level via `getNewGameFormData`

[`lib/games/newGameFormData.ts:51`](lib/games/newGameFormData.ts:51) utvides:

```ts
.select('id, name, nickname, hcp_index, email, profile_completed_at, gender, level')
```

`UserRow`- og `PlayerOption`-typene utvides med:

```ts
gender: 'mens' | 'ladies' | null;
level: 'junior' | 'normal' | 'senior';
```

#### 5b. Initial `player_genders` i `useGameFormState`

[`app/admin/games/new/useGameFormState.ts:125`](app/admin/games/new/useGameFormState.ts:125) endres fra:

```ts
initialValues?.player_genders ?? {}
```

til en derivert default som mapper `users.gender` + `users.level` → `'M'|'D'|'J'`:

```ts
// Pure helper i lib/games/playerGenderDefault.ts
export function playerGenderDefault(
  gender: 'mens' | 'ladies' | null,
  level: 'junior' | 'normal' | 'senior',
): 'M' | 'D' | 'J' {
  if (level === 'junior') return 'J';
  if (gender === 'ladies') return 'D';
  return 'M';
}
```

Regel: `level === 'junior'` overstyrer kjønn (junior gutter OG jenter går på juniortee hvis banen har en). Senior-status endrer **ikke** toggle-en i dag — det er en informasjons-tag for fremtidig senior-tee-logikk (utenfor scope).

`useGameFormState` bygger så `player_genders`-initial:

```ts
const derived: Record<string, 'M' | 'D' | 'J'> = {};
for (const p of players) {
  derived[p.id] = playerGenderDefault(p.gender, p.level);
}
const player_genders = initialValues?.player_genders ?? derived;
```

`initialValues?.player_genders` (fra edit-flyten) vinner — vi pre-fyller ikke for spill som allerede har eksplisitt M/D/J per spiller i DB.

#### 5c. Wizard-flyten

Ingen UI-endring i `PlayersSection` eller `TeamsAssignmentSection` — toggle-en eksisterer allerede. Spilleren vises med riktig pre-valgt knapp basert på sin profil. Admin kan fortsatt klikke for å overstyre, og overstyringen serialiseres til `player_${pid}_gender`-FormData som før.

### 6. Pure helper og tester

Ny fil `lib/games/playerGenderDefault.ts` med funksjonen over + unit-tester:

- `gender=mens, level=normal → 'M'`
- `gender=ladies, level=normal → 'D'`
- `gender=mens, level=junior → 'J'`
- `gender=ladies, level=junior → 'J'`
- `gender=null, level=normal → 'M'` (backwards-compat-fallback)
- `gender=null, level=junior → 'J'` (junior wins over null gender)
- `gender=mens, level=senior → 'M'` (senior endrer ikke toggle)
- `gender=ladies, level=senior → 'D'`

## Edge Cases & Guardrails

- **Eksisterende brukere uten gender og UTEN profile_completed_at:** de er ikke onboardet enda; complete-profile blokkerer dem til de svarer. Når de fullfører, settes begge felt → soft-prompt trigger aldri.
- **Eksisterende brukere uten gender MEN med profile_completed_at:** `gender = NULL`, `level = 'normal'` (DB-default). Soft-prompt vises på neste /profile-besøk. Game-wizard auto-defaulter dem til 'M' inntil de svarer.
- **Bruker overstyrer M/D/J i wizard for ett spill:** wizard-state vinner over profil-default. Endring lagres i `game_players.tee_gender` for det spillet; rører ikke `users.gender`.
- **Admin endrer `users.gender` mens et aktivt spill kjører:** ingen effekt på spillet (per-spill freeze i `game_players.tee_gender`). Endringen tas inn på neste spill-opprettelse.
- **Junior fyller 21 år:** ingen automatisk endring. Brukeren oppdaterer selv på /profile. (Birth-year-derivering ble vurdert og forkastet — sensitive data + senior-status er uansett selv-valgt.)
- **Trans / non-binary spillere:** UI sier «Kjønn» direkte. To valg fordi norsk golf-tee-konvensjonen er binær. Sub-teksten klargjør at det handler om tee-valg, ikke identitet. Vi føyer ikke til ikke-binær-option for denne featuren — det krever bredere produkt-diskusjon utenfor scope (defer til separat issue hvis det blir relevant).
- **Soft-prompt-staleness:** prompt-en sjekker bare `gender IS NULL`. Ingen tidsfrist. Brukeren slipper å se den igjen straks de har svart.

## Key Decisions

- **Scope:** gender + level. Begge i samme kontrakt — selv om level er den minst kritiske, koster det lite ekstra å løse begge nå.
- **Egne enums:** `user_gender` (mens/ladies) og `player_level` (junior/normal/senior). Adskilt fra `tee_box_gender` for semantisk klarhet.
- **Level-derivering:** selv-erklært enum, default «Voksen». Ingen birth_year. Brukeren oppdaterer manuelt hvis spillerklasse endres.
- **Onboarding:** påkrevd for nye brukere. Tre felt vs to er minimal friksjon, garanterer auto-default fra dag 1.
- **Backwards-compat for eksisterende brukere:** soft-prompt på /profile (Card-mønster fra #168). Ikke-blokkerende. Spillerne fikser når de er klare.
- **UI-tone:** «Kjønn» + «Spillerklasse» — direkte. Sub-tekst forklarer formålet. Humanizer-pass på endelig copy ved implementasjon.
- **Admin kan også sette:** speile /profile-edit i /admin/spillere/[id]. Admin har bredere oversikt og kan fikse for inviterte spillere før de logger på.

**Claude's Discretion:**
- Eksakt copy-formulering i onboarding/profile/soft-prompt (kjør humanizer på alle norske strenger før commit; se CLAUDE.md `### Språk-kvalitet i bruker-rettet copy`).
- Plassering av kjønn/spillerklasse i edit-form-rekkefølge (foreslår: navn → nickname → handicap → kjønn → spillerklasse → email).
- Om radio-knappene rendres som native HTML `<input type="radio">` eller som visuelle button-grupper (samme mønster som M/D-toggle i game-form). Anbefalt: native radio for tilgjengelighet + enklere form-håndtering.
- Hvor i admin-spillere-listen (`/admin/spillere`) kjønn/spillerklasse evt. vises som chip eller kolonne (kan defer hvis ikke nødvendig).

## Success Criteria

- [ ] Ny migrasjon `0036_users_gender_level.sql` lagt til + `lib/database.types.ts` regenerert. Verifikasjon: `grep "gender:" lib/database.types.ts` returnerer treff i `users.Row`.
- [ ] Onboarding-form (`/complete-profile`) krever begge nye felt; submit feiler med tydelig norsk feilmelding hvis ikke satt. Verifikasjon: åpne `/complete-profile` på preview, prøv å submitte uten å velge kjønn — får inline-feilmelding.
- [ ] Profile-edit (`/profile`) viser og lar bruker oppdatere begge felt. Verifikasjon: åpne `/profile`, endre kjønn fra Herre til Dame, lagre, last på nytt → ny verdi vises.
- [ ] Soft-prompt-kort vises på `/profile` når `gender IS NULL` og forsvinner umiddelbart etter at gender settes. Verifikasjon: SQL `update users set gender = null where id = ...`, last `/profile` → kortet vises; svar → kortet forsvinner.
- [ ] Admin-spillere-edit (`/admin/spillere/[id]`) speiler /profile-edit for begge felt. Verifikasjon: admin endrer kjønn på en annen spiller, det reflekteres straks i game-wizardens M/D-toggle for nytt spill.
- [ ] Game-wizard (`/admin/games/new` og `/opprett-spill`) auto-defaulter M/D/J-toggle basert på `playerGenderDefault(gender, level)`. Verifikasjon: opprett spill med 4 spillere der 2 har `gender='ladies'`, 1 har `level='junior'` — toggle viser D/D/J/M uten at admin klikker.
- [ ] `playerGenderDefault`-helper har full unit-test-dekning (alle 8 kombinasjoner i § 6). Verifikasjon: `npm test -- playerGenderDefault` viser 8 passerende tester.

## Gates

- [ ] `npx tsc --noEmit` passerer
- [ ] `npm test -- playerGenderDefault` passerer
- [ ] `npm run lint` passerer (eslint over endrede filer)
- [ ] Pre-commit-hook `.githooks/pre-commit` ingen humanizer-advarsler på nye norske strenger
- [ ] Manuell røyk-test på preview: opprett ny bruker via invitasjon → fullfør onboarding med gender+level → opprett spill med blandet roster → toggle-defaults stemmer
- [ ] Vercel-preview deployer grønt; spot-sjekk `/profile` og `/admin/games/new` i Safari (mobil-første)

## Files Likely Touched

- `supabase/migrations/0036_users_gender_level.sql` — ny migrasjon
- `lib/database.types.ts` — regenerert (Insert/Update/Row inkl. gender + level)
- `lib/games/playerGenderDefault.ts` — ny pure helper
- `lib/games/playerGenderDefault.test.ts` — unit-tester
- `lib/games/newGameFormData.ts` — utvid select + `PlayerOption`-type + `UserRow`
- `app/admin/games/new/GameForm.tsx` — utvid `PlayerOption`-type-eksport (kun type-endring)
- `app/admin/games/new/useGameFormState.ts` — derive initial `player_genders` fra players-listen
- `app/complete-profile/page.tsx` — ny kjønn + spillerklasse-felt
- `app/complete-profile/actions.ts` — validering + insert av nye felt
- `app/profile/page.tsx` — vis + soft-prompt-kort
- `app/profile/actions.ts` — `updateProfile` aksepterer nye felt
- `app/admin/spillere/[id]/page.tsx` — vis nye felt
- `app/admin/spillere/[id]/actions.ts` — `updateUser` aksepterer nye felt
- `package.json` + `CHANGELOG.md` — versjons-bump + ny oppføring (MINOR — ny bruker-synlig feature)

## Out of Scope

- **Birth-year-lagring og alders-basert junior-derivering** — vurdert og forkastet (sensitive data, level kan endres selv). Defer hvis Tørny senere får nok juniorer til at manuell vedlikehold blir et problem.
- **Senior-tee-logikk** — `level = 'senior'` lagres, men påvirker ikke M/D/J-toggle i dag. Egen tee for seniors er en separat feature (krever ny `senior`-verdi i `tee_box_gender`-enumen).
- **Non-binær / tredje kjønn-option** — krever bredere produkt-diskusjon (tee-konvensjon, course-handicap-formel). Defer til separat issue hvis brukerbase signaliserer behov.
- **Bulk-admin-flyt** for å sette gender/level for flere spillere samtidig (f.eks. import fra CSV) — denne kontrakten dekker per-spiller-admin-edit. Bulk er sin egen kontrakt hvis aktuelt.
- **Synkronisering med eksternt golf-system** (Golfbox, NGF-database) — utenfor scope. Manuell selv-rapportering for nå.
- **Visning av kjønn/spillerklasse i public-profil-view eller leaderboard** — feltene er primært admin-rettet (for tee-valg). Ingen behov for å eksponere dem i leaderboard p.t.
