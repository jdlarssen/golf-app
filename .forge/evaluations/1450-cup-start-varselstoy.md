# Evaluering: #1450 — ett start-varsel per spiller ved cup-start

**Verdikt:** ACCEPT
**Runde:** 1
**Dato:** 2026-08-08

## Gate-resultater

Alle kjørt i denne worktreen på Node v22.23.0 (`source ~/.nvm/nvm.sh && nvm use 22`).

**1. Målrettet vitest**

```
$ npx vitest run lib/notifications/startNotificationTargets.test.ts \
    lib/notifications/events.test.ts lib/games/syncDerivedGamesStatus.test.ts
 RUN  v4.1.6 .../contract-issue-1458-bba865
 Test Files  3 passed (3)
      Tests  42 passed (42)
   Duration  872ms
```

**2. Full suite (regresjonssjekk)**

```
$ npx vitest run
 Test Files  449 passed (449)
      Tests  5735 passed (5735)
   Duration  111.07s
```

Null feil, null skip-rapporterte brudd.

**3. Build**

```
$ set -o pipefail && npm run build
BUILD_EXIT=0
```

**4. Lint**

```
$ npm run lint
✖ 56 problems (0 errors, 56 warnings)
```

Warnings er de kjente pre-eksisterende kompleksitets-advarslene
(`sideTournament.ts`, `wolf.ts`, `deeplink.ts`, `fitsPlayerCount.ts`) — ingen i
filene denne PR-en rører.

**5. Nettleser/Playwright:** ikke kjørt, og ikke relevant. Endringen har ingen
UI-flate — den består av en cron-rute (`POST /api/cron/start-scheduled-games`),
en ren selektor-modul og en guard i varsel-fan-outen. Det finnes ingen skjerm å
klikke gjennom. (Dette er eksplisitt konstatert, ikke stille hoppet over — se
«Hva jeg IKKE kunne verifisere» for hva det faktisk koster.)

## Kriterie-for-kriterie

| # | Kriterium | Verdikt | Bevis (som JEG produserte) |
|---|---|---|---|
| K1 | Sweep med alle fire bunt-spill fra én flight → nøyaktig ett `game_started` per spiller, uavhengig av `due`-rekkefølge | ✅ | Håndtracet `route.ts:107–152` → `notifyStartedGames` → `pickStartNotificationTargets`. Fase 1 pusher kun flipp-vinnere (`if (result.started)`, l.111/124). Fase 2 filtrerer `source_game_id != null` (l.180), sorterer på `(SEGMENT_ORDER, id)` og krever `(tournamentId, playerId)`-nøkkelen uclaimet. Greensome (front9) og best ball (back9) deler `tournament_id`, så best ball taper alle fire spillerne → utelates (`playerIds.length > 0`-gaten). Sorteringen leser aldri input-rekkefølgen. Testene i `startNotificationTargets.test.ts` (3 permutasjoner + eksplisitt `toEqual`) kjørte grønt hos meg. Verifisert mot ekte prod-data at bunt-spillene faktisk har `tournament_id` satt (se K5-raden) — uten det ville dedup-nøkkelen vært inert |
| K2 | Det ene varselet peker på greensome (front9-verten) | ✅ | `generateSplitDayPlan` (`lib/cup/cupPairing.ts:253/264/277/289`) setter greensome=`front9`, best ball=`back9`, begge singles=`back9`+`sourceId`. `SEGMENT_ORDER` gir front9=0 < back9=2 → greensome sorterer først. Prod-query bekrefter samme form på ekte rader (`greensome_matchplay/front9/host`, `best_ball/back9/host`, `singles_matchplay/back9/derived`). Deeplink for `game_started` bruker `payload.game_id` (`lib/notifications/deeplink.ts:105`) → spilleren lander på greensome-spillet |
| K3 | `notifyPlayersGameStarted` skriver ingenting når `sourceGameId != null` | ✅ | Lest `lib/notifications/events.ts:100–106`: `if (game.sourceGameId != null) return;` ligger FØR `getAdminClient()`/`users`-oppslaget, altså før enhver I/O. Testen `#1450: avledet cup-match varsler aldri` asserter `notifyMock` og `usersReturnsMock` = 0 kall, og kjørte grønn i min vitest-kjøring |
| K4 | Alle tre start-veiene sender `sourceGameId`; typesjekken tvinger det | ✅ | Grep over `app lib e2e components` gir nøyaktig tre produksjons-kallsteder: `admin/games/[id]/actions.ts:129` (utvidet select til `name, source_game_id`), `games/[id]/(home)/page.tsx:400` (`game.source_game_id`, feltet ligger i `GAME_SELECT` l.174 og i `GameRow` l.170), `api/cron/.../route.ts:209`. Ingen fjerde kallsted. Feltet er påkrevd i signaturen (ikke `?`), og `npm run build` → EXIT=0 hos meg |
| K5 | Spill uten `tournament_id` dedupes aldri | ✅ | `startNotificationTargets.ts:78–81`: `if (game.tournamentId == null) { playerIds.push(...); continue; }` — nøkkelen bygges aldri, `claimed` røres aldri. Testene «to samtidige runder gir to varsler» og «to ulike cuper → ett per cup» grønne. Sjekket også motsatt vei mot prod: `games_tournament_id_fkey` er `ON DELETE SET NULL`, så en slettet cup KAN etterlate bunt-spill med `tournament_id = null` — men `deleteTournament` (`lib/cup/actions.ts:523–538`) sletter alle aldri-spilte matcher først, så foreldreløse rader er alltid `finished`/spilt og treffer aldri `status='scheduled'`-due-spørringen. Edge-casen er ikke nåbar |
| K6 | Sweep der kun avledede spill startet → null varsler | ✅ | To lag: `route.ts:180` filtrerer dem bort før tropp-oppslaget, og `startNotificationTargets.ts:69` filtrerer igjen. Testen «kun avledede spill startet → ingen varsler» grønn. Bekreftet at `game_started` kun emitteres fra `lib/notifications/events.ts:136` (grep på `'game_started'` i `app lib`) — regelen har faktisk ett hjem |
| K7 | De to utdaterte kommentarene beskriver F3d-virkeligheten | ✅ | Ny `syncDerivedGamesStatus.ts`-docstring hevder at cup-generatoren setter `scheduled_tee_off_at` på BEGGE pass — verifisert: `insertMatch` er delt av begge pass og setter feltet ubetinget (`admin/cup/[id]/generer/actions.ts:412`), og `resolveScheduledTeeOffAt` returnerer non-null når cup-start er satt (`lib/cup/splitDayLineup.ts:252`). Prod-query bekrefter `has_tee_off: true` på ekte host- OG avledede bunt-rader. Påstanden om at en avledet match nå også kan plukkes opp av cron/E1 er korrekt: verken due-spørringen (`route.ts:86–89`) eller E1-grenen (`page.tsx:344–348`) filtrerer på `source_game_id`. Den nye page.tsx-kommentaren er tilsvarende korrekt |

## Funn

**1. `route.ts` + K3/K4 — fase 2 hardkoder `sourceGameId: null` i stedet for å
videreformidle verdien (severity: lav, ikke blokkerende).**

`app/api/cron/start-scheduled-games/route.ts:211` sender
`{ id, name, sourceGameId: null }`. Verdien er korrekt i dag fordi `notifiable`
(l.180) allerede har filtrert bort avledede spill, men det betyr at ruta
*påstår* svaret i stedet for å svare. Kontraktens egen begrunnelse for at feltet
er påkrevd — «typesjekken tvinger hvert kall-sted til å svare på spørsmålet, i
stedet for at vakten forsvinner i stillhet» — holder derfor ikke for dette ene
kall-stedet.

Failure-scenario: en senere agent fjerner eller myker opp `notifiable`-filteret
på l.180 (f.eks. «hvorfor filtrerer vi to steder?») for å la den ene hjemmet-
regelen i `notifyPlayersGameStarted` gjøre jobben. Guarden fyrer ikke, fordi
`null` er hardkodet — avledede singles begynner å varsle igjen, og bugen fra
#1450 er tilbake uten at noen test faller. Rot-årsaken er at
`StartNotificationTarget.game` er `{ id, name }` og dropper `sourceGameId`, så
ruta *kan* ikke videreformidle det. Fiks: ta `sourceGameId` med i target-typen og
send den videre.

**2. `route.ts` + K1 — et kast i flipp-løkka gjør at allerede startede spill
aldri varsles (severity: lav, ikke blokkerende).**

`notifyStartedGames(admin, startedGames)` kalles først ETTER løkka (l.152).
`startScheduledGame` har ingen ytre `try/catch` (`lib/games/startScheduledGame.ts:68–`;
den returnerer strukturerte `{ ok:false, reason }` for kjente feil, men et
kast fra transport-laget propagerer). Løkkekallet på l.108 er ikke wrappet.

Failure-scenario: sweepen har fem due spill. Spill 1–3 flippes til `active`
(committet i DB). På spill 4 kaster supabase-js (nettverks-/DNS-glipp). Ruta
kaster → 500, og fase 2 kjører aldri. Spill 1–3 er nå `active`, så neste sweep
ser dem ikke (`status='scheduled'`-filteret), og spillerne får ALDRI
`game_started`. Under gammel kode var varselet sendt inline før kastet, så
1–3 var varslet. Kastet er lite sannsynlig (supabase-js returnerer normalt
error-objekter), og både gammel og ny kode lar spill 4–5 stå ustartet, så
deltaen er smal — men den er reell. Fiks: `try { ...løkka... } finally { await
notifyStartedGames(...) }`, eller wrap løkkekroppen.

**Undersøkt og AVVIST som funn:**

- *`hole_segment`-typehullet.* `DueGame.hole_segment` er typet `HoleSegment`
  mens `lib/database.types.ts:679` sier `string`. Jeg sjekket den levende
  prod-skranken: `games_hole_segment_check CHECK (hole_segment = ANY
  (ARRAY['full','front9','back9']))`. En verdi utenfor unionen kan ikke finnes i
  tabellen, så `SEGMENT_ORDER[x]` blir aldri `undefined`. Og selv hypotetisk:
  `undefined - n = NaN`, `NaN !== 0` → komparatoren returnerer `NaN`, som
  `Array.prototype.sort` per spec behandler som `+0` (lik) — stabil sortering
  beholder input-rekkefølgen for det paret. Ingen kast, ingen krasj. Ikke en
  defekt.
- *Regresjon for vanlige (ikke-cup) planlagte spill.* Diffet fase 2 mot den
  fjernede inline-blokken linje for linje: samme tropp-spørring (`user_id`,
  `.is('withdrawn_at', null)`), samme `console.error`-melding og -prefiks ved
  tropp-feil, samme `continue`-semantikk, ingen aktør-eksklusjon (uendret).
  `tournamentId == null` → alle spillere slipper gjennom → identisk tropp i
  varselet. Kun rekkefølgen på notify-kallene på tvers av spill endres
  (segment/id i stedet for due-rekkefølge), noe ingen bruker kan observere.
- *`startedGames` populeres feil.* Kun `if (result.started)`-grenen pusher
  (l.111–124); ingen dobbel-push, ingen push på `started:false` eller `blocked`.
- *Tapt varsel når en spiller åpner en avledet singles først (E1).* Guarden
  undertrykker varselet, men verten (samme tee-off-minutt) startes av neste
  cron-sweep og varsler da med greensome-lenken. Netto: bedre, ikke tapt.

## Hva jeg IKKE kunne verifisere

- **Ende-til-ende på staging.** Ingen ekte splittet cup-dag ble auto-startet mot
  `torny-staging` for å telle faktiske push-varsler. Beviset for K1/K2 er
  koden + enhetstester + skjema-verifisering mot levende prod, ikke en
  observert varsel-kø. Kjeden mellom `pickStartNotificationTargets` og en push
  på en telefon (`notify()` → `notifications`-rad → web-push) er uendret av
  denne PR-en, så risikoen er lav — men endringen ER bruker-synlig (egen
  CHANGELOG-linje, `fix`-prefiks), og repo-konvensjonen ber om en
  staging-klikkrunde av berørt flyt før merge. Her finnes ingen flate å klikke,
  så det nærmeste ville vært å planlegge en cup-start på staging og lese
  `notifications`-tabellen etterpå. Det gjorde jeg ikke.
- **Cron-rutas oppførsel under `maxDuration = 60`.** Tropp-oppslagene er flyttet
  fra inne i løkka til etter den. Totalt antall rundturer går NED (avledede spill
  hoppes over), men jeg har ikke målt latens på en stor sweep.
- **At `startScheduledGame` faktisk aldri kaster i produksjon.** Funn 2 hviler
  på at et kast er mulig, ikke på at det er observert. Jeg fant ingen ytre
  try/catch; jeg fant heller ingen logg som viser at det har skjedd.

---

# Runde 2 — skeptisk re-evaluering etter fikse-commiten

**Verdikt:** ACCEPT
**Runde:** 2
**Dato:** 2026-08-08
**Evaluert commit-range:** `git diff origin/main...HEAD` @ `7f5a562c`
**Utgangspunkt:** default NEEDS WORK. Hvert kriterium er re-utledet fra kode jeg
leste i DENNE kjøringen; ingenting er arvet fra runde 1 eller fra kontraktens
egne avkryssinger.

## Gate-kjøringer (alle kjørt av meg, Node v22.23.0)

**1. Full vitest-suite**

```
$ source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run
 RUN  v4.1.6 /Users/jdl/.../contract-issue-1458-bba865
 Test Files  449 passed (449)
      Tests  5735 passed (5735)
   Duration  133.81s
VITEST_EXIT=0
```

**2. Build**

```
$ set -o pipefail && npm run build
… ƒ Proxy (Middleware) / route-tabell skrevet ut …
BUILD_EXIT=0
```

**3. Lint**

```
$ npm run lint
✖ 56 problems (0 errors, 56 warnings)
LINT_EXIT=0
```
Grep over lint-outputen etter `startNotificationTargets|start-scheduled-games|notifications/events|syncDerivedGamesStatus`: **ingen treff** — alle 56 warnings er pre-eksisterende og i filer denne PR-en ikke rører.

**4. Nettleser/Playwright: ikke kjørt, og ikke relevant.** Endringen består av en
cron-rute (`POST /api/cron/start-scheduled-games`), en ren selektor-modul, en
guard i varsel-fan-outen og to docstrings. Det finnes ingen UI-flate å klikke
gjennom. Dette er eksplisitt konstatert, ikke stille hoppet over — hva det
faktisk koster står under «Hva jeg IKKE kunne verifisere».

## De to runde-1-fiksene — holder de?

### Fiks 1: `try { løkke } finally { await notifyStartedGames(...) }`

| Spørsmål | Svar | Bevis |
|---|---|---|
| Endrer `finally` HTTP-responsen? | Nei | `finally`-blokka har verken `return` eller `throw`. Normal vei: løkka fullfører → `finally` varsler → `return NextResponse.json({ok:true,…})` (route.ts:161). Kast-vei: `finally` varsler → den opprinnelige feilen re-kastes → Next svarer 500, som før |
| Kan den svelge/maskere den opprinnelige feilen? | Nei | Kjørte språk-probe i node 22: `try { throw ORIGINAL } finally { await asyncSomKasterOgFanger() }` → `swallowed inner` → `finally ran` → **`propagated: ORIGINAL`**. En `await` i `finally` erstatter kun feilen hvis den selv rejecter |
| Kan `notifyStartedGames` rejecte? | Nei | route.ts:188–189 (`filter` + `length === 0 return`) ligger UTENFOR try-en, men ingen av dem kan kaste (`startedGames` er alltid en array). Alt annet — tropp-oppslag, `pickStartNotificationTargets`, `notifyPlayersGameStarted` — ligger inne i `try { … } catch { console.error }` (l.191/224). Ingen rejection kan escape |
| Fyrer varsler nå på en vei de ikke burde? | Nei | De eneste kast-kildene i løkka er `startScheduledGame` (l.114), `revalidateTag` (l.121) og `maybeNotifyAutoStartBlocked` (l.143). `startDerivedGames` kan aldri kaste — hele kroppen er try/catch (`syncDerivedGamesStatus.ts`: lookup-catch + per-spill-catch). Spillene i `startedGames` er alle flippet til `active` og committet i DB; å varsle dem er riktig uansett hva som kastet etterpå. Kaster spill nr. 1, er `startedGames` tom → `filter` → tidlig return → null I/O |
| Retry-dobling? | Nei | Spill 1–3 står som `active`, så neste sweep sin `status='scheduled'`-gate ser dem ikke → ingen andre varsel-runde |

Nettoen mot pre-#1450: identisk. Der gammel kode varslet inline før kastet,
varsler ny kode i `finally`. Runde 1-funn 2 er tettet uten ny defekt.

### Fiks 2: `StartNotificationTarget.game` bærer `sourceGameId`

- `startNotificationTargets.ts:27` — `game: { id, name, sourceGameId: string | null }`.
- `startNotificationTargets.ts:100` — targeten bygges med `sourceGameId: game.sourceGameId`, altså den ekte verdien fra `StartedGameForNotify`, ikke en påstand.
- Verdien som når ruta: `route.ts:212` mapper `sourceGameId: game.source_game_id` fra `DueGame`, som kommer rett fra `select('… source_game_id')` (l.86). Ingen hardkodet `null` igjen i fila (grep bekrefter).
- **Kall-steds-grep** (`grep -rn "notifyPlayersGameStarted" --include=*.ts --include=*.tsx app lib e2e components`): nøyaktig **tre** produksjons-kallsteder, alle med ekte verdi:
  - `app/api/cron/start-scheduled-games/route.ts:218` → `target.game` (bærer `sourceGameId`)
  - `app/[locale]/games/[id]/(home)/page.tsx:404` → `game.source_game_id` (feltet ligger i `GAME_SELECT` l.174 og i `GameRow` l.170)
  - `app/[locale]/admin/games/[id]/actions.ts:136` → `gameRes.data.source_game_id` (select utvidet til `'name, source_game_id'`)
  Ingen fjerde. Feltet er påkrevd i signaturen (`lib/notifications/events.ts:102`, ikke `?`) — `npm run build` EXIT=0 beviser at alle tre tilfredsstiller typen.
- **Kan guarden omgås?** `lib/notifications/events.ts:105–106`: `if (players.length === 0) return; if (game.sourceGameId != null) return;` — begge FØR `getAdminClient()`, altså før enhver I/O. Og `'game_started'` emitteres fra ett eneste sted i hele `app/` + `lib/`: `events.ts:136` (grep). Regelen har faktisk ett hjem.

## Kriterie-for-kriterie (re-utledet i runde 2)

| # | Kriterium | Verdikt | Bevis jeg produserte nå |
|---|---|---|---|
| K1 | Sweep med alle fire bunt-spill → nøyaktig ett `game_started` per spiller, uavhengig av `due`-rekkefølge | ✅ | Håndtracet ny `route.ts:112–159`: fase 1 pusher kun på `result.started` (l.117/130), fase 2 kalles én gang. `pickStartNotificationTargets` sorterer på `(SEGMENT_ORDER, id)` (l.77–81) og leser aldri input-rekkefølgen; `claimed`-settet (l.83, nøkkel `tournamentId:playerId`) gir hver spiller ett spill per cup. `startNotificationTargets.test.ts:94–108` kjører tre permutasjoner mot `toEqual` — grønne i min fulle suite-kjøring. `try/finally` endrer ikke hvilke spill som havner i `startedGames` |
| K2 | Det ene varselet peker på greensome (front9-verten) | ✅ | `lib/cup/cupPairing.ts:246–291` (lest nå): greensome=`front9`, best_ball=`back9`, begge singles=`back9`+`sourceId: bestBall.id`. `SEGMENT_ORDER` (l.35–39) gir front9=0 < back9=2 → greensome sorteres først og claimer alle fire spillerne; best ball ender med `playerIds.length === 0` og utelates (l.98). Deeplinken for `game_started` er `/games/${payload.game_id}` (`lib/notifications/deeplink.ts:104–107`) → spilleren lander på greensome. Test `:79–92` asserter nøyaktig ett target med `id: 'g-greensome'` og alle fire spillerne |
| K3 | `notifyPlayersGameStarted` skriver ingenting når `sourceGameId != null` | ✅ | `events.ts:106` — guarden ligger før `getAdminClient()` (l.108). Testen «#1450: avledet cup-match varsler aldri» (`events.test.ts:304–319`) asserter både `notifyMock` OG `usersReturnsMock` = 0 kall. Grønn i full suite |
| K4 | Alle tre start-veiene sender ekte `sourceGameId` | ✅ | Grepet over — tre kallsteder, ingen hardkodet `null` igjen (fiks 2). Feltet påkrevd; `npm run build` EXIT=0 |
| K5 | Spill uten `tournament_id` dedupes aldri | ✅ | `startNotificationTargets.ts:89–92`: `if (game.tournamentId == null) { playerIds.push(playerId); continue; }` — nøkkelen bygges aldri, `claimed` røres aldri. Testene `:139` (to frittstående spill → to targets) og `:147` (to cuper → ett per cup) grønne |
| K6 | Sweep der kun avledede spill startet → null varsler | ✅ | To lag, begge lest nå: `route.ts:188` filtrerer `source_game_id == null` FØR tropp-oppslaget, og `startNotificationTargets.ts:75` filtrerer igjen. Test `:110–113` grønn. Tredje lag: guarden i `events.ts:106` |
| K7 | De to utdaterte kommentarene beskriver F3d-virkeligheten | ✅ | Verifisert påstanden selv, ikke via runde 1: `insertMatch` (`admin/cup/[id]/generer/actions.ts:374`) kalles av BEGGE pass (l.453 verter, l.472 avledede) og setter `scheduled_tee_off_at: resolveScheduledTeeOffAt(...)` ubetinget (l.410); `resolveScheduledTeeOffAt` (`lib/cup/splitDayLineup.ts:249–257`) returnerer non-null så snart cup-start er satt. Så ja: hver generert match får et tee-off-tidspunkt, og både cron-en (l.88, ingen `source_game_id`-filter) og E1-grenen kan plukke opp en avledet match. Begge nye kommentarer (`syncDerivedGamesStatus.ts:170–186`, `page.tsx:381–386`) stemmer med koden |

## Versjonering / CHANGELOG

| Sjekk | Resultat |
|---|---|
| `5318da86` (`fix:`, bruker-synlig) | `1.229.0 → 1.229.1` = PATCH ✓, CHANGELOG-linje lagt til ✓ |
| `7f5a562c` (`fix:`, intern herding) | `1.229.1 → 1.229.2` = PATCH ✓, `[no-changelog]` i subject ✓ |
| `.githooks/commit-msg` bump-TYPE-vakt | `fix` krever PATCH; begge er PATCH → hooken ville passert begge |
| `[no-changelog]` berettiget? | Ja. `docs/changelog-conventions.md` §«Bare det en bruker ville merke»: en bruker merker ingen forskjell på `7f5a562c` utover det `1.229.1`-linja alt beskriver. Gråsone-notat: fiks 1 (`finally`) ER en oppførselsendring i en sjelden feilvei, ikke ren refactor — men den er ikke uavhengig observerbar, og en egen linje ville duplisert 1.229.1 |
| CHANGELOG-telling | `<summary>August 2026 · 29 rettinger</summary>` (l.1458). Talte `^- \`` mellom l.1458 og seksjonens `</details>` (l.1489): **29**. Stemmer ✓ |
| Versjons-etikett `1.229.1` mens `package.json` er `1.229.2` | Konsistent med resten av fila — CHANGELOG-linjer bærer versjonen de shippet i, og fila har mange versjons-hull |

## Funn

**1. `.forge/contracts/1450-cup-start-varselstoy.md` + K4/K6 — evidens-linjenumrene inn i `route.ts` er utdaterte (severity: svært lav, dokumentasjon).**

Kontrakten ble krysset av i `d0967b28`, og `7f5a562c` forskjøv `route.ts` etterpå.
K4 peker på `route.ts:211` — kallet ligger nå på **218**. K6 peker på `route.ts:180`
for `notifiable`-filteret — det ligger nå på **188** (l.180 er blitt en
docstring-linje). De øvrige refene sjekket jeg og de treffer:
`events.ts:106` ✓, `admin/games/[id]/actions.ts:136` ✓, `page.tsx:404` ✓,
`events.test.ts:305` ✓ (inne i #1450-testen), `syncDerivedGamesStatus.ts:174` ✓.

*Failure-scenario:* en senere agent slår opp K6-evidensen for å forstå hvorfor
avledede spill filtreres to steder, lander på en kommentarlinje inne i
`notifyStartedGames`-docstringen, konkluderer med at kontrakten beskriver noe
som ikke finnes, og fjerner filteret. Kost: én forvirret økt, ikke en prod-bug
(selektorens eget filter på `startNotificationTargets.ts:75` fanger fortsatt
alt). Ikke blokkerende.

**2. `app/api/cron/start-scheduled-games/route.ts` + K1 — to-fase-orkestreringen og `try/finally` har null testdekning (severity: lav, ikke blokkerende).**

`grep -rl "start-scheduled-games"` over test-filer gir kun `lib/notifications/events.test.ts`
(og bare som `logPrefix`-streng). Ruta har ingen egen test — verken før eller
etter denne PR-en. Den rene logikken er godt dekket (13 tester i
`startNotificationTargets.test.ts`), men limet er det ikke: at fase 1 kun pusher
flipp-vinnere, at fase 2 kalles i `finally`, og at `notifiable`-filteret ligger
før tropp-oppslaget, hviler utelukkende på lesning.

*Failure-scenario:* en senere refaktorering flytter `startedGames.push(game)`
opp foran `if (result.started)`-gaten (f.eks. under en opprydding av
løkkekroppen), eller fjerner `finally`-en som «unødvendig kompleksitet».
Spillere som IKKE startet får da varsel, eller startede spill mister varselet
sitt — og hele suiten (5735 tester) forblir grønn. Begge runde-1-funnene bodde
i akkurat dette utestede limet, og fiksen for dem er selv utestet. Merk at repoet
ikke har cron-rute-tester fra før, så dette er en konvensjons-konform mangel, ikke
et brudd på test-disiplinen — derfor lav, ikke blokkerende.

**Undersøkt og AVVIST som funn i runde 2:**

- *`finally` maskerer feilen.* Motbevist empirisk med node-probe (se tabell over) — `ORIGINAL` propagerer.
- *`notifyStartedGames` kan rejecte ut av `finally`.* Kodelesning: alt utenfor den indre try-en er `Array.prototype.filter` + en `length`-sjekk.
- *`startDerivedGames` kaster og hopper over `startedGames.push`.* `startDerivedGames` fanger ALT (lookup-catch + per-spill-catch) og returnerer alltid `{startedCount, failedIds}`. Kan ikke kaste.
- *Tapt varsel når E1 flipper en avledet singles hvis verten er permanent blokkert.* Teoretisk: guarden undertrykker singles-varselet, og en vert som aldri starter varsler aldri. Men verten er `best_ball` og den avledede er `singles_matchplay` med et DELSETT av samme tropp — de strukturelle blokk-grunnene (ufulle matchplay-sider, uinndelte flights) treffer den avledede minst like hardt som verten. Fant ingen konstruerbar sti der verten blokkeres mens den avledede går gjennom. Ikke en defekt jeg kan demonstrere.
- *Regresjon for vanlige (ikke-cup) planlagte spill.* `tournamentId == null` → hver spiller pushes uten å røre `claimed` → hele troppen i ett target, som før. Tropp-spørringen i fase 2 (l.194–199) er tegn for tegn den gamle (`user_id`, `.is('withdrawn_at', null)`), samme `console.error`-prefiks, samme skip-semantikk.
- *Dobbelt varsel etter 500 + cron-retry.* Startede spill står som `active` og faller ut av `status='scheduled'`-gaten.

## Hva jeg IKKE kunne verifisere

- **Ende-til-ende på staging.** Jeg planla ingen ekte splittet cup-dag på `torny-staging` og telte ingen faktiske rader i `notifications`. Beviset for K1/K2 er kode + enhetstester + generator-lesning, ikke en observert varsel-kø. Kjeden fra `pickStartNotificationTargets` til en push på en telefon er uendret av denne PR-en, så risikoen er lav — men endringen ER bruker-synlig (egen CHANGELOG-linje, `fix`-prefiks), og repo-konvensjonen ber om en staging-runde av berørt flyt før merge. Her finnes ingen flate å klikke; det nærmeste ville vært å planlegge en cup-start på staging og lese `notifications`-tabellen etterpå. Det gjorde jeg ikke.
- **At `startScheduledGame` faktisk kan kaste i produksjon.** `try/finally`-fiksen er forsvar mot et kast jeg ikke har observert i noen logg. Fiksen koster ingenting og er trygg (bevist over), men gevinsten er hypotetisk.
- **Levende skjema.** Runde 1 kjørte prod-queries mot `games_hole_segment_check` og `games_tournament_id_fkey`. Jeg gjentok ikke de spørringene i runde 2 — ingen av de to fikse-commitene rører skjema, spørringer eller kolonner, så konklusjonene fra runde 1 kan ikke ha blitt ugyldige av dem. Men det er arvet evidens, ikke min egen.
- **Latens under `maxDuration = 60`.** Ikke målt. `finally`-en legger varsel-passet etter et evt. kast, så en sweep som kaster sent kan nå bruke litt mer tid enn før.
