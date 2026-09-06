# App Store-oppføringen — personvern-etikett og butikk-tekst

Alt eieren limer inn i App Store Connect for iOS-appen, samlet ett sted. Skrevet for
N8 (#1954, P6). Klikkstien og «hva du skal se etter» ligger i eier-kommentaren på
issuet; denne fila er kilden tekstene kopieres fra, så neste innsending ikke må
finne dem opp på nytt.

**Regelen som styrer teksten:** vi lover bare det appen faktisk gjør. Nettsiden kan
mer enn appen, og en beskrivelse som selger nettsidens repertoar er en avvisning som
venter på å skje. Aldri «over 20 spillformer», aldri varslinger (push finnes ikke i
appen), aldri scramble, aldri cup eller liga.

## Personvern-etikett (App Privacy)

Appen samler tre ting, alle for at appen skal virke, alle koblet til brukeren, ingen
til sporing. Ingen posisjon: appen leser aldri hvor telefonen er (`expo-location`
finnes ikke blant avhengighetene, og `native/app/src` har null treff på geolokasjon).
Ingen analyse- eller krasj-SDK-er heller — `expo-network` sier bare om telefonen har
nett, og sender ingenting.

Første spørsmål i skjemaet: **«Do you or your third-party partners collect data from
this app?» → Yes.**

Så hakes disse av, én rad per datatype:

| Kategori i skjemaet | Datatype | Hva det er hos oss | Purposes | Linked to the user? | Used for tracking? |
|---|---|---|---|---|---|
| Contact Info | **Email Address** | Adressen kontoen logger inn med (engangskode) | App Functionality | **Yes** | **No** |
| Contact Info | **Name** | Navnet spilleren fyller inn i profilen, som medspillerne ser på tavla | App Functionality | **Yes** | **No** |
| Identifiers | **User ID** | Konto-id-en radene i basen henger på | App Functionality | **Yes** | **No** |
| User Content | **Other User Content** | Slagene, rundene og resultatene | App Functionality | **Yes** | **No** |

Ingenting annet hakes av. Særlig: **Location** står tomt, **Usage Data** og
**Diagnostics** står tomme, og siste spørsmål — «Do you use this data to track you or
your device across apps and websites owned by other companies?» — er **No** for alle
fire radene.

Etterpå skal oppsummeringen på siden vise **Data Linked to You** med Contact Info,
Identifiers og User Content, og **Data Not Collected / Data Not Used to Track You**
for resten.

**Endring fra #1284-utkastet:** posisjon er tatt ut. Utkastet hadde et forbehold om
green-pins (#1210); den funksjonen bor på nettsiden, og native-appen leser ikke
posisjon i det hele tatt. **Name** er lagt til i Contact Info: profilen krever navn,
og en etikett som underrapporterer er en avvisningsgrunn.

## App-navn og URL-er

| Felt | Verdi |
|---|---|
| Navn | `Tørny – golfturneringer` (satt ved opprettelsen, endres ikke nå) |
| Support-URL | `https://tornygolf.no` |
| Marketing-URL | (tom) |
| Personvern-URL | `https://tornygolf.no/legal/privacy` |
| Aldersgrense | 4+ |
| Kategori | Sports (primær), Utilities (sekundær) |

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
Slå på lengste drive og nærmest pinnen på hullene dere velger, så har dere noe å krangle om i baren etterpå.

NÅR RUNDEN ER FERDIG
Du leverer kortet ditt, arrangøren avslutter runden, og resultatet er klart for alle som var med.

Tørny er laget for norske runder og norske baner. Du bruker den samme kontoen på tornygolf.no.
```

### Hva som med vilje IKKE står der

- **«Over 20 spillformer.»** Nettsiden har 22 aktive formater; appen oppretter åtte
  (`native/app/src/lib/appFormats.ts`). Åtte er det vi lover.
- **Varslinger.** Appen har ingen push (N7-beslutningen). «Resultatet er klart»-mailen
  kommer fra serveren, ikke fra appen, og er derfor ikke et app-løfte.
- **Scramble, cup og liga.** Finnes på nettsiden, ikke i appen.
- **Invitasjoner.** I appen velger du blant dem du allerede spiller med; å invitere
  noen ny skjer på nettsiden (`PlayersStep` sender deg dit).

## Skjermbilder

6,9" er den eneste størrelsen som kreves når den er levert (Apple,
screenshot-specs, lest 2026-09-06). Godtatte portrettmål for 6,9": 1260 × 2736,
1290 × 2796 eller 1320 × 2868. 6,5" er valgfri når 6,9" finnes — App Store
Connect skalerer selv. **Ingen alfakanal**: Apple avviser PNG-er med
gjennomsiktighet, og simulatorens egne skjermbilder har den. De fem bildene er
derfor flatet til RGB.

Bildene ligger i `~/Desktop/Tørny-skjermbilder/`, nummerert i den rekkefølgen de
skal ligge i oppføringen: hjem, hull-føring, tavle, sluttresultat, profil.

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
