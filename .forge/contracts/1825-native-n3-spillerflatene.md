# Spec: Native N3 — spillerflatene (hjem, game-home, hull-føring, scorekort, lever/godkjenn)

## Problem

N1 (#1818) beviste delt hjerne + OTP; N2 (#1823) beviste lokal-først-datalaget. Det som mangler for at appen skal være noe en spiller faktisk kan bruke i en runde, er selve spillerflatene: se sine spill, åpne et spill, føre slag hull for hull (offline-først), se scorekortet og levere/godkjenne. N3 bygger disse oppå N2-datalaget — og rigger samtidig app-side test-harnessen som N2-kontrakten eksplisitt bokførte som forutsetning («bookes som issue når N3 starter»): speilkoden (writeScore/syncWorker/mergeServerScore) har i dag null testdekning, og N3 legger mer logikk oppå den.

## Research Findings

- **jest-expo er Expos offisielle test-oppskrift** (docs.expo.dev/develop/unit-testing, lest 2026-08-30): preset `jest-expo` (57.0.5 matcher SDK 57) mocker native-delene av SDK-en; `@testing-library/react-native` (v14) er den støttede komponent-riggen. Vitest nevnes ikke i Expo-docs — web-repoets vitest forblir urørt, appen er eget npm-prosjekt med egen jest.
- **expo-sqlite har ingen offisiell test-historie** (SDK 57-docs). Løsning: jest-`moduleNameMapper` fra `expo-sqlite` til en liten adapter over `better-sqlite3` (v13, dev-dep, Node 22-OK) som implementerer subsettet N2 bruker (`openDatabaseAsync`, `execAsync`, `getFirstAsync`, `getAllAsync`, `runAsync`, `withExclusiveTransactionAsync`). Ekte SQL-semantikk i test, ingen håndskrevet fake-DB.
- **Navigasjon: @react-navigation/native + native-stack (v7)** fremfor expo-router: expo-router krever entry-point-bytte + filbasert app/-skanning oppå det uvanlige watchFolders-oppsettet — mer magi enn seks skjermer trenger. native-stack drar inn `react-native-screens` + `react-native-safe-area-context` (native moduler → prebuild + pod install + nytt xcodebuild, kjent felle fra N2). Deep links (N7) dekkes fint av react-navigations linking-config; expo-router revurderes da.
- **Web-flatene er kartlagt i økta 2026-08-30** (fil:linje i issue-kartet): lever/godkjenn er på DB-nivå rene `game_players`-oppdateringer under RLS — appen trenger INGEN server actions. `submitScorecard` = egen rad `submitted_at=now(), rejection_reason=null` («game_players self submit»-policyen, 0002). Godkjenn/avvis = peer-oppdatering gatet av `can_score_for` (0106) med kolonne-ALLOWLIST-trigger (`approved_at`, `approved_by_user_id`, `rejection_reason`, `submitted_at`) og eget selv-godkjenning-forbud. Notifikasjons-sideeffektene i webbens server actions er best-effort og web-eide — appen hopper over dem (bokført gap, se Out of Scope).
- **RLS dekker alle lesebehov:** roster via «game_players select shared game» (is_in_game, 0003), medspillernavn via «users select own or shared games» (0002), `courses`/`course_holes`/`tee_boxes` er select-all. Flight-scores under aktivt spill via `scores select gating`. Ingen service-role i appen.

## Prior Decisions (N1 #1818 + N2 #1823 — alle står)

- Frittstående app i `native/app/`; deling via Metro watchFolders + tsconfig-paths; web-fredning absolutt (diff kun `native/app/**`, `docs/native/**`, `.forge/**`; `lib/` har null diff).
- All skriving mot staging; aldri prod. Autonom OTP via service-role `generate_link`. Dev bundle-id `no.tornygolf.dev`; simulator (820CA940 har innlogget sesjon) for iterasjon, fysisk iPhone for sluttbevis (eier tilgjengelig).
- N2-datalaget er kontrakten for all score-skriving: `writeScore` → kø → `drainQueue` → `upsert_score_if_newer`; realtime med #1366-disiplin; delte beslutningsmoduler fra `lib/sync/`.
- `chore(native)`-commits, ingen `.changes/`-notat (dev-app, ikke bruker-synlig).

## Design

**Nye delte moduler (les-eneste import fra repo-kilden, N1-mekanismen — verifisert import-rene i økta):** `lib/games/flightScope.ts` (`isSingleFlightGame`, `canApproveScorecardFor`, `pendingApprovalsFor`, `peersForApproval`), `lib/games/status.ts` (`GameStatus`, `STATUS_LABELS`), `lib/games/activeCardState.ts` (`resolveActiveCardState`), `lib/games/scoreOwner.ts`/`teamCaptain.ts` (kun til å GATE bort team-collapsed formater via `modeCollapsesToTeamCard`), pluss `strokesForHole` og par-resolveren fra alt-delte `lib/scoring`. Webbens `PrimaryCta.computeState` (5 tilstander) ligger i app-router-katalogen og kan ikke deles — speiles som liten funksjon i appen (testes i harnessen).

**Navigasjon:** react-navigation native-stack med skjermene Login (finnes), Hjem, GameHome, Hole (param: gameId + holeNumber), Scorecard, Approve, SyncLab (beholdes som dev-verktøy, lenket nederst på Hjem). Login-porten som i dag: uinnlogget ser bare Login.

**Datalag-utvidelse (`native/app/src/data/`):**

1. **Skjema v2** i `db.ts`: ny tabell `cache_entries (key TEXT PK, payload TEXT, fetched_at TEXT)` — JSON-cache for spill-bundler og hjem-lista. `PRAGMA user_version`-migrasjon 1→2 må bevare eksisterende N2-data.
2. **`gameBundle.ts`:** `fetchGameBundle(gameId)` henter via RLS i én Promise.all-bølge: games-raden (id, name, status, game_mode, mode_config, course_id, tee_box_id, require_peer_approval, scheduled_tee_off_at, hole_segment, source_game_id, created_by), hele rosteret (game_players + users-navn: user_id, name/nickname, team_number, flight_number, course_handicap, tee_gender, submitted_at, approved_at, rejection_reason, withdrawn_at), course-navn, alle `course_holes` (hole_number, par per kjønn, stroke_index), tee-navn. Lagres som JSON i `cache_entries` (`game:<id>`). `loadGameBundle` leser cache. Mønster: **render cache øyeblikkelig, refetch i bakgrunnen når online** (stale-while-revalidate) — hull-føring skal fungere i flymodus midt i runden når bundelen alt er hentet.
3. **`seedGameScores(gameId)`:** generalisering av N2s `seedFromServer` (ut av SyncLab): hent ALLE scores for spillet via RLS (flight-synligheten gater) og kjør hver rad gjennom `mergeServerScore` — LWW forblir eneste vei server-data kommer inn lokalt.
4. **`playerActions.ts`:** `submitScorecard(gameId)`, `approveScorecard(gameId, playerUserId)`, `rejectScorecard(gameId, playerUserId, reason)` som rene supabase-js-oppdateringer med webbens guards speilet: submit krever aktivt spill + egen rad + idempotent no-op hvis levert; approve krever `submitted_at IS NOT NULL AND approved_at IS NULL`-filter i selve UPDATE-en; reject nuller submitted/approved og setter reason (webbens `NO_REJECTION_REASON`-sentinel ved tom). **Trap 2 er ufravikelig:** hver UPDATE chainer `.select('user_id')` og asserter radantall — 0 rader med `error == null` skal vises som feil i UI, aldri som suksess (del `lib/supabase/affectedRows.ts` hvis import-ren, ellers speil mønsteret).

**Skjermene (norsk copy, N1-spikestil med nøktern polish — brand-fargene som alt brukes):**

- **Hjem:** tre seksjoner via RLS-spørringer speilet fra webbens hjem (aktive m/ `resolveActiveCardState`-badge, planlagte, siste ~5 avsluttede). Kort → GameHome. Tom-tilstand med rolig melding. Cache i `cache_entries` (`home`), refetch ved fokus/online.
- **GameHome:** navn, status (`STATUS_LABELS`), bane/tee, roster m/ flight/lag og egen banehandicap (frosset `course_handicap`-kolonne — aldri rekalkulert). Primær-CTA etter speilet computeState: not_started/in_progress → Hole (neste ufylte hull), ready_to_submit → Scorecard, submitted-tilstandene → banner. Lenker: scorekort alltid; «Godkjenn (N)» når delt `pendingApprovalsFor` gir treff. `scheduled` → venterom-lite (tee-off-tid + roster, ingen auto-start fra appen); `finished` → lesevisning + scorekort-lenke. **Format-gate:** `modeCollapsesToTeamCard`-formater, `hole_segment`-spill og derived (`source_game_id`) viser «Dette formatet føres på nettsiden ennå» i stedet for føring-CTA (N4/N5 tar dem).
- **Hole:** header med hullnr, par (per `tee_gender`), SI og «+N»-badge fra delt `strokesForHole`. Spillerkort for flighten (delt `isSingleFlightGame`-regel: ≤4 aktive eller wolf = alle; ellers samme `flight_number`) med slag-stepper (min 1, maks 15 — webbens grenser) og putts-stepper; skriv for medspillere er lov (enteredBy = meg), alt via N2 `writeScore` (putts-skriv bevarer slag — merge-semantikken). Hullstripe 1–18 + forrige/neste; siste hull/full runde → CTA «Lever scorekort» → Scorecard. Realtime-abonnement (`subscribeGameScores`) + `seedGameScores` ved åpning; alle lesinger fra lokal DB.
- **Scorecard:** webbens Layout A speilet: Hull/Par/SI/Slag/Netto-rader + footer (spilte hull, brutto, tildelte slag, netto) — netto fra delt `strokesForHole`. Viser egne scores (lokal DB). Ved aktivt spill + ikke levert: «Lever scorekort»-knapp med webbens to porter speilet: (1) kø-vakt — drain først, blokker mens elementer for spillet står i kø (delt `isActiveForGame`), (2) manglende hull → native Alert-bekreftelse før submit (aldri hard blokk). Suksess → tilbake til GameHome med levert-banner.
- **Approve:** liste fra delt `pendingApprovalsFor`; per kort en kompakt scorekort-tabell (spillerens scores fra lokal DB etter seed) + Godkjenn/Avvis (avvis med valgfri grunn). RLS + 0106-triggeren er håndhevelsen; appens gate er samme delte `canApproveScorecardFor`.

**Dataflyt-prinsipp:** skjermene leser lokal DB + cache; nettverk skjer i bakgrunnen (seed/refetch/drain/realtime). Unntak: hjem-listas første last og bundle-første-hent krever nett (rolig feilmelding offline).

**Test-harness (`native/app`):** jest-expo-preset i package.json + `jest.config`-blokk med moduleNameMapper for `@/*` → repo-rot og `expo-sqlite` → better-sqlite3-adapteren (`src/test/sqliteMock.ts`, in-memory per test). Dev-deps: `jest-expo@~57.0.5`, `jest`, `@types/jest`, `@testing-library/react-native`, `better-sqlite3`. Testene (Type A-tunge, jf. docs/test-discipline.md):
- `writeScore`: merge (undefined bevarer / null nuller), strengt økende `clientUpdatedAt`, kø-erstatning (samme id).
- `syncWorker.drainQueue`: applied / server-wins m/ konflikt-rad / edited-mid-flight (#1457) / retry / abandon (#668) med mocket `supabase.rpc`.
- `mergeServerScore`: eldre/lik droppes (ekko), nyere vinner m/ konflikt-regel, kø-rad fjernes.
- `playerActions`: 0-rader → feil (trap 2), idempotens-grenene, reject-nulling.
- computeState-speilet + bundle-cache round-trip.
- Maks ÉN render-test per ny skjerm (Type C) — Hole-skjermens tap→`writeScore`-kall er den viktigste; resten valgfritt/utelatt.

## Edge Cases & Guardrails

- **Web-fredning (arvet):** diff kun `native/app/**`, `docs/native/**`, `.forge/**`; `lib/` null diff. Trengs en endring i delt kode: stopp og eskaler.
- **0-row-fella (trap 2):** alle game_players-UPDATEs asserter radantall via `.select()`. RLS-avslag skal synes i UI.
- **Selv-godkjenning:** 0106-triggeren kaster — appen viser feilen pent, men delte `pendingApprovalsFor` skal uansett aldri liste en selv.
- **Offline:** hull-føring og scorekort fungerer helt uten nett når bundelen er cachet; lever-knappen blokkerer mens køen har elementer for spillet (aldri lever et kort med usynkede slag). Hjem uten cache + uten nett → rolig feilmelding, ingen krasj.
- **Trukket spiller (`withdrawn_at`):** filtreres fra flight/roster/approve overalt (delte hjelpere gjør det); egen trukket rad → ingen føring-CTA.
- **Status-drift:** spill som blir `finished`/`scheduled` mens skjermen er åpen: refetch ved fokus oppdaterer; føring-UI vises kun for `active` (submit-guarden re-sjekker status i selve kallet).
- **Ustøttet format/segment/derived:** gates i GameHome (aldri krasj på mode_config appen ikke forstår); hull-siden åpnes aldri for dem.
- **SQLite-migrasjon 1→2:** additiv (CREATE TABLE IF NOT EXISTS) — N2-data overlever; testes i harnessen med en v1-fil.
- **Ingen notifikasjoner fra appen:** submit/approve fra appen sender IKKE peer/admin-notifikasjonene webben sender (server-action-eide). Bokført gap — se Out of Scope.
- **Nye native moduler** (`react-native-screens`, `react-native-safe-area-context`): krever prebuild + pod install + nytt xcodebuild FØR simulator-verifisering (N2-fella — `expo export` fanger det ikke).

## Key Decisions

- **jest-expo, ikke vitest, i appen** — offisiell Expo-løype, RN-transform virker; repoets vitest forblir web-eneste. better-sqlite3-adapter gir ekte SQL i test.
- **react-navigation native-stack, ikke expo-router** — minst magi oppå watchFolders; deep links løses med linking-config i N7; revurderes da.
- **Lever-flyten bor på Scorecard-skjermen** — webbens /submit-side ER et scorekort med knapp; egen skjerm er duplikat i appen. Samme guards (kø-vakt + manglende-hull-bekreftelse) speiles.
- **Ingen server actions speiles — kun DB-skriv under RLS** — 0106-policy+trigger og self-submit-policyen ER autorisasjonen (AGENTS.md trap 3); appen legger samme delte gater foran for UX.
- **Metadata caches som JSON-bundle, ikke normaliserte tabeller** — skjermene trenger hele bundelen samlet; normalisering er støy før N4-leaderboards viser behovet.
- **Team-collapsed/segment/derived gates bort** — N4/N5 eier format-familiene; en halvriktig scramble-føring er verre enn en ærlig henvisning til webben.

**Claude's Discretion:** komponentstruktur/filnavn, stepper- vs. numpad-UX, hullstripe-utforming, cache-TTL/refetch-detaljer, reject-grunn-UX, jest-config-mekanikk, navigasjons-param-typer, hvor mye styling (nøkternt — brandfargene, tap-targets ≥44px).

## Success Criteria

- [ ] 1. **Test-harness:** `npx jest` i `native/app/` grønn; suiten dekker minst writeScore-mergen, drain-utfallene (applied/server-wins/retry/abandon/mid-flight), mergeServerScore-LWW, playerActions-radtelling og computeState-speilet; `expo-sqlite` mockes av better-sqlite3-adapteren (ekte SQL). Evidens: kjøringslogg + filliste.
- [ ] 2. **Hjem:** simulator mot staging viser e2e-spillerens spill i riktige seksjoner med status-badges; kort åpner GameHome. Evidens: skjermbilde + samsvar med service-role-les av spillerens games.
- [ ] 3. **Hull-føring lokal-først:** tap på slag i et aktivt staging-spill → øyeblikkelig UI + kø-element; drain lander raden på staging (service-role-les med appens `client_updated_at`); putts-tasting bevarer slag; ekstern `upsert_score_if_newer` vises i appen uten reload (realtime). Evidens: skjermbilder + service-role-les.
- [ ] 4. **Scorekort + lever:** Layout A-speilet viser 18 hull med par/SI/brutto/netto og totaler konsistente med delt `strokesForHole`; «Lever» setter `game_players.submitted_at` på staging (service-role-les), kø-vakten blokkerer med usynkede slag, manglende hull gir bekreftelses-dialog, og GameHome viser levert-tilstanden.
- [ ] 5. **Godkjenn:** med et service-role-rigget levert kort fra en flight-makker viser appen kortet under Godkjenn; godkjenn setter `approved_at`+`approved_by_user_id`; avvis nuller `submitted_at` og setter grunn (service-role-les). 0-rader (f.eks. alt godkjent) vises som feil/no-op i UI, aldri stille suksess.
- [ ] 6. **Web urørt + porter:** diff kun `native/app/**`, `docs/native/**`, `.forge/**`; `git diff main...HEAD -- lib/` = 0 linjer; alle Gates grønne.
- [ ] 7. **Runbook + fysisk iPhone:** `docs/native/app-spike.md` utvidet (navigasjon, skjermene, harness, sqlite-mock, format-gaten); eier-utført tapp-test på fysisk iPhone av hjem→spill→hull→scorekort — inkl. flymodus-føring med cachet bundle. Eier utilgjengelig → dokumentert `VERIFICATION GAP` + restanse, aldri stille hopp.

## Gates

- [ ] `npx jest` i `native/app/` grønt (ny)
- [ ] `npx tsc --noEmit` i `native/app/` grønt
- [ ] `npx expo export --platform ios` grønt (`dist/` slettes etterpå)
- [ ] `npm run typecheck` (rot) grønt
- [ ] `npx vitest run lib/sync lib/scoring` grønt (web-suitene uendret)
- [ ] `npm run build` (rot) grønt før PR — kjøres av hovedøkta
- [ ] `npx eslint native/app` grønt

## Files Likely Touched

- `native/app/src/screens/{Home,GameHome,Hole,Scorecard,Approve}.tsx` — nye
- `native/app/src/navigation.tsx` + `App.tsx` — native-stack-oppsett; SyncLab-lenke flyttes
- `native/app/src/data/{db,gameBundle,playerActions}.ts` — v2-migrasjon + nye moduler; `seedGameScores` ut av SyncLab
- `native/app/src/test/sqliteMock.ts` + `src/**/*.test.ts(x)` — harness + suiter
- `native/app/package.json` — +navigasjon (expo install), +jest-deps
- `docs/native/app-spike.md` — N3-seksjon
- `.forge/contracts/native-n3-spillerflatene.md` — denne

## Out of Scope

- Leaderboards og format-familiene inkl. team-collapsed føring/matchplay-UI (N4); cup/liga-flater og segment/derived-spill (N5); arrangørflater inkl. avslutt/endGame og auto-start (N6); push/deep links + notifikasjons-gapet fra app-skriv (N7 — bokføres der); butikk/paritet (N8).
- Venterom-funksjoner (flight-velger, betaling, premier, trekk/angre), discovery/social proof/streak, profil-gate, spectate, revansje, rundelogg/AI-rapport.
- SecureStore-herding, EAS/TestFlight, designsystem-polish, endringer i web-kode eller `lib/`.
- Deferred idé (fra N2, står fortsatt): plattformnøytral refaktor av webbens sync-kjerne — N3 rører den ikke.
