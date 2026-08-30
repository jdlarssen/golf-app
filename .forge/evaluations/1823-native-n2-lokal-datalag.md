# Evaluering: Native N2 — lokal-først datalag (#1823)

Evaluator med fersk kontekst, 2026-08-30. Branch `claude/n2-lokal-datalag` @ 6e4da6ec.
Alle kommandoer kjørt selv (Node 22.23.0) fra worktree-rota; staging kun lest, aldri skrevet.

## Mekaniske porter (kjørt av evaluator)

| Port | Resultat |
| --- | --- |
| `npm run typecheck` (rot) | exit 0 |
| `npx vitest run lib/sync lib/scoring` | 55 filer / 1303 passed, exit 0 (eksplisitt `$?`-sjekk — ikke bare grønne tall) |
| `npx tsc --noEmit` i `native/app/` | exit 0 |
| `npx expo export --platform ios` | exit 0, 1 hbc-bundle 2.3 MB |
| `grep -ci dexie` på hbc-bundelen | 0 treff (grep exit 1) — type-importene er runtime-frie; `dist/` slettet etterpå |
| `npm run build` (rot) | exit 0 — kontrakten hadde denne uavkrysset («kjøres av hovedøkta»); nå verifisert av evaluator |

## Per kriterium

1. **Øyeblikkelig lokal skriving** — attestert (skjermbilde i hovedøkta). Mekanisk spor verifisert: `writeScore.ts` skriver score + kø-rad atomisk i én transaksjon med les-inne-i-transaksjon; SyncLab leser lokal DB og har «I kø»-teller (16 testID-props). OK.
2. **Drain lander på staging** — attestert. Mekanisk spor: staging-radene finnes med appens `client_updated_at`-stempler (se kriterium 6; hull 1-raden fra 15:56 er senere overskrevet av flymodus-testen — forventet tidslinje, ingen motsigelse). RPC-kallet i `syncWorker.ts:83–95` matcher kontraktens argumentliste inkl. `p_putts`. OK.
3. **Realtime inn** — attestert. Mekanisk spor: `realtime.ts` merger innkommende via LWW-guard + delt `conflictRecordFor` (linje 86), postgres_changes med `game_id=eq.`-filter (linje 304–311). OK.
4. **Delt kilde, null kopier** — VERIFISERT. Imports fra repo-kilden: `syncRetryDecision` (`native/app/src/data/syncWorker.ts:8`), `resolveConflict`/`conflictRecordFor` (`syncWorker.ts:10–12`), `conflictRecordFor` (`realtime.ts:10`), `isActiveForGame` (`SyncLab.tsx:18`), type-imports fra `lib/sync/db.ts` (`data/db.ts:17`) og `lib/sync/mergeServerScore` (`realtime.ts:11–14`). Grep etter lokale definisjoner av de tre funksjonene i `native/app/`: null treff. `git diff origin/main...HEAD -- lib/` = 0 linjer. Vitest grønn (over). Kosmetisk: kontraktsteksten skriver «`../../lib/sync/*`», faktisk sti er `../../../../lib/sync/` — samme repo-kilde, ingen substans.
5. **Web urørt + porter grønne** — VERIFISERT. Diff-scope: kun `native/app/**`, `docs/native/**`, `.forge/**` (13 filer; rot-tsconfig fra N1 dukker ikke opp — den er på main). Alle fem porter grønne (tabellen over), inkl. `npm run build` som evaluator kjørte selv.
6. **Flymodus på fysisk iPhone** — eier-attestert i hovedøkta; datasporet VERIFISERT via read-only service-role-les av staging `scores` (game 69d7641e…, user 252e1a6f…): hull 1–3 med `client_updated_at` 16:03:12.649Z / 16:03:13.749Z / 16:03:20.62Z (tastet offline, spredt over ~8 s) mot `updated_at` 16:03:26.66–27.08Z (én drain-salve, <0,5 s spredning). Offline-gapet på 6–14 s står i selve dataene, nøyaktig som kontrakten hevder.
7. **Runbook** — VERIFISERT. `docs/native/app-spike.md:83–184`: delingsgrense-tabell, skjema (`torny.db`, `PRAGMA user_version = 1`, tre tabeller), drain-triggere, #1366-realtime-disiplin, Sync-lab-beskrivelse, flymodus-oppskrift, porter. Samsvarer med koden linje for linje (stikkprøvd: «tasting drainer ikke» — `writeScore.ts` kaller ikke `drainQueue`; WAL-begrunnelsen — `db.ts:81`).

## Design-sjekker (kontraktens 5c–5f)

- **LWW-semantikk:** `writeScore.ts:38–48` — strictly-increasing (retur now bare når `now > eksisterende`, ellers bump +1 ms). `realtime.ts:81` — innkommende droppes på `existing.clientUpdatedAt >= incoming` (dvs. merges kun strengt nyere; ekko med lik timestamp droppes stille). Ingen `>=`-felle funnet.
- **#1366:** `realtime.ts:178` — argument-løs `await supabase.realtime.setAuth()` FØR subscribe, per kanalbygg; grep bekrefter null `setAuth(<arg>)`-kall i hele `native/app/src/`. Statuscallback (`:188`), gjenoppbygging etter 3 påfølgende `CHANNEL_ERROR`/`TIMED_OUT` (`:33`, `:242`) med backoff (`:36`), parkert offline (`:203`). Ny kanal subscribes før gammel fjernes (`:189–193`).
- **Kø-semantikk:** `syncWorker.ts:75` abandonedAt-skip; `:137–141` ferskhets-sjekk (#1457 — endret mid-flight ⇒ ingen dequeue); `:103` delt `syncRetryDecision`; `:56` inFlight-vakt.
- **Triggere:** `syncTriggers.ts` — expo-network `isConnected` (iOS-caveat håndtert, `:44`), AppState `active`, 30 s-intervall, oppstarts-drain. Idempotent start.
- **Tom-tilstand:** `SyncLab.tsx:247` — «Ingen aktive spill på staging …».

## Funn (ingen fellende)

- `native/app/src/data/realtime.ts` + kriterium 4: type-only-import fra `lib/sync/mergeServerScore` (kontrakten klassifiserte fila som «speiles»). Runtime-fri per dexie-grep 0 — i tråd med kontraktens eget type-import-prinsipp; noteres kun for presisjon.
- `.forge/contracts/1823-…md` + kriterium 4: import-stien i kontraktsteksten («`../../lib/sync/*`») stemmer ikke bokstavelig med faktisk dybde (`../../../../`). Kosmetisk.
- `native/app/src/supabase.ts` + kriterium 5: `createClient<Database>` type-import fra `lib/database.types` — runtime-fri, innenfor scope, gir typede RPC-svar. Godkjent utvidelse.

VERDIKT: ACCEPT
