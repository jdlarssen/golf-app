# Evaluering: Native N3 — spillerflatene (#1825)

Evaluator: fersk-kontekst forge-evaluator, 2026-08-30 (kveld).
Kontrakt: `.forge/contracts/1825-native-n3-spillerflatene.md`. Alle porter re-kjørt
uavhengig (Node 22); kode lest mot kilden; staging lest med service-role (kun SELECT);
simulator inspisert live. Sjekkboksene i kontrakten ble behandlet som påstander, ikke bevis.

## Porter (re-kjørt av evaluator)

| Port | Resultat | Exit |
|---|---|---|
| `npx jest` (native/app) | 11 suiter / 85 tester passed | 0 |
| `npx tsc --noEmit` (native/app) | grønn | 0 |
| `npx eslint native/app` (repo-rot) | grønn | 0 |
| `npm run typecheck` (rot) | grønn | 0 |
| `npx vitest run lib/sync lib/scoring` (rot, pipefail) | 55 filer / 1303 tester passed | 0 |
| `npm run build` (rot) | AKSEPTERT fra hovedøkta (dyr, alt bevist samme dag) | (0) |
| `npx expo export --platform ios` | AKSEPTERT fra hovedøkta (samme grunn) | (0) |

## Per kriterium

### 1. Test-harness — PASS

- `npx jest` grønn: 11 suiter / 85 tester, exit 0 (egen kjøring).
- Harness som kontrahert: `jest.config.js` med `preset: 'jest-expo'`,
  `moduleNameMapper` `expo-sqlite` → `src/test/sqliteMock.ts` (better-sqlite3
  in-memory, `$`-prefiks strippes) og `@/*` → repo-rot. Deps:
  `jest-expo@~57.0.5`, `better-sqlite3@^13`, `@testing-library/react-native@^14`.
- Dekningen er substansiell, ikke smoke:
  - writeScore: merge (utelatt bevarer / null nuller, `writeScore.test.ts:24`),
    strengt økende `clientUpdatedAt` (`:69`, `:103`), kø-erstatning (`:126`),
    atomisk score+kø (`:152`).
  - drainQueue: applied (`syncWorker.test.ts:67`), server-wins m/ konfliktrad
    (`:95`), #1457 mid-flight (re-tasting MENS RPC står ute → køen beholdes,
    verdien urørt, `:135`), transient retry (`:159`), #668 abandon (karantene ved
    5. forsøk + at neste drain IKKE rører den — `rpc` kalt nøyaktig 1 gang,
    `:181`), foreldreløst kø-element (`:225`).
  - mergeServerScore: ekko-drop via `it.each` — BÅDE eldre OG likt tidsstempel →
    `kept-local`, ingen konfliktrad (`realtime.test.ts:58–81`); nyere vinner m/
    konfliktrad + kø-rad fjernes (`:83–106`); annen-enhets-regelen (`:108`);
    null-sesjon-fallback (`:136`).
  - playerActions: 0-rader splittet i idempotent-suksess vs. FEIL for alle tre
    handlingene (`playerActions.test.ts:137/158/216/232/248/329/345`), status-vakt
    `it.each` over draft/finished/scheduled for alle tre (`:98–101/263/366`),
    trukket spiller (`:108`), 500-tegns-kutt (`:318`).
  - computeState-speilet (`primaryCtaState.test.ts`), bundle-cache round-trip
    (`gameBundle.test.ts`), v1→v2-migrasjonstest med rigget v1-base
    (`db.test.ts:39`), ÉN Hole-render-test (Type C-taket holdt).

### 2. Hjem — PASS (substans verifisert; øktas skjermbilder ikke tilgjengelige)

- Live simulator (820CA940, app `no.tornygolf.dev` installert): Hjem viser
  «PÅGÅR NÅ» med TEST-Cup Singel ×2, TEST-GoldenPath, Byneset North 3. juli (+
  flere under folden) — kryssjekket mot service-role-les av spillerens
  (252e1a6f) aktive spill: kortene er samme mengde i samme seksjon (6 aktive i
  DB, 5 synlige over folden, lista scroller). Bane + «Fortsett»-badge per kort.
- Kort → GameHome verifisert live: GoldenPath-kortet åpnet GameHome med navn,
  «Pågående · Byneset North · Men's 54», frosset banehandicap 18 og CTA.

### 3. Hull-føring lokal-først — PASS

- Appens live-skriv står på staging nøyaktig som bokført: scores-raden
  (9df7b9e0 / 252e1a6f / hull 2) = strokes 3, putts 2, `entered_by` =
  spilleren selv, `client_updated_at` 2026-08-30T17:52:15.265Z (appens stempel —
  millisekund-presisjon, RPC-vei). Uavhengig service-role-les.
- Putts-bevarer-slag er kodeverifisert: `Hole.tsx:146–152` sender KUN `putts`
  (kommentar `:144–145` forklarer hvorfor), og `writeScore.ts:66–68` merger
  (`undefined` bevarer). Slag-tasting sender kun `strokes` (`Hole.tsx:121–127`).
  Begge drainer etter hver tasting (`drainQueue('tasting')`, `:129/:154`) — som web.
- Flight-speilet: `roster.ts:55–65` bruker delt `isSingleFlightGame` (wolf +
  ≤4 aktive håndteres inni den, `lib/games/flightScope.ts:47–53`),
  `flight_number == null`-fallback og trukket-filter — linje for linje samme
  semantikk som webbens `resolveFlight` (`holePagePlayers.ts:32–45`).
- Realtime-mottak: kodevei + jest (`applied`-utfallene); selve live-demoen
  (ekstern RPC → UI u/reload) er øktbundet, men Bjørn-radens tidslinje på
  staging (restaurert til 3 kl. 17:58:38 etter 6-skrivet 17:52:43) er konsistent
  med det bokførte kjøret.

### 4. Scorekort + lever — PASS

- Layout/netto: `Scorecard.tsx:101–115` — par per `tee_gender` via delt
  `parForPlayer`, tildelte slag via delt `strokesForHole`, netto = brutto − extra.
- Kø-vakten: drain FØRST (`:66–72`, kommentaren sier rekkefølgen er poenget),
  submit blokkeres mens `queued > 0` (`:137`) med delt `isActiveForGame` (`:61`);
  manglende hull → `Alert.alert`-bekreftelse (`:142–149`), aldri hard blokk.
- `canSubmit` re-sjekker status/levert/trukket/format (`:118–122`), og
  `submitScorecard` re-sjekker status i selve kallet (se kriterium 5-notatet).
- Levert-tilstanden på staging er ryddet (se opprydding under), og GameHome
  viser nå live «Fortsett runden — 1 av 18 hull ført» — CTA-maskinen
  re-deriverer korrekt fra den nullstilte staten. Konsistent med bokført løp.

### 5. Godkjenn — PASS

- `playerActions.ts` holder trap 2 ufravikelig: alle tre UPDATEs chainer
  `.select('user_id')` gjennom delt `expectAffected`
  (`lib/supabase/affectedRows.ts`) — submit `:108–120`, approve `:153–168`
  (m/ `submitted_at IS NOT NULL AND approved_at IS NULL`-filter i selve
  UPDATE-en), reject `:206–222` (m/ levert-filter, #1395).
- 0 rader splittes ærlig i `resolveZeroRows` (`:241–257`): måltilstand →
  `alreadyDone`, ellers `{ok:false, reason:'no-rows'}` — jest-låst for alle
  tre handlingene.
- `refuseUnlessActive` (`:55–64`) gater alle tre på `games.status === 'active'`
  — kommentaren `:44–52` forklarer nøyaktig fella den stenger (finished-spill
  ville sett ut som `alreadyDone`).
- `NO_REJECTION_REASON` importeres fra SAMME modul webben bruker
  (`lib/games/rejectionReason.ts`, brukt av webbens `approve/actions.ts`) —
  identisk per konstruksjon.
- Approve-skjermen bruker delt `pendingApprovalsFor`/`canApproveScorecardFor`
  (via `roster.ts:68–89`); selv-godkjenning umulig i lista (delt regel,
  `flightScope.ts:148`).
- Live simulator viste Godkjenn-skjermens ærlige tom-tilstand («Ingenting å
  godkjenne akkurat nå») — konsistent med opprydningen.

### 6. Web urørt + porter — PASS

- `git diff origin/main --name-only`: 42 filer, ALLE under `native/app/**`,
  `docs/native/**` eller `.forge/**` (grep-invers = tomt).
- `git diff origin/main -- lib/` = 0 linjer.
- Delingsmekanismen holdt: alle beslutningsmoduler importeres fra repo-kilden
  (relative stier — flightScope, status, activeCardState, affectedRows,
  rejectionReason, conflict, mergeServerScore, classifyError, queueScope,
  strokeAllocation, parDisplay, modes/types). Ingen kopier funnet
  (grep etter lokale re-definisjoner av de delte funksjonsnavnene = 0 treff).
- Speilene som IKKE kunne deles er verifisert mot kilden:
  - `computePrimaryCtaState` (`primaryCtaState.ts:20–40`) ≡ webbens
    `computeState` (`PrimaryCta.tsx:18–35`) — samme grener, samme rekkefølge.
  - Format-gaten (`formatGate.ts:23–37`): `modeCollapsesToTeamCard(mode, 1) ||
    (mode, 7)` (patsome-fella), `holeSegment !== 'full'` (verditest, IKKE
    null-sjekk) og `sourceGameId != null`.
- Realtime/#1366 IKKE regressert: `realtime.ts:178` primer med argument-løs
  `await supabase.realtime.setAuth()` før HVER kanalbygging; rebuild kun på
  `CHANNEL_ERROR`/`TIMED_OUT` (`:239`); ny kanal subscribes før den gamle fjernes.
- SQLite-migrasjonen additiv: `db.ts:88–94` (`CREATE TABLE IF NOT EXISTS
  cache_entries`), sekvensielt 0→1→2 (`:113–118`), `DATABASE_NAME = 'torny.db'`
  uendret (`:22`). Migrasjonstest med rigget v1-base i `db.test.ts:39`.
- Alle porter grønne (tabellen over).

### 7. Runbook + fysisk iPhone — PARTIAL (som bokført — ærlig restanse)

- Runbook-seksjonen finnes (`docs/native/app-spike.md:178–258`) og tre
  stikkprøver stemmer mot koden:
  1. «Sync-laben … lenket nederst på Hjem» → `Home.tsx:192`
     (`navigate('SyncLab')`) + registrert på stacken (`navigation.tsx:87–88`). ✓
  2. «Lever-knappen speiler webbens to porter: drain + kø-vakt (delt
     isActiveForGame), og bekreftelses-Alert» → `Scorecard.tsx:61/66–72/137/142`. ✓
  3. «jest.config.js bruker preset jest-expo og mapper expo-sqlite →
     src/test/sqliteMock.ts» + `$`-prefiks-noten → `jest.config.js` ordrett. ✓
- Restansen (eier-tapptest på fysisk iPhone, inkl. flymodus) er ÆRLIG bokført:
  kriteriets boks står u-krysset, restanse-teksten sier eksplisitt at den
  krysses først når testen er utført. Ingen stille hopp.

## Staging-verifisering (service-role, kun SELECT)

- **Rigg-opprydding bekreftet:** `game_players` for d989957f (brukerne 252e1a6f
  og 716c82bd): `submitted_at`/`approved_at`/`approved_by_user_id`/
  `rejection_reason` alle null.
- **Bjørn restaurert:** scores 9df7b9e0 / 5a821331 / hull 2 = strokes 3
  (restaurerings-stempel 17:58:38Z — etter det bokførte 6-skrivet 17:52:43Z).
- **Appens live-skriv står:** scores 9df7b9e0 / 252e1a6f / hull 2 = strokes 3,
  putts 2, `entered_by` = 252e1a6f, `client_updated_at` 17:52:15.265Z —
  nøyaktig kontraktens bokførte verdier.
- Ingen skriv fra evalueringen.

## Findings

1. **[info, ingen handling] Porter akseptert fra hovedøkta:** `npm run build` og
   `npx expo export` ble ikke re-kjørt (dyre, bevist samme dag i hovedøkta,
   eksplisitt unntatt i evaluator-oppdraget). Alle øvrige fem porter re-kjørt
   grønne av evaluator.
2. **[info, ingen handling] Kriterium 2-evidens vs. DB nå:** DB viser 6 aktive
   spill for spilleren, kontraktens evidens listet 5 — skjermen scroller og
   viste 5 over folden + ett delvis; ingen avvik i seksjonering eller innhold.
   (Antallet i DB kan også ha endret seg mellom 19:50-beviset og denne lesingen.)
3. Ingen brudd, mangler eller drift funnet i det lastbærende: delte moduler er
   import-rene, speilene er tro mot kilden, trap 2 håndheves overalt,
   #1366-disiplinen står, migrasjonen er additiv, testene asserter
   kontraktsadferden med ekte SQL.

## Verdikt

**ACCEPT** — kriteriene 1–6 PASS ved uavhengig verifisering; kriterium 7 er
delvis åpent med ærlig bokført eier-restanse (fysisk-iPhone-tapptest), som
kontrakten og oppdraget eksplisitt tillater. Restansen må lukkes av eieren før
kriterium 7 kan krysses av.
