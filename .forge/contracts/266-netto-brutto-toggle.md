# Spec: Netto/brutto-toggle på tvers av alle wizards (#266)

## Problem

Wizard-en for å opprette/redigere et spill viser i dag en allowance-input
(`HCP-allowance %`, 0–100) som standard for alle modi unntatt texas_scramble.
Det finnes ingen mekanisme for å spille **brutto** (uten handicap-justering) —
brukeren må eksplisitt skrive `0` i tallfeltet for å oppnå det, og UI-en gir
ingen indikasjon på at det er en gyldig modus.

#217 (fourball matchplay) etablerte et netto/brutto-toggle-mønster
(`components/cup/FourballAllowanceField.tsx`) som løste dette pent for
fourball: én DB-kolonne lagrer enten 0 (brutto) eller 1..100 (netto med den
prosenten), og UI-en renderes som radio-toggle med betinget tall-input. Issue
#266 rullet ut det samme mønsteret konsistent på tvers av alle modi.

Samtidig avdekker rolloutet en mode-navn-konflikt: `best_ball_netto` og
`solo_strokeplay_netto` har «netto» i selve mode-keyen, noe som blir
inkonsistent når en toggle nå lar dem være enten netto eller brutto.

## Research Findings

- **#217-mønsteret (etablert)** — `FourballAllowanceField` er kontrollert/
  ukontrollert hybrid: når `value`+`onChange` settes, lever state i parent
  (`useGameFormState`-pathen i wizarden), ellers internt (cup-create-form-
  pathen). `lastNettoPct` huskes separat fra `pct` så brutto→netto-bytte
  gjenoppretter forrige verdi. `hideHiddenInput` lar wizarden rendre en
  sentral hidden input i `FormDataInputs`. Dette mønsteret skal gjenbrukes 1:1.
- **`applyAllowance(courseHandicap, percent)`** i `lib/scoring/courseHandicap.ts`
  returnerer `0` når `percent=0` — alle scoring-modi behandler dermed
  `hcp_allowance_pct=0` som «gross only» uten ytterligere endringer.
- **Texas scramble** bruker `mode_config.team_handicap_pct` (JSONB), ikke
  `games.hcp_allowance_pct`. Scoring (`lib/scoring/modes/texasScramble.ts:52-56`)
  leser `mode_config.team_handicap_pct` direkte. Toggle på texas må derfor
  skrive til samme felt, og scoring trenger ingen endring (allerede null-safe).
- **Mode-rename blast radius** (fra scout):
  - `supabase/migrations/0033_texas_scramble.sql:11-22` — check constraint
    på `games_mode_check`
  - `lib/scoring/modes/types.ts:5-10` — `GameMode` union
  - `lib/scoring/modes/types.ts:18-24` — `MODE_LABELS`
  - `lib/scoring/index.ts` — mode-router dispatch
  - `lib/games/registration.ts` — `gameModeSupportsTeams()`
  - `app/admin/games/new/useGameFormState.ts` — mode-handling (linjer 67-75,
    215, 253-285)
  - `app/admin/games/new/ModeSelector.tsx:201-233` — tile-definisjoner
  - Leaderboard-views: `app/games/[id]/leaderboard/page.tsx`,
    `SoloStrokeplayView.tsx`, `SoloStrokeplayPodium.tsx`
  - Pluss test-fixturer (snapshot-tester på leaderboard, payload-validators)

## Prior Decisions

- **[[47-phase-2-fourball-anchor]] og #217:** netto/brutto-toggle-mønster
  etablert som radio-toggle + betinget tall-input, default 85% for fourball
  (WHS), én DB-kolonne med `0=brutto` semantikk. Carry forward 1:1.
- **[[263-resend-contract-konsolidering]]:** Bevart Type B-disiplin
  (approval-snapshot per template, structural-tests i delt fil). Ingen
  direkte konflikt med dette arbeidet, men hvis vi rører mail-templates som
  refererer game-mode-navn (f.eks. `gameFinishedNotification`), skal samme
  snapshot-disiplin følges.

## Design

### Komponent: `components/admin/AllowanceField.tsx`

Generaliser `components/cup/FourballAllowanceField.tsx` til en
mode-uavhengig `AllowanceField`. Filen flyttes til `components/admin/` (siden
den nå brukes på tvers av admin-flater, ikke kun cup). Prop-shape:

```ts
type Props = {
  /** Form field name for hidden input (e.g. `hcp_allowance_pct`,
      `fourball_allowance_pct`, `texas_team_handicap_pct`). */
  fieldName: string;
  /** Default netto-prosent. 85 for fourball, 100 for de fleste, 25/10 for
      texas avhengig av lag-størrelse. */
  defaultPct: number;
  /** Header inne i fieldset. F.eks. «Scoring», «Lag-handicap». */
  legend: string;
  /** Beskrivende paragraf under legend. */
  description?: string;
  /** Tekst under tall-input når netto er valgt. */
  nettoHelperText?: string;
  /** Tekst som vises når brutto er valgt. */
  bruttoHelperText: string;
  /** Label på selve tall-feltet. Default «Allowance (%)». */
  inputLabel?: string;

  /** Controlled-modus (wizard-pathen). */
  value?: number;
  onChange?: (pct: number) => void;
  /** Ukontrollert init-verdi. Default = `defaultPct`. */
  initialPct?: number;
  /** Skjul intern hidden input når parent renderer egen. */
  hideHiddenInput?: boolean;
};
```

Behold all eksisterende logikk fra `FourballAllowanceField`:
`lastNettoPct`-memo, controlled/uncontrolled hybrid, radio-styling.
`FourballAllowanceField` slettes — alle call-sites migrert til
`AllowanceField`.

### Mode-rename: `_netto`-suffix dropped

To modi får renamed mode-keys:

| Gammel | Ny |
|--------|-----|
| `best_ball_netto` | `best_ball` |
| `solo_strokeplay_netto` | `solo_strokeplay` |

**DB-migrasjon (`supabase/migrations/0046_drop_netto_suffix.sql`):**

```sql
-- Drop check constraint, update rows, recreate constraint with new values.
alter table public.games drop constraint games_mode_check;

update public.games set game_mode = 'best_ball' where game_mode = 'best_ball_netto';
update public.games set game_mode = 'solo_strokeplay' where game_mode = 'solo_strokeplay_netto';

alter table public.games add constraint games_mode_check check (
  game_mode in (
    'best_ball',
    'stableford',
    'singles_matchplay',
    'solo_strokeplay',
    'texas_scramble',
    'fourball_matchplay'
  )
);
```

Migrasjonen kjøres via Supabase MCP. Vercel-deploy etterpå — vinduet mellom
migrasjon og deploy er sekunder, og Jørgen er eneste admin (skriver), så
atomic rename er trygt nok.

**Kode:** Alle string-literal-callsites oppdatert i samme PR.
`MODE_LABELS`-tekster (norsk UI) endres ved behov — `Slagspill netto` blir
typisk `Slagspill solo` (mer presis), `Best ball netto` blir `Best ball`.
Brutto-varianter får ikke egen tekst; toggle-en er det som differensierer.

### Plassering: Section 3 (Format) for alle modi

`<AllowanceField>` rendres rett etter `<ModeSelector>` + `<TeamSizeSelector>`
i Section 3 (Format) — slik fourball gjør i dag. Per mode:

| Mode | fieldName | defaultPct | legend |
|------|-----------|-----------|--------|
| `best_ball` | `hcp_allowance_pct` | 100 | Scoring |
| `stableford` | `hcp_allowance_pct` | 100 | Scoring |
| `singles_matchplay` | `hcp_allowance_pct` | 100 | Scoring |
| `solo_strokeplay` | `hcp_allowance_pct` | 100 | Scoring |
| `fourball_matchplay` | `fourball_allowance_pct` | 85 | Scoring for fourball-matches |
| `texas_scramble` | `texas_team_handicap_pct` | 25 (2-mann) / 10 (4-mann) | Lag-handicap |

Section 6 (Innstillinger) renses for allowance-input — kun peer-approval +
sideturnering/visibility blir igjen. `AdvancedSettingsSection.tsx` mister
hele allowance-blokken (linjer 62-103). Hidden input for
`hcp_allowance_pct`/`texas_team_handicap_pct` flyttes til Section 3 via
toggle-komponenten.

### Texas-spesifikt

Texas-toggle skriver til `mode_config.team_handicap_pct` (samme felt som i
dag). Brutto = `team_handicap_pct=0`. Default 25 for 2-mann, 10 for 4-mann —
men toggle byttet til 4-mann mens admin er på 2-mann skal beholde
brukerens custom verdi (samme `lastNettoPct`-mekanisme). Hvis admin bytter
team-size, defaulter `lastNettoPct` til ny standard kun hvis toggle ikke har
vært rørt — ellers behold brukerens verdi.

Texas trenger fortsatt hidden `hcp_allowance_pct=100` (DB NOT NULL,
no-op-verdi), som i dag. Dette flytter ikke; det blir et internt
implementasjonsdetalj i wizard-shellen.

### Edit-flyten

`app/admin/games/[id]/edit/page.tsx` bruker samme `GameForm` som new — toggle
pre-fylles fra `game.hcp_allowance_pct` (eller mode-spesifikk equivalent).
Verdi `0` → toggle viser brutto valgt; verdi `>0` → toggle viser netto med
den prosenten. Ingen ytterligere endring trengs på edit-pathen.

## Edge Cases & Guardrails

- **Eksisterende rader med `hcp_allowance_pct=0`** finnes potensielt (check
  constraint tillater det). Etter rollout: edit-skjermen viser brutto valgt;
  ingen data-migrasjon nødvendig utover mode-rename.
- **Toggle-state ved mode-bytte i wizarden:** Hvis admin bytter mode (f.eks.
  `best_ball` → `stableford`), beholder vi `hcpAllowance`-verdien i
  `useGameFormState`. Bytte til/fra `fourball_matchplay` eller
  `texas_scramble` involverer forskjellige felt-navn — verdier holdes
  separat per felt-type i state.
- **Server-action validators:** `lib/games/gamePayload.ts` må ta inn 0 som
  gyldig for alle modi (er allerede slik for fourball). Spot-sjekk
  `validateBestBall`, `validateStableford`, etc. på range 0..100.
- **Scoring-engines:** Verifiser at `applyAllowance(hcp, 0) = 0` propagerer
  korrekt gjennom alle modi-engines (best_ball, stableford, matchplay,
  strokeplay). Brutto-output skal være gross-baseret leaderboard.
- **Sideturnering med brutto:** Sideturnering bruker netto-tall for «best
  netto 18 / front 9 / back 9»-kategoriene. Med brutto game blir disse
  kategoriene meningsløse. Beslutning: la sideturnering fungere som i dag
  (computer fra netto-tall som vil være lik gross når allowance=0) — ingen
  spesialcase. Hole-wins, LD, CTP er allerede gross/independent. Verifiseres
  med eksisterende `lib/scoring/sideTournament.ts`-tester.
- **MODE_LABELS-rename:** Tekster vist til bruker endres. Eksisterende
  snapshot-tester på leaderboard/podium kan bryte — oppdater snapshots med
  `vitest -u` etter visuell review.
- **Cup-flyt:** `tournaments.fourball_allowance_pct` er DB-kolonne for
  cup-default for fourball-matches. Den endres ikke i denne PR-en.
  `AllowanceField` brukes både i cup-create-form (uncontrolled) og
  game-wizard (controlled) — som i dag.

## Key Decisions

- **Mode-rename i samme PR.** `best_ball_netto`→`best_ball`,
  `solo_strokeplay_netto`→`solo_strokeplay`. Migrasjon + alle callsites
  oppdatert. Rasjonale: semantisk renere etter toggle, unngår at vi sitter
  med inkonsistens for alltid. Risiko: ~30+ filer berørt; mitigeres med
  systematisk grep og test-suite.
- **Texas får toggle.** Brutto-texas = `team_handicap_pct=0` (laveste
  lag-gross per hull). Konsistent UX på tvers av alle modi.
- **Generaliser FourballAllowanceField → AllowanceField.** Én komponent,
  parametrisert. `FourballAllowanceField` slettes; fourball-callers migrert.
  Filen flyttes til `components/admin/`.
- **Section 3 (Format) for alle allowance-toggles.** Konsistent med fourball
  i dag; Section 6 (Innstillinger) renses.

**Claude's Discretion:**

- Eksakt norsk wording på `legend`/`description`/`nettoHelperText`/
  `bruttoHelperText` per mode. Forholder seg til etablerte mønstre i
  app-stemmen («sporty kompis-energi», action-orientert, `humanizer`-passet
  på nye strenger).
- Om `MODE_LABELS` for renamed modes skal være «Best ball» eller «Bestball»
  (norsk konvensjon), «Slagspill solo» vs «Solo slagspill». Beslutt på
  eksisterende app-konsistens.
- Om vi splitter rename-migrasjonen til egen commit fra
  komponent/toggle-arbeidet (anbefalt for atomic commit-disiplin) — eller
  bundler. Default: split.
- Om `ModeSelector`-tiles bør oppdateres til å vise toggle-state visuelt
  (f.eks. liten badge «Netto»/«Brutto»). Default: nei, toggle-en i Section
  3 er nær nok.

## Success Criteria

- [ ] Migrasjon `0046_drop_netto_suffix.sql` applisert via Supabase MCP;
      check constraint inneholder kun nye verdier; eksisterende rader
      backfylt. Verifisert med `mcp__supabase__execute_sql 'select distinct
      game_mode from games'`.
- [ ] `grep -r 'best_ball_netto\|solo_strokeplay_netto' app lib supabase
      --include='*.ts' --include='*.tsx'` returnerer 0 treff utenfor
      historiske migrasjoner og `CHANGELOG.md`.
- [ ] `components/admin/AllowanceField.tsx` eksisterer; `FourballAllowanceField`
      slettet; alle imports oppdatert.
- [ ] Wizard `app/admin/games/new/page.tsx` rendrer `<AllowanceField>` i
      Section 3 for **alle** modi (best_ball, stableford, singles_matchplay,
      solo_strokeplay, fourball_matchplay, texas_scramble). Texas-toggle
      skriver til `texas_team_handicap_pct`, øvrige til `hcp_allowance_pct`,
      fourball til `fourball_allowance_pct`.
- [ ] `AdvancedSettingsSection.tsx` har ingen allowance-input lenger;
      `texas_team_handicap_pct_input`-blokk + `hcp_allowance_pct`-input
      fjernet (linjer 62-103). Section 6 har kun peer-approval + visibility/
      sideturnering.
- [ ] Edit-flyten (`app/admin/games/[id]/edit`) viser toggle pre-fylt fra
      eksisterende `hcp_allowance_pct`/`texas_team_handicap_pct`. Verifisert
      manuelt eller med Playwright på minst én mode.
- [ ] `npm test` grønt. Inkluderer nye toggle-tester for hver mode-variant
      (renderer brutto når init=0, renderer netto med riktig pct,
      lastNettoPct-memo virker).
- [ ] `npm run typecheck` grønt.
- [ ] `package.json` bumped (minor: `1.39.0`) + `CHANGELOG.md`-oppføring
      lagt til i samme commit som feature-ship. Tagline-en på norsk,
      humanizer-passert.

## Gates

- [ ] `npm run typecheck` etter hver chunk
- [ ] `npm test -- <scope>` etter hver chunk (scope til relevante modul-tester)
- [ ] `npm test` full suite før evaluator spawn
- [ ] `npm run lint` grønn før evaluator spawn
- [ ] Playwright: smoke-test wizard-flyten på minst 2 modi (best_ball,
      texas_scramble) — viser toggle, kan velge brutto, submit lykkes,
      payload har `hcp_allowance_pct=0`. Kun ved frontend-files-touched
      (som her).
- [ ] Visual spot-check (skjermbilde / preview-deploy) av Section 3 i
      wizarden for to-tre modi. Brukeren har preview-Vercel for branch-en.

## Files Likely Touched

- `supabase/migrations/0046_drop_netto_suffix.sql` — NY, rename-migrasjon
- `lib/scoring/modes/types.ts` — `GameMode` union, `MODE_LABELS`
- `lib/scoring/index.ts` — router dispatch (string keys)
- `lib/games/gamePayload.ts` — validators (mode-keys + range-check spot-check)
- `lib/games/registration.ts` — `gameModeSupportsTeams()` dispatch
- `app/admin/games/new/useGameFormState.ts` — mode-handling, defaults,
  `hcpAllowance`-state-shape (pluss fourball + texas)
- `app/admin/games/new/ModeSelector.tsx` — tile-definisjoner (string keys)
- `app/admin/games/new/GameForm.tsx` — Section 3-rendering av AllowanceField,
  fjerne fourball-spesifikk wrapper
- `app/admin/games/new/GameWizard.tsx` — samme som GameForm for wizard-pathen
- `app/admin/games/new/sections/AdvancedSettingsSection.tsx` — strip ut
  allowance-blokk (62-103)
- `app/admin/games/new/sections/FormDataInputs.tsx` (om relevant) —
  sentralisert hidden input for wizard-pathen
- `app/admin/games/[id]/edit/page.tsx` — pre-fill-logikk for toggle
- `components/admin/AllowanceField.tsx` — NY, generalisert komponent
- `components/cup/FourballAllowanceField.tsx` — SLETT, callers migrert
- `app/admin/cup/new/page.tsx` — bytt import til AllowanceField
- Leaderboard- og podium-views: `app/games/[id]/leaderboard/page.tsx`,
  `SoloStrokeplayView.tsx`, `SoloStrokeplayPodium.tsx` (string-keys)
- Mail-templates: `lib/mail/gameFinishedNotification.ts` (om mode-keys
  refereres for tekst-variasjon; sjekk under build)
- Snapshot-fixturer som inneholder gamle mode-navn (vitest -u)
- Tests: nye AllowanceField-tester, oppdaterte mode-key-tester på tvers
- `package.json` + `CHANGELOG.md`

## Out of Scope

- Endring av scoring-logikk (alle modi støtter allerede `applyAllowance`
  via eksisterende kode).
- Egen «scratch»-mode-key som erstatter mode-konseptet — toggle dekker det.
- Mode-rename utover de to `_netto`-suffiksene (f.eks. rename
  `singles_matchplay` til kortere variant — separat issue ved behov).
- Endringer på cup-flyt-tabeller (`tournaments.fourball_allowance_pct`) —
  bevares som i dag.
- Toggle-state synlig i `ModeSelector`-tiles (badge, etc.) — utenfor scope.
- E2E-test på alle 6 modi — Playwright-smoke på 2 er nok per gates.
