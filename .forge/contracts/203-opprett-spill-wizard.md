

# Spec: Opprett spill — wizard-flyt med escape-hatch

**Issue:** [#203](https://github.com/jdlarssen/golf-app/issues/203)
**Berører ruter:** `/admin/games/new` + `/opprett-spill` (delt komponent siden [#198](https://github.com/jdlarssen/golf-app/issues/198))
**Bump:** `1.17.0` → `1.18.0` (MINOR — ny bruker-synlig UX-flyt)
**Edit-flyt:** uberørt (`/admin/games/[id]/edit` bruker fortsatt dagens `GameForm.tsx`)

## Problem

`app/admin/games/new/GameForm.tsx` er 1818 linjer og rendrer seks nummererte seksjoner vertikalt: 1. Spillet, 2. Spillere, 3. Format, 4. Lag/Sider, 5. Flights/Tee per spiller, 6. Innstillinger. For hurtigopprettelse av det vanlige tilfellet («best ball netto, faste kompiser, hjemmebane») må admin scrolle gjennom hele lista, mens halvparten av feltene er irrelevante for valgt modus. Resultat: mye scrolling, lett å miste oversikt, fryktinngytende for nye admin- og trusted-creator-brukere (introdusert i 1.17.0 — første ikke-admin-bruker fra [#198](https://github.com/jdlarssen/golf-app/issues/198) skal kunne opprette spill uten å trenge en lengre forklaring).

Målet er en **4-stegs wizard** som dekker 80 % av tilfellene raskt, og en **«Tilpass detaljer»-escape-hatch** som åpner dagens fullform med wizard-state pre-fylt for power-users som vil justere sideturnering, peer approval, score visibility eller per-spiller-tee.

## Prior decisions

Disse stammer fra tidligere kontrakter og epic-er. Carry forward:

- **GameForm er delt mellom `/admin/games/new` og `/opprett-spill`** ([#198](https://github.com/jdlarssen/golf-app/issues/198)-kontrakten). Begge ruter importerer `GameForm` direkte fra `app/admin/games/new/GameForm.tsx`. Wizard-en MÅ kobles inn samme sted så trusted creators får samme UX-løft.
- **Mode-router-arkitektur** (`lib/scoring/index.ts`): 5 game_modes via `MODE_LABELS` single-source-of-truth. ModeSelector-tile-en er det eksisterende «spill-type»-velgeren — gjenbrukes 1:1 som wizard-steg 1, ingen ny taksonomi.
- **Per-mode validators** i `lib/games/gamePayload.ts` håndhever team/flight/side-reglene. Wizard-en endrer ingen valideringer; den re-bruker `playersValidForMode`, `canPublish`, `missingForPublish` fra dagens form-state.
- **Server-actions er FormData-kontrakten**: `createGameDraft` / `createAndPublishGame` (og deres edit-equivalenter) leser `game_mode`, `team_size`, `player_${i}_*`, `hcp_allowance_pct`, `texas_team_handicap_pct`, `side_*`, `score_visibility`, `require_peer_approval`, `scheduled_tee_off_at`. Wizard MÅ serialisere til samme FormData-skjema — ingen actions.ts-endringer.
- **Edit-flyt er uberørt** (per gray-area-discussion 2026-05-25): `lock_game_mode`, `lock_score_visibility`, `lock_side_tournament` + DB-pre-fylt initialValues har semantikk som passer dårlig med lineær wizard. `/admin/games/[id]/edit/page.tsx` fortsetter å rendre `GameForm.tsx` uendret.
- **Texas-spesifikk handicap-prosent** lever i `mode_config.team_handicap_pct` (ikke `hcp_allowance_pct`). Wizard-en respekterer dette via samme `isTexas`-grenen som dagens form.

## Design

### Komponent-arkitektur

Ekstraher state + sub-seksjoner i én pass; bygg wizard på toppen. Gjenbruker (ikke duplikat) av sub-komponenter er kritisk siden GameForm.tsx fortsatt skal serve edit-flyten.

**1. Ekstrahert state-hook `useGameFormState()`**
- Flytt alle `useState`-kall (linje 232–322 i dag) + flag-derivasjoner (linje 354–387) + `orderedPayload`-memo (linje 602–652) + validitets-flags (`playersValidForMode`, `canPublish`, `missingForPublish`) inn i `app/admin/games/new/useGameFormState.ts`.
- Hook-en tar `{ initialValues, players, courses }` og returnerer hele state-objektet + setters + handlers (`togglePlayer`, `handleModeChange`, `handleTeamSizeChange`, `assignPlayerToSlot`, `assignPlayerToSide`, `drawRandomTeams`, `clearTeams`, `setFlightForPlayer`, `setPlayerGender`, etc.).
- Både `GameForm` (edit) og `GameWizard` (new) kaller hooken. Garanterer at scoring/validerings-logikk har ett hjem.

**2. Ekstraherte presentasjons-seksjoner**

Hver seksjon er en ren komponent som tar state-deler + handlers via props. Brukes av både GameForm (stacked) og GameWizard (per steg).

| Komponent | Innhold | Brukt av |
|---|---|---|
| `sections/BasicsSection.tsx` | Spillnavn, bane, tee-boks, tee-off | GameForm steg 1 + GameWizard steg 2 |
| `sections/PlayersSection.tsx` | Søk, chips, filtrert liste, mode-aware counter | GameForm + GameWizard steg 3 |
| `sections/TeamsAssignmentSection.tsx` | Lag-grid (best-ball/par/Texas), random-draw, clear, matchplay-sider, flights (best-ball), per-spiller-tee | GameForm + GameWizard steg 3 (inline-utvidelse) |
| `sections/AdvancedSettingsSection.tsx` | Score visibility (radio), side tournament + categories, peer approval, HCP allowance (eller Texas team handicap) | GameForm + GameWizard steg 4 (inline disclosure) |
| `sections/ReadyStep.tsx` | Wizard steg 4 — summary card, «Tilpass detaljer»-link, «Vis avanserte innstillinger»-disclosure, publish/draft-knapper | GameWizard kun |

Sub-komponenter som allerede finnes og gjenbrukes uendret: `ModeSelector`, `TeamSizeSelector`, `SideCategoriesPicker`.

**3. `app/admin/games/new/GameWizard.tsx`** — orkestrator

- Kaller `useGameFormState()` og holder all form-state.
- Lokal state: `view: 'wizard' | 'full'` (default `'wizard'`) + `step: 1 | 2 | 3 | 4`.
- URL-synk: `step` speiles til `?step=N`-search-param via `useSearchParams` + `useRouter.replace({scroll: false})` — gir browser-back-knapp riktig oppførsel (steg 3 → steg 2). Hver gang `?step` endres i URL, oppdateres lokal state. View-toggle reflekteres som `?view=full` (manglende = wizard).
- Renderer:
  - `view === 'wizard'`: stepper-header («Steg 2 av 4 · Bane») + steg-spesifikk komponent + footer med «Forrige»/«Neste»-knapper. Steg-1-«Forrige» er disabled. Steg-4 erstatter «Neste» med publish/draft-knapper og «Tilpass alle detaljer»-tekstlenke.
  - `view === 'full'`: rendrer `<GameForm>` (samme komponent som edit-flyten) med `initialValues` derivert fra wizard-state — alle valg fra wizard pre-fylles. Sticky tekst-lenke øverst: «← Tilbake til hurtig-oppsett» som setter `view = 'wizard'` og gjenoppretter siste `?step`.
- Validering per steg (kun for «Neste»-knapp; «Tilpass detaljer» og draft-save tolererer partial state):
  - Steg 1: `gameMode !== ''` (alltid sant, default `best_ball_netto`).
  - Steg 2: `courseId !== '' && teeBoxId !== ''`. (Tee-off er sterkt anbefalt men ikke gating — datetime-local er valgfri for utkast.)
  - Steg 3: `playersValidForMode === true`. Mode-spesifikk feilmelding under «Neste»-knappen hvis ikke gyldig (hentes fra `missingForPublish[0]` med wizard-tilpasset wording).
  - Steg 4: ingen ekstra gating utover dagens `canPublish` på publish-knappen.

**4. Steg-spesifikke skjermer**

**Steg 1: Velg format** (`<ModeSelector>` + `<TeamSizeSelector>`)
- Kun ModeSelector og TeamSizeSelector. Ingen andre felter.
- Header: «Steg 1 av 4 · Format». Sub-tekst: «Hva skal dere spille i dag?»
- «Neste»-knapp aktiveres umiddelbart (gameMode har alltid default).

**Steg 2: Bane og tidspunkt** (`<BasicsSection>` minus spillnavn)
- Bane (select) + tee-boks (select) + tee-off (datetime-local). Spillnavn er flyttet til steg 4 for å støtte auto-suggest.
- Auto-name-helper `lib/games/autoGameName.ts`: pure funksjon `suggestGameName({ courseName, scheduledTeeOffAt }) → string` som returnerer f.eks. `"Stiklestad 25. mai"` eller `"Stiklestad"` (uten dato hvis tee-off er tomt). Norske måneder lowercase (`mai`, ikke `Mai`).
- Sub-tekst: «Hvor og når?»

**Steg 3: Spillere** (`<PlayersSection>` + conditional `<TeamsAssignmentSection>`)
- Toppdelen: spiller-velgeren uendret (chips + søk + filtrert liste + mode-aware counter).
- Når `playersValidForMode === true` (best-ball: 8 valgt, par: ≥2 + partall, Texas: ≥teamSize + delelig, matchplay: 2 valgt, solo: ≥1) ekspanderes `<TeamsAssignmentSection>` inline rett under spiller-listen med en kort animasjon (CSS `transition` på max-height/opacity — respekter `prefers-reduced-motion`).
- For best-ball: grid + flights + per-spiller-tee komme inline (lengste steg). For solo: ingenting ekstra. For matchplay: sider-grid. For par/Texas: lag-grid.
- Sub-tekst varierer per modus: «Hvem skal spille?» (solo) / «Velg 8 spillere, så fordeler du lag og flights» (best-ball) / «Velg 2 spillere og sett én på hver side» (matchplay) / etc.

**Steg 4: Klar?** (`<ReadyStep>`)
- Summary-kort med alle valg som plain-text-rader:
  - Navn (pre-fylt med `suggestGameName(...)` hvis brukeren ikke har redigert manuelt; klikkbart for inline-rediger via `<Input>` som vises ved klikk)
  - Format + lagstørrelse («Best ball netto · 2-mannslag»)
  - Bane + tee + tee-off
  - Antall spillere + lag-fordeling-summary («4 lag à 2 spillere»)
- «Vis avanserte innstillinger»-toggle (default kollapset). Ekspanderer `<AdvancedSettingsSection>` inline: score visibility (default «Vis alt under runden»), side tournament (default av), peer approval (default av), HCP allowance (default 100, eller Texas team handicap default 25/10).
- Knapper: primær «Lagre og publiser» (disabled hvis `!canPublish`, med `missingForPublish`-liste under), sekundær «Lagre utkast».
- Tekstlenke: «Tilpass alle detaljer» — bytter `view = 'full'` og bevarer all wizard-state.

**5. `page.tsx`-tilkobling**

`app/admin/games/new/page.tsx` (linje 109–122) og `app/opprett-spill/page.tsx` (linje 116–129) bytter `<GameForm ...>` til `<GameWizard ...>`. Samme props (`courses`, `players`, `mode: { kind: 'create', createDraftAction, createAndPublishAction }`).

**6. URL- og navigasjons-state**

- `?step=1|2|3|4` — gjeldende steg.
- `?view=full` — opt-in til full-form-view (manglende = wizard).
- Browser back fra `/admin/games/new?step=3` til `/admin/games/new?step=2` flytter wizard tilbake ett steg uten å miste state.
- Browser back fra `/admin/games/new?step=1` ut av wizard-en (til `/admin/games` eller forrige rute).
- Sticky banner-fri — wizard-stepper er sin egen header. `<TopBar>` (chevron + kicker) beholdes uendret.

**7. Auto-name-helper (`lib/games/autoGameName.ts`)**

```ts
export function suggestGameName({
  courseName,
  scheduledTeeOffAt, // 'YYYY-MM-DDTHH:mm' eller ''
}: { courseName: string | null; scheduledTeeOffAt: string }): string {
  if (!courseName) return '';
  if (!scheduledTeeOffAt) return courseName;
  const date = new Date(scheduledTeeOffAt);
  if (Number.isNaN(date.getTime())) return courseName;
  const day = date.getDate();
  const month = [
    'januar','februar','mars','april','mai','juni',
    'juli','august','september','oktober','november','desember',
  ][date.getMonth()];
  return `${courseName} ${day}. ${month}`;
}
```

GameWizard bruker en `nameTouched`-flag (lokal useState): hvis bruker har redigert navnet manuelt, ikke overstyr ved senere endringer i bane/tee-off. Tracking starter ved første onChange på navne-input.

### Hva som IKKE endres

- `lib/games/gamePayload.ts` (server-side validering) — uendret.
- `app/admin/games/new/actions.ts` (server actions) — uendret. FormData-shape er identisk.
- `app/admin/games/[id]/edit/page.tsx` + edit-actions — uendret.
- DB-skjema — ingen migrasjon.
- `GameForm.tsx` brukes fortsatt av edit-flyten. Etter refactor er det en presentasjons-komponent som stacker alle sub-seksjoner; useGameFormState-hooken eier all logikken.

## Edge cases & guardrails

- **Bane-bytte midt i wizard**: hvis admin går tilbake til steg 2 og bytter bane, nullstilles tee-boks (`teeBoxId = ''`) og `playerGenders` (samme oppførsel som dagens onChange-handler på linje 983–987). Steg 3-validering kan da slå tilbake til invalid; admin må re-velge tee for å komme videre.
- **Modus-bytte midt i wizard**: hvis admin går tilbake til steg 1 og bytter modus, kjøres `handleModeChange` som auto-velger ny `team_size` og nullstiller Texas-defaults. Spiller-state (`selectedPlayerIds`) bevares, men `teamByPlayer` og `flightByPlayer` kan bli inkonsistente for ny modus. Steg 3 viser da invalid-tilstand; admin må re-fordele lag/sider.
- **Hopp til full-form og tilbake**: state preserveres begge veier. Hvis admin endrer felt i full-form som ikke har wizard-tilsvar (f.eks. side_disabled_categories), forblir endringen i state og persisteres på publish. Tilbake-til-wizard viser ikke endringen, men den lagres uansett.
- **Edit-flyt URL-kollisjon**: edit-flyten matcher ikke `/admin/games/new` så `?step=`/`?view=` slipper ikke gjennom. Likevel: hvis admin manuelt skriver `/admin/games/[id]/edit?step=2&view=full`, ignoreres URL-params (edit rendrer ikke wizard).
- **Reduced-motion**: alle wizard-transitioner (`<TeamsAssignmentSection>`-inline-utvidelse, steg-overganger) respekterer `@media (prefers-reduced-motion: reduce)` per `feedback_check_reduced_motion_for_animation_bugs`. Standard CSS-transition på 200 ms; reduced-motion svitsj instant.
- **Server-side rendering**: GameWizard er `'use client'`. URL-state leses via `useSearchParams` (client-only). Initial server-render bruker `searchParams` fra page-prop som default-step, så browser-flow med back-knapp fungerer fra første render.
- **Mobile keyboard inflation**: stepper-header må ikke skyves ut av viewport når input får fokus (datetime-local åpner native picker på iOS). Hold stepper non-sticky; topp-til-bunn-flow uten posisjons-hacks.
- **Tab-rekkefølge**: hvert steg starter fokus på første interactive element (`autoFocus` på input ved steg-mount). «Forrige»/«Neste» er focusable-keyboard-shortcuts.
- **Validation-feilkopi-konsistens**: wizard-en bruker samme `missingForPublish`-array som dagens form, men presenterer kun det første elementet per steg under «Neste»-knappen istedenfor full-list under publish-knapp.
- **Trusted-creator-rute**: `/opprett-spill` bruker `AppShell` (ikke `AdminShell`). GameWizard skal rendres innenfor begge shells uten visuell tilpasning — den lever som content inni `<Card>`-wrapper i begge.

## Key decisions

- **Wizard er 4 steg** (per gray-area-discussion): Format → Bane → Spillere → Klar. Best-ball/Texas/matchplay får team/flight-UI inline i steg 3, ikke som separat steg 3.5.
- **Templates = 5 game_modes 1:1**: gjenbruker eksisterende `<ModeSelector>` tile-komponent som steg 1. Ingen ny use-case-baseret taksonomi.
- **Edit-flyt røres ikke**: redesign-en gjelder kun create-flyten. Wizard ville krevd mange lock-håndteringer for å passe edit, og kost/nytte tilsier «kun /new først, se hvordan det virker».
- **Conditional fields = inline disclosure i steg 4**: sideturnering, score visibility, peer approval, HCP allowance er kollapset under «Vis avanserte innstillinger»-toggle. Default-verdier velges automatisk per modus.
- **Auto-name**: pre-fylles fra bane + dato (`Stiklestad 25. mai`), bruker kan redigere ved klikk på navnet i summary-kortet. `nameTouched`-flag forhindrer overstyring etter manuell endring.
- **Escape-hatch lever fra steg 4**: «Tilpass alle detaljer»-tekstlenke under publish-knappen, pluss sticky-tilbake-lenke («← Tilbake til hurtig-oppsett») øverst i full-form. Ingen toggle på hver wizard-skjerm (holder hurtig-oppsettet rent).
- **URL-state via search-params**: `?step=` og `?view=` — gir browser-back forutsigbar oppførsel og deep-linking til steg 4 for senere QA.
- **Refactor-strategi**: ekstraher state til hook + seksjoner til komponenter i én pass. Gjenbruker (ikke kopiering) sikrer at validerings-endringer ikke driver fra hverandre.

**Claude's discretion:**
- Eksakt visuell stil på stepper-header (progress-bar vs nummerert tab-strip vs subtle text «Steg 2 av 4»). Anbefalt: subtil tekst-stepper med en tynn progress-bar under, matcher forest-and-champagne-paletten via `--color-primary` border-bottom.
- Eksakt copy på `<ReadyStep>`-summary-rader («Format», «Bane», etc.). Følger brand-stemme-disiplinen.
- Eksakt animasjons-timing for inline-utvidelser (200 ms ease-out anbefalt; respekt for reduced-motion).
- Hvorvidt steg-overganger gir en subtil slide-animasjon (steg 2 inn fra høyre) eller bare instant cross-fade. Default: instant, holder det enkelt.
- Hvor «Tilpass detaljer»-tekstlenke i steg 4 er plassert visuelt (under «Lagre og publiser»-knappen vs ved siden av «Lagre utkast»). Anbefalt: under utkast-knappen, mindre prominent.
- Hvorvidt seksjons-ekstraksjon krever ekstra props-rensning (f.eks. om TeamsAssignmentSection skal ta en `mode`-discriminator eller alle 6 sub-mode-flags). Anbefalt: ett discriminator-objekt `{ kind: 'best-ball' | 'par-stableford' | 'texas' | 'matchplay' | 'solo' }` som narrower internt.

## Success criteria

- [ ] **K1:** `lib/games/autoGameName.ts` finnes med `suggestGameName({courseName, scheduledTeeOffAt})`. Unit-tester dekker: tom courseName → `''`, tom dato → kun bane-navn, gyldig dato → `"Stiklestad 25. mai"` (norsk lowercase måned), ugyldig dato → kun bane-navn.
- [ ] **K2:** `app/admin/games/new/useGameFormState.ts` finnes og kapsler all state + handlers + memos fra dagens `GameForm.tsx`. `GameForm` og `GameWizard` konsumerer hooken.
- [ ] **K3:** Sub-seksjoner ekstrahert til `app/admin/games/new/sections/` (`BasicsSection`, `PlayersSection`, `TeamsAssignmentSection`, `AdvancedSettingsSection`, `ReadyStep`). Hver komponent har en kort header-kommentar som dokumenterer ansvar.
- [ ] **K4:** `app/admin/games/new/GameWizard.tsx` finnes, rendrer 4 wizard-steg med stepper-header, «Forrige»/«Neste»-knapper, og per-steg-validering. URL-state synker via `?step=` og `?view=`.
- [ ] **K5:** Steg 1 viser ModeSelector + TeamSizeSelector. Steg 2 viser bane/tee/tee-off (uten spillnavn). Steg 3 viser spillere + conditional team/sider/flights inline. Steg 4 viser summary, advanced-toggle, og publish/draft-knapper + escape-hatch.
- [ ] **K6:** «Tilpass alle detaljer»-knapp i steg 4 bytter til full-form-view med all wizard-state pre-fylt. «← Tilbake til hurtig-oppsett» i full-form bytter tilbake til siste step uten å miste state. (Verifiseres med Vitest + Testing Library: render wizard, fyll noen felt, klikk escape-hatch, sjekk at GameForm rendrer med samme verdier, klikk tilbake, sjekk at wizard-steg 4 viser samme summary.)
- [ ] **K7:** Auto-name fungerer: når bruker velger bane og tee-off, viser steg 4 summary navnet som «Stiklestad 25. mai». Klikk på navnet åpner inline-input. Manuell rediger setter `nameTouched=true` og forhindrer auto-overstyring ved senere bane/tee-off-endring.
- [ ] **K8:** `app/admin/games/new/page.tsx` og `app/opprett-spill/page.tsx` rendrer `<GameWizard>` istedenfor `<GameForm>`. Edit-flyten (`app/admin/games/[id]/edit/page.tsx`) rendrer fortsatt `<GameForm>` uendret.
- [ ] **K9:** Eksisterende `GameForm.test.tsx`-suite passerer uendret (refactor er ren ekstraksjon — props og oppførsel uendret). Nye tester for GameWizard (`GameWizard.test.tsx`): minst (a) hurtig solo-stableford-flyt happy-path (4 trinn til publish), (b) best-ball-modus med inline team/flight-utvidelse i steg 3, (c) escape-hatch + tilbake bevarer state, (d) auto-name + manuell override.
- [ ] **K10:** Server-actions (`createGameDraft`, `createAndPublishGame`) mottar identisk FormData som før — bekreftes med en wizard-test som spioner på action-kall og asserterer FormData-keys + verdier matcher dagens GameForm-payload for samme input.
- [ ] **K11:** Verifisert i Safari på iPhone (per `verify`-skill): hurtig-flyt for best ball netto fungerer fra `/admin/games/new` til publisert spill uten å åpne «Tilpass detaljer». Datetime-picker, native dropdowns, tap-targets ≥44px.
- [ ] **K12:** Version bumpet `1.17.0` → `1.18.0`. CHANGELOG-oppføring lagt til med stakeholder-tagline («Som admin setter du nå opp et spill i fire korte steg, ikke seks seksjoner på én lang side.»), serie-summary «Hurtig-oppsett for nye spill. Fire steg i stedet for én lang side med seks seksjoner.», og forrige minor-serie (1.17.y) wrappet i `<details>` per CHANGELOG-disiplinen.

## Gates

```bash
npm run lint
npm test
npm run build
```

Scoped under utvikling: `npm test -- app/admin/games/new app/opprett-spill lib/games/autoGameName`. Full suite før evaluator. Manuelle gates etter K11: åpne `https://tornygolf.no/admin/games/new` på iPhone Safari, kjør gjennom hurtig-flyt for best ball netto, verifiser publish.

Frontend-endring → Playwright ikke i bruk i dette repoet, men `verify`-skillet brukes via prod-test etter deploy.

## Files likely touched

| Fil | Status | Hva |
|---|---|---|
| `app/admin/games/new/useGameFormState.ts` | NY | State-hook ekstrahert fra GameForm (useState + memos + handlers) |
| `app/admin/games/new/sections/BasicsSection.tsx` | NY | Spillnavn (kun GameForm-mode), bane, tee-boks, tee-off |
| `app/admin/games/new/sections/PlayersSection.tsx` | NY | Søk, chips, filtrert liste, mode-aware counter |
| `app/admin/games/new/sections/TeamsAssignmentSection.tsx` | NY | Best-ball-grid / par-stableford-grid / Texas-grid / matchplay-sider / flights / per-spiller-tee |
| `app/admin/games/new/sections/AdvancedSettingsSection.tsx` | NY | Score visibility, side tournament + categories, peer approval, HCP allowance |
| `app/admin/games/new/sections/ReadyStep.tsx` | NY | Steg 4 summary, advanced-toggle, publish/draft-knapper, escape-hatch-lenke |
| `app/admin/games/new/GameWizard.tsx` | NY | Orkestrator: stepper-header, steg-routing, URL-state, view-toggle |
| `app/admin/games/new/GameWizard.test.tsx` | NY | Wizard happy-paths, escape-hatch, auto-name, FormData-shape-test |
| `lib/games/autoGameName.ts` | NY | Pure helper for auto-navn-suggest |
| `lib/games/autoGameName.test.ts` | NY | Unit-tester for autoGameName |
| `app/admin/games/new/GameForm.tsx` | ENDRET | Refaktoreres til presentasjons-komponent som stacker sub-seksjoner; konsumerer `useGameFormState`. Beholder samme props og samme rendering-shape for edit-flyten. |
| `app/admin/games/new/GameForm.test.tsx` | ENDRET (sannsynligvis) | Hvis testene refererer til intern struktur (sjelden), oppdateres selectorene. Behavior-tester forblir uendret. |
| `app/admin/games/new/page.tsx` | ENDRET | Renderer `<GameWizard>` istedenfor `<GameForm>` |
| `app/opprett-spill/page.tsx` | ENDRET | Renderer `<GameWizard>` istedenfor `<GameForm>` |
| `package.json` | ENDRET | `1.17.0` → `1.18.0` |
| `CHANGELOG.md` | ENDRET | Ny `## 1.18.y` minor-serie-heading med stakeholder-summary. Pakk 1.17.y inn i `<details>`. |

## Out of scope

- **Edit-flyt-redesign**: `/admin/games/[id]/edit` beholder GameForm uendret.
- **Lagrede egne templates**: «Mine tirsdager»-funksjonen fra issue §4 utsettes. Krever ny tabell `game_templates` + admin-UI for å lagre/slette. Hvis adopsjon viser at det er ønsket, opprettes egen issue.
- **Use-case-baserte maler** («Kompis-runde», «Klubb-kveld», etc.): vurdert og avvist for MVP. Holder oss til 5 game_modes 1:1.
- **Auto-generert spillnavn på server-side**: serveren krever fortsatt `name`-felt i FormData (eksisterende `createGameDraft`-validering). Auto-navn lever klient-side i wizard og persisteres som vanlig string.
- **Selv-påmelding** ([#199](https://github.com/jdlarssen/golf-app/issues/199)): independent epic. Wizard-en endrer ikke registration-flow.
- **Måling av tid/scroll-events**: issue § «Måles på» nevner self-tracking. Ikke automatisert i denne MVP-en; måles ved Jørgens egen QA + pilot-admin-feedback etter shipping.
- **Visual redesign av sub-komponentene** (ModeSelector, TeamSizeSelector, SideCategoriesPicker, Card, Input, Button): gjenbrukes uendret. Hvis stepper-header-stil avslører behov for ny UI-primitiv (f.eks. `<Stepper>`-komponent), opprettes egen issue.
- **Onboarding-tour eller tooltip-system**: ikke i scope. Wizard-en er sin egen onboarding.
- **Mobile-app-spesifikk gesture-navigation** (swipe mellom steg): ikke i scope. «Forrige»/«Neste»-knapper er primær.

## Deferred ideas (oppdaget under spec-discussion)

- Lagre egne templates («Mine tirsdager») — vurder hvis 2+ pilot-admins ber om det.
- Mer aggressiv default-strategi per modus (f.eks. auto-trekk lag for best ball når 8 spillere er valgt, uten klikk). Vurder etter første tilbakemelding.
- Velkomst-state i wizard når admin har null spillere registrert — link direkte til `/admin/spillere` istedenfor å vise tom liste.

