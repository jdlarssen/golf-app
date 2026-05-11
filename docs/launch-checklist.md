# Tørny — lanseringsdag-sjekkliste

For deg som admin (Jørgen). Hold dette dokumentet åpent på telefonen din når dere skal kjøre runde.

## 📅 Dagen før runden

### Du som admin gjør

- [ ] Logg inn på `tornygolf.no` og bekreft at alt fungerer
- [ ] Sjekk at banen dere skal spille (Stiklestad eller Byneset) er korrekt registrert under Admin → Baner:
  - Par per hull stemmer med scorekortet
  - Stroke-indeks 1–18 brukt nøyaktig én gang
  - Tee-en dere skal spille fra har riktig slope/CR/par-total
- [ ] Send invitasjon til alle 7 kompiser via Admin → Invitasjoner
- [ ] Sjekk på telefonen din at PWA-en er installert på hjemskjermen (grønn T-rute)

### Kompisene gjør

- [ ] Klikker mail-lenken de fikk
- [ ] Fyller inn navn, kallenavn (valgfritt), HCP-index
- [ ] Installerer Tørny på hjemskjermen — gå til `tornygolf.no` i Safari (iPhone) eller Chrome (Android) → Del / meny → «Legg til på Hjem-skjerm» / «Installer app»
- [ ] Verifiserer at de kan logge inn (de får magic link på mail)

### Send denne meldingen i kompisgruppen kvelden før

> «Hei! Husk å logge inn i Tørny før i morgen — `tornygolf.no`. Klikk lenken jeg sendte på mail, fyll inn navnet + HCP, og installer appen på hjemskjermen. Vi setter opp lag og starter spillet før første tee.»

---

## ⛳ På klubbhuset — før første tee

### Opprett spillet

1. Som admin: gå til Admin → Spill → **+ Nytt spill**
2. Fyll inn:
   - **Navn:** f.eks. «Slaget om Stiklestad 17. mai»
   - **Bane:** velg riktig
   - **Tee:** velg riktig
3. Velg alle 8 spillere
4. Klikk **«Trekk tilfeldig»** for å sette lag (eller sett manuelt om dere har avtalt)
5. Sjekk flights — default er flight 1 (lag 1+2) og flight 2 (lag 3+4). Endre om dere går i andre konstellasjoner.
6. **HCP-allowance:** 100 (default)
7. **Peer-godkjenning:** av (default — dere stoler på hverandre)
8. Klikk **«Lagre og start»**

Spillet er nå aktivt. Hver spiller får en grønn «Pågående»-merket runde på hjemmesiden sin.

### Få alle inn i appen før første tee

- [ ] Hver spiller åpner Tørny på telefonen
- [ ] De ser «Test-runde Stiklestad» / hva dere kalte spillet under «Aktive spill»
- [ ] Klikker → de ser sin info (Lag X, Flight Y, Course Handicap Z)
- [ ] Klikker «Til hull 1 →»

### Si dette høyt før dere går ut

- «Tast inn alle slag fortløpende. Hvis dekningen ryker, fortsett — det lagres lokalt.»
- «Én person i flighten kan registrere for alle. Bare bli enige om hvem.»
- «Resultatet er hemmelig til vi er ferdige. Jeg trykker avslutt på 19. hull.»

---

## 🏌️ Under runden

### Hvis noe går galt

| Symptom | Hva du gjør |
|---|---|
| Spilleren får ikke logget inn | Sjekk at de bruker riktig mail. Send ny magic link via login-siden («Send meg lenke»). |
| Mailen kommer ikke | Sjekk spam-mappen. Hvis fortsatt ikke etter 2 min, prøv en gang til (Supabase rate-limit er ~30/time). |
| App-en henger | Lukk og åpne på nytt. Data er lagret lokalt — det er ingen risiko for tap. |
| Feil tall ble lagt inn | Hvem som helst i flighten kan rette ved å åpne hullet og endre. Endringen synker automatisk. |
| Telefon mister batteri | Ingen krise — andre i flighten har scoren. Når telefonen lades og logges inn på nytt, ser man alt igjen. |

### Hvis appen viser feilmeldinger

Ta skjermbilde og noter ned hva som skjedde. Ikke kast bort runden på debugging. Du kan rette via Supabase senere hvis nødvendig.

---

## 🏆 Etter siste hull — på 19. hullet

### Som admin

1. Vent til alle 8 har trykket **«Lever scorekort»** i appen. Du ser status per spiller på Admin → Spill → [ditt spill]
2. Når alle står på «✓ Levert»: scroll ned til **«Avslutt spillet»**-seksjonen
3. Klikk **«Avslutt spillet»** → bekreft i pop-up
4. Spillet får status «Avsluttet»
5. Si til kompisene: «Åpne Tørny nå!»

### Avsløring

Alle åpner appen samtidig. De ser nå:
- 🎉 Konfetti på leaderboard (første gang de åpner)
- 🥇 🥈 🥉 4. rangering
- Hver enkelt kan klikke **«Hull for hull»** for detaljert nedbryting

---

## 📞 Hvis alt går galt

Hvis appen er helt nede eller dere kan ikke logge inn av en eller annen grunn:

1. Spill runden på papir (gammeldags scorekort)
2. Etter runden, tast inn slagene i Tørny som admin via Supabase SQL Editor (Jørgen kan kontakte support hvis nødvendig)
3. Avslutt spillet i appen — leaderboard regnes ut korrekt fra dataene

**Backup-plan eksisterer alltid: dere er på en golfbane og kjenner reglene. Spille runden er det viktigste.**

---

## ✅ Sjekkliste-versjon (skriv ut og ta med)

**Før runden:**
- [ ] Bane verifisert
- [ ] 7 invitasjoner sendt
- [ ] Alle kompisene har installert appen
- [ ] Alle har testet innlogging

**På klubbhuset:**
- [ ] Spill opprettet med riktig bane og tee
- [ ] Lag trukket
- [ ] Flights satt
- [ ] Spillet startet
- [ ] Alle i flighten har åpnet hull 1 på telefonen

**Etter runden:**
- [ ] Alle har levert scorekortet
- [ ] Admin har trykket «Avslutt spillet»
- [ ] Leaderboard avslørt
- [ ] Vinner anerkjent 🍻
