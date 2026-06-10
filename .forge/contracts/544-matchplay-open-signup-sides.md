# Spec: Side-valg ved åpen påmelding til matchplay + autostart-vakt (#544)

## Problem

Åpen påmelding (`registerForOpenGame`) er modus-blind og inserter alltid `team_number: null, flight_number: null` (`app/[locale]/signup/[shortId]/actions.ts:200`). Matchplay-scoringen krever `team_number ∈ {1, 2}` med eksakt `team_size` spillere per side — en spiller uten side gir `teamNumber: 0` og scoreren returnerer stille et tomt skall (`lib/scoring/modes/singlesMatchplay.ts:232`). I tillegg validerer `startScheduledGame` (`lib/games/startScheduledGame.ts`) kun «minst én spiller» + komplette profiler — aldri side-bemanning — så spillet autostarter ved tee-tid selv med halvtomme sider. Skjedde i prod 2026-06-10: singles matchplay, åpen påmelding, joiner fikk null-side, spillet autostartet og resultatet kunne aldri beregnes (måtte DB-hotfixes).

Rotårsaken til at åpne matchplay-spill i det hele tatt kan publiseres med partial roster er bevisst: open/manual_approval behandles som `draft` i mode-validatoren ved publish (`lib/games/gamePayload.ts:2262-2270`). Spillerne SKAL kunne komme via lenken etterpå — men da må påmeldingen sette side, og starten må gates.

## Research Findings

Ingen eksterne biblioteker involvert — ren app-logikk over etablerte mønstre i repoet:
- Matchplay-konvensjon (alle 6 varianter): `team_number ∈ {1, 2}`, `flight_number = team_number`, kapasitet per side = `mode_config.team_size` (1 for singles; 2 for fourball/foursomes/greensome/chapman/gruesome). DB-CHECK `game_players_team_flight_consistency` (migrasjon 0030) krever begge satt eller begge null.
- Foursomes/greensome tee-startere velges i-spill via banner på hull 1 (`foursomesActions.ts`) — IKKE påkrevd ved start. Hele familien kan dermed dekkes uten ekstra felt.
- Autostart-fallbacken (E1) ligger i `app/[locale]/games/[id]/(home)/page.tsx:285-328`; den logger feil-reasons fra `startScheduledGame` og faller gjennom til scheduled-visningen. Eksisterende reasons: `no_players`, `pending_players`, `no_tee_box` m.fl. — feilkoder mappes til norsk i `lib/admin/gameErrorMessages.ts`.
- Admin-edit-flyten (`app/[locale]/admin/games/[id]/edit/page.tsx:253-264`) laster allerede `game_players` med `team_number` inn i wizard-en — admin-overstyring av sider FØR start finnes og gjenbrukes som den er.

## Prior Decisions

- Kontrakt #199 (selv-påmelding) §5.3: solo open-insert med `team/flight = null` var designet for stableford/solo-strokeplay; matchplay ble aldri adressert (§5.6 dekket kun scramble-familien). Dette spec-et tetter det hullet.
- Kontrakt #463: selv-påmelding setter `accepted_at` umiddelbart — beholdes uendret.
- `gameModeSupportsTeams()` (`lib/games/registration.ts:40`) ekskluderer matchplay med vilje (matchplay er solo-påmelding til en SIDE, ikke lag-påmelding med kaptein). IKKE rør den — side-valget bygges i solo-stien (Path A), ikke team-stien.
- Eier-beslutning 2026-06-10 (gråsone-diskusjon): spilleren VELGER side selv ved påmelding; admin kan overstyre via edit-flyten før start; hele matchplay-familien dekkes; ved ufullstendige sider ved tee-tid starter ikke spillet og spillsiden viser venter-melding (ikke noe ekstra varsel til oppretter).

## Design

### 1. Side-velger på påmeldingssiden (kun matchplay-modi, åpen modus)

`/signup/[shortId]` for et åpent spill der `game.game_mode` er en matchplay-variant viser en side-velger i `RegistrationForm.tsx`:

- To valg, «Side 1» og «Side 2», med navnene på spillere som allerede står på siden og antall ledige plasser («1 plass igjen»). Hent roster (ikke-trukkede `game_players` + navn) server-side på page-nivå og send ned som props.
- En full side (`count >= team_size`) er disabled.
- Har bare én side ledig plass → den er forhåndsvalgt (singles-tilfellet: null friksjon, ett trykk som før).
- Er begge sider fulle → hele skjemaet erstattes av en «Spillet er fullt»-tilstand (gjenbruk mønsteret fra `gameLocked`-tilstanden på siden).
- Submit uten valgt side er ikke mulig (knappen disabled til en side er valgt).

`registerForOpenGame` får et `side`-felt i formData, kun lest for matchplay-modi:

- Valider server-side: heltall 1 eller 2, ellers `bad_side`.
- Kapasitetssjekk mot ferske rader (admin-client): tell ikke-trukkede spillere med `team_number = side`; `count >= team_size` → ny feilkode `side_full` (norsk melding i skjemaet: siden ble nettopp full, velg den andre).
- Insert med `team_number = side, flight_number = side` (oppfyller DB-CHECK-en).
- Ikke-matchplay-modi: uendret oppførsel (`null/null`), `side`-feltet ignoreres.

### 2. Autostart-vakt i `startScheduledGame`

Ny strukturell sjekk for matchplay-modi, etter dagens `no_players`-sjekk:

- Krev eksakt `team_size` ikke-trukkede spillere på side 1 OG side 2, og ingen rader med `team_number` utenfor {1, 2} (null teller som utenfor).
- Feiler sjekken → returner `{ ok: false, reason: 'incomplete_sides' }` uten å flippe status. Vakta gjelder alle kall til `startScheduledGame` (E1-autostart og admin-knappen hvis den deler helperen — verifiser call-sites).
- `lib/admin/gameErrorMessages.ts` får norsk mapping for `incomplete_sides` så admin-flater viser forståelig feil.

### 3. «Venter på spillere»-melding på spillsiden

Når E1-fallbacken får `incomplete_sides` og spillet blir stående som scheduled etter tee-tid: scheduled-visningen på game-home viser en banner i stil «Venter på spillere — side 2 mangler 1 spiller» (regn ut manglende per side fra rosteret som allerede er lastet). Vises for alle som åpner siden. Når sidene fylles opp, starter neste sidebesøk spillet som før (lazy-start er kjent og akseptert, jf. #502).

## Edge Cases & Guardrails

- **Race om siste plass:** to samtidige påmeldinger til samme side kan begge passere pre-insert-tellingen. Re-tell etter insert; ved overbooking slett egen rad og returner `side_full`. (Claude's discretion: enklere løsning OK hvis den er deterministisk.)
- **Trukkede spillere** (`withdrawn_at != null`) teller ikke mot kapasitet — verken i velgeren, i action-validering eller i autostart-vakta.
- **Legacy null-rader:** spillere som meldte seg på et matchplay-spill FØR denne fiksen har `team_number: null`. Autostart-vakta blokkerer; admin tildeler side via edit-flyten. Ingen migrasjons-backfill (kun ett kjent tilfelle, allerede hotfixet). Etter deploy: én SQL-spotsjekk i prod for andre null-rader i matchplay-spill.
- **Manual approval-modus:** `requestApproval` skriver til `game_registration_requests` (ingen side-kolonne) — godkjennings-flyten kan fortsatt gi null-side. Autostart-vakta beskytter også her; side-valg i godkjenningsflyten er out of scope.
- **Ikke-matchplay åpne spill:** null regresjon — stableford/solo-strokeplay-påmelding skal insert-e nøyaktig som i dag.
- **Wizard-en:** publish-bypassen for åpne spill (`effectiveMode = 'draft'`) beholdes uendret — det er riktig at åpne matchplay-spill kan publiseres med partial roster.

## Key Decisions

- Spilleren velger side selv (eier-valg) — auto-plassering forkastet fordi kompiser i 2v2-formater vil styre hvem som spiller sammen.
- Hele matchplay-familien i ett (eier-valg) — samme kodevei og konvensjon for alle seks modi.
- Ikke start + banner ved ufullstendige sider (eier-valg) — ingen ekstra varsel-infrastruktur.
- `incomplete_sides` som ny reason i `startScheduledGame` — følger eksisterende reason-mønster i stedet for å kaste.

**Claude's Discretion:**
- Eksakt UI for side-velgeren (kort vs radio — bruk eksisterende primitives i `components/ui/`, tap-targets ≥44px, `tabular-nums` ved tall).
- Race-håndteringens implementasjon (re-tell + slett egen rad er forslaget).
- Om side-telle-logikken ekstraheres til en ren helper i `lib/games/` (anbefalt — gjenbrukes av action, vakt og banner; Type A-tester).
- Banner-copy (kjør humanizer; norsk bokmål; ingen «vennligst»).
- i18n: følg mønsteret som allerede gjelder på signup-/game-home-flatene etter i18n Fase 0 (#475) — ikke innfør nytt mønster.

## Success Criteria

- [x] Åpen påmelding til singles matchplay der oppretteren står på side 1: påmeldingssiden viser side-velger med side 2 forhåndsvalgt; innsending gir rad med `team_number = 2, flight_number = 2`. — Evidens: `RegistrationForm.tsx` autoSelected-init (kun ledig side forhåndsvalgt); `actions.ts` setter `teamNumber = rawSide, flightNumber = rawSide`; vitest `actions.test.ts` (5 nye tester) + `RegistrationForm.test.tsx` grønne.
- [x] Full side er disabled i velgeren, og server avviser med `side_full` når siden er full ved insert-tidspunkt. Begge sider fulle → «Spillet er fullt»-tilstand uten skjema. — Evidens: `disabled={isFull}` på side-kort; kapasitetssjekk pre-insert + race-guard post-insert i `actions.ts`; bothFull-banner i form; test «begge sider fulle → viser 'Spillet er fullt'-banner, ingen knapp» grønn.
- [x] `startScheduledGame` returnerer `incomplete_sides` og flipper IKKE status for alle 6 matchplay-modi; komplette sider starter som før. — Evidens: guard i `startScheduledGame.ts` via `isSideRosterComplete`; `startScheduledGame.test.ts` 20 tester med `it.each` over alle 6 modi + null-team + withdrawn + non-matchplay-bypass, alle grønne.
- [x] Game-home etter tee-tid med ufullstendige sider viser venter-banner med hvilken side som mangler hvor mange. — Evidens: `(home)/page.tsx` setter `autoStartBlockedByIncompleteSides` ved `incomplete_sides`-reason og rendrer Banner med per-side-mangel («side 2 mangler 1 spiller», pluralisert i commit 7bf7f70).
- [x] Ikke-matchplay åpen påmelding er uendret: `team_number: null, flight_number: null`. — Evidens: `teamNumber/flightNumber` initialiseres null og settes kun i `isMatchplayMode`-grenen; eksisterende actions-tester grønne; full suite 3084 tester grønn.
- [x] Admin kan omfordele sider for selv-påmeldte spillere via edit-flyten uten kodeendring der. — Evidens: `admin/games/[id]/edit/page.tsx:253-264` laster `game_players` med `team_number` inn i wizard (uendret av denne PR-en).

## Gates

- [x] `npx tsc --noEmit` passerer (exit 0, kjørt 2026-06-11 etter copy-commit)
- [x] `npx vitest run` full suite: 254 filer / 3084 tester grønne; scoped re-run etter copy-polish: 75 filer / 848 tester grønne
- [x] `npm run lint` — ingen nye feil (43 pre-eksisterende legal/privacy-`<a>`-advarsler uendret)
- [x] `npm run build` — kompilerte OK, 252 ruter generert (implementer-rapport)
- [x] MINOR-bump v1.109.0 + CHANGELOG-tema «1.109.y — Matchplay · åpen påmelding med side-valg» i commit b397b58; patch-bumps 1.109.1 (banner) + 1.109.2 (copy-polish)

## Files Likely Touched

- `app/[locale]/signup/[shortId]/page.tsx` — last roster + send side-data til form
- `app/[locale]/signup/[shortId]/RegistrationForm.tsx` — side-velger-UI + fullt-tilstand
- `app/[locale]/signup/[shortId]/actions.ts` — `side`-validering + kapasitetssjekk i `registerForOpenGame`
- `lib/games/startScheduledGame.ts` — `incomplete_sides`-vakt
- `lib/games/` (ny helper, f.eks. `matchplaySides.ts`) — side-kapasitet/manko-beregning + tester
- `lib/admin/gameErrorMessages.ts` — norsk mapping for `incomplete_sides`
- `app/[locale]/games/[id]/(home)/page.tsx` (+ scheduled-visningskomponenten) — venter-banner
- `package.json` + `CHANGELOG.md` — minor-bump

## Out of Scope

- Side-valg i manual approval-flyten (`game_registration_requests` har ingen side-kolonne) — egen issue hvis behovet oppstår; autostart-vakta dekker sikkerheten.
- Cron-basert autostart (lazy-start beholdes) — #502.
- Kapasitets-/fullt-logikk for ikke-matchplay-modi.
- Endring av publish-bypassen for åpne spill i `gamePayload.ts`.
- #543 (flight-antagelse ved ≤4 spillere) — eget issue, egen runde.
