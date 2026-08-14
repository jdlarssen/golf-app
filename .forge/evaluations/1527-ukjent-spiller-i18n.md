# Evaluering: #1527 «Ukjent spiller» — fallback som påkrevd parameter

Evaluator: fersk kontekst, skeptisk. Branch `fix/1527-unknown-player-i18n`,
HEAD `068b016b`. Kontrakt: `.forge/contracts/1527-ukjent-spiller-i18n.md`.
Alle gates kjørt på nytt av evaluator (Node v22.23.0), ikke arvet fra builder.

## Verdikt: ACCEPT

Kode-kriteriene er oppfylt og reprodusert med egen evidens. Siste checkbox
(staging-verifisering) vurderes ikke her — den står fortsatt åpen.

## Per kriterium

### 1. Grep-sluttsjekk: kun roundReport- + planActions-konstanten igjen — PASS

Egen kjøring:
```
$ grep -rn "Ukjent spiller" app components lib --include='*.tsx' --include='*.ts' | grep -v test
lib/cup/planActions.ts:193:    unknownLabel: 'Ukjent spiller',
lib/games/generateRoundReport.ts:17:const PLAYER_FALLBACK = 'Ukjent spiller';
lib/games/roundReportFacts.ts:130:const PLAYER_FALLBACK = 'Ukjent spiller';
```
Nøyaktig 3 treff, identisk med kontraktens påstand (linjenumrene stemmer).
Utvidet repo-bredt søk (`.ts/.tsx/.mjs/.js`, uten node_modules/.next/tester)
gir de samme 3 — ingen gjenglemte treff i `e2e/`, `scripts/` eller `supabase/`.

### 2. Engelsk locale viser «Unknown player» på berørte flater — PASS (kode-siden)

Alle 6 app-kallsteder av `getCupSnapshot` sender en `t(...)`-verdi, ingen
konstant og ingen tom streng:
- `app/[locale]/cup/[id]/page.tsx:39` → `t('manage.unknownPlayer')`
- `app/[locale]/cup/[id]/resultater/page.tsx:43` → `unknownLabel` (fra `t`)
- `app/[locale]/admin/cup/[id]/CupManagement.tsx:196`
- `app/[locale]/admin/cup/[id]/oppsett/CupPlanSetup.tsx:75`
- `app/[locale]/admin/cup/[id]/generer/GenerateMatches.tsx:211`
- `app/[locale]/admin/cup/[id]/spillere/CupParticipants.tsx:68`

`computeCupPlayerPoints` + `computeCupUnderperformer` (begge kun kalt fra
`resultater/page.tsx:88,102`) får samme `unknownLabel`. `getCupCandidatePlayers`
får `unknownLabel` fra `CupParticipants.tsx:95`.

Namespace-kontroll (kritisk — feil namespace ville gitt fallback-nøkkelen):
- `RoundStartClient.tsx:22` → `useTranslations('liga.player.runde')`, bruker
  `t('unknownPlayer')` på linje 110. Nøkkelen ligger i samme objekt som
  `startButton`/`startPending` som komponenten alt bruker → den er garantert i
  klient-payloaden.
- `LeagueStandingsTable.tsx:106` → `useTranslations('liga.standings')`,
  `t('unknownPlayer')` på linje 168 OG 169 — samme nøkkel i begge grener,
  dubletten fra kontrakten er faktisk borte.

Staging-beviset mangler fortsatt (egen checkbox).

### 3. `liga.player.runde.unknownPlayer` i begge locales — PASS

```
no liga.player.runde.unknownPlayer = "Ukjent spiller"
en liga.player.runde.unknownPlayer = "Unknown player"
```
Bekreftet NY: samme oppslag mot `origin/main:messages/no.json` gir `undefined`.
`liga.standings.unknownPlayer` og `cup.manage.unknownPlayer` fantes fra før i
begge kataloger (verifisert).

Messages-diffen er nøyaktig 2 linjer, `git diff --numstat`:
```
1	0	messages/en.json
1	0	messages/no.json
```
0 slettede linjer → ingen reformatering av JSON-strukturen. `catalogParity`
grønn i vitest-kjøringen under.

### 4. `npm run typecheck` grønn — ekte enumerator-bevis — PASS

`TYPECHECK_EXIT=0` (egen kjøring, `tsc --noEmit`).

Required-param-designet er faktisk gjennomført — ingen av de nye parametrene
har default:
- `preferredName(p: CupRosterPlayer, unknownLabel: string)` — `computeCupPlayerPoints.ts:60`
- `CupPlayerPointsInput.unknownLabel: string` (ikke `?`) — `computeCupPlayerPoints.ts:52`
- `computeCupUnderperformer(input: { …; unknownLabel: string })` — `computeCupAwards.ts:114`
- `getCupSnapshot(tournamentId: string, unknownLabel: string)` — `getCupSnapshot.ts:200`
- `preferredName`/`formatSideLabel` i `getCupSnapshot.ts:175,187`
- `getCupCandidatePlayers(… opts.unknownLabel: string)` — `getCupCandidatePlayers.ts:53`
- `displayNameOf(u, unknownLabel)` i CupParticipants:37 og GenerateMatches:83
- `playerName(p, unknownLabel)` i LeagueStandingsTable:6
- `playerDisplayName(p, unknownLabel)` i RoundStartClient:10

Ingen `= 'Ukjent spiller'`-default noe sted (grep-verifisert: de 3 gjenværende
treffene er konstanter/verdi-argumenter, ikke default-parametere). Enumeratoren
er dermed ekte — tsc ville brutt på et glemt kallsted.

### 5. lint + vitest grønt, tester redigert på plass — PASS

```
$ npx vitest run lib/cup components/league messages/catalogParity.test.ts
Test Files  28 passed (28)   Tests  442 passed (442)   VITEST_EXIT=0
```
```
$ npx eslint <22 endrede filer>   → LINT_EXIT=0
✖ 3 problems (0 errors, 3 warnings)
  CupManagement.tsx:181 complexity 38
  lib/cup/actions.ts:87 createTournamentDraft complexity 30
  lib/cup/getCupSnapshot.ts:200 getCupSnapshot complexity 66
```
Alle tre er pre-eksisterende: `createTournamentDraft` (linje 87) er ikke rørt av
diffen i det hele tatt, og verken CupManagement- eller getCupSnapshot-diffen
legger til én eneste ny gren (if/&&/||/?:) — kun parameter-gjennomføring og
omflytting av `await`. getCupSnapshot-66 er sporet i #1522.

Test-diffen er stikkprøvd: filtrert diff (alle linjer minus de rene
`+ unknownLabel: 'Ukjent spiller',`-tilleggene) inneholder BARE
inline→flerlinje-reformatering av kall og de tre
`getCupSnapshot('t1')` → `getCupSnapshot('t1', 'Ukjent spiller')`. Ingen
`expect(...)` er rørt — assertions-semantikken er uendret. Ingen nye
copy-tester lagt til.

## Hull-jakt (utover kriteriene)

- **Kallsteder med tom streng eller feil nøkkel:** ingen. Alle 12 kallsteder av
  de endrede helperne gjennomgått; hver får enten en `t(...)` eller den bevisste
  `planActions`-konstanten.
- **`lib/cup/actions.ts` — bygger snapshot-navnene mail/persistering?** Nei,
  reprodusert med egen lesing av `finishTournament` (linje 309–470):
  `snapshot`/`finalSnapshot` brukes til (a) sidepoeng-gaten, (b) filtrering av
  active host-kamper, (c) `finalLeaderboard.team{1,2}Points` for vinner-team,
  (d) `finalTournament.name`. DB-skrivingen setter kun
  `status`/`finished_at`/`winner_team`. `sendCupFinishedNotification` får
  `tournamentName` + `playerFirstName` fra `loadTournamentParticipantEmails`
  (eget DB-oppslag), ikke fra snapshot-en. Ingen spiller-`displayName` fra
  snapshot-en når mail eller database. Påstanden holder.
- **`getTranslations` i en server-action:** trygt her — `i18n/request.ts` har
  eksplisitt server-action-grenen (root-param kaster E1014 → faller tilbake til
  `requestLocale`), og `lib/cup/planActions.ts` bruker allerede mønsteret.
- **Endret Promise.all-rekkefølge i de fire komponentene:** alle fire lest i
  helhet, alle binder fortsatt riktig:
  - `CupManagement` — `t` sekvensielt før snapshot; ingen annen parallell-jobb tapt.
  - `GenerateMatches` — `[t, locale]` parallelt, `locale` fortsatt bundet og brukt.
  - `CupPlanSetup` — `[t, locale]` parallelt; `locale` brukes i `redirect()` under.
  - `CupParticipants` — `[t, locale]` først, så `[getRoleContext, getCupSnapshot]`
    parallelt; `userId`/`isAdmin` er tilgjengelige på linje 95 der de trengs.
    Nettotap = `getRoleContext` starter etter to lokale oppslag; ikke målbart.
- **`computeCupMvp`-unntaket:** holdbart. Funksjonen leser kun
  `r.displayName` fra `CupPlayerPointsResult` (computeCupAwards.ts:80–88) — rader
  som `computeCupPlayerPoints` allerede har bygget MED labelen. Den konstruerer
  ingen fallback selv; en parameter der ville vært død.
- **`planActions`-konstanten:** verifisert at bare `candidate.id` og
  `candidate.pending` leses (planActions.ts:195–196); `displayName` når ingen
  skjerm. Konstanten er forsvarlig.
- **Notatfil:** `.changes/1527-ukjent-spiller-i18n.md` (type: fix, issue: 1527)
  plukkes opp av `node scripts/weekly-release.mjs --dry-run` uten feil
  (19 notater, bump 1.232.2 → 1.233.0).

## Observasjoner (ikke blokkerende, ingen findings)

- **Asymmetri i «labelen når ingen skjerm»-håndteringen:** `planActions.ts`
  bruker en norsk konstant med den begrunnelsen, mens `actions.ts`
  (`finishTournament`) bruker en full `getTranslations`-runde med nøyaktig samme
  begrunnelse. Begge er korrekte; valget er bare ikke konsistent. Kan ryddes ved
  neste berøring, ikke verdt en egen runde.
- `RoundStartClient` kaller `t('unknownPlayer')` inne i `.map()` per rad i stedet
  for én gang utenfor løkka. Mikroskopisk; ikke en defekt.

## Findings

Ingen.

## Åpent (ikke evaluert her)

- [ ] Staging-verifisering før merge: engelsk locale → liga-tabellen eller
      cup-deltakerlista med navnløs spiller. Vurderes separat.
