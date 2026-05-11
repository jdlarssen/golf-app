# Tørny — TODO

Ting vi har identifisert men ikke prioritert for første lansering. Sortert etter type.

Når en post tas, flytt den til en commit-melding og fjern den fra denne listen.

---

## 🛠️ Funksjonelt — bør fikses før klubb-skala

### Hull-skjerm (oppfølging av quick-win-1)

- [ ] **Netto/brutto-toggle på score-pillen.** I dag viser pillen brutto-delta mot par (Erik på par 3 med +1 slag og 4 brutto viser "+1"). Bør være konfigurerbart om man viser brutto-delta (`+1`) eller netto-delta (`E` for Eriks tilfelle siden 4 − 1 slag = par). Innstillingen skal ligge i samme settings-sheet som klikk-og-dra/buttons-toggle. Persisterer som `localStorage["torny-score-display"] = "gross" | "net"`. Default: TBD (sannsynligvis netto siden det er det som faktisk teller for scoringen).
- [ ] **Readability-audit i light mode**: nå som vi tvinger lys palett, gå gjennom alle flater og verifiser kontrast/lesbarhet. Konkret eksempel å starte med: hull-stripe-numrene for framtidige hull bruker `--text-muted` (#5C5347 på linen #F8F6F0) — passerer WCAG AA på tall men kan oppleves bleke. Sjekk også tournament-name-tekst i header som er muted-uppercase-tight, og evt. andre flater som tidligere lente seg på dark-mode-kontraster.
- [ ] **Per-bruker valg: vis navn eller nickname under runden.** Hver spiller velger selv i `/profile` om de vil vises med fullt navn eller nickname i flight/leaderboard/scorekort. I dag bruker hull-skjermen `nickname ?? name` hardkodet. Krever ny kolonne på `public.users` (`display_pref text not null default 'nickname' check (display_pref in ('name','nickname'))`), UI-toggle i `/profile`, og oppdatering av alle visninger som rendrer spillernavn (minst: hull-skjerm, scorekort, leaderboard, admin-spillerlister). Hvis bruker har valgt nickname men ikke fyllt det inn → fall tilbake til navn.

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

---

## 🎨 Visuelt — design polish

### Flatene som mangler design-løft etter Phase 12.5

Hovedflater (login, hjem, hull, leaderboard, admin-detalj) fikk premium-behandling. Disse står igjen:

- [ ] `/games/[id]/scorecard` — Mitt scorekort
- [ ] `/games/[id]/submit` — Gjennomgå før levering
- [ ] `/games/[id]/approve` — Peer-godkjenning
- [ ] `/games/[id]/leaderboard/holes` — Hull-for-hull-drilldown
- [ ] `/complete-profile` — Ny bruker fyller inn
- [ ] `/profile` — Eksisterende bruker redigerer
- [ ] `/admin/courses` (liste, ny, rediger)
- [ ] `/admin/invitations`
- [ ] `/admin/games` (liste, ny)

Plan: kjør disse gjennom Claude Design ([claude.ai/design](https://claude.ai/design)) med design system som er etablert.

### Ikoner og illustrasjoner

- [ ] Bedre app-ikon enn en flat serif T. Forslag: T med subtil tornado-spiral eller golf-flag-på-pin-silhuett bak.
- [ ] Tomstands-illustrasjoner (f.eks. ingen aktive spill, ingen invitasjoner)
- [ ] Subtile bakgrunnsillustrasjoner på leaderboard (klubbhus-vinje, fairway-silhuett)

### Animasjoner

- [ ] Bedre konfetti-animasjon på leaderboard — i dag er det funksjonelt men ikke premium
- [ ] Subtle skeleton-loading mens man venter på server-data (i dag er det rene blank states)
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

### Performance

- [ ] Bundle-størrelse — fjern Dexie hvis det er overkill (vi kan vurdere idb direkte)
- [ ] Image optimization for fremtidige illustrasjoner
- [ ] Realtime-subscription teardown ved app-bytte (i dag potensiell minne-lekkasje hvis bruker spammer fram og tilbake)

### Sikkerhet

- [ ] Rate-limiting på admin-invitasjons-endpoint (per IP, per admin)
- [ ] Audit-log for admin-handlinger (hvem avsluttet hvilket spill, hvem godkjente hvilken score)
- [ ] CAPTCHA på invitasjons-skjemaet hvis vi noensinne får spam-problem

---

## 🚀 Vekst og skalering

### Spillformater

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
