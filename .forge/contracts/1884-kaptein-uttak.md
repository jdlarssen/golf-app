# Forge-kontrakt: Kaptein-uttak — hemmelig uttak per økt med avdekking — #1884

**Branch:** `claude/kaptein-uttak-1884`
**Issue:** [#1884](https://github.com/jdlarssen/golf-app/issues/1884)
**Type:** enhancement · area: admin (cup) + auth · størrelse: large
**Spec:** `docs/superpowers/specs/2026-09-01-ryder-cup-kaptein-uttak-design.md` (etappe 2)
**Forgjenger:** etappe 1 (#1883, PR #1890) er MERGET — kontrakten er skrevet mot main per 2026-09-02.

```json
{ "kontraktKlasse": "bruker-synlig", "funksjonell": "Kapteiner kan levere hemmelige laguttak per økt, og cupen avdekker kampene når begge uttak er inne.", "produktvalg": false }
```

## Problem

Etappe 1 lot Ryder Cup-oppsettet få plass (36/40-tak, matchantall per økt). Men «+ kapteiner» fra bruker-innsendelsen mangler: i dag setter arrangøren alle oppstillinger alene i Generer-rommet. Ekte cup-følelse er at hver kaptein gjør sitt eget laguttak — hemmelig til begge har levert, med et avdekkings-øyeblikk når kampene dannes. Ingen kapteinsrolle finnes i datamodellen (`tournament_participants` er bare `tournament_id`+`user_id`+`created_at`; lag deriveres fra matchene).

Ingen ny bibliotek-flate — Supabase-/Next-mønstrene er husets egne, verifisert mot main i denne økta.

## Designbeslutninger (avklart med eier 2026-09-01)

- **Full uttaksflyt, ikke bare byttemakt** — eieren valgte b eksplisitt, to ganger.
- **Valgfri per cup:** arrangøren utnevner én kaptein per lag i Spillere-rommet. Uten kapteiner er alt som i dag (Generer-rommet urørt for slike cuper).
- **Per økt-rytme:** uttak leveres økt for økt; kapteiner kan reagere på stillingen.
- **Ordnet-liste-paring:** kapteinen leverer par/enkeltspillere i rekkefølge; slot 1 møter slot 1. Ingen egen paringslogikk — rekkefølgen ER uttaket.
- **Hemmelighold server-side:** motstanderen ser ingenting før begge uttak for økta er levert. Personlige cup-sider er world-read (`canViewCupPage` → `!groupId` = alltid), så hemmeligholdet MÅ håndheves i uttaks-datalesingen — sidegaten beskytter ingenting.
- **Avdekking = seremoni:** når begge uttak er inne dannes matchene, cupsiden viser «Kampene er klare»-øyeblikket (cup-presentasjonsfilosofien: ett kort, ceremony-tone), og deltakerne varsles i appen (best-effort).
- **Arrangør-nødluke:** arrangøren ser alltid alt (også kladd), kan levere på vegne av en kaptein, låse opp et levert uttak før avdekking, og endre etter avdekking via eksisterende `SwapMatchPlayer`.
- **Konsekvens av etappe 1-avviket:** øktantall i veiviseren lagres ikke — kaptein-flyten kan derfor IKKE låne det. Øktstrukturen (format + antall plasser) persisteres som del av uttaksrunden når arrangøren åpner den; default-antall deriveres fra varige lagstørrelser via `buildSessionCountRows` og kan justeres ned (samme klamperegel som etappe 1).

## Datamodell & authz (semantikk fast, kolonneform er byggerens)

- **`tournament_participants` utvides:** lagnummer (1/2, nullable = utildelt) + kapteinsflagg/rolle. Migrasjon nummereres fra nyeste i `supabase/migrations/` (0168 per 2026-09-02 — renummerer ved kollisjon). Husk default på evt. NOT NULL (gen:types-fella).
- **Ny uttakslagring:** per cup: åpnede økter (rekkefølge, `CupSessionFormat`, antall plasser, status) + per økt×lag: ordnede slots, levert-status, levert-av. Én eller to tabeller — byggerens valg.
- **RLS deny-by-default på ny(e) tabell(er):** ingen `authenticated`/`anon`-tilgang; alle lese-/skriveveier går via gatede server-actions/-components med admin-klient (#1542-mønsteret). Fiendtlig direkte PATCH/SELECT skal feile (AGENTS.md-felle 3).
- **Ny gate:** «arrangør ELLER kaptein for lag N i denne cupen» — bygges ved siden av `requireAdminOrClubAdminOfCup` (`lib/admin/auth.ts`), Type A-testet. Kaptein-skriv gjelder KUN eget lags uttak i ikke-avdekkede økter.
- **Deltaker-synken:** `participantRosterSync`s fjerningsregel («ute av alle matcher → av lista») ville kastet ut benkede spillere og ikke-spillende kapteiner i kaptein-cuper. Regelen unntar rader med varig lagtildeling/rolle — de eies av arrangøren, ikke av match-derivasjonen.
- **Avdekkingen gjenbruker `createCupMatchesFromPlan`s innsettingskjerne** (generer/actions.ts): slots → `{format, label, side1, side2, segment: 'full'}`. Mode-config/allowance som generatoren; plan-`strategy` (handicap/random) er irrelevant — kapteinene HAR paret.

## Kant-tilfeller

| Situasjon | Forventet |
|---|---|
| Én kaptein levert, én ikke | Ingen avdekking; levert lag ser eget uttak; motstander ser kun «levert»-status, aldri innhold |
| Kaptein leser motstanderens kladd (direkte kall/URL) | Avvist server-side (gate + RLS) |
| Samme spiller i to slots i én økt / spiller fra feil lag / utenfor stallen | Valideringsfeil (Type A-testet, norsk feilkode-kontrakt som `CupPlanError`-mønsteret) |
| Færre fylte slots enn øktas antall | Kan ikke leveres |
| Andre foursomes-økt avdekkes | Match-labels fortsetter nummereringen fra cupens eksisterende matcher per format (Foursomes 9, 10, …) |
| Kaptein byttes/trekker seg | Arrangør omutnevner i Spillere-rommet; kladd består |
| Ikke-spillende kaptein | Står på lista med rolle; aldri i uttak; synken fjerner hen ikke |
| Deltaker uten lag når uttak åpnes | Vises som utildelt i Spillere-rommet; er ikke i noen kapteins stall før arrangøren plasserer hen |
| Cup uten kapteiner | Generer-rommet og hele dagens flyt uendret |
| Avdekket økt, spiller syk | Arrangør bruker eksisterende `SwapMatchPlayer` |
| Splittet-cup-dag-preset | Ingen kaptein-flyt (utenfor scope, som etappe 1) |

## Claude's Discretion

- Kolonne-/tabellform for uttakslagringen; eksakt plassering av uttaks-flaten (eget rom under `/admin/cup/[id]/` + kaptein-tilgjengelig inngang fra cupsiden — «one door per room»-prinsippet).
- Avdekkings-kortets utforming innen cup-presentasjonsfilosofien; ny `NotificationKind` (zod-payload i `lib/notifications/types.ts`, fan-out via `loadTournamentParticipantEmails`-settet, in-app only, best-effort).
- Om Spillere-rommets lagtildeling gjenbruker pill-toggle-mønsteret fra veiviserens Step1Roster.
- Testfixturer utledes fra konstanter/typer (lærdom fra #1890-revisjonen); norsk copy følger husmønstrene og `humanizer`-skillet kjøres før commit.

## Suksesskriterier

- [x] **SK1 — Utnevnelse:** Lag- og kaptein-raden står under hver deltaker i
  Spillere-rommet (`CupParticipantsList.tsx` → `RoleControls`), lagres via
  `setCupParticipantRole` og håndheves av `planCupRoleChange`
  (`lib/cup/captainRoles.ts`, 18 Type A-tester). DB-en har partiell unik indeks
  `tournament_participants_one_captain_per_team` + CHECK «kaptein må ha lag».
  Staging: fikstur-cupen `de77c617` fikk kaptein per lag og rommet leste dem.
- [x] **SK2 — Åpne uttak:** `openCupLineupSession` + `OpenSessionForm`.
  Default-antall derives av de varige lagstørrelsene og klampes ned.
  Staging: 3 mot 3 + foursomes ga default 1 kamp (floor(3/2)); økta var der
  etter reload som `cup-lineup-session-0`.
- [x] **SK3 — Kaptein leverer:** `submitCupLineup` + `LineupEditor`.
  Validering i `validateLineupSubmission` (21 Type A-tester dekker hele
  kant-tabellen). Staging: kapteinen fylte to seter, leverte, og raden ble
  «Levert» — knappen låst etterpå.
- [x] **SK4 — Hemmelighold:** To bevis.
  (a) Gate-test: `lineupActions.test.ts` — kaptein lag 1 som leverer for lag 2
  får `not_allowed` og skriver 0 rader; samme for vanlig deltaker og utlogget.
  (b) Staging-lesing: kapteinen så 0 redigerbare felt for motstanderlaget og
  teksten «Skjult til begge lag har levert», og 0 kamper fantes før begge
  hadde levert.
  (c) Fiendtlig REST mot staging MED data i tabellene (1 session, 4 slots):
  `authenticated`-JWT → HTTP 403 / 42501 på SELECT av begge tabeller, og på
  INSERT `cup_lineup_slots` og PATCH `cup_lineup_sessions`. Anonym → 401.
- [x] **SK5 — Avdekking:** Staging, etter at lag 2 leverte: 1 kamp opprettet
  med label «Foursome 1», `revealed_at` satt, 6 varsler av kind
  `cup_lineup_revealed`, cup-siden viste «Kampene er klare» og varselet lå i
  innboksen. Label-fortsettelsen er Type A-testet i `lineupReveal.test.ts`.
- [x] **SK6 — Nødluke:** `unlockCupLineup` og `setCupParticipantRole` er
  arrangør-only (fire gate-tester viser at kapteinen får `not_allowed` på
  unlock, utnevnelse, åpne og slett økt). Staging: arrangøren leverte på vegne
  av lag 2 og så begge lags uttak.
- [x] **SK7 — Uendret uten kapteiner:** `npx vitest run` — 530 filer / 7190
  tester, exit 0, ingen eksisterende cup-test endret oppførsel.
  Uttaks-døra rendres kun når cupen har en kaptein (`CupLineupDoor`), og
  `CupLineupSpotlight` returnerer før rolle-oppslaget når cupen ikke har
  uttaks-økter — en cup uten kapteiner ser ut nøyaktig som før.
- [x] **SK8 — Migrasjon:** 0172 påført staging (`snwmueecmfqqdurxedxv`) via
  Supabase MCP. Verifisert: begge nye tabeller `rowsecurity=true`, 0 policyer,
  0 grants til anon/authenticated; `tournament_participants` har `team_number`
  (nullable) + `is_captain` (NOT NULL default false). CI-ens drift-jobb
  regenererte typene fra staging og bekreftet at `lib/database.types.ts` er
  identisk med det live skjemaet. **Prod: IKKE påført.**
  ⚠️ Rettet etter evaluator-funn: prod må påføres **FØR** merge/deploy, ikke
  etter. Kontrakten sa opprinnelig «etter merge», men den nye koden leser
  `team_number`/`is_captain` i Spillere-rommet og i spillerbyttet, og begge
  feiler lukket på en ukjent kolonne — hele Spillere-rommet ville vist feilsiden
  for alle cuper i vinduet. Migrasjonen er additiv og trygg å påføre mens bare
  gammel kode kjører. Samme lærdom som 0169.
- [x] **SK9 — i18n + notat:** `npx vitest run messages` grønn (paritet).
  `node scripts/weekly-release.mjs --dry-run` viser 1884-notatet som gyldig.
- [x] **SK10 — Staging-bevis:** Full klikkrunde kjørt mot torny-staging i
  prod-server-modus (build med staging-env + `next start`), logget inn som
  kaptein og arrangør via mintede OTP-er. Alle stegene over er observert
  utfall fra den runden, ikke antakelser. Kjørt PÅ NYTT etter
  evaluerings-fiksene, pluss en egen runde som beviser den nye vakta: en
  spiller ble flyttet mellom lagene etter levering, og avdekkingen ble avvist
  med 0 kamper, `revealed_at` null og riktig norsk beskjed til arrangøren.

## Evaluering

Skeptisk gjennomgang med fem linser og tre motbevisere per funn: 26 funn reist,
4 overlevde, alle fire rettet på branchen.

1. Migrasjonsrekkefølgen var snudd (prod må komme FØR koden) — rettet i
   migrasjonsfila, kontrakten og PR-teksten.
2. Avdekkingen re-validerte ikke lagrede plasser mot dagens lag —
   `validateStoredLineups`, Type A-testet og bevist på staging.
3. Match-taket hadde to hjem som var uenige — `countPendingLineupSlots` er nå
   det ene hjemmet, brukt av både uttaket og veiviseren.
4. Singel het «Matchplay» i uttaks-rommet mens kampene het «Singel 1» — bruker
   nå cupens eget vokabular.

Ikke fikset her, filet som issues før merge: #1901 (avdekking som feiler har
ingen «prøv igjen»-vei) og #1902 (poengmålet flytter seg ikke når en økt legger
til kamper underveis).

## Gates (per chunk)

- `npx tsc --noEmit` · `npx eslint <endrede filer>` · `npx vitest run lib/cup lib/notifications "app/[locale]/admin/cup" messages` · `npm run build` — alle grønne
- `node scripts/weekly-release.mjs --dry-run` — 1884-notatet gyldig

## Byggerekkefølge (forslag, 3 chunks)

1. **Datalag:** migrasjon (staging) + lag/rolle i Spillere-rommet + synk-unntak + gate-helper. Type A + hostile-read.
2. **Uttakskjernen:** uttakslagring, åpne/lever/lås opp/lever-på-vegne-actions, valideringer, hemmelighold-lesing. Type A-tungt.
3. **Flater + avdekking:** uttaks-UI, avdekkings-kort, match-opprettelse, varsel, copy, én Type C-interaksjonstest per ny flate (maks), staging-runde.

## PR-regler for denne kontrakten

- **ALDRI auto-merge.** Authz-utvidelse + DB-migrasjon = to aldri-auto-kategorier. Draft-først (#1516); PR-en blir stående til eieren merger selv. Ingen produktvalg-heading (valgene er tatt), men Fordeler/ulemper-blokk som alltid.
- Migrasjonsrekkefølge: staging → verifiser → merge → prod etter eier-luke (`touch .claude/approve-prod` er eierens handling). Format-seed-/migrasjonslærdommen: prod påføres ETTER deploy av koden som tåler den.
- `Closes #1884` i body; closing-kommentar med `## Teknisk` + `## Funksjonell` etter merge.

## Ikke i scope

- Kaptein-flyt for splittet cup-dag; uttaksfrister/nedtelling (vekkes av ekte bruk).
- Mail-varsel ved avdekking (in-app only nå); emoji-/reaksjons-integrasjon (#977-parkeringen).
- Prefill av Generer-veiviserens lagdeling fra varige lag i ikke-kaptein-cuper (idé, eget issue ved behov).
- Endringer i tak (etappe 1 står), klubb-cup-regler eller native-appen (#1816-sporet).
