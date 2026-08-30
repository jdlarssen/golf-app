# Spec: Native N2 — lokal-først datalag (expo-sqlite + sync-kø + realtime)

## Problem

N1 (#1818) beviste delt scoring-hjerne og OTP-innlogging. Det som gjenstår før spillerflatene (N3) kan bygges, er selve fartsargumentet i #1816: et lokal-først datalag der skriving er øyeblikkelig, sync skjer i bakgrunnen mot NØYAKTIG samme server-kontrakt som webben (`upsert_score_if_newer`, LWW via `client_updated_at`), og endringer utenfra lander live. Web-appens sync-motor er kamptestet (#668, #688, #1457, #1611, #1366) — N2 skal gjenbruke dens rene beslutningsmoduler og speile resten med samme semantikk, aldri finne opp nye regler.

## Research Findings

- **expo-sqlite (SDK 57):** `openDatabaseAsync`, migrasjoner via `PRAGMA user_version`-mønsteret, `withExclusiveTransactionAsync` for atomiske skriv, prepared statements. Inkludert i SDK-en; native modul → pod-rebuild kreves (kjent løype fra N1). Kilde: docs.expo.dev/versions/v57.0.0/sdk/sqlite (2026-08-30).
- **expo-network (SDK 57):** `addNetworkStateListener` + `getNetworkStateAsync`. iOS-caveat: `isInternetReachable` speiler bare `isConnected` — bruk `isConnected` som online-signal. Kilde: docs.expo.dev/versions/v57.0.0/sdk/network (2026-08-30).
- **Staging har testdata klar:** flere AKTIVE spill med e2e-spilleren (verifisert 2026-08-30 via service-role, f.eks. `TEST-GoldenPath-*-golden`, stableford). Ingen provisjonering trengs; appen finner spill via vanlig RLS-lesing som innlogget spiller.

## Prior Decisions (fra N1-kontrakten #1818 — alle står)

- Frittstående app i `native/app/` — web-fredning absolutt (unntak kun rot-tsconfig-excluden som alt er inne).
- Deling via Metro watchFolders (`lib/`) + tsconfig-paths; ingen workspaces.
- All skriving mot staging; aldri prod. Autonom OTP via service-role `generate_link`.
- Dev-bundle-id `no.tornygolf.dev`; simulator for iterasjon, fysisk iPhone for sluttbevis.
- `chore(native)`-commits, ingen `.changes/`-notat (ikke bruker-synlig).

## Design

**Delingsgrense (verifisert i speiding 2026-08-30):** `lib/sync/conflict.ts` (`resolveConflict`, `conflictRecordFor`), `lib/sync/classifyError.ts` (`syncRetryDecision`) og `lib/sync/queueScope.ts` har kun type-imports → konsumeres DIREKTE fra repo-kilden (N1-mekanismen). `db.ts`/`writeScore.ts`/`syncWorker.ts`/`mergeServerScore.ts`/`realtimeChannel.ts` er Dexie-/DOM-bundne → speiles i appen med samme semantikk. Typene (`LocalScore`, `SyncQueueItem`, `ConflictRecord`) type-importeres fra `lib/sync/db.ts` (type-import er runtime-fri).

**Ny kode i `native/app/src/data/`:**

1. **`db.ts`** — expo-sqlite `torny.db`, `PRAGMA user_version`-migrasjon v1: tabellene `scores`, `sync_queue`, `conflicts` med samme felt som webbens fasonger (id-nøkkel `${gameId}:${userId}:${holeNumber}` — speil `scoreKey`). Kolonnenavn i snake_case, mapping til de delte TS-typene i ett lag.
2. **`writeScore.ts`** — speil av webbens (lest 2026-08-30): merge-semantikk der `undefined` bevarer eksisterende felt og eksplisitt `null` nuller; strictly-increasing `clientUpdatedAt` (bump +1 ms når now ≤ eksisterende — serverens LWW er strict >); atomisk put av score + kø-rad (kø-id = score-id, `createdAt = clientUpdatedAt`) i én transaksjon.
3. **`syncWorker.ts`** — speil av webbens drain: kø i `createdAt`-rekkefølge; hopp over `abandonedAt`-rader; RPC `upsert_score_if_newer` med (p_game_id, p_user_id, p_hole_number, p_strokes, p_entered_by, p_client_updated_at, p_putts); feil → delt `syncRetryDecision` (abandon ⇒ sett `abandonedAt`, ellers tell opp `attemptCount`); suksess → ferskhets-sjekk (#1457: rad endret mid-flight ⇒ rør ingenting), `was_applied` ⇒ sett `serverUpdatedAt` + dequeue; ellers delt `resolveConflict` + delt `conflictRecordFor` (server-vinner ⇒ overskriv lokal rad + evt. konflikt-rad + dequeue). `inFlight`-vakt mot parallelle drains.
4. **`syncTriggers.ts`** — expo-network-lytter (`isConnected` flipper til true ⇒ drain), AppState `active` ⇒ drain, 30 s-intervall, drain ved oppstart (speil av `startSyncListener`).
5. **`realtime.ts`** — kanal per spill: `postgres_changes`, `event: '*'`, `filter: game_id=eq.${gameId}` på `scores` (speil av webbens `lib/sync/realtime.ts`). **#1366-disiplinen er ufravikelig:** argument-løs `await supabase.realtime.setAuth()` FØR hver `subscribe`, per kanalbygg; statuscallback; riv og bygg kanalen på nytt etter 3 påfølgende `CHANNEL_ERROR`/`TIMED_OUT` med backoff; parker gjenoppbygging mens `isConnected === false`. Innkommende rad merges kun hvis `client_updated_at` er strengt nyere enn lokal (ellers dropp); server-overskriving av lokal rad går via delt `conflictRecordFor`.
6. **Sync-lab-skjerm** (tredje skjerm i spike-appen, bak innlogging): velger automatisk nyeste AKTIVE spill spilleren er med i (vanlig RLS-`select` på `game_players`+`games`); viser hull 1–3 som rader med −/+ på slag; statuslinje med kø-lengde, siste drain-resultat og realtime-status; alt med `testID`-props. Norsk copy, null polish (spike-stil fra N1).

**Dataflyt:** tap på +/− → `writeScore` (øyeblikkelig UI fra lokal DB) → kø → drain (trigget) → staging → realtime-event tilbake (egen skriving ignoreres av nyere-enn-guarden) / eksterne endringer lander i lokal DB → UI re-render.

## Edge Cases & Guardrails

- **Web-fredning (arvet fra N1):** diff kun i `native/app/**`, `docs/native/**`, `.forge/**`. `lib/sync/`-filene skal ha NULL diff — deling er les-eneste. Trengs en endring der: stopp og eskaler.
- **LWW-fella:** aldri sammenlign timestamps med `>=` — serveren applyer på strict `>`, klienten dropper innkommende på `<=` (speilvendt). Delt `resolveConflict` eier avgjørelsen der den finnes.
- **Egen-ekko fra realtime:** etter vellykket drain kommer egen rad tilbake som event — nyere-enn-guarden skal droppe den stille (lik `client_updated_at`), aldri lage konflikt-rad.
- **Tom kø / intet aktivt spill:** Sync-lab viser rolig tom-tilstand («Ingen aktive spill på staging»), ingen krasj.
- **RLS:** appen leser/skriver som innlogget e2e-spiller — RPC-en håndhever medlemskap/status; `error == null` med `was_applied=false` er IKKE feil (withdrawn/submitted-no-op) — følg webbens gren.
- **Ingen nye npm-deps utover** `expo-sqlite` + `expo-network` (begge SDK-interne).

## Key Decisions

- **expo-sqlite, ikke WatermelonDB/Drizzle** — SDK-intern, null ekstra native deps, spike trenger rå SQL + transaksjoner, ORM er støy på tre tabeller.
- **Speiling med delte beslutningsmoduler, ikke abstraksjon av web-koden** — å refaktorere webbens Dexie-lag til plattformnøytral kjerne NÅ ville rørt kamptestet prod-kode for en spikes skyld; utsettes til mønsteret har satt seg (deferred, se Out of Scope).
- **Realtime-disiplinen speiles, ikke deles** — `realtimeChannel.ts` er navigator/window-bundet; #1366-reglene er dokumentert kontraktskrav i stedet.
- **Ingen app-side test-harness i N2** — korrektheten lenes på delte, testede beslutningsmoduler + live verifisering; egen vitest-rigg for `native/app` bookes som issue når N3 starter (spike-grade er bevisst).

**Claude's Discretion:** SQL-skjemadetaljer/indekser, mappe-/filnavn, state-håndtering i Sync-lab (minimal, N1-stil), logge-format for status.

## Success Criteria

- [ ] 1. **Øyeblikkelig lokal skriving:** tap på + i Sync-lab oppdaterer UI umiddelbart; lokal DB har raden og køen elementet (evidens: skjermbilde + kø-teller i UI før drain).
- [ ] 2. **Drain lander på staging:** etter drain finnes raden i staging `scores` med appens `client_updated_at` (service-role-les som evidens), og køen er tom i UI.
- [ ] 3. **Realtime inn:** en service-role-utført `upsert_score_if_newer` utenfra (nyere timestamp, annet slag-tall) vises i appen uten reload innen ~5 s (evidens: skjermbilder før/etter).
- [ ] 4. **Delt kilde, null kopier:** app-koden importerer `resolveConflict`/`conflictRecordFor`/`syncRetryDecision` fra `../../lib/sync/*` (fil:linje-evidens); `git diff` viser null endring i `lib/sync/`; `npx vitest run lib/sync lib/scoring` grønn.
- [ ] 5. **Web urørt + porter grønne:** diff-scope per guardrail; `npm run typecheck`, `npm run build`, app-`tsc`, `npx expo export --platform ios` alle grønne.
- [ ] 6. **Flymodus på fysisk iPhone (eier-assistert):** slag tastet i flymodus vises umiddelbart; nett på igjen → raden verifisert på staging. Eier utilgjengelig i økta → dokumentert `VERIFICATION GAP` + restanse, aldri stille hopp.
- [ ] 7. **Runbook:** `docs/native/app-spike.md` utvidet med datalag-seksjonen (skjema, triggere, sync-lab, flymodus-testen).

## Gates

- [ ] `npm run typecheck` (rot) grønt
- [ ] `npx vitest run lib/sync lib/scoring` grønt (web-suitene uendret)
- [ ] `npx tsc --noEmit` i `native/app/` grønt
- [ ] `npx expo export --platform ios` bundler grønt
- [ ] `npm run build` (rot) grønt før PR

## Files Likely Touched

- `native/app/src/data/{db,writeScore,syncWorker,syncTriggers,realtime}.ts` — nye
- `native/app/App.tsx` — tredje skjerm (Sync-lab) + navigasjonsstate
- `native/app/package.json` — +expo-sqlite, +expo-network
- `docs/native/app-spike.md` — datalag-seksjon
- `.forge/contracts/1823-native-n2-lokal-datalag.md` — denne

## Out of Scope

- Spillerflater/leaderboard-UI (N3), push/deep links (N7), offline-lagring av spill-/bane-metadata (kun scores i N2), SecureStore-herding, app-side test-harness (bookes ved N3-start), plattformnøytral refaktor av webbens sync-kjerne (deferred idé — vurderes når N3+ viser hvor skoen trykker), enhver endring i `lib/sync/` eller annen web-kode.
