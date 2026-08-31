# Spec: Native N6a — opprett spill i appen (veiviseren med de støttede modiene)

## Problem

Arrangør-livssyklusen er siste store Must i epic #1816 før butikk-byttet. I dag kan
arrangøren føre, se resultater og gjøre wolf-/BBB-valg i appen — men selve spillet må
opprettes på nettsiden. Denne slicen leverer opprett-veiviseren i appen: format →
oppsett → bane/tid → spillere/lag → publiser. Del-issue: #1854. Første av tre
N6-slicer (N6a #1854 → N6b #1855 → N6c #1856); N6b tar start/roster-drift, N6c tar
avslutt-flyten.

## Research Findings (verifisert 2026-08-31 mot main i denne økta)

- **Enhver innlogget bruker kan opprette spill.** Webbens `createGameInternal` gater
  kun på innlogging (`app/[locale]/admin/games/new/actions.ts:76-87`); `isAdmin`
  velger bare redirect-mål (#427-kommentaren `:71-74`). RLS-veien er ren:
  `games creator insert` med `created_by = auth.uid()` (0071:24-27, omskrevet
  0092:193-194) + `game_players creator insert` — ingen service-role, ingen
  DB-endring.
- **Payload-byggeren er import-ren og skal DELES, aldri speiles:**
  `buildGameInsertPayload` (`lib/games/gamePayload.ts:2141`; fila er 2227 linjer,
  ingen `server-only`) gjør base-parsing (navn, bane, tee, allowance, synlighet) og
  delegerer til `modeValidators[mode]` som bygger `mode_config` per modus. `games`
  har 12 CHECK-constraints — byggeren er regelens ene hjem. #1850-byggingen viste
  fella: seedede `{}`-configs avvises av appens `asModeConfig`; en håndbygget config
  i appen ville drifte fra webbens fasong.
  - ⚠️ Byggeren leser `FormData`. React Natives FormData-global er laget for
    nettverks-upload og mangler `get()`/`getAll()` — appen lager en liten shim
    (Map-basert klasse med `get`/`getAll`/`has`) og mater byggeren med den.
    Jest-paritetstest låser at shim + delt bygger gir webbens payload-fasong for
    hver av de 8 modiene.
- **Format-metadata bor i DB og er world-readable:** `formats` +
  `format_intent_mapping` (0047; SELECT-policyene er `to public` i 0092:328/337).
  Webbens filter er to-lags: `is_visible` ∧ `is_active` via intent-mapping
  (`lib/formats/getFormatsForIntent.ts:26-62`, web bruker admin-klient + cache — 
  appen leser tabellene direkte under RLS) ∩ `fitsPlayerCount`
  (`lib/wizard/fitsPlayerCount.ts:21-103`, ren TS — importeres). Gyldighetssjekk før
  insert: speil `isValidActiveGameMode` (`lib/formats/validateGameMode.ts:11-25`)
  mot samme tabell.
- **Roster-kandidater under RLS = co-players (+ en selv):** `users` SELECT = egen
  rad ∨ admin ∨ delt spill (0092:179-186). Webbens kandidat-univers (venner ∪
  co-players ∪ klubbmedlemmer — `lib/games/inviteEligibility.ts`) er `server-only`
  + admin-klient og kan ikke importeres; venner uten delt spill er ikke navnlesbare
  under RLS. Håndhevelsen finnes uansett i DB: `guard_game_players_invite_eligibility`
  (0115) speiler unionen og no-op-er for self/admin/service — appens subsett kan
  aldri smugle inn en ukvalifisert, og hvert picker-valg lykkes (subsett ⊂ union).
- **accepted_at-regelen er delt:** `acceptedAtForActor`
  (`lib/games/participantAcceptance.ts`, import-ren) — `now()` når raden er ens
  egen, `null` når arrangøren legger til andre.
- **Kompenserende sletting:** feiler `game_players`-inserten, sletter webben den
  nyopprettede `games`-raden med samme RLS-klient (actions.ts:323-332, #737).
  Appen speiler (AGENTS.md trap 5), med trap 2-vern på begge skriv.
- **Publish-gate for uferdige profiler:** webben kaller
  `incomplete_profiles_for_ids`-RPC-en (SECURITY DEFINER, 0071) og blokkerer
  publisering når roster-medlemmer mangler profilfelt (actions.ts:166-190). Builder
  verifiserer EXECUTE-grant for `authenticated` (0137 revokte enkelte funksjoner);
  mangler granten → hopp over gaten, vis webbens «uferdig profil»-hint ikke, og
  bokfør restanse-issue.
- **Web-defaults (fasit for appens felter):** `registration_mode` default
  `'invite_only'` (`useGameFormState.ts:650-651`), sideturnering av by default
  (`:585`), `side_ld_count`/`side_ctp_count` 0–2 (`:604-607`),
  `side_disabled_categories: []`. Status ved publisering = `'scheduled'`
  (actions.ts:270) — noe «published» finnes ikke; draft er web-eid.
- **Feltene webben setter på `games`** (actions.ts:238-277): name, course_id,
  tee_box_id, hcp_allowance_pct, require_peer_approval, score_visibility,
  game_mode, mode_config, registration_mode, registration_type,
  let_friends_skip_gate, entry_fee_kr, payment_link, prizes,
  side_tournament_enabled, side_ld_count, side_ctp_count,
  side_disabled_categories, status, scheduled_tee_off_at, created_by,
  started_at=null, group_id, tournament_id, tournament_match_label. Appen setter
  samme kolonnesett via delt bygger; klubb/cup/premie-feltene får default-verdier
  (se Out of Scope).
- **Tee-off-tid trenger ny native modul:** `@react-native-community/datetimepicker`
  er den dokumenterte pickeren for Expo SDK 57 (docs.expo.dev v57;
  `npx expo install @react-native-community/datetimepicker`). Native modul →
  prebuild + pod install + nytt xcodebuild før simulatorbevis (samme felle som
  expo-sqlite/expo-font). `scheduled_tee_off_at` er timestamptz; pickeren gir
  device-lokal tid (Norge) — ingen Oslo-helper-behov klient-side.
- **Lag i veiviseren:** webbens `TeamsAssignmentSection` (steg 4) er self-gating
  per modus (GameWizard.tsx:964-967). Wolf får IKKE lag i veiviseren —
  rotasjonsslots settes ved start (#969, `assignRotationSlots` — N6b). Ufullstendige
  lag blokkerer ikke publisering; det er STARTEN som validerer
  (`startScheduledGame`-portene, N6b).
- **Bane/tee er åpne lesinger:** `courses`/`course_holes`/`tee_boxes` SELECT
  `using (true)` (0002:53-61). Builder speiler webbens arkiv-/synlighetsfilter fra
  bane-pickeren (sjekk `is_archived`-ekvivalenten i webbens course-liste før
  bygging).
- Ingen andre nye npm-deps enn datetimepicker; ingen DB-/RLS-endring; web-diff = 0
  kodefiler.

## Prior Decisions (videreført fra N1–#1850-kontraktene)

- **Direkte RLS-skriv med trap 2-vern** (`.select()`-kjeding / delt
  `expectAffected`) — appen har aldri service-role.
- **Beslutningslogikk bor i delt kilde, kun montering speiles** — her er selve
  payload-byggingen delt kode; det eneste som speiles er skjermflyt og
  insert-rekkefølge.
- **Design:** nye skjermer bruker `useTheme()` hvis #1833 har landet ved bygging,
  ellers husets statiske `ui`/`COLORS`; `FONTS`-tokens, aldri `fontWeight` oppå
  custom fontFamily; 44px tap-flater; `tabular-nums`-stil på tall.
- **`[no-changelog]`** på native-commits (appen er ikke shippet).
- **Relative imports** av delt repo-kode (husets stil, jf. `scoringContext.ts:27`).
- **Én simulator per økt**; jest-expo-harnessen (better-sqlite3-mock) er testfasit.
- **Ærlig feil framfor stille suksess:** feilede skriv gir norsk feilmelding via
  `actionFeedback`-mønsteret, aldri optimistisk «Opprettet!» uten bekreftet rad.

## Design

**Inngang:** «Opprett spill»-CTA på Hjem (over/ved «Mine spill» — plassering er
discretion). Ny route `CreateGame` i `RootStackParamList` (`navigation.tsx:25-33`).

**Veiviser-skjermen (`native/app/src/screens/CreateGame.tsx` + seksjons-komponenter):**
Stegvis flyt i ÉN skjerm med lokal steg-state (ikke flere stack-skjermer — utkastet
lever i minnet til publisering; sessionStorage-persistens er web-idiom og utgår).
Fire steg, speilet fra webbens steg 2–5 (intent-steget utgår — med 8 formater er
flat liste riktigere native-IA, se Key Decisions):

1. **Format:** kort per modus fra `formats`/`format_intent_mapping`-lesingen,
   filtrert på `is_visible` ∧ `is_active` ∩ `APP_SUPPORTED_MODES` (de 8:
   stableford, singles_matchplay, best_ball, greensome_matchplay, wolf,
   bingo_bango_bongo, modified_stableford, skins — konstant i appen, krysses mot
   DB-nøklene). `fitsPlayerCount`-filteret anvendes som webben gjør det (mot
   valgt/estimert spillerantall; builder speiler webbens rekkefølge-semantikk fra
   GameWizard.tsx:793-812 — formatvalg kan re-valideres når rosteret endres i steg 3).
2. **Oppsett:** modus-spesifikke felter (samme som webbens mode-setup: team_size/
   allowance/points_table m.fl. — fasit er `modeValidators`-inputene) + felles:
   navn, `require_peer_approval`, `score_visibility`, sideturnering (bryter +
   LD-antall 0–2 + CTP-antall 0–2; kategoriliste røres ikke i v1 — `[]` som web).
3. **Bane og tid:** bane-picker (søkbar liste), tee-picker for valgt bane,
   tee-off-tid via datetimepicker. Sist brukte bane øverst er discretion.
4. **Spillere og lag:** meg selv er alltid med; multi-select fra co-player-lista
   (users-RLS-lesingen, sortert på navn; ekskluder anonymiserte — speil webbens
   `deleted_at`-filter fra kandidat-lesingene). For lag-modi (best_ball,
   greensome_matchplay, singles_matchplay): lag-/side-tildeling per valgt spiller
   (chips, self-gating per modus som webbens TeamsAssignmentSection). Wolf/BBB/
   solo-modi: ingen lag-UI.
5. **Oppsummering + «Publiser»:** viser valgene; publisering kjører:
   (a) delt `buildGameInsertPayload` via FormData-shim → payload,
   (b) publish-gate: `incomplete_profiles_for_ids`-RPC (hvis grant),
   (c) INSERT `games` (RLS, `.select('id')`, `status:'scheduled'`,
       `created_by = session.userId`),
   (d) INSERT `game_players`-radene (accepted_at via delt `acceptedAtForActor`,
       team_number fra lag-tildelingen, flight_number null),
   (e) feiler (d) → kompenserende DELETE av games-raden + norsk feilmelding,
   (f) suksess → naviger til GameHome for det nye spillet.

**Datamodul (`native/app/src/data/createGame.ts` + `formatCatalog.ts` — inndeling
er discretion):** fetch av formats/kandidater/baner + insert-flyten, testet mot
supabaseMock; FormData-shimmen bor her eller i `lib/`-speilkatalogen med egen test.

**Skriv krever nett** (samme v1-beslutning som valg-skrivene i #1832): opprett-flyten
går aldri i sync-køen. Offline → rolig melding («Du må være på nett for å opprette
et spill»).

## Edge Cases & Guardrails

- **Tom kandidat-liste** (ny bruker uten co-players): veiviseren fungerer —
  arrangøren kan opprette spill med bare seg selv, og hint-tekst peker til
  nettsiden for å invitere nye folk (invitasjonslanding er web per MoSCoW).
- **Publisering med ufullstendige lag:** tillatt (web-paritet) — starten (N6b)
  er porten. Oppsummeringen viser en rolig «lag mangler tildeling»-linje.
- **Tee-off i fortid:** speil webbens sjekk (actions.ts:105-142) — avvis med norsk
  melding.
- **Format-lista tom** (DB-feil/offline ved fetch): ærlig «fikk ikke hentet»-note
  (#1832-guardrailen), aldri en tom liste som ser autoritativ ut.
- **Wolf spillerantall:** `fitsPlayerCount` håndhever 3–5 ved formatvalg mot
  valgt roster; endres rosteret etterpå re-valideres steget før publisering
  (webbens semantikk).
- **Dobbel-trykk på «Publiser»:** knappen låses mens insert pågår; en feilet
  (e)-kompensasjon som SELV feiler logges og gir melding om å sjekke «Mine spill»
  (games-raden kan da finnes — aldri stille).
- **RLS-avvisning fra 0115-triggeren** (skal ikke skje med subsettet, men):
  fanges som typet feil → norsk melding, games-raden kompenseres bort.
- **Ingen gjestespillere, ingen e-post-invitasjoner, ingen draft** — se Out of
  Scope.

## Key Decisions

- **Intent-steget utgår; flat format-liste.** Webben trenger intents for 22
  formater; appen viser 8. ASSUMPTION (autonom økt): innenfor
  «native-følelse»-mandatet (#1830), samme klasse avvik som #1850s
  stacked-seksjon-valg; bygge-PR-en beskriver det i Fordeler/ulemper-blokken.
- **Kandidat-picker = co-players (RLS-subsett), ikke venne-/klubb-unionen.**
  Alternativet — en ny SECURITY DEFINER-RPC som speiler `getInviteEligibleIds`
  med navn — er en DB-kontrakt vi IKKE tar nå: prod-bruken er en vennegjeng som
  har spilt sammen (co-players dekker), og 0115 håndhever uansett. Begrensningen
  bokføres i runbooken + som Could-oppfølger-issue ved bygging.
- **Publisering rett til `scheduled`; draft er web-eid.** Utkast-gjenopptak,
  rediger-flate og draft-lista er admin-flater (Should). Veiviser-state lever i
  minnet; avbrutt veiviser = forkastet.
- **Betaling/premier/klubb/cup-feltene settes til webbens defaults** (entry_fee 0,
  prizes tomt, group_id/tournament_id null) — kontingent er Won't, klubb/cup er
  Should.
- **mode_config bygges av delt kode via FormData-shim** — aldri en native
  duplikat av modus-reglene.

**Claude's Discretion:** steg-navigasjonens interne UI (progresjon, tilbake-knapp),
seksjons-/filinndeling, søk i bane-/kandidat-lister, om formatkort viser
beskrivelses-copy (kan speiles fra webbens format-tekster senere), datetimepicker
inline vs modal, «sist brukte bane»-sortering.

## Success Criteria

- [ ] 1. **Jest-låst payload-paritet:** FormData-shim + delt `buildGameInsertPayload`
  gir webbens payload-fasong for alle 8 modi (it.each-fixtures, inkl. mode_config
  med riktig `kind`), accepted_at-regelen (self=now, andre=null), kompenserende
  delete ved player-insert-feil, tee-off-i-fortid-avvisning. `npx jest` grønn i
  `native/app/`.
- [ ] 2. **Ende-til-ende på staging:** logg inn som e2e-admin i appen, opprett et
  stableford-spill med 2+ co-players og sideturnering (1 LD + 1 CTP) → spillet
  finnes i staging-DB med `status='scheduled'`, korrekt `mode_config`
  (service-role-lesing), game_players-rader med accepted_at null for andre — og
  spillet åpner i webbens `/games/[id]` uten feil (webben er fasit-konsument).
- [ ] 3. **Lag-modus på staging:** opprett et best_ball- eller greensome-spill med
  lag-tildeling i veiviseren → team_number-riktige rader i DB; et wolf-spill
  opprettes UTEN lag-UI og uten team_number (slots settes først ved start).
- [ ] 4. **Format-gaten:** veiviseren viser nøyaktig de 8 støttede modiene når
  DB-lesingen lykkes (jest mot mock + skjermbilde fra staging); fetch-feil gir
  ærlig note (jest).
- [ ] 5. **Guardrail:** dobbel-trykk-lås + RLS-avvisning → games-rad kompensert
  bort (jest med feilende player-insert i supabaseMock).
- [ ] 6. **Web uendret:** `npx vitest run` (rot) grønn med identisk antall som
  baseline; web-diff utenfor native/docs/forge = 0 filer.
- [ ] 7. **Porter + runbook:** alle Gates grønne; `docs/native/app-spike.md` får
  N6a-seksjon (veiviser-arkitekturen, FormData-shimmen, co-player-begrensningen,
  datetimepicker-pod-fella, seed-/verifiseringsoppskrift). Eier-tapptest på fysisk
  iPhone hvis eier tilgjengelig, ellers `VERIFICATION GAP` + restanse.

## Gates

(Fersk worktree: `npm install` i BÅDE repo-rot og `native/app/`. Node 22.
Datetimepicker er ny native modul: `npx expo prebuild` + `pod install` + nytt
xcodebuild før simulatorbevis.)

- [ ] `npx jest` i `native/app/` grønt
- [ ] `npx tsc --noEmit` i `native/app/` grønt
- [ ] `npx expo export --platform ios` grønt (slett `dist/` etterpå)
- [ ] `npm run typecheck` (rot) grønt
- [ ] `npx vitest run` (rot) grønt — identisk antall som baseline
- [ ] `npx eslint native/app` grønt
- [ ] `npm run build` (rot) grønt m/ pipefail

## Files Likely Touched

- `native/app/src/screens/CreateGame.tsx` (ny) + seksjons-komponenter under
  `native/app/src/components/create/` — veiviseren
- `native/app/src/data/createGame.ts` / `formatCatalog.ts` (nye, +tester) —
  fetch + insert-flyt + FormData-shim
- `native/app/src/navigation.tsx` — CreateGame-ruta
- `native/app/src/screens/Home.tsx` — CTA
- `native/app/package.json` — datetimepicker
- `docs/native/app-spike.md` — N6a-seksjon

## Out of Scope

- Gjestespillere (service-role-eid insert-vei — web), e-post-invitasjon av
  uregistrerte (`invitations` + Resend — web; invitasjonslanding er Won't i app),
  draft-lagring/gjenopptak og rediger-spill (web, Should), klubb-/cup-/liga-scoping
  (group_id/tournament_id — Should/Won't), betaling/premier (Won't),
  påmeldings-moduser utover default `invite_only` i v1 (endres på web; oppfølger
  ved pull), varsler/mail til inviterte (server-eid — spillet dukker opp i «Mine
  spill» via RLS; gap bokføres som i N3), venne-/klubb-kandidat-RPC (Could-oppfølger),
  start av runden og roster-drift etter opprettelse (N6b #1855), avslutt (N6c #1856).

---

**Til byggeren:** kjør drift-verifisering mot HEAD før første kodelinje
(#1850-mønsteret — tabell over bekreftet/endret per påstand her), og sjekk
natt-PR-ene for overlappende arbeid før du starter.

---

## Drift-verifisering mot HEAD (bygge-økt 2026-08-31, base `de966161`)

Kontrakten ble skrevet i en egen spec-økt. Alle påstander ble kontrollert mot HEAD før
første kodelinje. Fire påstander var feil eller ufullstendige, og én av dem endret
byggeplanen vesentlig.

### Feil / drift

| # | Kontrakt-påstand | Faktisk ved HEAD | Konsekvens |
| --- | --- | --- | --- |
| 1 | «Format-metadata bor i DB og er world-readable» | `formats` har KUN `slug, icon_key, scoring_module, is_active, is_cup_eligible`. **Ingen navne-kolonne.** Etikettene bor i `messages/no.json` under `modes.<slug>` | Appen speiler de 8 etikettene lokalt + jest-paritetstest mot `no.json` — samme mønster som `sideTournamentCopy.ts` (#1850). Contract-antakelsen kunne ikke oppfylles |
| 2 | `format_intent_mapping` joines på `game_mode` | Kolonnen heter **`format_slug`** | Spørringen rettet |
| 3 | Web-defaults i `lib/wizard/useGameFormState.ts` | Fila ligger i `app/[locale]/admin/games/new/useGameFormState.ts`. `lib/wizard/` har bare `draftResumePlan/fitsPlayerCount/getWizardMountData/intent/selectablePlayers` | Verdiene stemte; stien gjorde ikke |
| 4 | «formatvalg re-valideres når rosteret endres i steg 3» (GameWizard.tsx:793-812) | De linjene er FormatGrid-filteret på `expectedPlayerCount`. Den ekte re-valideringen henger på **PlayerCountPicker**, ikke på roster-endring; steg 4 gates av `playersValidForMode` | Appen speiler webbens semantikk (gate ved publisering), ikke en strengere roster-watcher |

### Presiseringer som endret byggeplanen

| Funn | Konsekvens |
| --- | --- |
| **`lib/games/gamePayload.ts` value-importerer `lib/games/prizes.ts`, som importerer `zod`.** Metro slår opp bare-importer fra den IMPORTERENDE fila og oppover, altså i repo-rotas `node_modules` — utenfor prosjektet og utenfor `watchFolders`. `npx expo export` feilet med «Unable to resolve module zod». **Jest var grønn hele tiden** (Node-oppslag fant rotas zod 4) | `metro.config.js` fikk `resolver.nodeModulesPaths` mot appens egen `node_modules`, og `zod@^4.4.3` ble en ekte dep av `native/app`. Ny ufravikelig regel: enhver bare-import som er nåbar fra den delte grafen MÅ være deklarert dep i `native/app`. Bevist med `expo export` exit 0 (commit `b08004f0`) |
| `getFormatsForIntent.ts` og `validateGameMode.ts` er hard `server-only` + service-role | Kan ikke importeres. Appen leser `formats`/`format_intent_mapping` direkte under RLS. Policyene er `to public` men gatet på `authenticated` — innlogget lesing virker, anonym gjør ikke |
| `formData.get()` er den ENESTE FormData-metoden `gamePayload.ts` bruker (53 kall, null `getAll`/`has`/`entries`) | Shimmen er en Map med `get()`. Bevist under jest før arkitekturen ble låst |
| Spiller-slots leses på INDEKS (`player_${i}_id`), men tee-gender på BRUKER-ID (`player_${uid}_gender`, actions.ts:295) | To nøkkel-konvensjoner i samme payload — begge må treffes |
| `effectiveMode`-nedgraderingen (`gamePayload.ts:2205`): publish med `registration_mode !== 'invite_only'` kjører validatoren i `'draft'` | Vi bruker alltid `invite_only`, så full validering. Notert som felle |
| `courses` har INGEN arkiv-kolonne; kun `tee_boxes.archived_at`, filtrert i JS etter fetch (`newGameFormData.ts:104`) | Appen speiler JS-filteret. Kontraktens «speil webbens arkiv-/synlighetsfilter fra bane-pickeren» hadde ingen SQL-motpart å speile |
| `incomplete_profiles_for_ids`: `authenticated` HAR fortsatt EXECUTE (`0071:120`); 0137 rører den ikke | Publish-gaten bygges — ingen restanse, ingen hoppet gate |
| Gjeste-rader krever service-role (`actions.ts:318-322`, 0115-triggeren) | Gjester (`is_guest = true`) finnes i RLS-kandidatsettet men kan aldri insertes fra appen → ekskluderes fra kandidatlista |
| `useTheme()` FINNES (`theme.ts:211`) — #1833 har landet | Nye flater bygges mot `useTheme()`. Merk: `navigation.tsx` sine header-farger er fortsatt hardkodet lyse |
| `theme.ts` har ingen `input`-token; appen har ingen form-primitiv utenom `Login.tsx` sin lokale stil | Veiviseren trenger et input-token i `createUi` (begge paletter) |

### Bekreftet uendret

`createGameInternal` gater kun på innlogging · `buildGameInsertPayload` er import-ren og
ligger på 2141 i en 2227-linjers fil · `acceptedAtForActor` · kompenserende delete
(`actions.ts:329`) · tee-off-i-fortid-sjekken · games-kolonnesettet + `status:'scheduled'`
· 0071/0092-policyene og 0115-triggeren · `courses`/`tee_boxes` SELECT `using (true)` ·
`users` SELECT = egen ∨ admin ∨ delt spill · `fitsPlayerCount` er ren TS (og eksporterer
også `soloPlayerCap`, som kontrakten ikke nevnte) · 12 CHECK-constraints på `games`.
