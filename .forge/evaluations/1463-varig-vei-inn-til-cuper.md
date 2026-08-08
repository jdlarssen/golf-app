# Evaluering: Varig vei inn til cuper du har spilt eller laget (#1463)

Dato: 2026-08-08 · Evaluator: skeptisk forge-evaluering (fresh context)
Branch: `claude/golf-app-issue-1463-0145dd` · HEAD b1c8b2b2

## Verdikt: ACCEPT

## Kriterium-for-kriterium

Alle kriterier verifisert direkte mot koden på HEAD, ikke mot byggerens avkryssing.
Staging-observasjonene i kontrakten er byggerens påstander; kode-stien bak hvert
kriterium er verifisert selvstendig her.

| Kriterium | Verdikt | Bevis (selv funnet) |
|---|---|---|
| 1. Spilt-men-ikke-opprettet cup vises, lenker `/cup/[id]` | OK | `lib/cup/myCups.ts:83–88` (game_players → `games!inner(tournament_id)`, `.not(...is null)`); `myCups.ts:104–110` gir `/cup/[id]` når `created_by !== userId`; unit-test `myCups.test.ts:163–167` |
| 2. Utkast-roster uten kamper → rad med Utkast-chip + Klubbhus-tile | OK | `myCups.ts:79–82` (tournament_participants-kilden); `page.tsx:175–178` (`STATUS_TO_CHIP[cup.status]`, uendret chip-kode); `PlayerKlubbhus.tsx:73–94` (`cupCount = cupIds.length` fra samme union) |
| 3. Egne personlige cuper → `/admin/cup/[id]` uendret | OK | `myCups.ts:108` (`created_by === userId && group_id === null` → manage); test `myCups.test.ts:151–155` |
| 4. Klubbhus-raden ved kun spilte cuper; skjult ved 0 relasjoner (A1) | OK | `PlayerKlubbhusViews.tsx` (`{cupCount > 0 && ...}` rundt `player-cup-row`); pre-eksisterende K1-test `PlayerKlubbhus.test.tsx:32/50` (cupCount 0 → queryByTestId null) — kjørt grønn i denne økten |
| 5. Ferdig rad viser «{lag} vant» / delt; utkast/aktiv uendret | OK | `myCups.ts:117–124` (`status !== 'finished'` → null); `page.tsx:164–173` rendrer `cup.results.winner`/`cup.results.tied`. AVVIK (dokumentert i kontrakten): «Uavgjort» gjenbrukes i stedet for ny «Delt»-nøkkel — samme ord som cup-resultatsiden, akseptert |
| 6. Dedupe: splittet cup-dag = én rad; begge kilder = én rad | OK | `mergeCupIds` (`myCups.ts:42–55`, Set-basert, first-seen); tester «collapses a split cup day» + «dedupes the same cup across sources» + `getMyCupIds`-union med overlapp (`myCups.test.ts:73–117`) — kjørt grønne |
| 7. Admin-lista uendret (alle cuper, styringslenker) | OK | `fetchAllCups` (`page.tsx:39–48`) = samme query-form som før (ingen filter, created_at desc, limit 50); `cupLedgerHref` gir alltid `/admin/cup/[id]` for admin (`myCups.ts:108`, test `myCups.test.ts:144–148`). Merk: resultatlinja på ferdige rader vises også for admin — det følger av kontraktens Design punkt 3 (ikke rolle-scopet), ikke et brudd |
| 8. Tom-tilstand for ikke-admin → `/opprett-spill?intent=cup` | OK | `page.tsx:122–128` (rolle-ternary i emptyBody-lenka; admin beholder `/admin/games/new?intent=cup`) |

Authz-mønsteret spesifikt ettergått: admin-klienten i `fetchMyCups` (`page.tsx:63–69`)
brukes KUN på id-er avledet av brukerens egne rader — `created_by = session-userId`,
`tournament_participants.user_id = session-userId`, `game_players.user_id =
session-userId` (`myCups.ts:77–89`; userId fra `getRoleContext` → `auth.getUser()`,
`lib/admin/auth.ts:20–24`). Ingen inputs fra klienten når id-lista. Samme form som
`getCupSnapshot`-presedensen. Ingen writes i hele diffen.

## Gates

Kjørt selv på Node v22.23.0 fra worktree-rota:

| Kommando | Resultat |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 — 0 errors, 55 warnings (pre-eksisterende) |
| `npx vitest run lib/cup/myCups.test.ts "app/[locale]/admin/PlayerKlubbhus.test.tsx" messages/catalogParity.test.ts` | exit 0 — 3 filer, 23 tester grønne |

Ikke kjørt (per evaluerings-instruks): `npm run build` (allerede grønn), staging/prod.
Staging-klikkrunden i kontraktens gates er byggerens bevis; kode-stiene den dekker er
uavhengig verifisert over.

i18n: `playerCupRow` endret i BEGGE kataloger (no: «Cuper ({n})», en: «Cups ({n})»);
ingen nye nøkler, ingen døde nøkler (`cup.results.winner/tied` og `ledger.*` er
pre-eksisterende og i bruk); catalogParity grønn. Ingen norsk copy-assertions i
testene (data-testid brukes; norske strenger i `myCups.test.ts` er fikstur-data, ikke
katalog-assertions). Test-disiplin: Type A-fil for ny logikk, ingen ny render-test
(K1 var pre-eksisterende), ingen «mens jeg var her»-tester. Versjon 1.230.0 → 1.231.0
(feat → minor, korrekt) + CHANGELOG-linje i Funksjoner. Alle commits atomiske med
`Refs #1463`. Ingen scope-krype: diffen rører kun kontraktens filliste (+ helper i
`lib/cup/myCups.ts` i stedet for foreslått `getMyCupIds.ts` — eksplisitt Claude's
discretion i kontrakten).

## Funn

1. **Nit (kant-i-kanten):** En utkast-roster-deltaker i en KLUBB-cup som ikke (lenger)
   er klubbmedlem får en rad som lenker `/cup/[id]`, men gaten der slipper bare inn
   klubbmedlemmer, game_players-deltakere og admin (`lib/cup/cupPageAccess.ts:40–44`
   — rosteret bygges av game_players alene, `lib/cup/getCupSnapshot.ts:353–365`) →
   notFound. I praksis svært smalt: klubb-cup-rostere kan bare fylles med gyldige
   klubb-kandidater (`lib/cup/planActions.ts:189–195`), så det krever at et medlem
   forlater klubben mens cupen står i utkast. Kontraktens kanttilfelle «klubb-cup-
   deltaker uten medlemskap» holder for game_players-deltakere (gatens roster dekker
   dem). Kan ev. tas som egen liten issue: la `canViewCupPage` også sjekke
   `tournament_participants`.
2. **Nit:** Lese-feil sluses stille til tom liste (`data ?? []` i `myCups.ts:92–94` og
   `page.tsx:47/69`) — en feilende kilde krymper lista uten signal. Samme holdning
   som koden hadde før endringen (og tryggere enn notFound-fella fra #1442); nevnes
   for ordens skyld, ikke et regressjonspunkt.

Ingen blokkerende funn.

## Konklusjon

Alle åtte suksesskriterier er kodeverifisert, gates kjørt grønne i økten, authz-mønsteret er korrekt selv-radavledet, og de to funnene er marginale kanttilfeller som ikke blokkerer — arbeidet aksepteres.
