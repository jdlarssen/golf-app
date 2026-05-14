# Sideturnering — design

**Status:** godkjent 2026-05-14
**Ship-mål:** MINOR-bump (`v1.1.0`) — ny bruker-synlig feature, første ikke-patch siden v1.0.0
**Subagent-modell:** Opus for alle implementer- og reviewer-subagenter (per memory `feedback_subagent_model_routing`).

## Bakgrunn

Et lag-spill med kun best-ball-netto-utfall er binært: ett lag vinner, resten taper. Sideturneringen legger til parallelle poeng-konkurranser oppå hovedspillet, så et lag som taper hovedturneringen fortsatt kan vinne sideturneringen — eller omvendt. Den fanger også sosiale ritualer som «longest drive» og «closest to pin» som ellers lever utenfor appen (typisk på en serviett).

Sideturneringen er **opt-in per spill** (admin haker av ved oppsett) og **skjult under runden**: kun spillets `status='finished'` åpner sideturnerings-fanen på leaderboarden. Dette beskytter mot at sideturneringen «leaker» informasjon i reveal-mode (en sideturnerings-leder kan røpe hvem som ligger an på netto).

## Regler — poengsystem

Lag samler poeng i opptil seks kategorier. Maks teoretisk total er **64 poeng** (alle moduler på).

| Kategori | Poeng | Logikk |
|---|---|---|
| Best netto 18 hull | 10 | Lavest lag-total (sum netto best-ball over alle 18 hull) |
| Best netto front 9 | 5 | Lavest lag-total, hull 1–9 |
| Best netto back 9 | 5 | Lavest lag-total, hull 10–18 |
| Hole-win | 2 × 18 = 36 max | Lag som står **alene** med lavest netto best-ball på hullet |
| Longest drive | 2 × (0–2) | Admin velger vinner per «slot» ved avslutning |
| Closest to pin | 2 × (0–2) | Admin velger vinner per «slot» ved avslutning |

**Tie-regler:**

- **Netto-kategoriene (10/5/5):** alle tie-lag får full pott — ingen splitt. Hvis to lag deler beste netto-18 → begge får 10 poeng. Begrunnelse: enkelt å forklare, og siden sideturneringen er separat fra hovedturneringens stand-alone tiebreaker (5-tiers cascade i `lib/scoring/tiebreaker.ts`), trenger den ikke sin egen tiebreaker. Total-poeng er ikke konstant — det er greit.
- **Hole-win:** krever alene-vinner. Hvis to eller flere lag har samme laveste netto best-ball på et hull, deles ingen poeng ut for det hullet. Begrunnelse (fra produkt-diskusjon): ties forventes å være vanlige på best-ball, så alene-vinneren skal være verdt mer enn delt-vinner — derav 2 poeng per hull (overordnet kategori-makspoeng på 36, største komponent i sideturneringen).
- **LD/CTP:** admin velger én vinner per «slot». «Ingen kvalifiserte» er et eksplisitt dropdown-valg (0 poeng utdelt).

**Gate-regel:** Sideturnering krever **≥2 lag**. Hvis flighten har 1 lag, vises ikke sideturnerings-toggle i spill-form.

**Reveal-regel:** Sideturnerings-resultatet er fullstendig skjult mens spillet er `active`. Sideturnerings-fanen vises ikke på leaderboarden. Først ved `status='finished'` blir fanen synlig. Dette gjelder **uavhengig** av `score_visibility`-feltet — sideturneringen har sin egen reveal-logikk som er strengere enn hovedspillets.

## Datamodell

**Migrasjon `0024_side_tournament.sql`:**

```sql
-- 1. Konfig på games-tabellen
alter table public.games
  add column side_tournament_enabled boolean not null default false,
  add column side_ld_count int not null default 0
    check (side_ld_count between 0 and 2),
  add column side_ctp_count int not null default 0
    check (side_ctp_count between 0 and 2);

-- Constraint: hvis sideturnering ikke er aktivert, må counts være 0
alter table public.games add constraint games_side_consistency check (
  side_tournament_enabled = true
  or (side_ld_count = 0 and side_ctp_count = 0)
);

-- 2. LD/CTP-vinnere
create table public.game_side_winners (
  game_id uuid not null references public.games(id) on delete cascade,
  category text not null check (category in ('longest_drive', 'closest_to_pin')),
  position int not null check (position between 1 and 2),
  winner_user_id uuid references public.users(id),  -- null = "Ingen kvalifiserte"
  decided_at timestamptz not null default now(),
  primary key (game_id, category, position)
);

create index game_side_winners_game on public.game_side_winners(game_id);

-- 3. RLS — match samme-flight + finished-pattern fra scores
alter table public.game_side_winners enable row level security;

-- Select: medlem av spillet kan se sideturnerings-vinnere, men kun når spillet er ferdig
create policy game_side_winners_select on public.game_side_winners
  for select using (
    exists (
      select 1
      from public.games g
      join public.game_players gp on gp.game_id = g.id
      where g.id = game_side_winners.game_id
        and g.status = 'finished'
        and gp.user_id = auth.uid()
    )
  );

-- Insert/update/delete: kun admin (samme mønster som andre admin-tabeller)
create policy game_side_winners_admin_all on public.game_side_winners
  for all using (
    exists (
      select 1 from public.users
      where id = auth.uid() and is_admin = true
    )
  ) with check (
    exists (
      select 1 from public.users
      where id = auth.uid() and is_admin = true
    )
  );
```

**Hvorfor egen tabell og ikke JSON-blob på `games`:** scoring-koden trenger å slå opp vinnere per spill — en relasjonell tabell gir trivielle SELECT-spørringer og naturlig RLS-håndheving. JSON ville krevd parse-logikk på klient og var-typer i scoring-biblioteket.

**Hvorfor `position int (1–2)` istedenfor `hole_number`:** Produktbeslutningen var at admin kun fyller inn antall LD/CTP-vinnere, ikke hvilket hull. Vi trenger likevel å skille rad #1 og rad #2 for å støtte to vinnere i samme kategori (kan være ulike spillere).

**Rader opprettes:** ved `endGame`-action (ikke ved game-create). Da har vi admin's vinner-valg klart og slipper «null-tilstand» mens spillet er aktivt.

## Scoring-bibliotek

**Ny fil:** `lib/scoring/sideTournament.ts`

**Disiplin:** TDD-strikt (matcher resten av `lib/scoring/`). Test først, implementer etterpå.

**Public API:**

```ts
import type { TeamId, UserId } from './bestBall';

export type SideCategory =
  | 'best_netto_18'
  | 'best_netto_front9'
  | 'best_netto_back9'
  | 'hole_win'  // aggregat: ett "treff" per hull alene-vinner
  | 'longest_drive'
  | 'closest_to_pin';

export interface SideTournamentConfig {
  enabled: boolean;
  ldCount: 0 | 1 | 2;
  ctpCount: 0 | 1 | 2;
}

export interface SideWinner {
  category: 'longest_drive' | 'closest_to_pin';
  position: 1 | 2;
  winnerUserId: UserId | null;  // null = ingen kvalifiserte
}

export interface SideTournamentInput {
  config: SideTournamentConfig;
  teams: Array<{ teamId: TeamId; userIds: UserId[] }>;
  nettoBestBallPerHole: Array<{
    teamId: TeamId;
    perHoleNetto: Array<number | null>;  // 18 elementer; null = ikke spilt
  }>;
  sideWinners: SideWinner[];
}

export interface SideCategoryAward {
  category: SideCategory;
  teamId: TeamId;
  points: number;
  detail?: string;  // f.eks. "alene på hull 4" — for visning
}

export interface SideTournamentResult {
  teamStandings: Array<{
    teamId: TeamId;
    totalPoints: number;
    awards: SideCategoryAward[];
  }>;
  uncontestedCategories: SideCategory[];  // hvis < alle hull har scores
}

export function calculateSideTournament(
  input: SideTournamentInput
): SideTournamentResult;
```

**Test-cases (TDD):**

1. Best netto 18 — single winner, alle 18 hull spilt
2. Best netto 18 — tie mellom 2 lag → begge får 10
3. Best netto F9 + B9 — ulike vinnere
4. Hole-win — single alene-vinner gir 2p
5. Hole-win — tie mellom 2 lag → 0p på det hullet
6. Hole-win — 3-veis-tie → 0p
7. LD — 1 slot, vinner satt → 2p
8. LD — 2 slots, samme spiller begge → 4p til samme lag
9. LD — slot med null winner_user_id → 0p
10. CTP — speilbilde av LD
11. Integrasjon: alle moduler på, ulike vinnere → totalsum stemmer
12. Edge: 2-lags-spill med begge på 0 poeng i alle kategorier (umulig hvis runden er ferdig, men test at funksjonen ikke krasjer)
13. Edge: 4-lags-spill (max teams)

## UI — Admin: spill-opprett

**`app/admin/games/new/GameForm.tsx`** får en ny seksjon **«Sideturnering»** under eksisterende seksjoner.

**Layout:**

- **Master-checkbox:** «Legg til sideturnering» — på/av-toggle
- Hvis på, expander seksjonen og viser:
  - **Forklaring** (2–3 linjer): «Sideturneringen er en parallell lag-konkurranse med poeng. Best netto 18: 10p, F9 + B9: 5p hver, hole-win: 2p, LD og CTP: 2p per vinner. Resultatet vises etter at spillet er avsluttet.»
  - **Longest drive** — segmented control med valg `0` / `1` / `2` («Antall longest-drive-vinnere»)
  - **Closest to pin** — segmented control med valg `0` / `1` / `2` («Antall closest-to-pin-vinnere»)

**Gate:** Seksjonen skjules helt hvis flight-konfigurasjonen har bare 1 lag.

**Server-action validering** (`actions.ts`):
- `side_ld_count` og `side_ctp_count` må være `0–2`
- Hvis `side_tournament_enabled = false`, force `ld_count` og `ctp_count` til `0`
- DB-constraint `games_side_consistency` håndhever det samme

**Edit-flow** (`app/admin/games/[id]/edit/page.tsx`):
- Samme seksjon
- Felter låses når `status in ('active', 'finished')` (matcher mønster fra `score_visibility`)

## UI — Admin: avslutt spill (LD/CTP-wizard)

Dagens `EndGameButton.tsx` kaller `endGame`-server-action direkte. For sideturnering med LD/CTP må admin fylle inn vinnere før spillet låses.

**Beslutning:** dedikert route, ikke modal. Begrunnelse: matcher memory `feedback_destructive_actions_dedicated_page` — kritiske admin-flyter får egen side, ikke `<details>`-popouter. Avslutning er ikke destruktivt, men har samme «point of no return»-karakter.

**Ny route:** `app/admin/games/[id]/avslutt/`

- Hvis `side_tournament_enabled = false` OG `side_ld_count = 0` OG `side_ctp_count = 0` → eksisterende `endGame`-flyt (direkte fra knappen på `/admin/games/[id]`). Ingen ny route trigget.
- Ellers: `EndGameButton` redirecter til `/admin/games/[id]/avslutt`.

**Sida `/admin/games/[id]/avslutt`:**

- `PageHeader`: «Avslutt spill — sideturnering»
- Forklaring: «Velg vinnere for sideturneringen. Spillet låses når du bekrefter.»
- For hver LD-slot (1 eller 2):
  - Dropdown «Longest drive #N»: alle spillere i spillet + «Ingen kvalifiserte»
- For hver CTP-slot:
  - Dropdown «Closest to pin #N»: samme
- Submit-knapp: «Avslutt spillet og publiser sideturneringen»
- Cancel-knapp: tilbake til `/admin/games/[id]`

**Server-action `endGameWithSideWinners`** (i `actions.ts`):
1. Verifiser admin og at spillet er `active`
2. Verifiser at form-input har riktig antall vinnere (matcher `side_ld_count` og `side_ctp_count`)
3. Insert rader i `game_side_winners` (én per slot, `winner_user_id` kan være null)
4. Kall eksisterende `endGame`-logikken (status-flip + mail)
5. Hvis vinner-insert feiler etter status-flip → manuell recovery (logget; vi godtar at finished kan eksistere uten side-rader, og UI viser «Sideturnerings-data mangler» i fanen)

## UI — Leaderboard: sideturnerings-fane

**`app/games/[id]/leaderboard/page.tsx`** utvides med tabs.

**Tab-struktur** (kun synlig hvis `side_tournament_enabled = true` AND `status = 'finished'`):
- **Hovedturnering** (default) — eksisterende leaderboard
- **Sideturnering** — ny fane

Hvis sideturnering ikke er på, eller spillet ikke er finished → ingen tabs, bare hovedturneringen (dagens oppførsel).

**Sideturnerings-fane viser:**

1. **Poeng-tabell øverst** (sortert etter total-poeng, høyest først):
   ```
   1. Lag 2   38p   🥇
   2. Lag 1   18p   🥈
   3. Lag 3    8p   🥉
   ```
2. **Detalj-seksjon under** — utfoldet liste av kategorier med vinnere:
   - «Best netto 18: Lag 2 (62 slag) → 10p»
   - «Best netto front 9: Lag 1 (31 slag) → 5p»
   - «Best netto back 9: Lag 2 (29 slag) → 5p»
   - «Hole-wins:» + grid med 18 hull-cellene, hver merket med «L1»/«L2»/«—» (lag-label eller strek for tie)
   - «Longest drive #1: Karl (Lag 2) → 2p»
   - «Longest drive #2: Ingen kvalifiserte»
   - «Closest to pin #1: Per (Lag 1) → 2p»

**Mobile-først:** poeng-tabellen er primær — detaljene er kollapsbar under (`<details>`-element med summary «Vis hvordan poengene ble fordelt»).

**Hull-grid for hole-wins:** 3×6 eller 6×3-rutenett. Hver celle viser hull-nr + lag-label. Tabulær-nums, palette-fargene.

## Integrasjon med eksisterende reveal-mode

Sideturneringens reveal-regel («skjult til finished») er strengere enn `score_visibility`. Det betyr:

- **live + side-turnering:** ingen sideturnering vist under runden. Etter finished: fanen åpnes.
- **reveal + side-turnering:** netto-tall skjult under runden (eksisterende), sideturnering også skjult. Etter finished: begge fanene viser sin reveal.

Ingen konflikt — bare to lag av samme regel.

## Mail-flyt

Ingen ny mail. Dagens «Resultatet er klart»-mail (`lib/mail/gameFinishedNotification.ts`) sendes som vanlig ved game-finish — sideturneringen er bare en ny fane på leaderboarden de allerede får lenke til.

(Mulig fremtidig forbedring: mail-en kan nevne sideturnerings-toppen — «Lag 2 vant også sideturneringen med 38 poeng». Dropper det fra første leveranse.)

## Tester

**Unit (`lib/scoring/sideTournament.test.ts`):** 13 test-cases listet over. TDD-disiplin.

**Integration (`app/admin/games/[id]/avslutt/`):**
- Form-validering: feil antall vinnere returnerer 400
- Vinner-insert + status-flip er ett tilkalt løp (best-effort hvis det andre feiler)

**E2E:** ikke i første leveranse. Smoke-test manuelt via prod (per memory `feedback_production_only_testing`).

## Versjonering

**Bump:** MINOR (`v1.0.9` → `v1.1.0`). Ny bruker-synlig feature shipped i sin helhet — første minor-bump siden v1.0.0.

**CHANGELOG-entry:**
- Tema-heading: «1.1.y — Sideturnering»
- Tagline: «Du kan nå legge til en sideturnering med poeng-konkurranse på toppen av best-ball-netto. Lag samler poeng for best netto, hole-wins og admin-valgte longest-drive/closest-to-pin-vinnere.»

## Out-of-scope (følger ikke v1.1.0)

- Sideturnerings-resultater i game-finished-mail
- Per-spiller sideturnerings-poeng (kun lag i denne leveransen)
- Stableford-style poengsystem som alternativ til 10/5/5/2-skjemaet
- Custom poeng-vekter (admin kan ikke endre 10/5/5/2 i denne leveransen)
- LD/CTP-vinnere som peker til spesifikt hull-nummer (kun antall, ikke hull)
- LD/CTP-vinner-valg ved spill-opprett (kun ved game-end)

## Filer som påvirkes

**Nye filer:**
- `supabase/migrations/0024_side_tournament.sql`
- `lib/scoring/sideTournament.ts` + `.test.ts`
- `app/admin/games/[id]/avslutt/page.tsx`
- `app/admin/games/[id]/avslutt/actions.ts`
- `app/admin/games/[id]/avslutt/SideWinnersForm.tsx`
- `app/games/[id]/leaderboard/SideTournamentView.tsx`
- `app/games/[id]/leaderboard/LeaderboardTabs.tsx`

**Endrede filer:**
- `app/admin/games/new/GameForm.tsx` — ny seksjon
- `app/admin/games/new/actions.ts` — validering + insert av nye felter
- `app/admin/games/[id]/edit/page.tsx` — samme seksjon, låses ved active/finished
- `app/admin/games/[id]/EndGameButton.tsx` — conditional redirect til /avslutt
- `app/admin/games/[id]/actions.ts` — `endGame` brukes fortsatt; ny `endGameWithSideWinners` legges til
- `app/games/[id]/leaderboard/page.tsx` — tabs-host
- `CHANGELOG.md` — v1.1.0-entry
- `package.json` — version bump
