# Play-oppføringen: tekst, Data safety og erklæringene

Alt eieren limer inn i Play Console for Android-appen, samlet ett sted (#2561).
iOS-motstykket er [`app-store-metadata.md`](app-store-metadata.md), og byggeveien står i
[`play-store-release.md`](play-store-release.md). Reglene er hentet fra Googles egne
hjelpesider, lest 2026-10-18. Lenken står ved hvert avsnitt. Der Google ikke viser
ordlyden i skjemaet, står det, og orkestratoren sjekker i konsollen før eieren svarer.

**Samme regel som iOS:** vi lover bare det Android-appen gjør. **Android har ingen
varsler.** Serveren sender bare til iPhone: `canUsePush` i
`native/app/src/data/pushDevice.ts` svarer nei utenfor iOS, og `POST_NOTIFICATIONS`
står i `blockedPermissions` i `native/app/app.json`. Resultatet kommer på e-post
(eierens svar: «Ja, e-post holder først»). Aldri varsler, aldri kroner eller
pengeoppgjør, aldri rundereferatet (det står på nettsiden og i e-posten), aldri
scramble, cup eller liga.

## Oppføringen (Main store listing)

Grensene er 30 tegn for navnet, 80 for kort beskrivelse og 4000 for full beskrivelse
(<https://support.google.com/googleplay/android-developer/answer/9859152>).

| Felt | Hvor i Play Console | Verdi |
|---|---|---|
| App name | Main store listing | `Tørny – golfturneringer` (23 tegn, samme som i App Store) |
| Kategori | Store settings | Sports |
| Kontakt-e-post | Store settings | `personvern@tornygolf.no` |
| Nettsted | Store settings | `https://tornygolf.no` |
| Personvern-URL | Policy → App content → Privacy policy | `https://tornygolf.no/legal/privacy` |

### Kort beskrivelse (maks 80 tegn)

```text
Sett opp golfturneringen, tast slag hull for hull og følg tavla underveis.
```

74 tegn.

### Full beskrivelse (maks 4000 tegn)

Samme tekst som i App Store, uten varslene, og med e-posten i stedet.

```text
Tørny er turneringen i lomma.

Sett opp runden på et par minutter: velg bane og tee, velg format, sett opp spillerne og trykk start. Så taster du slag hull for hull mens dere går, og tavla oppdaterer seg underveis.

Handicapet regnes etter WHS, slik at alle spiller på like vilkår. Ingen sitter med kalkulator på hull 3.

Ryker dekningen ute på banen, går det fint: slagene blir liggende på telefonen og sendes av seg selv når nettet er tilbake.

FORMATER DU KAN SPILLE
- Stableford og Modifisert Stableford
- Matchplay
- Best ball og Greensome
- Wolf, Skins og Bingo Bango Bongo

SIDETURNERINGER
Slå på lengste drive og nærmest pinnen på hullene dere velger, så har dere noe å krangle om i klubbhuset etterpå.

FØR OG UNDER RUNDEN
Legg runden inn i kalenderen med ett trykk. Har arrangøren slått på live-følging, kan du dele lenka, så kan de hjemme følge tavla mens dere spiller.

NÅR RUNDEN ER FERDIG
Du leverer kortet ditt, arrangøren avslutter runden, og resultatet er klart for alle som var med. Du får det på e-post også.

I romjula får du Kavalkaden, en oppsummering av golfåret ditt som du kan dele med gjengen. En språkmodell skriver teksten, og navnet ditt er bare med hvis du har sagt ja til det.

Tørny er laget for norske runder og norske baner. Du bruker den samme kontoen på tornygolf.no.
```

Hva som med vilje ikke står der, og hvorfor, står i `app-store-metadata.md` («Hva som
med vilje IKKE står der»). Det gjelder Android også, og i tillegg varslene.

### Versjonsnotat (Release notes) for produksjonsslippet

```text
Første versjon av Tørny på Google Play.
```

## Data safety

Definisjonene er Googles
(<https://support.google.com/googleplay/android-developer/answer/10787469>):

- **Samle inn:** «'Collect' means transmitting data from your app off a user's device.»
  Det som bare behandles på telefonen, skal ikke oppgis.
- **Dele:** «transferring user data collected from your app to a third party». Unntaket
  vi bruker: «Transferring user data to a 'service provider' that processes it on
  behalf of the developer. 'Service provider' means an entity that processes user data
  on behalf of the developer and based on the developer's instructions.»
  Tjenesteleverandørene våre er Supabase (database og innlogging), Vercel (serveren),
  Resend (e-post) og Anthropic (AI-tekstene, se personvernerklæringen). Ingen av dem
  bruker dataene til noe eget, så vi **deler ikke** data.
- **Valgfritt:** bare når alle brukere kan la være å gi dataene («You can declare that
  your app collects certain data optionally only if all users … can either optionally
  provide information, opt-out, or opt-in»).

Svarene øverst i skjemaet:

| Spørsmål | Svar |
|---|---|
| Does your app collect or share any of the required user data types? | Yes |
| Is all of the user data collected by your app encrypted in transit? | Yes. Appen snakker bare med `https://` (Supabase og `https://tornygolf.no`; beviset krever begge adressene i bundelen). |
| Which of the following methods of account creation does your app support? | Kryss av for **Username and other authentication**. Brukernavnet er e-postadressen, og «other authentication» er engangskoden på e-post (`native/app/src/screens/Login.tsx`). Passordinnloggingen finnes bare for review-kontoene, og ingen kan lage en konto med passord. Valgene er lest fra tredjepartsveiledninger for skjemaet (Googles egen side lister dem ikke). Sjekkes i konsollen av orkestratoren. |
| Delete account URL | `https://tornygolf.no/legal/slett-konto` (#2561 PR A). I appen: «Profil» → «Personvern og konto» → «Slett konto». |

Én rad per datatype som hakes av:

| Datatype (Google) | Hva det er hos oss, og kilden | Delt? | Påkrevd eller valgfri | Formål |
|---|---|---|---|---|
| Personal info → Name | Navnet og kallenavnet i profilen, som medspillerne ser på tavla (`CompleteProfile.tsx`; `EditProfile.tsx`, feltet `edit-profile-nickname`). Google: «How a user refers to themselves, such as their first or last name, or nickname.» | Nei | Påkrevd | App functionality, Account management |
| Personal info → Email address | Adressen kontoen logger inn med (`native/app/src/screens/Login.tsx`). | Nei | Påkrevd | App functionality, Account management |
| Personal info → User IDs | Konto-id-en radene i databasen henger på (Supabase Auth). | Nei | Påkrevd | App functionality, Account management |
| Personal info → Other info | Kjønn (herre eller dame) og spillerklasse (junior, voksen eller senior) fra «Rediger profil» (`EditProfile.tsx`). De velger tee for spilleren (`lib/games/joinTeeGenders.ts`). Google: «Any other personal information such as date of birth, gender identity, veteran status, etc.» | Nei | Valgfri (kjønn kan stå tomt, `lib/users/profileInput.ts:128-139`, og spillerklassen står som voksen til spilleren velger noe annet) | App functionality |
| Contacts | Vennelista, e-postadressene spilleren taster for å legge til eller invitere en venn (`native/app/src/data/friends.ts`), og adressene arrangøren inviterer inn i en runde (`OrganiserSection.tsx`, `inviteToGame`). Google regner «social graph information like usernames» som kontakter. Appen leser aldri kontaktene på telefonen. | Nei | Valgfri (venner og invitasjoner er ikke nødvendig for å spille) | App functionality |
| Messages → Other in-app messages | Grunnen en makker eller arrangøren skriver når et scorekort sendes tilbake, som spilleren ser på spillsiden (`Approve.tsx`, `GameHome.tsx:268`). Google: «Any other types of messages. For example, instant messages or chat content.» | Nei | Valgfri (grunnen kan stå tom) | App functionality |
| App activity → App interactions | At spilleren delte et kort fra Kavalkaden, hvilket kort og hvilket år, og når (`ShareKavalkadeCardButton.tsx` → `kavalkade_shares`). Vi bruker det bare til å telle hvor mange spillere som har delt. Google: «Information about how a user interacts with the app». | Nei | Valgfri (bare når spilleren deler) | Analytics |
| App activity → Other user-generated content | Slagene, rundene, resultatene, spillnavnene og handicapet spilleren oppgir. | Nei | Påkrevd | App functionality |

Grunnen når et kort sendes tilbake står under «Other in-app messages» her, men under
«Other User Content» hos Apple, fordi Apples meldingstype gjelder e-post og SMS. Begge
oppgir den samme teksten (se `app-store-metadata.md`).

Dette hakes **ikke** av, og her er grunnen:

- **Location.** Appen leser aldri hvor telefonen er (ingen `expo-location`, null treff på
  geolokasjon i `native/app/src`). «Vis på kart» åpner kartappen med banens navn.
- **Device or other IDs.** Android har ingen varsler, så appen registrerer ikke noe
  varsel-token. Appen har ingen reklame-id.
- **Calendar.** «Legg til i kalender» åpner telefonens eget skjema for ny hendelse
  (`native/app/src/lib/addToCalendar.ts`), og `READ_CALENDAR` og `WRITE_CALENDAR` står i
  `blockedPermissions`. Hendelsen blir på telefonen.
- **Photos and videos.** Bildet av bag-taggen eller Kavalkaden lages på telefonen og gis
  til telefonens delingsark (`native/app/src/lib/shareImage.ts`). Det lastes ikke opp til
  oss. For Kavalkade-kort lagrer vi bare at det ble delt (raden App interactions).
- **App info and performance.** Appen har ingen krasj- eller analyse-SDK. Det eneste vi
  teller, er delte Kavalkade-kort (raden App interactions).
- **Messages → Emails og SMS or MMS.** Appen leser verken e-post eller SMS. Den eneste
  meldingen er grunnen når et kort sendes tilbake (raden Other in-app messages).
- **Financial info, Health and fitness, Audio, Files and docs, Web browsing.** Ingen.

## Innholdsvurdering (IARC)

Klikkstien: Policy → App content → Content rating → Start → e-post
(`personvern@tornygolf.no`) → kategori → spørreskjemaet
(<https://support.google.com/googleplay/android-developer/answer/188189>). For Norge
gjelder PEGI (<https://support.google.com/googleplay/android-developer/answer/9859655>).
Google viser ikke ordlyden i spørreskjemaet på noen side jeg fant, så svarene står etter
tema. Orkestratoren sjekker spørsmålene i konsollen og svarer etter det skjemaet faktisk
spør om.

| Tema | Svar | Hvorfor |
|---|---|---|
| Kategori | **All Other App Types** | IARC skiller mellom spill, apper for sosialt eller kommunikasjon, og alle andre apper (Epic Games' gjennomgang av IARC-skjemaet, <https://dev.epicgames.com/documentation/fortnite/rating-screen-in-fortnite>). Tørny er et verktøy for golfrunder. Den korte grunnen når et kort sendes tilbake, gjør ikke appen til en app for kommunikasjon. Sjekkes i konsollen av orkestratoren. |
| Vold, seksuelt innhold, banning, rusmidler | Nei | Ingenting av det finnes i appen. |
| Pengespill med ekte penger | Nei | Appen har ingen innsats og viser ingen kroner ved lansering (`SHOW_KRONER_IN_APP = false` i `lib/launchRules.ts`). Det finnes ingen betaling i appen. |
| Simulert pengespill | Nei | De seks formatene som ellers kan spilles om penger (Skins, Wolf, Bingo Bango Bongo, Nines, Acey Deucey og Nassau, `lib/scoring/settlement.ts`), er måter å telle poeng på, og i appen er det ingen innsats. Samme svar som for Apple (`app-store-metadata.md`, «Aldersgrense (Apple)»). |
| Kan brukerne samhandle eller dele innhold med hverandre? | **Ja** | Spillerne ser hverandres navn, slag og resultater i felles runder, kan legge til venner, og en makker eller arrangøren kan sende et kort tilbake med en grunn i fritekst (`Approve.tsx`). Appen har ingen chat ut over det. |
| Deler appen brukerens posisjon? | Nei | Appen leser ikke posisjon. |
| Digitale kjøp | Nei | Appen har ingen kjøp. |
| Ubegrenset tilgang til internett | Nei | Appen har ingen nettleser. Lenker åpnes i nettleseren, utenfor appen. |

Google regner ut aldersgrensen fra svarene.

## Målgruppe og innhold

| Erklæring | Svar | Kilde |
|---|---|---|
| Target audience | **18 and over** (anbefaling: voksne golfspillere, og det holder appen utenfor familieprogrammet). Eieren velger i konsollen. | Velger du en aldersgruppe under 13, gjelder familieprogrammets regler (<https://support.google.com/googleplay/android-developer/answer/9867159>). |
| Ads | **No, my app does not contain ads** | <https://support.google.com/googleplay/android-developer/answer/9859455> |
| Advertising ID | Nei, appen bruker ikke reklame-id | Appen har ingen reklame. |
| News app | Nei | Kategorien er Sports, og appen kaller seg ikke nyheter (<https://support.google.com/googleplay/android-developer/answer/10523915>). |
| Health apps | «My app doesn't provide any health features» | Skjemaet er påkrevd for alle apper, også testspor (<https://support.google.com/googleplay/android-developer/answer/14738291>). |
| Financial features | «My app doesn't provide any financial features» | Påkrevd for alle apper (<https://support.google.com/googleplay/android-developer/answer/13849271>). |
| Government app | Nei | Ingen. |

## App-tilgang (App access)

Velg «All or some functionality in my app is restricted» og legg inn instruksjonene
under. Adressen og passordet står i feltene i Play Console, aldri i denne fila. Google
krever innlogging som kan brukes igjen og omgår engangskoden, som virker til enhver tid
og hvor som helst, og at instruksjonene er på engelsk
(<https://support.google.com/googleplay/android-developer/answer/15748846>). Inngangen
er den samme som for Apple (langtrykket på tittelen), men Google har sin egen
review-konto med egen adresse, eget passord og egen demo-runde
(`app-store-review-konto.md`).

```text
Signing in normally uses a one-time code sent by email. For review we have prepared a
dedicated account with a password. The password field is hidden behind a long press:

1. Open the app. You land on the sign-in screen, titled "Tørny".
2. Press and hold the title "Tørny" for about two seconds. A password field and a
   button labelled "Logg inn med passord" (Sign in with password) appear.
3. Enter the user name and password above, then tap "Logg inn med passord".

Right after signing in, the app asks whether the AI may write about you
("Kan AI-en skrive om deg?"). Both answers take you into the app.

The account plays in an active demo round called "Demo Round (Google Play) — Tørny".
The app is in Norwegian and is available in Norway only.

This account is for Google Play review only. To see account deletion without deleting
the account, open "Profil" -> "Personvern og konto" -> "Slett konto" and stop before
the final button "Slett kontoen min for alltid" (Delete my account forever). Account
deletion can also be requested on the web at https://tornygolf.no/legal/slett-konto.
```

«Til enhver tid» betyr at kontoen må virke gjennom hele det lukkede sporet, ikke bare
ved én innsending. Derfor har Google sin egen review-konto, adskilt fra Apple-kontoen
som Apple-revieweren får slette. Orkestratoren kjører
`scripts/provision-review-account.mjs --env prod --store google` før sporet sendes til
vurdering, og sjekker at innloggingen virker etter hver vurdering
(`app-store-review-konto.md` §Reset).

## Land

Bare Norge, både i testsporene og i produksjon (Testing / Production → Countries /
regions).

## Skjermbilder og feature-grafikk

Kravene (<https://support.google.com/googleplay/android-developer/answer/9866151>):

| Ressurs | Krav |
|---|---|
| Skjermbilder | Opptil 8 per enhetstype. JPEG eller 24-bit PNG uten alfakanal. Hver side mellom 320 og 3840 px, og den lange siden kan ikke være mer enn dobbelt så lang som den korte. For at Google skal kunne anbefale appen: minst fire bilder på minst 1080 px, 9:16 i portrett (minst 1080 × 1920). |
| Feature-grafikk | Påkrevd. 1024 × 500 px, JPEG eller 24-bit PNG uten alfakanal. |
| App-ikon | 512 × 512 px, 32-bit PNG med alfakanal, maks 1024 KB. |

**Pass på høyden.** Et skjermbilde rett fra en moderne Android-telefon er rundt 20:9
(for eksempel 1080 × 2400). Da er den lange siden mer enn dobbelt så lang som den korte,
og Play avviser bildet. Ta bildene i 9:16 (1080 × 1920), for eksempel på en emulator med
den skjermstørrelsen, eller beskjær dem dit.

Bildene ble tatt i del E7 av #2561, etter at tavlekjeden og PR C var merget. Alt ligger
i [`native/assets/store/`](../../native/assets/store/), og README-en der har
alt-tekstene og forteller hvordan bildene ble laget:

| Ressurs | Fil | Format |
|---|---|---|
| Telefonskjermbilder | `native/assets/store/android-1080x1920/01-hjem.png` … `08-lagtavla.png` | 8 bilder, 1080 × 1920 (9:16), PNG uten alfakanal |
| Feature-grafikk | `native/assets/store/play-feature-graphic-1024x500.png` | 1024 × 500, PNG uten alfakanal |
| App-ikon | `native/android/store_icon.png` | 512 × 512, PNG med alfakanal, 25 KB |

Skjermbildene er tatt i Android-emulatoren med skjermen satt til 1080 × 1920, så de
oppfyller kravet til anbefaling uten beskjæring. De viser de samme åtte skjermene som
iOS-settet: hjem, hullet, tavla, utslaget, runden er ferdig, godkjenning, resultat og
lagtavla. Ingen kroner, ingen e-postadresse og bare oppdiktede spillere. Statuslinja er
ren (Androids demomodus, klokka 15:41).

Feature-grafikken er ordmerket fra `wordmark-master.svg` i lin på skogsgrønn flis, med
slagordet «Fyr opp golfturneringen på et par minutter» (`docs/style-and-brand.md`). Den
gjentar ikke app-ikonet, har ingen enhet og ingen påstander om rangering eller pris, slik
Googles retningslinjer ber om. Den lages på nytt med
`node native/assets/store/generate-feature-graphic.mjs`. Ikonet lages av
`native/assets/generate-icons.mjs` fra `icon-master-full-bleed.svg`.
