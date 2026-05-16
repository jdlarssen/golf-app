# Sideturnering — utvidet poengsystem (design)

**Status:** godkjent 2026-05-16
**Ship-mål:** MINOR-bump `v1.1.x` → `v1.2.0` — første nye feature siden v1.1-serien
**Subagent-modell:** Opus for alle implementer/reviewer-subagenter (per memory `feedback_subagent_model_routing`)

## Bakgrunn

Etter v1.1.x-leveransen testet brukeren sideturneringen i prod og rapporterte: «for lite poeng å spille om». Dagens 6 kategorier topper på ~64p og kjennes flatt — best-ball-netto har for få sideveis konkurranser å skille seg ut i.

Denne leveransen utvider sideturneringen med:

1. **3 nye achievements** — stackbare bonuser med terskler (Turkey, Solid, Snowman)
2. **10 nye vinner-tar-alt-kategorier** — auto-beregnet fra eksisterende score-data, med både lag-aggregat- og individ-best-versjoner der det gir mening
3. **Tier-vekting** — best netto totalt 18 forblir grunnpilaren på 10p, nye kategorier ligger lavere (4p/2p eller 2p/1p)
4. **Per-kategori-toggle** ved spill-opprett med tre presets (Klassisk / Full pakke / Custom)
5. **Team-size-aware regler** — designet for 1v1, 2v2 og 4v4 (implementasjon ship-er med dagens 2v2-flyt; nye modus lyser opp når [#41](https://github.com/jdlarssen/golf-app/issues/41) lander)

**Manuelle bragder** (chip-ins, sand saves, one-putts, wow-shot) er **ute av scope** — egen leveranse senere (v1.3.x) som krever ny per-hull-UI.

## Kategori-katalog med tier-vekting

### Tier 1 — Hovedkonkurranser (eksisterende, uendret)

| Kategori | Poeng |
|---|---|
| Best netto totalt 18 ← **grunnpilaren** | **10p** |
| Best netto front 9 | 5p |
| Best netto back 9 | 5p |

### Tier 2 — Skill og rarity

| Kategori | Lag-versjon | Individ-versjon |
|---|---|---|
| Best brutto totalt 18 | 4p | 2p |
| Konge på par-3 (best ball sum på alle par-3) | 4p | 2p |
| Konge på par-5 | 4p | 2p |
| Flest eagles eller bedre | 4p | 2p |
| Lengste bogey-fri-streak (netto ≤ par sammenhengende) | — | 4p |

### Tier 3 — Moderate (volum + skill)

| Kategori | Lag-versjon | Individ-versjon |
|---|---|---|
| Best brutto front 9 | 2p | 1p |
| Best brutto back 9 | 2p | 1p |
| Flest birdier (netto) | 2p | 1p |
| Flest pars eller bedre (netto) | 2p | 1p |
| Lavest enkelthull brutto | — | 2p |

### Hull-konkurranser (eksisterende, uendret)

| Kategori | Poeng |
|---|---|
| Hole-win (alene-vinner per hull) | 2p × inntil 18 hull |
| Longest drive (admin-valgt) | 2p × 0–2 vinnere |
| Closest to pin (admin-valgt) | 2p × 0–2 vinnere |

### Achievements — stackbare bonuser

| Achievement | Trigger | Poeng |
|---|---|---|
| **Turkey** (per spiller) | 3 netto-birdier på rad, ikke-overlappende stack | +4p per streak |
| **Turkey** (lag-koord-bonus) | Alle spillere på laget (N ≥ 2) får netto-birdie på *samme* 3 hull | +4p × N (i tillegg til per-spiller) |
| **Solid** (per spiller) | 5 netto-pars-eller-bedre på rad, ikke-overlappende stack | +2p per streak |
| **Solid** (lag-koord-bonus) | Alle spillere på laget (N ≥ 2) får netto ≤ par på *samme* 5 hull | +2p × N |
| **Snowman** | Alle spillere på laget får brutto ≥ par+5 (mer enn quad-bogey) på *samme* hull | −2p |

**Tie-regler** for vinner-tar-alt-kategorier: alle som er likt får full pott (matcher eksisterende mønster fra netto-kategoriene). Ingen splitt.

**1-spillerlag (1v1-modus):** lag-versjon og individ-versjon kollapser til samme tall. Vi kjører kun individ-versjonen for å unngå dobbel-telling. For Turkey/Solid: kun per-spiller-tieren utløses (lag-koord-tieren krever N ≥ 2).

## Per-kategori-toggle ved spill-opprett

### UI

I `app/admin/games/new/GameForm.tsx` (og `edit/`) får sideturnerings-seksjonen et nytt layout under master-toggle-en:

```
☑ Sideturnering aktiv

Preset:  ( Klassisk )  ( Full pakke )  ( Custom )

Hovedkonkurranser
  ☑ Best netto totalt 18                10p
  ☑ Best netto front 9 / back 9         5p hver

Skill og rarity
  ☑ Best brutto totalt 18               4p / 2p
  ☑ Konge på par-3                      4p / 2p
  ☑ Konge på par-5                      4p / 2p
  ☑ Flest eagles eller bedre            4p / 2p
  ☑ Lengste bogey-fri-streak            4p (individ)

Moderate
  ☑ Best brutto front 9 / back 9        2p / 1p hver
  ☑ Flest birdier                       2p / 1p
  ☑ Flest pars eller bedre              2p / 1p
  ☑ Lavest enkelthull brutto            2p (individ)

Hull-konkurranser
  ☑ Hole-win (alene-vinner per hull)    2p per hull
  Antall longest drive:  ( 0 ) ( 1 ) ( 2 )
  Antall closest to pin: ( 0 ) ( 1 ) ( 2 )

Achievements (kan stables)
  ☑ Turkey
  ☑ Solid
  ☑ Snowman
```

### Presets

- **Klassisk** — kun de eksisterende 6 kategoriene (best netto 18/F9/B9, hole-win, LD, CTP). Matcher dagens v1.1.x-oppførsel. **Default ved spill-opprett.**
- **Full pakke** — alle 18 kategorier + alle 3 achievements aktive.
- **Custom** — admin styrer hver kategori enkeltvis. Aktiveres når admin manuelt slår av/på noe etter å ha valgt en av de andre presetene.

### Låsing

Som i v1.1.x: kategori-velgerne kan endres mens `games.status = 'pending'`, men låses så snart spillet flippes til `active`.

## Datamodell

### Endringer i `games`-tabellen

Vi trenger å lagre hvilke kategorier som er aktive per spill. Tre arkitektoniske valg:

- **A) En boolean-kolonne per kategori** (`side_birdies_team_enabled`, …) — 18+ kolonner. Trygg, type-sikker, men spamfullt.
- **B) JSON-kolonne** med toggle-state. Fleksibel, men ingen DB-håndhevelse på enum-verdiene.
- **C) Lagre kun avvik fra default** — `side_disabled_categories text[] default '{}'`. Tomt = alt aktivt (Full pakke). Liste over kategori-id-er som er av.

**Valgt:** **C**. Begrunnelse: 90 % av spill kommer trolig til å bruke ett av presetene, ikke et custom-utvalg. Å lagre kun avvik holder rad-størrelsen kompakt og gjør «Full pakke»-default trivielt (default `'{}'`). Hvis brukerens default settes til «Klassisk», lagrer admin-flyten alle nye kategori-id-er som disabled — en liste på 12 elementer, fortsatt under PostgreSQL text[]-grensa med mange tier av margin.

**Migrasjon `0026_side_tournament_categories.sql`:**

```sql
alter table public.games
  add column side_disabled_categories text[] not null default '{}',
  add constraint games_side_disabled_categories_valid check (
    side_disabled_categories <@ array[
      'best_netto_18', 'best_netto_f9', 'best_netto_b9',
      'best_brutto_18_team', 'best_brutto_18_individual',
      'best_brutto_f9_team', 'best_brutto_f9_individual',
      'best_brutto_b9_team', 'best_brutto_b9_individual',
      'most_birdies_team', 'most_birdies_individual',
      'most_eagles_team', 'most_eagles_individual',
      'most_pars_team', 'most_pars_individual',
      'king_par3_team', 'king_par3_individual',
      'king_par5_team', 'king_par5_individual',
      'longest_bogey_free_streak',
      'lowest_single_hole_brutto',
      'hole_win',
      'turkey', 'solid', 'snowman'
    ]
  );
```

«Sideturnering aktiv = false» bruker eksisterende `side_tournament_enabled = false`-felt (uendret). Den nye kolonnen er kun relevant når sideturneringen er aktiv.

## Scoring-logikk

### Konfig-fil for poeng

Alle vekt-verdier flyttes til `lib/scoring/sideTournamentConfig.ts` slik at justering senere er ett-fil-endring uten å røre logikken. Eksempel-shape:

```ts
export const SIDE_TOURNAMENT_POINTS = {
  bestNetto18: 10,
  bestNettoF9: 5,
  bestNettoB9: 5,

  bestBrutto18Team: 4,
  bestBrutto18Individual: 2,
  // … etc

  turkeyPerPlayer: 4,
  turkeyCoordPerMember: 4,
  solidPerPlayer: 2,
  solidCoordPerMember: 2,
  snowman: -2,
} as const;
```

### Utvidet `SideTournamentInput`

```ts
interface SideTournamentInput {
  config: SideTournamentConfig;            // utvides med disabledCategories
  teams: Array<{ teamId: TeamId; userIds: UserId[] }>;
  coursePars: number[];                    // NY — 18 par-verdier
  playerScoresPerHole: Array<{             // NY — per spiller
    userId: UserId;
    perHoleGross: Array<number | null>;
    perHoleNetto: Array<number | null>;
  }>;
  nettoBestBallPerHole: Array<{            // beholdes
    teamId: TeamId;
    perHoleNetto: Array<number | null>;
  }>;
  sideWinners: SideWinner[];
}
```

### Algoritme — high-level per kategori

For hver nye kategori:

1. Hopp over hvis `category in config.disabledCategories`
2. Beregn lag-aggregat (sum / count over team-medlemmer per hull) eller individ-best (max/min over alle spillere)
3. Finn vinner(e) — tie gir alle full pott
4. Award via `award(teamId, ...)`-helperen som finnes i dagens kode

**Achievements:**

- **Turkey:** for hver spiller, finn ikke-overlappende 3-streaks av netto-birdier (greedy fra venstre). Hver streak → 4p til spillerens lag. Etter per-spiller-pass: sjekk om alle spillere på samme lag har en streak som overlapper de samme 3 hullene — hvis ja, gi `4p × N` ekstra.
- **Solid:** samme mønster, med 5-streak av netto ≤ par.
- **Snowman:** for hvert hull, sjekk om alle spillere på laget har `gross ≥ par + 5`. Hvis ja: −2p til laget.

### Team-size-aware-disiplin

- Ingen `team.userIds.length === 2`-sjekker i logikken
- 1-spillerlag: lag-versjon hopper over (kun individ kjører)
- Turkey/Solid lag-koord: krever `N >= 2`, ellers skip

## UI — leaderboard-fanen

### Gruppering i lag-row-expand

`SideTournamentView.tsx` utvides slik at hver lag-row i ekspandert state grupperer awards under sub-headers. Rekkefølge:

1. **Hovedkonkurranser** — Tier 1
2. **Skill og rarity** — Tier 2
3. **Moderate** — Tier 3
4. **Hull-konkurranser** — hole-wins, LD, CTP
5. **Achievements** — Turkey, Solid (positive)
6. **Penalty** — Snowman (negative, egen visuell tone — rød/varsel-fargen)

**Bare grupper som har minst én award for laget vises.** Hvis Tier 2 ikke ga noe, hoppes hele blokken (header + linjer) over.

### Award-format per kategori

| Kategori | Format |
|---|---|
| `best_netto_18` | `Best netto totalt 18: 10p` + `(uavgjort med Lag X)` ved tie |
| `best_netto_f9` / `b9` | `Best netto front 9: 5p` osv. |
| `best_brutto_*_team` | `Best brutto totalt 18 (lag): 4p` |
| `best_brutto_*_individual` | `Best brutto totalt 18 (Karl): 2p` |
| `most_birdies_team` | `Flest birdier (lag): 2p` |
| `most_birdies_individual` | `Flest birdier (Karl): 1p` |
| `longest_bogey_free_streak` | `Lengste bogey-fri (Per, 7 hull): 4p` |
| `lowest_single_hole_brutto` | `Lavest enkelthull (Per, 2 på 14): 2p` |
| `hole_win` | `Hole-wins: 7 hull (10–16): 14p` — formatert med `formatHolesList` |
| `longest_drive` / `closest_to_pin` | `Longest drive #1 (Karl): 2p` per slot |
| `turkey` (per spiller) | `Turkey (Karl, hull 5–7): 4p` |
| `turkey` (lag-koord) | `Turkey lag-koord (hull 5–7): 8p` (N × 4p computed) |
| `solid` (per spiller) | `Solid (Per, hull 11–15): 2p` |
| `solid` (lag-koord) | `Solid lag-koord (hull 11–15): 4p` |
| `snowman` | `Snowman (hele laget +6 på hull 12): −2p` |

**Sortering inni hver gruppe:** høyeste poeng først; for like poeng kommer lag-versjon før individ-versjon for samme metrikk.

### Sammenklappet state (uendret)

Lag-headeren er den samme som etter v1.1.1 — medal + lagnavn + medlemsnavn + total + chevron. Kun expand-innholdet har endret seg.

### Mobile-først

Sub-headerne bruker `text-xs uppercase tracking-wide font-semibold text-muted` (matcher Tørny-typografi). Award-linjene har poeng høyrejustert med `tabular-nums`. Penalty-gruppen bruker en subtil rød tone (palette `accent-warning` eller lignende — implementer velger).

## Tester

### Unit-tester (i `lib/scoring/sideTournament.test.ts`)

Eksisterende 13 tester forblir grønne. Nye tester:

**Per ny vinner-tar-alt-kategori (10 kategorier × ~3 testes):**
- Single winner — full pott
- Tie — alle får full pott
- N=1-team-edge: kun individ-versjon kjører, ikke lag-versjon
- N=4-team: lag-aggregat fungerer (sum/max over 4 spillere)

**Achievements:**
- Turkey: 1 streak / 2 streaks (6 i rad) / overlappende kun teller 1 / partial team (3 av 4) / full team koord
- Solid: samme mønster med 5-streak
- Snowman: alle på laget over → utløst / én under → ikke utløst / multiple hull → multiple penalties

**Toggle-handling:**
- `disabledCategories: ['most_birdies_team']` → ikke i awards
- `disabledCategories: ['turkey']` → ingen Turkey-awards selv om streak fantes
- Tomt array → alt på (default)

Estimert: ~50 nye unit-tester. Skal følge TDD-disiplin per `lib/scoring/`-mønster (test først).

### Integration-tester

`app/admin/games/new/actions.ts` får ny validering av `side_disabled_categories`. Test:
- Default tomt array
- Klassisk-preset velger sender 12 disabled-IDs
- Full pakke sender tomt array
- Custom-utvalg sender riktig undermengde

### UI-tester

Per Tørny-konvensjon: ingen unit-tester på UI-komponenter — prod smoke-test (per memory `feedback_production_only_testing`).

Hvis `formatHolesList`-helperen utvides (allerede testet for collapse), ingen ny testdekning her.

## Versjonering

**Bump:** MINOR (`v1.1.x` → `v1.2.0`). Ny bruker-synlig feature shipped i sin helhet.

**CHANGELOG-tagline:** «Sideturneringen får 12 nye kategorier å spille om — fra «flest birdier» og «konge på par-3» til stackbare achievements som Turkey (3 birdier på rad) og Snowman (lagets felles katastrofe på ett hull). Du velger selv ved spill-opprett hvilke som er aktive.»

**Tema-heading i CHANGELOG:** «1.2.y — Utvidet sideturnerings-poeng»

## Out-of-scope (følger ikke v1.2.0)

- **Manuelle bragder** (chip-ins, sand saves, one-putts, wow-shot) — egen leveranse v1.3.x med per-hull-UI for registrering
- **Variabel team-size i admin-UI** — reglene er team-size-aware, men admin-flyten lager fortsatt 2v2-spill. Issue [#41](https://github.com/jdlarssen/golf-app/issues/41) dekker UI-en for å velge 1v1/2v2/4v4 ved spill-opprett
- **Per-kategori-vekt-justering i UI** — vektene bor i config-fil, justeres via kode-deploy ikke admin-skjerm. Kan komme senere hvis det blir et reelt behov
- **Statistikk-side med per-spiller sideturnerings-historikk** — ikke med
- **3v3 og større team-størrelser** enn 4v4 — design dekker 1v1, 2v2, 4v4

## Filer som påvirkes

**Nye filer:**
- `supabase/migrations/0026_side_tournament_categories.sql`
- `lib/scoring/sideTournamentConfig.ts` — poeng-vekter sentralisert
- `lib/scoring/achievements.ts` (NY hvis achievement-logikken blir for stor for `sideTournament.ts`) eller inline i sistnevnte
- `components/admin/SideCategoriesPicker.tsx` — den nye toggle-UI-en med presets

**Endrede filer:**
- `lib/scoring/sideTournament.ts` — utvides med nye kategori-blokker + Turkey/Solid/Snowman
- `lib/scoring/sideTournament.test.ts` — ~50 nye tester
- `lib/games/sideTournamentPayload.ts` — bygger `playerScoresPerHole` + `coursePars` fra DB
- `app/admin/games/new/GameForm.tsx` — inkluderer `SideCategoriesPicker`
- `app/admin/games/new/actions.ts` — validerer + persisterer `side_disabled_categories`
- `app/admin/games/[id]/edit/page.tsx` + `actions.ts` — samme
- `app/games/[id]/leaderboard/SideTournamentView.tsx` — grupperte sub-headers
- `app/games/[id]/leaderboard/page.tsx` — passer `coursePars` + `playerScoresPerHole` til view-en
- `CHANGELOG.md` — v1.2.0-entry
- `package.json` — version bump

**Eksisterende filer som ikke endres:**
- `supabase/migrations/0024_side_tournament.sql` — beholdes som-er
- LD/CTP-flyten (`/avslutt`-routen) — funker uendret
- Eksisterende achievement-mønstre i scoring — ingen
