# Kontrakt: Cup-opprydding etter #1472/#1501/#1502 (#1488)

**Issue:** #1488 · **Branch:** `claude/cup-cleanup-1488-2c3383` (står på origin/main)
**Scope-kilder:** issue-body (4 originalpunkter), evaluator-restfunn-kommentaren
(2026-08-07 18:25), eier-kommentar 5220790902 (2026-08-07 18:42, avledet-status), og
forge:auto-argumentene (mail-CTA-vurdering).

## Kontekst (ground truth lest i økta)

- `endGameWithSideWinners` (`app/[locale]/admin/games/[id]/avslutt/actions.ts`, 286
  linjer) er en verbatim tvilling av pipelinen i `lib/games/endGameCore.ts` + tre
  ekstra ansvar: formData-parsing av LD/CTP-vinnere, vinner-upsert FØR status-flip,
  og `sideWinners` i audit-payloaden. Konsumenter: admin- og spiller-avslutt-sidene
  (`avslutt/page.tsx` ×2) binder `(gameId, allowMissing, formData)`.
- Logg-drift i `endGameCore.ts`: linje 160 logger `[endGameCore]`, linje 252 logger
  `[endGame]` uansett caller. CLAUDE.md §Mail-debug greper `[endGame]`-prefikset.
- `getCupSnapshot.ts:321–326`: `allScorecardsSubmitted` krever ≥1 ikke-trukket spiller
  som alle har levert. To konsekvenser i dag: (a) en HELT trukket kamp kan aldri bli
  «levert» → ett-trykks-gaten i `lib/cup/actions.ts:378–385` tvinger «Avslutt likevel»
  selv om `endGameCore` ville avsluttet den direkte (WD-skip); (b) en AVLEDET kamp
  (`source_game_id` satt) har aldri egne `submitted_at` → viser «Pågår» hele veien
  (eier-funn fra prod-test av #1502).
- Gate-konsumentene: `lib/cup/actions.ts:378` (server) og `CupManagement.tsx:263–266`
  (banner-liste) — samme regel, to hjem i dag.
- `formatPoints` — 4 identiske kopier (`String(n).replace('.', ',')`): cup-siden,
  resultatsiden, `SideAwardsPanel.tsx`, `CupManagement.tsx`. (Issuet sa 3; grep fant 4.)
  Holes-views/league har EGNE formatPoints med annen semantikk — utenfor scope.
- `normalizeCustomSessions` + lokal `SESSION_FORMAT_IDS`-liste duplisert verbatim i
  `GenerateMatches.tsx:89–105` og `CupPlanSetup.tsx:24–40`; det tsc-uttømmende hjemmet
  for lista er `lib/cup/planValidation.ts:65` (`SESSION_FORMAT_SET`).
- `getCupEligibleFormats`/`CupEligibleFormat` (`lib/formats/getFormatsForIntent.ts:14,68`):
  eneste konsument er egen test (`getFormatsForIntent.test.ts:25,147–182`). Død.
- `'Match'`-fallback hardkodet 5 steder i 3 filer: `cup/[id]/page.tsx:143`,
  `resultater/page.tsx:172`, `CupManagement.tsx:265,268,479`.
- Reactions: `ReactionsProvider` (montert i `leaderboardContent.tsx:157`) har allerede
  en `disabled`-prop som ingen setter; ikke-deltakere på åpnede ferdig-kamp-leaderboards
  (#1468) kan tappe → server-action feiler stille på RLS (`expectAffected` kaster,
  console.error i provider). Leaderboard-siden (`page.tsx:131`) beregner `isParticipant`.
- README linje 27: «up to four matches» — taket er 16 (`lib/cup/limits.ts:18`).
  «twenty-four players» stemmer (`limits.ts:22`).
- Cup-mail-CTA (`cupFinishedNotification.ts:63`): `mailUrl(locale, '/cup/<id>')`.
  Snapshot-tester: `lib/mail/cupFinishedNotification.test.ts` + resend-contract.
- E2E: `e2e/cup/cup-lifecycle.spec.ts` har ett-trykks-test (@lifecycle) for ÉN
  host-kamp. Split-dag (2 host + 2 avledede, #1441-bunten) mangler committet vern —
  #1505-beviset brukte en engangs staging-driver.
- Kompleksitet (lint-tak 25, warn): `GenerateMatches` 34 — berøres av denne oppryddingen
  → splittes. `createCupMatchesFromPlan` 45 — berøres IKKE (regelen er «splitt ved
  neste berøring»); står igjen i issuet.

## Beslutninger (gråsoner avgjort her)

1. **Konsolidering** = utvide `endGameCore` med opsjoner i stedet for å beholde to
   pipelines: `sideWinners?: {category, position, winner_user_id}[]` (upsertes FØR
   status-flip; feil → ny result-reason `'db_winners'`), `auditExtras?:
   Record<string, unknown>` (merges inn i audit-payloaden), `logContext?: string`
   (default `'endGame'`; brukes i ALLE console.error-prefikser i core + som
   context-param til `notifyPlayersGameFinished`). `endGameWithSideWinners` blir en
   tynn wrapper: formData-parsing + vinner-validering (redirect-feilene
   `missing_ld_N`/`missing_ctp_N` består) → `endGameCore` → result→redirect-mapping.
   Signaturen `(gameId, allowMissing, formData)` er uendret — avslutt-sidene røres ikke.
2. **Withdrawn-gate:** «levert»-semantikken i snapshotet består (en kamp uten
   leveringer blir aldri «Scorekort levert», #1502). I stedet: nytt felt
   `allPlayersWithdrawn` (= `gPlayers.length > 0 && nonWithdrawn.length === 0`) på
   snapshot-matchen, og ETT delt gate-predikat i `lib/cup/` (f.eks.
   `matchBlocksOneTapFinish(m)`) brukt av BÅDE `finishTournament`-gaten og
   CupManagement-banner-lista. Helt trukket kamp passerer gaten; `endGameCore`
   avslutter den (WD-skip er allerede regelen der). Kamp uten spillere blokkerer
   fortsatt (ville uansett feilet med `no_players`).
3. **Avledet-arv (eier-kommentaren):** i `getCupSnapshot` beregnes levert-status per
   HOST-spill i en pre-pass; en avledet kamp slår opp `source_game_id` og arver
   verdien. Ren presentasjon — gaten ser fortsatt kun på host-kamper.
4. **Mail-CTA legges om** til `/cup/<id>/resultater`: mailen røper allerede resultatet
   i body (poeng + vinner), og cup-siden CTA-en peker på i dag SKJULER totalene
   (#1468) — knappen skal lande der resultatet bor. Snapshot-refresh (`npx vitest -u`)
   i egen test-commit.
5. **`'Match'`-fallback** → i18n-nøkkel `cup.matchFallback` med verdi «Match» i BEGGE
   locales (konsistent med genererte kamp-etiketter) — ren i18n-hygiene, ingen synlig
   endring.
6. **Reactions** → `leaderboardContent` får viewer-deltaker-status fra leaderboard-
   siden og setter `disabled` på `ReactionsProvider` for ikke-deltakere. Ingen ny
   copy, ingen RLS-endring.
7. **createCupMatchesFromPlan-splitten** står IGJEN etter denne runden — nevnes
   eksplisitt i closing-kommentaren (rest-punkt eller eget issue).

## Suksesskriterier (avkrysses KUN med evidens fra kjørte kommandoer/diff)

- [ ] **K1 — Én avslutningspipeline.** `app/[locale]/admin/games/[id]/avslutt/actions.ts`
  inneholder ingen egen kopi av pipeline-stegene (status-flip, finishDerivedGames,
  persistResultSummaries, persistScoreDifferentials, notifyAchievementUnlocks,
  rundereferat, notify/mail-blast, revalidering) — alt går via `endGameCore`.
  Evidens: fil-diff + grep som viser at pipeline-helperne kun importeres av core.
- [ ] **K2 — Vinner-oppførsel bevart.** Vinnere upsertes fortsatt FØR status-flip
  (delvis feil → spillet består som `active`, redirect `?error=db_winners`);
  `missing_ld_N`/`missing_ctp_N`-redirectene består; audit-payloaden har fortsatt
  `sideTournament: true` + `sideWinners`. Evidens: kode-lesing av ny wrapper + core
  med linjereferanser.
- [ ] **K3 — Logg-prefiks samlet.** Alle console.error i `endGameCore` bruker
  `[<logContext>]`; default `'endGame'`, sidevinner-stien `'endGameWithSideWinners'`.
  Ingen `[endGameCore]`-prefiks igjen. Evidens: grep i lib/games/endGameCore.ts.
- [ ] **K4 — Avledet kamp arver levert-status.** I snapshotet viser en avledet kamp
  «Scorekort levert» når host-kampen har alle ikke-trukne kort levert. Evidens:
  Type A-test på uttrekt/testbar logikk + e2e-assert (K9).
- [ ] **K5 — Helt trukket kamp blokkerer ikke ett-trykks.** Gate-predikatet bor ETT
  sted i `lib/cup/` og brukes av både `finishTournament` og CupManagement-lista; en
  aktiv host-kamp der alle spillere er trukket passerer gaten og avsluttes av løpet.
  Kamp uten spillere blokkerer fortsatt. Statusetiketten for helt trukket kamp forblir
  «Pågår». Evidens: Type A-tester på predikatet (edge-tabellen i notatfila) + grep som
  viser at begge konsumenter bruker samme eksport.
- [ ] **K6 — formatPoints har ett hjem.** Én eksport i `lib/cup/` med mikrotest; de 4
  lokale kopiene er borte. Evidens: grep `function formatPoints` i cup-filene = 0 treff.
- [ ] **K7 — normalizeCustomSessions har ett hjem.** Én eksport i
  `lib/cup/planValidation.ts` (gjenbruker `SESSION_FORMAT_SET`-uttømmeligheten); begge
  verbatim-kopiene + deres lokale `SESSION_FORMAT_IDS`-sett er slettet. Evidens: grep
  `SESSION_FORMAT_IDS` = 0 treff utenfor planValidation.
- [ ] **K8 — Død helper borte.** `getCupEligibleFormats` + `CupEligibleFormat` +
  tilhørende test-describe slettet. Evidens: grep = 0 treff i repoet.
- [ ] **K9 — Split-dag-vern committet.** `e2e/cup/cup-lifecycle.spec.ts` (eller
  søsterfil i `e2e/cup/`) har en `@lifecycle`-test som seeder en split-dag-bunt
  (2 host + 2 avledede), leverer alle kort, kjører ett-trykks-avslutningen og
  SQL-orakler at alle 4 spill + cupen er `finished` — og asserter (data-testid/oracle,
  aldri norsk copy) at avledede kamper viser levert-status før avslutning. Evidens:
  testkjøring mot staging (grønn) — doubler som staging-bevis for K4/K5-flyten.
- [ ] **K10 — Mail-CTA → resultatsiden.** `cupFinishedNotification` lenker
  `/cup/<id>/resultater` i html + text; snapshots refreshet i egen test-commit.
  Evidens: snapshot-diff viser kun URL-endringen.
- [ ] **K11 — Reactions inerte for ikke-deltakere.** `ReactionsProvider` monteres med
  `disabled` når vieweren ikke er deltaker; tap gjør ingenting (ingen server-kall).
  Evidens: kode-diff (prop-tråding page → leaderboardContent → provider) + staging-
  klikk som ikke-deltaker (ingen feil i console/network).
- [ ] **K12 — README-cap riktig.** «four matches» → seksten/16; «twenty-four players»
  verifisert mot `limits.ts` og beholdt. Evidens: diff.
- [ ] **K13 — GenerateMatches under taket.** Mekanisk splitt (uttrekk av plan/tee-
  resolve + empty-state) uten oppførselendring; eslint-complexity-warningen for
  `GenerateMatches` er borte. `createCupMatchesFromPlan` er bevisst urørt. Evidens:
  `npx eslint`-kjøring før/etter på fila.

## Gates (kjøres per chunk, alle før PR)

1. `npx tsc --noEmit`
2. `npx vitest run <changed>` for hver endret fil med co-located test + full
   `npx vitest run` før push
3. `npm run lint` (0 errors; K13-warningen skal være borte)
4. `npm run build` (T2-fullgate — fanger cacheComponents-feil tsc ikke ser)
5. e2e `@gate` mot staging kjøres av CI på PR-en
6. K9-testen kjøres eksplisitt mot staging (@lifecycle er ikke CI-gatet)

## Commit-plan (atomisk, alle med `Refs #1488`)

1. `refactor(games)`: K1+K2+K3 (konsolidering + logg-prefiks)
2. `fix(cup)`: K4 avledet-arv — patch-bump + CHANGELOG
3. `fix(cup)`: K5 withdrawn-gate + delt predikat — patch-bump + CHANGELOG
4. `refactor(cup)`: K6 formatPoints (+ evt. `'Match'`-fallback-i18n her eller egen commit)
5. `refactor(cup)`: K7 normalizeCustomSessions
6. `refactor(cup)`: K13 GenerateMatches-splitt
7. `fix(leaderboard)`: K11 reactions disabled — patch-bump + CHANGELOG
8. `fix(mail)`: K10 CTA — patch-bump + CHANGELOG
9. `test(mail)`: snapshot-refresh `[no-changelog]`
10. `chore(formats)`: K8 død helper
11. `docs`: K12 README
12. `test(e2e)`: K9 split-dag

## Utenfor scope (nevnes i closing-kommentar)

- `createCupMatchesFromPlan`-splitten (kompleksitet 45) — «ved neste berøring» står.
- Holes-views/league sine egne formatPoints-varianter (annen semantikk).
- Statusetikett for helt trukket kamp (forblir «Pågår» — bevisst, se Beslutning 2).
