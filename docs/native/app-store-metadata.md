# App Store-oppføringen — personvern-etikett og butikk-tekst

Alt eieren limer inn i App Store Connect for iOS-appen, samlet ett sted. Skrevet for
N8 (#1954, P6) og oppdatert i #2561 for innsendingen i desember: varsler på iOS,
AI-spørsmålet, ingen kroner mellom spillerne, bare Norge, og fra 27.11 også
startkontingenten og premiebordet. Klikkstien og «hva du skal se etter» står i
oppskriftene på PR #2596 (E6); denne fila er kilden tekstene kopieres fra, så
neste innsending ikke må finne dem opp på nytt.

**Målestokken er bygg 1.2.0 (15)**, bump-commiten `1fc9a089d` (23.11.2026). Teksten
lover det som står i den commiten, ikke mer. Det som er merget etter 23.11, er ikke
med i bygget og står ikke her. Sendes et nyere bygg inn, holder teksten fortsatt.

**Regelen som styrer teksten:** vi lover bare det appen faktisk gjør. Nettsiden kan
mer enn appen, og en beskrivelse som selger nettsidens repertoar er en avvisning som
venter på å skje. Aldri «over 20 spillformer», aldri pengeoppgjør (appen viser det
ikke ved lansering). Startkontingenten og premiebordet vises i appen fra #2749 og
står i beskrivelsen under «FOR ARRANGØREN», uten ord som lokker med premier («vinn»,
«premier verdt …»). Cup står i beskrivelsen fra bygget som har kapteinuttaket
(#2752, avsnittet «CUP»): appen lager, spiller og avslutter en personlig cup, og en klubb-cup
lages på nettsiden. Ligaen står i beskrivelsen fra bygg 9:
appen viser ligaen du er med i og starter runden, men arrangøren setter den opp på
nettsiden. Fra bygg 15 kan du også melde deg på en liga som er åpen for påmelding.
Appen **oppretter** 15 formater (`APP_SUPPORTED_MODES`), og scramble-familien er med
(#2753). Den **spiller** i tillegg rundene arrangøren setter opp på nettsiden, blant
dem de lagformatene appen ikke oppretter selv.

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
Alt er koblet til kontoen, og ingenting brukes til sporing. Lest på nytt 2026-11-27
mot bygg 1.2.0 (15), `1fc9a089d`.

Første spørsmål i skjemaet: **«Do you or your third-party partners collect data from
this app?» → Yes.**

Så hakes disse av, én rad per datatype:

| Kategori i skjemaet | Datatype | Hva det er hos oss, og kilden | Purposes | Linked to the user? | Used for tracking? |
|---|---|---|---|---|---|
| Contact Info | **Email Address** | Adressen kontoen logger inn med engangskoden (`native/app/src/screens/Login.tsx`, `requestLoginCode`). | App Functionality | **Yes** | **No** |
| Contact Info | **Name** | Navnet og kallenavnet spilleren fyller inn i profilen, og som medspillerne ser på tavla (`CompleteProfile.tsx`, feltet `complete-profile-name`; `EditProfile.tsx`, feltet `edit-profile-nickname`). | App Functionality | **Yes** | **No** |
| Contact Info | **Phone Number** | Vipps-nummeret arrangøren legger inn som betalingsmåte for startkontingenten (`native/app/src/components/create/FeeAndPrizes.tsx`, feltet `create-payment-link`; `wizardPayload.ts`, `payment_link`). Feltet er fritekst, og et telefonnummer er bruken det er laget for. Arrangøren velger selv om kontingent og nummer settes (valgfritt). Spillerne i runden ser nummeret på kontingentkortet (`PaymentCard.tsx`). I en runde som er åpen for påmelding ser alle som har påmeldingslenka det også, uten innlogging (`app/[locale]/signup/[shortId]/page.tsx`, nettsiden). | App Functionality | **Yes** | **No** |
| Purchases | **Purchase History** | At arrangøren har krysset av for at en spiller har betalt startkontingenten (`game_players.paid_at`; `native/app/src/data/payments.ts`, `PaymentStatus.tsx`). Betalingen skjer utenfor appen, og appen ser den aldri; avkrysningen er arrangørens liste. Vi oppgir den likevel, fordi en etikett som rapporterer for lite er en avvisningsgrunn. Se tolkningen under. | App Functionality | **Yes** | **No** |
| Contacts | **Contacts** | Vennelista, e-postadressene spilleren taster for å legge til eller invitere en venn (`native/app/src/data/friends.ts`, `addFriendByEmail` og `inviteFriend`), og adressene arrangøren inviterer inn i en runde (`OrganiserSection.tsx`, `inviteToGame`). Apple regner en «social graph» som kontakter. Appen leser aldri kontaktene på telefonen. | App Functionality | **Yes** | **No** |
| Identifiers | **User ID** | Konto-id-en radene i databasen henger på (Supabase Auth). | App Functionality | **Yes** | **No** |
| Identifiers | **Device ID** | Varsel-tokenet fra Apple, som `turnOnPush` lagrer i `apns_tokens` sammen med konto-id-en og iOS-versjonen («Tørny-appen iOS …», `userAgent()`), bare når spilleren slår på varsler (`native/app/src/data/pushDevice.ts:110-137`). Se tolkningen under. | App Functionality | **Yes** | **No** |
| User Content | **Gameplay Content** | Slagene, resultatene og handicapet poengregningen bygger på, og hvem som spiller i hvilken runde (`lib/scoring/`, `CompleteProfile.tsx`, feltet `complete-profile-hcp`). Apple: «Such as saved games, multiplayer matching or gameplay logic, or user-generated content in-game». | App Functionality | **Yes** | **No** |
| User Content | **Other User Content** | Navnet arrangøren gir runden (`native/app/src/components/create/SetupStep.tsx`, feltet `create-name`), og grunnen en makker eller arrangøren skriver når et scorekort sendes tilbake (`Approve.tsx`), som spilleren ser på spillsiden (`GameHome.tsx:268`). Fra bygg 15 også premie- og sponsorteksten på premiebordet (`FeeAndPrizes.tsx`, `PrizeTable.tsx`), lagnavnet kapteinen skriver når laget meldes på (`TeamSignupForm.tsx`) eller en cup settes opp (`CreateCup.tsx`), den valgfrie hilsenen til arrangøren i en påmelding (`RoundInvite.tsx`), og reaksjonene på tavla (`RowReactions.tsx`, en fast palett med seks emojier). Apple: «Any other user-generated content». | App Functionality | **Yes** | **No** |
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

**Phone Number og Purchase History er også tolkninger, og vi oppgir for mye heller enn
for lite.** Vipps-nummeret er ofte et telefonnummer, og feltet tar fritekst, så vi
oppgir det som Phone Number selv om det er arrangørens nummer og ikke spillerens.
«Betalt» er en betaling spilleren har gjort, selv om den skjer hos Vipps eller
arrangørens egen lenke og appen aldri ser den. Apples «Purchase History» passer
dårlig for en avkrysning i en liste, men en etikett som rapporterer for lite er en
avvisningsgrunn, og det koster lite å rapportere for mye (#2561, G2).

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
- **Biometri (Face ID og Touch ID).** Låsen på appen (#2841, `AppLockGate.tsx`) spør
  telefonen om ansiktet eller fingeren passer, og får bare et ja eller nei tilbake.
  Appen ser aldri ansiktet eller fingeren, og valget om å låse ligger på telefonen, ikke
  på serveren. Apple: «Data that is processed only on device is not 'collected'», så
  ingen rad i Sensitive Info eller Identifiers. Det som kreves, er teksten
  `NSFaceIDUsageDescription` i Info.plist (`app.json`); uten den krasjer appen første
  gang den spør, og `privacy-proof.sh` stopper et bygg uten den.
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
Purchases, Contacts, Identifiers, Usage Data, User Content og Other Data, og **Data Not
Used to Track You**.

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

**Endring i #2561 G2 (27.11):** **Phone Number** (Vipps-nummeret) og **Purchase
History** (at arrangøren har krysset av for betalt) er lagt til, og **Other User
Content** er utvidet med premie- og sponsortekst, lagnavn, hilsenen i en påmelding og
reaksjonene på tavla. Kildene står i tabellen. Face ID-låsen og bildet som lagres i
Bilder gir ingen rader: se «Dette hakes **ikke** av».

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
(lest 2026-10-18, og definisjonene for brukerinnhold, sosiale medier, meldinger, konkurranser og pengespill lest på nytt 2026-11-27; siden viser ingen «sist oppdatert»-dato, og ordlyden er kontrollert av to uavhengige lesinger 27.11).

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
| Capabilities: User-Generated Content | **Valgt** | Apples definisjon: «Includes the broad distribution of content created by users as a component of the app's intended user experience». Fra bygg 15 viser terminlista «Finn turneringer» og den delte påmeldingslenka rundenavnet og klubbnavnet arrangøren skriver til alle innloggede spillere, også folk utenfor vennelista (`TerminRow.tsx`, `RoundInvite.tsx`; arrangørens navn vises ikke). Premiebordet ser spillerne i runden, og i en runde som er åpen for påmelding også alle som har påmeldingslenka, uten innlogging (nettsiden, `signup/[shortId]/page.tsx`). Lagnavn og reaksjonene ser bare spillerne i runden. Apple oppgir at svaret gir 4+, så det flytter ikke aldersgrensen. |
| Capabilities: Social Media | Ikke valgt | Spørsmålene om sosiale medier er påkrevd fra september 2026. Apples definisjon er «Redistribution, amplification, or interaction with user-generated content through a social feed or similar discovery method that visibly spreads content to many users» (lest 2026-11-27). Terminlista er en liste over arrangementer med dato, bane og ledige plasser. Den sprer ikke innhold fra brukerne, og ingen strøm gir visninger, likes, kommentarer eller deling videre. Reaksjonene på tavla er en fast palett på seks emojier, bare for spillerne i runden. Vennelista viser bare egne venner (`native/app/src/data/friends.ts`). |
| Capabilities: Social Media Disabled for Users Under 13 | Ikke valgt | Gjelder bare apper med sosiale medier. |
| Capabilities: Messaging and Chat | **Valgt** | Apples definisjon: «Users can directly communicate with one another through features within the app». En makker eller arrangøren kan sende et scorekort tilbake med en grunn i fritekst, og spilleren leser den på spillsiden (`Approve.tsx`, `GameHome.tsx:268`). Det er en kort melding fra én spiller til en annen. Den valgfrie hilsenen til arrangøren i en påmelding (`RoundInvite.tsx`, høyst 200 tegn) er en melding til én person. Valgt gir 4+. |
| Capabilities: Advertising | Ikke valgt | Appen har ingen reklame. |
| Mature Themes: Profanity or Crude Humor | None | Ingen. |
| Mature Themes: Horror/Fear Themes | None | Ingen. |
| Mature Themes: Alcohol, Tobacco, or Drug Use or References | None | Appen nevner det ikke (`native/app/src` har null treff på «baren» og «alkohol»). Beskrivelsen sa før «i baren etterpå»; nå står det «i klubbhuset», så butikkteksten heller ikke nevner alkohol. |
| Medical or Wellness: Medical or Treatment Information | None / No | Ingen. |
| Medical or Wellness: Health or Wellness Topics | None / No | Appen gir ingen råd om trening eller helse. Handicapet er et golfmål. |
| Sexuality or Nudity (alle) | None | Ingen. |
| Violence (alle, også våpen) | None | Ingen. |
| Chance-Based Activities: Gambling | No | Appen har ingen pengespill. Pengeoppgjøret mellom spillerne er skjult (`SHOW_SETTLEMENT_IN_APP = false` i `lib/launchRules.ts`). Fra #2749 viser appen startkontingenten til et ekte arrangement, arrangørens betalingslenke eller Vipps-nummer, og premiebordet. Betalingen skjer utenfor appen, og ingen kan satse noe i appen. Grunnen står i «Kontingent og premiebord mot butikkreglene» under. |
| Chance-Based Activities: Simulated Gambling | None | Apples definisjon er «Betting or wagering without using real money or in-game currency that can be exchanged for real money». De seks formatene som ellers kan spilles om penger (Skins, Wolf, Bingo Bango Bongo, Nines, Acey Deucey og Nassau, `lib/scoring/settlement.ts`), er måter å telle poeng på, og i appen er det ingen innsats: oppgjøret er skjult (`lib/launchRules.ts`). |
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

## Beskrivelse (maks 4000 tegn)

```text
Tørny er turneringen i lomma.

Sett opp runden på et par minutter: velg bane og tee, velg format, sett opp spillerne og trykk start. Så taster du slag hull for hull mens dere går, og tavla oppdaterer seg underveis.

Handicapet regnes etter WHS, slik at alle spiller på like vilkår. Ingen sitter med kalkulator på hull 3.

Ryker dekningen ute på banen, går det fint: slagene blir liggende på telefonen og sendes av seg selv når nettet er tilbake.

FORMATER DU KAN SPILLE
- Slagspill, Stableford og Modifisert Stableford
- Matchplay
- Best ball, Greensome og Patsome
- Texas scramble, Florida scramble, Ambrose og Shamble
- Wolf, Skins, Bingo Bango Bongo og Nassau

FINN EN RUNDE
Terminlista viser turneringene denne helga og i klubben din. Er det ledig plass, melder du deg på, alene eller med laget ditt. Er runden full, kan du be om plass.

SIDETURNERINGER
Slå på lengste drive og nærmest pinnen på hullene dere velger, så har dere noe å krangle om i klubbhuset etterpå.

FOR ARRANGØREN
Lag kompisrunden eller klubbturneringen i appen. Du kan sette en startkontingent med Vipps-nummer eller betalingslenke, se hvem som har betalt og minne resten på det. Betalingen går rett til deg, utenfor appen. Premiene dere spiller om, legger du inn på premiebordet.

LIGA
Er du med i en liga som arrangøren har satt opp på tornygolf.no, finner du den i appen. Der ser du sesongtabellen, den åpne runden og hvem som har spilt, og du starter runden rett derfra. Er ligaen åpen for påmelding, melder du deg på i appen. Slår du på varsler, får du beskjed når en runde åpner og når fristen nærmer seg. I en simulatorliga godkjenner du kortet til en annen i ligaen som markør.

CUP
Sett opp en lagkamp mot kompisene rett i appen. Du velger bane, format og spillere, fordeler lagene og får et forslag til kamper, eller lar kapteinene ta ut laget sitt i hemmelighet. Så spiller dere, og når cupen er ferdig, ser alle hvilket lag som vant.

FØR OG UNDER RUNDEN
Legg runden inn i kalenderen med ett trykk. Slå på varsler hvis du vil vite når du blir invitert, når et scorekort venter på deg og når resultatet er klart. Innboksen samler det som venter på deg. Har arrangøren slått på live-følging, kan du dele lenka, så kan de hjemme følge tavla mens dere spiller.

NÅR RUNDEN ER FERDIG
Du leverer kortet ditt, arrangøren avslutter runden, og resultatet er klart for alle som var med. Resultatkortet kan du dele med gjengen.

I romjula får du Kavalkaden, en oppsummering av golfåret ditt som du kan dele med gjengen. En språkmodell skriver teksten, og navnet ditt er bare med hvis du har sagt ja til det.

Tørny er laget for norske runder og norske baner. Du bruker den samme kontoen på tornygolf.no.
```

2679 tegn, målt med `len()` på teksten i blokka (grensen er 4000). Ingen «vinn» og ingen «premier verdt …».

### Lim inn i App Store Connect

Sti: **App Store Connect → Apps → Tørny → i venstre meny under «iOS App» velg
versjonen som er «Prepare for Submission» → bla til feltet «Description»**.
Beskrivelsen og Notes kan bare endres før versjonen er sendt inn (eller etter en
avvisning). Promoteksten kan endres når som helst. Stien er skrevet etter Apples
dokumentasjon og er ikke sjekket i konsollen; sjekk den før du limer.

1. Marker alt i «Description» og slett det.
2. Lim inn hele kodeblokka over (fra «Tørny er turneringen i lomma.» til «…samme kontoen
   på tornygolf.no.»). Nytt fra 27.11: formatlista med scramble-familien og Nassau, «FINN EN RUNDE»
   og «FOR ARRANGØREN».
3. Samme versjonsside lenger ned, **App Review Information → Notes**: marker alt, slett,
   og lim inn blokka under «Notes-mal til App Store Connect» i
   [`app-store-review-konto.md`](app-store-review-konto.md) (lengden står i den fila).
   Nytt fra 27.11: avsnittet «ENTRY FEE AND PRIZES», og linjene under «NOT IN THE APP» er skrevet om.
4. Trykk «Save» øverst til høyre.

### Hva som med vilje IKKE står der

- **«Over 20 spillformer.»** Nettsiden har 22 aktive formater; appen oppretter 15
  (`APP_SUPPORTED_MODES` i `native/app/src/lib/appFormats.ts` på `1fc9a089d`; filas egen
  kommentar sier «15 etter #2753»). Det er tallet vi lover, og beskrivelsen lister dem
  ved navn. Kontrakten fra 12.11 skrev 14, men Nassau (#2755) kom 13.11. VERIFICATION GAP:
  hvilke av dem veiviseren faktisk viser, avgjøres også av `formats.is_active` og
  `format_intent_mapping` i databasen, og det er ikke lest.
- **Varsler som noe appen gjør av seg selv.** Beskrivelsen sier «slå på varsler hvis du
  vil», fordi appen bare spør når spilleren slår dem på under «Varsler og tema»
  (`NotificationsAndTheme.tsx` → `turnOnPush`). «Resultatet er klart»-mailen kommer fra
  serveren, ikke fra appen, og er derfor ikke et app-løfte. Android har varsler fra
  bygg 15 (#2758), så teksten gjelder begge plattformene.
- **Pengeoppgjør.** Skins og Wolf spilles ofte om penger, men appen viser ikke
  oppgjøret ved lansering (`SHOW_SETTLEMENT_IN_APP = false` i `lib/launchRules.ts`,
  #2561, #2749). Oppgjøret finnes på nettsiden. Startkontingenten, betalingslenka og
  premiebordet vises i appen fra #2749 (se under).
- **Rundereferatet.** Fra #2632 viser appen AI-historien «Fra pressetribunen» på den
  ferdige tavla (sitat øverst, hele historien nederst), og varselet «Resultatet er klart»
  viser starten av den. Butikkbeskrivelsen nevner den ikke. Kavalkaden er i appen, så den
  står i beskrivelsen.
- **Cup.** Fra #2752 lager, spiller og avslutter appen en personlig cup: oppsett,
  lagfordeling, kampene, start, trekk og bytte, sidepoeng og avslutning. En klubb-cup
  lages på nettsiden, men spilles, styres og avsluttes i appen. Kapteinuttaket er med:
  arrangøren åpner øktene, og hver kaptein tar ut laget sitt i hemmelighet. Avsnittet
  «CUP» limes inn sammen med det første bygget som har uttaket (eierens svar 02.11:
  «Ja, vent»).
- **Liga.** Ligaen er med fra bygg 9 («LIGA»): appen viser sesongtabellen og den
  åpne runden, starter runden og lar markøren godkjenne kortet i en simulatorliga
  (`League.tsx`, `LeagueRoundStart.tsx`, `MarkerApprove.tsx`). Appen oppretter ikke
  ligaer, og beskrivelsen sier ikke at den gjør det. Ligavarslene («runden åpner», «fristen
  nærmer seg») står i begge tekstene. Fra bygg 15 kan du også melde deg på en liga som er
  åpen for påmelding (#2839, `League.tsx` og Hjem, `87fd721e1` og `910ab7c48`), og det står i «LIGA».
- **Å sette opp scramble i appen.** Det kan du fra bygg 15: veiviseren oppretter
  Texas scramble, Florida scramble, Ambrose og Shamble (#2753 D3b, 12.11). Den gamle
  linja «Scramble og flere lagformater, når arrangøren har satt opp runden på
  tornygolf.no» er derfor strøket, og formatene står ved navn. Lag-handicapet
  arrangøren setter, og lagnavnet kapteinen skriver, finnes i appen.
- **Premiebordet selges ikke som premier.** Beskrivelsen nevner premiebordet bare som
  et sted arrangøren legger inn premiene gruppen spiller om, og bruker aldri «vinn»,
  «premier verdt …» eller «konkurranse med premier». Tørny deler ikke ut noe. Appen
  sier det selv under premiebordet (`PRIZE_TEXT.organiserNote`, G1, PR #2859): «Arrangøren
  deler ut premiene. Verken Tørny eller Apple står bak konkurransen.» (Android: uten
  «eller Apple».)
- **Startkontingenten som betaling i appen.** Beskrivelsen sier at betalingen går rett til
  arrangøren, utenfor appen. Appen tar ingen betaling og ingen andel, og viser bare hvem
  som har betalt (se «Kontingent og premiebord mot butikkreglene»).
- **Det som ikke er med i bygg 15:** pengeoppgjøret (`SHOW_SETTLEMENT_IN_APP = false`),
  kroner per enhet i veiviseren, og alt som er merget etter 23.11.
- **Invitasjoner som eget punkt.** Appen kan invitere: arrangøren inviterer en
  e-postadresse inn i runden fra runden selv (`OrganiserSection.tsx`, `inviteToGame`), og
  en venn kan inviteres fra vennelista (`inviteFriend`). Når runden settes opp, velger du
  blant dem du alt spiller med, og hint-teksten peker til nettsiden for nye folk
  (`PlayersStep`). «Sett opp spillerne» i beskrivelsen dekker begge veiene, så
  invitasjonen står ikke som eget løfte.

## Nytt i denne versjonen («What's New in This Version», maks 4000 tegn)

Kreves for en oppdatering, og 1.1.0 (3) er alt godkjent. Alt i lista er kommet i appen
etter 1.1.0 (3), som ble bygget 2026-09-06 (taggen `native-ios/v1.1.0-3`), og er med i
bygg 1.2.0 (15), `1fc9a089d`.

```text
Nytt i denne versjonen:
- Terminlista: se turneringene denne helga og i klubben din, meld deg på, be om plass når runden er full, og meld på laget ditt.
- Du kan sette opp flere formater selv: Slagspill, Patsome, Texas scramble, Florida scramble, Ambrose, Shamble og Nassau.
- Klubbturneringer: lag dem og meld deg på i appen.
- Cup: sett opp en lagkamp mot kompisene og spill den ferdig i appen.
- Startkontingent med Vipps-nummer eller betalingslenke, og et premiebord. Arrangøren ser hvem som har betalt og kan minne resten på det.
- Ligaen: følg sesongtabellen, meld deg på og start runden rett fra appen.
- Reaksjoner på tavla, og et resultatkort du kan dele.
- Innboksen samler det som venter på deg.
- Varsler når du blir invitert, når et scorekort venter på deg og når resultatet er klart. Du velger selv hva du får.
- Lås appen med Face ID.
- Venner: legg til venner og se hvor mange runder dere har spilt sammen.
- Legg runden inn i kalenderen med ett trykk, og del lenka så andre kan følge tavla live.
- Kavalkaden: oppsummeringen av golfåret ditt, i romjula.
- Du bestemmer selv om navnet ditt kan stå i tekstene språkmodellen skriver, og under «Personvern og konto» kan du laste ned dataene dine.
```

Lista nevner ikke Android: Apples regel 2.3.10 sier at metadata ikke skal nevne andre mobilplattformer. Punktet om varsler gjelder derfor bare «varsler». Android-varslene (#2758) står i Play-teksten og i personvernerklæringen.

Kildene (fil og dato, alle på `1fc9a089d`):

- Terminlista (`Terminliste.tsx`, 2026-11-12), åpen runde (`RoundInvite.tsx`, 2026-11-02) og «be om plass» (`564f37ed8`, 2026-11-12); lagpåmeldingen (#2840): `TeamSignupForm.tsx` (2026-11-12).
- Formatene: `appFormats.ts` (slagspill og Patsome 2026-11-12, scramble-familien og shamble 2026-11-12, Nassau 2026-11-13).
- Klubbturneringer: `CreateGame.tsx` (typen «klubb») og `bec3ca209`/`5c1a2a7c8` (2026-11-12).
- Cup: `CreateCup.tsx`, `Cup.tsx` (2026-11-01 og 2026-11-02).
- Kontingent og premiebord: `FeeAndPrizes.tsx`, `PaymentCard.tsx`, `PaymentStatus.tsx`, `PrizeTable.tsx` (2026-11-10).
- Ligaen: `League.tsx` (2026-10-28); påmelding til en åpen klubbliga fra ligasiden, Hjem og terminlista (`87fd721e1` og `910ab7c48`, 2026-11-12; `LeagueJoin.tsx` selv kom 2026-11-01).
- Reaksjoner og resultatkort: `RowReactions.tsx`, `ResultShareCard.tsx` (2026-11-04). Reaksjonene finnes i noen formater, ikke i alle (`reactions.ts`).
- Innboksen: `Inbox.tsx` (2026-11-04).
- Varsler: `pushDevice.ts` (iPhone 2026-09-30, Android 2026-11-02).
- Face ID-låsen (#2841): `AppLockGate.tsx` (2026-11-12).
- Vennene (`friends.ts`, 2026-09-29), kalenderen og live-lenka (`addToCalendar.ts`, `shareLive.ts`, 2026-09-29 og 2026-09-30), Kavalkaden (`kavalkade.ts`, 2026-10-01).
- AI-spørsmålet (`AiConsentGate.tsx`, 2026-10-16) og «Dine data» (`dataExport.ts`, 2026-11-14).

Arrangøren som inviterer nye spillere på e-post (`inviteToGame.ts`, 2026-09-20) står ikke
som eget punkt lenger: «Sett opp spillerne» i beskrivelsen dekker det.

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

Bildene viser koden fra bygg 4 og dekker ikke terminlista, kontingenten eller premiebordet.
Eieren svarte 12.11 «Ja, nye etter lansering»: vi sender inn med de åtte bildene vi
har, og tar nye etter lanseringen.

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

## Kontingent og premiebord mot butikkreglene (#2749, #2561)

Eieren valgte 01.11 å vise startkontingenten, arrangørens betalingslenke og
premiebordet i appen før lansering, men holde pengeoppgjøret mellom spillerne skjult.
Reglene under er sitert ordrett. 3.1.1, 3.1.3(e) og 5.3.4 er lest 2026-11-10 (#2749).
5.3 til 5.3.3 og Googles side er lest 2026-11-12 av utredningen til #2561; Apple-siden
var da sist oppdatert «October 16, 2026». Ordlyden er ikke lest på nytt 27.11. Eieren
svarte 12.11 «Behold, med linje under».

**Apple, App Store Review Guidelines** (<https://developer.apple.com/app-store/review/guidelines/>,
«Last Updated: October 16, 2026»):

- 3.1.1 In-App Purchase: «If you want to unlock features or functionality within your
  app, (by way of example: subscriptions, in-game currencies, game levels, access to
  premium content, or unlocking a full version), you must use in-app purchase.»
- 3.1.3(e) Goods and Services Outside of the App: «If your app enables people to purchase
  physical goods or services that will be consumed outside of the app, you must use
  purchase methods other than in-app purchase to collect those payments, such as Apple
  Pay or traditional credit card entry.»
- 5.3 Gaming, Gambling, and Lotteries: «Only include this functionality if you've fully
  vetted your legal obligations everywhere you make your app available and are prepared
  for extra time during the review process.»
- 5.3.1: «Sweepstakes and contests must be sponsored by the developer of the app.»
- 5.3.2: «Official rules for sweepstakes, contests, and raffles must be presented in the
  app and make clear that Apple is not a sponsor or involved in the activity in any
  manner.»
- 5.3.3: «Apps may not use in-app purchase to purchase credit or currency for use in
  conjunction with real money gaming of any kind.»
- 5.3.4: «Apps that offer real money gaming (such as sports betting, poker, casino
  games, horse racing) or lotteries must have necessary licensing and permissions in
  the locations where the app is used […]»

**Google Play, «Real-Money Gambling, Games, and Contests»**
(<https://support.google.com/googleplay/android-developer/answer/9877032>): Google Play
«generally prohibits apps from facilitating real-money gambling and gaming», det vil si
apper som lar brukerne «wager, stake, or participate using real money» «to obtain a prize
of real world monetary value». Eksempler på brudd: «Games that accept money in exchange
for an opportunity to win a physical or monetary prize» og «Apps that accept or manage
wagers, in-app currencies, winnings, or deposits». Siden har ikke noe eget unntak for
idrettsarrangementer i den virkelige verden.

**Vurderingen:**

1. **Kontingenten er ikke kjøp i appen og ikke pengespill.** Den låser ikke opp noe i
   appen. Den betaler for en golfrunde på en ekte bane, altså en tjeneste som brukes
   utenfor appen (3.1.3(e)), og den går rett til arrangøren gjennom arrangørens egen
   lenke eller Vipps. Appen verken tar imot eller forvalter penger, og avkrysningen
   «betalt» er en liste, ikke penger. Svarene «Gambling: No» og «Pengespill med ekte
   penger: Nei» står.
2. **Premiebordet er den reelle risikoen hos Apple.** En reviewer kan lese
   «startkontingent + premiebord» som en konkurranse med premier som utvikleren ikke
   står bak (5.3.1), og som mangler «Apple is not a sponsor» (5.3.2). Vår lesning er at
   5.3 gjelder konkurranser appen selv holder, mens en klubbturnering er et arrangement
   på banen. Reglene for selve runden (format og handicap) vises allerede i appen
   (`formatGuideCopy.ts`), og vi leser dem som «official rules» i 5.3.2. Det minste som
   må til, er gjort: (a) én linje under premiebordet i appen som sier at arrangøren
   deler ut premiene og at verken Tørny eller Apple står bak (`PRIZE_TEXT.organiserNote`,
   PR #2859, i bygg 15), (b) et avsnitt i notatet til revieweren som sier det samme
   (`app-store-review-konto.md`, «ENTRY FEE AND PRIZES»), og (c) ingen ord i
   butikkteksten som lokker med premier.
3. **Hos Google er risikoen lavere.** Appen tar ikke imot penger, så eksemplene over
   passer ikke. Linja under premiebordet står også i Android-appen, uten ordet Apple.
   Forklaringen kommer ikke i App access-teksten fordi den ikke får plass innenfor 500
   tegn (`play-store-metadata.md`).
4. **Premiebordet kan inneholde kroner i fritekst.** Arrangøren kan skrive «1000 kr»
   som premie. Vi stenger ikke for det: en golfturnering med pengepremie hos
   arrangøren er lovlig, og en sperre ville vært over-engineering. Linja i appen og
   review-notatet dekker det.
5. **Etikettene oppgir for mye heller enn for lite.** Vipps-nummeret er ofte et
   telefonnummer (Phone Number), og «betalt» er en betaling spilleren har gjort
   (Purchase History). Se personvern-etiketten over.

VERIFICATION GAP: bare Apples egen gjennomgang kan bekrefte lesningen av 5.3.1, at en
klubbturnering med kontingent og et premiebord arrangøren deler ut ikke regnes som en
konkurranse appen selv holder. Vi sender inn med linja og notatet, og tar det opp i
svaret hvis reviewer spør.
