# UAT — Empty States + Scheduled Status

Stegvis sjekkliste for å verifisere hele leveransen i prod på [tornygolf.no](https://tornygolf.no). Krever to nettlesere/telefoner: én med admin-konto (Jørgen), én med en testspiller (eller bare et tomt sekundærvindu).

Sett av ~30 minutter. De fleste steg går raskt; flippen mellom rollene tar tid hvis du må logge ut og inn.

---

## 1. State #1 — Turneringer-tom (~5 min)

**Forutsetning:** en konto uten aktive eller avsluttede spill. Lag en ny via invitasjons-flyten, eller bytt midlertidig is_admin via Supabase MCP.

### Som ikke-admin

- [ ] Logg inn, lands på hjem-skjermen
- [ ] **Champagne-medaljong** med pin-flagg vises sentrert
- [ ] **«KLUBBHUSET ER ÅPENT»** i champagne uppercase (kicker)
- [ ] **«Velkommen, {fornavn}.»** med punktum (Fraunces serif, 30px)
- [ ] **Body-tekst**: «Du er klar. Admin setter opp neste runde.»
- [ ] **Ingen CTA** (kun for admin)
- [ ] Pull-quote: **«En god runde begynner med god planlegging.»** i kursiv
- [ ] Footer-linker: **Min profil** + **Logg ut** (begge ≥44px tap-target)

### Som admin

- [ ] Samme medaljong/kicker/heading
- [ ] **Body**: «Ingen turneringer enda. Sett opp første runde og kom i gang.»
- [ ] **Forest CTA**: «Opprett en turnering» → `/admin/games/new`
- [ ] Footer-linker: Min profil · Baner · Invitasjoner · Spill · Logg ut (alle ≥44px)

---

## 2. Admin publiser-flow (~5 min)

- [ ] **Admin → Spill → Nytt spill**
- [ ] Fyll ut navn, bane, tee-box, 8 spillere, lag (4 × 2), flighter, HCP-allowance
- [ ] **Nytt felt: «Tee-off»** — velg dato + klokkeslett (i nær framtid for å teste #3-flyten senere; eller noen minutter unna for å teste auto-start)
- [ ] **«Lagre og publiser»**-knappen er deaktivert til tee-off er satt
- [ ] Trykk **«Lagre og publiser»**
- [ ] Forventet: landa på `/admin/games/{id}?status=scheduled` med banner «✓ Spillet er publisert. Spillerne ser det nå i Mine spill.»
- [ ] Status-pille viser **champagne «Planlagt»** (eller amber, avhengig av side)

### Verifiser i database (valgfritt, via Supabase MCP)

- [ ] `games.status = 'scheduled'`
- [ ] `games.scheduled_tee_off_at` satt
- [ ] `games.started_at = null`
- [ ] `game_players.course_handicap = null` for alle spillere (handicaps fryses ved start, ikke publisering)

---

## 3. Spillerens venterom — State #2 (~5 min)

- [ ] Logg inn som en av spillerne på det publiserte spillet
- [ ] Hjem-skjermen viser spillet under **«Mine spill»** med **champagne «Planlagt»**-pille
- [ ] Tap på spillet → lander på venterom-skjermen:
  - [ ] **Mail-konvolutt-ikon** (forest stroke, champagne notifikasjons-prikk)
  - [ ] Kicker **«DU ER PÅMELDT»**
  - [ ] Heading **«Scorekortet åpner ved tee-off.»** (Fraunces 26px)
  - [ ] **Bane-kort**: banenavn + «18 hull · Par {N}» (+ « · {N} m» hvis lengde er satt på tee-boksen) | TEE-OFF + tid + dato
  - [ ] **DIN FLIGHT** med spillere: din egen rad har forest-avatar + champagne **«DEG»**-chip, andre har papir-disker med initial
  - [ ] **Forest countdown-banner** med pulserende champagne-prikk: «Starter om X t Y min»
  - [ ] Footer: «Vær på 1. tee 10 minutter før start.» (kursiv, ingen guillemets)

### Countdown-edge cases

- [ ] Lås telefonen 1 min, åpne igjen — countdown skal **oppdatere umiddelbart** (visibility-change listener)
- [ ] La spillet stå åpent til tee-off passerer — countdown skal vise **«Starter snart»**

---

## 4. Admin redigere et publisert spill (~3 min)

- [ ] Tilbake på admin-vinduet, gå til `/admin/games/{id}`
- [ ] **«Rediger spillet»**-kortet er synlig (kun for Planlagt)
- [ ] Trykk → lander på `/admin/games/{id}/edit`
- [ ] Banner: «Spillet er i planlagt-fasen. Spillerne ser endringene neste gang de åpner appen.»
- [ ] **Skjema pre-utfylt** med alle eksisterende verdier (incl. tee-off i Oslo wall-clock)
- [ ] Endre noe (f.eks. bytt ut en spiller)
- [ ] Trykk **«Lagre endringer»**
- [ ] Forventet: tilbake på `/admin/games/{id}?status=updated` med banner «✓ Endringene er lagret.»
- [ ] Spilleren refresher venterom → ser ny flight-konfigurasjon

---

## 5. State #3 — Leaderboard pre-spill (~3 min)

- [ ] Som spiller, tap **leaderboard**-linken (eller naviger til `/games/{id}/leaderboard`)
- [ ] **Timeglass-ikon** (forest stroke, champagne sand-trekant)
- [ ] Kicker **«STILLE FØR STORMEN»**
- [ ] Heading **«Første score forventet kl HH:MM.»** (= tee-off + 30 min, rundet til nærmeste 5 min)
- [ ] Body: «{N} lag er på vei ut. Tabellen våkner når første kort kommer inn.»
- [ ] Kicker **«STARTLISTE»**
- [ ] Lag-liste med rang, lag-navn («Lag 1»), spillernavn («Sindre · Erik»), TEE-tid
- [ ] Pull-quote: **«Lykke til.»**

---

## 6. Admin starter runden — realtime-flippen (~3 min)

### Mulighet A: manuell start

- [ ] La spillerens venterom stå åpent på telefon 1
- [ ] På admin-telefon: trykk **«Start runden nå»**
- [ ] Bekreft i `confirm()`-prompten
- [ ] Forventet: status flippes til `active`, handicaps fryses for alle spillere
- [ ] **Spillerens telefon skal automatisk flippe** fra venterom til normal aktiv-spill-side (via realtime). Hvis det henger: pull-to-refresh trigger sidelast → server-side guard fanger det.

### Mulighet B: auto-start fallback

- [ ] Lag et nytt spill med tee-off **5 min i fortiden**
- [ ] Som spiller, åpne spillet
- [ ] Forventet: status flippes automatisk via server-side guard (E1); banner viser `?status=started`. Sjekk Vercel logs hvis det hang seg — `[auto-start]`-meldinger logger feil.

### Verifiser

- [ ] `games.status = 'active'`, `started_at` satt
- [ ] `game_players.course_handicap` har integer-verdi for alle 8 spillere

---

## 7. Score-inntasting + State #3.5 leaderboard (~5 min)

- [ ] Som spiller, tast inn scores for **hull 1–9** for både deg og lagkameraten
- [ ] Tap på leaderboard → forventet:
  - [ ] **Champagne «FRONT 9»-pille** under header
  - [ ] Vanlig leaderboard-tabell med kun front 9-totaler
  - [ ] Lag som ikke er ferdig med front 9 viser «⚠️ N hull mangler»
  - [ ] **Låst back-9-blokk** nederst: krittstrek-ramme, **«🤫 Vi sees ved hull 18.»** + «Alle scorekort må være levert og godkjent før resten av tabellen vises.»
  - [ ] Pull-quote: «Lykke til.»
- [ ] Toggle **Netto / Brutto** — fungerer som i full-modus

### Hull-for-hull-visning under aktiv

- [ ] Tap **«Hull for hull →»** på leaderboarden
- [ ] **Champagne FRONT 9-pille** øverst
- [ ] Drilldown viser **kun hull 1–9**
- [ ] Låst back-9-blokk: «Hull 10–18 vises når alle scorekort er levert og godkjent.»

---

## 8. Avslutte runden (~3 min)

- [ ] Tast inn alle 18 hull for alle spillere
- [ ] Lever scorekort (alle 4–8 spillere)
- [ ] Godkjenn (hvis peer approval er på)
- [ ] Som admin, trykk **«Avslutt spillet»**
- [ ] Forventet: status → `finished`, banner «✓ Spillet er avsluttet. Leaderboard er åpen for alle.»
- [ ] **Leaderboard viser nå alle 18 hull** + konfetti
- [ ] Hull-for-hull-visningen viser også alle 18 hull (ingen låst blokk lenger)

---

## 9. Dark mode (valgfritt smoke-test)

Krever midlertidig redigering: i `app/layout.tsx:57`, endre `data-theme="light"` til `data-theme="dark"` (og redeploy, eller test lokalt). Husk å sette tilbake.

Sjekk:
- [ ] State #1 medaljong: dark forest radial-gradient
- [ ] Pin-flagg-stilken: cream (text-text), champagne-flagg uendret
- [ ] State #2 mail-konvolutt: forest-stroke med dark-forest interior (ikke glaring hvit boks)
- [ ] State #2 inaktive flight-avatarer: dempete forest-disker (ikke usynlige)
- [ ] Countdown-banner: dark-bg-tekst på sage primary
- [ ] State #3 timeglass: forest-stroke, champagne-sand
- [ ] State #3.5 låst back-9-blokk: synlig forest-panel (ikke gjennomsiktig)

---

## Backlog som ikke testes nå

Disse vil bli adressert senere — ikke en del av denne UAT-en:

- **Phase E.5** — e-postvarsling når admin legger spillere til et planlagt spill (planlagt, men ikke implementert)
- **Spillformat-fleksibilitet** — hardkodet 8 spillere er en kjent begrensning som krever egen brainstorming
- **Søkbar spillerliste** — for klubb-skala
- **Design-handoff fargefiks** — venter på neste design-pakke fra Claude Design
- **`data-theme="light"` hardkode** — hindrer ekte dark mode utenfor manuell testing

---

## Rapporter feil

Bruk **brand-stemme** og **norsk** når du beskriver oppførsel. For tekniske feil: lim inn Vercel-logger eller skjermbilder. For UX-friksjon: forklar hva du forventet å se vs hva du faktisk så.

Mistenker du realtime-feil: sjekk om `setAuth()` ble kalt (Vercel logs eller browser console) før du subscriber på en kanal.
