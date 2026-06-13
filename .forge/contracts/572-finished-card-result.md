# Spec: Vis spillerens eget resultat på avsluttede spill-kort (#572)

## Problem
Hvert kort under «Avsluttede spill» (Hjem + `/spill-arkiv`) viser samme 🏆-emoji uansett utfall.
Om du vant, ble nummer to, eller vant matchen din ser likt ut — resultatet er først synlig inne på
leaderboardet. Vi vil vise spillerens *eget* utfall direkte på kortet: «🥇 Du vant», «2. plass av 4»,
«Du vant 3&2», «4 skins», «🥇 Laget vant».

Utfordringen: resultater lagres aldri. `endGame` flipper bare `status='finished'` + `ended_at`.
Standings beregnes på render-tid i leaderboard-siden via `computeLeaderboard(ctx)` per modus (16 result-
former for 20+ modi). Å regne fullt leaderboard per avsluttet spill per sidevisning er for dyrt (Hjem +
arkiv lister mange kort). Derfor: **persistér et kompakt, strukturert per-spiller-resultat ved `endGame`**,
les det billig på kortet.

## Prior Decisions (carried forward)
- **i18n er live** (`app/[locale]`, `messages/no.json` + `en.json`, `catalogParity.test.ts`). Derfor:
  lagre **strukturert** sammendrag (tall/enums), aldri ferdig norsk streng — kortet formaterer via
  next-intl så engelsk-flaten (#60) får oversatt copy. (jf. 554/561/573 i18n-kontraktene.)
- **Supabase MCP** brukes til å lage/apply migrasjon og regenerere typer direkte mot prod
  (`reference_supabase_mcp`). Ikke be eier lime SQL.
- **`game_players` er allerede kilden** `getFinishedGamesForUser` leser (egen rad, RLS-trygt). Nytt felt
  der gir gratis lesetilgang for egen rad — ingen ny RLS-policy.
- **Matchplay-familien har bevisst ingen podium** (`project_matchplay_family_no_podium_no_reveal`) — utfall
  uttrykkes som «3&2», ikke plassering. Reflekteres i `matchplay`-summary-formen.

## Design

### Datamodell (min beslutning)
Ny nullbar kolonne `game_players.result_summary jsonb`. Strukturert diskriminert union:

```ts
type ResultSummary =
  | { kind: 'placement'; rank: number; fieldSize: number; isTeam: boolean }
  | { kind: 'matchplay'; outcome: 'win' | 'loss' | 'tie'; margin: string | null } // margin = "3&2"/"2 up", null ved AS
  | { kind: 'skins'; skins: number; rank: number; fieldSize: number };
```

`null` = ikke beregnet (modus uten støtte, eller gammelt spill før backfill) → kortet faller tilbake til 🏆.

### Per-modus mapping (mode-natural — eierens valg)
Beregnes fra `ModeResult` (diskriminert union fra `lib/scoring`), ikke re-derivert:

| Modus-gruppe | Summary | Kort viser |
|---|---|---|
| Individuell strokeplay/stableford/solo, wolf, nassau, nines, acey_deucey, round_robin, bingo_bango_bongo | `placement {isTeam:false}` | «🥇 Du vant» (rank 1) / «2. plass av 4» |
| Lag-strokeplay: best_ball, texas/ambrose/florida_scramble, shamble, patsome | `placement {isTeam:true}` | «🥇 Laget vant» (rank 1) / «Laget ble nr 2 av 4» |
| Matchplay: singles, fourball, foursomes, greensome, chapman, gruesome | `matchplay` | «Du vant 3&2» / «Du tapte 2&1» / «Uavgjort» |
| skins | `skins` | «4 skins» (+ 🥇/gull ved rank 1) |

`fieldSize` = antall individer (individuell) eller antall lag (lag-modus). `rank`/`tiedWith` finnes
allerede på alle ModeResult-linjer. For matchplay: utfall relativt til spillerens egen side; `margin` =
`result.formatted` («3&2»/«2 up»), `null` når `winner==='tied'` (AS).

### Vinner-emfase (eierens valg: gull + medalje)
Kortet markerer **din** seier med champagne-gull-accent + 🥇 når:
`placement.rank===1` (inkl. lag) **eller** `matchplay.outcome==='win'` **eller** `skins.rank===1`.
Alle andre utfall: dempet/muted tekst, ingen gull, ingen 🏆 (🏆 kun ved `null`-fallback).

### Beregnings-helper (ren TS, TDD)
Ny ren funksjon (Type A pure logic, jf. test-disiplin):
```ts
computeResultSummaries(result: ModeResult): Map<string /*userId*/, ResultSummary>
```
i `lib/scoring/` (ved siden av `index.ts`). Forbruker `ModeResult.kind` (switch over alle 16 former),
plukker `rank`/`fieldSize`/`result.formatted`/`totalSkins` per linje. Lag-modi mapper hver spiller på laget
til lagets `placement`. Modi uten meningsfull avslutning (om noen) → ekskluderes fra mappen (→ null → 🏆).

### Persistér ved finish
Delt server-helper `persistResultSummaries(adminClient, gameId)`:
1. Bygg `ScoringContext` for spillet (gjenbruk/ekstraher leaderboard-sidens kontekst-bygging — players m/
   course_handicap, holes, scores, + `wolfChoices`/`bingoBangoBongoHoles` der modusen krever).
2. `computeLeaderboard(ctx)` → `computeResultSummaries(result)`.
3. `update game_players set result_summary = … where game_id = … and user_id = …` per spiller (admin-
   client, RLS-bypass).
Kalles fra **begge** ende-spill-actionene rett etter status→finished:
`app/[locale]/admin/games/[id]/actions.ts` (`endGame`) og `…/avslutt/actions.ts`
(`endGameWithSideWinners`). Best-effort: feil i beregning skal **ikke** blokkere finish (try/catch +
`console.error`, samme mønster som Resend-helperne).

### Les + render på kortet
- `getFinishedGamesForUser`: utvid `FinishedGame` med `result_summary: ResultSummary | null` og ta med i
  select-en (`games!inner(…, game_players!inner(result_summary))` filtrert på samme `user_id`, eller hent
  feltet fra `game_players`-raden som allerede er join-roten). Behold slim projeksjon.
- `FinishedGameCard`: ny presentasjons-helper formaterer `result_summary` → lokalisert tekst + vinner-flagg.
  Erstatter 🏆-spanet. `null` → behold dagens 🏆.

### Backfill (eierens valg: dekk alle eksisterende)
Engangs-backfill av alle ferdigspilte spill:
- Migrasjons-fil i `supabase/migrations/` for kolonnen; **apply via Supabase MCP**.
- `scripts/backfillResultSummaries.ts` (tsx): admin-client (`lib/supabase/admin.ts`), looper alle
  `games.status='finished'`, kjører `persistResultSummaries` per spill, idempotent (overskriver trygt).
- Kjøres mot prod via Bash med service-role-env. **`.env.local` mangler i denne worktreen** — kopier fra
  hoved-repoet (`/Users/jdl/Dokumenter/GitHub/golf-app/.env.local`) inn i worktreen først (fikser også
  Playwright-env, jf. memory). Verifiser etterpå via MCP-SQL at 0 ferdig-spill-rader har `null` summary
  (for støttede modi).
- Regenerér `database.types.ts` (MCP `generate_typescript_types`) etter migrasjonen (#488 er allerede
  stale — denne PR-en bør ikke gjøre det verre).

## Edge Cases & Guardrails
- **Uavgjort matchplay (AS):** `outcome:'tie'`, `margin:null` → «Uavgjort», ingen gull.
- **Delt 1.-plass (tie for vinn):** `rank===1` for flere → alle får gull-«Du vant». Akseptabelt (de delte
  vinneren). Ikke vis «delt 1.» i denne iterasjonen.
- **Tilbaketrukne spillere (`withdrawn_at`):** ekskluderes fra standings allerede; `result_summary` forblir
  `null` → 🏆-fallback. Ikke vis «trakk seg» her.
- **Modus-config-varianter** (4BBB stableford team_size=2): bruk lag-placement (`isTeam:true`).
- **Manglende scores / pågående-aktig data ved backfill:** hvis `computeLeaderboard` ikke gir et endelig
  resultat (f.eks. tomt kort), hopp over spillet (la `null` stå) — ikke skriv søppel.
- **Beregning kaster:** try/catch i persist → spillet finishes uansett, summary forblir null.
- **i18n engelsk ordenstall:** bruk ICU `selectordinal` i `en.json` for «2nd place of 4»; norsk «2. plass av 4».
- **Lesesti billig:** ingen scoring-compute i `getFinishedGamesForUser` — kun kolonne-les.

## Key Decisions
- **Persist-at-endGame, ikke compute-on-read** — Hjem/arkiv må være billige; scoring er for dyrt per visning.
- **Strukturert jsonb, ikke ferdig streng** — i18n-krav; kortet formaterer per locale.
- **Gjenbruk `computeLeaderboard` → `ModeResult`** som eneste sannhetskilde, ikke ny per-modus mattelogikk.
- **Tre summary-former** (placement / matchplay / skins) dekker alle 20+ modi mode-naturlig.
- **Gull + 🥇 kun ved egen seier**, ellers dempet; 🏆 kun som null-fallback (brand: gull til vinnere).
- **Backfill alle eksisterende** via tsx-script + admin-client (eierens valg).

**Claude's Discretion:**
- Eksakt namespace/nøkkel-navn i messages-katalogene.
- Om kontekst-byggingen ekstraheres til delt helper eller dupliseres minimalt — velg minst risikofylt.
- Plassering av presentasjons-helper (i `FinishedGameCard.tsx` vs egen `lib/games/`-modul).
- Hvorvidt `fieldSize`/`rank` hentes fra ModeResult-linjer eller utledes — bruk det som finnes.

## Success Criteria
- [ ] `computeResultSummaries(result)` finnes som ren TS-helper med Type A-tester (`it.each` over alle
      ModeResult-former: placement-individuell, placement-lag, matchplay win/loss/tie, skins) — alle grønne.
      *Verifiser:* `npx vitest run` på testfila, grønn.
- [ ] Migrasjon legger `result_summary jsonb` (nullbar) på `game_players`, applied til prod, og
      `database.types.ts` inkluderer feltet. *Verifiser:* MCP-SQL viser kolonnen; `npm run build` kompilerer.
- [ ] Begge ende-spill-actionene (`endGame` + `endGameWithSideWinners`) kaller `persistResultSummaries` ved
      finish (best-effort). *Verifiser:* kode-referanse (file:line) + et nyavsluttet spill får non-null
      summaries (MCP-SQL eller Playwright på kort).
- [ ] `FinishedGameCard` viser mode-naturlig resultat: «🥇 Du vant» (gull) for egen seier, «2. plass av 4»
      muted ellers, «Du vant 3&2»/«Du tapte 2&1»/«Uavgjort» for matchplay, «N skins» for skins; 🏆 kun når
      summary er null. *Verifiser:* Playwright/preview-screenshot mot et avsluttet spill.
- [ ] Nye i18n-nøkler i **både** `messages/no.json` og `en.json`; `catalogParity.test.ts` grønn.
      *Verifiser:* `npx vitest run messages/catalogParity.test.ts`.
- [ ] Backfill kjørt: alle ferdig-spill-rader for støttede modi har non-null `result_summary`.
      *Verifiser:* MCP-SQL `count(*) … where g.status='finished' and gp.result_summary is null` ≈ 0
      (kun usupporterte/tomme spill igjen, dokumentert).

## Gates
- [ ] `npm run build` passerer (tsc — alle nye GameMode/ModeResult-switcher er uttømmende, jf.
      `feedback_tsc_gate_preexisting_trap`).
- [ ] `npx vitest run lib/scoring` + den nye testfila + `messages/catalogParity.test.ts` grønne.
- [ ] `npm run lint` rent på endrede filer.
- [ ] Playwright/preview: avsluttet-spill-kort rendrer korrekt badge (frontend touched).
- [ ] `humanizer:humanizer`-skill kjørt på de nye norske strengene før commit (copy-disiplin).

## Files Likely Touched
- `supabase/migrations/00XX_game_players_result_summary.sql` — ny kolonne (apply via MCP).
- `lib/database.types.ts` — regenerert (nytt felt).
- `lib/scoring/resultSummary.ts` (ny) + `lib/scoring/resultSummary.test.ts` (ny) — ren helper + tester.
- `lib/games/persistResultSummaries.ts` (ny) — server-helper (kontekst-bygg + compute + write, admin-client).
- `app/[locale]/games/[id]/leaderboard/page.tsx` — evt. ekstrahere kontekst-bygging (gjenbruk).
- `app/[locale]/admin/games/[id]/actions.ts` — kall persist i `endGame`.
- `app/[locale]/admin/games/[id]/avslutt/actions.ts` — kall persist i `endGameWithSideWinners`.
- `lib/games/getFinishedGamesForUser.ts` — utvid type + select med `result_summary`.
- `components/games/FinishedGameCard.tsx` — render badge + vinner-emfase + 🏆-fallback.
- `lib/games/finishedResultLabel.ts` (ny, evt.) — presentasjons-helper (summary → lokalisert tekst + flagg).
- `messages/no.json` + `messages/en.json` — nye resultat-nøkler.
- `scripts/backfillResultSummaries.ts` (ny) — engangs prod-backfill.
- `CHANGELOG.md` + `package.json` — MINOR bump (ny bruker-synlig feature).

## Out of Scope
- Endre leaderboard-/podium-flatene inne i spillet (kun kort-badgen).
- Vise delt-plass-nyanser («delt 2.»), tie-break-detaljer, eller mode-metrikk utover de tre formene.
- Side-turneringer (LD/CTP) på kortet.
- Cup/liga-aggregat-kort (kun frittstående game-kort her).
- Re-design av kort-layouten utover å bytte 🏆 mot badge (#570/#571 eier layouten).
