# App Store-oppføringen — personvern-etikett og butikk-tekst

Alt eieren limer inn i App Store Connect for iOS-appen, samlet ett sted. Skrevet for
N8 (#1954, P6) og oppdatert i #2561 for neste innsending: varsler på iOS,
AI-spørsmålet, ingen kroner i appen og bare Norge. Klikkstien og «hva du skal se
etter» ligger i eier-kommentaren på issuet; denne fila er kilden tekstene kopieres
fra, så neste innsending ikke må finne dem opp på nytt.

**Regelen som styrer teksten:** vi lover bare det appen faktisk gjør. Nettsiden kan
mer enn appen, og en beskrivelse som selger nettsidens repertoar er en avvisning som
venter på å skje. Aldri «over 20 spillformer», aldri kroner eller pengeoppgjør
(appen viser dem ikke ved lansering), aldri rundereferatet (det står på nettsiden og
i e-posten, ikke i appen), aldri scramble, aldri cup eller liga.

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

Alt appen samler, er for at appen skal virke (App Functionality), og alt er koblet
til kontoen. Ingenting brukes til sporing.

Første spørsmål i skjemaet: **«Do you or your third-party partners collect data from
this app?» → Yes.**

Så hakes disse av, én rad per datatype:

| Kategori i skjemaet | Datatype | Hva det er hos oss, og kilden | Purposes | Linked to the user? | Used for tracking? |
|---|---|---|---|---|---|
| Contact Info | **Email Address** | Adressen kontoen logger inn med engangskoden (`native/app/src/screens/Login.tsx`, `requestLoginCode`). | App Functionality | **Yes** | **No** |
| Contact Info | **Name** | Navnet spilleren fyller inn i profilen, og som medspillerne ser på tavla (`CompleteProfile.tsx`, feltet `complete-profile-name`). | App Functionality | **Yes** | **No** |
| Contacts | **Contacts** | Vennelista, og e-postadressene spilleren taster for å legge til eller invitere en venn (`native/app/src/data/friends.ts`, `addFriendByEmail` og `inviteFriend`). Apple regner en «social graph» som kontakter. Appen leser aldri kontaktene på telefonen. | App Functionality | **Yes** | **No** |
| Identifiers | **User ID** | Konto-id-en radene i databasen henger på (Supabase Auth). | App Functionality | **Yes** | **No** |
| Identifiers | **Device ID** | Varsel-tokenet fra Apple, som `turnOnPush` lagrer i `apns_tokens` sammen med konto-id-en, bare når spilleren slår på varsler (`native/app/src/data/pushDevice.ts:115`). Se tolkningen under. | App Functionality | **Yes** | **No** |
| User Content | **Gameplay Content** | Slagene, resultatene og handicapet poengregningen bygger på, og hvem som spiller i hvilken runde (`lib/scoring/`, `CompleteProfile.tsx`, feltet `complete-profile-hcp`). Apple: «Such as saved games, multiplayer matching or gameplay logic, or user-generated content in-game». | App Functionality | **Yes** | **No** |
| User Content | **Other User Content** | Navnet arrangøren gir runden (`native/app/src/components/create/SetupStep.tsx`, feltet `create-name`). Apple: «Any other user-generated content». | App Functionality | **Yes** | **No** |

**Varsel-tokenet er en tolkning.** Apple har ingen regel som nevner varsel-tokens ved
navn. Vi oppgir det som Device ID ut fra to sitater:

- Etiketten: Device ID er «Such as the device's advertising identifier, or other
  device-level ID» (<https://developer.apple.com/app-store/app-privacy-details/>).
- APNs-dokumentasjonen: «This address takes the form of a device token unique to both
  the device and your app»
  (<https://developer.apple.com/documentation/usernotifications/registering-your-app-with-apns>).

Tokenet blir liggende i databasen så lenge varslene er på, og det er koblet til kontoen,
så det er samlet inn etter definisjonen over.

Dette hakes **ikke** av, og her er grunnen:

- **Location.** Appen leser aldri hvor telefonen er: `expo-location` finnes ikke
  blant avhengighetene, og `native/app/src` har null treff på geolokasjon.
  «Vis på kart» på startbilletten åpner Kart med banens navn
  (`TicketStub.tsx`, `mapSearchUrl`), ikke med telefonens posisjon.
- **Usage Data og Diagnostics.** Appen har ingen analyse- eller krasj-SDK.
  `expo-network` sier bare om telefonen har nett, og sender ingenting.
- **Kalenderen.** «Legg til i kalender» åpner iOS sitt eget ark for ny hendelse
  (`native/app/src/lib/addToCalendar.ts`). Hendelsen blir på telefonen, og vi får
  ingenting tilbake, så den er ikke samlet inn.
- **Delingen.** Bildet av bag-taggen eller Kavalkaden lages på telefonen og gis til
  iOS sitt delingsark (`native/app/src/lib/shareImage.ts`), og «følg live»-lenka
  (når arrangøren har slått på live-følging) deles på samme måte (`shareLive.ts`). Spilleren velger selv hvor det
  går, og vi får ikke noe nytt.
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
Contacts, Identifiers og User Content, og **Data Not Used to Track You**.

**Endring fra #1284-utkastet:** posisjon er tatt ut. Utkastet hadde et forbehold om
green-pins (#1210); den funksjonen bor på nettsiden, og native-appen leser ikke
posisjon i det hele tatt. **Name** er lagt til i Contact Info: profilen krever navn,
og en etikett som underrapporterer er en avvisningsgrunn.

**Endring i #2561:** **Contacts** er lagt til (vennene kom i appen med #2256), og
**Device ID** for varsel-tokenet (varslene kom med #2256 PR 4). User Content er delt i
**Gameplay Content** (slag, resultater, handicap, hvem som spiller) og **Other User
Content** (rundenavnet).

## App-navn og URL-er

| Felt | Verdi |
|---|---|
| Navn | `Tørny – golfturneringer` (satt ved opprettelsen, endres ikke nå) |
| Support-URL | `https://tornygolf.no` |
| Marketing-URL | (tom) |
| Personvern-URL | `https://tornygolf.no/legal/privacy` |
| Aldersgrense | Regnes ut av Apples spørreskjema. Med svarene i «Aldersgrense (Apple)» blir den 13+ (var 4+). |
| Tilgjengelighet | Bare Norge (Pricing and Availability → App Availability). |
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

| Del og spørsmål | Svar | Hvorfor |
|---|---|---|
| In-App Controls: Parental Controls | No | Appen har ingen foreldrekontroll. |
| In-App Controls: Age Assurance | No | Appen sjekker ikke alder. |
| Capabilities: Unrestricted Web Access | No | Appen har ingen nettleser. Lenker til tornygolf.no åpnes i Safari, utenfor appen (`native/app/src/lib/webLink.ts`, `Linking.openURL`). Verken `react-native-webview` eller `expo-web-browser` er avhengigheter. |
| Capabilities: User-Generated Content | No | Det spillerne skriver (navn, spillnavn, slag), ser bare medspillerne og vennene, ikke folk flest. Apples definisjon krever «broad distribution». «Yes» gir også 4+, så svaret flytter ikke aldersgrensen. |
| Capabilities: Social Media | No | Spørsmålene om sosiale medier er påkrevd fra september 2026. Apples definisjon er innhold som spres «through a social feed or similar discovery method that visibly spreads content to many users». Appen har ingen strøm og ingen måte å spre innhold til mange på. Vennelista viser bare egne venner (`native/app/src/data/friends.ts`). |
| Capabilities: Messaging and Chat | No | Spillerne kan ikke skrive til hverandre i appen. En venneforespørsel er ingen melding. |
| Capabilities: Advertising | No | Appen har ingen reklame. |
| Mature Themes: Profanity or Crude Humor | None | Ingen. |
| Mature Themes: Horror/Fear Themes | None | Ingen. |
| Mature Themes: Alcohol, Tobacco, or Drug Use or References | None | Appen nevner det ikke (`native/app/src` har null treff på «baren» og «alkohol»). Beskrivelsen sa før «i baren etterpå»; nå står det «i klubbhuset», så butikkteksten heller ikke nevner alkohol. |
| Medical or Wellness: Medical or Treatment Information | No | Ingen. |
| Medical or Wellness: Health or Wellness Topics | No | Appen gir ingen råd om trening eller helse. Handicapet er et golfmål. |
| Sexuality or Nudity (alle) | None | Ingen. |
| Violence (alle, også våpen) | None | Ingen. |
| Chance-Based Activities: Gambling | No | Appen har ingen pengespill og viser ingen kroner ved lansering (`SHOW_KRONER_IN_APP = false` i `lib/launchRules.ts`). Det finnes ingen betaling i appen. |
| Chance-Based Activities: Simulated Gambling | None | Apples definisjon er «Betting or wagering without using real money or in-game currency that can be exchanged for real money». Skins, Wolf og Bingo Bango Bongo er måter å telle poeng på, og i appen er det ingen innsats: kronene er skjult (`lib/launchRules.ts`). |
| Chance-Based Activities: Contests | Frequent | Hver runde er en konkurranse med tavle og plasseringer. Det er hele appen. «Frequent» gir 13+. |
| Chance-Based Activities: Loot Boxes | No | Appen har ingen kjøp. |
| Additional Information: Override to Higher Age Rating | Nei | Ikke nødvendig. |

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

SIDETURNERINGER
Slå på lengste drive og nærmest pinnen på hullene dere velger, så har dere noe å krangle om i klubbhuset etterpå.

FØR OG UNDER RUNDEN
Legg runden inn i kalenderen med ett trykk. Slå på varsler hvis du vil vite når du blir invitert, når et scorekort venter på deg og når resultatet er klart. Har arrangøren slått på live-følging, kan du dele lenka, så kan de hjemme følge tavla mens dere spiller.

NÅR RUNDEN ER FERDIG
Du leverer kortet ditt, arrangøren avslutter runden, og resultatet er klart for alle som var med.

I romjula får du Kavalkaden, en oppsummering av golfåret ditt som du kan dele med gjengen. En språkmodell skriver teksten, og navnet ditt er bare med hvis du har sagt ja til det.

Tørny er laget for norske runder og norske baner. Du bruker den samme kontoen på tornygolf.no.
```

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
- **Rundereferatet.** AI-referatet etter runden står på nettsiden og i e-posten, ikke i
  appen. Kavalkaden er i appen, så den står i beskrivelsen.
- **Scramble, cup og liga.** Finnes på nettsiden, ikke i appen.
- **Invitasjoner til en runde.** I appen velger du blant dem du allerede spiller med; å
  invitere noen ny til en runde skjer på nettsiden (`PlayersStep` sender deg dit). En
  venn kan inviteres på e-post fra vennelista i appen (`inviteFriend`), men det er ikke
  et salgsargument.

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

Nye bilder tas i del E7 av #2561, etter at tavlekjeden og PR C er merget, så de viser
appen slik den sendes inn. Bildene fra `1.1.0 (3)` ligger i
`~/Desktop/Tørny-skjermbilder/`, nummerert i den rekkefølgen de skal ligge i
oppføringen: hjem, hull-føring, tavle, sluttresultat, profil. Avsnittene under
forteller hvordan de ble tatt, og samme vei gjelder for de nye.

### Hvordan de ble tatt — og hvorfor ikke mot prod

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
fikstur av oppdiktede spillere. Kontrakt §5 og runbooken foreskriver begge
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

### Fiksturen på staging

Fire oppdiktede spillere på et fantasidomene, der hovedpersonen — den ene som
vises på profil-skjermbildet — ligger på en `.example`-adresse. Den toppdomenen
er reservert av RFC 2606 og kan aldri bli en ekte postkasse, så adressen i bildet
kan ikke tilhøre noen. De spiller tre runder på Byneset North: «Søndagsrunden» (pågår, 7 hull tastet),
«Sommeravslutningen» (avsluttet, 18 hull) og «Torsdagsmatchen» (planlagt
matchplay). P4-dataene er ikke rørt. Fiksturen står igjen på staging, så bildene
kan tas om igjen uten å seede på nytt.
