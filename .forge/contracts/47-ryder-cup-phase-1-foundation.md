# Spec: Ryder Cup fase 1 — cup-grunnmur (multi-match singles)

**Issue:** [#47](https://github.com/jdlarssen/golf-app/issues/47)
**Type:** MINOR (ny bruker-synlig feature)
**Fase:** 1 av 4 — leverer Cup-grunnmur for singles-only multi-match-turneringer. Fase 2 (four-ball), fase 3 (foursomes/alt-shot), fase 4 (match-templating) blir egne issues.

## Problem

Tørny har null multi-game-kobling i dag — hvert spill er isolert ([scout-bekreftet via `games`-skjema, ingen `parent_game_id` eller `series_id`](supabase/migrations/0001_initial_schema.sql)). Ryder Cup-stilen krever fundamentalt en **turnering-av-turneringer**: to lag som spiller flere kamper, hver kamp gir point, første lag til halvparten + 0,5 vinner.

Eksisterende `singles_matchplay`-modus ([lib/scoring/modes/singlesMatchplay.ts:1-150](lib/scoring/modes/singlesMatchplay.ts:1)) gir oss komplett 1v1-scoring per kamp. Det vi mangler er **wrapper-laget**: hvordan binde 4-8 singles-kamper sammen til én lag-vs-lag-konkurranse med master-leaderboard.

Denne fasen leverer den wrapper-en. Vi bruker eksisterende singles-modus for hver kamp; nye scoring-modes (four-ball, foursomes) kommer i fase 2-3.

## Research Findings

Verifisert via scout:

- **Singles matchplay-modus er moden og stabil** ([lib/scoring/modes/singlesMatchplay.ts](lib/scoring/modes/singlesMatchplay.ts)). Bruker `MatchplaySide`-interface med `sideNumber` (1/2), `userId`, `courseHandicap`. Returnerer `SinglesMatchplayResult` med `holesUp`, `holesPlayed`, `holesRemaining`, `result: '3&2' | '2up' | 'AS' | null`.
- **`games.mode_config` JSONB-felt** ([0030_game_modes.sql:22-40](supabase/migrations/0030_game_modes.sql:22)) gir oss en utvidelses-vei uten skjema-endring per spill. Brukes i dag for Texas scramble (`team_handicap_pct`). Vi reserverer `mode_config.cup_match` for å markere at et spill er en cup-kamp.
- **Side tournaments er strukturelt forskjellig** fra Ryder Cup ([0024_side_tournament.sql](supabase/migrations/0024_side_tournament.sql)) — der er det parallelt scoring innenfor *ett* spill, mens Ryder Cup er *flere* spill koblet til *én* turnering.
- **`game_players`-tabellen** har allerede `team_number` ([0001_initial_schema.sql:55-65](supabase/migrations/0001_initial_schema.sql:55)) som vi bruker direkte: side 1 = team_number 1, side 2 = team_number 2.
- **Mode-router-arkitekturen** ([lib/scoring/index.ts:26-39](lib/scoring/index.ts:26)) gir oss en gjenbrukelig pattern. For master-leaderboard skriver vi en ny ren funksjon `computeCupLeaderboard(tournament, matches)` som aggregerer matchresultater til lag-points.

## Prior Decisions

- **Fra [Texas scramble-kontrakt](.forge/contracts/texas-scramble.md):** Mode-router + mode_config JSONB-pattern er etablert. Vi bygger på det.
- **Fra [#198](https://github.com/jdlarssen/golf-app/issues/198) (trusted creators):** Cup-create-flow er admin-only i denne fasen. Trusted creators får tilgang når `/opprett-cup` evt. eksponeres bredt — defer til senere.
- **Fra [#92](https://github.com/jdlarssen/golf-app/issues/92), [#166](https://github.com/jdlarssen/golf-app/issues/166):** Disse er pågående parallelt og påvirker ikke cup-grunnmuren.

## Design

### 1. Datamodell

Ny migrasjon (sannsynligvis `0037_tournaments.sql` etter at #92 og #166 har tatt 0035 og 0036):

```sql
create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  team_1_name text not null check (char_length(team_1_name) between 1 and 40),
  team_2_name text not null check (char_length(team_2_name) between 1 and 40),
  points_to_win numeric(4,1) not null check (points_to_win > 0),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'finished')),
  winner_team smallint check (winner_team in (1, 2)),
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

alter table public.games
  add column tournament_id uuid references public.tournaments(id) on delete set null,
  add column tournament_match_label text;
-- match_label = «Singles 1», «Singles 2», etc. — fri tekst for admin

create index on public.games (tournament_id) where tournament_id is not null;
create index on public.tournaments (status, created_at desc);
```

**RLS** (eget migrasjons-block eller samme fil):
- `tournaments`: alle innloggede kan `SELECT` (cup-leaderboards er offentlige i Tørny-konteksten). Admin kan `INSERT/UPDATE/DELETE`.
- `games.tournament_id`: ingen ekstra policy — eksisterende games-RLS dekker det.

**Hvorfor `team_X_name` på cup-rad-en og ikke egen `teams`-tabell:** for fase 1 er det alltid eksakt 2 lag. Egen tabell blir over-engineering. Når vi senere får cup-formater med flere lag (Solheim Cup-stil?), kan vi normalisere.

**Hvorfor `tournament_match_label` på `games`-tabellen og ikke på en ny `tournament_matches`-tabell:** match-en *er* spillet. En egen mellom-tabell ville duplisere metadata. Label er bare en bekvemmelig admin-string («Singles 1», «Singles 2») for ordens skyld i UI.

### 2. Cup-create-flow (admin)

Ny rute: `/admin/cup/new`.

**Form-felt:**
- Navn (påkrevd, 1-80 tegn): «Tørny Cup 2026 — Sommer-runde»
- Lag 1-navn (påkrevd, 1-40 tegn): «Team Skog»
- Lag 2-navn (påkrevd, 1-40 tegn): «Team Sjø»
- Point-mål (påkrevd, default 4,5 — passer for 8 matches): «Lag som først når X point vinner cupen»

**Sub-tekst under point-mål:** «Vanlig regel: halvparten av tilgjengelige point + 0,5. Eksempel: 8 matches → 4,5 point. Forsvarende lag vinner cupen ved likestilling.»

Submit → `createTournamentDraft`-action → cup opprettes med `status='draft'`, redirect til `/admin/cup/[id]`.

**Hvorfor egen rute:** cup-en er fundamentalt forskjellig fra et enkelt-spill. Å klemme den inn i game-wizardens flow bryter mental-modellen.

### 3. Cup-detalj-side (`/admin/cup/[id]`)

Seksjoner (vertikal stack):

**3a. Cup-info-kort:** navn, lag-navn, point-mål, status-chip. «Rediger»-knapp.

**3b. Lag-roster:**
- To kolonner side-om-side (lag 1 venstre, lag 2 høyre)
- Spillerne legges til ved å hente fra global player-pool (samme picker som game-wizard)
- En spiller kan kun være på ett lag i cupen — admin-side-validering
- Antall spillere per lag er ikke gating — kan være ulikt (ulike Ryder Cup-formater varierer)

**3c. Matches-liste:**
- Tabell-rader: «Singles 1 · Per (Lag 1) vs Knut (Lag 2) · Status: utkast/spilles/ferdig · Resultat: 3&2 Per»
- «Opprett ny match»-knapp → game-wizard pre-filled med `game_mode='singles_matchplay'`, `tournament_id=...`, lag fra cup-rosteret
- Hver match er en vanlig `games`-rad med eksisterende scoring/scorekort/approval — uendret per match

**3d. Master-leaderboard-preview:**
- Lag 1: X point · Lag 2: Y point · Spilles: Z matches
- «Se full leaderboard»-link til `/cup/[id]` (offentlig rute, ikke admin-only)

**3e. Cup-avslutt-handlinger:**
- «Start cup» (status draft → active) når minst 2 matches er opprettet
- «Avslutt cup» (status active → finished) — frosset, vinner-lag bestemmes av point-status
- «Slett cup» — dedikert konfirmasjons-side (per CLAUDE.md `feedback_destructive_actions_dedicated_page`)

### 4. Master-leaderboard (`/cup/[id]`)

Offentlig rute (samme tilgangs-modell som game-leaderboards). Server-component, rebuilt på `revalidateTag(\`tournament-\${id}\`)` etter hver match-finish.

**Layout (mobile-first):**

```
┌─────────────────────────────────────────┐
│ Tørny Cup 2026 — Sommer-runde           │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                         │
│      LAG SKOG          LAG SJØ          │
│        4,5              3,5             │
│        ━━━              ━━━             │
│                                         │
│ Først til 4,5 point vinner              │
│                                         │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ MATCHES                                 │
│                                         │
│ Singles 1   Per vs Knut          1-0   │
│             3&2 til Per                 │
│                                         │
│ Singles 2   Lise vs Eva          ½-½   │
│             AS                          │
│                                         │
│ Singles 3   Ola vs Espen        Spilles│
│                                         │
│ Singles 4   Anne vs Maja         0-1   │
│             2&1 til Maja                │
└─────────────────────────────────────────┘
```

**Point-tildelings-regel:**
- Match vunnet → 1 point til vinner-lag, 0 til taper
- Match halvert (AS) → 0,5 point til hvert lag
- Match ikke ferdig → 0 point til begge lag (vises som «Spilles»)

**Vinner-bestemmelse:**
- Når `total(team1_points) >= points_to_win` ELLER ingen flere matches kan endre utfallet → vinner deklareres
- Forsvarende lag (defineres ikke i fase 1, men antydes i sub-tekst) vinner ved nøyaktig point-mål-likestilling — defer-es til senere konfig

### 5. Scoring-aggregator

Ny ren funksjon i `lib/cup/computeCupLeaderboard.ts`:

```ts
export type CupMatchSummary = {
  gameId: string;
  matchLabel: string | null;
  team1PlayerName: string;
  team2PlayerName: string;
  status: 'draft' | 'active' | 'finished';
  result: { winnerTeam: 1 | 2 | null; description: string } | null;
  pointsTeam1: number;  // 0, 0.5, or 1
  pointsTeam2: number;
};

export type CupLeaderboardResult = {
  team1Name: string;
  team2Name: string;
  team1Points: number;
  team2Points: number;
  pointsToWin: number;
  winner: 1 | 2 | null;  // null hvis cup ikke avgjort
  matches: CupMatchSummary[];
};

export function computeCupLeaderboard(
  tournament: TournamentRow,
  matches: GameWithPlayersAndResult[],
): CupLeaderboardResult;
```

Renheten gjør den enkel å unit-teste (8-10 tester dekker alle kombinasjoner: vunnet, halvert, ikke ferdig, vinner deklarert, ikke avgjort).

### 6. Mail-notifikasjon (best-effort)

Når cup-en starter (status draft → active): Resend-mail til alle deltakere via [`lib/mail/`](lib/mail/)-mønsteret. Subjekt: «Tørny Cup har startet — {{cup-name}}». Body lister lag-roster og første matches.

Når cup-en avsluttes: ny mail med vinner-lag og leaderboard-snapshot.

Begge er best-effort med `Promise.allSettled` + `console.error`-logging. Mail-feil blokkerer aldri cup-flyten.

## Edge Cases & Guardrails

- **Cup uten matches:** master-leaderboard viser 0-0, status «Venter på første match». Vinner-bestemmelse triggerer ikke.
- **Match slettet etter cup-start:** `games.tournament_id` blir null (via `on delete set null`). Cup-leaderboard re-computes uten den match-en. Admin ser advarsel i UI.
- **Spiller fjernet fra cup-roster mens en match pågår:** match-en fortsetter (eksisterende game-player-relasjon vinner). Cup-roster reflekterer ikke endringen før cup re-startes. Bevisst: vi rydder ikke pågående matches.
- **To matches med samme par-konstellasjon:** admin har lov. Cup tillater «omkamp». Begge teller mot point-totalen.
- **Cup-name med ulovlige tegn:** standard sanering (HTML-escape ved render). Lengde 1-80 tegn håndheves DB-side via CHECK.
- **Point-mål under matches finished:** vinner deklareres med en gang `points_to_win` nås. Resterende matches kan fortsatt spilles (de teller bare for ære).
- **Cup-status active mens admin sletter siste match:** hvis det fjerner muligheten for vinner-deklarering, status forblir active. Admin må manuelt avslutte.
- **RLS:** alle innloggede ser cup-leaderboard. Bevisst åpent for å matche Tørny-konteksten (golf-resultater er sosiale, ikke private).
- **Mobile-leaderboard:** point-totalene må være store og lesbare (font-serif tabular-nums minimum 48px). Lag-navn under, point over.

## Key Decisions

- **`tournaments`-tabell + `games.tournament_id` FK:** ren modell, gjenbruker eksisterende scoring/scorekort/approval per match.
- **Bare singles i fase 1:** four-ball og foursomes er ny scoring-arkitektur. Splittes ut til fase 2-3 som egne issues for håndterbar build-løkke.
- **Eksakt 2 lag, navn på cup-raden:** enklere enn egen `teams`-tabell, dekker 100% av Ryder Cup-stilen.
- **Manuell match-opprettelse i fase 1:** admin lager hver match individuelt. Templating (auto-generere fra format) er fase 4.
- **`mode_config.cup_match`-markør på games:** flagger at spillet er en cup-match (kan gjelde for fremtidig visuell differansiering). Optional, ikke gating.
- **Cup-route `/cup/[id]` offentlig:** innlogget-only, men ikke admin-only. Leaderboards er sosiale.
- **Versjons-bump:** MINOR (ny bruker-synlig feature).

**Claude's Discretion:**
- Eksakt copy på cup-create-form. Humanizer-pass.
- Visuelt design på master-leaderboard (point-størrelse, farger). Champagne-gold-accent for vinner-lag når avgjort? Anbefales.
- Om cup-avslutt-flyten skal kreve eksplisitt admin-bekreftelse («Er du sikker?»). Anbefales: ja, dedikert konfirmasjons-side per destructive-action-pattern.
- Om mail-notifikasjon på cup-start skal sendes til alle deltakere eller bare lag-kapteiner (hvis vi har kapteiner). Anbefales: alle deltakere. Captain-konsept defer-es.
- Exact `revalidateTag`-strategi: `tournament-${id}` ved match-finish, samme i cup-status-endring.

## Success Criteria

- [ ] Migrasjon `0037_tournaments.sql` lagt til + `lib/database.types.ts` regenerert. Verifikasjon: `grep "tournaments" lib/database.types.ts` returnerer treff i Row/Insert/Update.
- [ ] Admin kan opprette cup via `/admin/cup/new`. Verifikasjon: manuell preview-test, lag opprettes med navn + 2 lag-navn + point-mål.
- [ ] Cup-detalj-side (`/admin/cup/[id]`) viser lag-roster, matches-liste, master-leaderboard-preview. Verifikasjon: manuell test med 1 cup + 0 matches → tomt; med 2 spilte matches → riktig point-fordeling.
- [ ] «Opprett ny match» fra cup-siden lander i game-wizard pre-filled med `game_mode='singles_matchplay'` og `tournament_id` satt. Verifikasjon: match opprettes, FK i DB stemmer.
- [ ] Master-leaderboard (`/cup/[id]`) renderer korrekt for ikke-avgjort, halvert, og ferdig-status. Verifikasjon: snapshot-tester eller manuell preview.
- [ ] `computeCupLeaderboard`-helper har full unit-test-dekning. Verifikasjon: `npm test -- computeCupLeaderboard` ≥ 8 grønne tester.
- [ ] Cup-status flow virker: draft → active (krever minst 2 matches) → finished (manuell avslutt eller auto når point-mål nås). Verifikasjon: integrasjonstest stubber matches og verifiserer statustransisjon.
- [ ] Mail-notifikasjon best-effort på cup-start og cup-finish. Verifikasjon: Resend-stub mottar request-payload med riktig template.
- [ ] Cup-slett dedikert konfirmasjons-side (`/admin/cup/[id]/slett`). Verifikasjon: manuell test, cup slettes + tilknyttede matches får `tournament_id=null` (ikke slettet).

## Gates

- [ ] `npx tsc --noEmit` passerer
- [ ] `npm test -- computeCupLeaderboard cupActions` passerer
- [ ] `npm run lint` passerer
- [ ] Pre-commit-hook `.githooks/pre-commit` ingen humanizer-advarsler på nye norske strenger
- [ ] Manuelt røyk-test på preview:
  - [ ] Opprett cup med 2 lag à 2 spillere
  - [ ] Opprett 4 singles-matches fra cup-siden
  - [ ] Spill gjennom 2 av dem (1 vunnet av hvert lag) — leaderboard viser 1-1
  - [ ] Spill 1 til til halvert — leaderboard viser 1,5-1,5
  - [ ] Avslutt cup manuelt
  - [ ] Sjekk at mail-notifikasjon sendes (Resend-dashboard)
- [ ] Vercel-preview deployer grønt; spot-sjekk `/admin/cup/[id]` og `/cup/[id]` i Safari mobil

## Files Likely Touched

- `supabase/migrations/0037_tournaments.sql` — ny migrasjon
- `lib/database.types.ts` — regenerert
- `lib/cup/types.ts` — `Tournament`, `CupLeaderboardResult` types
- `lib/cup/computeCupLeaderboard.ts` — scoring-aggregator
- `lib/cup/computeCupLeaderboard.test.ts` — unit-tester
- `lib/cup/actions.ts` (eller `app/admin/cup/[id]/actions.ts`) — server-actions for create/update/finish/delete
- `app/admin/cup/new/page.tsx` + form-component — cup-create-flyt
- `app/admin/cup/[id]/page.tsx` — cup-detalj
- `app/admin/cup/[id]/slett/page.tsx` — konfirmasjons-side
- `app/cup/[id]/page.tsx` — offentlig master-leaderboard
- `app/admin/games/new/page.tsx` (eller GameWizard) — håndter `?tournament_id=...` pre-fill
- `lib/mail/cupStartedNotification.ts` — ny Resend-mail
- `lib/mail/cupFinishedNotification.ts` — ny Resend-mail
- `proxy.ts` — legg til `/cup/*` i public-protected matcher hvis det ikke allerede dekkes
- `package.json` + `CHANGELOG.md` — MINOR bump, CHANGELOG-oppføring med stakeholder-tagline

## Oppfølger-issues (opprettes ved Fase 1-PR-merge)

- **Fase 2:** «Ryder Cup phase 2: four-ball matchplay (2v2 best ball)» — ny `game_mode='fourball_matchplay'`, scoring-modul, wizard-støtte, leaderboard-støtte i singles-cup-rammeverket.
- **Fase 3:** «Ryder Cup phase 3: foursomes matchplay (2v2 alt-shot)» — helt ny scoring-modell (én ball per lag, alternerende slag). Krever ny scorekort-UX der bare én spiller per lag taster per hull.
- **Fase 4:** «Ryder Cup phase 4: match-templating + format-presets» — auto-generere match-schedule fra format-template («4 singles + 2 four-balls + 2 foursomes»), Ryder Cup-mini preset, Tørny Cup preset.

Hver fase ship-bar uavhengig. Fase 2-3 krever ikke at hverandre er ferdige. Fase 4 forutsetter at minst fase 2 er på plass for å være nyttig.

## Out of Scope

- **Four-ball matchplay (2v2 best-ball)** — egen scoring-modul, fase 2.
- **Foursomes matchplay (2v2 alt-shot)** — egen scoring-modul + ny scorekort-UX, fase 3.
- **Match-templating** — auto-generere matches fra format-preset, fase 4.
- **Lag-kapteiner** — eksplisitt rolle innenfor laget. Nice-to-have, ikke nødvendig nå.
- **Lag med ≠2** — Solheim Cup-stil med flere lag. Krever skjema-endring. Defer til konkret behov.
- **Tournament-format-presets** («Ryder Cup mini», «Tørny Cup») — koblet til fase 4.
- **Live-streaming-poeng-oppdatering** — eksisterende `revalidateTag` + Realtime dekker behovet.
- **Trofé / champagne-animasjon ved vinner-deklarering** — visuell polish, kan komme i polish-PR senere.
- **Mobile-app push** for cup-events — depending on [#24](https://github.com/jdlarssen/golf-app/issues/24).
- **Statistikk på tvers av cuper** («Lag Skog har vunnet 3 cuper»). Egen feature.
- **Cup-historikk på spiller-profil** — kobler til klubbstatistikk-arkitekturen, defer.
- **Auto-finish ved point-mål nådd** uten admin-handling — fase 1 krever eksplisitt admin-avslutt. Auto-avslutt er polish.
- **Trusted-creator-tilgang til cup-create** — fase 1 er admin-only. Senere kontrakt.
