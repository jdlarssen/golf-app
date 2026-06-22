# Spec: Statistikk-siden — riktig vinner per modus (#887)

## Problem

`/profile/statistikk` («Klubbstatistikker») viser to globale topp-10-lister: «Flest spill vunnet» og «Mest aktive». For hvert ferdige spill regner siden ut vinneren med `computeLeaderboard({ mode: 'netto', … })` — **uansett hvilken modus spillet faktisk var** (`app/[locale]/profile/statistikk/page.tsx:177-182`). Det krediterer feil spiller for alt som ikke er netto best-ball: stableford/skins/wolf/nassau får «lavest netto» utpekt som vinner, og **matchplay har ingen netto-totalsum** (avgjøres hull for hull) så der finner siden på en vinner som ikke har noe med matchresultatet å gjøre. Undertittelen hardkoder til og med «best-ball-netto» og «laget ditt» (andreperson på en global tavle).

Dette er en tillits-bug i avslutt-fasen: appen kroner feil vinner.

## Prior Decisions

- **`result_summary` er sannhetskilden for utfall (#572).** Per-spiller-utfall lagres som `game_players.result_summary` (jsonb) ved spill-slutt, bygget av `buildModeResultForGame` → `computeResultSummaries` — samme `ModeResult` som leaderboarden, så kort/leaderboard/statistikk aldri driver. Statistikk-siden skal lese dette feltet, ikke regne på nytt.
- **WD-filtrering er etablert (#844 / buildUniformContext).** Alle scoring-context-byggere og `buildUniformContext` filtrerer `withdrawn_at == null`. `result_summary` skrives derfor aldri for trukne spillere → de har `null` der.
- **Live FK-join for navn.** Navn hentes via `users!game_players_user_id_fkey(name)` (gjeldende navn), ikke en snapshot-kolonne. Beholdes — «utdatert navn»-bekymringen var en falsk finding.

## Design

Erstatt netto-utregningen med å lese det allerede lagrede, modus-riktige utfallet. Happy-path-en blir **lettere** enn i dag — hull- og scores-fetchene og hele `computeLeaderboard`-løkka forsvinner fra siden.

### Datalag (server component)

1. Hent ferdige spill: `games` → `id, course_id, game_mode, mode_config` der `status = 'finished'` (utvidet fra dagens `id, course_id` — `game_mode`/`mode_config`/`course_id` trengs til fallback-motoren).
2. Hent alle spillere for de spillene i én bulk: `game_players` → `game_id, user_id, withdrawn_at, result_summary, users!game_players_user_id_fkey(name)` filtrert `.in('game_id', gameIds)`. (Cookie-klienten kan lese disse — RLS er åpen for ferdige spill, akkurat som i dag.)
3. Drop dagens `course_holes`- og `scores`-bulk-fetch fra happy-path-en. (De hentes nå kun inne i fallback-motoren, og kun for spill som faktisk trenger det.)

### Aggregering (ny ren helper — `lib/stats/clubStats.ts`)

Trekk tellingen ut av server-komponenten til en ren, testbar modul:

```ts
import type { ResultSummary } from '@/lib/scoring/resultSummary';

/** Vant denne spilleren spillet sitt? placement #1 / matchplay-seier / flest skins. */
export function isWinningSummary(summary: ResultSummary | null): boolean {
  if (summary == null) return false;
  switch (summary.kind) {
    case 'placement': return summary.rank === 1;
    case 'matchplay': return summary.outcome === 'win';
    case 'skins':     return summary.rank === 1;
    default:          return false; // defensiv ved framtidig drift
  }
}

export type StatPlayerRow = {
  userId: string;
  name: string | null;
  withdrawnAt: string | null;
  resultSummary: ResultSummary | null;
};

export type GameAggregation = {
  /** Ikke-trukne spillere som teller i «Mest aktive». */
  participants: string[];
  /** Vinnere utledet fra lagrede summaries (tomme hvis needsFallback). */
  winners: string[];
  /** True når INGEN spiller har et lagret summary → prøv fallback-motoren. */
  needsFallback: boolean;
};

/** Aggreger ett ferdig spill fra dets game_players-rader. */
export function aggregateFinishedGame(players: StatPlayerRow[]): GameAggregation;
```

Regler i `aggregateFinishedGame`:
- **participants** = spillere med `withdrawnAt == null`.
- **winners** = ikke-trukne spillere der `isWinningSummary(resultSummary)` (dekker uavgjorte ties: flere rank-1 → flere vinnere).
- **needsFallback** = `true` når hver spiller har `resultSummary == null` *og* det finnes minst én ikke-trukket spiller. (Et spill der minst én spiller har et lagret summary stoler vi på — ingen recompute. Bare gamle pre-#572-spill og feilede persist-er er heldekkende null.)

### Fallback for null-summary-spill (sjelden sti)

For spill der `needsFallback`: kall `buildModeResultForGame(adminClient, { id, game_mode, mode_config, course_id })` → `computeResultSummaries(result)` → vinnere = userIds i mappen der `isWinningSummary`. Bruk **admin-klienten** (`getAdminClient`, RLS-bypass) som `persistResultSummaries` gjør — det unngår RLS-overraskelser på wolf/bbb-ekstra-tabellene ved lesing av andres spill. Motoren filtrerer allerede WD, så fallback-vinnere er WD-rene. `null`-retur (manglende hull/scores) → ingen vinnere, hopp over.

Participation for fallback-spill telles fortsatt fra `game_players` (ikke-trukne), ikke fra motoren.

### Opptelling → visning

Samme som i dag: `Map<userId, count>` for vinnere og deltakelse, `toSortedStats` → topp-10, samme `StatSection`-UI. Navn fra live-joinen. Ingen UI-/layout-endring utover undertitlene.

### Copy (besluttet: #887 retter den nå, løser overlapp med #873 punkt 3)

`messages/no.json` + `messages/en.json`, namespace `profile.statistikk` — tredjeperson, format-agnostisk:

| Key | Før | Etter (no) |
| --- | --- | --- |
| `winnersSubtitle` | «Antall ganger laget ditt har endt på #1 i best-ball-netto.» | «Antall ferdigspilte spill spilleren har vunnet.» |
| `mostActiveSubtitle` | «Antall ferdigspilte spill du har deltatt i.» | «Antall ferdigspilte spill spilleren har deltatt i.» |

Engelsk-paritet oppdateres tilsvarende (tredjeperson). Kjør `humanizer`-skillet på ny norsk copy før commit.

## Edge Cases & Guardrails

- **Korrupt spill uten spillere** → hopp over (som i dag).
- **Uavgjort matchplay (AS)** → `computeResultSummaries` skriver ingen oppføring → alle `null` → `needsFallback`; motoren gir også «tie» → ingen vinner. Ingen falsk kreditt.
- **Ties for #1** (flere rank-1 / flere med flest skins) → alle krediteres. Bevisst.
- **Trukket spiller** → `resultSummary` er allerede `null` (motoren ekskluderte hen ved persist) *og* filtreres eksplisitt ut av participation via `withdrawnAt`. Aldri vinner, aldri «aktiv».
- **Blandet null/ikke-null i samme spill** skal i praksis ikke skje (summaries skrives atomisk for alle ikke-WD-spillere). Regelen «minst én ikke-null → stol på lagret» håndterer det trygt uansett.
- **JSON-drift i `result_summary`** → typet som `ResultSummary`; `isWinningSummary` har `default: false`.
- **Ytelse:** ikke i scope. Ingen cap/caching her (#869 eier det og må lande *etter* denne — caching av et feil tall bevarer bare feilen). Happy-path-en blir likevel billigere enn i dag (færre fetches, ingen per-spill leaderboard-utregning); fallback-motoren kjører kun for de få null-spillene.

## Key Decisions

- **Les `result_summary`, recompute kun ved heldekkende null** — unngår å regne hele historikken på nytt, og selvheler gamle/feilede spill. (Diskusjon #887.)
- **Undertittel rettes i #887** — å shippe riktige vinnere under en undertittel som sier «best-ball-netto» ville være selvmotsigende. Markerer #873 punkt 3 som løst-av-#887. (Eier-valg.)
- **Trukne spillere utelates helt** fra både vinner-kreditt og aktiv-telling — matcher alle andre flater og motoren. (Eier-valg.)
- **Fallback bruker admin-klient** — samme RLS-bypass som `persistResultSummaries`, unngår wolf/bbb-RLS-feller.

**Claude's Discretion:**
- Eksakt fil-/funksjonsnavn i `lib/stats/` (foreslått `clubStats.ts`).
- Om participation-/vinner-opptellingen ligger i page-komponenten eller flyttes inn i en liten ren `tallyClubStats(games, playersByGame, fallbackWinnersByGame)`-funksjon i samme modul (foretrukket for test-dekning).
- Hvorvidt backfill-scriptet (`scripts/backfillResultSummaries.ts`) kjøres mot staging/prod for å redusere fallback-stien — valgfri optimalisering, ikke påkrevd for at fiksen er korrekt.

## Success Criteria

- [x] Et ferdig **stableford-**, **matchplay-** og **skins-**spill krediterer spilleren hvis `result_summary` indikerer seier (placement #1 / outcome win / flest skins) — ikke netto-best-ball-spilleren. **Bevis:** `lib/stats/clubStats.test.ts` («credits the stored per-mode winner», «matchplay credits the side that won», `isWinningSummary` skins-case) — 14/14 grønne.
- [x] Trukne spillere (`withdrawnAt != null`) telles verken i «Mest aktive» eller som vinner. **Bevis:** test «excludes withdrawn players from participation and winners».
- [x] Spill med heldekkende `null` `result_summary` setter `needsFallback` og krediterer vinneren `buildModeResultForGame` gir. **Bevis:** test «flags needsFallback…» + «uses fallback winners…»; fallback-sti i `page.tsx:108-140` (admin-klient → `buildModeResultForGame` → `computeResultSummaries` → `isWinningSummary`).
- [x] `computeLeaderboard`-løkka + `course_holes`/`scores`-bulk-fetchene er borte fra happy-path-en. **Bevis:** `page.tsx` importerer ikke lenger `computeLeaderboard`/`COURSE_HOLES_SELECT`/`SCORES_SELECT`; happy-path henter kun `games` + `game_players`.
- [x] `winnersSubtitle` + `mostActiveSubtitle` er tredjeperson + format-agnostiske i både `no.json` og `en.json`; ingen «best-ball-netto» eller «laget ditt»; humanizer-ren. **Bevis:** `no.json:291/294`, `en.json:291/294`.
- [ ] `/profile/statistikk` rendrer uten feil på staging (ingen 500), med riktige tall mot et kjent ferdig spill. *(Verifiseres i evaluator/staging-steget.)*

## Gates

- [x] `npx tsc --noEmit` passerer — rent (ingen output).
- [x] `npx vitest run lib/stats/clubStats.test.ts` passerer — 14/14. Full suite: 296 filer / 3902 tester grønne.
- [x] `npm run lint` passerer — rent på endrede filer.
- [x] PATCH-bump i `package.json` (1.133.82 → 1.133.83) + `CHANGELOG.md`-oppføring under åpen «1.133.y»-serie, i samme commit som fiksen.
- [ ] Staging spot-sjekk: boot mot `torny-staging`, åpne `/profile/statistikk`, verifiser at en kjent ikke-netto-runde krediterer riktig vinner. *(Pending — evaluator/staging.)*

## Files Likely Touched

- `app/[locale]/profile/statistikk/page.tsx` — bytt netto-løkka mot result_summary-lesing + fallback; legg til `withdrawn_at`-filter; utvid games-select med `game_mode, mode_config`; fjern hull/scores-fetch fra happy-path.
- `lib/stats/clubStats.ts` *(ny)* — `isWinningSummary`, `aggregateFinishedGame` (+ evt. `tallyClubStats`), typer.
- `lib/stats/clubStats.test.ts` *(ny)* — ren-logikk-tester (Type A): vinner-deteksjon per form, WD-eksklusjon, tie, needsFallback.
- `messages/no.json` + `messages/en.json` — `profile.statistikk.winnersSubtitle` + `mostActiveSubtitle`.
- `package.json` + `CHANGELOG.md` — PATCH-bump + oppføring.

## Out of Scope

- **Ytelse/caching/cap** (ubundet club-scale-fetch) → #869, må lande *etter* denne.
- **Personlig «Mine tall»-side + omdøp «Klubbstatistikker» → «Toppliste»** → #865.
- **Øvrig copy-opprydding** i `profile`-namespace (info-tag, hcp-feilmelding, eksport, emptyState em-dash) → resten av #873.
- **Bragder/badges, «du er her»-markering, sideturnerings-topp** → egne backlog-idéer fra statistikk-analysen.
- Ingen ny datafangst (GIR/fairway/putt finnes ikke i skjemaet).
