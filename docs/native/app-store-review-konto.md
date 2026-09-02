# App Store review-konto — oppsett og reset

Apple sine reviewere kan ikke motta OTP-kodene våre på mail, og App Store
Connect spør uansett etter et brukernavn/passord-par. Uten en konto de kommer
inn med, blir appen avvist på 2.1 («unable to review»). Derfor finnes én
dedikert konto med passord-innlogging, ferdig utfylte demo-data og en egen,
ulenket innlogging.

Bygget i #1284 (del 1). Skjermbilder, metadata og selve innsendingen ligger i
resten av #1284.

## Slik henger det sammen

| Del | Hvor | Hva den gjør |
|-----|------|--------------|
| Innloggingssida | `/review-login` (`/en/review-login` for engelsk) | E-post + passord. Ulenket, `noindex`. |
| Env-porten | `REVIEW_ACCOUNT_EMAIL` i Vercel | Er den ikke satt, svarer sida «finnes ikke». |
| Provisjonering | `scripts/provision-review-account.mjs` | Lager kontoen, demo-runden og medspillerne. |
| Arrangør-porten | `REVIEW_DEMO_ORGANIZER_EMAIL` (valgfri, kun når skriptet kjører) | Peker ut hvem demo-runden skal stå på når det ikke finnes nøyaktig én admin-konto. |

## Sikkerhetsmodellen

Én passord-inngang i en app som ellers kun bruker engangskoder er verdt å
være nøye med. Fire ting holder den trygg:

- **Bare én konto kan angripes.** Server-action-en sammenligner adressen mot
  `REVIEW_ACCOUNT_EMAIL` før den i det hele tatt spør Supabase. Alle andre
  adresser avvises uten et eneste auth-kall.
- **Ingen konto-orakel.** Feil adresse, ukjent konto og feil passord gir
  nøyaktig samme feilmelding. Ingen kan lese seg fram til hvilken adresse
  kontoen har.
- **Rate-limit.** Samme buckets som vanlig innlogging (5 forsøk per adresse
  og 10 per IP per kvarter), og de brukes opp FØR passordet sjekkes. Merk at
  bucketene kun dekker skjemaet vårt — den som kaller Supabase sitt
  `/token`-endepunkt direkte møter bare Supabase sine egne grenser. Derfor er
  passordstyrken (neste avsnitt) den bærende sperren, ikke rate-limiten.
- **Sida finnes ikke uten env-varen.** Fjerner du `REVIEW_ACCOUNT_EMAIL` i
  Vercel og deployer, er inngangen borte igjen.

Passordet skal være **minst 24 tegn**, tilfeldig generert, og bo nøyaktig to
steder: i Supabase (hashet) og i App Store Connect. Aldri i repoet, aldri i en
`.env`-fil som er sjekket inn, aldri i en logg.

## Førstegangs-oppsett i produksjon

Alle fire stegene gjør du selv. Steg 3 skriver til produksjonsdatabasen.

### 1. Lag passordet

Kjør lokalt i et terminalvindu og ta vare på det du får ut — det vises ikke
igjen:

```bash
LC_ALL=C tr -dc 'A-Za-z0-9!@#%^&*-_' < /dev/urandom | head -c 28; echo
```

### 2. Sett env-varen i Vercel

Gå til **Vercel → prosjektet `golf-app` → Settings → Environment Variables**.

- **Key:** `REVIEW_ACCOUNT_EMAIL`
- **Value:** `<review-epost>` (adressen kontoen skal ha — f.eks. en alias-adresse du selv styrer)
- **Environments:** kryss av for **Production**

Trykk **Save**. Gå så til **Deployments**, finn den øverste produksjons-
deployen, og velg **⋯ → Redeploy**. Vercel gir nye env-verdier til nye
deployer — uten redeploy blir varen liggende ubrukt.

**Forventet resultat:** `https://tornygolf.no/en/review-login` viser et skjema
med «Email» og «Password». Før redeployen (eller om varen mangler) svarer
adressen «Fant ikke siden». Ser du fortsatt den gamle 404-en, vent til
deployen står som Ready og last på nytt.

### 3. Provisjoner kontoen

Fra rota av repoet, med `.env.local` på plass (prod-nøklene):

```bash
source ~/.nvm/nvm.sh && nvm use 22
REVIEW_ACCOUNT_EMAIL='<review-epost>' \
REVIEW_ACCOUNT_PASSWORD='<passordet-fra-steg-1>' \
node scripts/provision-review-account.mjs --env prod
```

Skriptet printer hvilken Supabase-URL det skriver til før første skriv — les
den linja før du lar det gå videre. `--env prod` må stå der; uten flagget
kjører det mot staging.

Skriptet setter admin-kontoen din som arrangør av demo-runden og legger
review-kontoen inn som deltaker. Har du bare én admin-konto, finner det henne
selv. Har du flere (eller ingen), stopper det og ber deg si hvem det skal være:

```bash
REVIEW_DEMO_ORGANIZER_EMAIL='<din-admin-epost>' \
REVIEW_ACCOUNT_EMAIL='<review-epost>' \
REVIEW_ACCOUNT_PASSWORD='<passordet>' \
node scripts/provision-review-account.mjs --env prod
```

**Forventet resultat:** en oppsummering som slutter med «✅ Provisjonert.» og
linjene `Spill`, `Kortnavn`, `Arrangør`, `Spillere: 4`, `Scores: 21`. Feiler
noe, stopper skriptet med «❌» og en forklaring — ingenting er halvveis skrevet
ut over det som allerede står i loggen.

### 4. Legg inn i App Store Connect

**App Store Connect → appen → App Review Information**:

- **Sign-in required:** kryss av
- **User name:** `<review-epost>`
- **Password:** passordet fra steg 1
- **Notes:** lim inn malen nederst i dette dokumentet

## Reset før hver innsending — og etter hver review

**Revieweren kan slette review-kontoen.** Det er meningen: Apple krever
(5.1.1(v)) at sletting går an rett i appen, og fra #1909 slipper alle gjennom så
lenge de ikke arrangerer noe som pågår. Derfor er det admin-kontoen din som står
som arrangør av demo-runden, ikke review-kontoen — den er bare deltaker. Prisen
er at demo-runden ligger blant dine egne runder i appen. Det er en avtalt
kostnad, ikke en feil.

Kjør samme kommando som i steg 3 på nytt **før hver innsending, og etter hver
review der kontoen kan ha blitt slettet**:

```bash
source ~/.nvm/nvm.sh && nvm use 22
REVIEW_ACCOUNT_EMAIL='<review-epost>' \
REVIEW_ACCOUNT_PASSWORD='<passordet>' \
node scripts/provision-review-account.mjs --env prod
```

Kjøringen rydder opp etter alt revieweren kan ha gjort:

- **Slettet kontoen?** Adressen blir frigitt når kontoen anonymiseres, så
  kjøringen lager kontoen på nytt med samme adresse og setter passordet.
- **Står det en «Slettet bruker» igjen i runden?** Den raden fjernes. Etterpå er
  rosteret nøyaktig fire: review-kontoen, Emma, Jonas og Nora.
- **Spilt, levert eller trukket seg?** Scorene slettes og legges inn på nytt,
  runden settes tilbake til «pågår», og alle leveringer nullstilles.
- **Runden står på feil person?** Den flyttes til arrangøren. Det gjelder også
  gamle demo-runder som fortsatt står på review-kontoen.

Den slutter med «✅ Allerede provisjonert — resatt til frisk demo.» og en
`Arrangør`-linje som viser hvem runden står på. Les den linja — det er den som
avgjør om revieweren får slette kontoen sin.

Sender du inn med et nytt passord, må steg 4 gjøres om — App Store Connect
husker det gamle.

## Demo-dataene revieweren møter

- **Konto:** navn «Alex Reviewer» (fornavnet brukes i hilsenen på hjem-skjermen),
  handicap 18, engelsk UI (`locale = 'en'`).
- **Runde:** «Demo Round — Tørny», stableford, status «pågår», fire spillere i
  samme flight. Arrangert av admin-kontoen din — revieweren er deltaker, ikke
  arrangør.
- **Medspillere:** Emma, Jonas og Nora — gjestespillere uten innlogging, på et
  plassholder-domene uten MX. De kan aldri motta mail.
- **Scores:** medspillerne har spilt hull 1–6, kontoen selv hull 1–3. Revieweren
  fortsetter på hull 4 og ser et levende leaderboard med en gang.
- **Så langt går det:** taste slag, følge leaderboardet og **levere
  scorekortet**. Å avslutte hele runden er arrangørens knapp, og den ser
  revieweren ikke.
- **Slett konto:** «Account → Delete account» virker for denne kontoen. Brukes
  den, trekkes kontoen automatisk ut av runden, runden blir stående hos
  arrangøren, og neste kjøring av skriptet setter alt tilbake.

## Notes-mal til App Store Connect

Lim inn som den er, med adressen fylt inn:

```text
Tørny is a golf tournament app. Signing in normally uses a one-time code sent
by email, which is not practical for review, so we have prepared a dedicated
account with a password.

HOW TO SIGN IN
1. Open the app.
2. Navigate to: https://tornygolf.no/en/review-login
   (this is a direct password sign-in page for App Review; the app's normal
   sign-in screen uses email codes)
3. Enter the user name and password from the fields above.

WHAT YOU WILL SEE
The account plays in an active demo round ("Demo Round — Tørny") with three
co-players. Holes 1-6 are already scored for the co-players and holes 1-3 for
the review account, so you can continue on hole 4, watch the leaderboard update
and submit the scorecard. The round is hosted by a different account, so
closing the round itself is not part of this account's view.

FEATURES WORTH TESTING
- Account deletion: Account -> Delete account deletes this account from inside
  the app. It goes through; the account is withdrawn from the demo round
  automatically. You are signed out afterwards and these credentials stop
  working — that is the expected result, and we restore the account and the
  demo data before every submission.
- Offline scoring: enable Airplane Mode while entering scores on a hole. The
  scores are stored on the device and sync automatically once you go back
  online — no data is lost.
- Push notifications: the app asks for permission from the profile screen and
  sends native notifications when a co-player submits a scorecard.
- Universal links: opening a tornygolf.no link from Mail or Messages opens the
  app rather than Safari.

NO ACCOUNT NEEDED
The app also has a public demo at https://tornygolf.no/en/demo that requires no
sign-in, if you prefer to explore before signing in.

The account is for review only and contains no real player data.
```

## Hva som bevisst IKKE ligger i repoet

Repoet er public. Verken adressen eller passordet finnes her — begge leses fra
miljøet når skriptet kjører, og `REVIEW_ACCOUNT_EMAIL` settes i Vercel. Ser du
en konkret e-postadresse eller et passord i en fil under git, er det en feil
som skal fikses før neste push.

Skriptet skriver aldri passordet til skjermen eller til en logg — heller ikke
når noe går galt.
