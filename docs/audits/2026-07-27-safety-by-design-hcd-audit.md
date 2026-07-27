<!--
  HCD-audit av Tørny mot ISO 9241-210 / «Safety by Design», 2026-07-27.
  Metode: 8 parallelle område-revisorer + dedup + 5 adversarielle verifiserere
  (workflow, 14 agenter). 63 kandidater → 53 dedupliserte → 53 verifiserte funn
  (0 avkreftet; flere fikk justert alvorlighetsgrad i verifiseringen).
  Dette er en RAPPORT (engangs-diagnose), ikke backlog. Backlog lever i GitHub Issues.
-->

# Tørny mot ISO 9241-210 — «Safety by Design»-audit — 2026-07-27

## Sammendrag

Bestillingen var å gå gjennom boka **«Safety by Design: Human-Centered Approaches to
AI, Automation, and Remote Operations»** (Bjørneseth, Johnsen, Alsos, Hepsø, Sætren —
CRC Press, juni 2026, open access) og standarden den bygger på, **ISO 9241-210**, og
vurdere om Tørny har noe som bør fikses.

Svaret er ja: auditen fant **53 verifiserte funn** — **5 P1, 26 P2, 22 P3**. Alle 53 er
klassifisert som *friksjon/stell på eksisterende flater*, altså innenfor
ferdiggrensen i `docs/hva-er-nok.md` (bugs, sikkerhet og friksjon rammes aldri av
frysen). Ingen av funnene krever ny funksjonalitet i feature-forstand; dette er
reparasjon av løfter appen allerede gir.

Det overordnede bildet: **Tørny er sterk der den har fått designoppmerksomhet**
(hull-skjermen som flate, offline-arkitekturen i bunn, dedikerte slette-sider,
44 px-baseline i `Button`) — **men svak på nettopp de egenskapene sikkerhetslitteraturen
handler om**: hva systemet forteller brukeren når automatikk feiler stille, når nettet
er borte, når noen venter på noen, og når det som står på skjermen ikke lenger er sant.

## Kildegrunnlag — og en ærlig begrensning

Kjøremiljøets nettverkspolicy blokkerer taylorfrancis.com, OAPEN og DOI-oppslag, og
bokas kapittelliste er ennå ikke indeksert i søkemotorer (utgitt 2026-06-16). Selve
PDF-en kunne derfor ikke leses i denne økten. Auditen er i stedet ankret i:

1. **ISO 9241-210:2019** — standarden brukeren eksplisitt pekte på, og som boka selv
   bygger på: menneskesentrert design basert på eksplisitt forståelse av brukere,
   oppgaver og omgivelser; brukerinvolvering; evaluering; iterasjon; hele
   brukeropplevelsen; tverrfaglighet.
2. **ISO 9241-110** (dialogprinsippene) som operativ sjekkliste: oppgaveegnethet,
   selvbeskrivelse, samsvar med forventning, lærbarhet, kontrollerbarhet,
   feiltoleranse, tilgjengelighet.
3. **Bokas dokumenterte kjernetemaer**, hentet fra forlagsomtale, forfatternes
   publiserte rammeverk (NTNU/SINTEF: CRIOP, meaningful human control) og
   bokanmeldelser: *meaningful human control* (automatikk krever innsikt, tid og
   reell inngrepsmulighet), *alarm-filosofi* (få, relevante, handlingsrettede varsler
   — alarm overload er en dokumentert ulykkesårsak), *situasjonsbevissthet*,
   *automasjons-transparens*, *design for operatører under stress*, og *konsistente
   grensesnitt*.

Golf-scoring er ikke sikkerhetskritisk — men overføringen er reell: Tørny brukes
utendørs, under tidspress, med hansker, i sollys, på flekkete dekning, av
ikke-tekniske brukere, med automatikk (offline-kø, last-write-wins, auto-start,
cache) som opererer stille i bakgrunnen. Det er nøyaktig konteksten bokas
designprinsipper er skrevet for.

## Metode

Samme rigg som helse-auditen 2026-06-17: **8 parallelle område-revisorer**
(onboarding/login, hull-skjermen, lever/godkjenn/avslutt, offline/sync/realtime,
leaderboard/spectate/liga/cup, arrangør-flytene, tilgjengelighet, feil/varsler) som
kun fikk rapportere funn med fil:linje-bevis fra kode lest i økten → **dedup**
(63 kandidater → 53) → **5 adversarielle verifiserere** med mandat til å avkrefte:
re-lese bevislinjene, grep-e etter mitigeringer revisoren ikke så, duplikatsjekke
mot åpne og lukkede GitHub-issues, og reklassifisere alvorlighetsgrad. **0 funn ble
avkreftet**; flere ble nedjustert (bl.a. F1 P1→P2 fordi lag-flyten har null reell
prod-bruk) og ett er kjent fra før (F5 ↔ #1069, parkert). `docs/user-flows.md` §4
(mai 2026) ble behandlet som hypotese, ikke fasit — flere av funnene der er
allerede fikset (bunn-nav, «Finn turneringer») og er ikke gjentatt her.

## Tvers-gående mønstre

Enkeltfunnene under er symptomer. Mønstrene er diagnosen — og de matcher bokas
temaer påfallende presist:

### 1. Stille automatikk — appen forteller ikke når den feiler
*(bok: automasjons-transparens + meaningful human control — det største mønsteret)*

Avvist scorekort varsler ingen selv om copyen lover det (**F17**). Realtime dør
stille og tavla fryser uten ferskhetsindikator (**F25**). Sync-køen drives bare fra
hull-siden og blir liggende urørt ellers (**F26**, **F50**). En medspillers score du
tastet kan overskrives uten et ord (**F27**). Gjenåpning av spill varsler ingen
(**F22**). Innboksen svelger databasefeil og viser «Ingen nye varsler» (**F51**), og
optimistiske handlinger viser suksess selv når lagringen feilet (**F53**).
Fellesnevner: automatikken er bygget, men *innsynet* i den mangler — brukeren får
verken vite at noe gikk galt eller gis mulighet til å gripe inn.

### 2. Blindveier — flyter som stopper uten vei videre
*(bok: error recovery over feilmelding)*

Offline er appen en blindvei ved hull-bytte og restart — kjernescenarioet
offline-arkitekturen finnes for (**F9**). /approve kan skjule kort du er attestant
for, så peer-godkjenning aldri kan fullføres i enkelte formater (**F18**). Arrangøren
stoppes på /avslutt uten pekere til overriden som finnes (**F19**). Feilskrevet
e-post på kodesteget har ingen rettevei (**F4**), «Send på nytt» på utløpt invitasjon
er en blindvei for mottakeren (**F40**), og tilskuere møter innloggingsvegg bak
«live»-lenker (**F32**).

### 3. Felt-forholdene — sollys, hansker, tommel
*(ISO 9241-210: brukskonteksten er banen, ikke sofaen)*

Champagne-gull som meningsbærende tekst måler ~2:1 (**F33**), advarselstekst
2.1–2.4:1 (**F47**), fokusindikatoren 1.3:1 (**F45**) — alt verst i direkte sollys.
Treffflater under 44 px finnes på selve hull-skjermen (**F12**, **F15**) og i
login-flyten (**F8**), stikk i strid med appens egen 44 px-regel. 295 forekomster av
8–10 px mikrotypografi skalerer ikke med tekst-innstillinger (**F49**). ScoreCard er
ikke tastatur-operabelt og har ugyldig ARIA (**F46**), og uleste-prikken er usynlig
for skjermlesere (**F48**).

### 4. Tapt kontekst og state — appen glemmer hvor brukeren var
*(bok: situasjonsbevissthet)*

Server-feil ved publisering kaster arrangøren til tom veiviser (**F38**), tilbake-gest
sletter alt (**F39**), reload gjenopptar med stille default-verdier (**F42**).
Login-feil mister `next`, e-post og invitasjonskontekst (**F3**), profilporten mister
/team-konteksten og leder nye medspillere inn i feil skjema (**F2**), og lag-invitasjon
kobles til nyeste lag i stedet for laget som inviterte (**F1**).

### 5. Løfter som ikke holdes — copy sier én ting, koden gjør noe annet
*(ISO 9241-110: samsvar med forventning)*

«Spilleren blir varslet» — ingen varsel sendes (**F17**). «Åpner når alle har levert
og godkjent» — tavla åpner først når admin avslutter (**F34**). «Følger live» med
pulserende dot — polling feiler stille (**F35**). Admin-flaten sier «starter ikke av
seg selv» — runden auto-starter ved tee-off (**F41**). Hull-stripa viser «fullført»
uten at scorer finnes (**F11**). Delt førsteplass framstilles som vinner + taper
(**F31**).

### 6. Språkblanding — norsk hardkodet utenfor i18n
SyncBanner (**F14**), server-fallbacks som «Ingen grunn oppgitt» (**F23**) og
cup-siden (**F36**, inkl. skrivefeilen «point») viser norsk i engelsk locale.

## Det som står seg (verifisert i samme gjennomgang)

- `Button`-primitiven holder 44 px-baseline og token-palett; avvikene over er
  lokale unntak, ikke systemfeil.
- Destruktive handlinger har dedikerte `/slett`-bekreftelsessider (spill, spillere,
  konto) — mønsteret boka ville kalt «guardrails», og det etterleves.
- Offline-arkitekturen i bunn (Dexie → kø → `upsert_score_if_newer`) mister ikke
  data — funnene handler om *innsyn og tilgang*, ikke om datatap.
- OTP-innlogging uten lenker fjernet en hel klasse feilmoduser (mail-scannere,
  PKCE-brudd) — et historisk eksempel på nettopp denne typen kontekst-drevet design.

---

## P1 — blokkerer eller risikerer kjerneløkka

### F9 — Offline er appen en blindvei ved hull-bytte og app-restart

**P1 · friksjon · `public/sw.js:95-124`**
*Prinsipp: 9241-210 brukskontekst (dekning på banen) + 9241-110 feiltoleranse* — *bok-tema: Error recovery over feilmelding / design for stress*

Kjerne-scenarioet offline-arkitekturen finnes for — taste slag uten dekning midt i runden — overlever bare så lenge selve hull-siden holder seg i live i minnet. «Neste hull»-knappen er en vanlig Next-lenke til en server-rendret rute, og service workeren nekter (bevisst, av sikkerhetsgrunner) å cache autentiserte /games-sider. Uten dekning feiler navigasjonen, og SW faller tilbake til en cachet forside-shell. Det samme skjer når iOS dreper PWA-en mellom hull (vanlig etter 10+ min i lomma): gjenåpning offline lander på en stale forside, og alle veier tilbake til hullet krever nett. Spilleren står uten noen flate å taste slag på — Dexie-dataene er trygge, men UI-et er utilgjengelig til dekningen er tilbake. Ingen proaktiv prefetch av nabo-hull finnes (grep etter router.prefetch i holes/ gir kun test-mock). SW-kommentaren «The offline scoring loop is Dexie-based and does not rely on cached HTML» holder altså bare for én enkelt, allerede åpen hull-side.

**Bevis:** public/sw.js:10-14 (autentiserte sider caches aldri), sw.js:28-44 (nav-allowlist uten /games), sw.js:109-120 (offline-fallback = cachet «/»-shell eller Response.error()); app/[locale]/games/[id]/holes/[holeNumber]/page.tsx:64+ (async server-komponent, Supabase-fetch per hull-visning); HoleClient.tsx:784-790 + 1102-1106 (Neste hull/lever = href til server-rute) + BottomActionBar.tsx:56-58 (SmartLink); components/ui/SmartLink.tsx:31-35 (prefetch først på touchstart — for sent når man alt er offline).

**Forslag:** Gjør hull→hull-navigasjon klient-lokal i den allerede monterte HoleClient (state-bytte uten RSC-fetch), og/eller precache en nøytral, brukerdata-fri offline-shell som leser Dexie og lar spilleren fortsette å taste. Lavrisiko førstesteg: prefetch nabo-hullenes RSC-payload proaktivt mens nettet er oppe (router.prefetch av hull ±1 i en useEffect ved mount av HoleClient). Minimum: en dedikert offline-fallbackside («Du er uten dekning — slagene dine ligger trygt på telefonen») med retur-vei, i stedet for en stale forside uten forklaring.

**Verifisering:** Alt bevis verifisert: sw.js:10–14 + 28–44 cacher aldri /games, offline-fallback er cachet «/»-shell eller Response.error() (:107–121); hull-siden er en async server-komponent med Supabase-fetches; «Neste hull» er href til server-rute (HoleClient.tsx:784–790 via BottomActionBar); SmartLink prefetcher først på touchstart (SmartLink.tsx:31–46) — for sent offline; ingen proaktiv prefetch finnes (kun test-mock). #819 (lukket, sikkerhet) er årsaken, ikke en fiks; ingen issue dekker offline-navigasjonshullet. P1 står: dette er kjernescenarioet offline-arkitekturen finnes for.

### F17 — Avvist scorekort: appen lover «Spilleren blir varslet», men ingen varsel sendes

**P1 · friksjon · `app/[locale]/games/[id]/approve/actions.ts:185`**
*Prinsipp: 9241-110 selvbeskrivelse + feiltoleranse* — *bok-tema: Alarm-filosofi / situasjonsbevissthet*

Når en medspiller avviser et scorekort, viser /approve suksessbanneret «Scorekortet ble avvist. Spilleren blir varslet.» — men rejectScorecard sender verken in-app-varsel, push eller mail. JSDoc-en innrømmer det: spilleren ser grunnen først «next time they open the app» (banner på spill-hjem). Kontrast: approveScorecard OG submitScorecard kaller notify(). Konsekvens: spilleren som leverte ser «Scorekort levert — venter på godkjenning», pakker sammen og drar hjem — mens submitted_at i realiteten er nullstilt og spillet ikke kan avsluttes før hen redigerer og leverer på nytt. Attestanten tror varsling har skjedd (copyen sier det), så ingen sier fra muntlig heller. Kjerneløkka (lever → godkjenn → avslutt) stopper stille.

**Bevis:** approve/actions.ts:180-226 — rejectScorecard har ingen notify()-/mail-kall (sml. approveScorecard linje 141-172 som kaller notify med 'scorecard_approved'); JSDoc linje 181-184: «the affected player sees it on the game home page next time they open the app». messages/no.json game.approve.banners.rejected: «Scorekortet ble avvist. Spilleren blir varslet.» lib/notifications/types.ts har ingen 'scorecard_rejected'-kind (kun registration_rejected). Rejection-banneret rendres kun ved besøk på spill-hjem: (home)/page.tsx:893-899.

**Forslag:** Legg til notify-kind 'scorecard_rejected' (payload: game_id, game_name, rejecter_name, reason) og fyr den best-effort i rejectScorecard, samme mønster som scorecard_approved i approveScorecard — deeplink til spill-hjem der rejection-banneret allerede finnes. Alternativt (minimum, én linje): endre banner-copyen til «Spilleren ser avvisningen neste gang hen åpner spillet» så UI-et slutter å love noe som ikke skjer.

**Verifisering:** rejectScorecard (approve/actions.ts:185-226) har ingen notify, i kontrast til approveScorecard (:161-169); ingen scorecard_rejected-kind i lib/notifications/types.ts; no.json:1690 lover «Spilleren blir varslet»; rejection-banneret vises kun ved besøk på spill-hjem (:893-896). «Avslutt likevel» (#375) hindrer permanent deadlock, men da finaliseres spillerens runde som «ikke levert» — den stille stallen og den falske lovnaden i kjerneløkka står, så P1 holder.

### F18 — /approve filtrerer på flight_number og skjuler kort du er attestant for — singles matchplay med peer-godkjenning kan aldri godkjennes av spillerne

**P1 · friksjon · `app/[locale]/games/[id]/approve/page.tsx:172`**
*Prinsipp: 9241-110 feiltoleranse + oppgaveegnethet + samsvar med forventning (konsistens)* — *bok-tema: Alarm-filosofi / error recovery over feilmelding / situasjonsbevissthet*

#543-regelen («én-flight-spill: alle aktive er attestanter») er implementert i autorisasjonen (peersForApproval i approve/actions.ts), i varselutsendingen (submit/actions.ts) og i banneret på spill-hjem — men IKKE i selve /approve-siden, som fortsatt filtrerer pending-kort på strikt flight_number-likhet. Samtidig setter gamePayload flight_number = team_number for hele matchplay-/lagfamilien. I et singles matchplay-spill (2 spillere, flight 1 vs 2) med «Krev peer-godkjenning» (checkbox tilgjengelig for alle moduser i wizard-en): motstanderen — den ENESTE mulige attestanten — får peer_approval_request-varsel som deeplinker til /approve — og møter «Ingen scorekort venter på godkjenning i flighten din.» Ingen spiller kan noensinne godkjenne via UI (kun admin kan); endGame blokkerer på not_all_approved. Samme skjulte kort rammer 2v2-formater på tvers av lag og ≤4-spill der flight-numrene avviker. Et handlingsrettet varsel som deeplinker til en blindvei bryter alarm-filosofien, og kortet kan bli stående ugodkjent — deadlock i kjerneløkkas godkjenn-steg. (Kode-sporing, ikke kjøretest — bør reproduseres på staging.)

**Bevis:** app/[locale]/games/[id]/approve/page.tsx:172-178 — pending-filter `m.flight_number === flightNumber`. Kontrast: approve/actions.ts:62-77 autoriserer via peersForApproval; submit/actions.ts:134-152 varsler via samme regel; PendingApprovalsBanner.tsx:41-61 teller på tvers ved singleFlight; lib/games/flightScope.ts:118-136 (én-flight → alle aktive er attestanter). lib/games/gamePayload.ts:784-786 («flight_number = team_number», singles matchplay) + 917, 1017, 1118, 1239 (samme for lag-formater). lib/notifications/deeplink.ts:39-42 — peer_approval_request → /games/{id}/approve. GameWizard.tsx:978-980 + AdvancedSettingsSection.tsx:78-94 (attesterings-bryteren tilgjengelig for alle formater). no.json game.approve.noPending: «...i flighten din».

**Forslag:** Bytt flight-likhetsfilteret i PendingApprovals ut med samme kilde som resten av flyten: pending = spillere hvis kort current user er attestant for via peersForApproval (invertert: currentUserId ∈ peersForApproval(..., p.user_id)) og som har submitted_at uten approved_at. Da er side, varsling og autorisasjon garantert enige — regelen får ett hjem (AGENTS.md trap 4). Oppdater copyen «i flighten din» til «i gruppa di» der single-flight gjelder, og legg til én test som asserterer at banner-telling, action-autorisasjon og siderendring bruker samme peer-sett.

**Verifisering:** Hele kjeden verifisert: approve/page.tsx:172-178 filtrerer strikt på flight-likhet (flightNumber = me.flight_number, :134) mens actions (:62-77), submit-varsling (:131-163) og PendingApprovalsBanner (:41-61) bruker peersForApproval/singleFlight; gamePayload.ts:784-787 m.fl. setter flight=team for matchplay/lag; attesterings-bryteren er tilgjengelig for alle moduser; deeplink går til den tomme /approve-siden. Creator-overriden på /spillere er eneste (uskiltede) utvei. Kode-sporing, ikke kjøretest, men fem uavhengige kilder stemmer.

### F38 — Server-feil ved publisering kaster arrangøren tilbake til en tom veiviser — all inndata tapt

**P1 · friksjon · `app/[locale]/admin/games/new/actions.ts:158`**
*Prinsipp: 9241-110 feiltoleranse* — *bok-tema: Error recovery over feilmelding*

Alle server-side feilstier i createGameInternal redirecter til `${errorBase}?error=...` — en fersk /admin/games/new uten steg- eller skjema-state. Veiviseren mounts på steg 1 med tomme defaults, og alt arrangøren har tastet gjennom 5 steg er borte. Dette treffer ikke bare sjeldne db-feil: `pending_players`-gaten (roster-medlem som ikke har fullført profil) håndheves KUN server-side — veiviseren lar admin velge pending-spillere (vises med badge i PlayersSection.tsx:240) og `missingForPublish` sjekker det ikke. Feilbanneret sier attpåtil «Klarte ikke å lagre spillet. Prøv igjen om litt» — men det finnes ingenting å prøve igjen; skjemaet er tomt. Samme gjelder «Lagre utkast».

**Bevis:** app/[locale]/admin/games/new/actions.ts:63-65 (payload-feil → redirect), :157-159 (pending_players → redirect), :251-254 (db_game → redirect), :293-301 (db_players → redirect); banner på fresh side: app/[locale]/admin/games/new/page.tsx:133-136; copy «Prøv igjen om litt»: messages/no.json wizard.errors.db_game; pending-spillere valgbare: app/[locale]/admin/games/new/sections/PlayersSection.tsx:234-240; ingen state-persistens funnet (grep localStorage/sessionStorage i games/new = 0 treff)

**Forslag:** Behold inndata ved feil: returner feilkode fra server-actionen (useActionState) i stedet for redirect, slik at veiviseren står urørt med feilbanner in-place. Alternativt/i tillegg: persist veiviser-state i sessionStorage og gjenopprett ved mount når ?error= er satt. Gate `pending_players` også klient-side via missingForPublish, så publiser-knappen forklarer mangelen FØR innsending.

**Verifisering:** Verifisert: alle server-feilstier redirecter til ?error= på fersk /admin/games/new (actions.ts:63–65, 157–159, 251–254, 293–301) uten noen state-persistens (grep localStorage/sessionStorage = 0). Verre enn påstått: pending_players-redirecten sender ikke emails-param, så banneret navngir ikke engang hvilke spillere som mangler profil, samtidig som veiviseren lar dem velges (PlayersSection.tsx:240–242) og MissingForPublishCode mangler pending-kode. P1 står: total inndata-tap i kjerne-opprettelsesflyten på en normal-bruk-sti.

### F45 — Fokusindikatoren er nesten usynlig (1.3:1) og native outline er fjernet app-vidt

**P1 · friksjon · `components/ui/Button.tsx:11`**
*Prinsipp: 9241-110 tilgjengelighet (WCAG 2.4.7 + 1.4.11)*

Appens eneste fokusmønster er «focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40» — 69 forekomster i 45 filer, inkludert alle primitives (Button, Input, Switch, SegmentedField, ThemeSwitcher, LocaleSwitcher). Beregnet effektiv ringfarge: accent på 40 % opasitet over lin-bakgrunn = #e5d7b7, kontrast 1.32:1 mot lin og 1.35:1 mot hvit surface (krav: 3:1 for ikke-tekst). I mørk modus 2.51:1 — også under kravet. Siden native outline samtidig fjernes, har tastatur- og bryterbrukere i praksis ingen synlig fokusposisjon noe sted i appen — det ekskluderer en hel brukergruppe. Kuriosum: det finnes en `--focus-ring`-token, men den er KUN definert i dark mode-blokkene (globals.css:161 og 249, mangler i :root) og brukes ikke av noen app-komponent — bare av docs/design-kit-en.

**Bevis:** components/ui/Button.tsx:11 ('focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40'), samme mønster i components/ui/Input.tsx:38, Switch.tsx:31, SegmentedField.tsx:95, ThemeSwitcher.tsx:78; grep fant 69 forekomster/45 filer og ingen sterkere variant. app/globals.css:161+249 definerer --focus-ring kun i dark; :root (linje 20–129) mangler den. Kontrast beregnet med WCAG-formel i økten: 1.32:1 (lys), 2.51:1 (mørk).

**Forslag:** Definer `--focus-ring` også i :root (f.eks. solid `#1b4332` eller 2px ring med offset — primærgrønn gir 10.25:1 mot lin), og bytt `ring-accent/40` til en token-basert ring i alle primitives (én søk-og-erstatt siden mønsteret er identisk). Behold champagne-glød i dark mode ved å heve opasiteten til minst 0.8. Dette er ren stell-endring uten visuell kostnad for touch-brukere (focus-visible fyrer ikke ved tapp).

**Verifisering:** Verifisert i dag: Button.tsx:11 har eksakt mønsteret, grep bekrefter ring-accent/40 som eneste fokusmønster i alle primitives (Switch:31, SegmentedField:95, ThemeSwitcher:78, LocaleSwitcher:55), --focus-ring finnes kun i dark-blokkene (globals.css:161+249, ikke i :root 20–129), og det finnes ingen global :focus-visible-fallback noe sted (eneste CSS-fil er globals.css). Kontrast re-beregnet i økten til ~1.32:1 mot lin; lukkede a11y-issues (#871, #872, #882) rørte aldri ringkontrasten — #882 la tvert imot samme svake ring på flere flater. Eneste nyanse: Input.tsx bruker focus: (ikke focus-visible:) med samme accent/40-ring — endrer ikke konklusjonen.


## P2 — reell friksjon i kjerneflytene

### F1 — Lag-invitert kobles til nyeste lag i spillet — ikke laget som faktisk inviterte dem

**P2 · friksjon · `app/[locale]/signup/[shortId]/teamActions.ts:957`**
*Prinsipp: 9241-110 kontrollerbarhet* — *bok-tema: Meaningful human control*

En e-post-invitert medspiller som logger inn og lander på /signup/[shortId]/team får en «Bli med på lag»-knapp. Serveraksjonen attachToCaptainTeam velger kaptein ved å hente NYESTE kaptein-request for spillet (order by created_at desc, limit 1) — den ignorerer invitations.invited_by, som allerede identifiserer riktig kaptein og faktisk hentes i samme funksjon (brukes kun til auto-vennskap). I et spill med flere lag (klubb-skala er eksplisitt målgruppe) blir invitéen stille koblet til feil lag så snart et annet lag registrerer seg etter invitasjonen. UI-et forverrer det: invited_unknown-visningen viser verken lagnavn eller kapteinnavn før man trykker — brukeren har null innsikt og null mulighet til å gripe inn, og feilen oppdages tidligst på team-dashboardet etterpå (eller aldri, før scoringen blir feil).

**Bevis:** teamActions.ts:951–968: `.eq('is_team_captain', true).in('status', ['pending','approved']).order('created_at', { ascending: false }).limit(1)` — invitation.invited_by (hentet på linje 924–933) brukes ikke i kaptein-oppslaget. TeamDashboardClient.tsx:135–163: invited_unknown-modus rendrer kun neste-steg-tekst + knapp, ingen lag-/kapteinsinfo (team/page.tsx:121–140 sender heller ikke slike props). Kommentaren i teamActions.ts:892–895 innrømmer heuristikken, men feilscenarioet krever ikke «flere kapteiner inviterte samme person» — det holder at ett annet lag registrerte seg senere.

**Forslag:** Slå opp kapteinen via invitation.invited_by (kaptein-request der user_id = invited_by) og fall kun tilbake til heuristikk hvis den mangler. Vis lagnavn + kapteinnavn i invited_unknown-visningen («Du er invitert til laget {teamName} av {captain}») så brukeren bekrefter riktig lag før attach.

**Verifisering:** Bevis stemmer: teamActions.ts:951–968 velger nyeste kaptein-request for spillet uten slot-sjekk, invitation.invited_by (:926) brukes kun til auto-vennskap (:1043), og invited_unknown-visningen (TeamDashboardClient.tsx:135–163 + team/page.tsx:121–140) viser verken lagnavn eller kaptein. #676 (lukket) fikset solo-insert for 'both'-spill men ikke attach-heuristikken. Nedjustert til P2: team-flyten har null reell prod-bruk (per #1069), så feilen er latent — men stille feilkobling ved flere lag er reell.

### F2 — Profilporten mister /team-konteksten — ny medspiller havner i «registrer nytt lag»-skjemaet

**P2 · friksjon · `app/[locale]/signup/[shortId]/teamActions.ts:144`**
*Prinsipp: 9241-110 feiltoleranse* — *bok-tema: Error recovery over feilmelding*

En helt ny bruker invitert til et lag rutes etter OTP-innlogging til /signup/[shortId]/team (verifyCode, #676) og ser attach-flyten uten profil (visning gater ikke per #1176). Men når de trykker «Bli med på lag», redirecter requireAuthedUser dem til /complete-profile med next=/signup/[shortId] — /team-suffikset er droppet. Etter fullført profil lander de på base-signup-siden, som for team-spill viser TeamRegistrationForm: «Registrer laget» med lagnavn + e-postfelter for N-1 medspillere. Den inviterte, ikke-tekniske brukeren står nå i et skjema for å opprette et NYTT lag, uten noen pekepinn tilbake til invitasjonen sin — verste utfall er at de faktisk registrerer et duplikat-lag. Invitasjonen deres ligger fortsatt ventende på /team-siden, men ingenting peker dit.

**Bevis:** teamActions.ts:144: `redirect({ href: `/complete-profile?next=/signup/${shortId}`, locale })` — brukes av attachToCaptainTeam/acceptTeamInvite som alle kalles fra /signup/[shortId]/team. complete-profile/actions.ts:92 redirecter til next som gitt. page.tsx:557–579: base-siden rendrer TeamRegistrationForm for uregistrerte på team-spill; ingen gren sjekker om brukeren har en ventende lag-invitasjon (hasPendingInvitation sjekkes kun i invite_only-grenen, page.tsx:219–229).

**Forslag:** La requireAuthedUser ta med hele retur-stien (next=/signup/[shortId]/team for team-aksjonene). I tillegg: på base-signup-siden, sjekk pending invitations-rad med game_id også utenfor invite_only-grenen og vis «Du er invitert til et lag — gå til laget ditt»-banner med lenke til /team.

**Verifisering:** Verifisert: requireAuthedUser (teamActions.ts:144) redirecter til /complete-profile?next=/signup/[shortId] og dropper /team-suffikset; complete-profile/actions.ts:92 redirecter til next som gitt; base-signup rendrer TeamRegistrationForm for uregistrerte på team-spill uten pending-invitasjonssjekk utenfor invite_only-grenen (page.tsx:219–229, 557–579). #1176 fjernet profilporten for spill-sider men ikke for team-attach-aksjonene. Ingen dekkende issue funnet.

### F3 — Feil-redirects i login-flyten mister next, e-post og invite — bruker kastes til start uten kontekst

**P2 · friksjon · `app/[locale]/(auth)/login/actions.ts:147`**
*Prinsipp: 9241-110 feiltoleranse* — *bok-tema: Situasjonsbevissthet*

Alle feilstier i sendCode redirecter til /login?error=<kode> uten email, next eller invite; verifyCode-feil beholder email men mister next og invite. Konkret hverdagsscenario: bruker på verify-steget trykker «Send ny kode» innen 60 sekunder → Supabase-throttle → mappes til rate_limited → brukeren kastes tilbake til steg 1 med TOMT e-postfelt og «Vent litt før du prøver igjen» — mens en fullt gyldig kode er på vei til innboksen. Tilsvarende: én feiltastet kode mister next, så en bruker som var på vei til /signup/[shortId] (selvpåmelding) eller dypere inn i appen lander på forsiden etter vellykket andre forsøk, uten turneringen de skulle melde seg på. Invitasjons-kontekstkortet (#1169) forsvinner også etter første feil.

**Bevis:** actions.ts:147: `redirect(`/login?error=${code}`)` (samme mønster linje 50, 62, 84 — ingen params). actions.ts:205: `new URLSearchParams({ step: 'verify', email, error: code })` — next/invite utelatt. actions.ts:184: `next = hasExplicitNext ? nextRaw : '/'` → etter retry redirectes til '/'. actions.ts:108–110 mapper Supabase «security purposes»-meldingen (60s-throttle) til rate_limited. Kommentar i actions.ts:29–30 innrømmer at mønsteret er «akseptert i kontrakten» — men kun for invite-parameteren.

**Forslag:** Ta med email, next og invite i alle feil-redirects (de er allerede i hånden i begge actions). Rate-limit-/resend-feil under verify-steget bør beholde step=verify så brukeren blir stående ved kodefeltet i stedet for å kastes til start.

**Verifisering:** Verifisert linje for linje: sendCode-feil redirecter uten email/next/invite (actions.ts:50, 62, 84, 147), verifyCode-feil beholder email men mister next/invite (:186–193, :202–206), og :184 faller til '/' ved retry. Supabase 60s-throttle mappes til rate_limited (:106–110). SendCodeForm har ingen klient-persistens (kun defaultValue fra URL), så feltet blir tomt. Rammer kjerneflyten innlogging → påmelding.

### F4 — Ingen vei tilbake for å rette feilskrevet e-post på kodesteget

**P2 · friksjon · `app/[locale]/(auth)/login/_components/VerifyCodeForm.tsx:33`**
*Prinsipp: 9241-110 kontrollerbarhet* — *bok-tema: Error recovery over feilmelding*

Verify-steget viser «Skriv inn koden vi sendte til {email}» pluss «Send ny kode» — men ingen lenke for å endre e-postadressen. Skriver en selvregistrerende bruker (selvreg-flagget på: da sendes kode til hva som helst) f.eks. «jorgen@gmial.com», står de i en blindvei: koden kommer aldri, «Send ny kode» sender til samme feiladresse, og i installert PWA på iOS finnes verken adressefelt eller synlig tilbake-knapp. Eneste utvei er å gjette at man kan navigere tilbake — ikke noe en ikke-teknisk 60-åring gjør. Invitasjonsflyten er beskyttet (mail-lenken preutfyller adressen), men selvpåmelding via plakat/lenke er nettopp flyten der folk taster adressen selv, med hansker, i sollys.

**Bevis:** VerifyCodeForm.tsx:33–51: kun verify-form + resend-form, ingen «feil adresse?»-lenke; page.tsx:180–187 rendrer bare VerifyCodeForm i verify-steget. resendHref bygges i page.tsx:132–136 men er markert @deprecated og brukes ikke (VerifyCodeForm.tsx:30–31). sendCode sender kode til enhver adresse når NEXT_PUBLIC_ALLOW_SELF_REGISTRATION='true' (actions.ts:70–92).

**Forslag:** Legg til en «Feil adresse? Endre e-post»-lenke under kodefeltet som går til /login?email=<email>&next=…&invite=… (steg 1 med feltet preutfylt og redigerbart). Én lenke, ingen ny logikk — resendHref-mønsteret som allerede finnes i page.tsx kan gjenbrukes.

**Verifisering:** Verifisert: VerifyCodeForm.tsx:33–51 har kun verify- og resend-form, ingen endre-adresse-lenke; resendHref bygges i page.tsx:132–136 men er @deprecated og ubrukt (VerifyCodeForm.tsx:30–31); selvreg-flagget sender kode til enhver adresse (actions.ts:70–92); /login har ingen TopBar/tilbakeknapp, så installert PWA mangler synlig vei tilbake. #768 (lukket) fjernet i praksis den gamle lenken tilbake til steg 1 da resend ble inline.

### F10 — Avsluttet spill gir låst hull-side uten forklaring

**P2 · friksjon · `app/[locale]/games/[id]/holes/[holeNumber]/page.tsx:108-123`**
*Prinsipp: 9241-110 selvbeskrivelse* — *bok-tema: Error recovery over feilmelding*

page.tsx redirecter draft → hjem, scheduled → spill-hjem og submitted → spill-hjem, men status 'finished' har ingen gren: siden rendres med gameStatus='finished', og HoleClient setter da disabled=true på alt — alle kort får opacity 0.6/cursor not-allowed, +/−/⋯ deaktiveres og bunn-CTA-en blir en død, grå knapp. Det finnes ingen banner, tekst eller lenke som forklarer HVORFOR (withdrawn-tilstanden har egen banner med angre-lenke, finished har ingenting). Scenariet er reelt: en spiller midt i runden som ikke har levert når admin avslutter (eller som åpner en gammel hull-URL) møter en flate der ingenting virker og ingenting sier hvorfor — en blindvei i kjerneflyten.

**Bevis:** app/[locale]/games/[id]/holes/[holeNumber]/page.tsx:108-123 (redirect for draft/scheduled/submitted, ingen for finished); HoleClient.tsx:654-666 (gameInactive = gameStatus !== 'active' → disabled, kun kommentert som «defensive disable», ingen bruker-synlig forklaring); HoleClient.tsx:948-984 (withdrawn har banner + angre-lenke — finished har ingen tilsvarende); HoleClient.tsx:871 (bottomDisabled || disabled → død CTA)

**Forslag:** Enkleste fix i samme mønster som de andre statusene: redirect til spill-hjem (eller leaderboard) når game.status === 'finished' i page.tsx. Alternativt en banner à la withdrawn-banneren: «Runden er avsluttet — se resultatet» med lenke til leaderboard, slik at spilleren alltid får forklaring + en vei videre.

**Verifisering:** Verifisert: page.tsx:108–123 redirecter draft/scheduled/submitted men har ingen finished-gren (grep bekrefter); HoleClient.tsx:656–666 disabler alt ved gameStatus !== 'active' med kun en «defensive disable»-kommentar; withdrawn har banner med angre-lenke (:950–984), finished har ingenting; CTA-en dør (:871, :1102–1106). Tilbake-pilen øverst finnes, men ingenting forklarer hvorfor flaten er låst. Ingen dekkende issue funnet.

### F11 — Hull-stripa viser «fullført» basert på posisjon, ikke på faktiske scorer

**P2 · friksjon · `components/hole/HoleStrip.tsx:79-85`**
*Prinsipp: 9241-110 selvbeskrivelse + samsvar med forventning* — *bok-tema: Situasjonsbevissthet*

HoleStrip avleder celle-tilstand utelukkende fra n < currentHole: alle hull bak deg style-s som «completed» uansett om de har score. Et hull man hoppet over (feiltrykk i stripa, avbrutt tasting, shotgun-lignende start) ser identisk «ferdig» ut som et tastet hull, så spørsmålet «hva mangler?» kan ikke besvares midt i runden — hullet oppdages tidligst ved levering (submit-siden teller kun «N hull mangler»), når flighten har gått videre og det er sosialt dyrt å rette. Komponenten får heller ingen score-data (props er kun gameId + currentHole), enda HoleClient allerede har både server-tellingen myCompletedHoles og live Dexie-telling per hull. Skjermleser-varianten har samme hull: aria-label er bare «Hull N» uten tilstandsinfo. I tillegg auto-scroller ikke stripa til aktivt hull: 18 celler à ~30 px = ~570 px, så fra ca. hull 12 ligger «current»-markøren utenfor skjermen på en vanlig mobil.

**Bevis:** components/hole/HoleStrip.tsx:79-85 (state = n === currentHole ? 'current' : n < currentHole ? 'completed' : 'future' — ren posisjonslogikk); HoleStrip.tsx:7-10 (props uten score-data); HoleStrip.tsx:91 (aria-label uten tilstandsinfo); HoleStrip.tsx:14-18 (overflowX auto, ingen ref/scrollIntoView i komponenten); HoleClient.tsx:396-404 + :765 (localCompletedHoles fra Dexie finnes allerede på skjermen); app/[locale]/games/[id]/submit/page.tsx:375-377 (missingHolesBanner teller kun antall).

**Forslag:** Send et Set av hull-numre med score (fra samme Dexie-query som localCompletedHoles) inn i HoleStrip og gi «passert uten score» en egen, tydelig avvikende stil (f.eks. tom celle med varsel-ring) — da blir manglende hull synlig i sanntid. Utvid samtidig aria-label til «Hull N, mangler score» / «Hull N, ferdig», og legg til en liten useEffect med scrollIntoView({inline:'center'}) på aktiv celle.

**Verifisering:** Kjernen verifisert: HoleStrip.tsx:80–85 avleder state kun fra posisjon, props er bare gameId+currentHole (:7–10), aria-label uten tilstand (:91), ingen auto-scroll (18 celler à 30px ≈ 540px overflow), mens HoleClient allerede har localCompletedHoles fra Dexie (:396–404). Én presisering: submit-siden viser faktisk hvilke hull som mangler (scorekort-tabellen rendrer «—» per hull, submit/page.tsx:341), ikke bare antallet — men midt-i-runden-problemet i stripa står uansett. Ingen dekkende issue.

### F12 — Treffflatene i hull-stripa er 26 px brede — under appens egen 44 px-regel på samme skjerm

**P2 · friksjon · `components/hole/HoleStrip.tsx:25-31`**
*Prinsipp: 9241-110 tilgjengelighet (WCAG 2.5.8) + feiltoleranse + 9241-210 bruks-kontekst* — *bok-tema: Design for stress*

Hver hull-lenke i stripa har hitAreaStyle med minHeight 44 men ingen minWidth — bredden er cellens 26 px pluss 4 px gap, dvs. ~30 px senter-til-senter. Det er godt under appens egen ≥44 px-regel, som ScoreCard i samme flate eksplisitt dokumenterer («Glove-vennlige tap-targets: ≥44×44px … Tastes med hanske, enhåndt, i bevegelse på banen», #944). Konsekvensen av bomtrykk her er ikke kosmetisk: du lander på FEIL hull-side, og kombinert med posisjonsbasert «completed»-styling kan et feiltrykk fremover få mellomliggende hull til å se ferdige ut. Med hansker, én hånd og sollys er 26 px-mål med 4 px mellomrom i en tett rad et reelt feil-hull-scenario — og hull-bytte er en hyppig handling midt i kjerneløkka.

**Bevis:** components/hole/HoleStrip.tsx:25-31 (hitAreaStyle: minHeight 44, ingen minWidth/padding-x); HoleStrip.tsx:33-45 (cellStyle width: 26); HoleStrip.tsx:21-23 (gap: 4); appens egen regel sitert i components/hole/ScoreCard.tsx:231-246 (stepper bevisst oppgradert til 44×44 med hanske-begrunnelse, #944).

**Forslag:** Gi hitAreaStyle minWidth: 44 (eller ~9 px usynlig horisontal padding per side) og la den visuelle 26 px-cellen forbli uendret inne i det større målet — trykk-mål og visuell størrelse trenger ikke være like. Stripa scroller allerede horisontalt, så økt totalbredde koster ingenting.

**Verifisering:** Verifisert i HoleStrip.tsx:25-31/33-45/20-23: hitAreaStyle har minHeight 44 men ingen minWidth, cellen er 26 px bred med 4 px gap. Appens egen 44px-regel er dokumentert i ScoreCard.tsx:231-232 (#944). Lukkede #770/#944 fikset andre mål og omtalte til og med HoleStrip som korrekt pga. høyden — bredden er aldri adressert.

### F13 — Høye scorer (7–15 slag) mangler effektiv inntasting — arket dekker bare par±2

**P2 · friksjon · `components/hole/SpecificValueSheet.tsx:99-105`**
*Prinsipp: 9241-110 oppgaveegnethet* — *bok-tema: Design for stress*

MAX_STROKES er 15 nettopp for å «leave room for honest blow-up entries» (ScoreCard-kommentaren), og appen støtter høye handicap der trippel-bogey+ er vanlig. Men ⋯-arket «SPESIFIKK SCORE» tilbyr kun par−2…par+2 — verdier som uansett er 1–2 trykk unna på stepperen — mens en 10-er på par 4 krever: trykk kort (par) + 6 × «+», eller åpne arket, velge 6, så 4 × «+» til. Under tidspress med flighten ventende og hansker på er 6–8 presisjonstrykk for én vanlig blow-up-score både tregt og overshoot-utsatt (ett trykk for mye = feil score som må angres). Primæroppgavens verste tilfelle har altså flest steg.

**Bevis:** components/hole/SpecificValueSheet.tsx:99-105 (values = [par-2 … par+2] — kun 5 verdier + X); components/hole/ScoreCard.tsx:52-55 (MIN 1/MAX 15, kommentar om «honest blow-up entries»); ScoreCard.tsx:120-124 (stepper går ±1 fra score ?? par)

**Forslag:** Utvid arket til et fullt tall-grid (f.eks. 1–12 + «13+»-rad, eller par−2 til par+7) — grid-layouten på 3 kolonner har plass, og arket heter allerede «Spesifikk score». Da blir enhver score maks 2 trykk unna (⋯ + tall), som er riktig kost for kjernehandlingen.

**Verifisering:** SpecificValueSheet.tsx:99-105 tilbyr kun par-2..par+2 + X; ScoreCard.tsx:52-55 setter MAX_STROKES 15 nettopp for blow-up-scorer, og stepperen går ±1 (120-130). En 10-er på par 4 krever 5-7 trykk; ingen annen hurtigvei finnes. #944 fikset stepper-størrelse/angre, ikke verdiområdet.

### F19 — Arrangør-blindvei: «venter på godkjenning»-sperren på /avslutt peker ikke til godkjennings-overriden som finnes på /spillere

**P2 · friksjon · `app/[locale]/games/[id]/avslutt/page.tsx:142`**
*Prinsipp: 9241-110 feiltoleranse (vennlig gjenoppretting)* — *bok-tema: Error recovery over feilmelding*

Når en oppretter prøver å avslutte og et levert kort mangler peer-godkjenning, viser /games/[id]/avslutt en blokkerende melding: «En medspiller må godkjenne hvert scorekort før du kan avslutte. Be dem åpne spillet og godkjenne» — eneste utvei som tilbys er «Tilbake til spillet». Men verktøyet for nøyaktig denne situasjonen finnes allerede: creator-cockpiten /games/[id]/spillere har en godkjennings-override (adminApproveScorecard, #429/#360-paritet) bygget for «override use-case: a peer vanished». Blindveien nevner den ikke. En ikke-teknisk arrangør hvis medspiller har kjørt hjem uten å godkjenne, står fast med et råd som ikke kan følges — selv om løsningen ligger to tapp unna.

**Bevis:** games/[id]/avslutt/page.tsx:142-166 — unapproved-grenen rendrer kun varselboks + «Tilbake til spillet»-lenke. no.json game.finish.unapprovedNote: «Be dem åpne spillet og godkjenne, så kan du avslutte her.» Overriden finnes: games/[id]/spillere/page.tsx:210-214 («override use-case: a peer vanished») + 374-396 (ApprovePlayerButton med adminApproveScorecard); admin/games/[id]/actions.ts:141-148 (#429 åpner override for creator).

**Forslag:** I unapproved-grenen på /avslutt: legg til en sekundær lenke/knapp «Godkjenn på vegne av gruppa → Styr spillere» til /games/[id]/spillere#leverte-scorekort, og utvid unapprovedNote med én setning: «Får du ikke tak i dem, kan du som arrangør godkjenne selv under Styr spillere.» Ingen ny mekanikk — bare synliggjør eksisterende gjenopprettingsvei der blindveien oppstår.

**Verifisering:** avslutt/page.tsx:142-166: unapproved-grenen rendrer kun varselboks + «Tilbake til spillet»; no.json:1720 ber arrangøren be medspillere godkjenne. Overriden finnes på /spillere (page.tsx:210-214 + 374-396, adminApproveScorecard åpen for creator per #429/actions.ts:148-154) men lenkes ikke. Ingen issue dekker skiltingen.

### F20 — Avslutnings-feil for oppretter forsvinner stille: ?error-redirects lander på /games/[id] som aldri rendrer error-parameteren

**P2 · friksjon · `app/[locale]/games/[id]/(home)/page.tsx:75`**
*Prinsipp: 9241-110 selvbeskrivelse (systemstatus)* — *bok-tema: Automasjons-transparens*

endGame og endGameMarkingWithdrawals redirecter ved feil til detailPath med ?error=not_active/no_players/not_all_submitted/not_all_approved/db_finish/db_players. For admin er detailPath Sekretariatet, som rendrer disse som feilbanner (oversettelsene finnes i admin.game.errors). For en oppretter er detailPath /games/[id] — og spill-hjem leser KUN ?status (typen deklarerer ikke engang error), så alle feilene forsvinner. Kommentaren i avslutt-siden innrømmer det: «/games/[id] doesn't render ?error». Pre-sjekkene på /avslutt reduserer risikoen, men i race-vinduet (et kort avvises/gjenåpnes etter sideinnlasting, eller DB-feil under selve avslutningen) trykker oppretteren «Avslutt spillet», lander på spill-hjem uten noen melding, og spillet står fortsatt som Pågående uten forklaring — en stille feil midt i kjerneløkkas siste steg.

**Bevis:** (home)/page.tsx:75-77 — SearchParams = kun {status}; :92-94 STATUS_BANNER_KEYS har bare 'submitted'; ingen sp.error-lesing i fila. admin/games/[id]/actions.ts:270-272 (creator → detailPath=/games/[id]) + 292, 317, 328, 333, 344 (?error-redirects). avslutt-likevel/actions.ts:66 (?error=db_players til /games/[id]). Kontrast: admin/games/[id]/page.tsx:190-208 + 303-306 rendrer error-banner. games/[id]/avslutt/page.tsx:38-39: «/games/[id] doesn't render ?error». Oversettelser finnes allerede: no.json admin.game.errors.not_all_submitted/not_all_approved (linje 2966-2967).

**Forslag:** La spill-hjem lese first(sp.error) og rendre Banner tone="error" med et lite feilkode→tekst-kart (gjenbruk admin.game.errors-nøklene eller speil dem under game.home.errors). Alternativt: la creator-grenen av endGame-feilene redirecte tilbake til /games/[id]/avslutt?error=..., som allerede tar imot og viser error-parameteren.

**Verifisering:** (home)/page.tsx:74-77 deklarerer kun status i SearchParams, STATUS_BANNER_KEYS (:92-94) har bare submitted, og sp.error leses aldri; endGame redirecter creator-feil til /games/[id]?error=... (actions.ts:270-272, 292-344) og avslutt-likevel/actions.ts:66 gjør det samme; admin-siden rendrer feilene (:190-208). Kommentaren i avslutt/page.tsx:39 innrømmer hullet. Pre-sjekkene på /avslutt begrenser til race-vinduet → P2.

### F21 — Levert (og godkjent) scorekort kan ikke gjenåpnes av noen i creator-spill — copy sier «kan ikke angres uten admin»

**P2 · friksjon · `app/[locale]/admin/games/[id]/actions.ts:440`**
*Prinsipp: 9241-110 kontrollerbarhet* — *bok-tema: Error recovery over feilmelding / meaningful human control*

reopenScorecard er gated på loadAdminContext (kun global admin); creator-cockpiten /spillere fikk i #429 kun godkjennings-override, ingen gjenåpning. Leveringsbekreftelsen sier ærlig «Levere scorekortet? Dette kan ikke angres uten admin» — men i selvbetjente creator-spill finnes ingen «admin» brukeren kan nå i appen. Oppdager en spiller en feil rett etter levering, er eneste vei at en medspiller avviser kortet fra /approve — og den veien lukkes i det øyeblikket noen godkjenner (pending-filteret viser kun approved_at == null; rejectScorecard-actionen virker fortsatt post-godkjenning, men ingen UI når den). Resultat: en tastefeil kan låses inn i sluttresultatet, og løsningen er å kontakte plattform-admin utenfor appen. Merk at fixen er paritetsarbeid på eksisterende #429-flate, ikke en ny feature-flate.

**Bevis:** admin/games/[id]/actions.ts:440-443 — reopenScorecard bruker loadAdminContext() (requireAdmin), i motsetning til adminApproveScorecard:148-154 som bruker loadAdminOrCreatorContext. ReopenScorecardButton er kun montert i admin-cockpiten: admin/games/[id]/page.tsx:1051 (grep viser ingen treff i games/[id]/spillere/). approve/page.tsx:172-178 — godkjente kort forsvinner fra /approve (approved_at == null-filter), så peer-avvisning er utilgjengelig post-godkjenning. no.json game.submit.confirmBase: «Dette kan ikke angres uten admin.»

**Forslag:** Utvid reopenScorecard til loadAdminOrCreatorContext (samme #429-mønster som adminApproveScorecard, inkl. RLS-policy-sjekk) og vis en «Gjenåpne»-knapp ved siden av statuslabelen i roster-listen på /games/[id]/spillere for leverte/godkjente kort. Juster confirmBase til «Dette kan bare angres av arrangøren» så copyen matcher virkeligheten i begge spilltyper.

**Verifisering:** reopenScorecard bruker loadAdminContext (actions.ts:440-443) mot adminApproveScorecard sin loadAdminOrCreatorContext (:148-154); grep viser ReopenScorecardButton kun montert i admin/games/[id]/page.tsx; godkjente kort forsvinner fra /approve (approved_at==null-filter, page.tsx:177) så peer-avvisning er utilgjengelig post-godkjenning; no.json:1652 bekrefter copyen. #429-pariteten mangler gjenåpning — stell på eksisterende creator-flate, ikke ny feature.

### F25 — Realtime dør stille etter token-utløp eller kanalfeil — ingen resubscribe, fallback eller ferskhetsindikator; leaderboard og medspiller-tall fryser

**P2 · friksjon · `lib/sync/realtimeChannel.ts:58-67`**
*Prinsipp: 9241-110 selvbeskrivelse (systemstatus)* — *bok-tema: Situasjonsbevissthet / automasjons-transparens*

setAuth kalles nøyaktig én gang ved subscribe, med daværende access token — og CLAUDE.md dokumenterer selv at auto-propagering ikke virker for WebSocket-kanalen. En golfrunde varer 4–5 timer; tokenet varer typisk én. Etter utløp slutter postgres_changes å leveres, og .subscribe() kalles uten statuscallback, så CHANNEL_ERROR/TIMED_OUT fanges aldri: ingen resubscribe, ingen fallback-polling, ingen UI-hint. Verst rammes det innloggede leaderboardet, som oppdateres UTELUKKENDE når en Realtime-event ankommer (router.refresh() kun i event-handleren): events som skjer mens forbindelsen er nede (iOS suspenderer WebSocket i bakgrunnen) blir aldri levert, og siden refresh kun trigges av neste event, viser tavla gamle tall på ubestemt tid. Appen er standalone-PWA — ingen reload-knapp, ingen pull-to-refresh, ingen «sist oppdatert»-tekst, og ingen visibilitychange-lytter i leaderboardet. Fokus/online-catchUp i RealtimeMount maskerer problemet ved vanlig mobilbruk (skjermlås utløser refetch), men en skjerm som blir stående på (leaderboard i golfbilen/klubbhuset, hull-side i hånden) viser stille foreldede medspiller-tall, og «N scorer mangler på hullet»-hintet kan stå selv om medspilleren har tastet. Gjelder alle forbrukere av subscribeRealtimeChannel (scores, leaderboard, Wolf, BBB, reaksjoner). Kontrast: spectate-siden valgte polling nettopp fordi det er «the robust MVP».

**Bevis:** lib/sync/realtimeChannel.ts:58-64 (setAuth én gang ved subscribe), :67 (subscribe() uten statuscallback); grep over app/lib/components viser ingen onAuthStateChange→setAuth-rewiring; app/[locale]/games/[id]/leaderboard/LeaderboardRealtime.tsx:58-100 (refresh kun i event-handler); app/[locale]/games/[id]/RealtimeMount.tsx:41-50 (catchUp kun ved mount/focus/online — ingen periodisk fallback); app/manifest.ts:10 (display: 'standalone' → ingen browser-reload); grep visibilitychange → kun ScheduledWaitingRoom.tsx:64; SpectatePoller.tsx:14 (polling som «the robust MVP»); CLAUDE.md-avsnittet «Realtime krever eksplisitt setAuth()».

**Forslag:** (1) Lytt på supabase.auth.onAuthStateChange(TOKEN_REFRESHED) og kall realtime.setAuth med det ferske tokenet; (2) gi subscribe() en statuscallback som resubscriber ved CHANNEL_ERROR/TIMED_OUT — og fall tilbake til intervall-polling (gjenbruk SpectatePoller-mønsteret, f.eks. 30 s) når kanalen ikke kommer opp; (3) legg til visibilitychange/online-lytter i LeaderboardRealtime som kaller router.refresh() ved retur til appen — én linje som fanger alle tapte events fra bakgrunnstid; (4) vurder lav-frekvent periodisk catchUp (f.eks. 60 s når fanen er synlig) som siste sikkerhetsnett, og en diskret «Oppdatert kl HH:MM»-tekst i footeren på aktive spill så staleness i det minste er synlig.

**Verifisering:** Kjernen er verifisert: setAuth kalles én gang før subscribe og .subscribe() har ingen statuscallback (realtimeChannel.ts:58–67), ingen onAuthStateChange/TOKEN_REFRESHED-kobling finnes i repoet, LeaderboardRealtime refresher kun ved innkommende event (ingen visibilitychange/fallback-polling), og appen er standalone-PWA uten reload-vei. Token-legget kan muligens dempes av supabase-js' innebygde propagering, men repoets egen dokumentasjon sier auto-propagering ikke virker — og tapte events under iOS-suspendering gjenopprettes uansett aldri på leaderboardet.

### F26 — Sync-motoren startes bare fra hull-siden — køen blir liggende urørt på iOS

**P2 · friksjon · `lib/sync/syncWorker.ts:153-167`**
*Prinsipp: 9241-110 selvbeskrivelse* — *bok-tema: Automasjons-transparens / meaningful human control*

startSyncListener() (online-lytter, 30-sekunders intervall og bootstrap-drain) kalles kun fra HoleClient. Åpner spilleren appen på spill-hjem eller leaderboard etter at prosessen ble drept (typisk iOS), drainer ingenting køen — selv med fullt nett. Background Sync-broen i SW dekker ikke iOS Safari (API-et støttes ikke der). SyncBanner viser da «N slag venter på lagring», men forsøker aldri selv; brukeren må manuelt trykke «Prøv igjen» eller tilfeldigvis innom hull- eller submit-siden. Systemet sier «venter» mens ingen sending faktisk er planlagt — misvisende systemstatus, og medspillere/admin ser stale scorer imens. Automatikken ber brukeren gjøre jobben den selv skulle gjort.

**Bevis:** Grep bekrefter eneste kall: app/[locale]/games/[id]/holes/[holeNumber]/HoleClient.tsx:341-344; components/sync/SyncBanner.tsx har ingen drainQueue ved mount (kun manuell handleRetry :119-127); components/PwaBoot.tsx:33-47 + public/sw.js:149-161 (Background Sync — ikke støttet på iOS); app/[locale]/games/[id]/submit/SubmitForm.tsx:44-46 drainer ved mount og viser mønsteret som mangler ellers.

**Forslag:** Flytt startSyncListener() til et globalt klient-boot-punkt (PwaBoot, eller en liten klientkomponent i games/[id]/layout ved siden av SyncBanner), slik at køen drains automatisk overalt der appen er åpen og online — ikke bare på hull-siden.

**Verifisering:** Grep bekrefter at startSyncListener() kun kalles fra HoleClient.tsx:343; SyncBanner drainer aldri selv (kun manuell handleRetry), SubmitForm drainer ved mount (linje 44–46) og viser mønsteret som mangler ellers, og Background Sync-broen i PwaBoot/sw.js dekker ikke iOS Safari. Ingen mitigering eller eksisterende issue funnet.

### F27 — LWW-overskriving av score du tastet for en medspiller varsles aldri

**P2 · friksjon · `lib/sync/syncWorker.ts:114-117`**
*Prinsipp: 9241-110 kontrollerbarhet* — *bok-tema: Meaningful human control*

Konflikt-varselet fra #688 skrives bare når score.enteredBy === score.userId — altså kun når du tastet din egen score. I golf er det helt vanlig at én i flighten fører for de andre (markør-rollen); alle kø-elementer på enheten din har enteredBy = deg, men userId = medspilleren. Taper din innføring LWW-kampen mot medspillerens egen enhet, overskrives tallet du tastet helt stille — stikk i strid med det dokumenterte formålet «the overwrite is never silent». Ingen av partene får dermed sjansen til å oppdage at to ulike tall ble tastet for samme hull, som er nettopp situasjonen varselet skulle fange.

**Bevis:** lib/sync/syncWorker.ts:114-117 (`enteredByCurrentUser = score.enteredBy === score.userId` gater ConflictRecord-skrivingen); app/[locale]/games/[id]/holes/[holeNumber]/HoleClient.tsx:676-687 (onSetScore setter alltid enteredBy: myUserId, også når man taster for andres kort); lib/sync/db.ts:37-42 (intensjonen: overskriving skal aldri være stille).

**Forslag:** Skriv ConflictRecord når den lokale raden ble tastet på denne enheten (score.enteredBy === innlogget brukers id), uavhengig av hvem scoren gjelder, og ta med medspillerens navn i varselet («Hull 7 for Kari ble endret av en medspiller …»).

**Verifisering:** syncWorker.ts:115–117 gater ConflictRecord på score.enteredBy === score.userId, mens HoleClient.tsx:683 alltid setter enteredBy: myUserId — markør-førte scorer for medspillere overskrivres dermed stille, stikk i strid med intensjonen dokumentert i db.ts:37–42. Lukket #688 fikset kun egen-ført-tilfellet og dekker ikke markør-gapet.

### F28 — «Kunne ikke lagre N slag» — evig, ikke-avvisbar alarm uten hull-nummer eller handlingsvei

**P2 · friksjon · `components/sync/SyncBanner.tsx:129-140`**
*Prinsipp: 9241-110 feiltoleranse* — *bok-tema: Alarm-filosofi / error recovery over feilmelding*

Karantene-elementer (abandonedAt) blir liggende i køen for alltid: drainQueue hopper over dem, ingen kode sletter dem, og kø-banneret kan ikke avvises (kun konflikt-varsler har OK-knapp). Resultatet er en rød fare-banner på alle spillsider — også i alle framtidige runder, siden køen leses uten gameId-filter — som verken sier hvilket hull eller hvilken runde det gjelder. Rådet «Kontakt arrangøren» er ikke handlingsrettet: verken spilleren eller arrangøren får vite HVILKE hull/slag det gjelder — rå-feilen legges kun i title-attributtet på banner-diven (krever hover, utilgjengelig på mobil som er appens primærflate), og meldingen ligger i en truncate-div som kan klippe teksten på smale skjermer. Ironisk nok finnes en reell gjenopprettingsvei — å taste scoren på nytt nullstiller kø-elementet og gir det en ny sjanse — men banneret forteller det ikke. En permanent alarm uten utvei lærer brukeren å ignorere banneret, som undergraver de reelle varslene.

**Bevis:** lib/sync/syncWorker.ts:28-31 (abandoned skippes for alltid, slettes aldri); components/sync/SyncBanner.tsx:64-66 (toArray uten gameId-filter), :129-140 (melding uten hullnummer; kø-banneret mangler dismiss — kun retry-knapp :150-159), :145 (`title={rawError ?? undefined}` — hover-only), :147-149 (truncate på melding); lib/sync/writeScore.ts:59-72 (syncQueue.put nullstiller attemptCount/abandonedAt — den udokumenterte recovery-veien); lib/sync/db.ts:34 + syncWorker.ts:66-72 (scoreId/hole-detaljer og lastError finnes lokalt i Dexie).

**Forslag:** Slå opp de karantenesatte kø-elementenes scores i Dexie og navngi hullene (og rundenavnet) i meldingen («Hull 7 og 12 ble ikke lagret — vis dem til arrangøren»), tilby en «Tast på nytt»-lenke til hullet (som de facto reparerer elementet), dropp title-attributtet som eneste detaljkanal (ett ekspanderbart avsnitt holder), og gi abandoned-elementer en opprydningsvei — dismiss-knapp og/eller auto-sletting når spillet avsluttes.

**Verifisering:** Verifisert linje for linje: abandoned-elementer skippes evig og slettes aldri (syncWorker.ts:31, ingen delete-kode finnes), kø-banneret mangler dismiss og hullnummer (SyncBanner.tsx:130–135), rå-feilen ligger kun i hover-title (:145) med truncate (:148), og writeScore.put nullstiller elementet som udokumentert recovery-vei (:65–71). Ingen oppfølgings-issue etter #668 funnet.

### F31 — Delt førsteplass framstilles som vinner + taper: podium og reveal hardkoder plassering etter listeindeks, ikke rank

**P2 · friksjon · `app/[locale]/games/[id]/leaderboard/SoloStablefordPodium.tsx:141`**
*Prinsipp: 9241-110 samsvar med forventning*

Tiebreaker-kaskaden lar fullstendige uavgjorte bestå: rankTeams gir begge lag samme rank og fyller tiedWith (lib/scoring/tiebreaker.ts:63–64). Men reveal-flatene ignorerer dette: SoloStablefordPodium plukker result.players[0..2] og hardkoder rank={1}, rank={2}, rank={3} til PodiumStep (SoloStablefordPodium.tsx:103–105 og 141–187) — en spiller som faktisk har rank 1 (delt) men ligger på indeks 1, får SØLV-medaljong på et lavere trinn, mens sidekameraten får gull, konfetti og champagne-kort. Tilsvarende i State4View for best-ball: teams[0] alene får hero-kortet med laurbær og «Leder · 1. plass» uten delt-markering (State4View.tsx:108–109; LeaderCard viser aldri tiedWith), mens det like-rangerte laget rendres som slank rad med bare «· delt» i 13px muted (State4View.tsx:479). I en sosial turnering er dette den mest synlige skjermen i hele appen — en medvinner som ser seg selv presentert som nummer to er en reell omkostning. HeadToHeadResult håndterer det riktig (winnerUserId=null ved lik rank, stableford.tsx:297–298), så mønsteret finnes allerede i kodebasen.

**Bevis:** lib/scoring/tiebreaker.ts:63–64 (delt rank + tiedWith); app/[locale]/games/[id]/leaderboard/SoloStablefordPodium.tsx:103–105, 141–187 (rank hardkodet 1/2/3 uavhengig av player.rank); app/[locale]/games/[id]/leaderboard/State4View.tsx:108–109, 406–410, 453–464, 479

**Forslag:** Bruk player.rank/line.rank i stedet for posisjonsindeks: ved delt 1. plass, render to champagne-trinn side om side (eller ett delt hero-kort med begge navn) og vis «Delt 1. plass» i leaderBadge; Medallion place bør få faktisk rank. Minst: vis tie-markering også på hero-kortet/gulltrinnet, ikke bare på raden under.

**Verifisering:** rankTeams gir delt rank + tiedWith (tiebreaker.ts:59–65), men SoloStablefordPodium plukker players[0..2] og hardkoder rank={1|2|3} til PodiumStep uten å lese player.rank/tiedWith (:103–106, 141–187), og State4View gir teams[0] hero-kortet uten delt-markering mens det like-rangerte laget rendres som rad med «· delt» i muted (:108–109, 443, 479). Krever full 5-tier-uavgjort (sjelden), men feilframstiller da resultatet på appens mest synlige flate — P2 står; H2H-stien (stableford.tsx:297–298) viser at riktig mønster finnes.

### F32 — Spectate-siden viser lenker inn i innloggings-vegg: hull-for-hull-drilldown og CSV-eksport er blindveier for tilskuere

**P2 · friksjon · `app/[locale]/games/[id]/leaderboard/State4View.tsx:406`**
*Prinsipp: 9241-110 feiltoleranse* — *bok-tema: Error recovery over feilmelding*

Den offentlige spectate-siden gjenbruker renderLeaderboardContent (spectate/[token]/page.tsx:131–140), og for ferdige best-ball-spill rendres State4View med (a) heldekkende drilldown-lenke på leder-kortet til /games/{id}/leaderboard/holes (State4View.tsx:406–410), (b) samme lenke på hver lagrad (linje 444–450), (c) eksplisitt invitasjon «Trykk på et lag for hull-for-hull» (messages/no.json:2106) og (d) CSV-nedlastingsknapp mot /games/{id}/leaderboard/export (State4View.tsx:173, 188–200). Men /games/* er IKKE i PUBLIC_PATH_PATTERN (proxy.ts:27–28) — en anonym tilskuer som trykker blir sendt til /login. Selv om vedkommende registrerer seg, gir leaderboard-siden notFound() for ikke-deltakere (leaderboard/page.tsx:133–135), og eksport-ruten er deltaker-gatet (export/route.ts:38–44). CSV-lenken har download-attributt, så nettleseren kan laste ned login-HTML som .csv-fil. ShareResultButton self-gater korrekt på spectate (path-match, ShareResultButton.tsx:28–29) — de andre elementene mangler tilsvarende gate.

**Bevis:** app/[locale]/spectate/[token]/page.tsx:131–140; app/[locale]/games/[id]/leaderboard/State4View.tsx:173, 406–410, 444–450; messages/no.json:2106; proxy.ts:27–28; app/[locale]/games/[id]/leaderboard/page.tsx:133–135; app/[locale]/games/[id]/leaderboard/export/route.ts:38–44

**Forslag:** Send et interactive/spectator-flagg gjennom renderLeaderboardContent (samme kanal som includeReactions) og la State4View droppe drilldown-lenkene, hint-teksten og ExportLink når flagget er av — samme mønster som demoens live={false} i LeaderboardShell. Alternativ med mer verdi: gjør holes-drilldown lesbar via spectate-token, men det er en større endring (feature-grense — parkeres i så fall).

**Verifisering:** Verifisert: spectate gjenbruker renderLeaderboardContent uten interaktivitets-flagg (LeaderboardContentOpts har ikke feltet), State4View rendrer drilldown-lenker, hint-tekst (no.json:2106) og CSV-lenke med download-attributt, /games/* er ikke i PUBLIC_PATH_PATTERN (proxy.ts:27–28), leaderboard-siden gir notFound for ikke-deltakere (:133–135) og export-ruten er deltaker-gatet — kun ShareResultButton self-gater. Ingen eksisterende issue dekker blindveiene; eieren har eksplisitt investert i spectate som delings-/vekstflate (#938/#1268), så P2 står.

### F33 — Champagne-gull brukes som meningsbærende tekstfarge på lyse flater — målt ~2:1, verst i sollys på banen

**P2 · friksjon · `app/[locale]/games/[id]/leaderboard/SoloStablefordPodium.tsx:315`**
*Prinsipp: 9241-110 tilgjengelighet (WCAG 1.4.3 kontrast) + 9241-210 bruks-kontekst* — *bok-tema: Design for stress*

Paletten sier «accent kun til vinnere/highlights», men i praksis bærer text-accent (#c9a961) informasjon på lyse bakgrunner: vinnerens poengtotal på podiet vises i 32px accent på en accent-tintet bakgrunn — beregnet 1,98:1 (kravet for stor tekst er 3:1); «+N SLAG»-badgen på ScoreCard (forteller spilleren hvor mange tildelte slag hun har på hullet — felt-kritisk info) er 9,5px accent på hvit = 2,25:1; Kicker med tone=accent (10px uppercase, ~2,1:1 mot linen) rammer turneringsnavnet i leaderboard-headeren — eneste stedet på skjermen som sier hvilket spill du ser på — samt «LIVE LEADERBOARD»-kickeren i reveal-modus og «Leder»-badgen i State4View; admin-statuslabelen «klar, ikke levert» og stale-tilstanden i HandicapChip bruker samme farge. Appen brukes utendørs i direkte sollys — der er ~2:1 i praksis usynlig, også for normaltseende. Dark mode har ikke problemet (8,7:1). Merk at --accent-deep finnes nettopp for «aksent-tekst på lys bg», men den måler også bare 2,64:1 — og Kicker bruker den ikke engang.

**Bevis:** Podium: app/[locale]/games/[id]/leaderboard/SoloStablefordPodium.tsx:313–319 ('text-[32px] text-accent' for rank 1) på bg fra TIER_ACCENT linje 256–259 ('bg-accent/[0.08]') — blandet bakgrunn #f4f0e5, kontrast beregnet til 1.98:1. Badge: components/hole/ScoreCard.tsx:188–195 (fontSize 9.5, color var(--accent)) — 2.25:1 mot --surface. Kicker: components/ui/Kicker.tsx:8, 11 (text-accent, 10px); LeaderboardChrome.tsx:129; RevealBruttoView.tsx:51; State4View.tsx:355–357. Status: app/[locale]/admin/games/[id]/status/page.tsx:153. Samme mønster i SoloStrokeplayPodium.tsx:325, SkinsPodium.tsx:263, HandicapChip.tsx:36. app/globals.css:40–41 (#c9a961 / --accent-deep #b89446 dokumentert som tekstfarge — 2.64:1 målt).

**Forslag:** Innfør en --accent-text-token for lys modus som er mørk nok (f.eks. ~#8a6d2b ≈ 4,6:1 mot lin) og la all text-accent-bruk som bærer informasjon — inkludert Kicker tone=accent — peke på den; behold #c9a961 til rene dekor-elementer (hairlines, borders, medaljer, ikoner ved siden av tekst) og dark mode (der kan tokenen peke på dagens #d4b870). Vinnertallet på podiet kan alternativt gå i --text med champagne-medaljongen som highlight-bærer. Én token-endring + Kicker-bytte løfter alle flatene samtidig.

**Verifisering:** Alle siterte flater bruker text-accent/var(--accent) som meningsbærende tekst på lys bakgrunn (podium-vinnertall, ScoreCard-badgen 9,5px, Kicker tone=accent, statuslabel, HandicapChip stale), kontrastberegningene stemmer (~2,25:1 mot hvit; --accent-deep ~2,65:1), og kodebasen erkjenner selv problemet i en kommentar i profile/statistikk («text-accent ~2.16:1 fails»). Lukket #871 fikset kun Profil-flaten — ingen app-vid token finnes.

### F39 — Tilbake-gest eller app-eviction midt i veiviseren sletter alt — history-oppførselen motsier egen dokumentasjon

**P2 · friksjon · `app/[locale]/admin/games/new/GameWizard.tsx:268`**
*Prinsipp: 9241-110 kontrollerbarhet + feiltoleranse* — *bok-tema: Design for stress*

GameWizard speiler steget til URL med router.replace, som ALDRI lager nye history-entries. Fil-header-kommentaren lover «Browser back fra steg N tilbake til N-1» (linje 24-25), og effekt-kommentaren hevder «history-stacken får én entry per steg-overgang» (linje 256-257) — begge er feil med replace. Konsekvens: Android-tilbakegest eller browser-back fra steg 3/4/5 forlater hele veiviseren, og siden all state er ren useState uten persistens og uten beforeunload-vakt, er alt tastet inn tapt. Samme skjer når mobil-OS-et kaster PWA-en ut av minnet mens arrangøren svitsjer til meldingsappen for å avklare med spillerne — et helt realistisk scenario for «fyr opp turneringen på et par minutter»-flyten.

**Bevis:** app/[locale]/admin/games/new/GameWizard.tsx:24-25 (dokumentert intensjon), :256-271 (kun router.replace — ingen push), useGameFormState.ts:307-370 (all state i useState); grep beforeunload i app/components/lib = 0 treff; GameWizard.test.tsx har ingen back-assertions

**Forslag:** Bytt til router.push per steg-overgang så back = forrige steg (som dokumentert intensjon), og persist skjema-state i sessionStorage (nøklet på pathname) med gjenoppretting ved mount. Da overlever inndata både tilbakegest, reload og PWA-eviction.

**Verifisering:** Verifisert: kun router.replace ved steg-overgang (GameWizard.tsx:268), i direkte motstrid med fil-headeren (:24–25) og effekt-kommentaren (:256–257); all state er useState uten beforeunload eller persistens. Uavhengig bekreftet av åpent issue #1069 som selv noterer «router.replace gir ingen per-steg-history» — men ingen issue tracker fiksen, så funnet er ikke dekket.

### F40 — «Send på nytt» på utløpt invitasjon er en blindvei for mottakeren — og ventelisten skjuler utløpsstatus

**P2 · friksjon · `app/[locale]/admin/spillere/actions.ts:129`**
*Prinsipp: 9241-110 selvbeskrivelse + feiltoleranse* — *bok-tema: Situasjonsbevissthet*

Ventende invitasjoner på /admin/spillere viser sendt-dato og åpnet-status, men henter ikke expires_at — en utløpt invitasjon (TTL 7 dager) ser identisk ut som en gyldig. resendInvitation sjekker ikke og forlenger ikke fristen (eksplisitt kommentar «Resend forlenger ikke fristen»), men sender likevel mailen. Mottakeren av en slik «fornyet» invitasjon stoppes så i login-porten, fordi email_is_invited krever expires_at > now(). Admin tror hen nettopp har hjulpet en treg invité; i virkeligheten har hen sendt en mail som ender i «invitasjonen har utløpt» hos mottakeren. Riktig gjenopprettingsvei (ny invitasjon fra hovedskjemaet) finnes, men UI-et peker admin mot den ødelagte.

**Bevis:** app/[locale]/admin/spillere/_components/PendingInvitations.tsx:53-58 (select uten expires_at, ingen utløpt-markering); app/[locale]/admin/spillere/actions.ts:121-142 (resend uten expiry-sjekk/forlengelse, kommentar :134-136), :82 (7-dagers TTL); supabase/migrations/0100_email_is_invited_club_aware.sql (expires_at > now()-krav); app/[locale]/(auth)/login/actions.ts:123-140 (invitéen lander på invite_expired)

**Forslag:** Vis «Utløpt»-badge i ventelisten (hent expires_at), og la «Send på nytt» forlenge expires_at (f.eks. nye 7 dager fra nå) før mailen går — da er resend alltid en fungerende handling og listen forteller sannheten.

**Verifisering:** Verifisert: ventelisten henter ikke expires_at (PendingInvitations.tsx:55), resendInvitation sjekker/forlenger ikke fristen (actions.ts:121–142, eksplisitt kommentar «#1179 out-of-scope»), og email_is_invited krever expires_at > now() (0100:36) — mottakeren stoppes med invite_expired (login/actions.ts:127–141). Lukkede #1179 gjaldt frist-visning til invitéen, ikke admin-siden, så funnet er udekket. Delvis mitigering: invitéen får en forklarende utløpt-feil, men admin-flaten peker fortsatt mot den ødelagte veien.

### F41 — Runden starter seg selv ved tee-off, men admin-flaten sier det motsatte

**P2 · friksjon · `app/[locale]/admin/games/[id]/page.tsx:1085`**
*Prinsipp: 9241-110 samsvar med forventning* — *bok-tema: Meaningful human control / automasjons-transparens*

En cron-sweep (og en fallback ved side-besøk) flipper scheduled→active automatisk når tee-off passeres. Men copyen på spilldetalj-siden for planlagte spill fremstiller start som en ren manuell handling: «Når du starter runden låses banehandicap …» og «Du kan fortsatt endre bane, tee-off, spillere, lag og innstillinger inntil runden startes». Ingen flate forteller arrangøren at runden starter av seg selv kl. X. En admin som planlegger siste lag-justeringer «rett før start» oppdager brått at redigering er stengt fordi automatikken fyrte. Varsling finnes kun når auto-start BLOKKERES (#502) — aldri som forvarsel om at den kommer. Automatikken er god; usynligheten er problemet.

**Bevis:** app/api/cron/start-scheduled-games/route.ts:11-26 (sweep flipper status); lib/games/startScheduledGame.ts docblock (brukes også av E1-fallback ved sidebesøk); messages/no.json admin.game.cta.scheduledStartBody + scheduledEditBody (ingen omtale av auto-start); lib/notifications/autoStartBlocked.ts (varsel kun ved blokkering); admin/games/[id]/page.tsx:1083-1108 (scheduled-CTA-ene rendrer kun disse tekstene)

**Forslag:** Én setning i scheduled-CTA-kortet: «Runden starter automatisk ved tee-off (dd.mm kl. tt:mm) hvis du ikke starter den manuelt før» — og speil det i scheduledEditBody («… inntil runden startes — automatisk ved tee-off eller manuelt»). Ren copy-endring i messages/no.json + en.json.

**Verifisering:** Verifisert: cron-sweepen (route.ts:61–90) og E1-fallbacken flipper scheduled→active automatisk, mens scheduledStartBody/scheduledEditBody (no.json:3088–3089) fremstiller start som ren manuell handling — grep etter «automatisk» i katalogen gir ingen auto-start-omtale, og autoStartBlocked-varselet fyrer kun ved blokkering. #902 (fortids-tee-off) og #678 (cup uten tee-off) er beslektede men dekker ikke forvarselet. Ren copy-fiks.

### F46 — ScoreCard (kjerneflaten for slag-tasting) er ikke tastatur-operabel og har ugyldig ARIA-struktur

**P2 · friksjon · `components/hole/ScoreCard.tsx:283`**
*Prinsipp: 9241-110 tilgjengelighet (WCAG 2.1.1 + 4.1.2)* — *bok-tema: Design for stress*

Selve spillerkortet er en `<div role="button">` uten `tabIndex` og uten tastatur-handler — «tapp for par»-snarveien er utilgjengelig med tastatur. Verre: kortet nester fire ekte `<button>`-elementer inni seg (+1, −1, ⋯ og Angre). Per WAI-ARIA har role="button" presentational children — skjermlesere kan flate ut hele kortet til én knapp navngitt av kortets aria-label og gjøre stepperne uoppdagbare. Treffflatene i seg selv er forbilledlige (44px, hanske-kommentert i koden), så dette er en ren semantikk-/struktur-feil på appens viktigste skjerm.

**Bevis:** components/hole/ScoreCard.tsx:283–289 (`role="button"` + aria-label + onClick, ingen tabIndex/onKeyDown) med nestede `<button>` på linje 304–311 (Angre) og 352–378 (+/−/⋯); tap-to-par-logikken på linje 108–118 er kun nåbar via klikk på div-en.

**Forslag:** Fjern `role="button"` fra kort-div-en (behold onClick som ren touch-bekvemmelighet) og la de ekte knappene bære semantikken — evt. legg til en visuelt skjult «Sett par»-knapp, eller la +/− dekke behovet (de fungerer allerede fra tomt kort: + gir par+1, − gir par−1). Da forsvinner både presentational-children-problemet og tastatur-hullet uten visuell endring.

**Verifisering:** Verifisert: ScoreCard.tsx:283–289 er div med role="button" + aria-label + onClick uten tabIndex/onKeyDown (grep bekrefter null tastatur-handlere i hele components/hole/), med ekte <button>-elementer nestet på 304–311 og 352–378 — ugyldig per ARIA (button har presentational children). Tap-to-par (108–118) er kun klikkbar. #944 (lukket) fikset tap-targets på samme kort men ikke semantikken; #872 gjaldt SegmentedField. Ingen mitigering funnet.

### F47 — Advarselstekst i warning-amber måler 2.1–2.4:1 på sine egne bakgrunner

**P2 · friksjon · `components/ui/Banner.tsx:9`**
*Prinsipp: 9241-110 selvbeskrivelse + tilgjengelighet (WCAG 1.4.3)* — *bok-tema: Alarm-filosofi*

`--warning` (#d89b3a) brukes direkte som tekstfarge i hele advarsels-apparatet: Banner-primitivens warning-tone, Input-komponentens warning-linje (12px!), ventende-godkjenning-statuser, avslutt-/trekk-spiller-advarsler og SyncBanner. Beregnet: 2.42:1 på hvit, 2.24:1 på lin, og 2.08:1 på sin egen warning/10-tint. Advarsler er per definisjon handlingsrettet informasjon — dette er tekstene brukeren MÅ kunne lese, ofte utendørs. Grep fant 30+ `text-warning`-forekomster. Til sammenligning klarer --danger (5.27:1) og --success (4.86:1) seg fint — det er kun amber-en som er for lys som tekst.

**Bevis:** components/ui/Banner.tsx:9 ('warning: bg-warning/[0.10] border-warning/40 text-warning'), components/ui/Input.tsx:42 ('text-xs text-warning'), app/[locale]/games/[id]/ScheduledWaitingRoom.tsx:141, app/[locale]/games/[id]/avslutt/page.tsx:125+146+188, components/sync/SyncBanner.tsx:140+177. Kontrast beregnet i økten: #d89b3a mot hvit 2.42:1, mot blandet banner-bg #f5edde 2.08:1. Palett: app/globals.css:53.

**Forslag:** Innfør et bg/fg-par for warning slik score-tonene allerede gjør det (globals.css:69–70 har nettopp `--score-over1-fg: #7a5410` på amber-tint — 6.26:1, samme visuelle familie): behold `--warning` som kant-/ikon-/bakgrunnsfarge, og legg `--warning-text: #7a5410` (lys) / dagens #e5b26f (mørk) som tekstfarge i Banner, Input og de øvrige text-warning-flatene.

**Verifisering:** Verifisert: --warning #d89b3a (globals.css:53) brukes som tekstfarge i Banner.tsx:9, Input.tsx:42 (12px), ScheduledWaitingRoom.tsx:141, avslutt/page.tsx:125+146+188 og SyncBanner.tsx:140+177 — grep fant 30 text-warning-forekomster i 20 filer. Kontrast re-beregnet i økten: 2.42:1 mot hvit ved 12–14px tekst (krav 4.5:1). Forslaget om --score-over1-fg-paret (#7a5410, globals.css:69) stemmer også. Ingen issue eller mitigering funnet.

### F50 — Ventende og tapte slag er usynlige utenfor spill-sidene — SyncBanner er bare montert i games/[id]-layouten

**P2 · friksjon · `app/[locale]/games/[id]/layout.tsx:30`**
*Prinsipp: 9241-110 selvbeskrivelse (systemstatus alltid synlig)* — *bok-tema: Automasjons-transparens / Situasjonsbevissthet*

Sync-køen drainer globalt (PwaBoot, online/focus/30s-intervall), men banneret som viser «N slag venter på lagring», «Mistet nettforbindelsen» og det alvorligste — «Kunne ikke lagre N slag» (karantenesatte, permanent feilede skriv) — rendres kun under games/[id]-layouten. Kommentaren i koden sier eksplisitt «a lost stroke must never be silent», men i praksis er det stille på Hjem, Innboks, Klubbhuset og Profil. En spiller som taster slag offline og går til hjemskjermen (eller blir der etter runden) har ingen indikasjon på at slag ligger usynkronisert lokalt — mens admin kan avslutte spillet og markørens kort fryses uten spillerens data. Den skjulte tilstandsmaskinen (offline-køen) kan ikke inspiseres akkurat når det betyr mest.

**Bevis:** app/[locale]/games/[id]/layout.tsx:30 er eneste mount av <SyncBanner /> (verifisert med søk over app/ og components/); components/sync/SyncBanner.tsx:95-135 håndterer abandoned-/pending-tilstandene; components/PwaBoot.tsx:27 drainer køen globalt uten tilhørende UI; lib/sync/syncWorker.ts:28-31 («it stays in the queue as a record of failure that SyncBanner surfaces»).

**Forslag:** Flytt SyncBanner (eller en kompakt variant av den) opp til den innloggede app-chromen (samme nivå som BottomNav rendres fra), gated på at køen faktisk har pending/abandoned items — så er banneret usynlig i normaltilfellet men aldri stille ved risiko for datatap.

**Verifisering:** Verifisert: app/[locale]/games/[id]/layout.tsx:30 er eneste <SyncBanner />-mount i hele repoet (grep), syncWorker.ts:28–31-kommentaren («a lost stroke must never be silent … SyncBanner surfaces») stemmer, og PwaBoot drainer via SW-melding globalt uten UI. Funnet er faktisk sterkere enn beskrevet: online/focus/30s-lytteren (startSyncListener) startes kun fra HoleClient.tsx:343, så utenfor spillsidene er køen både usynlig OG mindre aktivt drenert. Relaterte issues (#754, #668, #359) er lukket og dekket andre aspekter.

### F51 — Innboksen svelger databasefeil og viser «Ingen nye varsler»-tomtilstanden i stedet

**P2 · friksjon · `app/[locale]/innboks/page.tsx:34`**
*Prinsipp: 9241-110 selvbeskrivelse + feiltoleranse* — *bok-tema: Automasjons-transparens*

Innboks-siden destrukturerer `{ data: rows }` fra Supabase-spørringen uten å sjekke error, og faller tilbake til tom liste (`rows ?? []`). Feiler spørringen (nett-hikke, RLS-endring, Supabase-nedetid) rendres den vennlige tomtilstanden «Ingen nye varsler.» — brukeren tror aktivt at ingenting venter, mens f.eks. en «Godkjenning trengs»-forespørsel fra kjerneflyten ligger usynlig. Dette bryter både repoets egen konvensjon (spill-sidene kaster på enhver Supabase-feil slik at error-grensa med «Prøv igjen» tar over, jf. games/[id]/error.tsx sin doc-kommentar) og invarianten «absence of error ≠ success». Samme mønster på profil-spørringen samme sted gjør at månedsbrev-bryteren kan vise feil tilstand.

**Bevis:** app/[locale]/innboks/page.tsx:34-43 (`const { data: rows } = await supabase.from('notifications')… ; const notifications = rows ?? [];` — error aldri lest) og :65-70 (profile-spørring, samme svelging); tomtilstanden i InboxClient.tsx:109-121. Kontrast: app/[locale]/games/[id]/submit/page.tsx:222-223 (`if (holesRes.error) throw holesRes.error`) og games/[id]/error.tsx:7-9.

**Forslag:** Kast på error (`if (error) throw error`) slik spill-sidene gjør — [locale]/error.tsx gir da «Noe gikk galt / Prøv igjen»-skjermen med retry som re-kjører spørringen. Tomtilstand skal bare vises når spørringen faktisk lyktes med 0 rader.

**Verifisering:** Verifisert: innboks/page.tsx:34–43 destrukturerer { data: rows } uten å lese error og faller til tom liste; samme mønster på profil-spørringen :65–70; tomtilstanden i InboxClient:109–121 rendres da som om alt er vel. Kontrasten stemmer: submit/page.tsx:222–223 kaster på error, og både games/[id]/error.tsx og [locale]/error.tsx finnes (fiks-stien er gyldig). #877 (lukket) fikset identisk feilsvelging på Hjem — innboksen ble ikke tatt samtidig, klassisk T2-søskensak.

### F52 — Fantom-prikk i bunn-nav: skjulte stale påmeldings-varsler forblir uleste og kan aldri ryddes fra UI

**P2 · friksjon · `app/[locale]/innboks/page.tsx:50`**
*Prinsipp: 9241-110 selvbeskrivelse + kontrollerbarhet* — *bok-tema: Alarm-filosofi*

Innboksen skjuler registration_request-varsler som peker på slettede spill (#613) — men bare fra VISNINGEN; radene forblir uleste i DB. Ulest-prikken i bunn-nav teller alle rader med `read_at is null`, inkludert de skjulte. Er et slikt skjult varsel ulest, lyser prikken permanent uten synlig årsak: brukeren åpner innboksen, ser ingen uleste kort, og fordi «Marker alle som lest»-knappen gates på uleste i den FILTRERTE lista vises i stedet «Tøm leste» — som kun arkiverer leste rader. Det finnes altså ingen vei i UI til å slukke prikken. En alarm som aldri kan kvitteres ut lærer brukeren å ignorere prikken — og undergraver signalverdien for alle framtidige varsler (klassisk cry-wolf).

**Bevis:** app/[locale]/innboks/page.tsx:50-63 (filtrerer visningen uten å markere/arkivere); lib/notifications/staleNotifications.ts:32-34 («rader blir værende … de skjules bare»); hooks/useUnreadNotificationsCount.ts:68-77 (teller alle `read_at is null`, ingen stale-filtrering); app/[locale]/innboks/InboxClient.tsx:51 + 130-142 (hasUnread fra filtrert liste gater «Marker alle som lest»).

**Forslag:** Når stale signup-varsler filtreres bort server-side, marker de samme radene lest/arkivert i samme slengen (best-effort via markNotificationsRead/archiveNotifications med id-ene, gjerne i after()). Da stemmer prikken alltid med det brukeren faktisk kan se og handle på.

**Verifisering:** Alle fire bevispunkter verifisert: page.tsx:50–63 filtrerer kun visningen, staleNotifications.ts:32–34 sier eksplisitt at radene blir værende, useUnreadNotificationsCount.ts:68–77 teller alle read_at is null uten stale-filter, og InboxClient:51+130–142 gater «Marker alle som lest» på den filtrerte lista. Jeg lette etter en utvei: markAllAsRead ville renset de skjulte radene server-side, men er ikke nåbar når kun skjulte rader er uleste — knappen morfer da til «Tøm leste» som kun arkiverer leste (archive.ts:53–58). Fantom-prikken kan altså reelt aldri slukkes fra UI. #613/#616 er lukket og skapte/dekker ikke dette hullet.


## P3 — polish, konsistens og mindre friksjon

### F5 — «Både solo og lag»-spill viser kun lag-skjema — solo-påmelding er umulig i UI-et

**P3 · friksjon · `app/[locale]/signup/[shortId]/registrationTypeView.ts:29`**
*Prinsipp: 9241-110 oppgaveegnethet* — *kjent som #1069*

registration_type 'both' er dokumentert som «hva man melder på (solo / team / both)», og solo-serveraksjonen tillater eksplisitt solo-grenen for 'both'-spill. Men den offentlige påmeldingssiden mapper 'both' + lag-støttende modus til team_form, som rendrer KUN TeamRegistrationForm — der alle N-1 medspillerfelt er required. En deltaker uten lag som følger lenken/plakaten til et 'both'-spill kan altså ikke melde seg på solo, enda arrangøren valgte 'both' nettopp for å tillate det. Regelen bor i to lag som er uenige (AGENTS.md trap 4): backend sier ja, UI sier nei.

**Bevis:** registrationTypeView.ts:28–33: `(registrationType === 'team' || registrationType === 'both') && modeSupportsTeams` → team_form. page.tsx:557–579: team_form-grenen rendrer bare TeamRegistrationForm, ingen solo-alternativ. actions.ts:192–193 (signup): kommentar «`both` tillater solo-grenen» + `if (game.registration_type === 'team')`-guard som slipper 'both' gjennom til solo-insert. TeamRegistrationForm.tsx:377: slot-input er `required`, og teamActions.ts:247 avviser submit med færre slots (slots_count_wrong).

**Forslag:** For 'both': vis et valg («Meld deg på alene» / «Registrer lag») over skjemaet, der solo-valget rendrer eksisterende RegistrationForm. Ren UI-gren — backend-støtten finnes allerede.

**Verifisering:** Kode-bevis stemmer: registrationTypeView.ts:28–33 mapper 'both'+lag-modus til team_form, page.tsx:557–579 rendrer kun TeamRegistrationForm (slots required, TeamRegistrationForm.tsx:377; server avviser færre slots, teamActions.ts:247), mens solo-aksjonen slipper 'both' gjennom (actions.ts:190–195). Men funnet er kjent: åpent issue #1069 dekker eksplisitt at 'both' er et dødt valg med solo-POST-hull, og eier-retningen der er å fjerne valget. Null prod-bruk av 'both' → P3, ikke P2.

### F6 — Rate-limit-meldingen er ikke handlingsrettet — sier ikke hvor lenge man må vente

**P3 · friksjon · `lib/auth/loginRateLimit.ts:46`**
*Prinsipp: 9241-110 selvbeskrivelse* — *bok-tema: Alarm-filosofi*

Egen-rate-limiten tillater 3 sendCode-forsøk per e-post per 15 minutter. Kombinert med copy-en «Koden kan ta et par minutter» på verify-steget er ett første forsøk + to utålmodige «Send ny kode»-trykk nok til å låse brukeren ute i opptil 15 minutter. Feilmeldingen «Vent litt før du prøver igjen.» gir ingen tidsangivelse, så brukeren på banen (flighten venter) prøver igjen for tidlig, får samme melding, og vet ikke om «litt» er ett minutt eller en time. Samme melding dekker både 60-sekunders Supabase-throttle og 15-minutters bucket — to helt ulike ventetider, én vag beskjed.

**Bevis:** loginRateLimit.ts:44–47: `emailMax = 3`, `windowSeconds = 15 * 60`. messages/no.json auth.errors.rate_limited: «Vent litt før du prøver igjen.» auth.verifyCode.spamHint: «Koden kan ta et par minutter.» actions.ts:106–111 mapper også Supabase 60s-throttle til samme kode.

**Forslag:** Differensier copy: for resend-throttle «Du kan be om ny kode om ett minutt — den forrige koden virker fortsatt», for bucket-limit «Du har bedt om mange koder. Vent 15 minutter og prøv igjen». Vurder å heve emailMax noe (f.eks. 4–5) siden treg mail-levering er den dokumenterte normalen.

**Verifisering:** Verifisert: loginRateLimit.ts:44–47 (emailMax=3, 15 min vindu), no.json auth.errors.rate_limited «Vent litt før du prøver igjen.» uten tidsangivelse, spamHint «Koden kan ta et par minutter», og actions.ts:106–110 mapper 60s Supabase-throttle til samme kode. Én vag melding dekker to ulike ventetider. Ingen dekkende issue funnet (#766/#768 gjaldt hint og resend-mekanikk, ikke rate-limit-copy).

### F7 — Utløpt invitasjon håndheves ulikt: blokkerer kode-bestilling, men konsumeres ved innlogging

**P3 · friksjon · `app/[locale]/(auth)/login/actions.ts:277`**
*Prinsipp: 9241-110 samsvar med forventning* — *bok-tema: Automasjons-transparens*

email_is_invited-RPC-en filtrerer utløpte invitasjoner (expires_at > now()), og sendCode viser «Invitasjonen din er utløpt. Be arrangøren om å sende en ny» til uregistrerte med utløpt rad. Men verifyCode henter pending-invitasjoner UTEN expires_at-filter: en eksisterende bruker (eller selvregistrert, med flagget på) som logger inn med en utløpt spill-invitasjon blir stille meldt inn i spillet likevel. Utløpsregelen bor altså i to hjem som er uenige (trap 4): samme utløpte invitasjon gir «be om ny» til én brukergruppe og automatisk innmelding til en annen. Kontekstkortet på /login forsvinner også stille for utløpte tokens, så mail-lenke-klikkeren ser en naken login-side uten forklaring.

**Bevis:** supabase/migrations/0013_email_is_invited.sql:22: `and (expires_at is null or expires_at > now())`. login/actions.ts:274–281: pendingInvites-query har kun `.ilike('email', …).is('accepted_at', null)` — ingen expires_at-betingelse, og radene konsumeres/inserts i game_players (linje 326–354). getInviteLoginContext.ts:70: kortet krever `gt('expires_at', now)` → utløpt token rendrer som om param ikke fantes (page.tsx:87–90).

**Forslag:** Avgjør én regel og håndhev den i begge lag: enten filtrer expires_at i verifyCode-oppslaget (konsistent avvisning), eller aksepter utløpte ved innlogging og myk opp sendCode-meldingen. Vurder også et lite «Invitasjonen er utløpt — logg inn eller be om ny»-hint på /login når invite-token finnes men er utløpt.

**Verifisering:** Verifisert: 0013_email_is_invited.sql:22 filtrerer utløpte, mens verifyCode-oppslaget (actions.ts:274–281) mangler expires_at-betingelse og konsumerer radene + inserter game_players (:326–354); getInviteLoginContext.ts:70 krever gt(expires_at) så kortet forsvinner stille. Regelen bor i to uenige hjem (trap 4). Ingen issue dekker dette (#361/#659 gjaldt andre sider av invitasjons-gatingen).

### F8 — «Send ny kode» har treffflate langt under 44px-kravet

**P3 · friksjon · `app/[locale]/(auth)/login/_components/VerifyCodeForm.tsx:92`**
*Prinsipp: 9241-110 tilgjengelighet* — *bok-tema: Design for stress*

Resend-knappen på verify-steget er en naken tekst-knapp i text-xs (12px) uten min-høyde eller padding — reell treffflate ca. 16 px høy. Dette er gjenopprettingshandlingen brukere trenger mest når mailen drøyer, typisk stående utendørs, gjerne med hansker — konteksten prosjektets egen konvensjon (tap-targets ≥44px, håndhevet i Button-primitiven med min-h-[44px]) er laget for. Kontrasten er også svekket: text-muted brukes på en handlingsbærende kontroll.

**Bevis:** VerifyCodeForm.tsx:90–98: `<button type="submit" … className="underline text-xs text-muted disabled:opacity-50">` — ingen min-h/padding. Sammenlign components/ui/Button.tsx:11: `min-h-[44px] px-[18px] py-2.5` som er husstandarden. CLAUDE.md «Stil»: «tap-targets ≥44px».

**Forslag:** Gi resend-knappen min-h-[44px] med padding (f.eks. som Button variant='ghost' i mindre tekststørrelse), og løft fargen fra text-muted til text-primary så handlingen er synlig i sollys.

**Verifisering:** Verifisert: resend-knappen (VerifyCodeForm.tsx:92–96) er en naken text-xs text-muted-knapp uten min-høyde/padding, mot husstandarden min-h-[44px] i Button.tsx:11 og CLAUDE.md-kravet ≥44px. #770 (lukket) fikset InstallBanner og hull-header-nav, men ikke denne (knappen ble til etter #768). Ingen dekkende issue.

### F14 — SyncBanner er halvveis oversatt — kø- og feilmeldingene hardkodet på norsk

**P3 · friksjon · `components/sync/SyncBanner.tsx:24-60`**
*Prinsipp: 9241-110 samsvar med forventning (konsistens)* — *bok-tema: Alarm-filosofi*

SyncBanner bruker next-intl for konflikt-varslene (t('conflictNotice')), men alle kø-/feilmeldingene er hardkodet bokmål i komponenten: hele friendlySyncError-kartet («Mistet nettforbindelsen», «Innloggingen er utløpt — logg inn på nytt», «Du mangler tilgang», «Klarte ikke å lagre» osv.), «Kunne ikke lagre {n} slag. Kontakt arrangøren.», «{n} slag venter på lagring.», «Prøv igjen» og «Sender…». Dette er appens mest sikkerhetskritiske varsel (reelt datatap på slag), og en bruker med engelsk locale får det på norsk nettopp i feil-øyeblikkene på banen — de mest stressende situasjonene, der forståelse betyr mest. Inkonsistensen internt i komponenten (conflictNotice via t(), resten hardkodet) tyder på etterslep, ikke et valg — gapet ble eksplisitt notert som pre-eksisterende i forge-evalueringen av #688, men er aldri lukket.

**Bevis:** components/sync/SyncBanner.tsx:24-60 (friendlySyncError — norske returverdier hardkodet), :130-135 (abandoned-/venter-meldinger), :157 («Sender…»/«Prøv igjen») — mot :180-189 som bruker t('conflictNotice'); messages/no.json:4828-4831 + en.json:4828-4831 (SyncBanner-seksjonen har KUN conflictNotice + conflictDismiss); .forge/evaluations/688-sync-conflict-tie-and-signal.md:70 dokumenterer hullet.

**Forslag:** Flytt alle kø-banner-strengene og friendlySyncError-tekstene inn i SyncBanner-namespacet i messages/no.json + messages/en.json og bytt til t()-kall (mønsteret finnes allerede i samme fil for conflict-varselet). Ren copy-flytting, ingen logikkendring; kjør humanizer på ny norsk copy per konvensjonen.

**Verifisering:** SyncBanner.tsx:24-60/130-135/157 har hardkodet bokmål mens :181/189 bruker t(); messages/no.json+en.json:4828-4831 har kun conflict-nøklene. Forge-evalueringen av #688 (linje ~70) noterte gapet som pre-eksisterende og out-of-scope. Engelsk locale er levende (i18n-fasene #554 m.fl.), og lignende lekkasjer (#818, #681) er behandlet som bugs. Ingen issue dekker denne.

### F15 — Treffflater under 44 px: putts-stepper (34×30) og onboarding-lukking (32×32)

**P3 · friksjon · `components/hole/PuttsField.tsx:75-77`**
*Prinsipp: 9241-110 tilgjengelighet* — *bok-tema: Design for stress*

To interaktive mål på hull-flaten ligger under appens ≥44 px-regel: (1) PuttsField sine −/+-knapper er 34×30 px — koden flagger det selv som en bevisst trade-off for å få stepperen inn i ledig kort-høyde, men putter tastes i samme felt-kontekst (hansker, én hånd) som slag-stepperen som nettopp ble oppgradert til 44×44 i #944; (2) OnboardingBanner sitt lukke-kryss har 32×32 px trefflate med et lite ×-glyf. Putts-stepperen er dessuten duplisert per spillerkort, så bomtrykk kan justere feil spillers putter (nabokortets knapper ligger nær).

**Bevis:** components/hole/PuttsField.tsx:54-57 (kommentar: «Buttons are 34×30 — … a flagged trade-off against the ≥44px tap guideline»), :75-77 (width 34, height 30); components/hole/OnboardingBanner.tsx:44-53 (closeHitStyle 32×32); jf. ScoreCard.tsx:231-232 (44×44-regelen med hanske-begrunnelse)

**Forslag:** Behold visuell størrelse, men utvid trykk-flaten: negative marger + padding på putts-knappene (samme triks som undoBtnStyle i ScoreCard.tsx:264-280 bruker for å nå 44 px uten å blåse opp layouten), og sett closeHitStyle i OnboardingBanner til 44×44.

**Verifisering:** PuttsField.tsx:54-57/75-77 bekrefter 34×30-knappene (selv-flagget trade-off) og OnboardingBanner.tsx:44-53 bekrefter 32×32-krysset. Negative-margin-trikset i ScoreCard.tsx:264-280 viser at fiksen er mulig uten å bryte plasshensynet som motiverte trade-offen. #1069 sin bifangst gjelder putter-pillen i headeren — et annet element, ikke dup.

### F16 — Score-arket flytter ikke fokus og mangler fokus-felle

**P3 · friksjon · `components/hole/SpecificValueSheet.tsx:82-93`**
*Prinsipp: 9241-110 tilgjengelighet (WCAG 2.4.3 fokusrekkefølge)*

SpecificValueSheet rendres med role=dialog og aria-modal=true, men gjør ingen fokus-håndtering: fokus flyttes ikke inn i arket ved åpning, det finnes ingen fokus-felle, og fokus returneres ikke til ⋯-knappen ved lukking — eneste tastatur-støtte er Escape-lytteren. For skjermleser-/tastaturbrukere betyr det at dialogen kan åpne uten at de merker det, og at Tab vandrer i innholdet bak det aria-modal-markerte arket (aria-modal lover assistive tech at bakgrunnen er inert, uten at koden innfrir det). Touch-brukere merker ingenting, så dette er et rent tilgjengelighetshull.

**Bevis:** components/hole/SpecificValueSheet.tsx:82-93 (kun Escape-listener; ingen focus(), ingen felle, ingen fokus-retur); :113-120 (role=dialog + aria-modal=true uten inert bakgrunn)

**Forslag:** Ved open: fokuser første verdi-knapp (ref + useEffect); fang Tab/Shift+Tab i arket (enkel first/last-element-felle — arket har bare 6 knapper); returner fokus til ⋯-knappen ved lukking. Samme mønster kan gjenbrukes i WolfChoiceModal.

**Verifisering:** Hele SpecificValueSheet.tsx lest: kun Escape-lytter (82-91), role=dialog + aria-modal=true (117-119) uten focus(), fokus-felle eller fokus-retur; komponenten rendrer rå div-er uten delt modal-primitiv som kunne mitigere. Ingen issue funnet om fokus-håndtering.

### F22 — Gjenåpning av spill eller scorekort varsler ingen — spillere må selv oppdage at leveringen deres er nullstilt

**P3 · friksjon · `app/[locale]/admin/games/[id]/actions.ts:590`**
*Prinsipp: 9241-110 selvbeskrivelse (systemstatus)* — *bok-tema: Automasjons-transparens / situasjonsbevissthet*

reopenGame (finished → active, leaderboard skjules, round_report slettes) og reopenScorecard (submitted_at/approved_at nullstilles) logger kun admin-event — ingen notify() til berørte spillere, i kontrast til start (game_started), godkjenning (scorecard_approved) og avslutning (game_finished) som alle varsler. Spilleren hvis kort gjenåpnes tror fortsatt hen er ferdig («Scorekort levert og godkjent...» var siste status hen så) og får ingen beskjed om at spillet nå venter på ny levering fra hen; avslutningen blokkerer så på not_all_submitted. Auto-nudgen (maybeSendDeliveryReminder) hjelper bare hvis spilleren selv åpner spill-hjem igjen. Tilsvarende ser deltakerne resultatlisten forsvinne uten forklaring når et spill gjenåpnes.

**Bevis:** admin/games/[id]/actions.ts:440-484 (reopenScorecard) og :590-631 (reopenGame) — begge kaller kun logAdminEvent + revalidate; ingen notify()-kall. Kontrast: notifyPlayersGameStarted (:112-133), notify 'scorecard_approved' (:210-228), notifyPlayersGameFinished (:383-387). Nudge krever sidebesøk: (home)/page.tsx:392-400.

**Forslag:** Best-effort notify til berørt spiller ved reopenScorecard («Scorekortet ditt i {game} er gjenåpnet — rediger og lever på nytt», deeplink til spill-hjem) og til alle aktive deltakere ved reopenGame («{game} er gjenåpnet av arrangøren»). Gjenbruk eksisterende notify()-mønster med Promise.allSettled; ingen mail nødvendig.

**Verifisering:** reopenScorecard (:440-484) og reopenGame (:590-631) kaller kun logAdminEvent + revalidate — ingen notify, i kontrast til game_started (:112-133), scorecard_approved (:210-228) og game_finished (:383-387). Nudgen krever sidebesøk ((home)/page.tsx:392-400). Samme bevisste utsettelses-mønster er kommentert for WD (:530-533), men ingen issue sporer reopen-varsling.

### F23 — Norsk hardkodet i server-fallbacks: «Ingen grunn oppgitt» m.fl. vises uoversatt i engelsk locale

**P3 · friksjon · `app/[locale]/games/[id]/approve/actions.ts:192`**
*Prinsipp: 9241-110 samsvar med brukerens forventning (i18n-konsistens)*

Avvises et kort uten begrunnelse lagrer rejectScorecard bokstaven «Ingen grunn oppgitt» i rejection_reason, som deretter rendres verbatim i spillerens rejection-banner — også for brukere med engelsk UI. Samme mønster i navnefallbacks som ender i varsel-payloads og mail: «(ukjent spiller)», «(ukjent spill)», «(ukjent godkjenner)», «En arrangør»/«Admin» (actorName brukes som approver_name i scorecard_approved-varselet). All øvrig copy i disse flytene går gjennom messages/no.json+en.json, så dette bryter katalog-konvensjonen appen ellers følger.

**Bevis:** approve/actions.ts:192 — `reason = ... : 'Ingen grunn oppgitt'`; :158-160 — «(ukjent spill)» / «(ukjent godkjenner)». submit/actions.ts:128 — «(ukjent spiller)». admin/games/[id]/actions.ts:60 — «En arrangør», :41 «Admin». Rendres verbatim hos mottaker: (home)/page.tsx:893-899 (rejection_reason) og lib/notifications/cardContent.ts:111 («reason = free-text DB content ... rendered verbatim»).

**Forslag:** Lagre en sentinel (null eller 'no_reason') i stedet for fritekst-fallbacken og la render-siden oversette via messages-katalogen; hent locale-bevisste fallbacks for navnestrengene med getTranslations i actionene (mønsteret finnes allerede for error-nøklene i samme filer).

**Verifisering:** Alle siterte hardkodede norske fallbacks finnes i koden i dag (approve/actions.ts:158,160,192; submit/actions.ts:128; admin/games/[id]/actions.ts:41,60) og rendres verbatim hos mottaker ((home)/page.tsx:893–896; cardContent.ts:111–117), mens engelsk katalog (messages/en.json) ellers dekker flytene. Beslektede lukkede issues #583/#594 fikset andre payload-typer, ikke disse call-sitene.

### F24 — «Godkjenn ✓» er ett tapp med scorekortet skjult bak sammenslått <details> — attestering uten å se det man attesterer

**P3 · friksjon · `app/[locale]/games/[id]/approve/page.tsx:250`**
*Prinsipp: 9241-110 feiltoleranse (forebygging)* — *bok-tema: Meaningful human control*

På /approve er 18-hulls-kortet kollapset bak «Vis 18-hulls-kort» som standard; synlig er kun navn, bruttosum og hulltall. Godkjenn-knappen fyrer direkte uten bekreftelse (avvisning har derimot både grunn-felt og confirm-vakt). Letteste vei gjennom attest-oppgaven er dermed å godkjenne uten å ha sett ett eneste hull — og godkjenningen er i praksis endelig for spillerne (kortet forsvinner fra /approve; gjenåpning er admin-only, jf. funn 5). Peer-godkjenning finnes nettopp for å fange føringsfeil; når kontrollpunktet er designet som gummistempling, mister automatikken den menneskelige kontrollen den skal gi. Asymmetrien er også omvendt av risikoen: å avvise er reversibelt (spilleren leverer på nytt), å godkjenne er det ikke.

**Bevis:** approve/page.tsx:250-253 — `<details>` uten open-attributt («Vis 18-hulls-kort» kollapset); :236-247 header viser kun navn + brutto + spilte hull. ReviewActions.tsx:32-39 — approve-form uten confirm-vakt (kontrast: reject-flyten :51-65 med grunn + window.confirm). Endelighet: approve/page.tsx:172-178 (godkjente kort forsvinner) + admin/games/[id]/actions.ts:440-443 (gjenåpning admin-only).

**Forslag:** Sett `open` som default på details-elementet (kortet er lite og siden har allerede overflow-håndtering), eller vis front-9/back-9-sum + antall birdies/store avvik i headeren slik at nøkkeltallene er synlige før tapp. Ingen ekstra confirm nødvendig hvis kortet faktisk vises.

**Verifisering:** Verifisert: 18-hulls-kortet ligger i <details> uten open (approve/page.tsx:250), approve-formen fyrer uten vakt mens reject har grunn-felt + confirm (ReviewActions.tsx:32–39 vs 51–65), og gjenåpning er admin-only (reopenScorecard bruker loadAdminContext, actions.ts:440–442). Lukket #1067 fjernet bevisst confirm i admin-flyten, men dekker ikke det kollapsede kortet på peer-attest-siden; forslaget (open som default) kolliderer ikke med den beslutningen.

### F29 — Kø-status og submit-sperre teller slag på tvers av spill

**P3 · friksjon · `app/[locale]/games/[id]/submit/SubmitForm.tsx:35-40`**
*Prinsipp: 9241-110 samsvar med forventning* — *bok-tema: Automasjons-transparens*

SyncBanner, hull-sidens pendingCount (SyncStatusLine) og submit-sperren leser hele syncQueue uten gameId-filter. Henger et element igjen fra en annen runde, viser spill B «Lagret på telefonen · sendes når nettet er tilbake» og «N slag venter», og «Lever ✓» låses med «Lagrer slag …» — for slag som tilhører spill A. Brukeren får en systemstatus som ikke stemmer med runden de faktisk står i, og i verste fall en submit-knapp som virker uforklarlig død i flere minutter mens et fremmed kø-element brenner gjennom sine permanente forsøk.

**Bevis:** components/sync/SyncBanner.tsx:64-66 (localDb.syncQueue.toArray() uten filter); app/[locale]/games/[id]/holes/[holeNumber]/HoleClient.tsx:408-411 (pendingCount over hele køen); app/[locale]/games/[id]/submit/SubmitForm.tsx:35-40 + :84 (disabled={syncing} basert på global kø-count). Kø-nøkkelen `${gameId}:${userId}:${holeNumber}` (lib/sync/db.ts:22, scoreKey :74-80) gjør filtrering triviell.

**Forslag:** Filtrer kø-lesingene på gjeldende gameId (scoreId starter med `${gameId}:`) i SyncBanner, HoleClient og SubmitForm, slik at status og sperrer bare gjenspeiler runden brukeren står i. Fremmede strandede elementer kan evt. vises som egen, lavmælt linje.

**Verifisering:** Alle tre lesingene er ufiltrert på gameId: SyncBanner.tsx:64–66 (toArray), HoleClient.tsx:408–411 (pendingCount) og SubmitForm.tsx:35–40 med disabled={syncing} på :84 — mens kø-nøkkelen `${gameId}:${userId}:${holeNumber}` (db.ts:74–80) gjør filtrering triviell. Ingen mitigering funnet.

### F30 — «Innloggingen er utløpt — logg inn på nytt» uten vei til innlogging

**P3 · friksjon · `components/sync/SyncBanner.tsx:35-43`**
*Prinsipp: 9241-110 feiltoleranse* — *bok-tema: Error recovery over feilmelding*

Ved utløpt sesjon ber banneret brukeren logge inn på nytt, men den eneste knappen er «Prøv igjen» — som kjører nøyaktig samme feilende RPC en gang til. Ingen lenke til /login. For den ikke-tekniske brukeren er «logg inn på nytt» uten en knapp å trykke på en instruks uten virkemiddel; slagene blir korrekt bevart i køen (auth-feil er transient-klassifisert), men veien ut av tilstanden må brukeren finne selv.

**Bevis:** components/sync/SyncBanner.tsx:35-43 (auth-mapping → «Innloggingen er utløpt — logg inn på nytt»), :150-159 (eneste handling i banneret er retry); lib/sync/classifyError.ts:31-35 (jwt/expired/session/401 klassifisert transient → køen består til re-login).

**Forslag:** Når friendlySyncError treffer auth-kategorien, render en «Logg inn»-lenke (til /login med next=gjeldende side) i banneret i stedet for/ved siden av «Prøv igjen», slik at instruksen og handlingen henger sammen.

**Verifisering:** friendlySyncError mapper auth-feil til «Innloggingen er utløpt — logg inn på nytt» (SyncBanner.tsx:35–43) mens eneste handling i banneret er retry-knappen (:150–159); ingen login-lenke finnes, og classifyError.ts:31–35 bekrefter at køen består til re-login. Instruks uten virkemiddel, som beskrevet.

### F34 — Låst back 9-copy lover åpning ved «levert og godkjent», men tavla åpner først når admin avslutter spillet

**P3 · friksjon · `messages/no.json:2218`**
*Prinsipp: 9241-110 selvbeskrivelse* — *bok-tema: Automasjons-transparens*

State #3.5 sitt låste back-9-kort sier «Alle scorekort må være levert og godkjent før resten av tabellen vises» (messages/no.json:2218, rendret i formats/state3.tsx:358–365), og holes-drilldownen har samme formulering («Hull 10–18 vises når alle scorekort er levert og godkjent», no.json:2358). Men koden flipper viewet til 'full' utelukkende på game.status === 'finished' (leaderboardContent.tsx:443–456) — altså når admin trykker «Avslutt spillet», som er et separat steg ETTER godkjenning. En spiller som har fått alle kort godkjent står ved hull 18 og venter på en tabell som copy-en sier skal være åpen, uten hint om at admin må gjøre noe mer. Søster-copyene er presise («…holdes hemmelig til admin avslutter spillet» — nassau/skins/wolf/shamble/patsome, f.eks. no.json:2237, 2253, 2288), så dette er de to eneste stedene som beskriver feil trigger.

**Bevis:** messages/no.json:2218 og 2358 (feil trigger i copy); app/[locale]/games/[id]/leaderboard/leaderboardContent.tsx:443–456 (gate = status 'finished'); messages/no.json:2237/2253/2288 (korrekte søster-formuleringer)

**Forslag:** Endre begge strengene til samme sannhet som søster-copyene, f.eks. «Resten av tabellen vises når arrangøren avslutter runden.» Ren copy-endring (no + en), snapshot-oppdatering ved behov.

**Verifisering:** Verifisert: no.json:2218 og 2358 lover åpning ved «levert og godkjent», men leaderboardContent.tsx:443–456 flipper til 'full' kun på status 'finished' (admin-handling). Strengene rendres faktisk (state3.tsx:360–363, drilldown.tsx:265), og søster-copyene (2237/2253/2288) beviser at riktig formulering allerede finnes. Ingen issue dekker det.

### F35 — Spectate lover «Følger live» med pulserende dot, men polling feiler stille og ingenting viser når tallene sist ble oppdatert

**P3 · friksjon · `app/[locale]/spectate/[token]/SpectatePoller.tsx:29`**
*Prinsipp: 9241-110 selvbeskrivelse* — *bok-tema: Situasjonsbevissthet*

Spectate-banneret viser «Følger live» med en pulserende hvit dot så lenge spillet er aktivt (spectate/[token]/page.tsx:171–179, animate-pulse). Ferskheten leveres av SpectatePoller som kaller router.refresh() hvert 20. sekund (SpectatePoller.tsx:29–33) — men refresh-kallet har ingen feilhåndtering: mister tilskueren nett (klubbhus-wifi, mobilnett), fortsetter dotten å pulsere og love live-data mens tallene i praksis er frosset. Det finnes heller ingen «sist oppdatert»-tidsstempel noe sted på siden (grep i spectate-namespace, no.json:4886–4902, gir ingen slik streng). For publikum som følger en spennende avslutning er forskjellen mellom «live» og «frosset for 5 minutter siden» nettopp det banneret påstår å fortelle. I tillegg respekterer ikke animate-pulse prefers-reduced-motion (globals.css sine reduced-motion-regler dekker kun egendefinerte animasjoner, linje 424–596).

**Bevis:** app/[locale]/spectate/[token]/page.tsx:171–179 (pulserende live-dot); app/[locale]/spectate/[token]/SpectatePoller.tsx:26–34 (router.refresh uten feilhåndtering); messages/no.json:4886–4902 (ingen sist-oppdatert-copy)

**Forslag:** La SpectatePoller lytte på online/offline (navigator.onLine + events) og bytt banner-tilstand til f.eks. «Mistet forbindelsen — prøver igjen…» når nettet er borte; legg gjerne «Oppdatert HH:MM» diskret i banneret ved hver vellykkede refresh. Gate dot-animasjonen med motion-safe:.

**Verifisering:** Verifisert: SpectatePoller.tsx:29–33 kaller router.refresh uten feilhåndtering, dotten pulserer ubetinget (page.tsx:172–177), spectate-namespacet har ingen sist-oppdatert-streng, og reduced-motion-reglene i globals.css dekker kun egendefinerte animasjonsklasser — ikke Tailwinds animate-pulse. Ingen mitigering eller issue funnet.

### F36 — Cup-siden: hardkodet norsk copy utenfor i18n, inkludert skrivefeilen «point» for «poeng»

**P3 · friksjon · `app/[locale]/cup/[id]/page.tsx:90`**
*Prinsipp: 9241-110 samsvar med forventning*

Den offentlige cup-siden har et i18n-namespace (cup.public, messages/no.json:4350–4352), men mesteparten av copy-en er hardkodet norsk i komponenten: «Poengmålet er klart når cupen starter» og «Først til {n} point vinner» (cup/[id]/page.tsx:89–90 — «point» er feil, skal være «poeng»), «Uavgjort» (linje 84), «{navn} vant» (linje 80–81), «Spilles»/«Utkast» (linje 175–177), «Match» (linje 186), «mot» (linje 188), «Halvert (AS)» og «{res} til {navn}» (linje 193–213). På engelsk locale vises alt dette på norsk midt i en ellers oversatt side. Cupen er bygget-men-ubrukt (kun bugfiks per docs/hva-er-nok.md) — «point»-skrivefeilen er en ren bugfiks innenfor rammen; i18n-flyttingen er stell som kan tas i samme lille commit eller parkeres.

**Bevis:** app/[locale]/cup/[id]/page.tsx:80–90, 175–177, 186–188, 193–213 (hardkodede strenger, «point»-typo på linje 90); messages/no.json:4350–4352 (cup.public har kun 2 nøkler)

**Forslag:** Minimum: rett «point» → «poeng». Gjerne samtidig: flytt de hardkodede strengene inn i cup.public-namespacet (no + en) — mekanisk endring, ingen logikk.

**Verifisering:** Verifisert: «point»-typoen står på cup/[id]/page.tsx:90 og de hardkodede norske strengene på 80–90, 175–177, 184–188, 193–213; cup.public har kun 2 nøkler (no.json:4350–4353). Lukkede #747 fikset kun de engelske strengene på samme side og skjermet bevisst resten — funnet er altså fortsatt gyldig. Typo-fiksen er innenfor bugfiks-rammen for den frosne cup-flaten.

### F37 — Liga-tabellen gjemmer sesong-totalen bakerst i horisontal scroll og forklarer aldri «–»-radene

**P3 · friksjon · `components/league/LeagueStandingsTable.tsx:157`**
*Prinsipp: 9241-110 oppgaveegnethet / lærbarhet*

LeagueStandingsTable legger sesong-verdien (svaret på brukerens primærspørsmål «hvor ligger jeg?») som SISTE kolonne etter én kolonne per runde (LeagueStandingsTable.tsx:149–159), i en tabell med overflow-x-auto og minWidth 320px (linje 135–139). På mobil med flere runder havner totalen utenfor skjermkanten, og spilleren må vite at tabellen kan scrolles sidelengs — ingen visuell scroll-affordance finnes. I tillegg rendres uranked deltakere med «–» i rank-kolonnen og opacity-60 (linje 167–179, 195) uten noen forklaring på hvorfor de ikke er rangert; usikre 60-åringer har ingen sjanse til å tolke det. NB: liga er bygget-men-ubrukt (kun bugfiks per docs/hva-er-nok.md), så dette er dokumentert stell for når/hvis liga vekkes — ikke noe å bygge nå.

**Bevis:** components/league/LeagueStandingsTable.tsx:135–139 (overflow-x-auto, minWidth 320), 149–159 (runde-kolonner før verdi-kolonnen), 167–179 og 195 (uranked → «–» + opacity-60 uten forklaring)

**Forslag:** Ved liga-vekking: flytt sesong-verdikolonnen rett etter navnekolonnen (eller gjør navn+total sticky mens runde-kolonnene scroller), og legg en én-linjes fotnote under tabellen når uranked-rader finnes («– = har ikke spilt nok runder til å rangeres», eller den faktiske regelen).

**Verifisering:** Verifisert: overflow-x-auto + minWidth 320 (LeagueStandingsTable.tsx:135–139), sesong-verdien som siste kolonne etter runde-kolonnene (149–159, 219–225), og «–» + opacity-60 for uranked (167–195) uten forklaring noe sted i UI-et (grep unranked/ikke rangert = ingen brukersynlig tekst). Liga er fryst per hva-er-nok §2, så P3-stell-innrammingen «ved vekking» er korrekt.

### F42 — Reload midt i veiviseren gjenopptar på ?step=N med stille default-verdier

**P3 · friksjon · `app/[locale]/admin/games/new/GameWizard.tsx:184`**
*Prinsipp: 9241-110 selvbeskrivelse* — *bok-tema: Situasjonsbevissthet*

Steget leses fra URL ved mount (parseStepFromSearch), men all øvrig state starter på defaults. Etter reload på ?step=5 viser summary-kortet «Best ball» (gameMode-default), tomt roster og «Ikke valgt» bane — verdier arrangøren aldri har valgt, presentert i «Klar?»-oppsummeringen som om de var valgene deres. Publiser er riktignok gated (canPublish), så feilpublisering hindres, men flaten er en forvirrende blindvei: bruker står midt i en veiviser som later som en økt pågår, og må selv navigere fire «Forrige»-trykk tilbake.

**Bevis:** app/[locale]/admin/games/new/GameWizard.tsx:138-145 + 184-186 (step initialiseres fra URL); useGameFormState.ts:598-599 (initialMode = 'best_ball' uten initialValues), :307 (intent = undefined); ReadyStep.tsx:219-232 (summary rendrer gameMode/bane uansett formatChosen)

**Forslag:** Ved mount: hvis step > 1 i URL og state er urørt (intent undefined / formatChosen false), resett til steg 1 (router.replace uten ?step). Faller bort som egen fiks hvis sessionStorage-persistens fra funn 2 innføres.

**Verifisering:** Verifisert: steget leses fra URL ved mount (GameWizard.tsx:138–145, 184–186) mens all øvrig state starter på defaults (initialMode 'best_ball' på useGameFormState.ts:598, intent undefined på :307), og summary-kortet rendrer verdiene uansett formatChosen (ReadyStep.tsx:219–232). canPublish-gaten hindrer feilpublisering, som funnet selv oppgir — P3 er riktig.

### F43 — «Lagre utkast»-knappen deaktiveres uten forklaring når navnet er tomt

**P3 · friksjon · `app/[locale]/admin/games/new/sections/ReadyStep.tsx:527`**
*Prinsipp: 9241-110 selvbeskrivelse*

På steg 5 er utkast-knappen `disabled={name.trim() === ''}` uten noen hint-tekst eller aria-describedby. Publiser-knappen ved siden av har både «Mangler: …»-liste og aria-kobling — utkast-knappen bare dør. Siden spillnavnet auto-genereres først når bane er valgt (steg 3), treffer dette nettopp arrangøren som vil lagre et tidlig utkast før banevalget: knappen ser død ut uten at det står hvorfor, og handlingen «trykk på spillnavnet over og skriv noe» er ikke oppdagbar (placeholder «Trykk for å sette navn» står i stille kursiv).

**Bevis:** app/[locale]/admin/games/new/sections/ReadyStep.tsx:521-530 (disabled uten hint/aria-describedby) kontra :484-519 (publiser-knappen har missingPrefix-liste + aria-describedby); auto-name krever bane: GameWizard.tsx:277-288 (suggestGameName returnerer tom uten courseName)

**Forslag:** Vis en liten hint-linje under knappen når den er deaktivert («Sett et spillnavn først — trykk på navnet over»), med aria-describedby som på publiser-knappen. Alternativt: fokusér navnefeltet ved klikk på deaktivert-området.

**Verifisering:** Verifisert: utkast-knappen har disabled={name.trim() === ''} uten hint eller aria-describedby (ReadyStep.tsx:521–530) mens publiser-knappen rett over har begge deler (:484–498), og auto-navnet genereres først når bane er valgt (GameWizard.tsx:277–288). Ingen mitigering eller issue funnet.

### F44 — Utkast lages i veiviseren, men gjenopptas i et helt annet og tettere skjema-UI

**P3 · friksjon · `app/[locale]/admin/games/[id]/edit/page.tsx:271`**
*Prinsipp: 9241-110 samsvar med forventning + lærbarhet*

«Rediger utkast»-CTA-en på spilldetalj-siden sender arrangøren til edit-siden, som mounter den fulle stablede GameForm — ikke den 5-stegs veiviseren utkastet ble laget i. En ikke-teknisk arrangør som lagret et halvferdig utkast i den vennlige steg-for-steg-flyten gjenopptar i én lang, tett skjermfull med alle seksjoner samtidig. Avviket er et dokumentert bevisst valg (#1061, «power-users … bruker rediger-siden»), men default-brukeren av utkast-flyten er ikke en power-user — det er den som IKKE ble ferdig. Veiviseren støtter allerede edit-draft-modus (ReadyStep.resolveActions håndterer kind 'edit-draft'), så gjenbruk er teknisk innen rekkevidde.

**Bevis:** app/[locale]/admin/games/[id]/page.tsx:1067-1080 (draft-CTA → /edit); app/[locale]/admin/games/[id]/edit/page.tsx:271-284 (draft mounter GameForm, ikke GameWizard); GameWizard.tsx:27-31 (dokumentert valg #1061); ReadyStep.tsx:168-182 (resolveActions støtter allerede 'edit-draft')

**Forslag:** La draft-grenen på edit-siden mounte GameWizard med initialValues og mode 'edit-draft' (starter gjerne på steg 5 med utfylt summary), og behold GameForm kun for edit-scheduled. Diskuter med eier først — #1061 var et bevisst kutt, dette er en re-åpning av retningen for utkast-grenen spesifikt.

**Verifisering:** Verifisert: draft-CTA går til /edit (page.tsx:1067–1080) som mounter GameForm for drafts (edit/page.tsx:271–285), mens ReadyStep.resolveActions allerede støtter 'edit-draft' (:175–180). Avviket er et dokumentert bevisst valg (#1061, GameWizard.tsx:27–31) som funnet ærlig flagger som re-åpning med eier-diskusjon — beviset stemmer, ingen issue tracker endringen, og #1061 «fikset» ikke frikjonen for ikke-power-brukeren.

### F48 — Uleste-varsel i bunn-nav er kun en farge-prikk og er skjult for skjermlesere

**P3 · friksjon · `components/ui/BottomNav.tsx:119`**
*Prinsipp: 9241-110 selvbeskrivelse + tilgjengelighet (WCAG 1.1.1)* — *bok-tema: Alarm-filosofi*

Innboks-fanens uleste-indikator er en 8px champagne-prikk med aria-hidden, og fanens aria-label forblir bare «Innboks» uansett tilstand — skjermleserbrukere får aldri vite at noe venter; eneste måte å oppdage nye varsler på er å navigere inn i innboksen på måfå. Visuelt er signalet en liten #c9a961-prikk mot lys bakgrunn (~2:1-familien) — lett å overse i sollys. Selve alarm-filosofien er sunn (én stille prikk, ingen tall-badge, få kanaler), så dette er kun formidlingen av signalet, ikke mengden — og kontrasten til resten av komponenten (aria-current, aria-label på nav) viser at tilgjengelighet ellers er tenkt på her.

**Bevis:** components/ui/BottomNav.tsx:119–126 (dot med `aria-hidden` og `background: var(--accent)`), linje 111 (`aria-label={label}` statisk, uten uleste-tilstand), linje 66–67 (hasUnread beregnes via useUnreadNotificationsCount men brukes kun til dot-en — tellingen er allerede tilgjengelig i komponenten).

**Forslag:** Gjør aria-label tilstandsbevisst: `hasUnread ? t('inboxUnread') : t('inbox')` («Innboks, uleste meldinger», evt. med antall — tellingen finnes allerede). Vurder samtidig å gi prikken en tynn mørk kant eller bruke --accent-deep, så den også bærer i sollys — den har allerede border-2 border-bg som kan gjenbrukes.

**Verifisering:** Verifisert: BottomNav.tsx:119–126 har prikken med aria-hidden, :111 har statisk aria-label={label} uansett uleste-tilstand, og :66–67 viser at tellingen allerede er tilgjengelig i komponenten. #616 (lukket) bygget prikken bevisst uten tall-badge men adresserte aldri skjermleser-formidlingen. Riktig plassert som P3: sekundær flate, og visuell oppdagelse fungerer for seende brukere.

### F49 — Utstrakt 8–10px mikrotypografi (295 forekomster) som ikke skalerer med tekst-innstillinger

**P3 · friksjon · `components/ui/StatusChip.tsx:46`**
*Prinsipp: 9241-110 tilgjengelighet + lærbarhet* — *bok-tema: Design for stress*

Grep fant 295 forekomster av `text-[8–10px]` i 120 filer, konsentrert i leaderboard-/podium-/admin-flater: StatusChip er 9.5px uppercase, podium-etiketter 9px, LedgerHeader 9.5px, +N SLAG-badgen 9.5px. Alle er hardkodet i px (både arbitrary-verdier og inline `fontSize`), så nettleserens tekststørrelse-innstilling (som skalerer rem, ikke px) biter ikke — kun full sidezoom hjelper. Målgruppa inkluderer ikke-tekniske 60-åringer som leser resultater utendørs; 9px uppercase med 0.16em tracking er tungt selv innendørs. Mesteparten er sekundær-etiketter (derav P3), men volumet gjør det til et systemisk mønster snarere enn enkelttilfeller.

**Bevis:** Grep-count i økten: 295 treff på text-\[(8|9|10)(.x)?px\] i 120 filer under app/ + components/. Eksempler lest: components/ui/StatusChip.tsx:46 (text-[9.5px]), SoloStablefordPodium.tsx:323 (text-[9px]-etikett under vinnertallet), components/admin/LedgerHeader.tsx:32–35 (text-[9.5px]), components/ui/BrassRibbon.tsx:10 (text-[10px]), ScoreCard.tsx:189 (fontSize: 9.5).

**Forslag:** Sett et gulv på ~11px for tekst som bærer informasjon (chips med status, etiketter under tall) og la rene dekor-kickers ligge der de er. Lavthengende start: løft StatusChip og podium-/kicker-etikettene i kjerneløkkas resultatflater til 10.5–11px — de har plass, og uppercase+tracking gjør at én px monner mye. Full rem-migrering er ikke verdt det nå; dette er målrettet stell, ikke redesign.

**Verifisering:** Grep i økten reproduserte nøyaktig 295 treff i 120 filer for text-[8–10px]; stikkprøver bekreftet: StatusChip.tsx:46 (text-[9.5px] uppercase med 0.16em tracking, dokumentert som «stamp» i koden), ScoreCard.tsx:188–195 (fontSize: 9.5 på +N SLAG-badgen), BrassRibbon/LedgerHeader/podium-etikettene i grep-outputen. px-verdier skalerer ikke med nettleserens tekststørrelse-innstilling — påstanden er teknisk korrekt. Ingen issue funnet.

### F53 — Optimistiske innboks-handlinger og månedsbrev-bryteren feiler stille — UI viser suksess selv når lagringen aldri skjedde

**P3 · friksjon · `app/[locale]/innboks/actions.ts:66`**
*Prinsipp: 9241-110 feiltoleranse* — *bok-tema: Automasjons-transparens*

Marker-som-lest, marker-alle, arkiver, tøm-leste og månedsbrev-toggle oppdaterer lokal state optimistisk og fyrer server-action med `void` — uten feilhåndtering eller rollback. Feiler kallet (typisk offline, som er appens uttalte kontekst på banen) ser alt vellykket ut: kort forsvinner, prikken slukner, bryteren flipper — og alt spretter tilbake ved neste last uten forklaring. Verst er toggleProductUpdates som i tillegg ignorerer PostgREST-error fullstendig på selve update-en (0-row-skriv/RLS-fella som AGENTS.md trap 2 eksplisitt advarer mot): brukeren kan tro hen har meldt seg av månedsbrevet uten at det er lagret — et samtykke-signal som bør være pålitelig.

**Bevis:** app/[locale]/innboks/InboxClient.tsx:69-71, 84-89, 95-98, 102-106 (optimistisk setItems + `void`-ede actions uten catch/rollback); app/[locale]/innboks/actions.ts:65-72 (`await supabase.from('users').update(…)` — resultatet ignoreres, ingen error-sjekk, ingen expectAffected).

**Forslag:** Minst: sjekk error (+ radantall via expectAffected-helperen i lib/supabase/affectedRows.ts) i toggleProductUpdates og la bryteren rulle tilbake med en kort feilmelding. For innboks-handlingene: rull tilbake optimistisk state når action-promiset rejecter (catch i stedet for void), gjerne med en diskret «Fikk ikke lagret — prøv igjen»-linje.

**Verifisering:** Verifisert: InboxClient:69–71, 87–89, 96–98, 104–106 fyrer alle actions med void uten catch/rollback, og toggleProductUpdates (actions.ts:66–71) ignorerer PostgREST-resultatet fullstendig — ingen error-sjekk, ingen expectAffected (nøyaktig trap 2 i AGENTS.md). Funnet er dessuten sterkere enn beskrevet: server-helperne markRead.ts:50–53 og archive.ts svelger selv DB-feil (console.error + return), så selv en client-catch ville ikke sett dem. At «best-effort» er dokumentert design for after()-callsites refuterer ikke UX-problemet i den interaktive innboks-flyten.

---

## Anbefalt rekkefølge

Grensen i `docs/hva-er-nok.md` rammer ikke noe av dette (alt er stell), men
rekkefølge er et eierskapsvalg. Forslag, sortert etter effekt per innsats:

1. **De fem P1-ene** — hver av dem kan ødelegge en lørdag:
   - **F18** /approve-flight-filteret (peer-godkjenning umulig i enkelte formater)
   - **F17** avvist-scorekort-varsel som loves men ikke sendes
   - **F9** offline-blindveien ved hull-bytte/restart (prefetch-førstesteget er lite)
   - **F38** publiserings-feil som sletter hele veiviseren
   - **F45** fokusindikator 1.3:1 (én linje i `Button.tsx` + ring-token)
2. **Copy-som-lyver-fiksene** — én-linjes endringer med umiddelbar ærlighetsgevinst:
   F34, F41, F43, og minimums-varianten av F17. Passer `humanizer`-disiplinen.
3. **Sync-innsyn-pakka** — F25, F26, F27, F28, F29, F30, F50 hører naturlig sammen
   (samme filer: `syncWorker.ts`, `SyncBanner.tsx`, `realtimeChannel.ts`).
4. **Kontrast- og treffflate-pakka** — F33, F47, F12, F15, F8, F49 (+ F46, F48 for
   skjermleser-siden). Kan gjøres som én designgjennomgang av tokens + primitives.
5. **Resten av P2/P3** etter flyt-prioritet: lever/godkjenn-flyten (F19–F24) før
   veiviseren (F39–F44) før onboarding-detaljene (F1–F8) — lag-funnene (F1, F2, F5)
   kan vente til lag-påmelding får reell bruk (jf. #1069-parkeringen).

**Issues (oppdatert 2026-07-27, etter eier-beslutning i økten):** Alle funn er filet som GitHub-issues — **#1343–#1394** (52 stk., milestone «Backlog — uplanlagt / scale-triggered», labels `bug`/`enhancement` + `area:*`). F5 fikk ingen egen issue: den spores allerede i #1069 (kommentar med de ferske linjereferansene er lagt der). Se issue-indeksen nederst. Ingen kode er endret i denne PR-en.

**VERIFICATION GAP:** Funnene er verifisert mot koden (to uavhengige lesninger per
funn), men ikke klikket gjennom på staging i denne økten. Kontrastmålingene (F33,
F45, F47) er beregnet fra fargekodene i `globals.css`, ikke målt på skjerm. Hver
fiks som tas videre skal gjennom vanlig staging-verifisering før merge.

## Issue-indeks (F# → issue)

| Funn | Issue | Alvor | Tittel |
|---|---|---|---|
| F1 | #1343 | P2 | Lag-invitert kobles til nyeste lag i spillet — ikke laget som faktisk inviterte dem |
| F2 | #1344 | P2 | Profilporten mister /team-konteksten — ny medspiller havner i «registrer nytt lag»-skjemaet |
| F3 | #1345 | P2 | Feil-redirects i login-flyten mister next, e-post og invite — bruker kastes til start uten kontekst |
| F4 | #1346 | P2 | Ingen vei tilbake for å rette feilskrevet e-post på kodesteget |
| F5 | #1069 (eksisterende) | P3 | «Både solo og lag»-spill viser kun lag-skjema — solo-påmelding er umulig i UI-et |
| F6 | #1347 | P3 | Rate-limit-meldingen er ikke handlingsrettet — sier ikke hvor lenge man må vente |
| F7 | #1348 | P3 | Utløpt invitasjon håndheves ulikt: blokkerer kode-bestilling, men konsumeres ved innlogging |
| F8 | #1349 | P3 | «Send ny kode» har treffflate langt under 44px-kravet |
| F9 | #1350 | P1 | Offline er appen en blindvei ved hull-bytte og app-restart |
| F10 | #1351 | P2 | Avsluttet spill gir låst hull-side uten forklaring |
| F11 | #1352 | P2 | Hull-stripa viser «fullført» basert på posisjon, ikke på faktiske scorer |
| F12 | #1353 | P2 | Treffflatene i hull-stripa er 26 px brede — under appens egen 44 px-regel på samme skjerm |
| F13 | #1354 | P2 | Høye scorer (7–15 slag) mangler effektiv inntasting — arket dekker bare par±2 |
| F14 | #1355 | P3 | SyncBanner er halvveis oversatt — kø- og feilmeldingene hardkodet på norsk |
| F15 | #1356 | P3 | Treffflater under 44 px: putts-stepper (34×30) og onboarding-lukking (32×32) |
| F16 | #1357 | P3 | Score-arket flytter ikke fokus og mangler fokus-felle |
| F17 | #1358 | P1 | Avvist scorekort: appen lover «Spilleren blir varslet», men ingen varsel sendes |
| F18 | #1359 | P1 | /approve filtrerer på flight_number og skjuler kort du er attestant for — singles matchplay med peer-godkjenning kan aldri godkjennes av spillerne |
| F19 | #1360 | P2 | Arrangør-blindvei: «venter på godkjenning»-sperren på /avslutt peker ikke til godkjennings-overriden som finnes på /spillere |
| F20 | #1361 | P2 | Avslutnings-feil for oppretter forsvinner stille: ?error-redirects lander på /games/[id] som aldri rendrer error-parameteren |
| F21 | #1362 | P2 | Levert (og godkjent) scorekort kan ikke gjenåpnes av noen i creator-spill — copy sier «kan ikke angres uten admin» |
| F22 | #1363 | P3 | Gjenåpning av spill eller scorekort varsler ingen — spillere må selv oppdage at leveringen deres er nullstilt |
| F23 | #1364 | P3 | Norsk hardkodet i server-fallbacks: «Ingen grunn oppgitt» m.fl. vises uoversatt i engelsk locale |
| F24 | #1365 | P3 | «Godkjenn ✓» er ett tapp med scorekortet skjult bak sammenslått <details> — attestering uten å se det man attesterer |
| F25 | #1366 | P2 | Realtime dør stille etter token-utløp eller kanalfeil — ingen resubscribe, fallback eller ferskhetsindikator; leaderboard og medspiller-tall fryser |
| F26 | #1367 | P2 | Sync-motoren startes bare fra hull-siden — køen blir liggende urørt på iOS |
| F27 | #1368 | P2 | LWW-overskriving av score du tastet for en medspiller varsles aldri |
| F28 | #1369 | P2 | «Kunne ikke lagre N slag» — evig, ikke-avvisbar alarm uten hull-nummer eller handlingsvei |
| F29 | #1370 | P3 | Kø-status og submit-sperre teller slag på tvers av spill |
| F30 | #1371 | P3 | «Innloggingen er utløpt — logg inn på nytt» uten vei til innlogging |
| F31 | #1372 | P2 | Delt førsteplass framstilles som vinner + taper: podium og reveal hardkoder plassering etter listeindeks, ikke rank |
| F32 | #1373 | P2 | Spectate-siden viser lenker inn i innloggings-vegg: hull-for-hull-drilldown og CSV-eksport er blindveier for tilskuere |
| F33 | #1374 | P2 | Champagne-gull brukes som meningsbærende tekstfarge på lyse flater — målt ~2:1, verst i sollys på banen |
| F34 | #1375 | P3 | Låst back 9-copy lover åpning ved «levert og godkjent», men tavla åpner først når admin avslutter spillet |
| F35 | #1376 | P3 | Spectate lover «Følger live» med pulserende dot, men polling feiler stille og ingenting viser når tallene sist ble oppdatert |
| F36 | #1377 | P3 | Cup-siden: hardkodet norsk copy utenfor i18n, inkludert skrivefeilen «point» for «poeng» |
| F37 | #1378 | P3 | Liga-tabellen gjemmer sesong-totalen bakerst i horisontal scroll og forklarer aldri «–»-radene |
| F38 | #1379 | P1 | Server-feil ved publisering kaster arrangøren tilbake til en tom veiviser — all inndata tapt |
| F39 | #1380 | P2 | Tilbake-gest eller app-eviction midt i veiviseren sletter alt — history-oppførselen motsier egen dokumentasjon |
| F40 | #1381 | P2 | «Send på nytt» på utløpt invitasjon er en blindvei for mottakeren — og ventelisten skjuler utløpsstatus |
| F41 | #1382 | P2 | Runden starter seg selv ved tee-off, men admin-flaten sier det motsatte |
| F42 | #1383 | P3 | Reload midt i veiviseren gjenopptar på ?step=N med stille default-verdier |
| F43 | #1384 | P3 | «Lagre utkast»-knappen deaktiveres uten forklaring når navnet er tomt |
| F44 | #1385 | P3 | Utkast lages i veiviseren, men gjenopptas i et helt annet og tettere skjema-UI |
| F45 | #1386 | P1 | Fokusindikatoren er nesten usynlig (1.3:1) og native outline er fjernet app-vidt |
| F46 | #1387 | P2 | ScoreCard (kjerneflaten for slag-tasting) er ikke tastatur-operabel og har ugyldig ARIA-struktur |
| F47 | #1388 | P2 | Advarselstekst i warning-amber måler 2.1–2.4:1 på sine egne bakgrunner |
| F48 | #1389 | P3 | Uleste-varsel i bunn-nav er kun en farge-prikk og er skjult for skjermlesere |
| F49 | #1390 | P3 | Utstrakt 8–10px mikrotypografi (295 forekomster) som ikke skalerer med tekst-innstillinger |
| F50 | #1391 | P2 | Ventende og tapte slag er usynlige utenfor spill-sidene — SyncBanner er bare montert i games/[id]-layouten |
| F51 | #1392 | P2 | Innboksen svelger databasefeil og viser «Ingen nye varsler»-tomtilstanden i stedet |
| F52 | #1393 | P2 | Fantom-prikk i bunn-nav: skjulte stale påmeldings-varsler forblir uleste og kan aldri ryddes fra UI |
| F53 | #1394 | P3 | Optimistiske innboks-handlinger og månedsbrev-bryteren feiler stille — UI viser suksess selv når lagringen aldri skjedde |

## Kilder

- ISO 9241-210:2019 — Ergonomics of human-system interaction, Part 210:
  Human-centred design for interactive systems (prinsippene i §5–6).
- ISO 9241-110:2020 — Part 110: Interaction principles (dialogprinsippene).
- Bjørneseth, Johnsen, Alsos, Hepsø, Sætren (red.): *Safety by Design:
  Human-Centered Approaches to AI, Automation, and Remote Operations*, CRC Press
  2026, ISBN 9781041229728 / DOI 10.1201/9781003741824 (open access, CC BY 4.0).
  Innhold referert via forlagsomtale og omtaler (Maritime Executive 2026-06,
  oceanautonomy.no om meaningful human control, NTNU/SINTEF-rammeverkene CRIOP);
  selve PDF-en var utilgjengelig fra kjøremiljøets nettverkspolicy.
- `docs/audits/2026-05-11-design-consistency.md` og
  `docs/audits/2026-06-17-health-audit.md` — metode-presedens.
