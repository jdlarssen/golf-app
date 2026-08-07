# Evaluering: Cup-opprydding #1488 — `claude/cup-cleanup-1488-2c3383`

## Verdikt: ACCEPT

Uavhengig etterprøvd 2026-08-07 mot `origin/main`. Alle 13 kriterier bekreftet med
egne kommandoer (diff, grep, tsc, lint, vitest). Ingen blokkerende funn. Ett ikke-
blokkerende minor-funn (dobbel game-fetch på sidevinner-stien — ren effektivitet, ikke
oppførselsavvik).

Endringssett: 12 kode/innholds-commits (`cc6ec917`…`c7a3ff86`) over origin/main,
1028 innsettinger / 439 slettinger, 32 filer.

---

## Per kriterium

### K1 — Én avslutningspipeline · BEKREFTET
`app/[locale]/admin/games/[id]/avslutt/actions.ts` er redusert fra 286 → 135 linjer og
er nå en ren parse/valider/deleger-wrapper. Egen grep i fila etter pipeline-helperne
(`persistResultSummaries|persistScoreDifferentials|notifyAchievementUnlocks|generateAndPersistRoundReport|finishDerivedGames|buildGameFinishedRecipients|notifyPlayersGameFinished|logAdminEvent|sendGameFinishedNotification`)
= 0 treff. Importlista inneholder kun `redirect/getLocale/getServerClient/requireAdminOrCreator/endGameCore+EndGameSideWinner/GameStatus` — ingen døde revalidate-importer. Hele pipelinen bor i `lib/games/endGameCore.ts`.

### K2 — Vinner-oppførsel bevart · BEKREFTET
Sammenlignet `git show origin/main:...avslutt/actions.ts` mot ny wrapper + core, linje for linje:
- **Feilrekkefølge identisk:** not_active (wrapper, før parsing) → missing_ld/ctp (wrapper) → no_players / not_all_submitted / not_all_approved (core) → db_winners (core, FØR flip) → db_finish (core). Alle redirect-mål byte-identiske: `db_winners`→`${wizardPath}`, resten→`${detailPath}?error=<reason>`, suksess→`${detailPath}?status=finished`.
- **Vinnere FØR status-flip:** `endGameCore.ts:204–224` upserter `game_side_winners` (onConflict PK) og returnerer `db_winners` uten flip ved feil → spillet består `active`. Bekreftet.
- **Audit-payload:** core linje 273 `{ gameName, ...auditExtras }`, wrapper linje 117 sender `{ sideTournament: true, sideWinners: winners }` → payload byte-identisk med gammel `{ gameName, sideTournament: true, sideWinners }`. (`...undefined` i object-spread er lovlig no-op for vanlig endGame-stien.)
- **Peer-approval-gaten** ikke relaksert (core linje 194); `allowMissing` hopper kun over ikke-leverte.
Se minor-funn #1 for eneste mekaniske avvik (dobbel fetch, ikke observérbart).

### K3 — Logg-prefiks samlet · BEKREFTET
`grep "endGameCore]" lib/games/endGameCore.ts` = 0 treff (gammel kode logget `[endGameCore]` på status-flip-feil, `[endGame]` på mail-feil — drift borte). Alle 4 `console.error` i core bruker nå `` `[${logContext}]` ``; default `'endGame'`, sidevinner-wrapper sender `'endGameWithSideWinners'`, og `logContext` sendes videre som notify-context til `notifyPlayersGameFinished` (linje 287). tsc + vitest grønt.

### K4 — Avledet kamp arver levert-status · BEKREFTET
Ny ren helper `lib/cup/matchSubmissionStatus.ts::computeSubmissionStatusByGame` — to-pass: host-status i pre-pass, avledet (`sourceGameId != null`) slår opp host og arver (`ownStatus.get(sourceGameId) ?? own`). `getCupSnapshot.ts` bygger mappen og leser `submissionStatusByGame.get(game.id)!` for BÅDE `allScorecardsSubmitted` og `allPlayersWithdrawn`. Verifisert uavhengig at getCupSnapshot-loopen IKKE filtrerer bort avledede (ingen `source_game_id`-continue-guard) → derived rendres som egne kort. Type A-test (16 tester) dekker host-true/false-arv + orphan-fallback. Grønt.

### K5 — Helt trukket kamp blokkerer ikke ett-trykks · BEKREFTET
`matchBlocksOneTapFinish` bor i `lib/cup/matchSubmissionStatus.ts`; egen grep viser NØYAKTIG to funksjonelle konsumenter: `lib/cup/actions.ts:381` (finishTournament-gaten) og `CupManagement.tsx:262` (banner-lista) — pluss én ren doc-referanse i computeCupLeaderboard.ts:60. Predikatet: `!(allScorecardsSubmitted ?? false) && !(allPlayersWithdrawn ?? false)`. Edge-tabell verifisert: 0 spillere→blokkerer (`no_players` består), alle trukket→passerer (WD-skip), delvis→korrekt. Etikett for helt trukket kamp: `cupMatchStatusKey` får kun `allScorecardsSubmitted:false` → forblir «Pågår» (`allPlayersWithdrawn` ikke sendt til label). Type A edge-tester grønne.

### K6 — formatPoints har ett hjem · BEKREFTET
`lib/cup/formatPoints.ts` + mikrotest (5 cases). Grep `function formatPoints` i `app/[locale]/cup` + `app/[locale]/admin/cup` = 0. De 4 kopiene borte: cup-siden, resultatsiden, `SideAwardsPanel.tsx`, `CupManagement.tsx` importerer nå felles. Holes-views (AceyDeucey/Nines/SoloStableford) beholder EGNE formatPoints — korrekt, annen semantikk, utenfor scope per kontrakt.

### K7 — normalizeCustomSessions har ett hjem · BEKREFTET
Flyttet til `lib/cup/planValidation.ts:88`, gjenbruker `isCupSessionFormat` som slår opp mot `SESSION_FORMAT_SET` (`Record<CupSessionFormat, true>` — tsc-uttømmende). Grep `SESSION_FORMAT_IDS` utenfor planValidation = 0. Begge kopiene (`GenerateMatches.tsx`, `CupPlanSetup.tsx`) + deres lokale sett slettet, importerer nå fra planValidation. Ny Type A-describe (3 tester) grønt.

### K8 — Død helper borte · BEKREFTET
Grep `getCupEligibleFormats|CupEligibleFormat` i app/lib/e2e = 0. `getFormatsForIntent.ts`: både typen, den cachede funksjonen og test-describen + `buildCupChain`-helperen slettet. tsc grønt (ingen dinglende `getAdminClient`-import).

### K9 — Split-dag-vern committet · BEKREFTET (kode) / builder-kjørt (staging)
`e2e/cup/cup-lifecycle.spec.ts` ny `@lifecycle`-test (commit `15fda5f5`): seeder 2 host (front9/back9, `source_game_id NULL`, levert) + 2 avledede (`source_game_id`→host, ikke levert på egne rader), asserter via **språk-uavhengig `data-status='scorecardsSubmitted'`-orakel** (aldri norsk copy) at avledede leser levert FØR avslutning, ett-trykk, SQL-orakel at alle 4 spill + cup = `finished`. Meningsfulle orakler. Testen er `@lifecycle` (IKKE `@gate`), så CI kjører den ikke — grønn status hviler på builderens staging-kjøring (14.4s). Ikke re-kjørt (dyr + login-rate-limit; kontrakten sanksjonerer dette). Se minor-funn #2.

### K10 — Mail-CTA → resultatsiden · BEKREFTET
`cupFinishedNotification.ts:63`: `mailUrl(locale, '/cup/${id}/resultater')`. Snapshot-diff (`cupFinishedNotification.test.ts`) = KUN URL-linjene, `/cup/<id>` → `/cup/<id>/resultater`, i både text og html, begge locales. Snapshot-refresh i egen test-commit `e11d10c1` (`[no-changelog]`). vitest lib/mail grønt.

### K11 — Reactions inerte for ikke-deltakere · BEKREFTET
Prop-tråding verifisert ende-til-ende: `page.tsx:170` sender `reactionsDisabled: !isParticipant` → `leaderboardContent.tsx` → `<ReactionsProvider disabled=...>`. Provider `toggle` no-oper ved `disabled` (linje 133, ingen optimistisk update, ingen server-kall). I tillegg leser `RowReactionsForPlayer` `ctx.disabled` → `RowReactions` rendrer native `<button disabled>` (+ `disabled:opacity-40`, `showPalette = expanded && !disabled`). Belte-og-bukseseler: både native disabled OG toggle-guard. Backer builderens staging-probe (0 POST).

### K12 — README-cap riktig · BEKREFTET
README linje 27: «up to four matches» → «up to sixteen matches». «twenty-four players» beholdt. Stemmer mot `lib/cup/limits.ts` (MAX 16 matches, 24 players).

### K13 — GenerateMatches under taket · BEKREFTET
Mekanisk splitt: `resolvePlanCourseTee` (byte-identisk uttrekk av bane/tee-resolve) + `GenerateMatchesEmptyStateCards` (de to betingede kortene). `npm run lint` etter: `GenerateMatches` er BORTE fra complexity-warnings (før 34>25). `createCupMatchesFromPlan` (generer/actions.ts:169) står igjen på 45 — bevisst urørt per Beslutning 7 / «utenfor scope».

---

## Gates (egne kjøringer, Node 22.23.0)

| Gate | Kommando | Utfall |
|---|---|---|
| tsc | `npx tsc --noEmit` | **EXIT 0** |
| lint | `npm run lint` | **0 errors**, 53 pre-eksisterende complexity-warnings; `GenerateMatches` IKKE blant dem |
| vitest (målrettet) | `npx vitest run lib/cup lib/games lib/mail lib/notifications lib/formats` | **111 filer / 1731 tester grønne** |
| build | ikke kjørt (kontrakt: hovedchat bekreftet BUILD EXIT 0) | — |
| e2e @lifecycle | ikke re-kjørt (dyr + rate-limit; kode korrekt) | builder: grønn 14.4s |

Prosess-disiplin: version 1.227.1 → 1.227.5 (4 bruker-synlige fixes: K4/K5/K10/K11),
CHANGELOG 4 nye linjer i eierens produktspråk, forge-check-off-commit `c7a3ff86` rører
kun kontrakt-md-en (ingen produktkode).

---

## Funn

### Minor #1 (ikke-blokkerende) — `app/[locale]/admin/games/[id]/avslutt/actions.ts` + `lib/games/endGameCore.ts` · K1/K2
Sidevinner-stien gjør nå TO `games`-fetcher: wrapperen henter slim
(`id, status, side_ld_count, side_ctp_count`) for slot-parsing + status-forsjekk, deretter
henter `endGameCore` full game-rad på nytt. Gammel inline-action gjorde én fetch. Ikke et
oppførselsavvik — begge not_active-sjekkene redirecter til samme mål, og en race mellom de
to fetchene i samme request er praktisk umulig. Ren ekstra DB-rundtur på en sjelden admin-
handling. Kan senere fjernes ved å la wrapperen sende slot-count videre, men ikke verdt en
egen endring nå.

### Minor #2 (notat, ikke-blokkerende) — `e2e/cup/cup-lifecycle.spec.ts` · K9
Split-dag-testen er `@lifecycle`, ikke `@gate` — CI kjører den ikke. Grønn-beviset er
builderens engangskjøring mot staging. Testkoden er korrekt og velformet (data-testid/
SQL-orakler, ingen norsk copy), og K4-dataarven er uavhengig verifisert i kildekoden, så
dette er kun en deknings-nyanse (vernet fanger regresjon kun når noen kjører `e2e:lifecycle`,
ikke per-merge). I tråd med kontraktens eksplisitte @lifecycle-begrunnelse.
