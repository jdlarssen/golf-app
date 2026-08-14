# Kontrakt: #1631 — «Hull for hull» følger source_game_id-redirecten

**Issue:** [#1631](https://github.com/jdlarssen/golf-app/issues/1631)
**Branch:** `claude/1631-holes-drilldown-source-redirect`
**Type:** fix (bruker-synlig → `.changes/`-notat + staging-verifisering før merge).
Ingen produktvalg: én riktig oppførsel, samme regel som søsken-flatene allerede har.

## Rotårsak (builder-verifisert mot staging i issuet)

`fetchHolesAndScores` (`app/[locale]/games/[id]/leaderboard/holes/holesData.ts:92–96`)
henter scores med `.eq('game_id', gameId)`. En AVLEDET kamp i splittet cup-dag
(`games.source_game_id` satt, f.eks. «Singel N») eier 0 egne score-rader — hosten
holder alle. Drilldownen er derfor tom, også for de to som spilte matchen.

Søsken-flatene har allerede regelen: `leaderboardContent.tsx:153` og
`export/route.ts:103` bruker `source_game_id ?? gameId` (#1441 D3). Samme figur
finnes med tester i `lib/games/getRoundScoresForGames.ts`.

## Drift-tabell (sjekket mot HEAD 390fbb5d)

| Issue-påstand | HEAD-status |
|---|---|
| holesData.ts:100 henter på gameId | Stemmer (linje 92–96, scores-fetch i Promise.all) |
| fetchHolesAndScores :74–107 | Stemmer (:75–108) |
| Søsken-flater bruker `?? gameId` | Stemmer (leaderboardContent:153, export/route:103) |

## Avgjørelser

- **D1 — løses i `fetchHolesAndScores`, ett hjem for alle 10+ format-grener.**
  `gwp.game` inneholder allerede `source_game_id` (SELECT-en i
  `getGameWithPlayers.ts:220`). Await gwp FØRST (cache-hit — ytre side varmet den),
  deretter holes+scores parallelt med `scoresGameId = gwp.game.source_game_id ?? gameId`.
  Ingen signaturendring, ingen ekstra fetch.
- **D2 — klienten røres IKKE.** Drilldownen leser fortsatt med brukerens klient
  (RLS). #1632 (service-role vs RLS-inkonsistensen) er en separat eierbeslutning.
  RLS slipper match-spillerne inn (de er game_players på host-kampen) og
  cup-deltakere via 0161 (#1550).
- **D3 — utenfor scope:** #1602 (front9-segmentets hull-løfte) og #1632.

## Suksesskriterier

- [ ] **S1:** Ny test `holesData.test.ts` (samme mock-idiom som
      `getRoundScoresForGames.test.ts`): avledet spill → scores hentes på host-id;
      host-spill (`source_game_id = null`) → egen id (byte-identisk oppførsel).
      RED først, GREEN etter fiks.
- [ ] **S2:** Gates grønne: `npx vitest run app/[locale]/games/[id]/leaderboard/holes/`
      + `npm run build` (Node 22, pipefail).
- [ ] **S3:** Staging-klikkrunde: åpne «Hull for hull» på en avledet kamp i den
      klonede cupen → fylt per-hull-tabell; host-kamp drilldown uendret.
      Bevis-kommentar + `staging-verified`-label på PR.
- [ ] **S4:** `.changes/1631-*.md`-notat (type fix) følger malen.

## Gates

- `npx vitest run "app/[locale]/games/[id]/leaderboard/holes/"` (ko-lokaliserte)
- `npm run build` (fanger exhaustive-switch/typedrift; pipefail-fella)

## Edge-case-tabell

| Input-klasse | Forventet |
|---|---|
| Host-spill (source_game_id null) | `?? gameId` no-op — byte-identisk |
| Avledet kamp, scores på host | Fylt tabell (fiksens kjerne) |
| Avledet kamp, host uten scores | Tom tabell som i dag (ingen rader finnes) |
| gwp mangler (spill slettet) | `notFound()` som før (uendret gren) |
| RLS nekter leseren | Tom liste som i dag — D2, ikke i scope |
| Segment-spill (front9/back9) | Uendret — hull-filtrering skjer i view-laget (#1602 åpen) |
| Mange samtidige formater | Ett hjem: alle grener går via fetchHolesAndScores |
| Feil fra PostgREST | `throw` som før (error-propagering uendret) |
