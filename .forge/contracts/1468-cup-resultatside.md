# Spec: Cup-resultatside — cup-siden viser kampene uten resultater (#1468 + #1459 + #1456)

**Issue:** #1468 (co-delivers #1459 + #1456) · **Branch:** claude/cup-standings-player-visibility-bf9446

## Problem

Eier-bestilling (2026-08-07): «Cup-siden skal inneholde kampene, uten resultater. Resultatet skal
skje på resultatsiden til cupen.» I dag viser både den offentlige cup-siden
(`app/[locale]/cup/[id]/page.tsx`) og styringssiden (`CupManagement.tsx`, admin- og klubb-variant)
lagtotaler, sidepoeng og per-match-resultater løpende — den som åpner siden etter en avsluttet dag
får fasiten rett i fleisen. Arrangøren får den påtvunget under ctp/ld-registrering (#1459), og
matchkortene på den offentlige siden lenker ingen steder (#1456).

## Eierbeslutninger (2026-08-07, AskUserQuestion i økten — bindende, ingen åpne produktvalg)

1. **Flytt alt.** Cup-siden viser INGEN poeng — verken lagtotaler, sidepoeng, matchresultater
   eller vinner. Den viser kampene (hvem mot hvem, label, status) og «X av N kamper spilt».
2. **Resultatsiden er låst til cupen er avsluttet** (`tournaments.status = 'finished'`) — for
   ALLE, inkludert arrangør og global admin. Før det: forklarende ventetekst, aldri en død flate.
3. **Styringssiden skjermes likt.** Totaler + matchresultater fjernes også fra `CupManagement`
   (begge varianter); dør til resultatsiden i stedet. Lukker #1459.
4. **Matchkortene lenker til kampens leaderboard** (`/games/<gameId>/leaderboard`) — lukker #1456.
   Admin-variantens drilldown til `/admin/games/<id>` består (bevisst, jf. #1456).

**Kjent, akseptert spoiler-kanal:** etter at et enkelt spill er avsluttet er kampens eget
leaderboard åpent (RLS: alle ser alt etter game-finished — by design). En spiller som borer seg inn
i hver kamp kan altså regne ut stillingen selv. Eier bestilte begge deler i samme runde: aggregatet
holdes skjult, per-kamp-detaljen er frivillig drill-in.

## Research Findings (repo-interne — ingen nye biblioteker)

- D12-blindgatingen (`getCupSnapshot.ts:362`) nuller `result` for `score_visibility='reveal'`-spill
  til spillet er finished — resultatsiden arver den gratis; ingen snapshot-endring trengs.
- `canFinish = status === 'active'` (`CupManagement.tsx:229`) — avslutt-knappen trenger ingen
  stillingsinfo; «X av N matcher spilt»-copyen er ikke resultatbærende og består.
- Klubb-synlighetsgaten ligger inline i `app/[locale]/cup/[id]/page.tsx:46-77` — resultatsiden
  trenger samme regel → trekkes ut til delt helper (AGENTS.md-felle 4: én regel, ett hjem).
- E2e (`e2e/cup/cup-lifecycle.spec.ts:163,355`) asserter kun at cup-siden rendrer cup-navnet —
  knekker ikke av subtraksjonen.
- `app/[locale]/error.tsx` dekker den nye ruta; `/cup/[id]/` har ingen egen error boundary i dag.
- Avledede singles-spill har eget leaderboard som leser host-scorene (#1456) — `m.gameId` fra
  `leaderboard.matches` er riktig lenkemål for alle matchtyper.

## Prior Decisions (carried forward)

- **#1449 owner decision 4/5:** finished-kortets badge («Laget ditt vant/tapte cupen») leser
  persistert `tournaments.winner_team` og vises først når cupen er finished — URØRT. Kortet
  lenker til `/cup/[id]`; etter denne PR-en lander spilleren spoiler-fritt med dør til resultatene.
- **#1441 D12:** blind-bunt-gating i snapshot — urørt; presentasjonslaget her bygger oppå.
- **#752:** manglende forutsetning → forklaring, aldri død flate (låst resultatside).
- **#344 én dør per rom:** resultatsiden er ett nytt rom med ÉN dør fra cup-siden (+ én fra
  styringssiden — to flater, samme rom, samme mønster som `openLeaderboard`-lenken i dag).
- **RLS-sveipen (#0107):** cup world-read by design — dette er bevisst presentasjonsgating, ikke
  ny authz. Ingen migrasjon, ingen RLS-endring.

## Design

### Ny rute: `/cup/[id]/resultater` (offentlig, samme klubb-gate som cup-siden)

- **Låst** (`status !== 'finished'`): TopBar tilbake til cup-siden + ventetekst i stil
  «Resultatene kommer når arrangøren har avsluttet cupen» (+ «X av N kamper spilt»). Ikke 404.
- **Åpen** (`status === 'finished'`): i praksis dagens cup-side — vinner-banner («X vant» /
  «Uavgjort», gull-markering av vinnerlaget), lagtotaler stort, sidepoeng-linje, matchliste MED
  resultattekst og per-match-poeng. Matchkort lenker til `/games/<gameId>/leaderboard`.
- Klubb-gaten trekkes ut av cup-page til delt helper (f.eks. `lib/cup/cupPageAccess.ts`) og
  brukes av begge rutene.

### Cup-siden `/cup/[id]` — subtraksjon

- **Fjernes:** lagtotal-grid, sidepoeng-linje, vinner-banner/gull, per-match resultattekst og
  poeng-kolonne (`scoreLabel` viser i dag poeng for ferdige matcher).
- **Består:** cup-navn, poengmål-header («Først til X poeng» — config, ikke resultat),
  matchliste (label, navn mot navn), «X av N kamper spilt».
- **Ny match-status-label:** ferdig match viser nøytral status («Spilt» e.l.) i stedet for poeng;
  pågår/ikke startet som i dag.
- **Dør til resultatsiden:** etter finish en tydelig dør («Se resultatene →»); før finish en
  dempet linje om at resultatene kommer ved avslutning (om linja er lenke til den låste sida
  eller ren tekst er byggerens valg — ingen død-følelse).
- Matchkort lenker til `/games/<gameId>/leaderboard`.

### Styringssiden `CupManagement` (admin + klubb)

- Master-preview-kortet: totaler + sidepoeng-linje ut; «X av N matcher spilt»-copyen består;
  `openLeaderboard`-lenka peker på cup-siden som før, pluss ny dør/lenke til resultatsiden
  (samme låse-oppførsel).
- Matchlista: resultattekst + poeng-kolonne ut. Admin-variant beholder drilldown til
  `/admin/games/<id>`; klubb-varianten lenker kortene til `/games/<gameId>/leaderboard` (#1456)
  i stedet for rene info-kort.
- Roster, SideAwardsPanel (config + vinner-registrering), tre-roms-dørene (#1472),
  start/avslutt-handlingene: urørt. `canFinish` urørt.

### Copy + i18n

- `game.home.cupStandings` («Se cup-stillingen») omformuleres — siden viser ikke lenger stilling
  (f.eks. «Se cupen»). Nye nøkler for dør, ventetekst og status-labels; fjernede elementers nøkler
  ryddes etter grep av call-sites. Begge kataloger samtidig (catalogParity), humanizer på norsk copy.

## Edge Cases & Guardrails

- **Cup uten matcher / draft-cup:** cup-siden viser tom-melding som i dag; resultatsiden viser
  ventetekst (draft OG active er «ikke avsluttet»).
- **Uavgjort cup** (`winner_team` null + finished): resultatsiden viser «Uavgjort», ingen
  gull-markering — samme semantikk som i dag.
- **`points_to_win` nådd midt i cupen:** `computeCupLeaderboard.winner` kan bli satt før finish —
  ingen gjenværende flate rendrer den før resultatsiden åpner. Ikke rør beregningen.
- **Direkte URL til `/cup/[id]/resultater`** før finish (delt lenke): ventetekst, aldri lekkasje.
- **Klubb-cup:** ikke-medlem får `notFound` på resultatsiden — samme helper som cup-siden.
- **Mail:** `cupFinishedNotification` sendes post-finish og røper vinneren — det ER reveal-flyten,
  urørt (Type B-snapshots låser malen).
- **Ikke rør:** `getCupSnapshot`/`computeCupLeaderboard`-logikk, RLS, `finishTournament`,
  #1449-kortene, sidepoeng-registreringsflyten.

## Key Decisions

- Presentasjonsgating, ikke RLS — data er world-read by design; å flytte gatingen til DB-laget er
  #1459 alternativ B sin tunge variant og ble ikke bestilt.
- Én delt synlighets-helper for cup-siden + resultatsiden — regelens ene hjem (felle 4).
- Resultatsiden gjenbruker snapshot-en som-den-er — D12-gatingen og poengberegningen har allerede
  ett hjem hver.

**Claude's Discretion:** eksakt norsk copy (dør-tekster, ventetekst, «Spilt»-label) gjennom
humanizer; om før-finish-linja på cup-siden er lenke eller ren tekst; komponent-/helper-navn;
om resultatside-innholdet deles som komponent med cup-siden eller dupliseres slankt (velg minst
diff med én sannhetskilde per regel); testid-navn; om `cupFinishedNotification`-CTA-en skal peke
på resultatsiden i stedet for cup-siden (i så fall `npx vitest -u` på snapshotene, egen commit).

## Success Criteria

- [x] **S1 — cup-siden er blind:** staging, aktiv cup med minst én ferdig match: `/cup/[id]`
      viser matchliste + «X av N kamper spilt», men INGEN poengtall, resultattekst eller
      vinner-markering (visuelt verifisert + skjermbilde på PR).
- [x] **S2 — resultatsiden er låst:** samme cup, `/cup/[id]/resultater` viser ventetekst uten
      noen resultatdata — også innlogget som admin/arrangør.
- [x] **S3 — styringssiden er skjermet:** admin- og klubb-varianten viser verken totaler eller
      matchresultater; sidepoeng-registrering kan gjennomføres uten at noe resultat vises (#1459-
      scenarioet re-kjørt på staging).
- [x] **S4 — seremonien:** avslutt cupen på staging → resultatsiden viser vinner-banner,
      lagtotaler, sidepoeng og matchresultater; cup-siden viser dør til resultatsiden.
- [x] **S5 — kamp-lenkene (#1456):** matchkort på cup-siden (og klubb-styringssiden) navigerer
      til kampens leaderboard, inkludert for et avledet singles-spill.
- [x] **S6 — regresjon:** full vitest-suite grønn; `npx playwright test e2e/cup/` grønn mot
      staging; ikke-cup-flater urørt.

## Gates

- [x] `npm run build` (aldri pre-filtrert tsc-output)
- [x] `npm run lint` — 0 errors
- [x] `npx vitest run` — hele suiten
- [x] `npx playwright test e2e/cup/` mot staging — grønn
- [x] Commit-disiplin: `feat(cup)`, MINOR-bump, én Funksjon-linje i CHANGELOG, `Refs #1468` i body
- [x] PR-body: `Closes #1468`, `Closes #1459`, `Closes #1456`; fordeler/ulemper-blokk; notat om at
      produktvalgene er eier-avgjort i økten (ingen `## Produktvalg`-heading — auto-merge-policy
      #1406 gjelder, men staging-verify + `staging-verified`-label FØR merge)

## Files Likely Touched

- `app/[locale]/cup/[id]/page.tsx` — subtraksjon + dør + status-labels + gate-uttrekk
- `app/[locale]/cup/[id]/resultater/page.tsx` (ny) — resultatsiden
- `lib/cup/cupPageAccess.ts` (ny) — delt klubb-synlighetsgate (+ Type A-test hvis logikken bærer)
- `app/[locale]/admin/cup/[id]/CupManagement.tsx` — subtraksjon + dør + klubb-kamp-lenker
- `app/[locale]/games/[id]/(home)/CupStandingsLink.tsx` — copy-nøkkel
- `messages/no.json` + `messages/en.json` — nye/omformulerte/ryddede nøkler
- `e2e/cup/cup-lifecycle.spec.ts` — evt. justering + én blind-/låst-assertion
- `package.json` / `package-lock.json` / `CHANGELOG.md` — minor bump + linje

## Out of Scope

- Inline resultat-toggle på cup-siden («evt. senere», eier).
- Seremoni-polish/animasjon på resultatsiden — v1 er en ren side.
- RLS-/DB-endringer (#1459 alternativ B i full bredde).
- #1449-kortenes badge-oppførsel og `winner_team`-persistering.
- Å skjule per-kamp-leaderboards etter game-finish (akseptert spoiler-kanal, se over).

## Revisjon 1 (2026-08-07, etter evaluator-runde 1)

Evaluatoren motbeviste kontraktens premiss «kampens leaderboard er åpent etter finish»: RLS
åpner scores, men SIDE-gaten (`app/[locale]/games/[id]/leaderboard/page.tsx`) krevde
deltaker/global admin — matchkort-lenkene 404-et dermed for cup-publikummet (selve
#1456-scenarioet). Rettelse, i tråd med eier-ordren «se hvordan de andre gjorde det (etter
runden)» og dokumentert RLS-design («alle ser alt etter finished»):

- Leaderboard-gaten får finished-unntak: ferdige spill kan åpnes av alle innloggede;
  aktive spill er fortsatt kun for deltakere/admin.
- Matchkort lenker KUN når kampen er ferdig (cup-siden, resultatsiden, klubb-styringssiden);
  uferdige kamper er rene kort. Admin-drilldown uendret.

`ASSUMPTION:` valget mellom «lenk alltid (aktive lander på reveal-blind side)» og «lenk kun
ferdige» er tatt autonomt til fordel for sistnevnte — det matcher eier-sitatet «etter runden»
ordrett og er billig å snu.

## Evidens (2026-08-07, staging-kjøring)

- **S1 — cup-siden er blind:** staging-driver: `cup-results-pending` synlig, `.text-5xl`=0, 2 matchkort; skjermbilde s1-cup-blind.png; match 1 finished i DB
- **S2 — resultatsiden er låst:** staging-driver admin+spiller: `cup-results-locked` synlig, `cup-results-totals`=0; e2e @gate-assertion grønn
- **S3 — styringssiden er skjermet:** staging-driver: `.text-4xl`=0 før/etter ctp-registrering; winner_user_id persistert (SQL); skjermbilde s3-manage-active.png
- **S4 — seremonien:** ekte «Avslutt cupen»-klikk → status=finished, winner_team=1 (SQL); resultatside viser vinner/totaler/sidepoeng/10&8; cup-siden viser dør
- **S5 — kamp-lenkene:** klikk Singel 1 → /games/<id>/leaderboard, `matchplay-status-banner` synlig
- **S6 — regresjon:** vitest 5644/5644 grønn; playwright e2e/cup 2/2 grønn mot staging; build+lint grønn
- **Gates:** build grønn (ny rute i manifest) · lint 0 errors · vitest 440 filer/5644 tester grønn · e2e cup 2/2 grønn mot staging · staging-bevis + `staging-verified`-label på PR #1498
