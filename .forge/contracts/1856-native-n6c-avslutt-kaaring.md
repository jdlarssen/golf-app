# Spec: Native N6c — avslutt-flyt i appen (LD/CTP-kåring og finish-fullføreren)

## Problem

Siste ledd i arrangør-livssyklusen (#1816 Must): avslutte runden fra appen.
I dag må arrangøren til nettsiden for å kontrollere leveringer, kåre LD-/CTP-vinnere
og flippe spillet til «Avsluttet» — og appens sideturnering-visning (#1850) venter
nettopp på disse radene. I tillegg kjører webben en hale av server-eide etter-steg
ved avslutning (score-differentials, resultat-sammendrag, bragder, varsler/mail,
rundereferat) som ville MANGLE permanent på alle spill avsluttet fra appen — etter
butikk-byttet er det alle spill. Del-issue: #1856. Tredje av tre N6-slicer; bygges
ETTER N6b (#1855).

## Research Findings (verifisert 2026-08-31 mot main i denne økta)

- **Avslutt-pipelinen:** `endGame` (`admin/games/[id]/actions.ts:317-348`,
  `requireAdminOrCreator`) → `endGameCore` (`lib/games/endGameCore.ts:118-332`,
  `server-only` — kan IKKE importeres i appen). Valideringene som speiles:
  `status === 'active'` (:153-155), minst én spiller (:178-180), alle ikke-trukkede
  har `submitted_at` (:181-193; relakseres av `allowMissing`), og ved
  `require_peer_approval` at alle har `approved_at` (:194-196) —
  **peer-gaten relakseres ALDRI av allowMissing**.
- **Skriverekkefølgen er en regel:** side-vinnerne upsertes FØR status-flippen
  (endGameCore:199-218, `game_side_winners.upsert(..., onConflict:
  'game_id,category,position')`, request-/RLS-klient), deretter status →
  `'finished'` + `ended_at` med optimistisk lås på `status='active'` (:220-229).
  Rekkefølgen gjør at SELECT-policyen på `game_side_winners` (finished-deltaker)
  aldri viser et halvskrevet sett.
- **RLS-veien for appens skriv er verifisert klar** (#1850-kontrakten +
  drift-tabellen der): `games creator update` (0071:29-33) og
  `game_side_winners creator all` (0071:76-90) — webbens endGameCore kjører
  allerede disse skrivene på RLS-klienten. Ingen policy-endring trengs.
- **Kåringsskjemaet (web-fasit):** `SideWinnersForm.tsx` — per LD-/CTP-slot en
  velger over deltakerne + eksplisitt `«Ingen kvalifiserte»` (:80,111) som
  persisteres som `winner_user_id: null`. `EndGameButton.tsx:32-71` ruter til
  `/avslutt`-siden når sideturnering er på og `ld+ctp > 0`, ellers direkte
  avslutt. `position` = hull-slot 1/2, aldri medaljerang (samme spiller kan stå
  på begge slots).
- **«Avslutt likevel»:** `endGameMarkingWithdrawals`
  (`admin/games/[id]/avslutt-likevel/actions.ts`) setter `withdrawn_at` per
  avkrysset spiller uten levert kort, og kaller så endGame med `allowMissing=true`.
  WD-skrivene har creator-RLS-vei (0108/0147-bypass, etablert i N6b).
- **Etter-stegene er server-eide og delvis RLS-UMULIGE for appen:**
  `score_differential` er trigger-låst for ikke-admin authenticated
  (0117:52-63 — «set by the system at game finish», kun service-role/admin);
  `persistScoreDifferentials`/`persistResultSummaries`/`notifyAchievementUnlocks`/
  `generateAndPersistRoundReport` er `server-only`; mail/varsler er admin-klient.
  Appen KAN altså ikke fullføre halen selv — derav finish-fullføreren (Design).
- **Cron-presedens:** #502-sweepen (scheduled-start) er mønsteret for en
  server-side opprydder; cron-ruta er også den etablerte staging-verify-veien
  uten aktør-eksklusjon (minne: project_cron_route_staging_trigger).
- **Cup-kobling:** `finishDerivedGames`/`suppressPerGameNotifications`-mekanikken
  i endGameCore er cup-spesifikk og server-eid; cup er Should. Appen gater
  `tournament_id !== null` → henvis web.
- **Reopen er admin-only** i webben (`reopenGame`, actions.ts:554-631,
  `loadAdminContext`) — forblir web.

## Prior Decisions (videreført)

- Direkte RLS-skriv m/ trap 2-vern; beslutningslogikk deles, orkestrering speiles
  tynt med jest-paritet (endGameCore er server-only — speiles, ikke splittes:
  halen dens er full av server-avhengigheter, i motsetning til start-kjernen i N6b).
- Design-tokens (#1830), `[no-changelog]` på native-commits, relative imports,
  én simulator per økt, ærlig-feil-guardrailen, skriv krever nett.
- **Destruktive/irreversible handlinger får dedikert bekreftelses-flate**
  (husregelen «Destructive = confirm page») — avslutt er ikke sletting, men
  flippen er praktisk irreversibel for arrangøren (reopen er web/admin): egen
  avslutt-skjerm, aldri en enkelt knapp rett på GameHome.
- Prod-brannmuren #1074: DB-migrasjonen påføres staging først via MCP, prod KUN
  gjennom eier-luka; PR med prod-DB-migrasjon auto-merges ALDRI.

## Design

### App-delen

**Inngang:** «Avslutt runden»-CTA i arrangør-seksjonen på GameHome (N6b) når
`status === 'active'` og `tournament_id == null`. Ny skjerm `EndGame` (route i
`RootStackParamList`).

**EndGame-skjermen speiler webbens to-trinns flyt:**
1. **Leveringsstatus:** liste over ikke-trukkede spillere med levert/ikke levert
   (+ godkjent-status når `require_peer_approval`). Alle levert (og godkjent der
   det kreves) → «Avslutt runden»-knapp aktiv. Mangler noen →
   **«avslutt likevel»-varianten**: avkrysningsboks per manglende spiller
   («merkes som trukket»), knappen aktiveres når alle manglende er avkrysset.
   Peer-godkjenning som mangler kan ALDRI avkrysses bort — skjermen forklarer og
   henviser til godkjenning (webben har Sekretariat-override; appen har ikke).
2. **Kåring (kun når side på og `ld+ctp > 0`):** per slot («Lengste drive #1»,
   «Nærmest pinnen #2», …) en velger over aktive deltakere + «Ingen kvalifiserte».
   Alle slots må ha et valg (spiller eller ingen) før avslutt — web-paritet.
3. **Utfør:** (a) evt. WD-skriv per avkrysset spiller (creator-RLS), (b)
   `game_side_winners`-upsert (onConflict `game_id,category,position`) FØR (c)
   status-flipp `active → finished` + `ended_at` med optimistisk lås og trap 2-vern,
   (d) naviger til Leaderboard — der #1850-seksjonen nå viser kåringen.

**Datamodul (`native/app/src/data/endGame.ts`, +tester):** valideringene speilet
fra endGameCore:153-196 (jest-paritet per gren), skriv-rekkefølgen, typede feil.
Tapt optimistisk lås (noen andre avsluttet/gjenåpnet i mellomtiden) → re-fetch +
rolig melding, aldri halvskrevet tilstand (side-vinnere som alt ble upsertet er
idempotente ved retry — samme onConflict-nøkkel).

### Finish-fullføreren (web + DB) — halen får fortsatt kjøre, med ett hjem

**DB (additiv migrasjon, egen fil i `supabase/migrations/`):**
`games.finish_pipeline_at timestamptz null` + backfill `set finish_pipeline_at =
ended_at where status = 'finished'` — backfillen er lastbærende: uten den ville
sweepen re-kjørt halen (og dobbel-varslet) for hele historikken. Ingen
policy-endring (kolonnen skrives kun server-side; creator-UPDATE-policyen dekker
teknisk, det er greit — verdien er idempotens-markør, ikke authz).
Staging først via MCP → verifiser → prod følger 0107-mønsteret POST-deploy og KUN
gjennom eier-luka (#1074).

**Web:** halen i endGameCore (fra `finishDerivedGames` t.o.m. varsler/mail)
ekstraheres til idempotent `runFinishPipeline(gameId)` (server-only, service-role
der dagens kode bruker det) som setter `finish_pipeline_at` som SISTE steg.
endGameCore kaller den synkront som i dag — web-avslutning er oppførselsuendret.
Ny sweep (cron-rute etter #502-mønsteret, gjenbruk eksisterende cron-kadens/
autentisering — builder sjekker `vercel.json`-oppsettet) plukker
`status='finished' AND finish_pipeline_at IS NULL AND tournament_id IS NULL` og
kjører pipelinen per spill. App-avsluttede spill blir dermed likeverdige
web-avsluttede innen sweep-intervallet (differentials, sammendrag, bragder,
varsler + gameFinished-mail, rundereferat, audit-logg).

**Dobbel-kjøringsvern:** markørkolonnen er eneste sannhet — sweepen hopper over
alt med satt markør; `runFinishPipeline` re-sjekker markøren først (to sweeps i
race er da ufarlige nok: verste fall er kjent-idempotente re-skriv; varsel-stegene
gates individuelt av markør-sjekken).

## Edge Cases & Guardrails

- **Cup-spill (`tournament_id !== null`):** ingen avslutt-CTA i appen — rolig
  «avsluttes fra nettsiden»-tekst. Sweepen ekskluderer dem også (cup-flyten eier
  suppress-mekanikken).
- **Peer-approval-blokk uten løsning i appen:** meldingen navngir hvem som mangler
  godkjenning og peker til Godkjenn-skjermen / webben — aldri en vei rundt gaten.
- **Alle trukket / ingen levert:** minst-én-spiller-porten (:178-180) speiles;
  et spill der ALLE krysses som trukket avvises som på webben (builder verifiserer
  webbens eksakte utfall og speiler).
- **Slots uten valg:** avslutt-knappen inaktiv til hvert slot har spiller eller
  «Ingen kvalifiserte» — ingen implisitt null.
- **Retry etter delvis suksess:** side-vinnere skrevet men flipp feilet → ny
  «Avslutt» re-upserter (idempotent) og flipper; aldri manuell oppryddings-UI.
- **Offline:** hele avslutt-skjermen krever nett (les-og-vis fungerer; utfør-knapp
  gir «krever nett»-melding).
- **Web-avsluttede historiske spill:** backfillen gjør dem usynlige for sweepen —
  bevist med staging-spørring i kriterium 5.
- **Sweep-feil på ett spill** stopper ikke resten (per-spill try/catch, logges
  med `[finishPipeline]`-prefiks — samme logge-idiom som `[endGame]`).

## Key Decisions

- **Finish-halen sentraliseres server-side (sweep) i stedet for å speiles i
  appen** — differentials er service-role-eide (0117) og resten er
  mail/AI/varsler som ALDRI skal få en app-kopi. Alternativet «app kaller en ny
  SECURITY DEFINER-RPC som gjør alt» ble forkastet: halen trenger Resend/AI/
  Next-runtime, ikke bare Postgres.
- **Markørkolonne framfor avledet kriterium** (f.eks. «differential mangler») —
  avledede kriterier kan ikke skille «halen feilet best-effort på web» fra
  «app-avsluttet», og dobbel-varsling er verre enn én ekstra kolonne.
- **endGameCore speiles tynt i appen, splittes ikke** — motsatt konklusjon av
  start-kjernen (N6b): valideringene er 40 linjer uten avhengigheter, halen er
  full av server-only. Jest-paritet låser speilingen.
- **Reopen forblir web/admin** — irreversibilitet i appen er akseptert og
  kommunisert i bekreftelses-UI-et.
- **ASSUMPTION (autonom økt):** sweep-kadensen gjenbruker eksisterende
  cron-oppsett uten ny infrastruktur; er kadensen grovere enn ~15 min vurderer
  byggeren et ekstra `after()`-kall fra webbens game-side som opportunistisk
  fullfører (samme mønster som auto-start-fallbacken) — diskresjon, bokføres.

**Claude's Discretion:** skjerm-inndeling (én EndGame-skjerm vs kåring som eget
steg), fil-/modulnavn, eksakt sweep-rute-plassering, loggformat, om
avslutt-likevel-avkrysningen og kåringen vises samtidig eller sekvensielt.

## Success Criteria

- [ ] 1. **Jest-låst paritet:** valideringsgrenene (active-krav, minst én spiller,
  levert-krav m/ allowMissing, peer-gate aldri relaksert), skriv-rekkefølgen
  (side-vinnere FØR flipp), slot-payload inkl. `winner_user_id: null`, optimistisk
  lås-tap → typet feil. `npx jest` (native/app) grønn.
- [ ] 2. **Staging e2e — kåring:** aktivt spill med side på (1 LD + 1 CTP) og
  leverte kort → avslutt fra appen med kåring (én spiller på LD, «Ingen
  kvalifiserte» på CTP) → `game_side_winners`-rader korrekte (service-role-lesing),
  `status='finished'` + `ended_at` satt; appens #1850-seksjon OG webbens
  «Sideturnering»-fane viser samme kåring (skjermbilder begge).
- [ ] 3. **Avslutt likevel:** spill der én spiller mangler levering → avkryss →
  `withdrawn_at` satt og spillet finished; peer-approval-mangel kan IKKE
  avkrysses bort (jest + staging).
- [ ] 4. **Cup-gate:** spill med `tournament_id` satt viser henvis-web-tekst og
  har ingen avslutt-CTA (jest på gate-logikken + skjermbilde).
- [ ] 5. **Finish-fullføreren på staging:** app-avsluttet spill får
  differentials + result_summary + `finish_pipeline_at` etter cron-rute-kall
  (service-role-lesing før/etter); web-avsluttet spill får alt synkront som før;
  backfillede historiske spill røres IKKE av sweepen (spørring: 0 kandidater
  eldre enn migrasjonen). Migrasjonen er påført staging via MCP og verifisert;
  prod-status dokumenteres ærlig i PR-en («Prod: IKKE påført — venter eier-luka»).
- [ ] 6. **Web-regresjon:** `npx vitest run` (rot) grønn; endGame-flyten på webben
  klikk-verifisert på staging (uendret oppførsel inkl. varsler).
- [ ] 7. **Porter + runbook:** alle Gates grønne; `docs/native/app-spike.md` får
  N6c-seksjon (skriv-rekkefølgen, cup-gaten, fullfører-arkitekturen,
  seed-oppskrift). Eier-tapptest hvis tilgjengelig, ellers `VERIFICATION GAP`
  + restanse.

## Gates

(Fersk worktree: `npm install` i BÅDE repo-rot og `native/app/`. Node 22.
Ingen nye native moduler. Staging-verify av webbens del i prod-server-modus —
`next build` m/ staging-env + `next start`, aldri dev.)

- [ ] `npx jest` i `native/app/` grønt
- [ ] `npx tsc --noEmit` i `native/app/` grønt
- [ ] `npx expo export --platform ios` grønt (slett `dist/` etterpå)
- [ ] `npm run typecheck` (rot) grønt
- [ ] `npx vitest run` (rot) grønt — nye web-tester for `runFinishPipeline`-splitten
      og sweepen (Type A-disiplin; endGameCore-suiten består)
- [ ] `npx eslint native/app` grønt
- [ ] `npm run build` (rot) grønt m/ pipefail

## Files Likely Touched

- `native/app/src/screens/EndGame.tsx` (ny) + `native/app/src/data/endGame.ts`
  (ny, +tester) — avslutt-skjermen og skrivene
- `native/app/src/screens/GameHome.tsx` + `navigation.tsx` — CTA + route
- `lib/games/endGameCore.ts` — hale-ekstraksjon til `lib/games/runFinishPipeline.ts`
  (ny, +tester)
- `app/api/…`-cron-rute (ny — plassering per eksisterende cron-mønster) — sweepen
- `supabase/migrations/NNNN_games_finish_pipeline_at.sql` (ny) — markørkolonne
  + backfill
- `docs/native/app-spike.md` — N6c-seksjon

## Out of Scope

- Reopen/gjenåpning (web/admin), Sekretariat-godkjenn-override (web),
  cup-avslutning og `finishDerivedGames`-endringer (Should), endringer i
  varsel-/mail-innhold, realtime på `game_side_winners`, retro-reparasjon av
  historiske spill utover backfill-markøren, konto-sletting (egen liten kontrakt
  senere — App Store-kravet), N6a/N6b-flatene.

---

**Til byggeren:** drift-verifisering mot HEAD før første kodelinje
(#1850-mønsteret), sjekk natt-PR-ene for overlapp, bekreft at N6b (#1855) er
merget før du starter — og husk: PR-en inneholder en prod-DB-migrasjon og skal
ALDRI auto-merges; eier-luka (#1074) gjelder for prod-påføringen.
