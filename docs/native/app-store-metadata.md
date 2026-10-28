# App Store-oppføringen — personvern-etikett og butikk-tekst

Alt eieren limer inn i App Store Connect for iOS-appen, samlet ett sted. Skrevet for
N8 (#1954, P6) og oppdatert i #2561 for neste innsending: varsler på iOS,
AI-spørsmålet, ingen kroner i appen og bare Norge. Klikkstien og «hva du skal se
etter» står i oppskriftene på PR #2596 (E6); denne fila er kilden tekstene kopieres
fra, så neste innsending ikke må finne dem opp på nytt.

**Regelen som styrer teksten:** vi lover bare det appen faktisk gjør. Nettsiden kan
mer enn appen, og en beskrivelse som selger nettsidens repertoar er en avvisning som
venter på å skje. Aldri «over 20 spillformer», aldri kroner eller pengeoppgjør
(appen viser dem ikke ved lansering), aldri cup. Ligaen står i beskrivelsen fra bygg 9:
appen viser ligaen du er med i og starter runden, men arrangøren setter den opp på
nettsiden. Appen **oppretter** åtte formater, men
den **spiller** også rundene arrangøren setter opp på nettsiden, blant dem scramble og
de fleste lagformatene. Appen åpner ikke patsome, cup-dager delt i to nihullsdeler og
avledede cup-kamper (`native/app/src/lib/formatGate.ts`). Beskrivelsen sier derfor aldri
at du kan *sette opp* scramble i appen.

## Personvern-etikett (App Privacy)

Etiketten følger Apples egne definisjoner på
<https://developer.apple.com/app-store/app-privacy-details/> (lest 2026-10-18):

- **Samle inn** («collect») er å sende data fra telefonen slik at vi kan nå dem
  «for a period longer than what is necessary to service the transmitted request in
  real time». Det vi lagrer i databasen, er samlet inn.
- **Bare på telefonen** teller ikke: «Data that is processed only on device is not
  'collected' and does not need to be disclosed.»
- **Sporing** er å koble data fra appen med andres data «for targeted advertising or
  advertising measurement purposes», eller å dele dem med en datamegler. Det gjør vi
  ikke.

Alt appen samler, unntatt Kavalkade-tellingen, er for at appen skal virke (App
Functionality). Kavalkade-tellingen har formålet Analytics (raden Product Interaction).
Alt er koblet til kontoen, og ingenting brukes til sporing.

Første spørsmål i skjemaet: **«Do you or your third-party partners collect data from
this app?» → Yes.**

Så hakes disse av, én rad per datatype:

| Kategori i skjemaet | Datatype | Hva det er hos oss, og kilden | Purposes | Linked to the user? | Used for tracking? |
|---|---|---|---|---|---|
| Contact Info | **Email Address** | Adressen kontoen logger inn med engangskoden (`native/app/src/screens/Login.tsx`, `requestLoginCode`). | App Functionality | **Yes** | **No** |
| Contact Info | **Name** | Navnet og kallenavnet spilleren fyller inn i profilen, og som medspillerne ser på tavla (`CompleteProfile.tsx`, feltet `complete-profile-name`; `EditProfile.tsx`, feltet `edit-profile-nickname`). | App Functionality | **Yes** | **No** |
| Contacts | **Contacts** | Vennelista, e-postadressene spilleren taster for å legge til eller invitere en venn (`native/app/src/data/friends.ts`, `addFriendByEmail` og `inviteFriend`), og adressene arrangøren inviterer inn i en runde (`OrganiserSection.tsx`, `inviteToGame`). Apple regner en «social graph» som kontakter. Appen leser aldri kontaktene på telefonen. | App Functionality | **Yes** | **No** |
| Identifiers | **User ID** | Konto-id-en radene i databasen henger på (Supabase Auth). | App Functionality | **Yes** | **No** |
| Identifiers | **Device ID** | Varsel-tokenet fra Apple, som `turnOnPush` lagrer i `apns_tokens` sammen med konto-id-en og iOS-versjonen («Tørny-appen iOS …», `userAgent()`), bare når spilleren slår på varsler (`native/app/src/data/pushDevice.ts:110-137`). Se tolkningen under. | App Functionality | **Yes** | **No** |
| User Content | **Gameplay Content** | Slagene, resultatene og handicapet poengregningen bygger på, og hvem som spiller i hvilken runde (`lib/scoring/`, `CompleteProfile.tsx`, feltet `complete-profile-hcp`). Apple: «Such as saved games, multiplayer matching or gameplay logic, or user-generated content in-game». | App Functionality | **Yes** | **No** |
| User Content | **Other User Content** | Navnet arrangøren gir runden (`native/app/src/components/create/SetupStep.tsx`, feltet `create-name`), og grunnen en makker eller arrangøren skriver når et scorekort sendes tilbake (`Approve.tsx`), som spilleren ser på spillsiden (`GameHome.tsx:268`). Apple: «Any other user-generated content». | App Functionality | **Yes** | **No** |
| Usage Data | **Product Interaction** | At spilleren delte et kort fra Kavalkaden, hvilket kort og hvilket år, og når (`ShareKavalkadeCardButton.tsx` → `logKavalkadeShare` → tabellen `kavalkade_shares`). Vi bruker det bare til å telle hvor mange spillere som har delt (`lib/kavalkade/countKavalkadeSharers.ts`). Apple: «other information about how the user interacts with the app». | Analytics | **Yes** | **No** |
| Other Data | **Other Data Types** | Kjønn (herre eller dame) og spillerklasse (junior, voksen eller senior) fra «Rediger profil» (`EditProfile.tsx`, `GENDER_OPTIONS` og `LEVEL_OPTIONS`). De velger tee for spilleren (`lib/games/joinTeeGenders.ts`). Se tolkningen under. | App Functionality | **Yes** | **No** |

**Varsel-tokenet er en tolkning.** Apple har ingen regel som nevner varsel-tokens ved
navn. Vi oppgir det som Device ID ut fra to sitater:

- Etiketten: Device ID er «Such as the device's advertising identifier, or other
  device-level ID» (<https://developer.apple.com/app-store/app-privacy-details/>).
- APNs-dokumentasjonen: «This address takes the form of a device token unique to both
  the device and your app»
  (<https://developer.apple.com/documentation/usernotifications/registering-your-app-with-apns>).

Tokenet blir liggende i databasen så lenge varslene er på, og det er koblet til kontoen,
så det er samlet inn etter definisjonen over. iOS-versjonen lagres i samme rad for å
kjenne igjen telefonen og oppgis derfor sammen med tokenet.

**Kjønn og spillerklasse er også en tolkning.** Apple har ingen egen datatype for dem.
«Sensitive Info» er «racial or ethnic data, sexual orientation, pregnancy or childbirth
information, disability, religious or philosophical beliefs, trade union membership,
political opinion, genetic information, or biometric data», og der står verken kjønn
eller alder. Ingen annen type passer heller, så de oppgis under «Other Data Types»
(«Any other data types not mentioned»). Spillerklassen sier noe om alderen
(junior eller senior), og det er en grunn til å oppgi den heller enn å la den ligge
under spilldataene.

Dette hakes **ikke** av, og her er grunnen:

- **Location.** Appen leser aldri hvor telefonen er: `expo-location` finnes ikke
  blant avhengighetene, og `native/app/src` har null treff på geolokasjon.
  «Vis på kart» på startbilletten åpner Kart med banens navn
  (`TicketStub.tsx`, `mapSearchUrl`), ikke med telefonens posisjon.
- **Resten av Usage Data, og Diagnostics.** Appen har ingen analyse- eller krasj-SDK.
  `expo-network` sier bare om telefonen har nett, og sender ingenting. Det eneste vi
  teller, er delte Kavalkade-kort (raden Product Interaction).
- **Kalenderen.** «Legg til i kalender» åpner iOS sitt eget ark for ny hendelse
  (`native/app/src/lib/addToCalendar.ts`). Hendelsen blir på telefonen, og vi får
  ingenting tilbake, så den er ikke samlet inn.
- **Delingen.** Bildet av bag-taggen eller Kavalkaden lages på telefonen og gis til
  iOS sitt delingsark (`native/app/src/lib/shareImage.ts`), og «følg live»-lenka
  (når arrangøren har slått på live-følging) deles på samme måte (`shareLive.ts`). Spilleren velger selv hvor det
  går. Vi får aldri bildet eller vet hvor det gikk. Deler spilleren et Kavalkade-kort,
  lagrer vi bare at det ble delt (raden Product Interaction).
- **AI-tekstene.** Anthropic (språkmodellen Claude) skriver Kavalkaden og
  rundereferatet på serveren for oss. De får bare data som alt står i radene over
  (navn, resultater, spill- og banenavn, datoer), og navnet bare for spillere som har
  sagt ja (`AiConsentGate`). Apple definerer «third-party partners» som «analytics
  tools, advertising networks, third-party SDKs, or other external vendors whose code
  you've added to your app». Anthropic har ingen kode i appen, og datatypene er
  oppgitt uansett. Det er ikke sporing.

Siste spørsmål, «Do you use this data to track you or your device across apps and
websites owned by other companies?», er **No** for alle radene.

Etterpå skal oppsummeringen på siden vise **Data Linked to You** med Contact Info,
Contacts, Identifiers, Usage Data, User Content og Other Data, og **Data Not Used to
Track You**.

**Grunnen når et kort sendes tilbake** står under Other User Content hos Apple, men
under «Other in-app messages» hos Google. Apples meldingstype er «Emails or Text
Messages» («Including subject line, sender, recipients, and contents of the email or
message»), altså e-post og SMS, mens Google har en egen type for meldinger i appen.
Begge oppgir den samme teksten.

**Formålet Analytics** for Kavalkade-delingen er Apples «Using data to evaluate user
behavior, including to understand the effectiveness of existing product features».
Vi teller delinger for å vite om Kavalkaden blir brukt, og personvernerklæringen sier
det (`legal.privacy.analyticsBody`).

**Endring fra #1284-utkastet:** posisjon er tatt ut. Utkastet hadde et forbehold om
green-pins (#1210); den funksjonen bor på nettsiden, og native-appen leser ikke
posisjon i det hele tatt. **Name** er lagt til i Contact Info: profilen krever navn,
og en etikett som underrapporterer er en avvisningsgrunn.

**Endring i #2561:** **Contacts** er lagt til (vennene kom i appen med #2256), og
**Device ID** for varsel-tokenet (varslene kom med #2256 PR 4). User Content er delt i
**Gameplay Content** (slag, resultater, handicap, hvem som spiller) og **Other User
Content** (rundenavnet og grunnen når et kort sendes tilbake). Kallenavnet står under
Name, og kjønn og spillerklasse under **Other Data Types**. De tre feltene fantes i
appen også ved forrige innsending, men sto ikke på etiketten.

## App-navn og URL-er

| Felt | Verdi |
|---|---|
| Navn | `Tørny – golfturneringer` (satt ved opprettelsen, endres ikke nå) |
| Support-URL | `https://tornygolf.no` |
| Marketing-URL | (tom) |
| Personvern-URL | `https://tornygolf.no/legal/privacy` |
| Aldersgrense | Regnes ut av Apples spørreskjema. Med svarene i «Aldersgrense (Apple)» blir den 13+ (var 4+). |
| Tilgjengelighet | Bare Norge (Pricing and Availability → App Availability). |
| Handelsstatus (DSA) | «This is not a trader account.» (Business → Agreements → Compliance → Digital Services Act; stien sjekkes i konsollen av orkestratoren). Apple: den som bare distribuerer utenfor EU, er «not acting as a trader on the App Store», men statusen må oppgis likevel (<https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements>). |
| Kategori | Sports (primær). Anbefaling — sjekk hva som faktisk står i App Store Connect før innsending; den ble satt da appen ble opprettet (#1283) og er ikke lest av i denne økta. |

## Aldersgrense (Apple)

Skjemaet ble revidert i 2025: aldersgrensene er nå 4+, 9+, 13+, 16+ og 18+, og alle
apper måtte svare på de nye spørsmålene innen 31. januar 2026
(<https://developer.apple.com/news/?id=ks775ehf>). Spørsmålene om sosiale medier kom
9. juli 2026 og kreves for nye apper og oppdateringer fra september 2026
(<https://developer.apple.com/news/?id=tlur8uvi>). Definisjonene og hvilken
aldersgrense hvert svar gir, står på
<https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions>
(lest 2026-10-18).

Klikkstien: Apps → Tørny → General → App Information → «Set Up Age Ratings» (eller
«Edit») → gå gjennom stegene. Orkestratoren sjekker at spørsmålene står slik i
konsollen før eieren svarer.

Svarene står med skjemaets egne valg. Kontroller og funksjoner er en liste der du
krysser av for det appen har («Valgt» eller «Ikke valgt»). Innholdsspørsmålene har
None, Infrequent og Frequent, og pengespill og loot boxes har Yes og No
(<https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating>).
For de to helsespørsmålene viser ikke Apples dokumentasjon valgene, så der står begge.
Velg det som betyr «ingen».

| Del og spørsmål | Svar | Hvorfor |
|---|---|---|
| In-App Controls: Parental Controls | Ikke valgt | Appen har ingen foreldrekontroll. |
| In-App Controls: Age Assurance | Ikke valgt | Appen sjekker ikke alder. |
| Capabilities: Unrestricted Web Access | Ikke valgt | Appen har ingen nettleser. Lenker til tornygolf.no åpnes i Safari, utenfor appen (`native/app/src/lib/webLink.ts`, `Linking.openURL`). Verken `react-native-webview` eller `expo-web-browser` er avhengigheter. |
| Capabilities: User-Generated Content | Ikke valgt | Det spillerne skriver (navn, rundenavn, slag, grunnen når et kort sendes tilbake), ser bare medspillerne og vennene, ikke folk flest. Apples definisjon krever «broad distribution». Valgt gir også 4+, så svaret flytter ikke aldersgrensen. |
| Capabilities: Social Media | Ikke valgt | Spørsmålene om sosiale medier er påkrevd fra september 2026. Apples definisjon er innhold som spres «through a social feed or similar discovery method that visibly spreads content to many users». Appen har ingen strøm og ingen måte å spre innhold til mange på. Vennelista viser bare egne venner (`native/app/src/data/friends.ts`). |
| Capabilities: Social Media Disabled for Users Under 13 | Ikke valgt | Gjelder bare apper med sosiale medier. |
| Capabilities: Messaging and Chat | **Valgt** | Apples definisjon: «Users can directly communicate with one another through features within the app». En makker eller arrangøren kan sende et scorekort tilbake med en grunn i fritekst, og spilleren leser den på spillsiden (`Approve.tsx`, `GameHome.tsx:268`). Det er en kort melding fra én spiller til en annen. Valgt gir 4+. |
| Capabilities: Advertising | Ikke valgt | Appen har ingen reklame. |
| Mature Themes: Profanity or Crude Humor | None | Ingen. |
| Mature Themes: Horror/Fear Themes | None | Ingen. |
| Mature Themes: Alcohol, Tobacco, or Drug Use or References | None | Appen nevner det ikke (`native/app/src` har null treff på «baren» og «alkohol»). Beskrivelsen sa før «i baren etterpå»; nå står det «i klubbhuset», så butikkteksten heller ikke nevner alkohol. |
| Medical or Wellness: Medical or Treatment Information | None / No | Ingen. |
| Medical or Wellness: Health or Wellness Topics | None / No | Appen gir ingen råd om trening eller helse. Handicapet er et golfmål. |
| Sexuality or Nudity (alle) | None | Ingen. |
| Violence (alle, også våpen) | None | Ingen. |
| Chance-Based Activities: Gambling | No | Appen har ingen pengespill og viser ingen kroner ved lansering (`SHOW_KRONER_IN_APP = false` i `lib/launchRules.ts`). Det finnes ingen betaling i appen. |
| Chance-Based Activities: Simulated Gambling | None | Apples definisjon er «Betting or wagering without using real money or in-game currency that can be exchanged for real money». De seks formatene som ellers kan spilles om penger (Skins, Wolf, Bingo Bango Bongo, Nines, Acey Deucey og Nassau, `lib/scoring/settlement.ts`), er måter å telle poeng på, og i appen er det ingen innsats: kronene er skjult (`lib/launchRules.ts`). |
| Chance-Based Activities: Contests | Frequent | Hver runde er en konkurranse med tavle og plasseringer. Det er hele appen. Frequent gir 13+. |
| Chance-Based Activities: Loot Boxes | No | Appen har ingen kjøp. |
| Additional Information: Override to Higher Age Rating | No | Ikke nødvendig. |

Med disse svarene blir aldersgrensen **13+** (Contests: Frequent). Det var 4+ ved
forrige innsending. Appen er laget for voksne golfspillere, så det stenger ingen ute.

## Undertittel (maks 30 tegn)

```text
Fyr opp golfturneringen
```

23 tegn. Brandens underordnede form, den samme som står ved siden av BrandMark på
nettsiden.

## Nøkkelord (maks 100 tegn, kommaseparert uten mellomrom)

```text
scorekort,stableford,matchplay,greensome,skins,banehandicap,leaderboard,golfrunde,offline,wolf
```

94 tegn. «Golf» og «turnering» står allerede i appnavnet og undertittelen, og Apple
indekserer begge — å gjenta dem her ville brent plass. Formatnavnene er de folk
faktisk søker på.

## Promotekst (maks 170 tegn)

Kan endres når som helst uten ny innsending, så den er stedet for sesongtekst.

```text
Opprett runden på et par minutter, tast slag hull for hull og se tavla oppdatere seg. Ryker dekningen på hull 12, ligger slagene på telefonen til nettet er tilbake.
```

164 tegn.

## Beskrivelse

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
- Scramble og flere lagformater, når arrangøren har satt opp runden på tornygolf.no

SIDETURNERINGER
Slå på lengste drive og nærmest pinnen på hullene dere velger, så har dere noe å krangle om i klubbhuset etterpå.

LIGA
Er du med i en liga som arrangøren har satt opp på tornygolf.no, finner du den i appen. Der ser du sesongtabellen, den åpne runden og hvem som har spilt, og du starter runden med ett trykk. Slår du på varsler, får du beskjed når en runde åpner og når fristen nærmer seg. I en simulatorliga godkjenner du kortet til en medspiller som markør.

FØR OG UNDER RUNDEN
Legg runden inn i kalenderen med ett trykk. Slå på varsler hvis du vil vite når du blir invitert, når et scorekort venter på deg og når resultatet er klart. Har arrangøren slått på live-følging, kan du dele lenka, så kan de hjemme følge tavla mens dere spiller.

NÅR RUNDEN ER FERDIG
Du leverer kortet ditt, arrangøren avslutter runden, og resultatet er klart for alle som var med.

I romjula får du Kavalkaden, en oppsummering av golfåret ditt som du kan dele med gjengen. En språkmodell skriver teksten, og navnet ditt er bare med hvis du har sagt ja til det.

Tørny er laget for norske runder og norske baner. Du bruker den samme kontoen på tornygolf.no.
```

### Lim inn i App Store Connect

Sti: **App Store Connect → Apps → Tørny → i venstre meny under «iOS App» velg
versjonen som er «Prepare for Submission» → bla til feltet «Description»**.
Beskrivelsen og Notes kan bare endres før versjonen er sendt inn (eller etter en
avvisning). Promoteksten kan endres når som helst. Stien er skrevet etter Apples
dokumentasjon og er ikke sjekket i konsollen; sjekk den før du limer.

1. Marker alt i «Description» og slett det.
2. Lim inn hele kodeblokka over (fra «Tørny er turneringen i lomma.» til «…samme kontoen
   på tornygolf.no.»). Den nye linja er den siste i lista under «FORMATER DU KAN SPILLE»:
   «Scramble og flere lagformater, når arrangøren har satt opp runden på tornygolf.no».
3. Samme versjonsside lenger ned, **App Review Information → Notes**: marker alt, slett,
   og lim inn blokka under «Notes-mal til App Store Connect» i
   [`app-store-review-konto.md`](app-store-review-konto.md) (lengden står i den fila).
   Linja som er endret, er den nest siste under «NOT IN THE APP».
4. Trykk «Save» øverst til høyre.

### Hva som med vilje IKKE står der

- **«Over 20 spillformer.»** Nettsiden har 22 aktive formater; appen oppretter åtte
  (`native/app/src/lib/appFormats.ts`). Åtte er det vi lover.
- **Varsler som noe appen gjør av seg selv.** Beskrivelsen sier «slå på varsler hvis du
  vil», fordi appen bare spør når spilleren slår dem på under «Varsler og tema»
  (`NotificationsAndTheme.tsx` → `turnOnPush`). «Resultatet er klart»-mailen kommer fra
  serveren, ikke fra appen, og er derfor ikke et app-løfte.
- **Kroner og pengeoppgjør.** Skins og Wolf spilles ofte om penger, men appen viser ikke
  kroner ved lansering (`SHOW_KRONER_IN_APP = false` i `lib/launchRules.ts`, #2561).
  Oppgjøret finnes på nettsiden.
- **Rundereferatet.** Fra #2632 viser appen AI-historien «Fra pressetribunen» på den
  ferdige tavla (sitat øverst, hele historien nederst), og varselet «Resultatet er klart»
  viser starten av den. Butikkbeskrivelsen nevner den ikke. Kavalkaden er i appen, så den
  står i beskrivelsen.
- **Cup.** Finnes på nettsiden. Vanlige cup-kamper spilles i appen, men patsome,
  cup-dager delt i to nihullsdeler og avledede cup-kamper åpnes ikke
  (`formatGate.ts`). Ligaen er med fra bygg 9 («LIGA»): appen viser sesongtabellen og den
  åpne runden, starter runden og lar markøren godkjenne kortet i en simulatorliga
  (`League.tsx`, `LeagueRoundStart.tsx`, `MarkerApprove.tsx`). Appen oppretter ikke
  ligaer, og beskrivelsen sier ikke at den gjør det. Ligavarslene («runden åpner», «fristen
  nærmer seg») står bare i iOS-teksten, siden Android ikke har varsler.
- **Å sette opp scramble i appen.** Opprett-veiviseren har bare de åtte formatene over.
  Scramble-familien settes opp på nettsiden, og så spiller du den i appen: appen fører
  ett lagkort (`modeCollapsesToTeamCard`, N4) og viser lagtavla (`teamBoard.ts`, #2579).
  Derfor står den som «når arrangøren har satt opp runden på tornygolf.no», ikke som et
  format du velger. Linja sier «flere lagformater» og ikke «alle», fordi patsome er et
  lagformat appen ikke åpner. Skal beskrivelsen holdes som før, stryk den siste linja i
  lista i begge beskrivelsene (alternativ B i PR #2615).
- **Invitasjoner som eget punkt.** Appen kan invitere: arrangøren inviterer en
  e-postadresse inn i runden fra runden selv (`OrganiserSection.tsx`, `inviteToGame`), og
  en venn kan inviteres fra vennelista (`inviteFriend`). Når runden settes opp, velger du
  blant dem du alt spiller med, og hint-teksten peker til nettsiden for nye folk
  (`PlayersStep`). «Sett opp spillerne» i beskrivelsen dekker begge veiene, så
  invitasjonen står ikke som eget løfte.

## Nytt i denne versjonen («What's New in This Version», maks 4000 tegn)

Kreves for en oppdatering, og 1.1.0 (3) er alt godkjent. Alt i lista er kommet i appen
etter 1.1.0 (3), som ble bygget 2026-09-06 (taggen `native-ios/v1.1.0-3`).

```text
Nytt i denne versjonen:
- Varsler på iPhone når du blir invitert, når et scorekort venter på deg og når resultatet er klart. Du slår dem på under Profil, Varsler og tema.
- Venner: legg til venner og se hvor mange runder dere har spilt sammen.
- Arrangøren kan invitere nye spillere på e-post rett fra runden.
- Legg runden inn i kalenderen med ett trykk, og del lenka så andre kan følge tavla live.
- Kavalkaden: oppsummeringen av golfåret ditt, i romjula.
- Du bestemmer selv om navnet ditt kan stå i tekstene språkmodellen skriver.
```

Kildene: varslene (`pushDevice.ts`, 2026-09-30), vennene (`friends.ts`, 2026-09-29),
invitasjonen (`inviteToGame.ts`, 2026-09-20), kalenderen og live-lenka
(`addToCalendar.ts`, `shareLive.ts`, 2026-09-29 og 2026-09-30), Kavalkaden
(`kavalkade.ts`, 2026-10-01) og AI-spørsmålet (`AiConsentGate.tsx`, 2026-10-16).

## Skjermbilder

Apple har gått fra tommer til navn på størrelsene
(<https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications>,
lest 2026-10-18). Siden sier at en innsending krever minst ett skjermbilde for
«iPhone with Dynamic Island (medium display)» (1179 × 2556 eller 1206 × 2622). Raden
for «Face ID (large display)» sier samtidig at den kreves når «Dynamic Island (large
display)» (1260 × 2736, 1290 × 2796 eller 1320 × 2868) ikke er levert. Siden sier
altså to ting, så lever begge: stor og medium. App Store Connect viser hvilke plasser
som må fylles. 1–10 bilder per størrelse, JPEG eller PNG. **Ingen alfakanal**: Apple
avviser PNG-er med gjennomsiktighet, og simulatorens egne skjermbilder har den, så
bildene flates til RGB. iPad trengs ikke (`supportsTablet: false` i
`native/app/app.json`). Fra april 2027 kreves også bilder for iPhone Duo for apper
bygget med iOS 27.1 SDK eller nyere. Sjekk SDK-en før en innsending etter det.

### Bildene for 1.2.0

Bildene for 1.2.0 ble tatt i del E7 av #2561, etter at tavlekjeden og PR C var merget.
De ligger i [`native/assets/store/`](../../native/assets/store/), og README-en der
forteller hvordan de ble laget:

| Mappe | Plass i App Store Connect | Størrelse |
|---|---|---|
| `ios-6.9-1320x2868/` | «iPhone with Dynamic Island (large display)» (6,9") | 1320 × 2868 |
| `ios-6.3-1206x2622/` | «iPhone with Dynamic Island (medium display)» (6,3"), påkrevd | 1206 × 2622 |

Åtte bilder per størrelse, i rekkefølgen filnavnene har: hjem, hullet, tavla, utslaget
(«Hvem sitt utslag ble brukt?»), runden er ferdig, godkjenning, resultat og lagtavla.
Ingen kroner, ingen e-postadresse og bare oppdiktede spillere. Bildene viser koden på
`main` `69a2d2dae`, samme kilde som bygget 1.2.0 (4).

Bildene fra 1.1.0 (3) ligger i feltet for 6,5" i App Store Connect (og i
`~/Desktop/Tørny-skjermbilder/` hos eieren): hjem, hull-føring, tavle, sluttresultat og
profil. Denne leveransen har ingen egne 6,5"-bilder. De gamle slettes fra 6,5"-feltet,
og da skalerer Apple 6,9"-bildene dit selv. Ligger de igjen, ser 6,5"-telefoner de gamle
bildene. Stegene står under «Opplasting» i `native/assets/store/README.md`.

### 1.1.0 (3): hvordan de ble tatt — og hvorfor ikke mot prod

Den foretrukne veien var butikk-varianten mot **prod**, innlogget som
review-kontoen gjennom den skjulte inngangen. Tre ting stoppet den, hver for seg
nok:

1. **Passordet er eierens.** Ingen skal håndtere det på eierens vegne.
2. **Profil-skjermen viser e-postadressen** til den som er logget inn
   (`Profile.tsx`, `testID="profile-email"`). Review-adressen ville blitt
   publisert i App Store sammen med bildet.
3. **«Avslutt/resultat» finnes ikke for review-kontoen.** Den er *deltaker* i en
   *aktiv* runde. Å lage skjermbildet ville krevd skriving i prod — forbudt.

Bildene er derfor tatt av **samme kildekode som kandidat `1.1.0 (3)`**, kjørt som
Release-bygg i simulator (iPhone 17 Pro Max, 6,9") mot **staging**, med en
fikstur av oppdiktede spillere. Kontrakt §5 og runbooken foreskrev da begge
staging-data til nettopp dette.

To build-tids-verdier ble satt lik butikkbyggets under kjøringen, slik at
pikslene er butikkbyggets og ikke dev-byggets — begge reversert etterpå, ingen av
dem committet:

| Fil | Fra | Til | Hvorfor |
|---|---|---|---|
| `native/app/app.json` | `"name": "Tørny Dev"` | `"name": "Tørny"` | Login- og hjem-headeren leser `Constants.expoConfig?.name`. Butikkbygget setter «Tørny»; vakten i `app.config.ts` er fail-closed og nekter butikk-identitet mot staging, så navnet måtte settes i dev-fasiten. |
| `native/app/src/lib/stagingGate.ts` | staging-verten | en vert som ikke matcher | `isStagingBuild()` legger en «Utvikler»-seksjon med Sync-lab midt i profil-rommet. Den finnes ikke i butikkbygget, og skulle ikke vises i et butikk-skjermbilde. |

I tillegg fikk `navigation.tsx` en midlertidig krok som leste startruta fra
AsyncStorage: simulatoren kunne ikke drives med tapp i økta (MCP-en manglet
enhetstilgang, og osascript har ikke tilgjengelighetstilgang). Kroken flytter
bare hvilken skjerm appen åpner på — skjermene selv er urørte. Også reversert.

`npx jest app.config.test.ts src/lib/stagingGate.test.ts` er kjørt etter
reverteringen (48 grønne, 2 snapshots) og er beviset på at fasitene står som før.

### 1.1.0 (3): fiksturen på staging

Bildene for 1.2.0 bruker den ikke (se README-en i `native/assets/store/`).
Fire oppdiktede spillere på et fantasidomene, der hovedpersonen — den ene som
vises på profil-skjermbildet — ligger på en `.example`-adresse. Den toppdomenen
er reservert av RFC 2606 og kan aldri bli en ekte postkasse, så adressen i bildet
kan ikke tilhøre noen. De spiller tre runder på Byneset North: «Søndagsrunden» (pågår, 7 hull tastet),
«Sommeravslutningen» (avsluttet, 18 hull) og «Torsdagsmatchen» (planlagt
matchplay). P4-dataene er ikke rørt. Fiksturen står igjen på staging, så bildene
kan tas om igjen uten å seede på nytt.
