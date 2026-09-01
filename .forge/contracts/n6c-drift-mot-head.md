## Drift-tabell

| Spec-påstand | Verdikt | Nå (path:line) | Hva endret seg |
|---|---|---|---|
| Status-flippen i `endGameCore` har optimistisk lås på `status='active'` og asserterer berørte rader (trap 2) | **GONE** | `lib/games/endGameCore.ts:221-229` | Har ALDRI eksistert. `git log -S"eq('status', 'active')"` gir null commits. Skrivet er `.update({status:'finished', ended_at}).eq('id', gameId)` — ingen `.eq('status','active')`, ingen `.select()`, ingen `expectAffected`. Kun `error` sjekkes. 0-rad-UPDATE ⇒ `error === null` ⇒ `ok:true` og hele halen kjører mot et spill som fortsatt er `active`. Søskenveiene gjør begge deler: `startScheduledGameCore.ts:402-410` (`.eq('status','scheduled').select('id')`) og `syncDerivedGamesStatus.ts:142-149` (`expectAffected`). |
| Cup-spesifikke post-steg (`finishDerivedGames` / `suppressPerGameNotifications`) er gatet på `tournament_id` | **GONE** | `lib/games/endGameCore.ts` (null treff); `lib/cup/actions.ts:348-364`; `lib/games/syncDerivedGamesStatus.ts:132-136` | `grep -n tournament_id` gir NULL treff i endGameCore, syncDerivedGamesStatus, admin-actions og avslutt-actions. `suppressPerGameNotifications` er en ren caller-opsjon, hardkodet `true` i `lib/cup/actions.ts:354`. `finishDerivedGames` gater på `games.source_game_id`, ikke cup, og kjører ubetinget på HVER avslutning (0 rader for vanlige spill). |
| `lib/games/endGameCore.ts` kan gjenbrukes av native slik `startScheduledGameCore` ble | **GONE** | `lib/games/endGameCore.ts:1-18` | Linje 1 er `import 'server-only'`; `native/app/node_modules/server-only/index.js` er en bar `throw` ⇒ kaster ved import under Metro/Hermes. Importerer i tillegg `next/cache` (ingen `next` i native/app/node_modules), `persistResultSummaries` (selv server-only), Resend-mail, notify, auditLog. Kontrast: `startScheduledGameCore.ts:27-30` sier eksplisitt at den ikke importerer noe Next-server-spesifikt. |
| Ingen end-game-skjerm/rute/datamodul/copy/skriving finnes i `native/app` | **GONE** (= alt er nybygg) | n/a | `grep -rn "avslutt\|Avslutt\|endGame\|finished" native/app/src` gir kun LESE-bruk: `GameHome.tsx:287-293`, `Leaderboard.tsx:53-61/:131`, `homeList.ts:65/:150`, `choices.ts`, `useSideWinners.ts`. Ingenting skriver `status:'finished'` eller `game_side_winners`. |
| SELECT-policyen på `game_side_winners` gjør at et halvskrevet sett ikke er synlig midt i skrivingen | **DRIFTED** | `supabase/migrations/0092_rls_policy_perf.sql:419-427` (avløser `0024:34-46`) | Policy-formen stemmer (`is_admin() OR EXISTS(... g.status='finished' AND gp.user_id = auth.uid())`), men KONSEKVENSEN er feil: `game_side_winners creator all` er PERMISSIVE med `cmd=ALL` — som inkluderer SELECT — uten status-predikat. Permissive policies OR-es sammen ⇒ **oppretteren leser partielle sett ved enhver status**. Sant utsagn: usynlig for ANDRE deltakere til `status='finished'`. |
| Trap-2-idiomet (`.select()` + `expectAffected`) er trygt på `game_side_winners` fra native | **DRIFTED** | Live prod-policies; `endGameCore.ts:211-217` | Skrive-halvdelen holder (creator all, ALL). Men `endGameCore` chainer bevisst IKKE `.select()` — den inspiserer kun `error`. Husidiomet i native (`readWriteResult(... .select('user_id'))`) kan gi falsk `no-rows`/42501 på et skriv som faktisk landet. **Må avklares empirisk på staging før modulen kodes** — ikke kopier husidiomet blindt. |
| Nye flater bygges mot `useTheme()` | **DRIFTED** | `native/app/src/components/game/OrganiserSection.tsx:13-16, :64` vs `native/app/src/components/create/primitives.tsx:8-12` | `theme.ts:5-7` sier `useTheme()`, og N6a-wizarden følger det. N6b's OrganiserSection gikk bevisst motsatt vei: «Statisk `ui`/`COLORS`, ikke `useTheme()`. GameHome er statisk, og #1866 (lys/mørk) er et utsatt eier-valg». En finish-skjerm som henger på GameHome skal følge OrganiserSection, ikke wizarden. |
| Gjenbrukbare komponenter finnes for lister/toggles/chips — checkbox og picker finnes ikke | **DRIFTED** | `native/app/src/components/create/primitives.tsx:15-181`; `OrganiserSection.tsx:388-421`; `components/leaderboard/Table.tsx:82-88` | Finnes: `Field` :15, `SelectRow` :43, `Chips<T>` :100, `ToggleRow` :141, `Note` :172, lokal `ChipRow` :388-421, `CalmNote` :82-88. **Mangler:** (a) checkbox — ingenting i appen rendrer en; (b) picker/select — ingen dropdown-primitive. Ingen `components/ui/`-katalog i native/app; primitivene bor under `components/create/`. |
| Native kjenner spillets `tournament_id` | **DRIFTED** | `native/app/src/data/gameBundle.ts:59, :149, :192, :210` | Feltet HENTES og caches (`tournamentId: string | null`), men brukes ikke av én linje produktkode — `grep -rn tournamentId native/app/src` gir kun type/mapping + 8 testfixturer som alle setter `null`. Tilgjengelig, men uleset. |
| #502-sweepen er en Vercel-cron registrert i `vercel.json` | **DRIFTED** | `vercel.json:3` (fraværende) / `supabase/migrations/0094_scheduled_start_cron.sql:86` + `0146_cron_url_apex.sql:18` | Den er **pg_cron + pg_net**, ikke Vercel — bevisst utelatt fra vercel.json (route.ts:19-25: «NOT a Vercel cron — Hobby caps those at 1/day … POST because pg_net can only make POST requests»). Live i prod verifisert: `cron.job` har nøyaktig én rad, jobid 1, `start-scheduled-games`, `* * * * *`, active=true, apex-URL fra 0146. |
| `gameFinishedNotification` er den best-effort mail-hjelperen | **DRIFTED** | `lib/mail/gameFinishedNotification.ts:287` | Eksportert funksjon heter `sendGameFinishedNotification`, ikke `gameFinishedNotification`. Og den er IKKE best-effort — den **kaster**: `getClient()` kaster ved manglende `RESEND_API_KEY` (:25-31), og `if (result.error) throw new Error(...)` (:385-389). Best-effort bor i call-site: `endGameCore.ts:307-324` (`Promise.allSettled` + `console.error`). Flytter du kallet, MÅ allSettled følge med. |
| Eksisterende tester for `endGameCore` må holdes grønne gjennom uttrekket | **DRIFTED** | `app/[locale]/admin/games/[id]/actions.test.ts:534` | Det finnes **ingen** `lib/games/endGameCore.test.ts`. Dekningen er indirekte: `describe('endGame')` med 8 tester (:535, :547, :561, :606, :667, :722, :780, :837). De fire post-steg-hjelperne er IKKE mocket — de kjører på ekte, nøytralisert kun av (a) `server-only`-alias i vitest, (b) tom `adminSupabaseMock`-kø, (c) manglende `ANTHROPIC_API_KEY`. Cup-veien (`lib/cup/actions.ts:352`) har null dekning. |
| `app/api/` har cron-katalogkonvensjon og en delt cron-auth-hjelper | **DRIFTED** | `app/api/cron/` | Katalogkonvensjonen holder (`app/api/cron/<kebab>/route.ts`, to ruter). Men det finnes **ingen delt auth-hjelper** — Bearer-sjekken er inlinet to steder (`start-scheduled-games/route.ts:69`, `product-update-digest/route.ts:23`) og ingen andre. En tredje cron-rute blir tredje kopi. |
| `game_side_winners creator all` ligger på `0071:76-90` | **DRIFTED** (kosmetisk) | `0071_games_creator_rls.sql:76-88` (opprettet) — **nyeste hjem:** `0092_rls_policy_perf.sql:265-271` | Linjeområdet er 76-**88**, ikke 76-90 (88 = `));`, 89 blank, 90 kommentar). Substansen holder. 0092 rewrapper `auth.uid()` → `(select auth.uid())`, semantisk identisk. |
| `endGame` bor i `app/[locale]/admin/games/[id]/actions.ts` ~317-348, gatet av `requireAdminOrCreator` | HOLDS | `app/[locale]/admin/games/[id]/actions.ts:317-348` (JSDoc :304-316) | Eksakt treff. Bruker IKKE `loadAdminOrCreatorContext` (:66-79) — den inliner sin egen gate. |
| `endGameCore` bor i `lib/games/endGameCore.ts` ~118-332 og er `server-only` | HOLDS | `lib/games/endGameCore.ts:118-332`; `import 'server-only'` på :1 | Fila er 332 linjer; funksjonen er det siste i den. |
| `status === 'active'`-sjekk på :153-155 | HOLDS | `lib/games/endGameCore.ts:153-155` | Games-SELECT :137-152 leser `id, name, status, require_peer_approval, course_id, game_mode, mode_config, hole_segment` — ikke `tournament_id`, ikke `source_game_id`. |
| Minst-én-spiller-sjekk på :178-180 | HOLDS | `lib/games/endGameCore.ts:178-180` | game_players-SELECT :162-176 er ufiltrert (trukne rader inkludert). |
| Alle ikke-trukne har `submitted_at` (:181-193), relaxbar av `allowMissing` | HOLDS | `lib/games/endGameCore.ts:181-193` (loop :181-197) | `allowMissing` leses på :189, default `false` (:125). WD-kortslutning `continue` på :184. |
| `require_peer_approval` ⇒ alle har `approved_at` (:194-196); `allowMissing` skal ALDRI slakke peer-gaten | HOLDS | `lib/games/endGameCore.ts:194-196` | `allowMissing` leses på nøyaktig ett sted (:189). Peer-gaten leser den ikke ⇒ for enhver spiller med `submitted_at` fyrer gaten identisk. Forbehold: `continue` :192 hopper strukturelt over :194 for uinnlevert spiller — vakuøst i dag fordi `reopenScorecard` (:389-394) nuller submitted+approved sammen. |
| Skriverekkefølge: winners-upsert (`onConflict 'game_id,category,position'`) FØR status-flippen | HOLDS | `lib/games/endGameCore.ts:204-218` (winners) → `:220-229` (flipp) | Feil på winners ⇒ `reason:'db_winners'` og spillet står igjen som `active` (retry mulig). Kun `endGameWithSideWinners` sender sideWinners. |
| `endGameMarkingWithdrawals` finnes i `avslutt-likevel/actions.ts`, setter `withdrawn_at`, kaller `endGame(allowMissing=true)` | HOLDS | `app/[locale]/admin/games/[id]/avslutt-likevel/actions.ts:23-73` | To detaljer spec-en utelater: (a) modus-gate via `supportsWithdrawal(game.game_mode)` :43 ⇒ tom WD-liste for ustøttet modus selv ved crafted POST; (b) UPDATE setter BÅDE `withdrawn_at` OG `withdrawn_by_user_id: role.userId` (:58-61). |
| `reopenGame` (~:554-631) er admin-only via `loadAdminContext` | HOLDS | `app/[locale]/admin/games/[id]/actions.ts:554-631` | `loadAdminContext` (:41-50) → `requireAdmin` (`lib/admin/auth.ts:65-71`) redirecter ikke-admin til `/`. Oppretter kan altså IKKE gjenåpne. Heller ingen optimistisk lås her. |
| Post-steg-listen etter flippen (uttrekk-flaten for `runFinishPipeline`) | HOLDS | `lib/games/endGameCore.ts:231-331` | Se «Byggeklar kontekst» for full liste i rekkefølge med klienttype. |
| `games creator update` ligger på `0071:29-33` | HOLDS | `0071_games_creator_rls.sql:29-33`; nyeste hjem `0092_rls_policy_perf.sql:195-197` | Ingen migrasjon etter 0092 rører games-policies (sjekket 0093-0168). Live staging matcher 0092 eksakt. |
| `score_differential`-triggerlåsen på `0117:52-63` | HOLDS | `0117_game_players_score_differential.sql:35-60` (guard :52-56, trigger :68-72) | Live i staging OG prod, byte-identisk (md5 `0452f0385edf84a69afb4c4ac041af49`). Hull: triggeren er BEFORE **UPDATE** only — ingen INSERT-guard. |
| `games` trenger ny kolonne `finish_pipeline_at` | HOLDS (fraværende) | ingen slik kolonne i staging/prod | Repo-grep for `finish_pipeline` treffer kun de to kontraktfilene. `games` har 39 kolonner, identiske i staging og prod. |
| Neste ledige migrasjonsnummer | HOLDS | `supabase/migrations/0168_creator_may_group_self.sql` (169 filer) | **Neste ledige: `0169_`**. Nyeste påført: staging `20260901165620`, prod `20260901181111`. |
| Staging og prod er i lås for `games` + `game_side_winners` | HOLDS | live staging `snwmueecmfqqdurxedxv` vs prod `glofubopddkjhymcbaph` | Null drift på 9 akser: kolonner, policies, indekser, constraints, triggere, guard-funksjonskropper (md5-like), ACL-er. |
| `game_players` kolonneregler for oppretter (bonus) | HOLDS | live `guard_game_players_self_update` (md5 `d37831639b7443223db2c1d99f1ec4e5`) | `result_summary` står i INGEN blokkliste ⇒ enhver spiller kan skrive den på egen rad. Kun `score_differential` er reelt frosset. |
| `GameHome.tsx` har en arrangør-seksjon | HOLDS | `native/app/src/screens/GameHome.tsx:209-213` | Gatet på `game.createdBy === userId`, ikke admin-flagg. |
| N6b la til «Start runden nå»-CTA — mønsteret en «Avslutt runden»-CTA kopierer | HOLDS | `native/app/src/components/game/OrganiserSection.tsx:367-376` | Eneste `ui.button` (primær) i seksjonen; alt annet er `ui.buttonSecondary`. |
| Det finnes et tydelig innsettingspunkt for «Avslutt runden» | HOLDS | `OrganiserSection.tsx:168-172` (gate) og `:367-376` (speilslot) | Kommentaren på :170 reserverer eksplisitt avslutningen for N6c. CTA-en hører som `{active ? …}`-søsken av start-knappen. |
| `RootStackParamList` i `navigation.tsx` med gjeldende ruter | HOLDS | `native/app/src/navigation.tsx:26-35` | Nøyaktig 8 ruter, ingen `EndGame`. react-navigation native-stack, ikke expo-router. |
| Ny skjerm = én param-list-linje + én `Stack.Screen` | HOLDS | `native/app/src/navigation.tsx:65-104` | `Approve`-linja (:95-99) er malen; dynamiske titler bruker funksjonsformen (:80-84). |
| `native/app/src/data/` er datamodul-laget | HOLDS | `native/app/src/data/` | 15 moduler, alle med co-lokalisert `.test.ts` unntatt `homeList.ts` og `syncTriggers.ts`. |
| Supabase-klienten er en modul-singleton, aldri injisert | HOLDS | `native/app/src/supabase.ts:22-46` | Appen har INGEN service-role og skal ikke få en; RLS er den ekte gaten. |
| Trap-2 går via delt `expectAffected` + toveis null-rad-resolver | HOLDS | `rosterActions.ts:164-218`; `lib/supabase/affectedRows.ts:53-65` | «Stille suksess finnes ikke her.» |
| Typede feilunioner i datamodulen, norsk copy i `lib/*Copy.ts` med uttømmende switch uten default | HOLDS | `rosterActions.ts:55-83` + `lib/rosterCopy.ts:55-145` | Manglende returverdi i switch er hele poenget — `tsc` faller. |
| Eksplisitt offline-guard før alle skriv; kun scores går via sync-køen | HOLDS | `rosterActions.ts:137-141`; `startGame.ts:93-94` | `isDeviceOnline()` fra `./syncTriggers` (expo-network, optimistisk `true` før første avlesning). |
| Optimistisk låsing skjer i delt kjerne / med filter-idempotens, ikke versjonskolonne | HOLDS | `startGame.ts:93-127`; `rosterActions.ts:591-624` | To idiomer: delegere til import-ren kjerne, eller `.is('submitted_at', null)`-filter + oppfølgings-SELECT. |
| Jest-mønsteret for datamoduler | HOLDS | `startGame.test.ts:14-56`; `rosterActions.test.ts:14-40, 104-110`; `test/supabaseMock.ts`; `test/harness.ts` | `routeFrom` KASTER på uplanlagt query — slik beviser du at ingen ekstra rundtur skjer. |
| #1850 leser `game_side_winners` med `(category, position, winner_user_id)` | HOLDS | `native/app/src/data/sideWinners.ts:31, 40-44, 56-69` | `position` = SLOT (hvilket LD/CTP-hull), ikke plassering. `winner_user_id = null` = «Ingen kvalifiserte». |
| Lesekjeden `fetchSideWinners → useSideWinners → buildSideTournament → SideTournamentSection` | HOLDS | `lib/useSideWinners.ts:49-94`; `lib/sideTournament.ts:268-428`; `Leaderboard.tsx:53-61, 209-220` | Henter kun på focus, ingen polling: «Vinnerne skrives ÉN gang, i avslutt-flyten». |
| Design-tokens fra #1830 i `native/app/src/theme.ts` | HOLDS | `native/app/src/theme.ts:10-241` | `COLORS`, `TAP = 44`, `PALETTES`, `FONTS`, `createUi(c)`, `ui = uiVariants.light`, `useTheme()`. |
| Nærmeste mal for bekreft/destruktiv arrangørflyt er `run`/`confirmThen`/`notice` | HOLDS | `OrganiserSection.tsx:76-87, 99-157` | Bundle refetches i `finally`, også ved feil: «et avslag betyr som regel at virkeligheten har flyttet seg». |
| Web-siden native speiler er `app/[locale]/games/[id]/avslutt/page.tsx` | HOLDS | `app/[locale]/games/[id]/avslutt/page.tsx:46-264` | Fire gjensidig utelukkende grener i rekkefølge; alle felt den spør om finnes allerede i native-bundelen. |
| Native kjenner side-turneringskonfig (enabled + slot-tall + disabled) | HOLDS | `gameBundle.ts:66-83, 152-155, 192, 213-218` | `sideDisabledCategories` er legacy (#1139), defaulter `[]`. |
| Native kjenner `require_peer_approval` + per spiller `submitted_at`/`approved_at`/`withdrawn_at` | HOLDS | `gameBundle.ts:46, 90-109, 185-186` | Trukne spillere ER i `bundle.players`; hver konsument filtrerer selv. `lib/roster.ts:27-36 toRoster` gir snake_case-formen web-siden trenger. |
| Bundle-cache-versjonen må bumpes ved nytt narrowed felt | HOLDS | `gameBundle.ts:15-36` | `BUNDLE_PAYLOAD_VERSION = 4` (N6b la til `acceptedAt`). Trenger finish ingen nye felt: **ikke** bump. |
| Web parser `ld_winner_N`/`ctp_winner_N` med `"none"` → null, og `withdraw_<userId> = "on"` | HOLDS | `avslutt/actions.ts:82-105`; `avslutt-likevel/actions.ts:44-72` | Tomt/manglende slot ⇒ `?error=missing_ld_${pos}`. Native har ingen FormData — hold `Map<slotKey, string|'none'>` i state, men behold semantikken eksakt. |
| Norsk copy for finish finnes i `messages/no.json` | HOLDS | `messages/no.json → game.finish.*`, `admin.game.sideWinners.*` | Appen må IKKE importere no.json (341 KB, Metro tree-shaker ikke) — håndkopier + paritetstest, jf. `appFormats.ts:10-14`. |
| #502-sweepen finnes og er malen for en finish-sweep | HOLDS | `app/api/cron/start-scheduled-games/route.ts:62` | `maxDuration = 60` (:43), sekvensiell loop i `try/finally` slik at varsler kjører selv ved throw. |
| Auth er `CRON_SECRET` via `Authorization: Bearer` | HOLDS | `app/api/cron/start-scheduled-games/route.ts:63` | Byte-ekvivalent i `product-update-digest/route.ts:17-26`. Dokumentert i `.env.example:8-11`. |
| `vercel.json` holder prosjektets cron-oppføringer | HOLDS | `vercel.json:3-8` | Nøyaktig ÉN oppføring: `/api/cron/product-update-digest`, `0 8 * * *`, med intern Oslo-datogate. Totalt: 1 Vercel-cron, 1 pg_cron-jobb, 2 cron-ruter. |
| Hobby-tier cron-grense begrenser en ny sweep | **UNVERIFIABLE** | `product-update-digest/route.ts:7`; `start-scheduled-games/route.ts:20` | Repoets egen nedtegnede grense (1/dag på Hobby) står tre steder, men to søk i Vercel-docs-MCP ga kun konfig-syntaks, ingen plan-grenser. Moot: presisjons-sweeper går uansett via pg_cron. |
| `persistScoreDifferentials` er server-only post-steg | HOLDS | `lib/games/persistScoreDifferentials.ts:32` | Egen `getAdminClient()` (:34), tar ikke klient. Idempotent. Kjeder `.select('user_id')` og kaster på 0 rader (:198-212). |
| `persistResultSummaries` er server-only post-steg | HOLDS | `lib/games/persistResultSummaries.ts:24` | Tar et GAME-OBJEKT, ikke gameId. Idempotent. MERK: kjeder IKKE `.select()` (:38-44) ⇒ 0-rad-skriv telles stille som skrevet. |
| `notifyAchievementUnlocks` er server-only post-steg | HOLDS | `lib/games/notifyAchievementUnlocks.ts:37` | **IKKE idempotent** — `notify()` er bar INSERT uten dedupe-nøkkel; prod har kun `notifications_pkey(id)` + tre ikke-unike btrees. Andre kjøring dupliserer varsler og re-pusher. |
| `generateAndPersistRoundReport` er server-only post-steg | HOLDS | `lib/games/generateRoundReport.ts:71` | Anthropic-SDK (`claude-sonnet-5`, 800 max_tokens, timeout 20s). DB-skrivet konvergerer, men er ikke betinget av at `round_report` er null ⇒ re-kjøring koster nytt LLM-kall og ny prosa. |
| Det finnes en audit-log-skriving ved avslutning | HOLDS | `endGameCore.ts:264`; `lib/admin/auditLog.ts:37` | `'game.finished'` er første medlem av `AdminAuditEventType` (:12). Best-effort, kaster aldri. |
| Det finnes et repo-mønster for idempotent markørkolonne-sweep | HOLDS | `lib/notifications/autoStartBlocked.ts:47` | `.update({col: now}).is(col, null).eq('status', …).select('id').maybeSingle()` — kun vinneren gjør side-effekten. Andre instans: `deliver_reminder_sent_at` (0068:33). `games` har INGEN finish-side markørkolonne i dag. |

---

## Konsekvens for kontrakten

### 1. Status-flippen har ingen optimistisk lås (GONE)
Spec-en beskriver en lås og en rad-assertion som **aldri har eksistert**. Bygg ikke videre på antakelsen om at flippen er trygg mot dobbelkjøring.

Nåværende skriv, `lib/games/endGameCore.ts:221-224`:
```ts
const { error } = await supabase
  .from('games')
  .update({ status: 'finished', ended_at: endedAt })
  .eq('id', gameId);
```

Bygges `runFinishPipeline` uansett, er den billige fiksen `.eq('status','active').select('id')` + `expectAffected`. **Men det endrer returkontrakten**: et legitimt dobbeltrykk går fra stille `ok:true` til en feilgrunn. Speil `startScheduledGameCore`s `started`-boolean i stedet — 0 rader = allerede ferdig = idempotent `ok`, ikke feil. Dette er et eier-nært valg: skriv det inn i kontrakten, ikke i koden alene.

### 2. Cup-ness kommer ikke fra `tournament_id` (GONE)
Ingen `runFinishPipeline` må forsøke å utlede cup-oppførsel fra `tournament_id`. Cup-ness kommer inn via nøyaktig to kanaler, begge caller-styrt:
- hvilken klient caller sender inn (`lib/cup/actions.ts:348` sender service-role-adminklienten, fordi en klubb-styrer ikke er spillenes oppretter);
- den ene boolean-en `suppressPerGameNotifications` (`lib/cup/actions.ts:354`, hardkodet `true`).

Begge MÅ forbli parametere. `finishDerivedGames` er ikke cup-spesifikk og gater på `games.source_game_id` — den kjører ubetinget.

### 3. `endGameCore` kan ikke gjenbrukes fra native (GONE)
Kontraktens «gjenbruk kjernen slik N6b gjorde» er ikke gjennomførbar. Velg eksplisitt én av to, og skriv begrunnelsen i filhodet (både N6a og N6b åpner med 20-40 linjers rasjonale — reviewerne forventer det):

- **(a)** Ekstraher en import-ren `endGameCoreShared` uten `server-only`, uten `next/cache`, som tar `SupabaseClient` inn — nøyaktig slik #1855 gjorde for start. Den kan eie gatene, winners-upserten og flippen, men **kan ikke eie steg 2-7** i halen.
- **(b)** Skriv en native-eid datamodul som speiler gatene, slik `rosterActions.ts` speiler webbens roster-actions.

### 4. Hele post-flipp-halen er utilgjengelig fra telefonen (GONE, produktbeslutning)
Seks av elleve post-steg kaller `getAdminClient()` selv og tar ikke injisert klient: `persistResultSummaries`, `persistScoreDifferentials`, `notifyAchievementUnlocks`, `generateAndPersistRoundReport`, `logAdminEvent`, `notify()` (inne i `notifyPlayersGameFinished`). `getAdminClient` (`lib/supabase/admin.ts:10-18`) kaster uten `SUPABASE_SERVICE_ROLE_KEY`, og en telefon kan aldri holde den nøkkelen.

**En native avslutning som bare flipper status gir: ingen resultatsammendrag (#572), ingen WHS-differensialer (#941), ingen achievements (#947), ingen runde-referat (#1008), ingen «Resultatet er klart»-mail.** Det er langt større enn de to hullene N6b allerede bokførte. Kontrakten må velge: enten server-rundtur for avslutningen, eller sweep som tar halen etterpå — og hullet må bokføres høyt for eieren, ikke gjemmes som teknisk detalj.

### 5. RLS-asymmetrien på `game_side_winners` (DRIFTED ×2)
To korrigeringer:
- **Oppretteren SER partielle sett.** `game_side_winners creator all` har `cmd=ALL` uten status-predikat, og permissive policies OR-es. Utsagnet «ingen ser et halvskrevet sett» er falskt for arrangørens egen enhet. Det er faktisk nødvendig — PostgREST trenger SELECT for å returnere upsert-representasjonen.
- **Husidiomet kan gi falsk `no-rows`.** `endGameCore` kjeder bevisst ikke `.select()` (:211-213). En native port som kopierer `readWriteResult(... .select('user_id'))` risikerer falsk `no-rows` eller 42501 på et skriv som landet, fordi winners skrives FØR flippen mens `status` fortsatt er `'active'`. **Avklar empirisk på torny-staging før modulen kodes.** Ikke «fiks» det ved å slakke SELECT-policyen.

### 6. Tema: følg OrganiserSection, ikke wizarden (DRIFTED)
En finish-skjerm som henger på GameHome skal bruke statisk `ui`/`COLORS`, ikke `useTheme()` — ellers blir den den eneste mørk-kapable flaten i spill-stacken, og gapet #1866 skal lukke vokser.

### 7. Checkbox og picker må bygges (DRIFTED)
Kontrakten kan ikke anta at primitivene finnes.
- **Checkbox** (webbens `<input type="checkbox" name={`withdraw_${user_id}`}>`): bygg fra `SelectRow` med `selected`-toggling, eller `ToggleRow`. Merk simulator-kvirket: `Switch` tar ikke tapp, den må dras.
- **Picker** for vinner per slot: bygg fra `Chips` (korte fornavn + «Ingen kvalifiserte») eller en liste `SelectRow`.

### 8. Sweepen er pg_cron, ikke Vercel (DRIFTED)
Kopierer du #502-mønsteret får du: (a) en POST-handler, fordi pg_net ikke kan GET; (b) **en ny migrasjon med `cron.schedule(...)`**, som er en prod-DB-endring ⇒ #1074-brannmuren gjelder (eier må `touch .claude/approve-prod` i worktreet) og prod-DB-migrasjoner auto-merges aldri. Det er den lange stangen, ikke TypeScripten.

**Billigere alternativ verdt å legge fram for eieren:** utvid den EKSISTERENDE `start-scheduled-games`-jobben. Den fyrer allerede hvert minutt og har allerede en `where exists`-gate. Enten en andre gren i gaten, eller la den ene ruta sweepe både starter og avslutninger. Null ny infrastruktur, null nytt Vault-steg (`cron_secret` finnes og virker).

**Cadence-svaret:** gjenbrukes eksisterende cron-config arves `* * * * *` — hvert minutt, verifisert live i prod. Det er godt under 15 minutter, så **ingen opportunistisk `after()`-fallback trengs**. Spec-ens «hvis grovere, vurder `after()`»-gren fyrer bare hvis byggeren legger sweepen i `vercel.json`, hvor Hobby tvinger døgn-granularitet. Ikke gjør det.

### 9. Mail-hjelperen heter noe annet og kaster (DRIFTED)
Riktig navn: `sendGameFinishedNotification`. Den er ikke best-effort i seg selv. Flytter uttrekket kallet, MÅ `Promise.allSettled` følge med, ellers begynner avslutningen å kaste. Filhodet sier det selv (:3-6).

### 10. Testene beskytter ikke det som flyttes (DRIFTED)
Det finnes ingen `endGameCore.test.ts`. **Skriv kjernens egne tester FØR koden flyttes, ikke etter.** To konkrete snublereglinger i eksisterende suite:
- `buildSupabaseMock` er FIFO (`tests/serverActionMocks.ts:85` — `queue.shift() ?? {data:null,error:null}`) ⇒ enhver omrokering av DB-kall tildeler canned-resultater til feil query, stille.
- Off-app-testen asserterer `expect(notifyMock).toHaveBeenCalledTimes(2)` (:830). De 2 kommer fra ekte `notifyPlayersGameFinished`, og holder kun fordi `notifyAchievementUnlocks` finner null momenter mot tom admin-kø. Flyttes det steget ut (eller får data), ryker tallet.

Kjør `npx vitest run 'app/[locale]/admin/games/[id]/actions.test.ts'` etter HVERT steg. Baseline nå: 26/26 grønne i fila; 38/38 sammen med `lib/games/syncDerivedGamesStatus.test.ts` og `app/api/cron/start-scheduled-games/route.test.ts`.

Cup-veien (`lib/cup/actions.ts:352`) har **null** enhetsdekning — `lib/cup/actions.test.ts` rører aldri `endGameCore`. Et uttrekk kan knekke cup-ens ett-trykks-avslutning med helgrønn suite. Skal sweepen dekke cup-kamper, trenger det gapet en test eller en eksplisitt staging-klikkrunde.

### 11. Ingen delt cron-auth-hjelper (DRIFTED)
En tredje cron-rute blir tredje kopi av de ~10 Bearer-linjene. Verdt en `lib/cron/auth.ts`-ekstraksjon — men merk at #502-evalueringen eksplisitt forsvarte duplikatet som «a line-for-line copy of the existing, tested product-update-digest». Ta valget bevisst, ikke i forbifarten.

### 12. `finish_pipeline_at` er skrivbar av native i det den finnes
Legges kolonnen til, trengs ingen policy-jobb — `games creator update` gir oppretteren blankofullmakt på alle kolonner. **Er intensjonen at kun serveren setter den, kreves en egen guard-trigger** (speil 0117). RLS alene leverer det ikke, og spec-en ser ikke ut til å ha oppdaget det.

---

## Byggeklar kontekst

### Native datamodul — skjelettet, idiom for idiom

Fra `rosterActions.ts` (nyest og mest reviewet). Kopier `refuseUnlessReady` (:137-141), `readWriteResult` (:164-191) og `resolveZeroRows` (:203-218) heller enn å finne opp nye — de er allerede duplisert mellom `rosterActions.ts` og `playerActions.ts`, så en tredje lokal kopi er akseptert huskostnad, ikke brudd.

```ts
export type EndGameFailure = 'no-session' | 'offline' | 'not-found' | 'not-active'
  | 'not-all-submitted' | 'not-all-approved' | 'db-winners' | 'rls-denied' | 'no-rows' | 'db';
export type EndGameResult =
  | { ok: true; alreadyDone: boolean }
  | { ok: false; reason: EndGameFailure; message?: string };

const done = (alreadyDone: boolean): EndGameResult => ({ ok: true, alreadyDone });
const failed = (reason: EndGameFailure, message?: string): EndGameResult =>
  ({ ok: false, reason, ...(message === undefined ? {} : { message }) });

export async function finishRound(gameId: string, opts: {...}): Promise<EndGameResult> {
  const userId = await currentDeviceUserId();
  const notReady = refuseUnlessReady(userId);   // no-session først, så offline
  if (notReady) return notReady;
  …
}
```

Offline-guarden, ordrett (`rosterActions.ts:137-141`):
```ts
function refuseUnlessReady(userId: string | null): RosterActionResult | null {
  if (!userId) return failed('no-session');
  if (!isDeviceOnline()) return failed('offline');
  return null;
}
```

Trap-2-resolveren (`rosterActions.ts:203-218`) — to-veis oppløsning av null rader: rad allerede i målstand → `{ ok: true, alreadyDone: true }`, ellers → `{ ok: false, reason: 'no-rows' }`. `readWriteResult` mapper `error.code === '42501'` → `'rls-denied'`, alt annet → `'db'`, og `NoRowsAffectedError` → `'no-rows'`.

Klienten er alltid modul-singleton, aldri injisert:
```ts
import { supabase, currentDeviceUserId } from '../supabase';
```

Copy hører hjemme i `native/app/src/lib/` — enten utvid `rosterCopy.ts` (den huser allerede `describeRosterFailure` og `describeStartRefusal`) eller legg til `endGameCopy.ts`. Uttømmende `switch`, **ingen `default`** — den manglende returverdien som får `tsc` til å falle er hele poenget (`rosterCopy.ts:16-18`). Kjør `humanizer:humanizer` på enhver streng som ikke er byte-kopi av `messages/no.json`.

### Native testmønster

Hodet på enhver datamodul-test:
```ts
/* eslint-disable @typescript-eslint/no-require-imports */
import { useFreshModules } from '../test/harness';
jest.mock('../supabase', () => require('../test/supabaseMock'));
const mockNetwork = { online: true };
jest.mock('./syncTriggers', () => ({ isDeviceOnline: () => mockNetwork.online }));
```
Delte lib-regler mockes når de allerede er testet i `lib/`:
```ts
jest.mock('../../../../lib/games/startScheduledGameCore', () => ({ startScheduledGameCore: jest.fn() }));
```
Modulene hentes INNE i testen via `require(...)` etter `jest.resetModules()` (`harness.ts:21-33` — `require`, ikke dynamisk import, fordi babel-preset-expo lar dynamisk import stå som ekte ESM).

Query-stubbing:
```ts
routeFrom({ games: [queryStub(...)], game_players: [queryStub(...), queryStub(...)] })
```
Én stub per `.from(table)`-kall, i rekkefølge, og den **KASTER på uplanlagt query** — slik beviser du at ingen ekstra rundtur skjer. Assertér med `filtersOf(stub)`, `patchOf(stub,'update')`, `stepArgs(stub,'select')`: «at `submitted_at IS NULL`-filteret faktisk står der ER kontrakten».

Komponenttest (Type C, maks én per komponent) — mock datamodulene helt og spionér på `Alert.alert` for å auto-bekrefte, se `OrganiserSection.test.tsx:29-46` og `:108-112`.

Jest-config: `native/app/jest.config.js`, preset `jest-expo`, `process.env.TZ = 'UTC'` (pinnet, lastbærende), `^@/(.*)$` → repo-rot, `expo-sqlite` → `src/test/sqliteMock.ts`. Kjør: `cd native/app && npm test`.

**Testplan for N6c:** Type A `data/endGame.test.ts` i `startGame.test.ts`-form — dekk offline, no-session, not-active, manglende innleveringer med/uten `allowMissing`, uapproved med `require_peer_approval`, hvilke winner-rader som faktisk sendes, og rekkefølgen (winners før flipp, assertert via `supabase.from`-kallrekkefølgen). Type A for copy-switchen. Nøyaktig ÉN Type C render-test for skjermen. Ikke re-assertér engine-regler `lib/` allerede tester.

### Navigasjonsregistrering

Legg til i `native/app/src/navigation.tsx:26-35`:
```ts
EndGame: { gameId: string };
```
Og i navigatoren (etter `Approve`, `:95-99` er malen):
```tsx
<Stack.Screen name="EndGame" component={EndGame} options={{ title: 'Avslutt spill' }} />
```
Skjermsignatur:
```ts
export function EndGame({ route, navigation }: ScreenProps<'EndGame'>) {
  const { gameId } = route.params;
  …
}
```
Importer skjermen på `:16-22`, alfabetisk.

### CTA-innsettingspunkt, ordrett

`OrganiserSection.tsx` slutter i dag slik:
```tsx
{scheduled ? (
  <Pressable style={ui.button} disabled={busy} testID="organiser-start" onPress={() => void start()}>
    <Text style={ui.buttonText}>Start runden nå</Text>
  </Pressable>
) : null}

{notice ? (
  <Text style={ui.muted} testID="organiser-notice">{notice}</Text>
) : null}
```
En `{active ? … testID="organiser-finish" … }`-blokk hører mellom de to. Hold nøyaktig én `ui.button` synlig. Seksjonen tidlig-returnerer for ferdige spill (`if (!scheduled && !active) return null;` :172) med kommentaren «N6c eier avslutningen» — den kommentaren skal oppdateres i samme PR.

Bekreft/kjør-trioen å kopiere (`OrganiserSection.tsx:76-87, 116-135`):
```tsx
function confirmThen(title, message, confirmLabel, onConfirm) {
  Alert.alert(title, message, [
    { text: 'Avbryt', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

const run = useCallback(async (write) => {
  setBusy(true); setNotice(null);
  try {
    const result = await write();
    setNotice(result.ok ? null : describeRosterFailure(result.reason, result.message));
  } catch { setNotice(describeRosterFailure('db')); }
  finally { await onChanged(); setBusy(false); }
}, [onChanged]);
```
Bundle refetches i `finally`, også ved feil — «et avslag betyr som regel at virkeligheten har flyttet seg».

### Design-tokens og tilgjengelige komponenter

`native/app/src/theme.ts:10-241` eksporterer `COLORS` (:10-21), `TAP = 44` (:24), `PALETTES` (:46-69), `FONTS` (:76-83), StyleSheet-fabrikken `createUi(c)` (:85-211) med `screen, scroll, centered, title, sectionTitle, body, muted, value, num (tabular-nums), card, button, buttonText, buttonSecondary, buttonSecondaryText, link, linkText, label, input, banner, error, badge, badgeText`, `ui = uiVariants.light` (:219) og `useTheme()` (:239-241).

| Primitiv | Sted | Merknad |
|---|---|---|
| `Field({label,hint,children,testID})` | `components/create/primitives.tsx:15` | |
| `SelectRow({title,subtitle,selected,disabled,onPress,testID,right})` | `:43` | Listerad-primitiven; gullkant valgt, opacity .4 disabled, minHeight TAP+12 |
| `Chips<T>({options,value,onChange,testID})` | `:100` | Én-linjes velger for få korte opsjoner; eksplisitt «Ikke en `Picker`» |
| `ToggleRow({label,hint,value,onChange,testID})` | `:141` | RN `Switch` |
| `Note({children,testID})` | `:172` | Rolig banner |
| `ChipRow` (numerisk 1..n) | `OrganiserSection.tsx:388-421` | Lokal |
| `CalmNote({text,testID})` | `components/leaderboard/Table.tsx:82-88` | |
| **Checkbox** | — | **Finnes ikke. Må bygges.** |
| **Picker/select** | — | **Finnes ikke. Må bygges.** |

Ingen `components/ui/`-katalog i native/app.

### Cron-rutemal

Formen fra `app/api/cron/start-scheduled-games/route.ts`, i rekkefølge:
1. `export const maxDuration = 60` (:43), `const LOG_PREFIX = 'cron/<navn>'` (:45).
2. `export async function POST(request: NextRequest)` (:62) — POST fordi pg_net ikke kan GET.
3. Auth-gate (:63-72), ordrett:
```ts
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error(`[${LOG_PREFIX}] CRON_SECRET not set`);
  return new NextResponse('CRON_SECRET not configured', { status: 500 });
}
const authHeader = request.headers.get('authorization');
if (authHeader !== `Bearer ${secret}`) {
  return new NextResponse('Unauthorized', { status: 401 });
}
```
4. `const admin = getAdminClient()` (:77) — service-role, begrunnet i kommentar som systemarbeid uten brukersesjon.
5. Due-query (:84-90) med sweep-vindu speilende DB-sidens EXISTS-gate (`SWEEP_WINDOW_DAYS = 7`, :50).
6. Sekvensiell `for`-loop (:113-156) inne i `try { } finally { await notifyStartedGames(admin, startedGames) }` (:112/157-159) — mid-loop-throw kjører fortsatt varselpasset.
7. `return NextResponse.json({ ok: true, checked, started, blocked })` (:161-166).

Idempotent markørkolonne-sweep, mønsteret å kopiere (`lib/notifications/autoStartBlocked.ts:67-82`):
```ts
const { data: won, error: updErr } = await admin
  .from('games')
  .update({ auto_start_blocked_notified_at: new Date().toISOString() })
  .eq('id', gameId)
  .is('auto_start_blocked_notified_at', null)
  .eq('status', 'scheduled')
  .select('id')
  .maybeSingle<{ id: string }>();
if (updErr || !won) return;
await notify({ ... });
```
Ett atomisk «vinn raden»-UPDATE, kun vinneren gjør side-effekten. Kjent begrensning nedtegnet i docstringen: kolonnen nullstilles aldri.

pg_cron-jobben (`0146_cron_url_apex.sql:18`), for referanse:
```sql
cron.schedule('start-scheduled-games', '* * * * *', $$
  select net.http_post(
    url := 'https://tornygolf.no/api/cron/start-scheduled-games',
    headers := jsonb_build_object('Content-Type','application/json',
               'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 30000)
  where exists (select 1 from public.games
    where status='scheduled' and scheduled_tee_off_at <= now()
      and scheduled_tee_off_at >= now() - interval '7 days')
$$);
```

### Post-steg som skal inn i `runFinishPipeline` — eksakt rekkefølge og klienttype

Alt under kjører etter status-flippen, `lib/games/endGameCore.ts:231-331`. «caller-klient» = `SupabaseClient` sendt inn i `endGameCore`. «service-role» = hjelperen kaller `getAdminClient()` SELV og tar ikke klient.

| # | Linje | Steg | Klient | Idempotent? |
|---|---|---|---|---|
| 1 | :236 | `finishDerivedGames(supabase, gameId, endedAt)` | **caller-klient** | Ja (`expectAffected`-wrappet batch) |
| 2 | :242-248 | `persistResultSummaries({ id, game_mode, mode_config, course_id, hole_segment })` | service-role | Ja (recompute + overwrite). Kjeder ikke `.select()` |
| 3 | :252 | `persistScoreDifferentials(gameId)` | service-role | Ja |
| 4 | :256 | `notifyAchievementUnlocks(gameId)` | service-role (+ push) | **NEI** — bar INSERT uten dedupe |
| 5 | :262 | `generateAndPersistRoundReport(gameId)` | service-role + `getGameWithPlayers` + **Anthropic API** | DB konvergerer, men nytt LLM-kall + ny prosa |
| 6 | :264-274 | `logAdminEvent({ …, eventType: 'game.finished', … })` | service-role | Nei (bar INSERT), men blokkert oppstrøms av `status !== 'active'` |
| 7a | :284-288 | `notifyPlayersGameFinished(players, {id, name}, logContext)` | service-role via `notify()` | Nei |
| 7b | :298-302 | `buildGameFinishedRecipients(supabase, gameId, {course_id, game_mode, mode_config})` | **caller-klient** | Ja (ren lesing) |
| 7c | :303-305 | filtrér til `sendMailByUserId.get(userId) === true` | — | — |
| 7d | :306-325 | `Promise.allSettled(mailRecipients.map(sendGameFinishedNotification(...)))` | ren HTTP (Resend) | Nei |
| 8 | :328 | `revalidateTag(\`game-${gameId}\`, 'max')` | next/cache | — |
| 9 | :329 | `revalidatePath(\`/admin/games/${gameId}\`)` | `lib/i18n/revalidateLocalePath` | — |
| 10 | :330 | `revalidatePath(\`/games/${gameId}\`)` | samme | — |
| 11 | :331 | `return { ok: true, gameName: game.name }` | — | — |

Steg 7a-7d ligger inne i `if (!suppressPerGameNotifications) { … }` (:279) — cup-veien hopper over hele blokken.

**Rekkefølgen er lastbærende:** steg 5 må stå før 7d — `roundReport` føres inn i mailen på :316. Flytter du 5 etter mailblasten, sendes mail uten referat, stille.

**Ingenting etter flippen kan feile avslutningen** — hvert steg er best-effort via egen try/catch eller allSettled. Det er ingen transaksjon og ingen kompenserende sti.

Eksakte signaturer:
```ts
export async function endGameCore(
  supabase: SupabaseClient<Database>,
  gameId: string,
  actor: EndGameActor,
  options: EndGameCoreOptions = {},
): Promise<EndGameCoreResult>
```
`EndGameActor` (:24) `{ id: string; name: string }`. `EndGameSideWinner` (:32-36) `{ category: 'longest_drive' | 'closest_to_pin'; position: 1 | 2; winner_user_id: string | null }`. `EndGameCoreOptions` (:38-77) `{ allowMissing?, suppressPerGameNotifications?, sideWinners?, auditExtras?, logContext? }`, defaults på :124-130. `EndGameCoreResult` (:79-90) `{ ok: true; gameName } | { ok: false; reason: 'not_active'|'no_players'|'not_all_submitted'|'not_all_approved'|'db_winners'|'db_finish' }`.

Tre call-sites totalt: `endGame` (`actions.ts:317`), `endGameWithSideWinners` (`avslutt/actions.ts:50-134`), `lib/cup/actions.ts:352`.

### RLS-skrivekonvolutten for en native oppretter

Rolle `authenticated`, ikke-admin, er spillets `created_by`. Verifisert mot live staging denne økta, bekreftet identisk i prod.

**KAN skrive:**
1. **`games` — ALLE kolonner** på eget spill, inkludert `status='finished'` og `ended_at`. Ingen trigger på `public.games`, ingen kolonne-ACL (`pg_attribute.attacl` NULL på alle 39), `WITH CHECK` krever kun `created_by = auth.uid()`. **Selve flippen trenger ingen service-role.** Eneste bremser: de 12 CHECK-constraintene.
2. **`game_side_winners`** — full INSERT/UPDATE/DELETE/SELECT på rader hvis foreldrespill de opprettet (`game_side_winners creator all`, `cmd=ALL`). Upsert-arbiteren `onConflict: 'game_id,category,position'` er dekket av ekte PRIMARY KEY (`game_side_winners_pkey`, unik btree på `(game_id, category, "position")`, identisk staging/prod) ⇒ `merge-duplicates` virker. Payload: `category ∈ {'longest_drive','closest_to_pin'}`, `position ∈ {1,2}`, `winner_user_id` kan være NULL (= «Ingen kvalifiserte»), `decided_at` defaulter `now()`.
3. **`game_players` — alle kolonner på ANDRE spilleres rader** i eget spill (creator early-return i `guard_game_players_self_update` + `game_players creator update`), UNNTATT `score_differential`. Altså `submitted_at, approved_at, approved_by_user_id, rejection_reason, withdrawn_at, paid_at, team_number, flight_number, course_handicap, result_summary`.
4. **`game_players` på EGEN rad:** `team_number`/`flight_number` (0168-escape), klarering av egen approval til NULL (0159-escape), `result_summary`, `accepted_at`, `tee_gender`, `submitted_at`.

**KAN IKKE skrive — tvinger service-role/serversteg:**
1. **`game_players.score_differential` på ENHVER rad, inkludert egen.** `guard_game_players_score_differential` reiser SQLSTATE 42501 for enhver caller med ikke-null `auth.uid()` som ikke er `is_admin()`. WHS-differensial-frysingen MÅ gå via adminklient. Native får hard feil, ikke stille no-op.
2. Å SETTE (til forskjell fra å klarere) approval på egen `game_players`-rad — selvgodkjennende avslutning er umulig, også for arrangøren.
3. Egen `withdrawn_at`/`withdrawn_by_user_id`, egen `paid_at`, egen `course_handicap` når status er `'active'` eller `'finished'`.

**Fallgruver spec-en ser ut til å anta feil:**
- «Halvskrevet winner-sett er usynlig» gjelder kun ANDRE deltakere (se Konsekvens 5).
- `result_summary` er IKKE beskyttet — enhver spiller kan skrive den på egen rad. Behandler pipelinen den som system-forfattet, er den tilliten ikke håndhevet noe sted i DB-en.
- `score_differential`-frysingen har et INSERT-hull: guarden er BEFORE **UPDATE** only, og `game_players creator insert` finnes. Utenfor scope — eget issue, ikke drive-by.

**VERIFICATION GAP:** ingen fiendtlig-PATCH-testskriv ble utført (økta var lesebegrenset). KAN/KAN IKKE-listen er utledet fra fullstendig opptelling av hvert håndhevingslag (RLS-policies, triggere, tabell- og kolonne-ACL, CHECK-constraints), ikke fra et utført skriv.

### Neste ledige migrasjonsnummer

**`0169_`** (f.eks. `supabase/migrations/0169_games_finish_pipeline_at.sql`). Høyeste fil ved HEAD: `0168_creator_may_group_self.sql`, 169 `.sql`-filer totalt. Påført: staging `20260901165620`, prod `20260901181111` — begge har 0168.

**Ikke navne-match de to hovedbøkene** når du avgjør om prod ligger etter: staging har 174 rader, prod 159, og navnene divergerer (staging `skins` vs prod `skins_format_seed`, staging `drop_dead_same_flight` vs prod `0139_drop_dead_same_flight` osv.). Prod har INGEN migrasjon staging mangler. Skjemaene er i lås — sammenlign skjema, ikke navn.

---

## Åpne risikoer

**1. Halen kan ikke flyttes til telefonen — og det er en produktbeslutning, ikke en teknisk detalj.** Seks av elleve post-steg tvinger service-role. En native avslutning uten serverrundtur eller sweep produserer et ferdig spill uten resultatsammendrag, differensialer, achievements, runde-referat eller «Resultatet er klart»-mail. Bokfør høyt for eieren i produktspråk, eller gate avslutningen bak serveren.

**2. Flippens manglende lås blir farligere hvis halen skilles ut.** I dag maskeres 0-rad-flippen av at `status !== 'active'`-gaten (:153) blokkerer re-inngang i hele pipelinen. Lar uttrekket post-steg kjøre uavhengig av den gaten, mister du den beskyttelsen samtidig som du ikke har fått en optimistisk lås. Rekkefølgen betyr noe: legg til lås + rad-assertion i SAMME steg som du skiller ut halen, ikke etter.

**3. Dobbelkjørings-sikkerhet er ujevn på tvers av post-stegene.** `persistResultSummaries` og `persistScoreDifferentials` tåler re-kjøring. `generateAndPersistRoundReport` konvergerer i DB, men fakturerer et nytt Anthropic-kall (`claude-sonnet-5`, 800 tokens) og skriver ny prosa hver gang — den er ikke betinget av at `round_report` allerede er satt. `notifyAchievementUnlocks` er direkte skadelig ved re-kjøring: `notify()` er en bar INSERT, og prod har **ingen** unik indeks på `public.notifications` (kun `notifications_pkey(id)` + tre ikke-unike `(user_id, created_at)`-btrees) ⇒ hver spiller får duplikate achievement-varsler og ny push. Finish-mailen er likeledes re-sendbar. **En sweep MÅ ha en markørkolonne på `games`** — det finnes ingen i dag — med nøyaktig `.update({col: now}).is(col, null)`-vinn-raden-formen.

**4. `game_side_winners`-skrivet fra native er uavklart.** Winners skrives før flippen, mens `status` er `'active'`, og SELECT-policyen krever `'finished'` + medlemskap — men `creator all` (cmd=ALL) OR-er inn. Om PostgREST returnerer representasjonen for oppretteren i den situasjonen er ikke empirisk bekreftet. `endGameCore` unngår spørsmålet ved å ikke kjede `.select()`. **Kjør en faktisk staging-test før modulen kodes.** Ikke anta noen av utfallene, og ikke løs det ved å slakke policyen.

**5. Testsuiten gir falsk trygghet under uttrekket.** Ingen `endGameCore.test.ts`. De fire post-steg-hjelperne er ikke mocket — de kjører for ekte, nøytralisert av tilfeldigheter (server-only-alias, tom admin-kø, manglende API-nøkkel). `buildSupabaseMock` er FIFO, så omrokering av DB-kall tildeler canned-svar til feil query uten at noe rødner. `expect(notifyMock).toHaveBeenCalledTimes(2)` (:830) er avhengig av at `notifyAchievementUnlocks` finner null momenter. Skriv kjernens tester før flyttingen; kjør `npx vitest run 'app/[locale]/admin/games/[id]/actions.test.ts'` etter hvert steg.

**6. Cup-ens ett-trykks-avslutning kan knekke med helgrønn suite.** `lib/cup/actions.ts:352` har null enhetsdekning. Blander uttrekket sammen klientsemantikken (caller-klient for steg 1 og 7b, service-role for resten) til «én klient», endres autorisasjonen på cup-veien — bevisst dokumentert i `endGameCore`s JSDoc :102-105, fordi en klubb-styrer ikke er spillenes oppretter (AGENTS.md trap 3). Krever test eller eksplisitt staging-klikkrunde.

**7. Prod-brannmuren er den lange stangen for sweepen.** Ny `cron.schedule(...)` = prod-DB-migrasjon ⇒ #1074 (eier må `touch .claude/approve-prod` i **worktree-stien**), og prod-DB-migrasjoner auto-merges aldri. Vurder å utvide den eksisterende jobben i stedet — null ny infrastruktur, null nytt Vault-steg.

**8. Peer-gatens invariant holder ved dataform, ikke ved eksplisitt vakt.** `continue` på :192 hopper strukturelt over peer-sjekken på :194 for en uinnlevert spiller. Det er vakuøst i dag fordi `reopenScorecard` (`actions.ts:389-394`) nuller `submitted_at`, `approved_at`, `approved_by_user_id` og `rejection_reason` i én UPDATE. Innfører en fremtidig sti som nuller `submitted_at` men lar `approved_at` stå, slipper `allowMissing` den raden stille gjennom. Vurder eksplisitt vakt i den uttrukne kjernen.

**9. Ufiltrert roster inn i varsel-fan-out.** `players` på :284 inneholder fortsatt trukne rader, og `buildGameFinishedRecipients` filtrerer kun gjester (:102-116), aldri trukne. Det er dagens oppførsel. En refactor som «rydder» ved å filtrere trukne er en bruker-synlig endring, ikke en no-op.

**10. Trukne spilleres unntak er lastbærende for cup.** Den ene `continue` på :184 fritar trukne fra BEGGE gatene, og `lib/cup/matchSubmissionStatus.ts:28/:59` samt `lib/cup/computeCupLeaderboard.ts:61` er avhengige av det («en fullt trukket kamp lukkes fortsatt via WD-hoppet»). Ikke «stram opp» den.

**11. Uverifisert: Vercels publiserte Hobby-cron-grenser.** To søk i Vercel-docs-MCP ga kun konfigurasjonssyntaks. Repoets egen nedtegnede tro (1/dag) står tre steder og bærer hvert eksisterende designvalg. Moot så lenge sweepen går via pg_cron — men ikke sitér den som verifisert.

**12. To stale kommentarer funnet i forbifarten (ikke fikset — I4, eget issue):** `persistScoreDifferentials.ts:30` navngir `endGameMarkingWithdrawals` som caller, men den eksporten finnes ikke lenger i `actions.ts`; og `actions.test.ts:11-20` dokumenterer `endGameCore`s games-select uten `hole_segment`, som `endGameCore.ts:140` har hatt siden #1441.