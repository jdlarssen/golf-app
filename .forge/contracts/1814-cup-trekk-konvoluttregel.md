# Kontrakt #1814 — Trekk underveis i cup: konvoluttregelen

**Issue:** [#1814](https://github.com/jdlarssen/golf-app/issues/1814)
**Branch (kontraktøkt):** `claude/cup-withdrawal-contract-7834ab`
**Klasse:** bruker-synlig (`feat`) · **Produktvalg:** NEI — alle valg er tatt av eieren
2026-08-30 (issue-kommentar) og 2026-09-02 (denne økta, fire tap-spørsmål).
**Prod-migrasjon:** INGEN. Kontrakten er designet uten skjemaendring. Trenger
byggeren likevel en kolonne/CHECK-endring: STOPP og eskaler — prod-migrasjon er et
eget eiersteg som ikke er gitt her (#1074-luken).

## Problem

En spiller som blir syk/skadet midt i en cup har i dag ingen vei ut: `removeCupParticipant`
og `addCupParticipant` er draft-only, spillerbyttet (#1473/#1804) er et bytte og krever en
reserve, og en full personlig cup ender i blindveien issuet beskriver. Verre: venterommet på
en planlagt cup-kamp tilbyr «Trekk deg» (`/games/[id]/trekk-fra`), som SLETTER
`game_players`-raden pre-start (`withdrawFromGame`) — det knekker kampen stille (siden blir
ufullstendig, auto-start blokkerer for alltid). Eieren har bestemt Ryder Cup-modellen:
**trekk er et trekk, ikke et bytte.**

## Eierbeslutninger (låst — ikke ta opp igjen)

| # | Beslutning |
|---|---|
| E1 | Ingen erstatter settes inn ved trekk underveis. Trukne spilleres **ikke-startede** kamper spilles ikke. |
| E2 | Trekk ≥ 30 min før kampens tee-off → kampen **halveres** (`tie_points` til hvert lag). Trekk < 30 min før tee-off (eller etter) → **walkover-tap**, motstanderlaget får `win_points`. |
| E3 | Startede og ferdige kamper røres aldri. |
| E4 | **Par-kamper (svar på spm. 1):** i **fourball** kan makkeren spille alene (én ball mot to). Makkeren bestemmer, ev. arrangøren — men det er **arrangøren som registrerer valget i appen**, og arrangøren kan overstyre. I foursomes, greensome, chapman og gruesome (delt ball) finnes ikke alene-valget; regelen E2 gjelder alltid. |
| E5 | **Deltakerlista (spm. 2):** den trukne blir stående på laget sitt, merket «Trukket». Spilte kamper og poeng beholdes i spillerregnskapet. |
| E6 | **Plassen (spm. 3):** trekket frigjør ingen plass. Den trukne teller fortsatt mot taket. Bytte FØR kampstart består som i dag (også etter cupstart). En kamp som er avgjort ved trekk kan ikke få noen byttet inn etterpå. |
| E7 | **Hvem (spm. 4):** både spilleren selv og arrangøren kan registrere trekk. Kun arrangøren kan angre, og bare for kamper som ennå ikke har startet. Ingen egen frist — 30-min-regelen avgjør per kamp. |

**ASSUMPTION (eierens «bytte etter kampstart går som trekk»):** lest som «etter at en kamp
har startet finnes ikke bytte; et fravær håndteres som trekk for de gjenstående kampene,
mens den startede kampen spilles ferdig slik den står». Eieren kan korrigere i PR-en.

## Prior decisions som binder

- **#386 (WD):** `game_players.withdrawn_at` + `withdrawn_by_user_id` er trekk-mekanikken;
  angre = null. `supportsWithdrawal` holder matchplay utenfor med vilje — **rør ikke
  predikatet**; cup-trekket går utenom det (egen inngang, egen semantikk).
- **#1441 D3/D4:** en avledet kamp (`source_game_id`) deler spillere med host-en; alt som
  rører spillerrader gjøres på hele bunten (presedens: `planCupMatchSwap.bundleIds`).
- **#1441 D10 / #1628:** `games.mode_config` bærer alt kamp-spesifikke overstyringer
  (`team_strokes_override`). Fourball-valget lagres der — ingen ny kolonne.
- **#1502/#1488:** `matchSubmissionStatus`, `endGameCore` og `finishTournament` hopper alt
  over trukne rader; en helt trukket aktiv kamp blokkerer ikke ett-trykks-avslutningen.
- **#1804:** deltaker-taket vokter planfasen; trukne teller fortsatt (E6).
- **#1468:** resultater bor på resultatsiden; kampkortet viser nøytral status.
- **Husregel:** destruktiv flyt = egen bekreftelsesside (`/slett`-mønsteret), aldri inline.
- **#1542:** cup-flatene leser med service-role; gaten i ruta ER håndhevelsen.

Prod-sjekk 2026-09-02 (read-only): ingen aktiv cup i prod («Ryder Cup 2026» er avsluttet,
én tom test-draft) — ingen levende data å ta hensyn til ved utrulling.

## Design

### Datamodell (ingen migrasjon)

- **Trekk** = `withdrawn_at`/`withdrawn_by_user_id` settes på spillerens rad i **hver
  ikke-startet kamp** i cupen (`games.status IN ('draft','scheduled')`, host + avledede).
  Aktive/ferdige kamper røres ikke (E3). Spilleren har null gjenstående kamper → ingen
  skriving, informativ melding.
- **Fourball-valget** = `mode_config.withdrawal_play_on: true` på DEN fourball-kampen.
  Fravær/false = «etter regelen». Settes/endres kun av arrangøren (E4), kun mens kampen
  er `scheduled`. Typen legges til i fourball-grenen av `GameModeConfig`.
- **Utfallet lagres ikke** — det utledes deterministisk av `withdrawn_at` mot
  `games.scheduled_tee_off_at` (regel E2). Kamp-radenes `status` forblir `scheduled`.

### Ren regelmodul — `lib/cup/cupWithdrawalOutcome.ts` (Type A, ett hjem)

`WITHDRAWAL_LATE_WINDOW_MS = 30 * 60 * 1000` (eneste hjem for 30-tallet).
`resolveCupMatchWithdrawal(input)` per kamp → `null` eller
`{ outcome: 'halved' | 'walkover', winnerSide: 1 | 2 | 'tied', withdrawnSide: 1 | 2 | 'both', withdrawnUserIds, late: boolean }`:

1. `status` er `active`/`finished` → `null` (E3).
2. Ingen trukket rad på noen side → `null`.
3. Fourball med `withdrawal_play_on === true` og den trukne siden har ≥ 1 aktiv spiller →
   `null` (kampen spilles 1 mot 2).
4. Ellers avgjort. Per trukket side: `late = withdrawn_at > scheduled_tee_off_at − 30 min`
   (én sen trukket rad gjør siden sen). `scheduled_tee_off_at` mangler → aldri sen (ingen
   frist å bryte). Én side trukket: `late` → walkover til motstanderen, ellers halvert.
   **Begge sider trukket → alltid halvert** (ingen får gratis poeng — Claude-avgjørelse).

`CupMatchInput` får `withdrawal?: …` (fra `buildCupMatchEntry`, som også må få
`scheduled_tee_off_at` + `withdrawn_at` inn). `computeCupLeaderboard.pointsForMatch`
teller en kamp når `status === 'finished'` **eller** `withdrawal != null`;
`finishedMatches`/`remainingMatches` regner avgjorte kamper som ferdige.
`computeCupPlayerPoints`: halvert = vanlig delt (begge sider krediteres `tie_points`, som
ekte Ryder Cup-statistikk), walkover = motstanderne krediteres som seier.

### Fourball 1 mot 2 (lib/scoring — test FØRST)

- `fourballMatchplay.compute`: en side med **1** spiller er gyldig (best ball av én = hens
  ball). Eksakt-2-vakten blir «1–2 per side»; `buildSide` mister tuple-antakelsen.
- `computeCupMatchResult`: `sideSize` for fourball blir et intervall (1–2); øvrige moduser
  uendret (eksakt).
- `isSideRosterComplete`/`startScheduledGameCore`: en fourball-side med 1 aktiv + 1 trukket
  rad **og** `withdrawal_play_on` starter normalt. Uten flagget er kampen avgjort (under).
- Fourball-tavla (`leaderboard/formats/fourballMatchplay.tsx`) og hull-/scorekort-sidene må
  tåle en side med én spiller (`buildUniformContext` filtrerer alt trukne; sjekk at ingen
  visning indekserer `[1]` blindt).

### Avgjorte kamper og auto-start

- `startScheduledGameCore` returnerer ny grunn `decided_by_withdrawal` når kampen er
  avgjort per regelmodulen. Cron-sveipet (`start-scheduled-games/route.ts`) behandler den
  som **stille strukturell** — info-logg, INGEN `maybeNotifyAutoStartBlocked` (trekket er
  arrangørens eget valg, ikke en oppsettsfeil). Lazy-start i kamp-hjemmet bruker samme kjerne.
- Kampens venterom (`ScheduledWaitingRoom`/game-home for `tournament_id != null`): når
  kampen er avgjort, vis banner «Kampen er avgjort uten spill — {navn} trakk seg: halvert /
  walkover til {lag}» og skjul nedtelling/start-CTA. Spillerne åpner appen den morgenen.
- `finishTournament`: uendret gate (avgjorte kamper er ikke `active`). Vinneren regnes på
  poeng inkl. avgjorte kamper via `computeCupLeaderboard`.

### Inngang 1 — arrangør: `/admin/cup/[id]/trekk/[userId]` (+ klubbvariant via `cupPath`)

- Lenke «Trekk fra cupen» per spiller i lagrosteret på `CupManagement` (kun cup `active`,
  kun spillere med ≥ 1 ikke-startet kamp). Klubbvariant følger `/spillere`-mønsteret.
- Bekreftelsessiden lister spillerens ikke-startede kamper med konsekvensen **regnet nå**
  («Kamp 3 · i dag 10:00 → halveres» / «→ dømmes som tap for {lag} — under 30 min før
  start»), fourball-kamper får radio «{makker} spiller alene» / «Etter regelen»
  (forhåndsvalg: regelen) med hjelpetekst «Hør med {makker} først — du kan endre valget
  fram til kampen starter». Startede/ferdige kamper listes som «røres ikke». Null
  gjenstående kamper → info, ingen knapp.
- Server-action `withdrawCupPlayer` (`lib/cup/withdrawalActions.ts`, ny fil):
  `requireAdminOrClubAdminOfCup` + cup `active` + spiller i cupen; skriver `withdrawn_at`
  på alle ikke-startede kamper (admin-klient, `expectAffected` per rad — 0 rader = feil, felle
  #2) + `mode_config.withdrawal_play_on` der valgt; TOCTOU-sjekk som i swap: en kamp som
  rakk å bli `active` mellom lesing og skriving hoppes over (ikke rull tilbake resten) og
  nevnes i status-meldingen. Revalider `tournament-${id}`, cup-stiene og `game-${id}` per
  skrevet kamp. Redirect `?status=player_withdrawn`.
- `setFourballWithdrawalChoice` (arrangør, kamp `scheduled`, fourball med trukket rad):
  toggler `withdrawal_play_on`. Vises som lite panel under fourball-kampkortet i
  `CupMatchList` — og som **venter-banner** på `CupManagement` («Velg for Kamp 3: {makker}
  spiller alene, eller etter regelen») så lenge ingen aktivt valg er gjort etter et
  selv-trekk (E4: arrangøren godkjenner/overstyrer).
- `undoCupWithdrawal` (arrangør, cup `active`): nuller `withdrawn_at`/`withdrawn_by` på
  spillerens **ikke-startede** kamper og fjerner `withdrawal_play_on` der. Lenke «Angre
  trekk» ved «Trukket»-merket i rosteret.

### Inngang 2 — spilleren selv: `/cup/[id]/trekk`

- Dempet lenke «Trekk meg fra cupen» på `/cup/[id]` når innlogget bruker er deltaker med
  ≥ 1 ikke-startet kamp (cup `active`). Egen bekreftelsesside med samme konsekvensliste,
  uten fourball-valg (E4 — arrangøren velger; forhåndsvalget «etter regelen» gjelder til
  da). Copy sier at arrangøren får se trekket på cup-siden.
- Action `withdrawSelfFromCup`: auth + deltaker-sjekk (roster ELLER
  `tournament_participants`, samme definisjon som `canViewCupPage`) + cup `active`;
  skriver som over med `withdrawn_by_user_id = self` via admin-klient (0108-triggeren
  nekter selv-PATCH — riktig, gaten er server-action). Ingen selv-angre (E7).
- **Lukk hullet:** for et spill med `tournament_id != null` skal `/games/[id]/trekk-fra`
  og «Trekk deg»-lenkene i venterommet/kamp-hjemmet **rute til `/cup/[id]/trekk`** i stedet
  for pre-start-DELETE. `withdrawFromGame` avviser cup-kamper server-side
  (`game_locked`), så raden aldri kan slettes ad den veien. Liga-runder røres ikke.

### Visning

- `buildCupRoster`: `CupRosterPlayer.withdrawn: boolean` (≥ 1 trukket rad). «Trukket»-
  chip i `CupManagement`-rosteret, på resultatsidens spillerpoeng-rad og der rosteret ellers
  navngis. Merket viser aldri plassering-endring — poeng står (E5).
- `cupMatchStatusKey` får `decidedHalved` / `decidedWalkover` (foran `notStarted`), med
  `data-status` som i dag. Kortet viser «Halvert — {navn} trakk seg» / «Walkover til
  {lag} — {navn} trakk seg» (i18n `no` + `en`); resultatsiden bruker samme tekst i stedet
  for `formatted`. Fourball-kamp med `withdrawal_play_on` viser «{makker} spiller alene».
- `SwapMatchPlayer` skjules for kamper med en trukket rad, og `planCupMatchSwap` avviser
  dem server-side (ny feilkode `match_has_withdrawal`) — E6.
- «{finished} av {total} matcher spilt» teller avgjorte kamper som ferdige.

### Copy

Norsk bruker-copy gjennom `humanizer` før commit. Brand-stemme, ingen «konvoluttregel» i
UI — si hva som skjer: «halveres», «dømmes som tap», «under 30 minutter før start».

## Edge cases & guardrails

- Trekk 20 min før dagens kamp, morgendagens kamper senere: dagens → walkover, resten →
  halvert (regelen regnes per kamp, ikke per trekk).
- `scheduled_tee_off_at` null (eldre cup uten plan): aldri sen → halvert.
- Spiller trekker seg mens en kamp er `active`: den kampen røres ikke; arrangøren avslutter
  den med scorene slik de står (dagens verktøy). Bare ikke-startede kamper flagges.
- Begge sider trukket → halvert. Fourball der begge på samme side trekker seg → avgjort
  (ingen igjen til å spille alene), uansett flagg.
- Splittet cup-dag (#1441): host + avledet skrives sammen; avgjørelsen vises på begge kort.
- Angre etter at tee-off har passert: raden nulles, cron starter kampen neste minutt hvis
  siden er komplett — det er ønsket (arrangøren tok feil, folk er der).
- Lesefeil/skrivefeil → fail-closed, ingenting delvis: samle per-kamp-feil, kompenser som
  swap gjør (`compensate`), ærlig feilkode.
- Ikke-deltaker/utlogget på `/cup/[id]/trekk` → `notFound()`/login-redirect; klubb-cup
  følger `canViewCupPage`-gaten.
- Cup `draft`/`finished` → alle trekk-innganger skjult og actions avviser (`wrong_status`).
- Deltaker-taket: uendret matematikk; trukne teller (E6).

## Claude's Discretion

- Nøyaktig plumbing av `withdrawal` gjennom `cupMatchEntry` → `computeCupLeaderboard` →
  resultatside, så lenge regelen bor i `cupWithdrawalOutcome.ts` alene.
- Varsling til arrangøren ved selv-trekk: `notifications.kind` har DB-CHECK (0032/0044) —
  **ingen ny kind** (ville krevd migrasjon). Enten gjenbruk en eksisterende kind hvis
  kortteksten blir sann for leseren, eller la venter-banneret på cup-siden være signalet
  (akseptabelt v1; #386 presedens). Dokumenter valget i PR-en.
- Om fourball-valget vises som radio på bekreftelsessiden ELLER kun som etterfølgende panel.
- Hvorvidt «Angre trekk» også får en egen liten bekreftelse (anbefalt: ja, samme mønster).

## Success Criteria

- [ ] **SC1 — Regelmodul (Type A):** `lib/cup/cupWithdrawalOutcome.test.ts` dekker med
      `it.each`: i tide → halvert; < 30 min → walkover; nøyaktig 30 min → halvert (grensa
      er «mindre enn»); tee-off null → halvert; begge sider → halvert; aktiv/ferdig kamp →
      null; fourball + `withdrawal_play_on` + 1 aktiv → null; fourball uten flagg → avgjort.
      RED observert før implementasjon.
- [ ] **SC2 — Poeng:** `computeCupLeaderboard` gir `tie_points`/`tie_points` for halvert og
      `win_points` til motstanderen for walkover på en `scheduled` kamp; «først til X» og
      vinner-kåring i `finishTournament` bruker tallene. Test i `computeCupLeaderboard.test.ts`
      + `computeCupPlayerPoints.test.ts` (kreditering).
- [ ] **SC3 — Fourball 1 mot 2:** `fourballMatchplay.test.ts` (RED først) viser at en side
      med én spiller scorer hull-for-hull mot to; `computeCupMatchResult` godtar 1–2 for
      fourball og avviser fortsatt 1 for de andre lag-modusene; `matchplaySides.test.ts`
      dekker start-vakta med trukket rad + flagg.
- [ ] **SC4 — Arrangør-trekk:** action-test (`withdrawalActions.test.ts`, mock-rigg som
      `actions.test.ts`): trekk skriver `withdrawn_at` på ALLE ikke-startede kamper i
      bunten og ingen på aktive/ferdige; fourball-valg skriver `mode_config`; angre nuller
      kun ikke-startede; `wrong_status` på draft/finished; swap avvises på kamp med trukket
      rad.
- [ ] **SC5 — Selv-trekk + hullet lukket:** `withdrawSelfFromCup` skriver med `self` som
      `withdrawn_by`; `withdrawFromGame` returnerer `game_locked` for `tournament_id != null`
      (test i eksisterende withdraw-test eller ny co-located); venterommets lenke peker på
      `/cup/[id]/trekk` for cup-kamper.
- [ ] **SC6 — Auto-start stille:** cron logger `decided_by_withdrawal` uten å kalle
      `maybeNotifyAutoStartBlocked`; fourball med flagg starter (test på
      `startScheduledGameCore`-nivå eller ren vakt-test).
- [ ] **SC7 — Visning:** kampkort (admin + `/cup/[id]`) viser avgjort-status med
      `data-status="decidedHalved"|"decidedWalkover"`; roster viser «Trukket»; venterommet
      viser avgjort-banner; alle nye nøkler i `messages/no.json` OG `messages/en.json`.
- [ ] **SC8 — Staging-bevis før merge:** klikkrunde på `torny-staging` (klon/seed en cup med
      singles + fourball + foursomes): (a) arrangør-trekk i tide → halvert på kortet og ½–½ i
      stillingen; (b) trekk < 30 min → walkover og helt poeng; (c) fourball «spiller alene»
      → kampen starter med 1 mot 2 og scorer; (d) selv-trekk fra venterommet havner på
      cup-trekk-siden, raden slettes ikke; (e) angre. Bevis-kommentar + `staging-verified`.
- [ ] **SC9 — Bokføring:** `.changes/1814-cup-trekk.md` (`feat`, link `/admin/cup`),
      `docs/user-flows.md` A3-raden får `/trekk`, PR-body har «Fordeler/ulemper»-blokken.

## Gates

- [ ] `npx tsc --noEmit` · `npx eslint` på berørte filer · `npx vitest run lib/cup lib/scoring lib/games` grønne, 0 unhandled errors.
- [ ] `npm run build` exit 0 (GameModeConfig-grenen og uttømmende switch-er).
- [ ] Full `npx vitest run` før PR-ready.
- [ ] CI grønn; `staging-verified`-label satt før merge (SC8).
- [ ] Ingen fil under `supabase/migrations/` i diffen. Er det umulig: eskaler, ikke bygg rundt.

## Files Likely Touched

- `lib/cup/cupWithdrawalOutcome.ts` (+test) — ny regelmodul
- `lib/cup/withdrawalActions.ts` (+test) — trekk / angre / fourball-valg / selv-trekk
- `lib/cup/cupMatchEntry.ts`, `getCupSnapshot.ts`, `computeCupLeaderboard.ts`,
  `computeCupPlayerPoints.ts`, `cupRoster.ts`, `cupMatchStatusLabel.ts`,
  `matchSwapValidation.ts`/`actions.ts` (swap-avvisning) — plumbing + visning
- `lib/scoring/modes/fourballMatchplay.ts` (+test), `lib/scoring/modes/types.ts`
  (`withdrawal_play_on` i fourball-config), `lib/cup/computeCupMatchResult.ts`
- `lib/games/matchplaySides.ts` (+test), `lib/games/startScheduledGameCore.ts`,
  `lib/notifications/autoStartBlocked.ts`, `app/api/cron/start-scheduled-games/route.ts`
- `app/[locale]/admin/cup/[id]/trekk/[userId]/` (+ klubbvariant), `CupManagement.tsx`,
  `CupMatchList.tsx`, `SwapMatchPlayer.tsx`
- `app/[locale]/cup/[id]/trekk/`, `app/[locale]/cup/[id]/page.tsx`,
  `app/[locale]/cup/[id]/resultater/*`
- `app/[locale]/games/[id]/withdrawActions.ts`, `trekk-fra/page.tsx`, `(home)/page.tsx`,
  `ScheduledWaitingRoom.tsx`, `leaderboard/formats/fourballMatchplay.tsx`
- `messages/no.json`, `messages/en.json`, `.changes/1814-cup-trekk.md`, `docs/user-flows.md`

## Out of Scope

- Alene-spill i chapman/gruesome/foursomes/greensome (delt ball — E4).
- Walkover/trekk i **frittstående** matchplay-spill utenfor cup (`supportsWithdrawal` står).
- Ny varsel-kind (DB-CHECK → migrasjon) og mail til arrangør; spilleres angre.
- Endring av swap-verktøyet utover avvisning på kamper med trukket rad.
- Liga-runder, native-appen (cup er ikke i native Must-lista), re-generering av kamper
  etter start, frigjøring av plass under taket (E6).
- Historisk visning av *hvem* som tok fourball-valget (audit-logg via `logAdminEvent` er nok).
