# App Store review-konto — oppsett og reset

Apple sine reviewere kan ikke motta OTP-kodene våre på mail, og App Store
Connect spør uansett etter et brukernavn/passord-par. Uten en konto de kommer
inn med, blir appen avvist på 2.1 («unable to review»). Derfor finnes én
dedikert konto med passord-innlogging, ferdig utfylte demo-data og en egen,
skjult inngang i appen.

**Fra #2561 finnes én konto per butikk.** Apple-revieweren skal kunne slette
kontoen (5.1.1(v)), mens Google krever at innloggingen virker til enhver tid, og de
to vurderingene kan gå samtidig. Apple-kontoen og Google-kontoen har hver sin
adresse, sitt eget passord og sin egen demo-runde. Skriptet velger med
`--store apple` (standard) eller `--store google`.

Bygget i #1284 (del 1) for skallet. Fra N8 (#1954, P1b) er det native-appen som
sendes inn, og inngangen revieweren bruker er langtrykket på innloggingsskjermen
beskrevet under — ikke lenger nettsida `/review-login` (den består, men er
webbens egen).

## Slik henger det sammen

| Del | Hvor | Hva den gjør |
|-----|------|--------------|
| Inngangen i appen | Innloggingsskjermen: hold overskriften («Tørny») inne i 1,5 s | Et passordfelt og knappen «Logg inn med passord» dukker opp under e-postfeltet. Ingen synlig lenke, ingen env-gate. |
| Innloggingssida (web) | `/review-login` (`/en/review-login` for engelsk) | E-post + passord. Ulenket, `noindex`. Gjelder nettsida, ikke app-innsendingen. |
| Env-porten (web) | `REVIEW_ACCOUNT_EMAIL` i Vercel | Er den ikke satt, svarer web-sida «finnes ikke». Appen har ingen slik port — se sikkerhetsmodellen. |
| Provisjonering | `scripts/provision-review-account.mjs [--store apple\|google]` | Lager kontoen, demo-runden og medspillerne for én butikk. Apple: `REVIEW_ACCOUNT_EMAIL`/`REVIEW_ACCOUNT_PASSWORD` og «Demo Round — Tørny». Google: `REVIEW_ACCOUNT_EMAIL_GOOGLE`/`REVIEW_ACCOUNT_PASSWORD_GOOGLE` og «Demo Round (Google Play) — Tørny». Samme adresse for begge stopper skriptet. |
| Arrangør-porten | `REVIEW_DEMO_ORGANIZER_EMAIL` (valgfri, kun når skriptet kjører) | Peker ut hvem demo-runden skal stå på når det ikke finnes nøyaktig én admin-konto. |

## Sikkerhetsmodellen

Én passord-inngang i en app som ellers kun bruker engangskoder er verdt å
være nøye med. Appen og nettsida har ulike forsvar, fordi de har ulike
forutsetninger.

**I appen** finnes det ingen adresse-port: `REVIEW_ACCOUNT_EMAIL` bakes ikke inn
i bundelen (det ville vært å publisere adressen til alle som pakker ut appen),
og et butikk-bygg kan ikke slås av med en env-var. Inngangen kaller derfor
Supabases `/auth/v1/token?grant_type=password` rett fram, og sperren er den samme
som alt gjelder for den som kaller det endepunktet direkte:

- **Bare review-kontoen har passord.** Alle andre kontoer er OTP-only; uansett
  hva som tastes svarer Supabase `invalid_credentials` for dem.
- **Passordstyrken er den bærende sperren.** Minst 24 tegn, tilfeldig generert
  (steg 1 under). Supabases egen rate-limit på `/token` kommer i tillegg.
- **Ingen konto-orakel.** Feil adresse, konto uten passord og feil passord gir
  nøyaktig samme melding i appen: «Feil e-post eller passord.» Aldri Supabases
  egen tekst.
- **Inngangen kan ikke opprette kontoer.** `signInWithPassword` gjør det aldri.
  Kode-veien lager kontoer med nettsidens sperrer (#2216), men den er ikke en del
  av passord-inngangen.
- **Skjult, ikke hemmelig.** Langtrykket er der for at skjermen ikke skal ha en
  synlig «passord»-lenke ingen spillere trenger. Det er ikke en del av
  sikkerheten — de fire punktene over er.

**På nettsida** står de fire opprinnelige sperrene: server-action-en
sammenligner adressen mot `REVIEW_ACCOUNT_EMAIL` før den spør Supabase, samme
feilmelding uansett årsak, samme rate-limit-buckets som vanlig innlogging (5
forsøk per adresse og 30 per IP per kvarter), og sida finnes ikke uten
env-varen.

Passordet skal være **minst 24 tegn**, tilfeldig generert, og bo bare der det trengs:
i Supabase (hashet), i nøkkelringen på eierens Mac, og i butikken kontoen hører til
(App Store Connect for Apple-kontoen, Play Console for Google-kontoen). Aldri i repoet,
aldri i en `.env`-fil som er sjekket inn, aldri i en logg, aldri i appen.

## Førstegangs-oppsett i produksjon

**Hvem gjør hva (#2561):** orkestratoren gjør steg 1 og 3 på eierens Mac, og eieren
gjør steg 2 og 4 i nettleseren. Steg 3 skriver til produksjonsdatabasen.

**Hvor adressene og passordene ligger:** i nøkkelringen på eierens Mac, aldri i repoet,
på GitHub eller i en logg. Ett element per butikk, med adressen i feltet «Konto» og
passordet som passord:

| Butikk | Element i nøkkelringen | Feltet «Konto» | Passordet |
|---|---|---|---|
| Apple | `torny-review-apple` | adressen til Apple-kontoen | passordet til Apple-kontoen |
| Google | `torny-review-google` | adressen til Google-kontoen | passordet til Google-kontoen |

Kommandoene under leser dem derfra, så en tilbakestilling bruker alltid det passordet
som står i butikken.

### 1. Lag passordene og legg dem i nøkkelringen

Én gang per butikk (her Apple; bytt `apple` med `google` for Google-kontoen). Adressen
er en alias-adresse eieren styrer:

```bash
security add-generic-password -s torny-review-apple -a '<review-epost>' \
  -w "$(LC_ALL=C tr -dc 'A-Za-z0-9!@#%^&*-_' < /dev/urandom | head -c 28)"
```

Passordet vises ikke. Eieren trenger det for å lime det inn i butikken (steg 4) og
henter det selv i appen **Nøkkelringtilgang**:

1. Trykk ⌘ og mellomrom (Spotlight), skriv «Nøkkelringtilgang» og trykk Enter.
2. Skriv `torny-review-apple` i søkefeltet øverst til høyre, og dobbeltklikk på raden.
3. Adressen står i feltet **«Konto»**.
4. Huk av for **«Vis passord»** og skriv Mac-passordet ditt. Da vises passordet.

Ingen av delene sendes i chatten.

### Første kjøring etter #2561 (engangssteg)

Apple-kontoen finnes alt i prod, med passordet fra innsendingen av 1.1.0 (3). Skriptet
beholder passordet til en konto som finnes, så første kjøring må bytte det til det nye i
nøkkelringen: orkestratoren kjører kommandoen i steg 3 med `--rotate-password` lagt til,
og eieren limer det nye passordet inn i App Store Connect (App Review Information og
TestFlight → Test Information). Det samme gjelder Google første gang. Finnes ikke
kontoen, lages den med passordet fra nøkkelringen, og flagget gjør ingen forskjell.
Etter første kjøring brukes flagget aldri, med mindre passordet skal byttes med vilje.

### 2. Sett env-varen i Vercel (kun for web-sida)

Appen trenger ikke dette steget. Skal `/review-login` på nettsida virke, gå til
**Vercel → prosjektet `golf-app` → Settings → Environment Variables**.

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

Fra rota av repoet, med `.env.local` på plass (prod-nøklene). Begge adressene settes
alltid, så skriptet kan stoppe hvis de to butikkene har samme adresse:

```bash
source ~/.nvm/nvm.sh && nvm use 22
kc_pass() { security find-generic-password -s "$1" -w; }
kc_addr() { security find-generic-password -s "$1" | awk -F'"' '/"acct"/ {print $4}'; }
REVIEW_ACCOUNT_EMAIL="$(kc_addr torny-review-apple)" \
REVIEW_ACCOUNT_PASSWORD="$(kc_pass torny-review-apple)" \
REVIEW_ACCOUNT_EMAIL_GOOGLE="$(kc_addr torny-review-google)" \
node scripts/provision-review-account.mjs --env prod --store apple
```

Skriptet printer hvilken Supabase-URL det skriver til før første skriv — les
den linja før du lar det gå videre. `--env prod` må stå der; uten flagget
kjører det mot staging.

Skriptet setter admin-kontoen din som arrangør av demo-runden og legger
review-kontoen inn som deltaker. Har du bare én admin-konto, finner det henne
selv. Har du flere (eller ingen), stopper det og ber deg si hvem det skal være:

```bash
REVIEW_DEMO_ORGANIZER_EMAIL='<din-admin-epost>' \
REVIEW_ACCOUNT_EMAIL="$(kc_addr torny-review-apple)" \
REVIEW_ACCOUNT_PASSWORD="$(kc_pass torny-review-apple)" \
REVIEW_ACCOUNT_EMAIL_GOOGLE="$(kc_addr torny-review-google)" \
node scripts/provision-review-account.mjs --env prod --store apple
```

Google-kontoen lages på samme måte, med sine egne variabler og `--store google`:

```bash
REVIEW_ACCOUNT_EMAIL_GOOGLE="$(kc_addr torny-review-google)" \
REVIEW_ACCOUNT_PASSWORD_GOOGLE="$(kc_pass torny-review-google)" \
REVIEW_ACCOUNT_EMAIL="$(kc_addr torny-review-apple)" \
node scripts/provision-review-account.mjs --env prod --store google
```

**Passordet beholdes.** Finnes kontoen fra før, rører skriptet ikke passordet, så det
som står i butikken, fortsatt virker. Bare `--rotate-password` setter et nytt fra
nøkkelringen. Bytt det der først, og lim det nye inn i butikken etterpå (steg 4).

**Forventet resultat:** en oppsummering som slutter med «✅ Provisjonert.» og
linjene `Spill`, `Kortnavn`, `Arrangør`, `Spillere: 4`, `Scores: 21`. Linja
`Butikk:` øverst viser hvilken butikk og demo-runde kjøringen gjelder. Feiler
noe, stopper skriptet med «❌» og en forklaring — ingenting er halvveis skrevet
ut over det som allerede står i loggen.

### 4. Legg inn i butikkene

Apple-kontoen går i **App Store Connect → appen → App Review Information** (og i
TestFlight → Test Information). Google-kontoen går i **Play Console → Policy → App
content → App access**, med teksten i `play-store-metadata.md`. Aldri bytt om på dem.

**App Store Connect → appen → App Review Information**:

- **Sign-in required:** kryss av
- **User name:** `<review-epost>`
- **Password:** passordet fra steg 1
- **Notes:** lim inn malen nederst i dette dokumentet

### 5. Prøv inngangen selv før innsending

På telefonen (TestFlight-kandidaten): hold overskriften inne til passordfeltet
dukker opp, skriv review-adressen og passordet, trykk «Logg inn med passord».
**Forventet:** hjem-skjermen med «Demo Round — Tørny» (Google-kontoen: «Demo Round
(Google Play) — Tørny»). Feil passord skal gi
«Feil e-post eller passord.» og ingenting annet.

## Reset før hver innsending — og etter hver review

**Revieweren kan slette review-kontoen.** Det er meningen: Apple krever
(5.1.1(v)) at sletting går an rett i appen, og fra #1909 slipper alle gjennom så
lenge de ikke arrangerer noe som pågår. Derfor er det admin-kontoen din som står
som arrangør av demo-runden, ikke review-kontoen — den er bare deltaker. Prisen
er at demo-runden ligger blant dine egne runder i appen. Det er en avtalt
kostnad, ikke en feil.

Kjør samme kommando som i steg 3 på nytt, for den butikken det gjelder: Apple-kontoen
**før hver innsending til Apple, og etter hver review der kontoen kan ha blitt
slettet**. Google-kontoen **før det lukkede sporet og produksjonen sendes til
vurdering**, og sjekk etter hver vurdering at innloggingen fortsatt virker, fordi
Google krever at den virker hele tiden. Apple-kommandoen (Google-kommandoen står i
steg 3):

```bash
source ~/.nvm/nvm.sh && nvm use 22
kc_pass() { security find-generic-password -s "$1" -w; }
kc_addr() { security find-generic-password -s "$1" | awk -F'"' '/"acct"/ {print $4}'; }
REVIEW_ACCOUNT_EMAIL="$(kc_addr torny-review-apple)" \
REVIEW_ACCOUNT_PASSWORD="$(kc_pass torny-review-apple)" \
REVIEW_ACCOUNT_EMAIL_GOOGLE="$(kc_addr torny-review-google)" \
node scripts/provision-review-account.mjs --env prod --store apple
```

Kjøringen rydder opp etter alt revieweren kan ha gjort:

- **Slettet kontoen?** Adressen blir frigitt når kontoen anonymiseres, så
  kjøringen lager kontoen på nytt med samme adresse og passordet fra nøkkelringen,
  altså det som står i butikken.
- **Står det en «Slettet bruker» igjen i runden?** Den raden fjernes. Etterpå er
  rosteret nøyaktig fire: review-kontoen, Emma, Jonas og Nora.
- **Spilt, levert eller trukket seg?** Scorene slettes og legges inn på nytt,
  runden settes tilbake til «pågår», og alle leveringer nullstilles.
- **Runden står på feil person?** Den flyttes til arrangøren. Det gjelder også
  gamle demo-runder som fortsatt står på review-kontoen.
- **Svart på spørsmålet om AI-tekster?** Svaret slettes, så neste reviewer får
  spørsmålet når hen logger inn. På en telefon der appen alt har sett et svar,
  kommer spørsmålet ikke igjen før appen er installert på nytt.

Den slutter med «✅ Allerede provisjonert — resatt til frisk demo.» og en
`Arrangør`-linje som viser hvem runden står på. Les den linja — det er den som
avgjør om revieweren får slette kontoen sin.

Google-kontoen tilbakestilles med `--store google` og sine egne variabler (steg 3).

En tilbakestilling endrer ikke passordet, så steg 4 trenger ikke gjøres om. Bare hvis
passordet byttes med vilje (`--rotate-password`), må det nye limes inn i App Store
Connect eller Play Console, fordi de husker det gamle.

## Demo-dataene revieweren møter

- **Konto:** navn «Alex Reviewer» (fornavnet brukes i hilsenen på hjem-skjermen),
  handicap 18. `locale = 'en'` gjelder nettsida; appen er på norsk (se notatet —
  det oversetter de få knappene revieweren trenger).
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
- **Slett konto:** «Profil» (oppe til høyre på hjem) → «Personvern og konto» →
  «Slett konto» virker for denne kontoen. Brukes den, trekkes kontoen automatisk
  ut av runden, runden blir stående hos arrangøren, og neste kjøring av skriptet
  setter alt tilbake.

## Notes-mal til App Store Connect

Skrevet for native-appen som sendes inn i N8 (#1954, build `1.1.0 (3)`), og
oppdatert i #2561 for neste innsending: AI-spørsmålet etter innlogging, varsler
på iOS, ingen kroner i appen, bare Norge, og slettingen på Apple-kontoen. Lim den
inn som den er, med adressen og passordet til **Apple-kontoen** i feltene over —
notatet nevner ingen av delene selv. Google Play har sin egen konto og sin egen
tekst (`play-store-metadata.md`, «App-tilgang»).

**Lengden:** Apples Notes-felt tar maks 4 000 byte. Malen er 3 215 byte, målt med
`wc -c` på teksten i blokka. Linjene er ikke brutt, så det du limer inn, er det som er
målt. Mål på nytt med `wc -c` hvis du endrer noe, og hold den under 3 800.

Navnene står med de tegnene appen faktisk viser («Tørny», «Demo Round — Tørny»).
Anmelderen skal lete etter det som står på skjermen, ikke etter en forenklet
skrivemåte.

```text
Tørny is a Norwegian golf tournament app. Sign-in normally uses a one-time code sent by email, so this review account has a password instead. The password field is hidden behind a long press.

HOW TO SIGN IN
1. Open the app. The sign-in screen is titled "Tørny".
2. Press and hold the title for about two seconds. A password field and "Logg inn med passord" (Sign in with password) appear.
3. Paste the user name and password from the fields above and tap "Logg inn med passord".

AI QUESTION AFTER SIGN-IN
The app asks "Kan AI-en skrive om deg?" (Can the AI write about you?). Tørny writes a short report after each round and a year summary at Christmas, using Claude from Anthropic.
- "Ja, det er greit" (Yes): the player's name can appear, and Anthropic receives names, results, game and course names and dates.
- "Nei takk" (No thanks): the name is left out of new texts. Numbers without names can still be used, as our privacy policy says.
Both answers open the app. Change it under "Profil" > "Personvern og konto" > "AI-tekster om meg".

WORDS YOU WILL NEED
"Profil" = Profile (top right on home)
"Fortsett runden" = Continue the round
"Lever scorekort" = Submit scorecard
"Resultater" = Results
"Slett konto" = Delete account
"Varsler og tema" = Notifications and theme
"Personvern og konto" = Privacy and account

WHAT YOU WILL SEE
An active round, "Demo Round — Tørny", with three co-players. Tap "Fortsett runden", continue on hole 4, watch "Resultater" update, and submit with "Lever scorekort". Another account hosts the round.

ACCOUNT DELETION (5.1.1(v))
"Profil" > "Personvern og konto" > "Slett konto" > confirm. Please test it last. It goes through and signs you out. This account is for Apple review only, and we restore it before every submission.
If you created a round yourself that is still planned or in progress, deletion is blocked so its players keep an organiser. Open that round, tap "Start runden nå" (Start the round now) if it has not started, then "Avslutt runden" (End the round). Tick every player under "Mangler kort", for example with "Avslutt uten kortet", and confirm. Please do not use the "Åpne Klubbhuset" button on the deletion screen: it opens our website, which needs an email code.

OFFLINE
Enter scores in Airplane Mode. They stay on the phone and sync when it is back online.

NOTIFICATIONS
The app never asks on its own. The system prompt appears only when the player turns on "Varsler på denne telefonen" under "Profil" > "Varsler og tema". Notifications are about the player's own rounds.

NOT IN THE APP
- No location access.
- No money: points and results only, no amounts, no payments. Skins, Wolf, Bingo Bango Bongo, Nines, Acey Deucey and Nassau are ways of counting points. "Blind Wolf-potter" is the number of holes won as a blind wolf.
- No purchases, ads or third-party tracking.
- The app creates eight formats. It plays every round the organiser sets up on our website, including scramble and the other team formats. Patsome and cup rounds open on our website in Safari.
- The year summary (Kavalkaden) opens at Christmas for players with a finished round, so this account does not show it.

Norway only. The account holds no real player data.
```

## Hva som bevisst IKKE ligger i repoet

Repoet er public. Verken adressen eller passordet finnes her — begge leses fra
miljøet når skriptet kjører, og `REVIEW_ACCOUNT_EMAIL` settes i Vercel (for
web-sida). Appen har ingen av delene i bundelen: inngangen vet ikke hvilken
konto som har passord, den bare spør Supabase. Ser du en konkret e-postadresse
eller et passord i en fil under git, er det en feil som skal fikses før neste
push.

Skriptet skriver aldri passordet til skjermen eller til en logg — heller ikke
når noe går galt.
