# Tørny — TODO

Ting vi har identifisert men ikke prioritert for første lansering. Sortert etter type.

Når en post tas, flytt den til en commit-melding og fjern den fra denne listen.

---

## 🛠️ Funksjonelt — bør fikses før klubb-skala

### Hull-skjerm (oppfølging av quick-win-1)

- [ ] **Vis brutto OG netto på scorekortet, med E/−1/+1-delta mot par.** Golfere bryr seg om hvor mye de er over/under par, ikke bare det rå resultatet. To ting trengs: (1) delta mot par (`E`, `−1`, `+1`, `+2`…) må være synlig — bare rå resultat-tall er ikke nok; (2) både brutto og netto må eksponeres — enten via toggle mellom de to visningene, eller dual-display der begge vises samtidig. Implementasjon åpen (egen brainstorming når det er aktuelt). Persisterer evt. som `localStorage["torny-score-display"]` hvis toggle-løsning.
- [ ] **Per-bruker valg: vis navn eller nickname under runden.** Hver spiller velger selv i `/profile` om de vil vises med fullt navn eller nickname i flight/leaderboard/scorekort. I dag bruker hull-skjermen `nickname ?? name` hardkodet. Krever ny kolonne på `public.users` (`display_pref text not null default 'name' check (display_pref in ('name','nickname'))`), UI-toggle i `/profile`, og oppdatering av alle visninger som rendrer spillernavn (minst: hull-skjerm, scorekort, leaderboard, admin-spillerlister). **Nickname-alternativet skal være disablet/skjult i UI hvis brukeren ikke har satt nickname** — ingen skal kunne velge nickname-visning og deretter framstå som "(ingen)" eller fallback-flicker. Helper-tekst når disablet: «Legg til kallenavn for å bruke det som visningsnavn». Default-pref blir derfor `'name'` (sikker tilbakefall for alle).
- [ ] **Hull-navigasjon (perf) — neste steg etter v0.9.3 parallellisering.** Måling + parallellisering shipped 2026-05-13 (v0.9.2 instrumentering + v0.9.3 refactor) — fra 1.65s snitt til 440ms (–73%). Runde 1 (`games`, `allGamePlayers`, `scoreCount`) er nå flaskehalsen, varierer 150–700ms pga Supabase tail-latency. Gjenstående muligheter:
  - **Layout-lift**: flytt `game` + `game_players` til `app/games/[id]/layout.tsx` slik at hull-page-en kun trenger `hole` + `scores` per hull-bytte. Krever React.cache- eller unstable_cache-mønster med revalidering ved score-writes. Estimert –300ms til (snitt ~150ms). Moderat refactor-risiko.
  - **Single-page-architecture**: refaktorere så hele runden eies av én klient-shell som lastes én gang per game og bytter hull via client-state. Server gjør én stor fetch for hele runden, client håndterer hull-bytte i `useState`. Stor refaktor, stor gevinst.
  - **Pilot-instrumentering** (`console.time/timeEnd` i [app/games/[id]/holes/[holeNumber]/page.tsx](app/games/[id]/holes/[holeNumber]/page.tsx) og [app/games/[id]/page.tsx](app/games/[id]/page.tsx)) skal fjernes eller gates bak dev-flag når pilot-data er hentet. Se memory `project_active_perf_instrumentation`.

### Recovery / admin overrides

- [ ] UI for å slette et spill helt (ikke bare avslutte). I dag krever det rå SQL.
- [ ] **Endre e-post på registrert spiller fra admin** — krever service-role-pattern for `auth.admin.updateUserById` + samtidig oppdatering av `public.users.email`. Levert i v0.5.0–v0.7.1 dekker re-send / trekk tilbake / rediger navn-kallenavn-hcp / slett, men e-post-endring er fortsatt SQL-bare.
- [ ] **«Vis om brukeren har bedt om kode»** — auth-event-logg i Supabase eller egen kolonne `invitations.opened_at`. Nice-to-have for admin-feedback når en invitasjon henger.
- [ ] **Aktivitets-statistikk per spiller på `/admin/spillere/[id]`** — sist innlogget, antall spill, sist hcp. Nice-to-have for sosial-feel; krever auth-event-logg eller en `last_seen_at`-kolonne.
- [ ] **Arrangør-rolle** («turneringsadministrator»: kan opprette spill og baner, men ikke endre brukere; ser kun egne spill). Krever ny brainstorming-runde + RLS-revisjon på `games`, `game_players`, `courses`, `course_holes`, `tee_boxes`, `invitations`. Diskutert 2026-05-13; utsatt fra admin-spillere-leveransen for å holde scope.
- [ ] **Vis «Slettet spiller»-fallback i historiske leaderboards** — pågående backlog hvis vi senere bestemmer oss for soft-delete istedenfor blokk-if-game_players. I dag har vi block-pattern, så ikke aktuelt nå, men noter scenarioet.

### Privacy / GDPR

- [ ] «Slett konto»-knapp i profil-siden (sletter både `public.users` og `auth.users` for innlogget bruker)
- [ ] Eksporter alle mine data (GDPR Article 20). Lett: bygg en server-action som returnerer JSON med alt brukeren har i `users`, `game_players`, `scores`, `invitations`.

### Varslinger

- [ ] (Senere) push-varsler via Web Push API — krever VAPID-nøkler og service worker oppgradering
- [ ] **In-app innboks / varslings-senter** *(større feature — egen milestone)* — sentralisert flate der innloggede brukere ser invitasjoner til nye spill, godkjennings-forespørsler fra flight-medlemmer, runde-starter-snart-meldinger, scorekort-godkjent, og leaderboard-finished. Krever ny tabell (`notifications` med `user_id`, `type`, `payload jsonb`, `read_at`, `created_at`), realtime-push av nye varsler, UI-flate (header-ikon med badge + dropdown/side), read/unread-state, evt. push-notifikasjoner via Web Push. Avhenger av Phase E.5 (e-post-på-game-add) for den enkleste varseltypen — varselsystemet bør gjøre mer enn det e-post allerede gjør. Diskutert 2026-05-11; må gjennom egen brainstorming-runde for å designe varselstypene og prioriteringen.

---

## 🎨 Visuelt — design polish

### Ikoner og illustrasjoner

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
### Refaktorering (etter empty-states + scheduled-status-leveransen)

- [ ] **Extract `lib/games/status.ts`** — `GameStatus`-unionen og `STATUS_LABELS`-objektet er duplisert i 13 filer. Refaktoreres samtidig med M1-fargefiks (når design-handoff lander). Bør også gjøres for å forenkle fremtidige status-utvidelser.
- [ ] **Move RealtimeMount out of game layout** — i dag mounter `app/games/[id]/layout.tsx` `RealtimeMount` for alle game-statuser inkludert scheduled. Subscription er harmless (ingen events arriverer for scheduled siden ingen scores eksisterer + RLS blokkerer), men det er en idle WebSocket-subscription på hver venterom-besøk. Lav prioritet til vi vokser.

### Opprydning

- [ ] **Slett `app/auth/callback/route.ts`** etter 2026-06-13. Magic-link-URL-flyten ble retired 2026-05-13 til fordel for OTP-kode-innlogging; route-en redirecter alle gamle mail-klikk til `/login?error=link_expired` i en 30-dagers overgangsperiode. Etter datoen er det trygt å slette filen.

### Versjonering / release

- [ ] **Bump til `v1.0.0` — kriteriene er oppfylt 2026-05-13.** Vi står på `v0.10.2`. Alle tre opprinnelige krav er nådd: (a) invitasjons-status flippes korrekt til «Akseptert» når mottaker logger inn (v0.3.3, nå på `/admin/spillere` etter v0.6.0), (b) admin-smoke-test bestått på iOS PWA via OTP-kode (v0.4.0–0.4.1), (c) Supabase-cache-problem løst ved å bytte bort fra magic-link-URL helt. Brukeren venter med selve bumpet for å gjøre flere endringer først. Når klar: én MAJOR-bump med samle-CHANGELOG-entry «Første stabile release».

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

- [ ] **Players-first + valgbar spillmodus + variabel lagstruktur.** I dag er det hardkodet 4 lag × 2 spillere = nøyaktig 8 spillere, og spillformat låses til best-ball-netto ved create. Den riktige mentale modellen Jørgen vil ha (diskutert 2026-05-12): admin legger til spillere FØRST som rene checkboxer (ingen auto-tilordning til lag), velger deretter spillmodus, og DA presenteres lag/flight-strukturen som modusen krever — best-ball trenger 4×2, solo stableford ingen lag, scramble fritt antall per lag osv. Krever:
  - DB-migrasjon: `game_players.team_number` og `flight_number` blir nullable, ny kolonne `games.game_mode text` med enum-CHECK eller egen tabell
  - Validation: gamePayload.ts publish-mode må gate per game_mode istedenfor hardkodet 8-balanced
  - Scoring-abstraksjon: `lib/scoring/` får et mode-router-lag i front av bestBall.ts; nye moduler per format
  - UI-restruktur: GameForm splittes i seksjoner som rendres dynamisk per modus; auto-tilordnings-hack-en i `togglePlayer` (`nextAvailableTeam`) rives ut når dette lander
  - Bør tas som egen milestone med dedikert brainstorming og plan. Påvirker også «In-app innboks»-flyten (varseltype per modus). Jørgens kommentar 2026-05-12: «Vi skal være 8 spillere når vi skal spille, men det er ikke noe jeg ønsker å ha hardkodet.»
- [ ] **Forbedret spiller-picker i `/admin/games/new` og `/admin/games/[id]/edit`.** Når kompisgjengen vokser fra 8 til 100+ brukere blir den flate avhukingslisten i spill-opprettingen umulig å navigere. Trenger typeahead-input som tagger valgte spillere (chip-style UI), eller paginerte filtrerte resultater. (Admin-spillerlisten på `/admin/spillere` har allerede søk fra v0.6.0 — denne TODO-en gjelder kun pickeren i spill-opprett/-rediger-flyten.) Knyttet til klubb-skala-arbeidet. Diskutert 2026-05-12.

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

- [ ] **Biometrisk innlogging på telefon (Face ID / Touch ID / passkeys).** OTP-kode-flyten krever fortsatt bytte til mail-app → kopier kode → tilbake til PWA. Lavere friksjon enn magic-link, men ikke null. Mulige veier: (1) **WebAuthn / passkeys** (`navigator.credentials.create` + `get`) — passkey lagres i iCloud Keychain, fungerer på tvers av enheter, støttet i Safari 16+. Krever ny tabell `public.credentials` (`user_id`, `credential_id`, `public_key`, `counter`), server-actions for register/authenticate, integrasjon med Supabase Auth via custom JWT eller `signInWithIdToken`. Stor jobb. (2) **Lokal session-forlengelse**: vis biometrisk prompt for å låse opp en allerede lagret session i stedet for ny innlogging — enklere, men hjelper bare etter første OTP-runde. Diskutert 2026-05-12; trenger egen brainstorming.

---

## ✏️ Hvordan bruke denne lista

- Når du skal ta tak i en ting: kopier teksten til en commit-melding eller PR-tittel, fjern fra denne lista
- Når ny ting oppdages: legg til nederst i riktig seksjon
- Når en seksjon blir for lang: vurder å splitte ut til egen markdown-fil under `docs/`
