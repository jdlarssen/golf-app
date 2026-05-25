# Spec: Multi-player scorekort (lag-medlemmer side om side)

Issue: [#17](https://github.com/jdlarssen/golf-app/issues/17)

## Problem

`/games/[id]/scorecard` viser i dag kun spillerens egen scorekort som en enkel `# | Par | SI | Slag | Netto`-tabell. I best-ball, par-stableford, matchplay og texas scramble har spilleren enten partner(e) eller motstander hvis scorer hører naturlig sammen med ens egen — på et fysisk papir-scorekort ville begge sider stå side om side.

Dagens single-player-view skjuler dette helt. For best-ball 2-mannslag og par-stableford 4BBB betyr det at brukeren må gå til leaderboard for å se hva partner slo. For matchplay må man huske motstanders scorer fra hull-page. For Texas scramble er problemet enda verre: lag-kapteinen eier scores-radene, så non-captain-spillere som lander på `/scorecard` ser TOMME tall (deres egne user_id har ingen scores).

Vi utvider scorekortet til å vise lag-medlemmer (eller motstander i matchplay) side om side i alle team-baserte modi.

## Research findings

- **Next.js 16 cache-pattern**: Vi bruker allerede `unstable_cache` med tag `game-${id}` i `lib/games/getGameWithPlayers.ts` for game+players-rader. Scores caches IKKE (de endrer seg for ofte) — multi-player score-fetch må gå direkte til DB, ikke via cache. Kilde: `lib/games/getGameWithPlayers.ts:38-40` (eksisterende konvensjon).
- **RLS-policy for scores** (`supabase/migrations/0031_solo_visibility_rls.sql`): `same_flight_or_solo` slipper igjennom partners scorer hvis (a) samme flight under aktivt spill, (b) `score_visibility='reveal'` under aktivt spill, eller (c) game er finished. For matchplay og texas setter validatorene `flight_number = team_number`, så same-flight er garantert. For best-ball og par-stableford er flight-tildelingen flexible per `app/admin/games/new/PlayerAssignment.tsx`, men team-mates havner typisk i samme flight i praksis. Vi bruker **admin-client for multi-player score-fetch** (samme pattern som `getGameWithPlayers.ts`) for å unngå at en uvanlig flight-konfigurasjon brekker visningen — authz beholdes call-site via `me ∈ players && member.team_number === me.team_number`.
- **`computeStablefordPoints`** (`lib/scoring/modes/stableford.ts`) tar `{ par, netStrokes }` og returnerer poeng — ren funksjon, gjenbrukbar i scorekort-rendering.
- **`scoreShape` / `scoreTone`** (`lib/scoring/`) brukes allerede for slag-cellene i single-player-scorekort; samme komponent-pattern gjenbrukes.

## Prior decisions (forrige contracts)

Carry forward fra `.forge/contracts/texas-scramble.md`:

- **Mode-router-pattern**: Server-component switcher på `game.game_mode` for å bestemme hvilket layout som rendrer. Ingen ny abstraksjon — branching pr modus i samme komponent (samme pattern som `HoleClient.tsx`).
- **Captain-modellen for Texas**: scores eier av lex-min userId. Multi-player scorekort må normalisere fra `currentUserId` til captain-userId for score-lookup i Texas — ellers viser non-captain-medlemmer tomt scorekort i dag.
- **MODE_LABELS-pattern**: Norske labels per modus. Tittel-beslutning per modus (se Design) bruker hardkoded mapping istedenfor å utvide MODE_LABELS, fordi titlene er site-spesifikke ("Lagets scorekort" vs "Match-scorekort" vs "Mitt scorekort").
- **HoleClient-pattern for game-mode-narrowing**: Boolean-flagg `isStableford` / `isTexas` / `isMatchplay` på toppen av komponenten styrer per-mode-grener. Samme pattern brukes i scorecard-page.

## Design

### Tittel og link-label (per modus)

| `game_mode` (+ `team_size`) | Tittel (TopBar kicker) | CTA-tekst på `/games/[id]` |
|---|---|---|
| `best_ball_netto` | Lagets scorekort | Lagets scorekort |
| `stableford` team_size=2 | Lagets scorekort | Lagets scorekort |
| `singles_matchplay` | Match-scorekort | Match-scorekort |
| `texas_scramble` | Lagets scorekort | Lagets scorekort |
| `stableford` team_size=1 | Mitt scorekort | Mitt scorekort |
| `solo_strokeplay_netto` | Mitt scorekort | Mitt scorekort |

Single source of truth: en hjelper `scorecardTitle(gameMode, modeConfig)` i `lib/games/scorecardTitle.ts` brukes både av `/games/[id]/scorecard/page.tsx` (TopBar `kicker`) og `/games/[id]/page.tsx` (Card-label på linje 567). Returnerer `{ title, label }` der `label` brukes på Card-en på spilloversikten.

### Layout-varianter

Tre layouts. Server-komponenten velger basert på `game_mode` (+ `team_size`):

**Layout A — Single player (solo-modi + Texas + reveal-active-fallback):**
```
# | Par | SI | Slag | Netto
1 |  4  |  9 |  4   |  3
...
```
Identisk med dagens layout. Texas bruker dette layoutet, men score-lookup er på lag-kapteinens userId (ikke spillerens). Tittel er fortsatt «Lagets scorekort» for Texas — bare layoutet er solo-aktig fordi det finnes ÉN delt score.

**Layout B — To spillere side om side (best-ball 2-mannslag, par-stableford 4BBB, matchplay 1v1):**
```
       | Par |   J    |    H
   #   |     | Slag/N | Slag/N
  ─────┼─────┼────────┼────────
   1   |  4  |  4 / 3 |  5 / 4
   2   |  3  |  3 / 3 |  3 / 3
  ...
```
Kolonner: `# | Par | Player1 | Player2`. Hver spiller-celle har slag (stor) + netto-eller-poeng (liten, under). SI-kolonnen droppes — den finnes på hull-page-en og fjerner én kolonne for plass.

**For par-stableford**: andre tall er stableford-poeng (`computeStablefordPoints({ par, netStrokes })`), ikke netto. Header viser «Slag / Poeng» som tooltip-aria-label hvis nødvendig, men selve cellen viser kun tallene.

**For matchplay**: andre tall er netto. Player1 er alltid current user (sideNumber=me.team_number), Player2 er motstander (den andre side-en). Header-initialer er «Du» og motstanders initial istedenfor begge initialer.

Footer for Layout B:
- **Best-ball**: «Spilte hull: N/18 · Du: B-S/N-S · Partner: B-S/N-S · Lag-best: N-T» (B=brutto, N=netto, T=teamtotal)
- **Par-stableford**: «Spilte hull: N/18 · Dine poeng: P · Partners poeng: P · Lagets poeng: P» (lagets = sum av per-hull-MAX)
- **Matchplay**: «Spilte hull: N/18 · Du: B-S/N-S · Motstander: B-S/N-S» + linje 2: «{matchStatusFormatted}» (e.g. «2up etter 8 hull», «AS», «3&2») via `singlesMatchplay.compute()`-resultatet

### Reveal-active fallback

Når `revealState(game.score_visibility, game.status) === 'reveal-active'`:
- Layout B faller tilbake til Layout A (single-player, kun me)
- Netto-kolonnen skjules (samme regel som i dag)
- Tittelen forblir mode-spesifikk («Lagets scorekort» osv.) — det er bare layoutet som forenkler
- Footer mister team-totaler

Begrunnelse: hele poenget med reveal-active er å skjule netto-info til spillet er ferdig. Å vise partners gross/netto bryter samme prinsipp. Etter `reveal-finished` (game.status = 'finished'), full layout B reaktiveres.

### Initialer i header

Initialer hentes via eksisterende `nameInitials(name, nickname)` fra `lib/names/initials.ts`. For matchplay er header «Du / X» der X er motstanders initial. For best-ball/par-stableford er det «Y / X» der Y er din initial, X er partners. Currrent user er alltid leftmost partner-kolonne (sortert «me first, så partner» i mapping).

For Texas: ingen multi-column-header. TopBar kicker = «Lagets scorekort» er nok kontekst.

### Data-fetching

Server-komponenten `ScorecardPage`:

1. Hent `{ game, players }` fra `getGameWithPlayers(id)` (cached, admin-client).
2. Bestem `currentMode = game.game_mode` og `teamSize = mode_config.team_size` (kun for stableford som varierer).
3. Bestem `partners`:
   - `best_ball_netto` (team_size=2): alle med `team_number === me.team_number && user_id !== me.user_id` (typisk 1 partner)
   - `stableford` team_size=2: samme som over
   - `singles_matchplay` (team_size=1): alle med `team_number !== me.team_number` (typisk 1 motstander)
   - `texas_scramble`: ingen partners-kolonner; bare resolve captain-userId for score-lookup
   - solo-modi: ingen partners
4. Hent scorer:
   - For team-modi: hent scorer for `[me.user_id, ...partners.map(p => p.user_id)]` via **admin-client** (fordi RLS kan blokkere ved uvanlig flight-konfig). Authz call-site: `me` må finnes i `players` (allerede sjekket).
   - For Texas: hent scorer for captain-userId (single fetch).
   - For solo-modi: dagens single-fetch på `me.user_id`.
5. Hent course_holes som i dag (én query, alle 18 hull).
6. Render Layout A eller B basert på modus + reveal-state.

### Tittel-helper

```ts
// lib/games/scorecardTitle.ts
export function scorecardTitle(
  gameMode: GameMode,
  modeConfig: GameModeConfig,
): { title: string; cardLabel: string } {
  const isTeamMode =
    gameMode === 'best_ball_netto' ||
    gameMode === 'texas_scramble' ||
    (gameMode === 'stableford' && modeConfig.team_size === 2);

  if (gameMode === 'singles_matchplay') {
    return { title: 'Match-scorekort', cardLabel: 'Match-scorekort' };
  }
  if (isTeamMode) {
    return { title: 'Lagets scorekort', cardLabel: 'Lagets scorekort' };
  }
  return { title: 'Mitt scorekort', cardLabel: 'Mitt scorekort' };
}
```

### Submit-state og CTA-flyt

Submit-state-CTA-er nederst på siden beholdes som i dag — selve scorekort-tabellen endrer seg, men CTA-flyten («Tilbake til hull N», «Tilbake til spillet», submit-status) er per-spiller-state, ikke team-state. Texas er allerede dekket av «Lever lagets scorekort» i hole-page submit-flow.

## Edge cases & guardrails

- **Best-ball-partner i annen flight**: RLS ville blokkert via authenticated client; vi bruker admin-client → fungerer. Authz-sjekk er at me er i players + partner er på samme team_number, så det er ingen leak.
- **Single-player team (team_size=2 men kun 1 spiller registrert under draft)**: skal egentlig ikke skje under aktivt spill fordi validator krever fulle lag ved publish. Defensivt: hvis partners.length === 0 i team-modus → fall tilbake til Layout A.
- **3-mannslag i Texas (utilatte teamsize)**: ENABLED_COMBOS sperrer dette ved publish. Defensivt: hvis mode_config.team_size er ukjent, fall tilbake til Layout A.
- **Stableford-poeng for ikke-spilte hull**: `computeStablefordPoints` håndterer null gross? Sjekk i implementasjon. Hvis ikke, return `null` for poeng-cellen.
- **Matchplay uten motstander (validator-feil)**: defensivt, fall tilbake til Layout A med tittel «Match-scorekort» (uvanlig — burde aldri skje).
- **Texas non-captain-spiller på scorecard-page**: I dag tomt scorekort. Fixet ved å lookup captain via lex-min userId på me.team_number-medlemmer (samme algoritme som `pickCaptain` i `lib/scoring/modes/texasScramble.ts`).
- **Reveal-active matchplay**: matchplay-leaderboard viser live status. Hvis admin har enabled reveal-active for matchplay (uvanlig), faller scorekortet tilbake til Layout A og match-status-linja skjules sammen med netto. Match-status er ikke "leaderboard" per se, men hvis admin har valgt reveal må vi være konsistent.
- **iPhone bredde 390-430px**: Layout B med 4 kolonner (#, Par, P1, P2) der player-celler er 2-tall-stacked må passe. Bruk `tabular-nums`, mindre font (`text-[11px]` for sekundærtall), kompaktere padding (`px-2.5 py-2`). Kontroll: 18-radstabellen må ikke kreve horisontal scroll på iPhone SE (375px).

## Key decisions

- **Scope: alle team-baserte modi** (best-ball, par-stableford, matchplay, texas) — bruker valgt. Solo-modi uendret.
- **Layout: drop SI-kolonne, behold Slag+Netto stacked per spiller** — best plass-budsjett på iPhone uten å miste den viktigste info.
- **Tittel: per-modus** — «Lagets scorekort» for lag-modi, «Match-scorekort» for matchplay, «Mitt scorekort» for solo. Felles helper for både TopBar-kicker og CTA-label på spilloversikten.
- **Reveal-active: fall tilbake til Layout A (single)** — konservativt, beholder reveal-prinsippet.
- **Texas: Layout A med captain-lookup** — kort på at gross er delt, ærlig på datamodellen. Ingen artificial multi-column.
- **RLS: admin-client for multi-player score-fetch** — eliminer flight-konfig-edge-case. Authz på call-site.
- **Data-shape: per-mode-grener i samme komponent** — samme pattern som HoleClient. Ingen ny abstraksjon.

**Claude's Discretion:**

- Eksakt font-size/padding for Layout B-celler — målet er 18-rads tabellen passer iPhone SE (375px) uten horisontal scroll. Bygger og verifiserer i browser.
- Header-format for matchplay-kolonner: «Du / X» med X = motstanders initial — kan justeres til «J / X» hvis tydeligere. Velger basert på hva som leser best i dev.
- Footer-tekst-formattering — eksempel-strenger i Design er forslag. Endelig kopi rettes om mot brand-tone (action-orientert, norsk konvensjon) under bygging.
- Om partner-kolonnen i 4BBB skal vise individual stableford-poeng eller MAX-flagget for hvem som bidro — velger individual poeng (parallelt med team-mate-info, MAX-info hører hjemme på leaderboard).
- Skeleton-state for Layout B — speil dagens Skeleton-pattern, juster kolonnebredder.

## Success criteria

- [ ] **Multi-player layout vises for team-modi**: Best-ball, par-stableford, matchplay og Texas viser den nye tittel-helperens label. Verifikasjon: `grep` viser `scorecardTitle()` call i `app/games/[id]/scorecard/page.tsx` + `app/games/[id]/page.tsx`. Manual i browser bekrefter «Lagets scorekort» rendrer.
- [ ] **Best-ball/par-stableford viser 2 player-kolonner**: Layout B aktiveres. Verifikasjon: enhetstest av `partnersFor(me, players, gameMode, modeConfig)`-helper returnerer partner (best-ball) eller motstander (matchplay). Browser-snapshot for 4-spiller best-ball-game viser begge initialer i header.
- [ ] **Texas Layout A med captain-lookup**: Non-captain-spiller på Texas-scorekort viser lag-scoren (ikke tom). Verifikasjon: enhetstest `pickCaptain([userA, userB])` (allerede finnes i `texasScramble.ts:41`) + integrasjonstest at scorer fetches på captain-userId.
- [ ] **Reveal-active fall-tilbake**: Når `revealState === 'reveal-active'`, Layout A rendres uavhengig av modus. Verifikasjon: enhetstest av komponent-rendering med revealState `'reveal-active'` → Layout A. Manual i browser.
- [ ] **iPhone-bredde**: 18-rads Layout B-tabellen kreves ingen horisontal scroll på 375px viewport. Verifikasjon: Playwright snapshot eller manual i Chrome DevTools 375x812.
- [ ] **CTA-label oppdateres**: Spilloversiktens «Mitt scorekort»-knapp viser «Lagets scorekort» (eller «Match-scorekort») i team-modi. Verifikasjon: grep + browser.
- [ ] **Footer-totals stemmer**: Per-spiller-totaler + lag-total summerer riktig. Verifikasjon: enhetstest av footer-render-helper med fixture-data, alle 4 modi.

## Gates

- [ ] `npx tsc --noEmit` exit 0
- [ ] `npm test -- scorecardTitle` (ny helper-test) grønn
- [ ] `npm test -- scorecard` (eksisterende + nye scorecard-tester) grønn
- [ ] `npm test` (full suite) grønn — ingen regresjoner
- [ ] iPhone SE-viewport (375x812) i Playwright eller manual: Layout B rendres uten horisontal scroll på alle 4 team-modi

## Files Likely Touched

- `app/games/[id]/scorecard/page.tsx` — hovedendring; mode-branching, partner-fetch, Layout A/B render
- `app/games/[id]/page.tsx` (linje ~567) — bytt hardkodet «Mitt scorekort» til `scorecardTitle()`-call
- `lib/games/scorecardTitle.ts` (ny) — title + cardLabel helper per modus
- `lib/games/scorecardTitle.test.ts` (ny) — enhetstester for helper
- `app/games/[id]/scorecard/page.test.tsx` (ny eller utvidet) — komponent-tester for Layout A/B, reveal-fallback, Texas captain-lookup
- `CHANGELOG.md` — minor-bump (ny bruker-synlig feature)
- `package.json` — version bump
- Mulig: `lib/games/visibility.ts` — hvis vi trenger nytt helper for revealActive-detection (men `shouldHideNetto`/`revealState` finnes allerede)

## Out of Scope

- **Endre datamodellen** — vi beholder per-player scores-rader, ingen ny tabell. Texas captain-modellen forblir uendret.
- **Live realtime-oppdatering på scorekort-page**: scorekortet er read-only/oppsummering. Hull-page-en gir live updates allerede. Scorekortet leser server-rendered snapshot.
- **Endre hull-page** (`HoleClient.tsx`): allerede viser per-spiller-kort under spillet. Denne kontrakten gjelder kun `/scorecard`-flaten.
- **Nye spillmodi**: ingen.
- **CSV-eksport-kolonner**: leaderboard-eksport (`app/games/[id]/leaderboard/export/route.ts`) ikke berørt; lever uendret format.
- **Endre approvering-flyt**: scorekort-godkjenning skjer per spiller på `/games/[id]/approve`, ikke på scorecard-page. Uendret.
- **Stableford-mode-leaderboard-CSV** for andre spillere — out of scope, dagens read-pattern (samme flight or solo) holder.
