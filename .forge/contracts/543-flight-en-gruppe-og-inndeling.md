# Spec: Flight = én gruppe ved ≤4 spillere + flight-inndeling for store spill (#543)

## Problem

Flight-begrepet i appen følger i dag formatets struktur, ikke den fysiske gruppa på banen. To konsekvenser:

1. **Små spill (≤4 spillere):** I matchplay er `flight_number = side`, så i en singles-match ser hver spiller bare seg selv på hull-siden, motstanderens scorer er usynlige live (RLS `same_flight_or_solo` matcher ikke på tvers av sider), og ved peer-godkjenning blir ingen spurt (ingen «flight-kamerater»). Samme gjelder lag-formater med 4 spillere (foursomes, texas med 2 lag): alle går fysisk i én flight, men appen sperrer på tvers av lag. Migrasjon 0088 (#499) løste dette KUN for flight-løse spill (begge `flight_number` null) — ikke når flight/side er satt.
2. **Store spill (>4 spillere):** Flight-løse solo-spill (åpen stableford, skins opp til 16) har ingen måte å deles inn i flighter på. Uten inndeling kan ingen føre for hverandre (`can_score_for` krever ≤4 for flight-løse), og det vanlige mønsteret på banen er at ÉN person i flighten fører for alle. Det mønsteret er umulig i dag for >4-spill.

Issue #543 (filt 2026-06-10, samme dag som matchplay-prod-runden): «Kun åpne for flight om man er flere enn 4 i spillet. Anta at man alltid er i 1 flight hvis ikke.»

## Research Findings

Ingen eksterne biblioteker — ren app-logikk + Postgres RLS over etablerte mønstre:

- `can_score_for()` + `same_flight_or_solo()` (migrasjon 0088, SECURITY DEFINER) er de to RLS-portene for skriv/les av scorer. Begge har allerede en `withdrawn_at is null`-tellelogikk å bygge på.
- Hull-sidens roster-filter: `app/[locale]/games/[id]/holes/[holeNumber]/page.tsx:101-104` (`me.flight_number == null ? allPlayers : filter(samme flight)`). Shared-ball-formater (texas/ambrose/florida/foursomes/greensome/chapman/gruesome/patsome≥7) kollapser `flight` til ETT lagkort keyed på kaptein (linje 437-530) — å vise «alle i flighten» der krever ett kort PER LAG, ikke per spiller.
- Peer-godkjenning er allerede én-attestant: `game_players.approved_by_user_id` (entall); approve-gaten sammenlikner `me.flight_number === target.flight_number` (`approve/actions.ts:70` — JS `null === null` er true, så flight-løse spill passerer i dag; matchplay-sider gjør IKKE).
- Submit-varsling ved peer-godkjenning looper «andre i samme flight» (`submit/actions.ts:124-133`).
- DB-felle: `game_players_team_flight_consistency` (0030) krever team_number og flight_number begge satt eller begge null → flight-tildeling i solo-formater (team = null) bryter constrainten. CHECK `flight_number between 1 and 4` takler heller ikke klubb-skala (150 spillere ≈ 38 flighter).
- Påmelding stenger i dag kun strukturelt (`gameLocked = status active/finished`, `signup/[shortId]/page.tsx:126`) — ingen manuell stopp.
- Start-vakt-mønster finnes fra #544: `startScheduledGame` returnerer `{ok:false, reason}`, game-home E1-fallback viser venter-banner, `lib/admin/gameErrorMessages.ts` mapper reason → norsk.

## Prior Decisions

- 0088 (eier-beslutning 2026-06-08): ≤4-grensen finnes for å hindre at store flight-løse spill blir føre-for-alle-frokostbord. Videreføres — derfor inndeling for >4.
- #544: venter-banner + reason-mønster ved blokkert autostart; withdrawn teller aldri mot kapasitet. Gjenbrukes.
- #163: «hele spillerlisten er én flight, hvem som helst fører for alle» for solo ≤4. #543 generaliserer dette til ALLE formater ved ≤4.
- Matchplay/best-ball/scramble/par-stableford: flight er bundet til side/lag av validatorene (`lib/games/gamePayload.ts`) — disse formatene får IKKE fri flight-omfordeling; bindingen består.

## Design

### A. «Én flight»-regelen (≤4 aktive spillere, alle formater)

Nytt sannhets-anker i `lib/games/` (ny ren modul, f.eks. `flightScope.ts`, Type A-tester):
**Et spill er én-flight når antall aktive (ikke-trukkede) spillere ≤ 4, ELLER game_mode = 'wolf' (3–5 spillere, alltid én gruppe).**

Når et spill er én-flight:
- **Hull-siden** viser alle aktive spillere. Per-ball-formater (singles/fourball matchplay, best-ball-typer, solo, par-stableford, patsome 1–6): ett kort per spiller. Shared-ball-formater: ett lagkort PER LAG (begge lags kort synlige, hver med sitt lags handicap etter eksisterende formler), alle kan taste på alle kort.
- **RLS skriv** (`can_score_for`): tillat når spillet har ≤4 aktive spillere (eller wolf) — uavhengig av flight-verdier. Eksisterende samme-flight-gren beholdes for >4.
- **RLS les** (`same_flight_or_solo`): samme utvidelse — i én-flight-spill ser alle hverandres scorer live. (Fikser også at motstanderen i live matchplay-H2H ikke så stillingen.)
- **Game-home roster («DIN FLIGHT»)**: viser alle aktive spillere.
- **Peer-godkjenning**: alle andre i spillet er attestanter — varsles ved innlevering, kan godkjenne (fortsatt holder ÉN godkjenning, som i dag). Approve-gatens flight-sammenlikning bytter til én-flight-regelen.

### B. Flight-inndeling for store flight-løse spill (>4 aktive, solo-formater)

Gjelder spill der formatet er flight-løst by design (solo-buildere setter flight = null) og aktive spillere > 4. Wolf er unntatt (alltid én flight). Lag/side-formater er unntatt (flight = lag/side, styres av validatorene som før).

1. **Admin-inndeling i Sekretariatet:** Spillets admin-side får en «Flighter»-seksjon (synlig kun når spillet trenger inndeling): «Foreslå inndeling»-knapp som fyller grupper på 4 i påmeldingsrekkefølge, deretter per-spiller-justering (flytt spiller til annen flight). Authz: spillets oppretter eller site-admin (eksisterende creator-authz-mønster fra #428). Redigerbar i scheduled OG active (folk bytter gruppe på banen).
2. **Selvbetjening i venterommet:** På game-home i scheduled-tilstand kan spillere selv velge flight (liste over flighter med navn + ledige plasser, «bli med»-knapp). Kapasitet 4 per flight, race-guard som i #544 (re-tell etter skriv). Oppretter kan overstyre når som helst — siste skriv vinner.
3. **Start-vakt:** `startScheduledGame` får ny reason `unassigned_flights`: et spill som trenger inndeling starter ikke før alle aktive spillere har flight. Game-home viser venter-banner med hvem som mangler (gjenbruk #544-mønsteret). Norsk mapping i `gameErrorMessages.ts`.
4. **Stopp påmelding:** Ny kolonne `games.signups_closed_at` (timestamptz, null = åpen). Admin-siden får «Steng påmelding»-knapp (og gjenåpne) for open/manual_approval-spill. Signup-siden behandler stengt som låst (egen melding, gjenbruk gameLocked-mønsteret). Gir oppretteren ro til å justere flighter før tee-tid.
5. **Etter inndeling** oppfører store spill seg som i dag for best-ball: hull-siden filtrerer til egen flight, DIN FLIGHT viser flight-medlemmene (også for solo-formater — roster-grenen som i dag keyer på isSoloFormat må også se på om flight er satt), føring innen flighten, leaderboard forblir FLAT (flight er gå-gruppe, ikke konkurranse-enhet).

### C. Datamodell-endringer (én migrasjon)

- `game_players_team_flight_consistency` erstattes med `(team_number is null) or (flight_number is not null)` — lag krever fortsatt flight; flight uten lag blir lovlig.
- CHECK `flight_number between 1 and 4` → `flight_number >= 1` (app-validering styrer øvre grense).
- `games.signups_closed_at timestamptz null`.
- Oppdaterte `can_score_for` + `same_flight_or_solo` per A.
- `lib/database.types.ts` oppdateres for ny kolonne (jf. #488 — hold endringen scoped).
- Migrasjonen applyes via Supabase MCP rett FØR PR-merge (kolonne + RLS er bakoverkompatible med gammel kode).

## Edge Cases & Guardrails

- **Withdrawn teller aldri:** verken i én-flight-telling, flight-kapasitet, auto-forslag eller start-vakt (presedens 0088/#544).
- **>4-spill som krymper til ≤4** (frafall): én-flight-regelen slår inn strukturelt (telling skjer ved bruk, ikke lagret tilstand). Eventuelle satte flight-verdier ignoreres da for synlighet/føring — ufarlig.
- **Sen påmelding etter inndeling:** ny spiller står uten flight → start-vakta blokkerer til plassering (selv eller av oppretter). «Steng påmelding» forebygger.
- **Leaderboard/scoring uendret:** solo-scoring er flat og ignorerer flight_number; ingen scoring-modul røres (`lib/scoring/` er fredet uten ny test først — her røres den ikke).
- **Allerede aktive >4 flight-løse spill (legacy):** ingen retro-gate — vakta gjelder kun start-overgangen. Oppførsel i aktive spill som i dag.
- **Ikke-solo-formater:** matchplay/best-ball/scramble/par-stableford får ingen inndelings-UI og ingen endring i flight-semantikk for >4 (best-ball-wizard-picker består). Kun ≤4-regelen (A) påvirker dem.
- **Selvbetjenings-race:** to spillere tar siste plass samtidig → re-tell etter skriv, taperen får norsk feilmelding og oppdatert liste.
- **Reveal-modus:** RLS-les-utvidelsen gjelder live-grenen; reveal-grenen (netto skjult til finish) er uberørt.
- **Texas/foursomes ≤4 kryss-lag-føring:** skriv går til motpartens kaptein-userId — ny RLS-gren dekker det; lagkort-kollaps må bygge kort per lag, ikke slå sammen alle til ett.

## Key Decisions

- Én-flight-regelen gjelder ALLE formater ved ≤4 aktive (eier: «alle fører for alle» — markør-prinsippet), inkludert på tvers av matchplay-sider og lag.
- Wolf er alltid én flight, også med 5 (eier-valg; retter sovende co-scoring-feil fra #465).
- Flight-inndeling for store spill bygges NÅ (eier-valg, utvidet scope): admin i Sekretariatet + selvbetjening i venterommet, oppretter kan overstyre.
- Auto-forslag: grupper på 4 i påmeldingsrekkefølge (eier-valg).
- Start-vakt for uinndelte store spill (eier: «i 1 flight fører 1 person, ikke 4 — det må vi støtte»).
- Peer-godkjenning: alle i gruppa er attestanter, men én godkjenning holder (eier-presisering — allerede dagens terskel, kun attestant-kretsen utvides).
- «Stopp påmelding» inkluderes (eier nevnte det eksplisitt som forutsetning for justerings-vinduet).

**Claude's Discretion:**
- Eksakt UI for Flighter-seksjonen og venteroms-velgeren (eksisterende primitives i `components/ui/`, tap-targets ≥44px, `tabular-nums`).
- Hvor mange tomme flighter som vises (f.eks. én ekstra for å muliggjøre 3+3 i stedet for 4+2).
- Navn/plassering av ny helper-modul og server-actions (admin-client etter authz — etablert mønster fra signup-actions).
- Banner- og feilmeldings-copy (humanizer-skill før commit; norsk bokmål; ingen «vennligst»).
- i18n: følg mønsteret som gjelder på berørte flater etter Fase 0 (#475).
- Realtime: hull-klientens kanal følger server-beregnet spillerliste — verifiser at ingen separat flight-filtrering finnes i `lib/sync/`.

## Success Criteria

- [x] Singles matchplay (2 spillere): hull-siden viser begge, motstander kan taste min score (RLS-skriv), live-stilling synlig for begge (RLS-les), innlevering varsler motstanderen som kan godkjenne. Verifikasjon: vitest på flightScope + RLS-rigg-tester (#440-riggen) + fil:linje-referanser. — Evidens: holes/[holeNumber]/page.tsx:92-117 (singleFlight-roster), 0094 can_score_for/same_flight_or_solo single-flight-gren, peersForApproval i approve/actions.ts + submit/actions.ts; tester: approve «singles matchplay opponent can approve», submit «motstander varsles som peer» — grønne.
- [x] Foursomes/texas med 4 spillere: hull-siden viser ETT kort PER LAG (to kort), begge lag kan taste på begge kort, lag-handicap per lag korrekt. Verifikasjon: testene for hull-side-kollaps + manuell kodegjennomgang. — Evidens: holes-page teamNumbers (l.464) + teamHandicapFor(teamNum) (l.487) + playersForClient per lag (l.540-546); 2-lags-tilfellet gir to ClientPlayer-kort, >4 gir uendret ett-korts-semantikk.
- [x] Wolf med 5 spillere: behandles som én flight (føring + les for alle). Verifikasjon: flightScope-test + RLS-test. — Evidens: flightScope.isSingleFlightGame wolf-gren + tester; 0094 g.game_mode='wolf'-gren i begge RLS-helpers; startScheduledGame.test «5-spiller wolf starter» grønn.
- [ ] >4-spillers flight-løst solo-spill: Sekretariatet viser Flighter-seksjon med «Foreslå inndeling» (grupper på 4 i påmeldingsrekkefølge) + per-spiller-flytting; kun oppretter/admin. Verifikasjon: render-test (maks én) + actions-tester.
- [x] Venterommet (scheduled, >4 solo): spiller velger flight selv, full flight (4) avvises med norsk melding, oppretter-overstyring vinner. Verifikasjon: actions-tester inkl. race-guard. — Evidens: ScheduledWaitingRoom flight-picker + flightJoinActions.joinFlight med kapasitet+race-revert + 6 tester; (home)/page.tsx:426-446 bygger flightOptions inkl. én ekstra tom flight.
- [x] Start-vakt: uinndelt >4-spill starter ikke (`unassigned_flights`), game-home viser banner med hvem som mangler; fullt inndelt spill starter. Verifikasjon: startScheduledGame-tester (it.each over moduser) + banner-render. — Evidens: startScheduledGame unassigned_flights-guard + 25 tester; (home)/page.tsx:320 banner-gren; gameErrorMessages-mapping.
- [x] «Steng påmelding»: knapp i Sekretariatet stenger/gjenåpner; signup-siden viser stengt-tilstand uten skjema. Verifikasjon: actions-test + signup-page-test. — Evidens: admin page l.552-584 toggle (kun scheduled + open/manual_approval); signup page l.131 stengt-tilstand; guards i actions.ts:181/365 + teamActions.ts:216; signup_closed i begge form-error-maps; 3 nye tester.
- [x] Ingen regresjon: ≤4-spill uten flights, best-ball (8), matchplay-sider ved >4 (finnes ikke strukturelt), scramble-lag — eksisterende full suite grønn. — Evidens: Full suite 3159/3159 grønn, tsc --noEmit 0 feil, npm run build OK, lint uten nye feil (alle 20 errors i ikke-endrede filer).

## Gates

- [x] `npx tsc --noEmit` passerer (0 feil, 2026-06-11)
- [x] `npx vitest run` full suite grønn (255 filer / 3159 tester)
- [x] `npm run lint` ingen nye feil (41 problemer, alle pre-eksisterende i ikke-endrede filer)
- [x] `npm run build` OK (kompilert, PPR-rutetabell generert)
- [x] MINOR-bump + CHANGELOG-oppføring (v1.110.0 + patch-serie til v1.110.6, tema «Flighter»)

## Files Likely Touched

- `supabase/migrations/00XX_flight_single_group_and_assignment.sql` — constraints, signups_closed_at, RLS-helpers
- `lib/games/flightScope.ts` (ny) + test — én-flight-regel, buckets, auto-forslag, manglende-tildeling
- `lib/database.types.ts` — signups_closed_at + constraint-refleksjon
- `app/[locale]/games/[id]/holes/[holeNumber]/page.tsx` — én-flight-roster + per-lag-kort
- `app/[locale]/games/[id]/(home)/page.tsx` + `ScheduledWaitingRoom.tsx` — roster, selvbetjenings-velger, venter-banner
- `app/[locale]/games/[id]/approve/actions.ts` + `submit/actions.ts` — attestant-krets via én-flight-regel
- `lib/games/startScheduledGame.ts` + `lib/admin/gameErrorMessages.ts` — `unassigned_flights`
- `app/[locale]/admin/games/[id]/page.tsx` (+ ny Flighter-komponent + actions) — inndeling + steng påmelding
- `app/[locale]/signup/[shortId]/page.tsx` + actions — stengt-påmelding-tilstand
- `package.json` + `CHANGELOG.md` — minor-bump

## Out of Scope

- Flight-omfordeling i lag/side-formater (flight = lag/side-bindingen består; «to par går sammen» i lag-stableford er egen idé).
- Tidsstyrt auto-stenging av påmelding (deadline-felt) — manuell knapp nå; cron-tematikk hører til #502.
- Endring av godkjennings-terskelen (én attestant er allerede dagens semantikk).
- Tee-tids-/startliste-funksjonalitet per flight (utskrift, intervaller) — klubb-skala-idé, eget issue ved behov.
