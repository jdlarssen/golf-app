# Tørny — TODO

Ting vi har identifisert men ikke prioritert for første lansering. Sortert etter type.

Når en post tas, flytt den til en commit-melding og fjern den fra denne listen.

---

## 🛠️ Funksjonelt — bør fikses før klubb-skala

### Hull-skjerm (oppfølging av quick-win-1)

- [ ] **Netto/brutto-toggle på score-pillen.** I dag viser pillen brutto-delta mot par (Erik på par 3 med +1 slag og 4 brutto viser "+1"). Bør være konfigurerbart om man viser brutto-delta (`+1`) eller netto-delta (`E` for Eriks tilfelle siden 4 − 1 slag = par). Innstillingen skal ligge i samme settings-sheet som klikk-og-dra/buttons-toggle. Persisterer som `localStorage["torny-score-display"] = "gross" | "net"`. **Default: brutto** (bekreftet av Jørgen 2026-05-11 — netto er tilgjengelig for de som vil ha det, men brutto er det spilleren faktisk slo og er mindre forvirrende for nykommere).
- [ ] **Readability-audit i light mode**: nå som vi tvinger lys palett, gå gjennom alle flater og verifiser kontrast/lesbarhet. Konkret eksempel å starte med: hull-stripe-numrene for framtidige hull bruker `--text-muted` (#5C5347 på linen #F8F6F0) — passerer WCAG AA på tall men kan oppleves bleke. Sjekk også tournament-name-tekst i header som er muted-uppercase-tight, og evt. andre flater som tidligere lente seg på dark-mode-kontraster.
- [ ] **Per-bruker valg: vis navn eller nickname under runden.** Hver spiller velger selv i `/profile` om de vil vises med fullt navn eller nickname i flight/leaderboard/scorekort. I dag bruker hull-skjermen `nickname ?? name` hardkodet. Krever ny kolonne på `public.users` (`display_pref text not null default 'name' check (display_pref in ('name','nickname'))`), UI-toggle i `/profile`, og oppdatering av alle visninger som rendrer spillernavn (minst: hull-skjerm, scorekort, leaderboard, admin-spillerlister). **Nickname-alternativet skal være disablet/skjult i UI hvis brukeren ikke har satt nickname** — ingen skal kunne velge nickname-visning og deretter framstå som "(ingen)" eller fallback-flicker. Helper-tekst når disablet: «Legg til kallenavn for å bruke det som visningsnavn». Default-pref blir derfor `'name'` (sikker tilbakefall for alle).
- [ ] **Long-press i Safari highlighter tekst før sheet åpnes** — når du holder inne 500ms på et ScoreCard for å åpne specific-value-sheet, viser iOS sin native tekst-seleksjon midt i ventetiden (player-navnet eller helper-teksten blir blå-uthevet). `user-select: none` er satt, men iOS Safari trenger også `-webkit-user-select: none` og spesielt `-webkit-touch-callout: none` for å undertrykke long-press-callouten. Legg til begge på `<ScoreCard>` container-divet og verifiser på iPhone Safari.
- [ ] **Treg hull-navigasjon (perf)** — å trykke et hull i hull-stripa eller bunn-CTA-en føles tregt; generelt treig page-bytting. Hvert hull-bytte trigger nå: full server-component re-render → auth-check (cookies→getUser) → games-fetch → game_players-fetch med join → course_holes-fetch → scores-fetch → props-serialisering → HoleClient-hydrering → Dexie re-seed → useLiveQuery re-subscribe. Det er mye for å bare bytte fra hull 2 til 3. Mulige veier:
  - **Prefetch**: `next/link` prefetcher allerede når lenker er i viewport på hover/focus — verifiser at hull-stripa faktisk prefetcher (kan kreve `prefetch={true}` eksplisitt eller scroll-into-view-trigger).
  - **Single-page-architecture**: refaktorere så hele runden eies av én klient-shell som lastes én gang per game og bytter hull via client-state. Server gjør én stor fetch for hele runden (alle hull, alle scores), client håndterer hull-bytte i `useState`. Stor refaktor, stor gevinst.
  - **Mellomting**: behold per-hull-routes, men flytt data-fetching til en parent layout (`app/games/[id]/layout.tsx`) som lever på tvers av hull-byttene — slik at game/players/course bare hentes én gang.
  - Mål først: legg på `console.time` rundt server-fetchene og se hvor sekundene faktisk går (database, Supabase-runda, Vercel-cold-start, eller client-hydrering). Velg arkitektur etter målingene.

### Recovery / admin overrides

- [ ] UI for å «kansellere» en levering (admin reverserer `submitted_at` på en spiller). I dag krever det rå SQL.
- [ ] UI for å gjenåpne et avsluttet spill (sette status tilbake til `active`). I dag krever det rå SQL.
- [ ] UI for å slette et spill helt (ikke bare avslutte). I dag krever det rå SQL.

### Privacy / GDPR

- [ ] «Slett konto»-knapp i profil-siden (sletter både `public.users` og `auth.users` for innlogget bruker)
- [ ] Eksporter alle mine data (GDPR Article 20). Lett: bygg en server-action som returnerer JSON med alt brukeren har i `users`, `game_players`, `scores`, `invitations`.
- [ ] Persontvern-side på `/legal/privacy` med kort tekst om datalagring (Supabase EU-region, hvilke data vi har)

### Bedre feilmeldinger

- [ ] Sync-feil må surface bedre — i dag stille pause i kø, ingen brukerfeedback
- [ ] Manuel «Retry sync»-knapp hvis køen henger
- [ ] Banner som viser «X slag mangler synk» når køen er ikke-tom i mer enn 30 sekunder

### Varslinger

- [ ] Sende mail til alle spillere når admin trykker «Avslutt spillet» («Resultatet er klart!»)
- [ ] Sende mail til admin når en spiller leverer scorekort (slik at admin kan begynne å godkjenne)
- [ ] (Senere) push-varsler via Web Push API — krever VAPID-nøkler og service worker oppgradering
- [ ] **In-app innboks / varslings-senter** *(større feature — egen milestone)* — sentralisert flate der innloggede brukere ser invitasjoner til nye spill, godkjennings-forespørsler fra flight-medlemmer, runde-starter-snart-meldinger, scorekort-godkjent, og leaderboard-finished. Krever ny tabell (`notifications` med `user_id`, `type`, `payload jsonb`, `read_at`, `created_at`), realtime-push av nye varsler, UI-flate (header-ikon med badge + dropdown/side), read/unread-state, evt. push-notifikasjoner via Web Push. Avhenger av Phase E.5 (e-post-på-game-add) for den enkleste varseltypen — varselsystemet bør gjøre mer enn det e-post allerede gjør. Diskutert 2026-05-11; må gjennom egen brainstorming-runde for å designe varselstypene og prioriteringen.

---

## 🎨 Visuelt — design polish

### Ikoner og illustrasjoner

- [ ] Bedre app-ikon enn en flat serif T. Forslag: T med subtil tornado-spiral eller golf-flag-på-pin-silhuett bak.
- [ ] Flere tomstands-illustrasjoner (state #1 «ingen aktive spill» er gjort — ingen invitasjoner og evt. andre tomstander gjenstår)
- [ ] Subtile bakgrunnsillustrasjoner på leaderboard (klubbhus-vinje, fairway-silhuett)

### Animasjoner

- [ ] Bedre overgang mellom hull (i dag direkte navigasjon)

### Dark mode

- [ ] Dark-mode-tokens er definert i `app/globals.css`, men flatene er ikke verifisert i dark mode og noen ser halvferdige ut. Per 2026-05-11 tvinger `app/layout.tsx` light mode via `data-theme="light"` + `colorScheme: "light"`. Fjern tvangen og audit hver flate når dark mode skal aktiveres på ekte.

---

## ⚙️ Tekniske forbedringer

### Test-dekning

- [ ] E2E-test for hele invitasjons-flyten (ny bruker registrerer seg og spiller en runde)
- [ ] E2E-test for offline-sync (Playwright kan sjokke offline)
- [ ] Unit-tester for server actions (submitScorecard, approveScorecard, endGame, createGame)
- [ ] Pre-existing ESLint warnings i `components/IosInstallHint.tsx`, `app/games/[id]/leaderboard/LeaderboardConfetti.tsx`, `lib/scoring/integration.test.ts` — fix dem

### Refaktorering (etter empty-states + scheduled-status-leveransen)

- [ ] **Extract `lib/games/gamePayload.ts`** — `buildGameInsertPayload` og `parseOsloDateTimeLocal` er duplisert byte-for-byte mellom `app/admin/games/new/actions.ts` og `app/admin/games/[id]/edit/actions.ts`. Eksplisitt TODO-merke ligger allerede i edit/actions.ts. Risiko: fremtidige DST-fikser kan glipp ene kopien. 1-2 timers refaktor, lav risiko. Flagget i Phase G integration review 2026-05-12.
- [ ] **Extract `lib/games/status.ts`** — `GameStatus`-unionen og `STATUS_LABELS`-objektet er duplisert i 13 filer. Refaktoreres samtidig med M1-fargefiks (når design-handoff lander). Bør også gjøres for å forenkle fremtidige status-utvidelser.
- [ ] **Move RealtimeMount out of game layout** — i dag mounter `app/games/[id]/layout.tsx` `RealtimeMount` for alle game-statuser inkludert scheduled. Subscription er harmless (ingen events arriverer for scheduled siden ingen scores eksisterer + RLS blokkerer), men det er en idle WebSocket-subscription på hver venterom-besøk. Lav prioritet til vi vokser.
- [ ] **Discriminated-union refactor av GameForm props** — `createDraftAction`/`createAndPublishAction`/`editMode`/`updateAction` er alle optional i dag, med runtime-assertion som fail-on-render. Burde være discriminated union `{ mode: 'create' } | { mode: 'edit' }`. Foreslått under D4 quality review.

### Performance

- [ ] Bundle-størrelse — fjern Dexie hvis det er overkill (vi kan vurdere idb direkte)
- [ ] Image optimization for fremtidige illustrasjoner
- [ ] Realtime-subscription teardown ved app-bytte (i dag potensiell minne-lekkasje hvis bruker spammer fram og tilbake)

### Sikkerhet

- [ ] Rate-limiting på admin-invitasjons-endpoint (per IP, per admin)
- [ ] Audit-log for admin-handlinger (hvem avsluttet hvilket spill, hvem godkjente hvilken score)
- [ ] CAPTCHA på invitasjons-skjemaet hvis vi noensinne får spam-problem
- [ ] **Tighten `invitations select by token using (true)` policy** (`supabase/migrations/0002_rls_policies.sql`). I dag kan enhver innlogget bruker SELECTe alle rader i `public.invitations` — app-laget filtrerer på token, men det er ikke RLS-enforced. Vurder å bytte til `using (token = current_setting('request.jwt.claim.invite_token', true))` eller en SECURITY DEFINER RPC som tar token som arg.
- [ ] **Friend-invite metadata-pollution for `auth.users`-only kontoer.** `email_is_registered` RPC sjekker `public.users`, ikke `auth.users`. Hvis noen har startet magic-link-flow men aldri fullført `/complete-profile`, finnes de bare i `auth.users` — venneinvitasjon vil ikke blokkere, og `signInWithOtp` overskriver deres `user_metadata.inviter_name`. Lav prioritet; løsning krever ny SECURITY DEFINER RPC mot `auth.users`.

---

## 🚀 Vekst og skalering

### Spillformat-fleksibilitet *(blokkerer klubb-skala)*

- [ ] **Variabelt antall lag og spillere per lag.** I dag er det hardkodet 4 lag × 2 spillere = nøyaktig 8 spillere. Krever ny brainstorming: hvor mange lag støtter vi (2/3/4/fritt?), hvor mange per lag (2/variabelt?), single-player-modus («solo stableford»)? Påvirker DB-CHECKs (game_players.team_number, flight_number), GameForm-validering (teamsComplete, eightSelected), og scoring-laget (best-ball antar 2-spiller-lag). Bør tas som egen milestone med dedikert design-runde. Diskutert 2026-05-12; user kommentar: «Vi skal være 8 spillere når vi skal spille, men det er ikke noe jeg ønsker å ha hardkodet.»
- [ ] **Søkbar spillerlistor-UI.** Når kompisgjengen vokser fra 8 til 100+ brukere blir den flate avhukingslisten i admin-spilloppretting umulig å navigere. Trenger typeahead-input som tagger valgte spillere (chip-style UI), eller paginerte filtrerte resultater. Knyttet til klubb-skala-arbeidet. Diskutert 2026-05-12.

### Spillformater *(avhenger av spillformat-fleksibilitet over)*

- [ ] **Stableford** — i stedet for laveste sum, samle poeng per hull (par = 2, birdie = 3 osv.)
- [ ] **Texas scramble** — laget velger beste slag for hver shot, alle spiller derfra
- [ ] **Matchplay** — hull-for-hull seier mellom to lag/spillere
- [ ] **Solo-turnering** — ikke lag, hver spiller for seg
- [ ] **Ryder Cup-stil** — match mellom to grupper med flere kamper

### Tee-bokser

- [ ] Kjønn-tag på tee-bokser (`herretee`, `dametee`, `juniortee`) så herrer og damer kan spille fra ulike tees i samme spill med korrekt course handicap
- [ ] Flere enn 5 tee-bokser per bane (utvid `MAX_TEE_BOXES`)

### Klubb / multi-admin

- [ ] `groups`-tabell og `group_members` for å støtte flere uavhengige golfklubber/kompisgjenger
- [ ] Admin per gruppe (ikke globalt)
- [ ] Booking-integrasjon — koble til klubbens tee-time-system?

### App Store / Play Store

- [ ] React Native-versjon hvis PWA ikke er nok (gjenbruker Supabase-laget, men UI må skrives på nytt)
- [ ] App Store-godkjenning og brand-asset-pakke

### Resend-skalering

- [ ] Hvis vi krysser 100 mail/dag — oppgrader Resend til Pro (~20 USD/mnd)
- [ ] Custom domain ved Resend må kanskje vurderes på nytt for store volum

### Andre baner

- [ ] Massiv-import av norske golfbaner via NGF sin database (om de har et API)
- [ ] Crowdsourcet bane-data (brukere kan foreslå banes som admin godkjenner)

---

## 📊 Data og analyse

- [ ] Egen «historikk»-side per bruker: alle dine runder, average score over tid, beste runde
- [ ] Klubbstatistikker: vinneliste over tid, mest aktive spillere
- [ ] Eksporter resultater til Excel/PDF for å henge opp i klubbhuset

---

## 🌐 Internasjonalisering

- [ ] Engelsk versjon av all UI-tekst (klar for ekspansjon)
- [ ] Andre språk hvis vi noen gang treffer Sverige/Danmark/Finland
- [ ] Datoer og tallformat per locale

---

## 🐛 Kjente bugs / quirks

(Logg ting her etter hvert som de oppdages under bruk.)

- (Ingen kjente per d.d.)

---

## ✏️ Hvordan bruke denne lista

- Når du skal ta tak i en ting: kopier teksten til en commit-melding eller PR-tittel, fjern fra denne lista
- Når ny ting oppdages: legg til nederst i riktig seksjon
- Når en seksjon blir for lang: vurder å splitte ut til egen markdown-fil under `docs/`
