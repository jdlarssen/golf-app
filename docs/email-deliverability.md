# E-postlevering — runbook for Outlook/Hotmail-omdømme

**Issue:** [#319](https://github.com/jdlarssen/golf-app/issues/319) · **Sist oppdatert:** 2026-07-08

Denne runbooken samler alt du (Jørgen) trenger for å få Tørny-mail ut av
søppelposten hos Hotmail/Outlook.com. Alle stegene her gjøres manuelt i
tredjeparts-nettsider — det er ingen kode å endre. Hvert steg står i formen
**hvor / hva du gjør / hva du forventer å se / hva du gjør hvis det ikke ser
slik ut**, så du kan følge det uten å lese kode.

> **Kort oppsummert:** E-post-autentiseringen er teknisk riktig. Problemet er
> at `tornygolf.no` er et ungt domene med lavt, støtvis volum, og Microsoft
> straffer nye lavvolums-avsendere hardere enn Gmail. Løsningen er å bygge
> omdømme: melde domenet inn hos Microsoft, skru på DMARC-innsyn, og la de
> første mottakerne trene filteret. Dette tar uker, ikke minutter.

---

## 1. Diagnose — dagens tilstand

Verdiene under ble verifisert mot live DNS **2026-07-07** (issue #319 +
forge-kontrakten). Auth passerer på alle punkter unntatt DMARC-innsyn.

| Sjekk | Status | Verdi |
|---|---|---|
| SPF (Resend return-path) | ✅ | `send.tornygolf.no` → `include:amazonses.com ~all` |
| DKIM | ✅ | `resend._domainkey.tornygolf.no` har gyldig nøkkel |
| DMARC | 🟡 | `v=DMARC1; p=none;` — finnes, men **ingen `rua=`** (null innsyn) |
| Return-path MX | ✅ | `send.tornygolf.no` → `feedback-smtp.eu-west-1.amazonses.com` |

**Konklusjon:** Dette er **ikke** ødelagt konfig. SPF, DKIM og return-path er
korrekte. Det som mangler er (a) DMARC-innsyn (ingen `rua=`, så vi ser ikke hva
mottakerne rapporterer) og (b) avsender-omdømme hos Microsoft. Gmail rammes
ikke — dette er Microsoft-spesifikt.

> **Verifiser på nytt før du handler:** Sjekk gjerne verdiene på nytt (f.eks.
> [mxtoolbox.com](https://mxtoolbox.com/) → «DMARC Lookup» / «SPF Record
> Lookup» på `tornygolf.no`), i tilfelle noe har endret seg siden 2026-07-07.

> **Fortsatt savnet (henter innsikt hvis mulig):** `Authentication-Results` +
> `X-Microsoft-Antispam`/SCL-headeren fra en konkret Hotmail-søppelmail. Den
> avgjør om Microsoft feiler auth *i praksis* eller bare straffer omdømme. Åpne
> en Tørny-mail som havnet i søppelpost hos Hotmail → «Vis kildekode / View
> message source» → lim `Authentication-Results`- og `X-Microsoft-Antispam`-
> linjene inn i issue #319. Er ikke et krav for stegene under, men skjerper
> diagnosen.

---

## 2. DMARC-innsyn på (Domeneshop → DNS)

Dette er lav innsats og gir deg innsyn i hva mottakerne faktisk rapporterer.

- **Hvor:** Domeneshop → logg inn → «Mine domener» → `tornygolf.no` → «DNS».
- **Forutsetning (gjør dette FØRST):** Opprett e-postadressen
  `dmarc-reports@tornygolf.no` hos Domeneshop (Domeneshop → E-post). Uten en
  adresse som kan motta mail, bouncer rapportene og du får ingenting.
- **Hva du endrer:** Finn TXT-recorden for `_dmarc` (verten `_dmarc.tornygolf.no`)
  og bytt verdien til:
  ```
  v=DMARC1; p=none; rua=mailto:dmarc-reports@tornygolf.no; fo=1
  ```
- **Hva du forventer å se:** Etter lagring skal DNS-oversikten vise den nye
  verdien for `_dmarc`. Innen 1–2 døgn begynner aggregat-rapporter (XML-
  vedlegg) å tikke inn til `dmarc-reports@tornygolf.no` fra Google, Microsoft
  m.fl.
- **Hva du gjør hvis det ikke ser slik ut:** Får du ingen rapporter etter et par
  dager, sjekk (a) at `dmarc-reports@`-adressen faktisk mottar mail (send en
  test til den), og (b) at TXT-recorden er lagret på riktig vert (`_dmarc`, ikke
  roten). Ta skjermbilde av DNS-oppføringen og lim inn i issue #319.

> **`p=none` beholdes med vilje.** Vi observerer først, strammer senere. Å gå
> rett til `p=quarantine`/`p=reject` uten rene rapporter kan få legitim mail
> avvist. Stramming er et eget, senere steg (se «Senere arbeid» nederst).

---

## 3. Meld domenet inn hos Microsoft

Dette er tiltaket med størst effekt for et nytt domene. Du trenger **avsender-
IP-en** som mailen sendes fra. Den er en Amazon SES / Resend-IP.

- **Hvor finner du avsender-IP-en:** Resend-dashboard → «Logs» → åpne en sendt
  mail og se `sending IP`, eller kontakt Resend-support for IP-området deres
  (Resend sender via Amazon SES `eu-west-1`). SNDS jobber på IP-nivå, så du
  registrerer IP-en/IP-området, ikke domenet.

### 3a. SNDS — Smart Network Data Services

- **Hvor:** [sendersupport.olc.protection.outlook.com/snds](https://sendersupport.olc.protection.outlook.com/snds/)
- **Hva du gjør:** Registrer deg med en Microsoft-konto → «Request access» →
  legg inn avsender-IP-en/-området fra Resend/SES.
- **Hva du forventer å se:** SNDS gir deg innsyn i hva Microsoft ser fra den
  IP-en — klage-rate, spam-trap-treff, omdømme-farge (grønn/gul/rød).
- **Hva du gjør hvis det ikke ser slik ut:** Deler Resend en IP med mange andre
  avsendere, kan du få begrenset innsyn (du eier ikke IP-en). Da er JMRP (3b) +
  Deliverability-skjemaet (3c) viktigere. Noter i issue #319 hva SNDS viste.

### 3b. JMRP — Junk Mail Reporting Program

- **Hvor:** [sendersupport.olc.protection.outlook.com/pm](https://sendersupport.olc.protection.outlook.com/pm/)
- **Hva du gjør:** Registrer avsender-IP-en. JMRP sender deg en feedback-loop-
  varsel hver gang en Hotmail-bruker flagger en av dine mailer som søppel.
- **Hva du forventer å se:** En bekreftelse på registreringen, og deretter
  eventuelle varsler til en adresse du oppgir.
- **Hva du gjør hvis det ikke ser slik ut:** Samme IP-eierskaps-forbehold som
  SNDS. Er IP-en Resend/SES-eid, kan det hende Resend allerede er påmeldt JMRP
  på sin side — sjekk med Resend-support før du bruker tid på det.

### 3c. Outlook Deliverability Support — ferdig utkast

- **Hvor:** [Outlook.com Deliverability Support-skjema](https://sendersupport.olc.protection.outlook.com/pm/troubleshooting.aspx)
  («Contact us» / «Sender Information for Troubleshooting»).
- **Hva du gjør:** Lim inn utkastet under (juster IP/dato). Vær saklig og ærlig
  — ikke over-selg.
- **Hva du forventer å se:** Et saksnummer på e-post. Microsoft svarer typisk
  innen noen dager, ofte med en standard mitigering hvis auth er på plass.
- **Hva du gjør hvis det ikke ser slik ut:** Får du avslag med «not qualified
  for mitigation», er som regel årsaken lavt volum — da er tid + jevn sending +
  «ikke søppelpost»-treningen (steg 5) den eneste kuren. Ikke send skjemaet på
  nytt i tide og utide; det hjelper ikke omdømmet.

**Utkast til henvendelse (kopier-lim, juster [IP] og [dato]):**

```
Subject: Deliverability review request — tornygolf.no (legitimate low-volume transactional sender)

Hello,

We operate tornygolf.no, a small golf-tournament web app for a hobby
community. Our transactional email (login codes, tournament invitations and
result notifications) is sent from noreply@tornygolf.no via Amazon SES /
Resend, sending IP [IP].

Our authentication is correctly configured and passes:
  - SPF: send.tornygolf.no includes amazonses.com
  - DKIM: resend._domainkey.tornygolf.no is signed and valid
  - DMARC: published at _dmarc.tornygolf.no (p=none with aggregate reporting)

Despite passing authentication, our mail is frequently filtered to the Junk
folder for Outlook.com/Hotmail recipients (Gmail is not affected). We believe
this is a sender-reputation issue for a young, low-volume domain rather than a
configuration problem. All our mail is solicited and transactional — recipients
either requested a login code or were personally invited by another user.

We would appreciate a review of our sending reputation and any mitigation you
can offer. We are registered with SNDS and JMRP for the sending IP.

Thank you,
Jørgen — tornygolf.no
```

---

## 4. List-Unsubscribe — allerede levert (ingen handling)

Akseptansekriterium #3 i issuet (List-Unsubscribe-header) er **allerede oppfylt
i koden** — ingen ny header skal legges til.

- **Hvor:** `lib/mail/productUpdateDigest.ts` (linje 174–178) setter både
  `List-Unsubscribe: <…>` og `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
  (RFC 8058 ett-klikks-avmelding) på produkt-oppdaterings-digesten.
- **Lås:** Testen `lib/mail/productUpdateDigest.test.ts` (blokka «inkluderer
  List-Unsubscribe + List-Unsubscribe-Post headere (RFC 8058)») verifiserer at
  begge headerne er tilstede med riktige verdier, og en egen test låser
  URL-encoding av tokenet. Fjernes headerne, blir testen rød.
- **Hvorfor bare digesten:** `productUpdateDigest.ts` er den eneste ekte
  bulk-mailen. Transaksjonsmail (invitasjon + innloggingskode) får **ikke**
  List-Unsubscribe med vilje: det finnes ingen avmeldings-infrastruktur for
  konto-løse invitéer, og en engangs-invitasjon kan man ikke melde seg av. Å
  sette headeren uten et fungerende avmeldings-endepunkt er verre enn å la være.

Microsoft (og Gmail/Yahoo) vekter ett-klikks-avmelding positivt for omdømme, så
dette bidrar allerede i riktig retning på bulk-mailen.

---

## 5. La de første mottakerne trene filteret

Microsoft tilgir tregere enn Gmail, men positive signaler fra ekte mottakere
teller mye for et ungt domene.

- **Hva du gjør:** Be tidlige Hotmail/Outlook-mottakere om å:
  1. Merke Tørny-mailen som **«Ikke søppelpost»** (flytt den ut av søppel-
     mappen — det sender et positivt signal til Microsoft).
  2. Legge `noreply@tornygolf.no` til som **trygg avsender** (Outlook →
     Innstillinger → Søppelpost → Trygge avsendere).
- **Hva du forventer å se:** Over uker, ettersom volum av «ikke søppelpost»-
  signaler bygger seg opp, faller andelen som havner i søppel. Ingen umiddelbar
  effekt — dette er en glidende forbedring.
- **Hva du gjør hvis det ikke ser slik ut:** Kombinér med DMARC-rapportene
  (steg 2) og SNDS (steg 3a) for å se om det er auth-feil i praksis, ikke bare
  omdømme. Auth-feil krever konfig-fiks; omdømme krever tid.

---

## 6. Content-hygiene — gjennomgang av invitasjons-mailen

Issuet (item #4) ba om en phishing-tell-gjennomgang av invitasjons-mailen, fordi
«du er invitert + trykk her»-formen er noe phishing-filtre er skeptiske til.

**Gjennomgang utført 2026-07-08 mot `lib/mail/inviteNotification.ts` +
`messages/no.json`:**

| Phishing-tell | Funn | Vurdering |
|---|---|---|
| Tynn tekst + stor knapp | Nei | Mailen har heading, intro-linje («{navn} har invitert deg …»), en «for å komme i gang»-linje, footer-disclaimer OG en knapp — balansert tekst/HTML-forhold, ikke bare en knapp. |
| Manglende avsender-kontekst | Nei | Inviterens navn står i intro-linja OG i footer-disclaimeren («Har du ikke en golfvenn ved navn {navn}? Ignorer denne meldingen»). Personlig kontekst er til stede. |
| URL-shortener | Nei | Alle lenker peker direkte til `tornygolf.no/login` — ingen shortener. |
| Lenketekst ≠ href | Nei | Lenketeksten er «tornygolf.no» og href-en er `tornygolf.no/login?email=…` — samme domene, ingen mismatch. Knappen peker til samme URL. |

**Konklusjon: ingen phishing-tell funnet — ingen kode- eller copy-endring
gjøres.** Invitasjons-mailen er allerede content-hygienisk ryddig. #318
(innloggingskode i selve invitasjons-mailen) ble satt til side, så den
forsterkningen issuet fryktet lander aldri.

> **Bevisst utelatt:** Vi legger **ikke** en oppdiktet fysisk postadresse i
> footeren. Tørny er en solo-drevet app uten organisasjon — en oppdiktet
> adresse er en ny tell, ikke en kur. Avsender-konteksten dekkes allerede av
> inviterens navn + brand-footer.

---

## 7. Eier-sjekkliste (manuelt)

Kort huskeliste — hvert punkt er beskrevet over.

- [ ] Opprett `dmarc-reports@tornygolf.no` hos Domeneshop (E-post).
- [ ] Bytt `_dmarc.tornygolf.no` TXT-record til
      `v=DMARC1; p=none; rua=mailto:dmarc-reports@tornygolf.no; fo=1` (Domeneshop → DNS).
- [ ] Hent avsender-IP fra Resend-dashboard (Logs).
- [ ] Registrer avsender-IP i Microsoft **SNDS**.
- [ ] Registrer avsender-IP i Microsoft **JMRP**.
- [ ] Send **Outlook Deliverability Support**-skjemaet (utkast i steg 3c).
- [ ] Sjekk Resend-dashboard: er domenet fullt verifisert? Hvordan er
      bounce-/complaint-raten? (Høy bounce/complaint skader omdømme.)
- [ ] Be tidlige Hotmail-mottakere merke «Ikke søppelpost» + trygg avsender.
- [ ] (Hvis mulig) Hent `Authentication-Results` + `X-Microsoft-Antispam` fra en
      Hotmail-søppelmail og lim inn i issue #319.

---

## Senere arbeid (ikke i denne omgangen)

- **DMARC-stramming:** Når `rua`-rapportene er rene (ingen legitim mail feiler),
  stram gradvis: `p=none` → `p=quarantine` → `p=reject`. Egen oppgave, avhengig
  av rene rapporter først.
- **List-Unsubscribe på transaksjonsmail:** Bevisst utelatt — krever en
  avmeldings-infrastruktur for konto-løse invitéer som ikke finnes i dag.
