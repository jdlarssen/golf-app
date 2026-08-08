# Evaluering — 1540 cup-varsel til hele deltaker-settet

**Runde 1 · VERDIKT: ACCEPT** (med funn, se under)
Fresh-context evaluator, commit `f1f66e7c`, branch `claude/golf-app-issue-1540-a188ae`.

## Kriterier

Alle seks (K1–K6) PASS, verifisert uavhengig mot koden — ikke mot kontraktens egne
påstander. Evaluatoren re-bekreftet rotårsaken mot live prod-skjema med en read-only
`pg_policies`-spørring, og fant at diagnosen i issuet var *under*drevet: også `users`
SELECT er egen-rad/admin/medspiller-scopet, så FK-joinet til `users(email, …)` ble
avkortet i tillegg til `game_players`.

## Funn og hva som ble gjort

1. **should-fix — testen låste for lite. RETTET i denne PR-en.**
   Evaluatoren strippet `eq('tournament_id')`, tomt-`gameIds`-returen, dedup-settet og
   e-post-skippet — alle fire samtidig — og den første versjonen av testen passerte
   likevel. Reell konsekvens: en framtidig refaktor som mister cup-filteret ville hentet
   *hver* kamp i basen, og siden RLS-en ikke lenger er backstop, ville `cup_finished`
   blitt insertet for alle spillere i alle cuper. Testen har nå assertions på
   filter-argumentene, dedup og e-post-skip, og hver lås er falsifisert enkeltvis.

2. **should-fix (pre-eksisterende) — ignorerte `error` på begge oppslagene.**
   Begge spørringene destrukturerer bare `data`. En transient PostgREST-feil gir
   `recipients = []`, cupen avsluttes med `?status=finished`, null varsler sendes, og
   ingen loggslinje finnes. Uskillelig fra en cup uten spillere. Bærer uendret over fra
   den gamle helperen, så PR-en regresserer ingenting → egen issue.

3. **nit — `scripts/clone-cup-to-staging.mjs` finnes ikke.** Issue #1540s
   verifiseringsoppskrift navngir fila; `scripts/` inneholder bare
   `backfillResultSummaries.ts` og `loops/`. Meldt til økta som kjører generalprøven.

4. **nit (informativt) — `lib/cup/actions.test.ts` dekker bare `createTournamentDraft`.**
   Den passerer, men sier ingenting om denne fiksen. Den nye testfila er den eneste
   reelle låsen. Ingen handling.

5. **nit (skala-varsel) — uavgrenset fan-out i klubb-cup.** Klubb-cuper er ucappet
   (`lib/cup/limits.ts`), så en ~150-spillers cup gir en uavgrenset `Promise.allSettled`
   over ~150 `notify()`-kall + like mange Resend-sendinger. Ikke nytt — en global admin
   som arrangør ga allerede nøyaktig samme fan-out, siden `is_admin()` kortslutter
   RLS-en. Nå bare nåbart for en aktørklasse til → egen scale-triggered issue.

## Søsken-revisjon — ingen andre forekomster

Evaluatoren feide alle `games`/`game_players`/`league_players`/`group_members`-
aggregeringer som mater en varsel- eller mail-fan-out. **Ingen andre har feilen.**

- `lib/cup/sideAwardActions.ts:298-309` — identisk `tournament_id → gameIds →
  game_players`-spørring, bruker allerede admin-klienten. Frisk.
- `lib/cup/getCupSnapshot.ts:193` — admin-klient. Betyr også at vinner-utregningen i
  `finishTournament` aldri var avkortet. Er dessuten presedensen for formen valgt her:
  modulen henter admin-klienten selv og tar bare en id.
- `lib/mail/gameFinishedRecipients.ts:74`, `lib/games/notifyAchievementUnlocks.ts`,
  `lib/games/startScheduledGame.ts` — enkeltkamp-scopet på `game_id`, per-rad trygt.
- `lib/league/actions.ts` — **liga har ingen varsel- eller mail-fan-out i dag.** Mest
  sannsynlige gjentakelse: `requireAdminOrClubAdminOfLeague` slipper inn samme
  ikke-global-admin-arrangør. Den som legger til liga-varsler må starte på
  `getAdminClient()`.

## Sikkerhet — ren

`import 'server-only'` står øverst i modulen; eneste importør er `lib/cup/actions.ts`
(`'use server'`). Begge kallstedene kjører `requireAdminOrClubAdminOfCup` strengt før
helperen (`actions.ts:186` → helper `:251`; `:318` → helper `:428`), og gaten
`redirect('/')`-kaster ved avslag, så ingenting nedstrøms kjører. Ingen av actionene
returnerer mottakerlista til klienten — begge ender i `redirect(...)`. `notify()` var
allerede på admin-klienten, så det er ingen andre RLS-kollaps i mail-gatingen.
