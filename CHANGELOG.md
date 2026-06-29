<!-- ─────────────────────────────────────────────────────────────────────
     Format: les docs/changelog-conventions.md FØR ny oppføring.
     To seksjoner — Funksjoner (én linje per utgivelse) og Feilrettinger.
     Ny funksjon bærer tittel + brødtekst + lenke + cta_label (klar for Lanseringer).
     ───────────────────────────────────────────────────────────────────── -->

# Changelog

Alle bruker-synlige endringer i Tørny. Versjonering følger [Semantic Versioning](https://semver.org/lang/no/).

**Funksjoner** er hva som er nytt — én linje per utgivelse, brett ut for detaljer. **Feilrettinger** er alt som er blitt bedre, samlet og lukket per måned. Alfa-historikken før 1.0 ligger nederst.

---

## Funksjoner

<details>
<summary><strong>1.158 · Tell puttene dine</strong></summary>

[#939](https://github.com/jdlarssen/golf-app/issues/939) — Du kan nå telle putter per hull i slag- og stablefordspill. Slå på «Registrer putter» på hull-skjermen, før puttene mens du spiller, og se putte-snittet ditt under Historikk.

↳ /games · «Registrer putter»
</details>

<details>
<summary><strong>1.157 · Foreslå en idé til Tørny</strong></summary>

[#984](https://github.com/jdlarssen/golf-app/issues/984) — Nå kan du sende inn en idé til Tørny rett fra Klubbhuset. Blir den bygd, får du beskjed: «Vi bygde det du foreslo.»

↳ /foreslaa-ide · «Foreslå en idé»
</details>

<details>
<summary><strong>1.156 · Del live-lenke og følg turneringen fra sidelinjen</strong></summary>

[#938](https://github.com/jdlarssen/golf-app/issues/938) — Del en live-lenke så familie og klubbkompiser kan følge turneringen mens den spilles — og se hele feltet på tvers av flights — uten å logge inn. Oppretteren slår funksjonen på i spillet, og lenken virker som en permanent resultatslenke etter at runden er ferdig.

↳ /games · «Live-følg»
</details>

<details>
<summary><strong>1.155 · Heia medspillerne med emoji</strong></summary>

[#943](https://github.com/jdlarssen/golf-app/issues/943) — Nå kan du kaste en emoji — 👏 🔥 😂 💪 ⛳ 🐦 — på hvem som helst sin rad på resultattavla, både mens dere spiller og etter at runden er ferdig, og reaksjonene dukker opp live for alle i spillet.
</details>

<details>
<summary><strong>1.154 · Feir bragdene fra runden</strong></summary>

[#947](https://github.com/jdlarssen/golf-app/issues/947) — Gjør du en hole-in-one, eagle, turkey eller snowman i en runde, får du nå beskjed om det når spillet avsluttes. På profilen har du også fått en bragd-vegg: alle bragdene dine gjennom årene samlet på ett brett. De du har klart lyser i gull, resten venter på tur.

↳ /profile/historikk · «Statistikk»
</details>

<details>
<summary><strong>1.153 · Følg handicap-formen din</strong></summary>

[#941](https://github.com/jdlarssen/golf-app/issues/941) — Profilen viser nå en handicap-form-graf: score-differansen for hver runde tegnet over tid, så du ser om formen peker rett vei. Lavere er bedre — en kurve som faller betyr at du spiller bedre mot banens vanskelighet. Differansen fryses når runden avsluttes.

↳ /profile/historikk · «Statistikk»
</details>

<details>
<summary><strong>1.152 · Del resultatet i gruppechaten</strong></summary>

[#942](https://github.com/jdlarssen/golf-app/issues/942) — Når runden er ferdig kan du nå dele et pent resultatkort rett i WhatsApp eller Messenger. Kortet viser vinneren, topp 3 og din egen plassering — pluss dine morsomme sideturnering-seire denne runden (Konge av par 3, flest birdier, Snowman …). Ett trykk på «Del resultat» på leaderboardet, ingen skjermdump og beskjæring.

↳ /games · «Del resultat»
</details>

<details>
<summary><strong>1.151 · Varsler rett på telefonen</strong></summary>

[#24](https://github.com/jdlarssen/golf-app/issues/24) — Slå på varsler i profilen, så plinger telefonen når noen inviterer deg, et kort venter på godkjenning eller resultatet er klart, selv når appen er lukket. Telefonen spør om lov én gang.

↳ /profile · «Slå på varsler»
</details>

<details>
<summary><strong>1.150 · Tee-off rett i kalenderen</strong></summary>

[#945](https://github.com/jdlarssen/golf-app/issues/945) — Har spillet en planlagt tee-off, kan du nå legge den rett i telefonkalenderen. Du får et varsel en time før, så tee-tiden ikke glipper, og «Vis på kart» finner veien til banen.

↳ /games · «Legg til i kalender»
</details>

<details>
<summary><strong>1.149 · Lettere å taste med hanske</strong></summary>

[#944](https://github.com/jdlarssen/golf-app/issues/944) — Pluss- og minus-knappene på hull-skjermen er større, så de er lette å treffe med hanske og én hånd. Taster du feil, fjerner «Angre» scoren med ett trykk — ingen omvei innom menyen.

↳ /games · «Tast en runde»
</details>

<details>
<summary><strong>1.148 · Din sesong i tall</strong></summary>

[#946](https://github.com/jdlarssen/golf-app/issues/946) — Statistikk-fanen i historikken åpner nå med en sesong-oppsummering. Velg år, så ser du runder, snitt, beste runde og bragdene dine for den sesongen, satt opp mot året før. Snømenn teller vi for seg, for de er ingen bragd.

↳ /profile/historikk · «Se sesongen din»
</details>

<details>
<summary><strong>1.147 · Runder på én linje</strong></summary>

[#962](https://github.com/jdlarssen/golf-app/issues/962) — Runder-fanen i historikken er strammet inn: hver runde er nå én trykkbar rad med brutto stort og resultatet ved siden av, så du skanner hele sesongen i stedet for å scrolle gjennom høye kort.

↳ /profile/historikk · «Se rundene dine»
</details>

<details>
<summary><strong>1.146 · Snitt og beste per bane</strong></summary>

[#940](https://github.com/jdlarssen/golf-app/issues/940) — Historikken din åpner nå på statistikken: formkurven din og et nytt «Baner»-panel med snitt, beste og antall runder per bane. Den gamle runde-for-runde-lista ligger ett trykk unna under «Runder».

↳ /profile/historikk · «Se tallene dine»
</details>

<details>
<summary><strong>1.145 · Penger på spill</strong></summary>

Spiller dere veddemålsformatene om penger, setter du en kroneverdi per skin eller poeng, så regner leaderboardet ut oppgjøret og sier hvem som skylder hvem.

↳ /opprett-spill · «Spill om penger»

[#937](https://github.com/jdlarssen/golf-app/issues/937)
</details>

<details>
<summary><strong>1.144 · Formkurven får tall</strong></summary>

[#949](https://github.com/jdlarssen/golf-app/issues/949) — Formkurven viser nå hvor du startet, hvor du er nå og din beste runde — brutto og netto over de siste 20 rundene, med rekorden markert i gull.
</details>

<details>
<summary><strong>1.143 · Tallene dine</strong></summary>

[#936](https://github.com/jdlarssen/golf-app/issues/936) — Øverst i historikken din ligger nå en formkurve over brutto og netto for hver fullførte runde, så du ser med ett blikk om scoren er på vei opp eller ned.
</details>

<details>
<summary><strong>1.142 · Et ryddigere oppsett</strong></summary>

[#909](https://github.com/jdlarssen/golf-app/issues/909) — Spill-oppsettet ligger i panel du bretter ut når du trenger dem, og et publisert spill viser spillformen som et lite kort.
</details>

<details>
<summary><strong>1.141 · Spillerens klubbhus</strong></summary>

[#892](https://github.com/jdlarssen/golf-app/issues/892) — Klubbhuset møter deg som blir med på spill med en invitasjon til å sette opp en runde, klubbene dine listet rett opp, og spillene og cupene dine hvis du arrangerer.
</details>

<details>
<summary><strong>1.140 · Tall på flisene</strong></summary>

[#914](https://github.com/jdlarssen/golf-app/issues/914) — Klubbhuset viser tallene rett på flisene, og de fire flisene du bruker daglig står stort øverst — resten er samlet under «Mer i Sekretariatet».
</details>

<details>
<summary><strong>1.139 · Klubbhuset som kommandosentral</strong></summary>

[#864](https://github.com/jdlarssen/golf-app/issues/864) — Uleverte scorekort og scorekort som venter på godkjenning ligger i en «Krever handling»-stripe øverst, og ett trykk tar deg rett til spillet.
</details>

<details>
<summary><strong>1.138 · Nærmeste runde øverst</strong></summary>

[#880](https://github.com/jdlarssen/golf-app/issues/880) — Under «Mine spill» på Hjem ligger planlagte runder sortert etter når de starter, og det nærmeste spillet får en tydelig etikett som «I dag kl. 09:00» eller «I morgen».
</details>

<details>
<summary><strong>1.137 · Én dør til vennene</strong></summary>

[#870](https://github.com/jdlarssen/golf-app/issues/870) — Profilen har nå ett «Venner»-kort med et merke når noen har sendt deg en venneforespørsel, og alt om venner bor på Venner-siden.
</details>

<details>
<summary><strong>1.136 · Dine egne tall</strong></summary>

[#865](https://github.com/jdlarssen/golf-app/issues/865) — Profilen viser runder spilt, brutto-snitt og beste runde, pluss bragder som hole-in-one og birdie — og «Klubbstatistikker» heter nå «Toppliste» på Hjem.
</details>

<details>
<summary><strong>1.135 · Funn rett på Hjem</strong></summary>

[#879](https://github.com/jdlarssen/golf-app/issues/879) — Turneringer fra klubbene og vennene dine vises på Hjem også etter at du har fått ditt første spill, med et lite utvalg og en «Se alle»-snarvei.
</details>

<details>
<summary><strong>1.134 · Velg tema selv</strong></summary>

[#876](https://github.com/jdlarssen/golf-app/issues/876) — Du kan nå velge om appen skal være lys, mørk eller følge telefonens innstilling — valget ligger på profilen din og huskes til neste gang du åpner appen.
</details>

<details>
<summary><strong>1.133 · Live resultattavle</strong></summary>

[#679](https://github.com/jdlarssen/golf-app/issues/679) — Resultatlista oppdaterer seg av seg selv mens medspillerne taster, uansett spilleform — stableford, skins, wolf og «Hull for hull» følger med i sanntid.
</details>

<details>
<summary><strong>1.132 · Småfunn fra modus-gjennomgangen</strong></summary>

[#640](https://github.com/jdlarssen/golf-app/issues/640) — Etter en grundig gjennomgang av alle spillformer er en rekke detaljer på plass: banehandicap vises fra første blikk, lag-påmelding virker for alle lag-formater, og veiviseren teller spillere riktig.
</details>

<details>
<summary><strong>1.131 · Klubb-invitasjon på e-post</strong></summary>

[#644](https://github.com/jdlarssen/golf-app/issues/644) — Du kan nå invitere nye medlemmer til klubben på e-post selv om de ikke har Tørny fra før — de blir medlemmer med en gang de logger inn første gang, og du kan trekke tilbake ventende invitasjoner.
</details>

<details>
<summary><strong>1.130 · Lag-matchplay uten cup</strong></summary>

[#634](https://github.com/jdlarssen/golf-app/issues/634) — Fourball, foursomes, greensome, Chapman og gruesome matchplay kan nå settes opp rett i opprett-veiviseren, uten å gå via en cup — bare fordel spillerne på to sider og sett i gang.
</details>

<details>
<summary><strong>1.129 · Rydd i innboksen</strong></summary>

[#616](https://github.com/jdlarssen/golf-app/issues/616) — Du kan nå arkivere et varsel med ✕ eller tømme alle leste i ett trykk, så innboksen ikke bare vokser seg lang over sesongen.
</details>

<details>
<summary><strong>1.128 · Ingen blindveier i innboksen</strong></summary>

[#612](https://github.com/jdlarssen/golf-app/issues/612) — Lander du på en lenke som ikke finnes lenger, møter du en Tørny-side med vei tilbake i stedet for en svart engelsk feilmelding.
</details>

<details>
<summary><strong>1.127 · Sideturnering på matchplay-duellen</strong></summary>

[#585](https://github.com/jdlarssen/golf-app/issues/585) — Du kan nå ha sideturnering på matchplay — lengste drive og nærmest pinnen kåres som vanlig, og vinnerne vises i en liten seksjon under duell-resultatet.
</details>

<details>
<summary><strong>1.126 · Mailene på ditt språk</strong></summary>

[#594](https://github.com/jdlarssen/golf-app/issues/594) — E-postene fra Tørny — invitasjoner, resultater og påminnelser — kommer nå på det språket du har valgt i appen.
</details>

<details>
<summary><strong>1.125 · Spillformene på engelsk</strong></summary>

[#592](https://github.com/jdlarssen/golf-app/issues/592) — Står appen på engelsk, er spillformene nå engelske hele veien: navn, beskrivelser, regler og eksempler i veiviseren, oppslagsverket og på spillsiden.
</details>

<details>
<summary><strong>1.124 · Duell-kortet tilbake med sideturnering</strong></summary>

[#589](https://github.com/jdlarssen/golf-app/issues/589) — Spiller dere én mot én med sideturnering på, får du nå duell-kortet med versus-oppgjør og hull-for-hull-stripe — og sideturneringen i fanen ved siden av.
</details>

<details>
<summary><strong>1.123 · Venner du nylig har invitert i spiller-valget</strong></summary>

[#587](https://github.com/jdlarssen/golf-app/issues/587) — Folk du nettopp har sendt en venneforespørsel til dukker nå opp i «legg til spiller», så du kan sette dem på et spill med en gang uten å vente på svar.
</details>

<details>
<summary><strong>1.122 · Sideturnering på alle poengformater</strong></summary>

[#576](https://github.com/jdlarssen/golf-app/issues/576) — Har du skrudd på sideturnering, vises den nå på leaderboardet for alle poengformater — Wolf, Skins, Nassau, Nines, Bingo Bango Bongo og lag-formatene inkludert.
</details>

<details>
<summary><strong>1.121 · Engelsk hjem, spillformater, personvern og påmelding</strong></summary>

[#581](https://github.com/jdlarssen/golf-app/issues/581) — Bruker du Tørny på engelsk, er hele appens grensesnitt nå oversatt: hjem-skjermen, spillformat-oppslagsverket, personvernsiden og hele påmeldingsflyten.
</details>

<details>
<summary><strong>1.120 · Ditt resultat på avsluttede spill</strong></summary>

[#572](https://github.com/jdlarssen/golf-app/issues/572) — Hvert avsluttet spill-kort viser nå ditt eget resultat — «Du vant», «2. plass av 4» eller «4 skins» — så du ser med ett blikk hvordan det gikk.
</details>

<details>
<summary><strong>1.119 · Spill-arkiv og siste runder</strong></summary>

[#571](https://github.com/jdlarssen/golf-app/issues/571) — «Avsluttede spill» på hjem-siden viser nå bare de fem siste rundene, og en lenke tar deg til et nytt spill-arkiv der hele historikken er samlet og gruppert per måned.
</details>

<details>
<summary><strong>1.118 · Engelsk profil, venner, innboks og finn turneringer</strong></summary>

[#573](https://github.com/jdlarssen/golf-app/issues/573) — Bruker du Tørny på engelsk, er den personlige delen nå oversatt: profilen, vennelista, innboksen og «Finn turneringer».
</details>

<details>
<summary><strong>1.117 · Engelsk i klubb, liga og cup</strong></summary>

[#566](https://github.com/jdlarssen/golf-app/issues/566) — Bruker du Tørny på engelsk, er klubb-livet nå oversatt: klubbrommet, ligaene, cup-styringen og Klubbhuset.
</details>

<details>
<summary><strong>1.116 · Engelsk i Sekretariatet</strong></summary>

[#563](https://github.com/jdlarssen/golf-app/issues/563) — Styrer du turneringer på engelsk, er hele Sekretariatet nå oversatt: resultatprotokollen, spill-styringen, spillere, baner, formater og lanseringer.
</details>

<details>
<summary><strong>1.115 · Engelsk i opprett-flyten</strong></summary>

[#561](https://github.com/jdlarssen/golf-app/issues/561) — Setter du opp spill eller baner på engelsk, er hele flyten nå oversatt: veiviseren steg for steg, hurtig-oppsettet og baneskjemaet.
</details>

<details>
<summary><strong>1.114 · Engelsk i hele kjernesløyfa</strong></summary>

[#554](https://github.com/jdlarssen/golf-app/issues/554) — Spiller du på engelsk, er hele runden nå oversatt: spillsiden, scoreføringen hull for hull, scorekortet og leaderboardet for alle spillformene.
</details>

<details>
<summary><strong>1.113 · Norsk og engelsk i appen</strong></summary>

[#552](https://github.com/jdlarssen/golf-app/issues/552) — Du kan nå bytte mellom norsk og engelsk rett på innloggingssiden — valget huskes, og etter innlogging ligger samme velger under «Språk» på profilen din.
</details>

<details>
<summary><strong>1.112 · Flighter i små spill</strong></summary>

[#543](https://github.com/jdlarssen/golf-app/issues/543) — I singelmatch og spill med inntil fire spillere ser og fører dere scorer for hverandre — uten ekstra oppsett.
</details>

<details>
<summary><strong>1.111 · Planlagt start på tee-tid</strong></summary>

[#502](https://github.com/jdlarssen/golf-app/issues/502) — Planlagte spill starter presis på tee-tid av seg selv, og alle spillere får et «Runden er i gang»-varsel i innboksen.
</details>

<details>
<summary><strong>1.110 · Matchplay · duellkort i resultatlista</strong></summary>

[#546](https://github.com/jdlarssen/golf-app/issues/546) — Resultatlista for matchplay 1 mot 1 ser nå ut som en duell: vunne hull i farge, dragkamp-stripe og stilling hull for hull.
</details>

<details>
<summary><strong>1.109 · Matchplay · åpen påmelding med side-valg</strong></summary>

[#544](https://github.com/jdlarssen/golf-app/issues/544) — Melder du deg på et åpent matchplay-spill, velger du hvilken side du vil spille på — full side er sperret og spillet starter ikke før begge sidene er klare.
</details>

<details>
<summary><strong>1.108 · Cup · alle kan arrangere</strong></summary>

[#526](https://github.com/jdlarssen/golf-app/issues/526) — Du kan nå lage din egen cup: sett opp lagene, plukk vennene dine og kjør en Ryder Cup på opptil fire matcher.
</details>

<details>
<summary><strong>1.107 · Veiviser · klubb for klubber, kompis vokser</strong></summary>

[#525](https://github.com/jdlarssen/golf-app/issues/525) — «Klubb-turnering» dukker bare opp hvis du har en klubb å arrangere for, og kompis-runden tar nå opptil 24 spillere.
</details>

<details>
<summary><strong>1.106 · Klubb-cup</strong></summary>

[#524](https://github.com/jdlarssen/golf-app/issues/524) — Klubben din kan nå kjøre sin egen cup — klubb-admin setter den opp, plukker lagene fra medlemmene og styrer hele runden fra klubb-siden.
</details>

<details>
<summary><strong>1.105 · Hjem · finn turneringer øverst</strong></summary>

[#500](https://github.com/jdlarssen/golf-app/issues/500) — «Finn turneringer» ligger nå rett under spillene dine på hjem-skjermen, og spillformatene har fått sin egen flate i Klubbhuset.
</details>

<details>
<summary><strong>1.104 · Veiviser · kompakte format-kort</strong></summary>

[#498](https://github.com/jdlarssen/golf-app/issues/498) — Format-steget viser nå kompakte kort med bare navn og solo/lag-merke — velger du ett, folder det seg ut med forklaring og en full formatoversikt er ett trykk unna.
</details>

<details>
<summary><strong>1.103 · Stableford · hull for hull</strong></summary>

[#496](https://github.com/jdlarssen/golf-app/issues/496) — Etter en stableford-runde viser «Hull for hull» poeng per spiller hull for hull, med stillingen øverst og hvem som tok flest på hvert hull.
</details>

<details>
<summary><strong>1.102 · Slagspill · hull for hull</strong></summary>

[#496](https://github.com/jdlarssen/golf-app/issues/496) — Etter en slagspill-runde viser «Hull for hull» et klassisk scorekort med brutto og netto per spiller og hvem som hadde lavest netto på hvert hull.
</details>

<details>
<summary><strong>1.101 · Nassau · hull for hull</strong></summary>

[#496](https://github.com/jdlarssen/golf-app/issues/496) — Etter en Nassau-runde viser «Hull for hull» de tre veddemålene hver for seg — For 9, Bak 9 og hele runden — med netto per spiller hull for hull.
</details>

<details>
<summary><strong>1.100 · Bingo Bango Bongo · hull for hull</strong></summary>

[#496](https://github.com/jdlarssen/golf-app/issues/496) — Etter en Bingo Bango Bongo-runde viser «Hull for hull» hvem som tok hver bingo, bango og bongo på hvert hull.
</details>

<details>
<summary><strong>1.99 · Acey-Deucey · hull for hull</strong></summary>

[#496](https://github.com/jdlarssen/golf-app/issues/496) — Etter en Acey-Deucey-runde viser «Hull for hull» alle fire spillerne hull for hull: hvem som tok ace-en og hvem som satt igjen med deuce-en.
</details>

<details>
<summary><strong>1.98 · Round Robin · hull for hull</strong></summary>

[#496](https://github.com/jdlarssen/golf-app/issues/496) — Etter en Round Robin-runde viser «Hull for hull» hvordan makkerne roterer hvert sjette hull og hva hver av dere scoret hull for hull.
</details>

<details>
<summary><strong>1.97 · Nines · hull for hull</strong></summary>

[#496](https://github.com/jdlarssen/golf-app/issues/496) — Etter en Nines-runde viser «Hull for hull» hvem som tok hvert hull og hvor mange poeng hver spiller fikk — lavest score henter mest.
</details>

<details>
<summary><strong>1.96 · Wolf · hull for hull</strong></summary>

[#496](https://github.com/jdlarssen/golf-app/issues/496) — Etter en Wolf-runde viser «Hull for hull» hvem som var Wolf, hva valget ble og hvem som vant hvert hull.
</details>

<details>
<summary><strong>1.95 · Skins · hull for hull og duell</strong></summary>

[#496](https://github.com/jdlarssen/golf-app/issues/496) — Etter en Skins-runde viser «Hull for hull» hvem som vant hvert hull og hvordan potten rullet videre; var dere to, kåres duellen på et eget scoreboard.
</details>

<details>
<summary><strong>1.94 · Liga · stableford</strong></summary>

[#452](https://github.com/jdlarssen/golf-app/issues/452) — Du kan nå velge spillform når du lager en liga: slagspill, stableford eller modifisert stableford — velger du stableford teller sesongen poeng i stedet for slag.
</details>

<details>
<summary><strong>1.93 · Liga · meld deg på selv</strong></summary>

[#452](https://github.com/jdlarssen/golf-app/issues/452) — Er du klubbmedlem kan du nå melde deg på klubbens liga selv så lenge den ikke har startet, og melde deg av igjen frem til første runde.
</details>

<details>
<summary><strong>1.92 · Liga · poeng per plassering</strong></summary>

[#452](https://github.com/jdlarssen/golf-app/issues/452) — Du kan nå la ligaen avgjøres på poeng: vinneren av hver runde får flest poeng ned til ett for sisteplass, og sesongen er summen.
</details>

<details>
<summary><strong>1.91 · Liga · netto, brutto og beste runder</strong></summary>

[#452](https://github.com/jdlarssen/golf-app/issues/452) — Ligaen kan nå kåre vinneren på netto, brutto eller begge side om side, og du kan la sesongen telle bare spillerens beste runder.
</details>

<details>
<summary><strong>1.90 · Veiviser · tydeligere format-valg</strong></summary>

[#477](https://github.com/jdlarssen/golf-app/issues/477), [#478](https://github.com/jdlarssen/golf-app/issues/478) — Når du setter opp et spill ser du med en gang om formatet spilles solo eller på lag, og lagstørrelse-valget viser bare størrelsene formatet faktisk støtter.
</details>

<details>
<summary><strong>1.89 · Venner vokser av seg selv</strong></summary>

[#481](https://github.com/jdlarssen/golf-app/issues/481) — Inviterer du noen på e-post og de blir med i spillet, blir dere automatisk venner — klare i lista neste gang du skal legge til spillere.
</details>

<details>
<summary><strong>1.88 · Klubb-liga · dedikert styringsflate</strong></summary>

[#485](https://github.com/jdlarssen/golf-app/issues/485) — Styrer du en klubb-liga, gjør du det nå fra klubbens egen side: start og avslutt ligaen, legg til runder og deltakere, eller slett den.
</details>

<details>
<summary><strong>1.87 · Klubb-liga · klubb-admin styrer</strong></summary>

[#483](https://github.com/jdlarssen/golf-app/issues/483) — Er du eier eller admin i en klubb kan du nå styre klubb-ligaen selv: start og avslutt den, legg til runder og deltakere, og utvid spillevinduer.
</details>

<details>
<summary><strong>1.86 · Klubb-liga</strong></summary>

[#480](https://github.com/jdlarssen/golf-app/issues/480) — Er du eier eller admin i en klubb kan du nå sette opp en liga rett fra klubb-siden — deltakerlista viser klubbens medlemmer og alle i klubben ser ligaen.
</details>

<details>
<summary><strong>1.85 · Venner i spiller-pickeren</strong></summary>

[#464](https://github.com/jdlarssen/golf-app/issues/464) — Skal du legge til spillere ser du nå bare vennene dine i lista; arrangerer du for en klubb vises klubbens medlemmer.
</details>

<details>
<summary><strong>1.84 · Bekreftet deltakelse</strong></summary>

[#463](https://github.com/jdlarssen/golf-app/issues/463) — Når noen legger deg til i et spill eller en liga, blir du merket «Ikke bekreftet» til du sier ja — merkelappen forsvinner så snart du åpner spillet.
</details>

<details>
<summary><strong>1.83 · Liga</strong></summary>

[#453](https://github.com/jdlarssen/golf-app/issues/453) — Du kan nå sette opp en liga: velg bane, spillfrekvens og hvordan vinneren kåres — spillerne har hele runde-vinduet på seg og tabellen fylles ut etter hvert som flightene leveres.
</details>

<details>
<summary><strong>1.82 · Cup-start-varsel</strong></summary>

[#417](https://github.com/jdlarssen/golf-app/issues/417) — Når en cup settes i gang dukker det opp et «Cupen har startet»-varsel i appen for alle deltakerne — er du ikke innen rekkevidde, får du en mail i stedet.
</details>

<details>
<summary><strong>1.81 · Venner på Tørny</strong></summary>

[#369](https://github.com/jdlarssen/golf-app/issues/369), [#408](https://github.com/jdlarssen/golf-app/issues/408) — Legg til folk du har spilt med, søk dem opp på e-post, eller del en lenke som gjør den som åpner den til venn med deg på flekken.
</details>

<details>
<summary><strong>1.80 · Klubber: eierskap og avtaler</strong></summary>

[#50](https://github.com/jdlarssen/golf-app/issues/50) — Klubber settes nå opp via en avtale — send en e-post til klubb@tornygolf.no, så fikser vi resten.
</details>

<details>
<summary><strong>1.79 · Klubber: opprett og bli med</strong></summary>

[#442](https://github.com/jdlarssen/golf-app/issues/442) — Du kan nå lage din egen klubb i Tørny, bli eier med en gang, og ha den klar under Klubbhuset.
</details>

<details>
<summary><strong>1.78 · Klubbhuset, ett rom for alle</strong></summary>

[#392](https://github.com/jdlarssen/golf-app/issues/392) — Klubbhuset er nå en fast fane nederst, ved siden av Hjem, Innboks og Profil — trykk den for å sette opp runder eller finne admin-verktøy.
</details>

<details>
<summary><strong>1.77 · Styr ditt eget spill</strong></summary>

[#429](https://github.com/jdlarssen/golf-app/issues/429) — Lagde du spillet, bestemmer du hvem som er med: legg til, inviter på e-post, fjern spillere, og godkjenn scorekort på vegne av flighten om nødvendig.
</details>

<details>
<summary><strong>1.76 · Rediger og slett ditt eget spill</strong></summary>

[#428](https://github.com/jdlarssen/golf-app/issues/428) — Du som lagde spillet kan nå redigere bane, tee-off, spillere og innstillinger, og slette utkast eller planlagte runder selv.
</details>

<details>
<summary><strong>1.75 · Lag og styr ditt eget spill</strong></summary>

[#427](https://github.com/jdlarssen/golf-app/issues/427) — Nå kan du lage ditt eget spill rett fra forsiden — du setter opp runden, den starter automatisk ved tee-off, og du avslutter den selv.
</details>

<details>
<summary><strong>1.74 · Baner alle kan legge til</strong></summary>

[#366](https://github.com/jdlarssen/golf-app/issues/366) — Mangler hjemmebanen din? Nå kan du legge den til selv med hull, par og tee-er, så havner den i biblioteket klar til bruk.
</details>

<details>
<summary><strong>1.73 · Misbruksvern før åpen påmelding</strong></summary>

[#365](https://github.com/jdlarssen/golf-app/issues/365) — Et usynlig skjold blokkerer engangs-e-post på innlogging, så ingen kan masseopprette kontoer — bruker du vanlig adresse, merker du ingenting.
</details>

<details>
<summary><strong>1.72 · Avslutningsvarsel for cup</strong></summary>

[#377](https://github.com/jdlarssen/golf-app/issues/377) — Når en cup er ferdigspilt, dukker resultatet opp som varsel i appen — er du borte, får du det på e-post i stedet.
</details>

<details>
<summary><strong>1.71 · Leveringspåminnelse</strong></summary>

[#376](https://github.com/jdlarssen/golf-app/issues/376) — Har du tastet alle 18 hull men glemt å levere, minner appen deg på det — og er du borte, kommer påminnelsen på e-post.
</details>

<details>
<summary><strong>1.70 · Smidigere lagpåmelding</strong></summary>

[#362](https://github.com/jdlarssen/golf-app/issues/362) — Å melde på et lag er mindre styr: feltene sier fra med en gang noe er galt, og du søker opp medspillere du har spilt med før i stedet for å taste e-posten på nytt.
</details>

<details>
<summary><strong>1.69 · Profilen din, ryddigere og smartere</strong></summary>

[#401](https://github.com/jdlarssen/golf-app/issues/401) — Profil-siden har fått nytt ansikt med navn og handicap øverst, plusshandicap med ett trykk, og kjønn og spillerklasse som knapper.
</details>

<details>
<summary><strong>1.68 · Be om plass til private spill</strong></summary>

[#368](https://github.com/jdlarssen/golf-app/issues/368) — Lander du på et privat spill du ikke er invitert til, kan du be arrangøren om plass med ett trykk — de slipper deg inn eller avslår.
</details>

<details>
<summary><strong>1.67 · Finn turneringer</strong></summary>

[#357](https://github.com/jdlarssen/golf-app/issues/357) — Du finner og blir med i nye turneringer rett fra Hjem, også de som krever at arrangøren slipper deg inn.
</details>

<details>
<summary><strong>1.66 · Vedvarende navigasjon</strong></summary>

[#355](https://github.com/jdlarssen/golf-app/issues/355) — En fast meny med Hjem, Innboks og Profil ligger nederst på alle sider, så du når alt med ett trykk.
</details>

<details>
<summary><strong>1.65 · Trekk spiller fra runden</strong></summary>

[#386](https://github.com/jdlarssen/golf-app/issues/386) — Dro noen hjem tidlig? Trekk dem fra spillet — de står som «Trukket» uten plassering, og resten av leaderboardet er upåvirket.
</details>

<details>
<summary><strong>1.64 · Avslutt selv om noen ikke har levert</strong></summary>

[#375](https://github.com/jdlarssen/golf-app/issues/375) — Mangler én spiller levering, kan du nå avslutte likevel — du ser hvem det gjelder, bekrefter, og de blir stående som «ikke levert».
</details>

<details>
<summary><strong>1.63 · Velg antall spillere før format</strong></summary>

[#373](https://github.com/jdlarssen/golf-app/issues/373) — I kompis-runden velger du antall spillere først, og bare formater som passer det antallet vises — så slipper du mismatch to steg senere.
</details>

<details>
<summary><strong>1.62 · Best ball for alle kompislaget</strong></summary>

[#374](https://github.com/jdlarssen/golf-app/issues/374) — Du kan nå spille best ball med 4 eller 6 spillere, ikke bare 8 — velg et partall antall og fordel 2 per lag.
</details>

<details>
<summary><strong>1.61 · Cup-veiviser: generer alle matcher</strong></summary>

[#219](https://github.com/jdlarssen/golf-app/issues/219) — Generer et helt cup-program på sekunder: velg lag, bane, formatoppsett og paringsmetode, forhåndsvis, og opprett alt i ett trykk.
</details>

<details>
<summary><strong>1.60 · Modus-skole: detaljsider</strong></summary>

[#307](https://github.com/jdlarssen/golf-app/issues/307) — Hver spillform har sin egen side med fyldigere forklaring og konkret eksempel — og arrangører kan endre selve forklaringene fra Sekretariatet.
</details>

<details>
<summary><strong>1.59 · Gruesome matchplay + familie-leaderboard</strong></summary>

[#291](https://github.com/jdlarssen/golf-app/issues/291) — Gruesome matchplay er klar: motstander velger hvilken av tee-ballene dere må spille videre, og leaderboardet viser nå ekte matchplay-resultat for hele alternate-shot-familien.
</details>

<details>
<summary><strong>1.58 · Chapman matchplay</strong></summary>

[#290](https://github.com/jdlarssen/golf-app/issues/290) — Chapman matchplay (Pinehurst) er klar for cupen: begge slår ut, bytt til partners ball som andreslag, velg beste, og spill annenhver derfra med lag-handicap etter Chapman-formelen.
</details>

<details>
<summary><strong>1.57 · Greensome matchplay</strong></summary>

[#289](https://github.com/jdlarssen/golf-app/issues/289) — Greensome matchplay er klar for cupen: begge slår ut, velg beste tee-ball, og spill annethvert slag derfra med WHS-greensome-handicap.
</details>

<details>
<summary><strong>1.56 · Patsome</strong></summary>

[#286](https://github.com/jdlarssen/golf-app/issues/286) — Ny spillform: Patsome for lag på to, der runden er delt i tre deler — 4BBB, greensome og foursomes — seks hull av gangen med stableford-poeng fra alle tre.
</details>

<details>
<summary><strong>1.55 · Shamble / Champagne Scramble</strong></summary>

[#285](https://github.com/jdlarssen/golf-app/issues/285) — Ny lagform: Shamble, der alle slår ut, laget tar beste utslag, og alle spiller inn sin egen ball — og i Champagne Scramble velger du selv hvor mange av scorene som teller.
</details>

<details>
<summary><strong>1.54 · Florida Scramble</strong></summary>

[#283](https://github.com/jdlarssen/golf-app/issues/283) — Ny spillform: Florida Scramble, der laget spiller én ball men den som slo det valgte slaget står over neste — slik må hele laget bidra gjennom hullet.
</details>

<details>
<summary><strong>1.53 · Ambrose</strong></summary>

[#284](https://github.com/jdlarssen/golf-app/issues/284) — Ny spillform: Ambrose, der hele laget spiller én ball med felles handicap etter den klassiske Ambrose-formelen — for lag på 2 eller 4.
</details>

<details>
<summary><strong>1.52 · Acey Deucey</strong></summary>

[#279](https://github.com/jdlarssen/golf-app/issues/279) — Ny spillform: Acey Deucey, der lavest score tar tre poeng og høyest score gir tre fra seg på hvert hull — for nøyaktig fire spillere.
</details>

<details>
<summary><strong>1.51 · Round Robin</strong></summary>

[#280](https://github.com/jdlarssen/golf-app/issues/280) — Ny spillform: Round Robin for fire, der partnerne bytter hvert sjette hull — slik har alle spilt med og mot hverandre når runden er ferdig.
</details>

<details>
<summary><strong>1.50 · Nines / Split Sixes</strong></summary>

[#278](https://github.com/jdlarssen/golf-app/issues/278) — Ny spillform: Nines / Split Sixes for tre spillere, der hvert hull deler ut en pottpott etter hvem som spilte det best.
</details>

<details>
<summary><strong>1.49 · Bingo Bango Bongo</strong></summary>

[#277](https://github.com/jdlarssen/golf-app/issues/277) — Ny spillform: Bingo Bango Bongo, der hvert hull gir tre poeng å kjempe om — bingo på green, bango nærmest, bongo først i hull.
</details>

<details>
<summary><strong>1.48 · 4BBB Stableford tydeliggjort</strong></summary>

[#282](https://github.com/jdlarssen/golf-app/issues/282) — Stableford for lag à 2 har fått et tydelig navn — 4BBB — med forklaring rett i spillform-kortet om at den beste poengsummen av dere to teller.
</details>

<details>
<summary><strong>1.47 · Modifisert Stableford</strong></summary>

[#281](https://github.com/jdlarssen/golf-app/issues/281) — Spill med proffskala: birdie og eagle gir mye, dobbeltbogey eller verre trekker fra — poengene kan gå i minus, så det lønner seg å satse.
</details>

<details>
<summary><strong>1.46 · Spillformer forklart for spillere</strong></summary>

[#299](https://github.com/jdlarssen/golf-app/issues/299) — En kort forklaring på spillformen ligger rett på spill-siden — trykk «Slik funker det», og du er i gang uten å måtte Google det.
</details>

<details>
<summary><strong>1.45 · Skins</strong></summary>

[#275](https://github.com/jdlarssen/golf-app/issues/275) — Hvert hull er verdt 1 skin; deler dere hullet ruller det videre og er verdt mer — resultatlista gjør opp hvem som tok hva.
</details>

<details>
<summary><strong>1.44 · Nassau</strong></summary>

[#276](https://github.com/jdlarssen/golf-app/issues/276) — Front 9, back 9 og hele runden er tre separate konkurranser — vinn alle tre og det heter «Hele tavla».
</details>

<details>
<summary><strong>1.43 · Wolf</strong></summary>

[#270](https://github.com/jdlarssen/golf-app/issues/270) — Fire spillere, én er Wolf per hull — velg partner, gå alene som Lone Wolf eller bli Blind Wolf, og like hull bærer potten videre.
</details>

<details>
<summary><strong>1.42 · Foursomes matchplay</strong></summary>

[#289](https://github.com/jdlarssen/golf-app/issues/289) — To og to deler én ball og alternerer slag; appen holder styr på hvem som slår ut per hull med riktig «X slår ut»-hint.
</details>

<details>
<summary><strong>1.41 · Admin format-mapping</strong></summary>

[#270](https://github.com/jdlarssen/golf-app/issues/270) — I Sekretariatet kan du styre hvilke spillformer som vises i wizarden, hva som er primært og hva som er cup-eligible, med endringslogg.
</details>

<details>
<summary><strong>1.40 · Intent-først wizard</strong></summary>

[#272](https://github.com/jdlarssen/golf-app/issues/272) — Velg arrangement først — Kompis-runde, Klubb-turnering, Cup eller Solo — og wizarden viser bare formats som passer, inkludert cup-oppsettet.
</details>

<details>
<summary><strong>1.39 · Netto/brutto på tvers av alle spillmodi</strong></summary>

[#266](https://github.com/jdlarssen/golf-app/issues/266) — Du kan nå spille brutto i alle spillmodi — stableford, slagspill, matchplay, best ball og Texas scramble har fått samme bryter som fourball.
</details>

<details>
<summary><strong>1.38 · Fourball matchplay</strong></summary>

[#266](https://github.com/jdlarssen/golf-app/issues/266) — Sett opp 2-mot-2-matches i cupene dine; laget vinner hullet med den laveste nettoscoren, og du velger handicapandel per cup.
</details>

<details>
<summary><strong>1.37 · Funn-seksjon på hjem-siden</strong></summary>

[#257](https://github.com/jdlarssen/golf-app/issues/257) — Alle åpne turneringer du kan melde deg på vises rett på hjem-siden, og ventende forespørsler dukker opp der så du slipper å lete.
</details>

<details>
<summary><strong>1.36 · Selv-påmelding til turnering</strong></summary>

[#166](https://github.com/jdlarssen/golf-app/issues/166) — Kopier lenken, slipp den i gruppechatten, og spillerne melder seg på selv — med valgfri godkjenning og mulighet til å trekke seg.
</details>

<details>
<summary><strong>1.35 · Trygghetsnett for tee-lengde</strong></summary>

[#236](https://github.com/jdlarssen/golf-app/issues/236) — Appen sier fra hvis banelengden du taster ser uvanlig ut for norske forhold — en hjelpende hånd for å fange åpenbare tastefeil.
</details>

<details>
<summary><strong>1.34 · Per-kjønn-overstyring av hull-par</strong></summary>

[#240](https://github.com/jdlarssen/golf-app/issues/240) — Spillere på dame- eller junior-tee får riktig par-referanse på hull der tee-en er plassert kortere enn herrenes.
</details>

<details>
<summary><strong>1.33 · Sekretariatet, friksjon ryddet</strong></summary>

[#238](https://github.com/jdlarssen/golf-app/issues/238) — En «Tøm dette kjønnet»-lenke i bane-skjemaet rydder slope og CR for ett kjønn med ett trykk.
</details>

<details>
<summary><strong>1.32 · «Sist spilt»-indikator på baner</strong></summary>

[#239](https://github.com/jdlarssen/golf-app/issues/239) — Bane-listen viser når hver bane sist ble brukt i et spill, og et filter plukker ut banene som er i bruk nå.
</details>

<details>
<summary><strong>1.31 · Ryder Cup-stil cuper</strong></summary>

[#47](https://github.com/jdlarssen/golf-app/issues/47) — Bind flere matchplay-runder sammen i én cup — lag møtes over matches, og første lag til poengmålet vinner.
</details>

<details>
<summary><strong>1.30 · Spill-invitasjoner med bell-prikk</strong></summary>

[#182](https://github.com/jdlarssen/golf-app/issues/182) — Spillere som legges til et spill får varsel i appen i tillegg til e-post — bell-prikken lyser så snart du er lagt på.
</details>

<details>
<summary><strong>1.29 · Selv-registrering for nye spillere</strong></summary>

[#22](https://github.com/jdlarssen/golf-app/issues/22) — Nye besøkende kan skrive inn e-posten sin og få kode uten at admin må invitere dem først.
</details>

<details>
<summary><strong>1.28 · Bane-tilgang for kompis-gjengen</strong></summary>

[#198](https://github.com/jdlarssen/golf-app/issues/198) — Trusted creators kan nå legge til og oppdatere baner selv — de ser Sekretariatet med en Baner-flis og kan vedlikeholde katalogen.
</details>

<details>
<summary><strong>1.27 · Arkiv-UI og delbare filter-lenker</strong></summary>

[#223](https://github.com/jdlarssen/golf-app/issues/223) — Arkiverte tees kan gjenåpnes fra bane-redigeringen, og bane-listens søk og filter lagres i URL-en så en filtrert visning kan deles.
</details>

<details>
<summary><strong>1.26 · Vedlikeholds-trygghet og filter</strong></summary>

[#223](https://github.com/jdlarssen/golf-app/issues/223) — Tørny husker nå hvem som endret hva på en bane, tees kan fjernes selv om de brukes i historiske spill, og bane-listen har fått sortering og filter.
</details>

<details>
<summary><strong>1.25 · Mobilbasert bane-admin</strong></summary>

[#223](https://github.com/jdlarssen/golf-app/issues/223) — Å opprette en bane på telefon er tre trykk per hull i stedet for 18 tastatur-popups — par-total regnes ut automatisk.
</details>

<details>
<summary><strong>1.24 · Kjønn og spillerklasse i profilen</strong></summary>

[#48](https://github.com/jdlarssen/golf-app/issues/48) — Sett kjønn og spillerklasse i profilen, og Tørny foreslår riktig tee for deg når noen oppretter et spill du skal være med på.
</details>

<details>
<summary><strong>1.23 · Lanseringer-kanal</strong></summary>

[#202](https://github.com/jdlarssen/golf-app/issues/202) — Nye funksjoner varsles med et lite banner på hjem-siden, en oppføring i innboksen og en månedlig oppsummering på mail.
</details>

<details>
<summary><strong>1.22 · Hurtig-oppsett for nye spill</strong></summary>

[#203](https://github.com/jdlarssen/golf-app/issues/203) — Opprett et spill i fire korte steg — format, bane og tidspunkt, spillere, sammendrag — med avanserte detaljer tilgjengelig bak ett trykk.
</details>

<details>
<summary><strong>1.21 · Sideturnering — 14 nye bragder</strong></summary>

[#19](https://github.com/jdlarssen/golf-app/issues/19) — Sideturneringen har fått 14 nye kategorier å jakte på, fra albatross og hole-in-one til comeback kid og to birdier på rad.
</details>

<details>
<summary><strong>1.20 · Handicap-chip på hjem-siden</strong></summary>

[#168](https://github.com/jdlarssen/golf-app/issues/168) — Handicapen din vises øverst på hjem-siden og får en aksent-farge hvis den er eldre enn fire uker — uten at appen trenger å mase.
</details>

<details>
<summary><strong>1.19 · Handicap-sjekk før runden</strong></summary>

[#168](https://github.com/jdlarssen/golf-app/issues/168) — Er handicapen din eldre enn fire uker, spør appen deg om den fortsatt stemmer før spillet starter.
</details>

<details>
<summary><strong>1.18 · Lag-scorekort</strong></summary>

[#17](https://github.com/jdlarssen/golf-app/issues/17) — I best ball, stableford, matchplay og Texas scramble viser scorekortet deg og partneren side om side per hull — som på papir.
</details>

<details>
<summary><strong>1.17 · Allowlist for trusted creators</strong></summary>

[#22](https://github.com/jdlarssen/golf-app/issues/22) — Som admin kan du gi utvalgte spillere tilgang til å opprette egne turneringer — de får en «Opprett spill»-inngang på forsiden.
</details>

<details>
<summary><strong>1.16 · Texas scramble</strong></summary>

[#44](https://github.com/jdlarssen/golf-app/issues/44) — Opprett Texas scramble-spill med 2- eller 4-mannslag; lag-handicap settes automatisk etter NGF-tabellen og kan justeres.
</details>

<details>
<summary><strong>1.15 · In-app innboks</strong></summary>

[#25](https://github.com/jdlarssen/golf-app/issues/25) — Bell-prikken øverst til høyre samler varslene dine — du ser dem i appen og slipper mail når du allerede er aktiv.
</details>

<details>
<summary><strong>1.14 · Stableford-polish</strong></summary>

Solo stableford lar nå én spiller fungere som marker og taste slag for alle i flighten — akkurat som i best ball.
</details>

<details>
<summary><strong>1.13 · Slagspill</strong></summary>

[#159](https://github.com/jdlarssen/golf-app/issues/159) — Opprett klassiske slagspill-turneringer der hver spiller fører eget kort, og laveste netto-total vinner.
</details>

<details>
<summary><strong>1.12 · Matchplay</strong></summary>

[#155](https://github.com/jdlarssen/golf-app/issues/155) — Opprett matchplay-turneringer mellom to spillere der vinneren av hvert hull får poeng og matchen avgjøres etter golfreglene.
</details>

<details>
<summary><strong>1.11 · Par-stableford (4BBB)</strong></summary>

[#151](https://github.com/jdlarssen/golf-app/issues/151) — Opprett fyrball-turneringer der to og to spiller stableford som lag og lagets beste poeng per hull teller.
</details>

<details>
<summary><strong>1.10 · Stableford end-to-end</strong></summary>

[#4](https://github.com/jdlarssen/golf-app/issues/4) — Stableford-turneringer er nå spillbare fra start til slutt — spillerne taster slag, ser stableford-poeng per hull og et leaderboard.
</details>

<details>
<summary><strong>1.9 · Valgbar spillmodus</strong></summary>

[#41](https://github.com/jdlarssen/golf-app/issues/41) — Opprett-flyten viser nå et tydelig valg mellom Stableford og Best ball netto, med lag-grid kun for format som krever lag.
</details>

<details>
<summary><strong>1.8 · Mørk modus</strong></summary>

[#111](https://github.com/jdlarssen/golf-app/issues/111) — Tørny følger telefonens utseende-innstilling automatisk — mørk iPhone gir mørk klubbhus-palett, uten knapp å trykke.
</details>

<details>
<summary><strong>1.7 · Spillerpicker for klubbskala</strong></summary>

Søkefelt i spillerlisten lar deg filtrere på navn; valgte spillere vises som chips øverst så du ikke mister oversikten.
</details>

<details>
<summary><strong>1.6 · CSV-eksport</strong></summary>

Last ned resultatet som CSV etter et avsluttet spill — åpnes rett i Numbers, Excel og Google Sheets.
</details>

<details>
<summary><strong>1.5 · Klubbstatistikker</strong></summary>

Se hvem som har vunnet flest spill og deltatt flest ganger — toppen markert med champagne-gull på sin egen side.
</details>

<details>
<summary><strong>1.4 · Multi-rating tee-bokser</strong></summary>

Legg inn slope og CR for herrer, damer og junior på samme tee-rad — én gang, ikke tre — og velg kjønn per spiller i spill-formen.
</details>

<details>
<summary><strong>1.3 · Mixed-gender tee-bokser</strong></summary>

[#92](https://github.com/jdlarssen/golf-app/issues/92) — Herrer og damer kan nå spille fra ulike tees i samme runde og alle får riktig banehandicap.
</details>

<details>
<summary><strong>1.2 · Utvidet sideturnering</strong></summary>

[#41](https://github.com/jdlarssen/golf-app/issues/41) — Sideturneringen har fått 12 nye kategorier — fra «flest birdier» og «konge på par-3» til stackbare achievements som Turkey og Snowman.
</details>

<details>
<summary><strong>1.1 · Sideturnering</strong></summary>

Legg til en sideturnering i spillet; lag samler poeng fra seks kategorier og resultatet vises i en egen fane på leaderbordet.
</details>

<details>
<summary><strong>1.0 · Første stabile lansering</strong></summary>

Tørny går fra alpha til 1.0 med reveal-modus, scorekort-former (birdie = sirkel, bogey = firkant) og kallenavn i resultat-visningen.
</details>

## Feilrettinger

<details>
<summary><strong>Juni 2026 · 243 rettinger</strong></summary>

- `1.151.1` · [#969](https://github.com/jdlarssen/golf-app/issues/969) — Wolf og Round Robin kan nå opprettes med åpen påmelding: du kan publisere før spillerne har meldt seg på, og rotasjonen trekkes automatisk når runden starter. Får ikke nok meldt seg på, sier appen fra i stedet for å starte halvveis.
- `1.145.2` · [#959](https://github.com/jdlarssen/golf-app/issues/959) — Lanseringer i innboksen har fått et ryddigere oppsett: brødteksten bruker hele bredden i stedet for å klemmes inn i en smal stripe ved siden av tidsstempelet.
- `1.145.1` · [#957](https://github.com/jdlarssen/golf-app/issues/957) — Lanseringer med lenke og knapp viser nå hele teksten i innboksen, så du kan lese ferdig før du eventuelt trykker deg videre.
- `1.142.1` · [#924](https://github.com/jdlarssen/golf-app/issues/924) — Liga-runder med en frist som alt har vært stoppes med en gang.
- `1.141.2` · [#927](https://github.com/jdlarssen/golf-app/issues/927) — Hjelpeteksten for handicap-andelen viser igjen riktig forklaring i stedet for en rå kode som «best_ball».
- `1.141.1` · [#928](https://github.com/jdlarssen/golf-app/issues/928) — Taster du inn en tee-off som har vært, sier appen fra med en gang ved feltet, og «Publiser» er gråa ut til du retter tiden.
- `1.140.9` · [#921](https://github.com/jdlarssen/golf-app/issues/921) — Sikkerhetsherding: en innlogget bruker kan ikke lenger legge en vilkårlig person til sitt eget spill ved å gå utenom appen.
- `1.140.8` · [#902](https://github.com/jdlarssen/golf-app/issues/902) — Setter du opp et spill med tee-off som allerede har passert, sier appen fra og ber deg velge et tidspunkt fra nå av.
- `1.140.7` · [#907](https://github.com/jdlarssen/golf-app/issues/907) — Feiler lagringen av en endret spillerliste, settes lista tilbake slik den var, så du kan prøve på nytt uten å miste noe.
- `1.140.6` · [#906](https://github.com/jdlarssen/golf-app/issues/906) — Lange spillernavn dytter ikke lenger «Legg til»-knappen ut av stilling.
- `1.140.5` · [#908](https://github.com/jdlarssen/golf-app/issues/908) — Avkrysningsbokser og radioknapper er nå i Tørny-grønt i stedet for system-blått.
- `1.140.4` · [#910](https://github.com/jdlarssen/golf-app/issues/910) — Lange kategorinavn i sideturnering-velgeren brytes nå pent i stedet for å krasje inn i poeng-kolonnen.
- `1.140.3` · [#904](https://github.com/jdlarssen/golf-app/issues/904) — Kortet med spillertall heter nå «Oversikt», så to seksjoner ikke lenger deler overskriften «Påmelding».
- `1.140.2` · [#905](https://github.com/jdlarssen/golf-app/issues/905) — Spill som venter på start viser «Påmeldt» i stedet for «Levert 0/N» og en tom banehandicap-kolonne.
- `1.140.1` · [#918](https://github.com/jdlarssen/golf-app/issues/918) — Avsluttede spill maser ikke om å purre; uleverte vises som et rolig «Ikke levert».
- `1.136.1` · [#866](https://github.com/jdlarssen/golf-app/issues/866) — Historikken viser nå netto, spillform-merke og resultat per runde i tillegg til brutto.
- `1.135.7` · [#875](https://github.com/jdlarssen/golf-app/issues/875) — Profilsiden er ryddet: manglende handicap gir en «Sett handicap»-snarvei, og innstillingene er gruppert i fire seksjoner.
- `1.135.6` · [#871](https://github.com/jdlarssen/golf-app/issues/871) — Profilen er mer tilgjengelig: statistikklisten er lettere å lese, og historikk-kort bretter seg pent på smal skjerm.
- `1.135.5` · [#873](https://github.com/jdlarssen/golf-app/issues/873) — Handicap-feilmeldingen viser riktig tallområde, eksport sier hvilket filformat du får, og en aforisme-strek er ryddet bort.
- `1.135.4` · [#883](https://github.com/jdlarssen/golf-app/issues/883) — «Enda» er rettet til «ennå», og du hilses med fornavn både før og etter at du har spill.
- `1.135.3` · [#882](https://github.com/jdlarssen/golf-app/issues/882) — Seksjonene på Hjem er nå ekte overskrifter du kan hoppe mellom, og spill-kortene viser tydelig ramme ved tastaturnavigasjon.
- `1.135.2` · [#881](https://github.com/jdlarssen/golf-app/issues/881) — Hjem viser plassholder-kort i riktig størrelse mens den laster, så siden ikke hopper nedover idet spillene dukker opp.
- `1.135.1` · [#884](https://github.com/jdlarssen/golf-app/issues/884) — Planlagte runder på Hjem har nå en rolig farge som sier «venter», ikke grønt som kan leses som «ferdig».
- `1.134.5` · [#877](https://github.com/jdlarssen/golf-app/issues/877) — Klarer ikke Hjem å laste spillene dine, viser den en «prøv igjen»-skjerm i stedet for en tom velkomst.
- `1.134.4` · [#897](https://github.com/jdlarssen/golf-app/issues/897) — Klubb-siden lastet ikke på grunn av en feil i kontakt-lenken — den åpner nå som normalt igjen.
- `1.134.3` · [#863](https://github.com/jdlarssen/golf-app/issues/863) — Klubbhuset-fanen lyser nå opp også når du er inne på klubb- eller spillformat-sidene, og tellingen viser riktig ved ett spill.
- `1.134.2` · [#887](https://github.com/jdlarssen/golf-app/issues/887) — Vinnerlista i statistikken krediterer nå den som faktisk vant, uansett spilleform.
- `1.134.1` · [#878](https://github.com/jdlarssen/golf-app/issues/878) — «Pågår nå»-kortet vet hvor du er i runden og tar deg rett til neste hull; leverte scorekort og ventende godkjenninger vises tydelig.
- `1.133.85` · [#872](https://github.com/jdlarssen/golf-app/issues/872) — Alle valg-felter i appen støtter nå piltaster, nyttig med tastatur eller skjermleser.
- `1.133.84` · [#869](https://github.com/jdlarssen/golf-app/issues/869) — Klubbstatistikker laster raskt selv med mange ferdige spill bak.
- `1.133.83` · [#867](https://github.com/jdlarssen/golf-app/issues/867) — Krasjer profilen, ser du en fornuftig feilmelding med «Til profil»-knapp i stedet for å bli sendt hjem.
- `1.133.82` · [#846](https://github.com/jdlarssen/golf-app/issues/846) — Banelagring er nå alt-eller-ingenting, og du kan bare endre baner du selv har laget.
- `1.133.81` · [#737](https://github.com/jdlarssen/golf-app/issues/737) — Glipper det under opprettelse av en runde, rydder appen vekk den tomme runden automatisk.
- `1.133.80` · [#737](https://github.com/jdlarssen/golf-app/issues/737) — Glipper noe under opprettelse av en bane, rydder appen vekk hele forsøket automatisk.
- `1.133.79` · [#799](https://github.com/jdlarssen/golf-app/issues/799) — En klubbeier kan ikke lenger melde seg ut og etterlate en eierløs klubb.
- `1.133.78` · [#803](https://github.com/jdlarssen/golf-app/issues/803) — Databasen avviser tidsstempler langt frem i tid eller tilbake, slik at ingen kan fryse et hull for medspillere.
- `1.133.77` · [#802](https://github.com/jdlarssen/golf-app/issues/802) — Bare admin kan sette eller nullstille tilbaketrekking — en spiller kan ikke manipulere sin egen status.
- `1.133.76` · [#817](https://github.com/jdlarssen/golf-app/issues/817) — Tee-bokser med kursrating utenfor WHS-området avvises nå i databasen, ikke bare i skjemaet.
- `1.133.75` · [#804](https://github.com/jdlarssen/golf-app/issues/804) — Databasen avviser ukjente spillformat direkte, også ved direkte API-kall.
- `1.133.74` · [#734](https://github.com/jdlarssen/golf-app/issues/734) — Hullchipen og birdie/bogey-fargen bruker nå riktig par for dame- og juniortee.
- `1.133.73` · [#805](https://github.com/jdlarssen/golf-app/issues/805) — Godkjenner du for mange påmeldinger til formatets kapasitet, sier appen fra med en gang.
- `1.133.72` · [#801](https://github.com/jdlarssen/golf-app/issues/801) — «Skjul til avslutning» skjuler nå faktisk resultatet underveis for alle spilleformer.
- `1.133.71` · [#800](https://github.com/jdlarssen/golf-app/issues/800) — Matchplay-resultater viser alltid den lovlige avgjørelsesformen, «10&8» i stedet for «18up».
- `1.133.70` · [#819](https://github.com/jdlarssen/golf-app/issues/819) — Innloggede sider lagres ikke lenger i nettleser-cachen, slik at andre på samme telefon aldri ser din data.
- `1.133.69` · [#793](https://github.com/jdlarssen/golf-app/issues/793) — «Vis regler»- og «Skjul regler»-knappene i veiviseren vises nå på riktig språk.
- `1.133.68` · [#818](https://github.com/jdlarssen/golf-app/issues/818) — Profil-raden «Installer som app» vises nå på riktig språk for engelske brukere.
- `1.133.67` · [#816](https://github.com/jdlarssen/golf-app/issues/816) — Engelske brukere ser nå riktig apostrof i innboks, profil og venner-flaten.
- `1.133.66` · [#798](https://github.com/jdlarssen/golf-app/issues/798) — Resultatkortet viser igjen plasseringene etter en ferdigspilt runde, og klubbeiere ser igjen innmeldingsforespørsler.
- `1.133.65` · [#754](https://github.com/jdlarssen/golf-app/issues/754) — Grønn hake betyr score på vei til server; uten nett vises en gul dot med forklaring.
- `1.133.64` · [#744](https://github.com/jdlarssen/golf-app/issues/744) — «Lagret nylig» vises ikke lenger på tomme hull før du har tastet noe.
- `1.133.63` · [#770](https://github.com/jdlarssen/golf-app/issues/770) — Knapper i app-banneret og på hull-skjermen er nå lettere å treffe med fingeren.
- `1.133.62` · [#749](https://github.com/jdlarssen/golf-app/issues/749) — Installér-banneret og installasjonsveiviseren vises nå på riktig språk for alle brukere.
- `1.133.61` · [#769](https://github.com/jdlarssen/golf-app/issues/769) — Hurtigvalget under scoring viser nå par+1 og par+2 — bogey og dobbelt-bogey er ett trykk unna.
- `1.133.60` · [#745](https://github.com/jdlarssen/golf-app/issues/745) — Resultattavla fanger nå opp rettede scorer, slik alle tilskuere ser den riktige scoren umiddelbart.
- `1.133.59` · [#740](https://github.com/jdlarssen/golf-app/issues/740) — Allerede leverte ligarunder viser «Levert ✓» i stedet for «Spill».
- `1.133.58` · [#773](https://github.com/jdlarssen/golf-app/issues/773) — Kommende ligarunder viser nå datoen de åpner, slik at du slipper å lure på om du har gått glipp av noe.
- `1.133.57` · [#774](https://github.com/jdlarssen/golf-app/issues/774) — Avsluttede ligaer får et grønt banner øverst som bekrefter at sesongen er over.
- `1.133.56` · [#772](https://github.com/jdlarssen/golf-app/issues/772) — Feilmeldingen ved mislykket spillertillegg i liga er nå norsk og forklarende.
- `1.133.55` · [#782](https://github.com/jdlarssen/golf-app/issues/782) — Forklaringen av slagspill sier ikke lenger at du kappes mot «klokken».
- `1.133.54` · [#781](https://github.com/jdlarssen/golf-app/issues/781) — Spillformat-oppslagsverket er delt i fire tydelige bolker: solo/stableford, lag/scramble, matchplay, og veddemål/dueller.
- `1.133.53` · [#760](https://github.com/jdlarssen/golf-app/issues/760) — «Vis regler»- og «Skjul regler»-knappene på format-kortene vises på riktig språk for engelskspråklige brukere.
- `1.133.52` · [#757](https://github.com/jdlarssen/golf-app/issues/757) — Avslaget i innboksen lyder nå «Du kom ikke med i {spillnavn}» — utfallet er synlig med én gang.
- `1.133.51` · [#767](https://github.com/jdlarssen/golf-app/issues/767) — Aksepter- og Fjern-knappene på lagoversikten oppdaterer seg på stedet uten å blinke.
- `1.133.50` · [#763](https://github.com/jdlarssen/golf-app/issues/763) — Etter å ha invitert noen fra Venner-siden, blir du nå værende der.
- `1.133.49` · [#742](https://github.com/jdlarssen/golf-app/issues/742) — Etter innsendt bli-med-forespørsel kan du gå rett til «Finn turneringer» med ett trykk.
- `1.133.48` · [#741](https://github.com/jdlarssen/golf-app/issues/741) — Hilsenen spilleren skrev i bli-med-skjemaet vises nå for eieren under godkjenning.
- `1.133.47` · [#775](https://github.com/jdlarssen/golf-app/issues/775) — Hjem-velkomsten gjentar ikke «Klubbhuset» to ganger, og klubblista viser en enkel lenke når du allerede er med.
- `1.133.46` · [#776](https://github.com/jdlarssen/golf-app/issues/776) — Under «Eksporter mine data» forklarer appen kort hva filen inneholder, før du laster ned.
- `1.133.45` · [#771](https://github.com/jdlarssen/golf-app/issues/771) — Kjønn- og spillerklasse-knappene er to piksler høyere og lettere å treffe med fingeren.
- `1.133.44` · [#761](https://github.com/jdlarssen/golf-app/issues/761) — «Personvern»-lenken i bunnteksten vises nå på riktig språk uansett om du bruker norsk eller engelsk.
- `1.133.43` · [#758](https://github.com/jdlarssen/golf-app/issues/758) — Alle sider viser nå en nøytral innlastings-animasjon i stedet for en feilformet Hjem-skjelett.
- `1.133.42` · [#756](https://github.com/jdlarssen/golf-app/issues/756) — Tom historikk viser nå én ryddig melding i stedet for to overlappende.
- `1.133.41` · [#783](https://github.com/jdlarssen/golf-app/issues/783) — Uten navn sier appen nå «God morgen.» i stedet for «God morgen, spiller.»
- `1.133.40` · [#780](https://github.com/jdlarssen/golf-app/issues/780) — Én snarvei i bane-skjemaet fyller stroke-indeks 1–18 stigende, slik at du slipper 18 tastatur-popups.
- `1.133.39` · [#779](https://github.com/jdlarssen/golf-app/issues/779) — Uten ventende invitasjoner er invitasjonsskjemaet åpent med én gang — ingen ekstra trykk.
- `1.133.38` · [#778](https://github.com/jdlarssen/golf-app/issues/778) — Spiller-søket filtrerer nå mens du skriver, uten submit-knapp eller side-reload.
- `1.133.37` · [#777](https://github.com/jdlarssen/golf-app/issues/777) — Sekretariat-forsiden hopper ikke lenger når innholdet lastes.
- `1.133.36` · [#751](https://github.com/jdlarssen/golf-app/issues/751) — Feilmeldinger i admin-flaten peker nå mot noe du kan gjøre, ikke mot utilgjengelige logger.
- `1.133.35` · [#753](https://github.com/jdlarssen/golf-app/issues/753) — Purre-knappen vises nå øverst; «Avslutt likevel» er fortsatt der, men lengre nede.
- `1.133.34` · [#750](https://github.com/jdlarssen/golf-app/issues/750) — Admin-flater er nå fullt oversatt i engelsk locale — ingen rå norsk i spill-listen eller på scorekort-raden.
- `1.133.33` · [#762](https://github.com/jdlarssen/golf-app/issues/762) — Cup-listen er nå norsk også i engelsk visning — ingen norsk lekkasje.
- `1.133.32` · [#752](https://github.com/jdlarssen/golf-app/issues/752) — Prøver du å generere matcher uten spillere eller baner, får du en forklaring og en snarvei videre.
- `1.133.31` · [#747](https://github.com/jdlarssen/golf-app/issues/747) — Cup-siden som sendes spillerne er nå norsk fra topp til bunn.
- `1.133.30` · [#764](https://github.com/jdlarssen/golf-app/issues/764) — «Vis alle» i veiviseren viser nå «Viser alle spillformer.» i stedet for et spørsmålstegn.
- `1.133.29` · [#755](https://github.com/jdlarssen/golf-app/issues/755) — Steg 3 og 4 i veiviseren heter nå «Bane og tidspunkt» og «Hvem skal spille?».
- `1.133.28` · [#759](https://github.com/jdlarssen/golf-app/issues/759) — Opprettelsesveiviseren bruker nå «spillformer» konsekvent hele veien.
- `1.133.27` · [#746](https://github.com/jdlarssen/golf-app/issues/746) — Ser du ingen spillformer i veiviseren, forklarer appen hva du kan justere.
- `1.133.26` · [#743](https://github.com/jdlarssen/golf-app/issues/743) — Best ball-veiviseren sier nå «2, 4, 6 eller 8 spillere» — ikke det begrensende «8 spillere».
- `1.133.25` · [#768](https://github.com/jdlarssen/golf-app/issues/768) — «Send ny kode» sender koden med én gang du trykker, uten ekstra steg.
- `1.133.24` · [#766](https://github.com/jdlarssen/golf-app/issues/766) — Under e-postadressen på innloggingssiden vises nå et hint om å sjekke søppelposten.
- `1.133.23` · [#748](https://github.com/jdlarssen/golf-app/issues/748) — Glemmer du ett felt i profilskjemaet, beholder du det du allerede har skrevet.
- `1.133.22` · [#765](https://github.com/jdlarssen/golf-app/issues/765) — Tastaturet er klart med én gang du åpner innloggingssiden — ingen unødvendig tapping.
- `1.133.21` · [#739](https://github.com/jdlarssen/golf-app/issues/739) — iOS korrigerer ikke lenger e-postadressen din på innloggingssiden.
- `1.133.20` · [#731](https://github.com/jdlarssen/golf-app/issues/731) — Et hull i databasen der en innlogget bruker i teorien kunne gitt seg selv admin-tilgang, er tettet.
- `1.133.19` · [#726](https://github.com/jdlarssen/golf-app/issues/726) — Varselprikken forsvinner igjen når du åpner resultattavla eller godkjenner et scorekort.
- `1.133.18` · [#721](https://github.com/jdlarssen/golf-app/issues/721) — Mangler den valgte tee-en rating for junior eller dame, blir kategorien utilgjengelig i veiviseren.
- `1.133.17` · [#698](https://github.com/jdlarssen/golf-app/issues/698) — Bli-med-forespørsler vises nå igjen på påmeldingssiden med hilsenen spilleren skrev.
- `1.133.16` · [#685](https://github.com/jdlarssen/golf-app/issues/685) — Åpner du en lenke til et privat lag-spill du ikke er invitert til, får du en knapp tilbake til forsiden.
- `1.133.15` · [#663](https://github.com/jdlarssen/golf-app/issues/663) — Cup-veiviseren lager nå greensome-, chapman- og gruesome-kamper, og forklarer hvorfor en kombinasjon gir null kamper.
- `1.133.14` · [#704](https://github.com/jdlarssen/golf-app/issues/704) — Scorekort-godkjenning lagres nå faktisk — appen sa «godkjent» mens ingenting ble lagret.
- `1.133.13` · [#676](https://github.com/jdlarssen/golf-app/issues/676), [#481](https://github.com/jdlarssen/golf-app/issues/481) — Melder du deg på et lag-spill via e-postinvitasjon, blir du nå automatisk venn med inviterende kaptein.
- `1.133.12` · [#688](https://github.com/jdlarssen/golf-app/issues/688) — Taster to mobiler samme hull samtidig, mister du ikke lenger din score i det stille.
- `1.133.11` · [#676](https://github.com/jdlarssen/golf-app/issues/676) — E-postinviterte lagkamerater havner nå riktig på laget, ikke som løse solo-spillere.
- `1.133.10` · [#705](https://github.com/jdlarssen/golf-app/issues/705) — En e-postinvitasjon som feiler, rydder nå bort bare den invitasjonen som feilet.
- `1.133.9` · [#661](https://github.com/jdlarssen/golf-app/issues/661) — Melder du deg på et fullt Wolf-, Nines- eller Skins-spill, får du beskjed med én gang.
- `1.133.8` · [#681](https://github.com/jdlarssen/golf-app/issues/681), [#678](https://github.com/jdlarssen/golf-app/issues/678) — Par-asterisken viser riktige kjønnsetiketter på engelsk, og en ventende cup-kamp forteller at arrangøren starter den.
- `1.133.7` · [#687](https://github.com/jdlarssen/golf-app/issues/687) — Liga-runder viser riktig dato og åpner på norsk midnatt, ikke en time på skjeve.
- `1.133.6` · [#689](https://github.com/jdlarssen/golf-app/issues/689) — Du kan nå opprette en cup uten å huke av et match-format i lista.
- `1.133.5` · [#660](https://github.com/jdlarssen/golf-app/issues/660) — Ventende invitasjoner teller med i klubbens plassetak, slik at godkjenning blokkeres når klubben er full.
- `1.133.4` · [#671](https://github.com/jdlarssen/golf-app/issues/671) — Ikke-innloggede kan ikke lenger slå opp om en e-postadresse har en konto.
- `1.133.3` · [#684](https://github.com/jdlarssen/golf-app/issues/684) — Nassau rangerer nå spillere riktig når ikke alle hull er spilt.
- `1.133.2` · [#677](https://github.com/jdlarssen/golf-app/issues/677) — Stableford-ligaen regner dame- og juniorpoeng mot riktig par for tee-en de spiller fra.
- `1.133.1` · [#703](https://github.com/jdlarssen/golf-app/issues/703) — En spiller som aldri stilte til start, sniker seg ikke lenger inn på den aktive lista i Beste-N-ligaer.
- `1.132.15` · [#670](https://github.com/jdlarssen/golf-app/issues/670) — Scorekortet ditt kan ikke lenger godkjennes av deg selv, og banehandicapet ditt låses når spillet er i gang.
- `1.132.14` · [#664](https://github.com/jdlarssen/golf-app/issues/664) — Spillere som aldri stilte til start i en ligarunde vises ikke lenger som aktive i sesongtabellen.
- `1.132.13` · [#686](https://github.com/jdlarssen/golf-app/issues/686) — Varslings-mailen kan sendes på nytt til samme adresse hvis den feilet, og en allerede invitert adresse får meldingen én gang til.
- `1.132.12` · [#683](https://github.com/jdlarssen/golf-app/issues/683) — Pluss-handicap under -18 ga feil nettoscore — matematikken er nå riktig uansett handicap.
- `1.132.11` · [#668](https://github.com/jdlarssen/golf-app/issues/668) — «Lever»-knappen dukker opp som den skal etter 18 hull offline, og appen lagrer eventuelle slag som mangler før kortet låses.
- `1.132.10` · [#668](https://github.com/jdlarssen/golf-app/issues/668) — Et slag som ikke lot seg lagre varsler deg tydelig, slik at du ikke tror kortet er komplett når det ikke er det.
- `1.132.9` · [#675](https://github.com/jdlarssen/golf-app/issues/675) — Feil under generering av cup-matcher eller opprettelse av liga etterlater ikke lenger halvferdige turneringer du ikke kan rydde.
- `1.132.8` · [#680](https://github.com/jdlarssen/golf-app/issues/680) — Nettverksfeil midt i en runde gir nå en norsk side med «Prøv igjen» i stedet for en engelsk feilmelding uten vei videre.
- `1.132.7` · [#669](https://github.com/jdlarssen/golf-app/issues/669), [#667](https://github.com/jdlarssen/golf-app/issues/667) — Wolf lar seg nå opprette med fem spillere, og lag-turneringer med flere enn fire lag lagres uten feil.
- `1.132.6` · [#666](https://github.com/jdlarssen/golf-app/issues/666) — Et lag uten registrerte scorer havner nå sist på resultatlista, ikke øverst.
- `1.132.5` · [#659](https://github.com/jdlarssen/golf-app/issues/659) — Nye Tørny-brukere som inviteres til klubben på e-post kommer nå inn og blir medlemmer med en gang.
- `1.132.4` · [#640](https://github.com/jdlarssen/golf-app/issues/640) — Format uten per-spiller-avkrysning sier nå tydelig at du bare avslutter runden, og at de uten levert står som ikke levert.
- `1.132.3` · [#640](https://github.com/jdlarssen/golf-app/issues/640) — Appen starter nå alltid på norsk som standard — bare ditt eget språkvalg eller en uinnlogget engelsk nettleser endrer språket.
- `1.132.2` · [#640](https://github.com/jdlarssen/golf-app/issues/640) — Lag-påmelding fungerer nå for alle lag-formater: Ambrose, Florida scramble, shamble og patsome i tillegg til best ball og Texas scramble.
- `1.132.1` · [#640](https://github.com/jdlarssen/golf-app/issues/640) — Oppsummeringen i opprett-veiviseren viser ikke lenger antallet spillere to ganger.
- `1.130.10` · [#643](https://github.com/jdlarssen/golf-app/issues/643) — Veiviseren for klubb-runder har ikke lenger et misvisende valg om synlighet — klubbmedlemmene finner runden selv.
- `1.130.9` · [#651](https://github.com/jdlarssen/golf-app/issues/651) — Saksnummeret i admin-visningen følger nå norsk tid, så år og løpenummer stemmer også rundt midnatt på nyttårsaften.
- `1.130.8` · [#638](https://github.com/jdlarssen/golf-app/issues/638) — Feirings-visningen etter avsluttet best ball-runde teller nå faktisk spilte hull, ikke alltid 18.
- `1.130.7` · [#638](https://github.com/jdlarssen/golf-app/issues/638) — Leaderboarden og podiet viser nå faktisk antall spilte hull når en runde avsluttes tidlig.
- `1.130.6` · [#645](https://github.com/jdlarssen/golf-app/issues/645) — Feil ved opprettelse av klubb eller tillegg av medlem tømmer ikke lenger skjemaet — du retter bare feltet som var galt.
- `1.130.5` · [#639](https://github.com/jdlarssen/golf-app/issues/639) — Info-banneret på hull-skjermen ligger nå i hull-headeren og dytter ikke lenger det fjerde spillerkortet under skjermkanten på mobil.
- `1.130.3` · [#646](https://github.com/jdlarssen/golf-app/issues/646) — Hilsekortet i Klubbhuset følger nå norsk tid, så dato, ukenummer og hilsen stemmer også etter midnatt.
- `1.130.2` · [#637](https://github.com/jdlarssen/golf-app/issues/637) — Tee-off-tidspunktet vises nå i norsk tid overalt — veiviseren, spiller-siden og spill-protokollen er samstemte.
- `1.130.1` · [#635](https://github.com/jdlarssen/golf-app/issues/635) — Spillere og lag uten registrerte scorer rangeres nå sist i en ferdig runde.
- `1.129.12` — Patsome lar seg nå opprette: lag-fordelingen i veiviseren er på plass, og du kan fordele spillerne to og to.
- `1.129.11` — Liga-runder åpner og stenger nå på klokkeslettet du faktisk velger, ikke to timer for sent.
- `1.129.10` — Liga er tilbake i drift: runder lar seg starte, og sesong-tabellen laster som den skal.
- `1.129.9` — Generering av cup-matcher legger nå inn spillerne korrekt — ingen match starter tom.
- `1.129.8` — Cup-siden og det offentlige cup-resultatet laster som de skal, også når cupen har matcher.
- `1.129.7` · [#622](https://github.com/jdlarssen/golf-app/issues/622) — Engelske ord som «roster» er byttet ut med «spillerliste» overalt i appen.
- `1.129.6` · [#624](https://github.com/jdlarssen/golf-app/issues/624) — Engelske spillnavn er nå konsekvente på alle spill-sider: slett, avslutt, spillerliste, godkjenning, scorekort, hull-for-hull og lag-påmelding.
- `1.129.5` · [#624](https://github.com/jdlarssen/golf-app/issues/624) — Spillnavnet vises nå riktig på leaderboardet, spill-siden, påmeldinger og i Sekretariatet, med riktig datoformat per språk.
- `1.129.4` · [#621](https://github.com/jdlarssen/golf-app/issues/621) — Handicap på profilen vises med punktum (12.4) i engelsk modus, ikke norsk komma.
- `1.129.3` · [#617](https://github.com/jdlarssen/golf-app/issues/617) — Auto-genererte spillnavn bruker nå riktig månedsnavn per språk — «12 June» på engelsk, «12. juni» på norsk.
- `1.129.2` · [#614](https://github.com/jdlarssen/golf-app/issues/614) — Engelske ord som «Formats», «gross» og «course handicap» er byttet til «Format-styring», «brutto» og «banehandicap» i veiviseren og Klubbhuset.
- `1.129.1` · [#615](https://github.com/jdlarssen/golf-app/issues/615) — Handicap i admin-spillerlista vises nå med komma og pluss foran plusshandicap (+8,0).
- `1.128.1` · [#613](https://github.com/jdlarssen/golf-app/issues/613) — Gamle påmeldingsvarsler som peker til slettede spill vises ikke lenger, og varsler uten destinasjon markeres som lest når du trykker.
- `1.127.6` · [#600](https://github.com/jdlarssen/golf-app/issues/600) — Leaderboarden i to-spiller Bingo Bango Bongo, Nassau og Skins viser duellkortet én gang, ikke to ganger.
- `1.127.5` · [#601](https://github.com/jdlarssen/golf-app/issues/601) — Bingo Bango Bongo-leaderboarden viser nå «10 bingo · 8 bango · 10 bongo» i stedet for «B1 10 · B2 8 · B3 10».
- `1.127.4` · [#605](https://github.com/jdlarssen/golf-app/issues/605) — Leaderboarden bytter fra «Lykke til» til «Vel spilt» når runden er ferdig.
- `1.127.3` · [#602](https://github.com/jdlarssen/golf-app/issues/602) — «Lengste bogeyfrie rekke» og «Verste enkelthull» viser nå hvem som tok dem.
- `1.127.2` · [#604](https://github.com/jdlarssen/golf-app/issues/604), [#603](https://github.com/jdlarssen/golf-app/issues/603) — I solo-spill vises kallenavnet ditt én gang i sideturneringen, og «hele laget» vises ikke der det ikke finnes noe lag.
- `1.127.1` · [#602](https://github.com/jdlarssen/golf-app/issues/602) — Telle- og brutto-baserte kategorier i sideturneringen viser nå navnet på spilleren som tok dem.
- `1.126.1` · [#583](https://github.com/jdlarssen/golf-app/issues/583) — Varsler fra lag-påmelding kommer nå på det språket du har valgt i appen.
- `1.122.1` · [#576](https://github.com/jdlarssen/golf-app/issues/576) — Veiviseren tilbyr ikke lenger sideturnering for matchplay-formater, der resultatet vises som duell-kort.
- `1.121.1` · [#559](https://github.com/jdlarssen/golf-app/issues/559) — Følger du en påmeldingslenke uten å være logget inn, beholdes lenken gjennom innloggingen og du lander på riktig påmelding etterpå.
- `1.120.1` · [#559](https://github.com/jdlarssen/golf-app/issues/559) — En ugyldig eller utløpt påmeldingslenke gir ikke lenger en 404-side — du havner rett på innlogging og tilbake til påmeldingen etterpå.
- `1.117.3` · [#570](https://github.com/jdlarssen/golf-app/issues/570) — Avsluttede spill-kort viser nå spillform og sluttdato, så du ser forskjell på skins, matchplay og stableford med ett blikk.
- `1.117.2` · [#569](https://github.com/jdlarssen/golf-app/issues/569) — Avsluttede spill på hjem-siden vises nå med nyeste runde øverst.
- `1.117.1` — Leaderboardet virker igjen for alle spillformer etter en språk-oppdatering.
- `1.116.1` — Lagring i appen — inkludert oppretting av spill — virker igjen etter en språk-oppdatering.
- `1.113.4` — Handlingsknappen nederst på hull-skjermen fyller hele bunnbaren kant-til-kant uten tom stripe under.
- `1.113.3` — Handlingsknappen på hull-skjermen ligger nå helt ned mot skjermkanten og holder seg klar av home-indikatoren på iPhone.
- `1.113.2` · [#281](https://github.com/jdlarssen/golf-app/issues/281) — Påminnelsen om at poeng kan gå i minus er fjernet fra hull-skjermen i modifisert stableford — forklaringen ligger i spillform-guiden.
- `1.113.1` · [#552](https://github.com/jdlarssen/golf-app/issues/552) — «Neste hull»-knappen er ikke lenger delvis gjemt bak bunnmenyen på hull-skjermen.
- `1.112.7` · [#543](https://github.com/jdlarssen/golf-app/issues/543) — Stengt påmelding gjelder hele laget: medspillere som svarer på lag-invitasjon etter stenging møter samme beskjed som alle andre.
- `1.112.6` · [#543](https://github.com/jdlarssen/golf-app/issues/543) — Du kan stenge påmeldingen mens du gjør de siste justeringene, og åpne den igjen når du vil.
- `1.112.5` · [#543](https://github.com/jdlarssen/golf-app/issues/543) — I venterommet kan du nå velge flight selv og se hvor mange som er i hver gruppe; én flight fylles ikke med mer enn fire spillere.
- `1.112.4` · [#543](https://github.com/jdlarssen/golf-app/issues/543) — Fra Sekretariatet kan du fordele spillere i flighter direkte, med automatisk forslag og fri flytting mellom grupper.
- `1.112.3` · [#543](https://github.com/jdlarssen/golf-app/issues/543) — Motstanderen i en singelmatch kan nå godkjenne scorekortet ditt og får automatisk varsel ved innlevering.
- `1.112.2` · [#543](https://github.com/jdlarssen/golf-app/issues/543) — I singelmatch ser begge spillerne hverandres scorer direkte og motstanderen kan godkjenne scorekortet — uten ekstra oppsett.
- `1.112.1` · [#543](https://github.com/jdlarssen/golf-app/issues/543) — Store spill med mer enn fire spillere kan ikke lenger starte automatisk ved tee-tid før alle er fordelt i flighter.
- `1.110.2` · [#546](https://github.com/jdlarssen/golf-app/issues/546) — Svært lange navn eller lagnavn på duellkortet brytes over flere linjer i stedet for å sprenge bredden.
- `1.110.1` · [#546](https://github.com/jdlarssen/golf-app/issues/546) — Lagmatchene har fått samme duellvisning: fourball, foursomes og varianter viser lagene mot hverandre med vunne hull og stilling hull for hull.
- `1.109.3` · [#544](https://github.com/jdlarssen/golf-app/issues/544) — Admin kan ikke lenger starte matchplay med tomme eller skjeve sider — den manuelle start-knappen sjekker samme regler som automatisk tee-tidstart.
- `1.109.2` · [#544](https://github.com/jdlarssen/golf-app/issues/544) — Venter-varselet fra side-valget sier nå «1 spiller» eller «2 spillere» og bruker vanlig norsk i stedet for «booket»-formuleringer.
- `1.109.1` · [#544](https://github.com/jdlarssen/golf-app/issues/544) — Etter tee-tid vises et varsel som forteller hvilken side som mangler spillere, så du vet hvorfor spillet ikke har startet.
- `1.108.6` · [#538](https://github.com/jdlarssen/golf-app/issues/538) — Appen svarer raskere ved kald åpning: rammen rundt innholdet leveres fra et lynraskt lager og selve innholdet strømmer inn rett etterpå.
- `1.108.5` · [#539](https://github.com/jdlarssen/golf-app/issues/539) — Åpner du et avsluttet spill fra hjem-skjermen blinker det ikke lenger tre ulike lasteskjermer — én rolig plassholder venter til resultatene er klare.
- `1.108.4` · [#416](https://github.com/jdlarssen/golf-app/issues/416) — Scorekort, spillerliste og resultatside laster raskere ved å hente det de trenger samtidig i stedet for én ting av gangen.
- `1.108.3` · [#412](https://github.com/jdlarssen/golf-app/issues/412), [#413](https://github.com/jdlarssen/golf-app/issues/413), [#414](https://github.com/jdlarssen/golf-app/issues/414) — Leaderboarden henter resultater raskere: databasen sjekker tilganger én gang per oppslag i stedet for én gang per rad.
- `1.108.2` · [#413](https://github.com/jdlarssen/golf-app/issues/413) — Leaderboard og spillsider laster raskere: databasen slipper å skanne hele tabeller ved oppslag av spillere og resultater.
- `1.108.1` · [#526](https://github.com/jdlarssen/golf-app/issues/526) — Lager du en cup plukker du spillere fra vennelista di, og veiviseren sier fra med en gang du nærmer deg firematch-taket.
- `1.107.1` · [#525](https://github.com/jdlarssen/golf-app/issues/525) — Kompis-runden tar nå opptil 24 spillere, ikke bare 16, så en større gjeng får plass uten å måtte være en klubb.
- `1.105.4` · [#515](https://github.com/jdlarssen/golf-app/issues/515) — Ambrose-kortet beskriver nå det som faktisk skiller det fra Texas scramble: et lag-handicap som jevner ut sterke og svake spillere.
- `1.105.3` · [#516](https://github.com/jdlarssen/golf-app/issues/516) — Format-kortene sier «Vis regler» når de er lukket og «Skjul regler» når de er åpne, med en ren pil i stedet for et råtegn.
- `1.105.2` · [#520](https://github.com/jdlarssen/golf-app/issues/520) — «Finn turneringer» får en rolig velkomst med flagg-ikon og invitasjon når lista er tom, i stedet for en blank skjerm.
- `1.105.1` · [#518](https://github.com/jdlarssen/golf-app/issues/518) — «Finn turneringer» er ikke lenger en blindvei når lista er tom — du får en knapp som fyrer opp din egen turnering rett der.
- `1.104.1` · [#498](https://github.com/jdlarssen/golf-app/issues/498) — «Solo»-merket på Stableford-kortene i veiviseren legger seg ikke lenger oppå navnet — alle format-kortene leser nå rent.
- `1.103.1` · [#496](https://github.com/jdlarssen/golf-app/issues/496) — I en modifisert stableford-duell med minuspoeng leser taper-scoren nå «4 mot −3» i stedet for «4--3».
- `1.97.1` · [#496](https://github.com/jdlarssen/golf-app/issues/496) — Et Nines-hull utroper ikke lenger en for tidlig leder — plasseringen vises først når alle tre har levert på hullet.
- `1.94.1` · [#499](https://github.com/jdlarssen/golf-app/issues/499) — I et spill med fire eller færre kan alle nå taste inn score for hverandre og se hverandres scorer live underveis.
- `1.86.1` · [#480](https://github.com/jdlarssen/golf-app/issues/480) — Etter at du har satt opp en klubb-liga, lander du tilbake på klubb-siden der den nye ligaen står i lista.
- `1.83.15` · [#465](https://github.com/jdlarssen/golf-app/issues/465) — Wolf kan nå spilles med tre, fire eller fem spillere — ulven velger partner eller går alene mot resten.
- `1.83.14` · [#460](https://github.com/jdlarssen/golf-app/issues/460) — Skins, Nassau og Bingo Bango Bongo tar nå opptil 16 spillere, slik at du kan kjøre en stor pott på klubbkvelden.
- `1.83.13` — Et sjeldent feiloppsett som ga blindvei i stedet for påmeldingsknapp er tettet — du kommer alltid frem til å melde deg på.
- `1.83.12` — Shamble vises nå først fra seks spillere, slik at det faktisk er mulig å stille to lag.
- `1.83.11` — Scramble-formatene vises nå først når dere er mange nok: fire for Texas og Ambrose, seks for Florida.
- `1.83.10` — Spill uten lag viser ikke lenger tomme «Lag»- og «Flight»-rader i venterommet — bare det som faktisk gjelder vises.
- `1.83.9` — Dato- og tidsfeltene på iPhone strekker seg ikke lenger utenfor kortet når du oppretter spill eller redigerer liga-runder.
- `1.83.8` — Antall-velgeren i kompis-runden starter nå på 4, og veiviseren viser med en gang formatene som passer for fire spillere.
- `1.83.7` · [#453](https://github.com/jdlarssen/golf-app/issues/453) — Dato-feltene i liga-oppsettet er smale nok til å stå pent side om side innenfor rammen.
- `1.83.6` — Den unødvendige «lagstørrelse»-velgeren er borte fra Acey Deucey-oppsettet — formatet er solo og valget hadde ingen mening.
- `1.83.5` — Bingo Bango Bongo, Nassau og Skins kan nå opprettes uten at «Neste» låser seg på spiller-steget.
- `1.83.4` · [#453](https://github.com/jdlarssen/golf-app/issues/453) — Spillerlisten i liga-oppsettet viser nå deg selv og vennene dine, ikke alle på Tørny.
- `1.83.3` · [#453](https://github.com/jdlarssen/golf-app/issues/453) — Veiviseren viser nå med en gang hvor mange runder datoene og frekvensen gir, så du ser antallet før du oppretter.
- `1.83.2` · [#453](https://github.com/jdlarssen/golf-app/issues/453) — Du kan nå legge til runder manuelt på en liga — én etter én med egen start og frist, og «Egendefinert» frekvens fungerer.
- `1.83.1` · [#453](https://github.com/jdlarssen/golf-app/issues/453) — «Start ligaen»-knappen krever nå minst to deltakere, slik at du ikke får en uforklarlig feil ved oppstart med én.
- `1.82.1` · [#446](https://github.com/jdlarssen/golf-app/issues/446) — Knapper som lagrer, sender eller avslutter viser nå at de jobber og låses, så du ikke trykker to ganger ved et uhell.
- `1.81.2` · [#369](https://github.com/jdlarssen/golf-app/issues/369) — Venners egne spill vises under «Fra vennene dine», og venner slipper forbi godkjenning på åpne-for-venner-spill.
- `1.81.1` · [#408](https://github.com/jdlarssen/golf-app/issues/408) — Tørny foreslår nå venner i tillegg til folk du har spilt med, når du fyller et lag.
- `1.80.5` · [#50](https://github.com/jdlarssen/golf-app/issues/50) — Sluttdato-feltet i klubb-avtalen dukker bare opp når det trengs, har riktig bredde på mobil, og viser datoen dempet til du har valgt en.
- `1.80.4` · [#50](https://github.com/jdlarssen/golf-app/issues/50) — «For hvilken klubb?» vises bare ved klubb-turneringer, og er forhåndsvalgt når du starter fra en klubb-side.
- `1.80.3` · [#50](https://github.com/jdlarssen/golf-app/issues/50) — Fulle klubber sier fra, og utløpte klubber fryses — pågående runder spilles ferdig som normalt.
- `1.80.2` · [#50](https://github.com/jdlarssen/golf-app/issues/50) — Klubbeiere kan nå endre andre medlemmers rolle; den siste eieren kan ikke settes ned.
- `1.80.1` · [#50](https://github.com/jdlarssen/golf-app/issues/50) — Administratorer oppretter nå klubber fra Sekretariatet med eiervalg, medlemstak og varighet.
- `1.79.4` · [#442](https://github.com/jdlarssen/golf-app/issues/442) — Er du med i en klubb, dukker klubbens runder opp under «Finn turneringer» og kan meldes på direkte.
- `1.79.3` · [#442](https://github.com/jdlarssen/golf-app/issues/442) — Runder knyttet til en klubb er synlige for alle klubbmedlemmer under «Finn turneringer».
- `1.79.2` · [#442](https://github.com/jdlarssen/golf-app/issues/442) — Del en lenke for å la folk be om å bli med i klubben; du godkjenner eller avslår med ett trykk.
- `1.79.1` · [#442](https://github.com/jdlarssen/golf-app/issues/442) — Inne på en klubb ser du nå medlemmene, og eiere og admins kan legge til, fjerne eller dele invitasjonslenke.
- `1.78.2` · [#387](https://github.com/jdlarssen/golf-app/issues/387) — Har du trukket deg fra en runde, sendes du tilbake til spill-hjem om du prøver å levere eller åpne scorekortet.
- `1.78.1` · [#435](https://github.com/jdlarssen/golf-app/issues/435) — Oppsettet sender ikke lenger med e-postadressene til medspillere; ikke-fullførte profiler vises som «Invitert spiller».
- `1.77.1` · [#429](https://github.com/jdlarssen/golf-app/issues/429) — Klubbhuset gir samlet oversikt over spillene du arrangerer, med direktelenke inn på hvert spill.
- `1.76.2` · [#428](https://github.com/jdlarssen/golf-app/issues/428) — Feiler lagringen under redigering, havner du nå tilbake på rediger-siden i stedet for på forsiden.
- `1.76.1` · [#428](https://github.com/jdlarssen/golf-app/issues/428) — Du kan nå slette egne utkast og planlagte runder selv, med bekreftelse først.
- `1.73.1` · [#422](https://github.com/jdlarssen/golf-app/issues/422) — Prøver du å invitere noen med en engangs-e-post, får du nå beskjed om å bruke en vanlig adresse.
- `1.71.1` · [#376](https://github.com/jdlarssen/golf-app/issues/376) — Som arrangør får du nå en spillerstatus-side der du kan purre de som mangler levering med ett trykk.
- `1.70.1` · [#362](https://github.com/jdlarssen/golf-app/issues/362) — Invitasjoner til lag forklarer nå om du er med med en gang eller om arrangøren må godkjenne laget først.
- `1.69.3` · [#401](https://github.com/jdlarssen/golf-app/issues/401) — Av/på-bryteren for månedsbrev i Innboks er fikset og lå ikke lenger utenfor sporet.
- `1.69.2` · [#401](https://github.com/jdlarssen/golf-app/issues/401) — Månedsbrev-innstillingen er flyttet fra Profil til Innboks.
- `1.69.1` · [#401](https://github.com/jdlarssen/golf-app/issues/401) — Plusshandicap kan nå markeres allerede når du fullfører profilen for første gang.
- `1.68.4` · [#393](https://github.com/jdlarssen/golf-app/issues/393) — Profil-skjemaet er kortere: sjeldne innstillinger er samlet under «Flere innstillinger», og «Invitér en venn» har fått kompakt layout.
- `1.68.2` · [#393](https://github.com/jdlarssen/golf-app/issues/393) — Profil-siden er kortere å scrolle, og «Logg ut» er nå en synlig knapp i stedet for en blek lenke.
- `1.68.1` · [#363](https://github.com/jdlarssen/golf-app/issues/363) — Pågående runde vises nå øverst på Hjem som «Pågår nå», og banesletting krever en egen bekreftelsesside.
- `1.67.1` · [#367](https://github.com/jdlarssen/golf-app/issues/367) — Påmeldingsvalget er nå merket «Oppdagbar» eller «Privat» så du ser med en gang om turneringen er synlig i Finn turneringer.
- `1.66.1` · [#346](https://github.com/jdlarssen/golf-app/issues/346) — «Sekretariatet» nås nå med ett tydelig trykk fra Hjem igjen.
- `1.65.1` · [#360](https://github.com/jdlarssen/golf-app/issues/360) — Venter ett scorekort på godkjenning, viser «Avslutt spillet»-kortet nå tydelig at du kan godkjenne på vegne av flighten.
- `1.64.1` · [#375](https://github.com/jdlarssen/golf-app/issues/375) — Spillere som spilte men ikke leverte, vises nå som «ikke levert» i stedet for «ikke fullført».
- `1.61.3` · [#361](https://github.com/jdlarssen/golf-app/issues/361) — Feil e-post på innlogging gir nå forklarende melding; utløpt invitasjon og død påmeldingslenke har egne feilsider med vei videre.
- `1.61.2` · [#356](https://github.com/jdlarssen/golf-app/issues/356) — Inviterte som logger inn for første gang, havner nå rett på spillet etter profilutfylling.
- `1.61.1` · [#372](https://github.com/jdlarssen/golf-app/issues/372) — «Åpen påmelding» forklares nå på vanlig norsk i oppsettet, uten tekniske kodenavn.
</details>

<details>
<summary><strong>Mai 2026 · 83 rettinger</strong></summary>

- `1.60.4` · [#344](https://github.com/jdlarssen/golf-app/issues/344) — Inviterer du noen som alt er invitert, får du beskjed med en gang i stedet for at de mottar en ny invitasjon.
- `1.60.3` · [#344](https://github.com/jdlarssen/golf-app/issues/344) — «Opprett spill» ser nå likt ut overalt og er nøyaktig den samme handlingen uansett hvor du er i appen.
- `1.60.2` · [#344](https://github.com/jdlarssen/golf-app/issues/344) — Cup-deltakere ser «Se cup-stillingen» direkte på match-siden, og tilbake-knappen tar arrangøren til cup-lista.
- `1.60.1` · [#344](https://github.com/jdlarssen/golf-app/issues/344) — Cup settes nå opp via samme oppsett-veiviser som alt annet — én vei inn.
- `1.59.6` · [#325](https://github.com/jdlarssen/golf-app/issues/325) — Wolf, Nassau, Skins, Modified Stableford og Acey Deucey har nå egne ikoner i oppsettsveiviseren.
- `1.59.5` · [#309](https://github.com/jdlarssen/golf-app/issues/309) — Invitasjonsmailen forteller nå kort hvilken spillform det er, med lenke til oversikten over alle spillformer.
- `1.59.4` · [#337](https://github.com/jdlarssen/golf-app/issues/337) — Round Robin-spill kan nå redigeres uten at handicap-andelen settes tilbake til standard.
- `1.59.3` · [#327](https://github.com/jdlarssen/golf-app/issues/327) — Florida Scramble vises ikke lenger som cup-format og oppfører seg nå likt Texas Scramble og Ambrose.
- `1.59.2` · [#322](https://github.com/jdlarssen/golf-app/issues/322) — Wolf, Nassau, Skins, Nines og Shamble kan nå redigeres uten at spilloppsettet forsvinner ved lagring.
- `1.59.1` · [#331](https://github.com/jdlarssen/golf-app/issues/331) — Greensome-matcher teller nå riktig på cup-tabellen og gir vinnerlaget poengene de fortjener.
- `1.54.1` · [#217](https://github.com/jdlarssen/golf-app/issues/217) — Fourball matchplay har fått en ryddigere norsk beskrivelse i oppsettet, i samme stil som de andre spillformene.
- `1.46.1` · [#303](https://github.com/jdlarssen/golf-app/issues/303) — Delte hull i Skins viser nå at skinsene ikke ble vunnet i stedet for å forsvinne fra resultatlista.
- `1.44.2` · [#198](https://github.com/jdlarssen/golf-app/issues/198) — Spillere med tilgang til å opprette turneringer kan endelig gjøre det uten å møte «Klarte ikke å lagre spillet».
- `1.44.1` · [#240](https://github.com/jdlarssen/golf-app/issues/240) — Leveringssiden, godkjenning og leaderboardets hull-fane viser din egen par når dame- eller junior-par avviker fra herre-par.
- `1.39.1` · [#270](https://github.com/jdlarssen/golf-app/issues/270) — Interne forberedelser for utvidet format-katalog er på plass; ingen synlig endring ennå.
- `1.37.1` · [#257](https://github.com/jdlarssen/golf-app/issues/257) — Velkomst-teksten bytter til «Velg en turnering under» når det faktisk finnes åpne turneringer å melde seg på.
- `1.36.1` · [#199](https://github.com/jdlarssen/golf-app/issues/199) — Påmeldings-lenken bruker nå ren engelsk i URL-en så å-tegnet ikke skaper trøbbel ved deling via SMS eller e-post.
- `1.33.1` · [#223](https://github.com/jdlarssen/golf-app/issues/223) — Endrer du par eller stroke-indeks på en bane med aktive spill, får du nå en bekreftelsesdialog før lagring.
- `1.31.1` · [#223](https://github.com/jdlarssen/golf-app/issues/223) — Kopier herrer-rating til damer og junior med ett klikk på «Kopier til alle kjønn» i bane-redigeringen.
- `1.30.1` · [#223](https://github.com/jdlarssen/golf-app/issues/223) — Typiske norske verdier for slope og CR vises når du taster inn for en tee, så du lettere oppdager tastefeil.
- `1.28.1` · [#223](https://github.com/jdlarssen/golf-app/issues/223) — Lanseringer er nå lett tilgjengelig rett fra Sekretariatet via en ny flis ved siden av Resultatprotokoll.
- `1.27.2` · [#223](https://github.com/jdlarssen/golf-app/issues/223) — Gjenåpner du en arkivert tee og lagrer rett etterpå, forblir tee-en aktiv også etter andre lagring.
- `1.27.1` · [#228](https://github.com/jdlarssen/golf-app/issues/228) — Gjenåpning av en arkivert tee re-arkiverer den ikke lenger ved påfølgende lagring.
- `1.26.1` · [#223](https://github.com/jdlarssen/golf-app/issues/223) — Lagring av bane-endringer fungerer igjen — save-knappen stoppet feilaktig med «Minst én tee-boks må legges til».
- `1.24.1` · [#222](https://github.com/jdlarssen/golf-app/issues/222) — Dame- og junior-merker på spillere beholdes nå når du bytter bane under spill-oppsettet.
- `1.16.4` · [#44](https://github.com/jdlarssen/golf-app/issues/44) — Admin-flaten for Texas scramble viser kun lag med spillere og dropper Flights-seksjonen siden den speiler lagene.
- `1.16.3` · [#44](https://github.com/jdlarssen/golf-app/issues/44) — Avslutter du et Texas scramble-spill får hver spiller mail med lagets plassering og lagkameratenes navn.
- `1.16.2` · [#3](https://github.com/jdlarssen/golf-app/issues/3) — Alle lag ser sanntids-plasseringen mens spillet pågår, og vinner-laget feires på podiet med konfetti.
- `1.16.1` · [#44](https://github.com/jdlarssen/golf-app/issues/44) — Hullsiden viser nå ett scorekort per lag; alle på laget ser samme stepper og hvem som helst kan taste.
- `1.15.4` · [#25](https://github.com/jdlarssen/golf-app/issues/25) — Aktiv-sjekken og mail-vinduet bruker nå samme fem-minutters-terskel, så ingen aktiv bruker får unødvendig mail.
- `1.15.3` · [#25](https://github.com/jdlarssen/golf-app/issues/25) — Dobbelt-trykk på «Lever scorekort» sender ikke lenger flere varsler eller mail til admin.
- `1.15.2` · [#25](https://github.com/jdlarssen/golf-app/issues/25) — Har du vært i Tørny de siste fem minuttene, kommer varselet kun i innboksen — ikke som mail i tillegg.
- `1.15.1` · [#25](https://github.com/jdlarssen/golf-app/issues/25) — Innboksen gir varsel når noen leverer scorekort, godkjenner ditt kort eller avslutter et spill du er med i.
- `1.14.5` — «Bonuser som stables» og «Lag-bonus» er nå konsekvent norsk på alle brukerflater i sideturnerings-flyten.
- `1.14.4` — Engelske ord i norske setninger er ryddet — «Achievements», «Penalty» og «Skill og rarity» heter nå «Bragder», «Minuspoeng» og «Ferdighet og sjeldenhet».
- `1.14.3` · [#25](https://github.com/jdlarssen/golf-app/issues/25) — Feilmeldinger, banner-tekster, mail-maler og knapp-tekster er strammet for AI-tells og engelske kalker.
- `1.14.2` — Sideturnering vises nå som en egen fane på leaderbordet etter at et stableford-spill avsluttes.
- `1.14.1` — «Fortsett runden» sender deg nå til første tomme hull i stedet for alltid hull 1.
- `1.13.2` · [#46](https://github.com/jdlarssen/golf-app/issues/46) — Spillerne får mail med plassering og totalt antall nettosteg når slagspillet avsluttes.
- `1.13.1` · [#3](https://github.com/jdlarssen/golf-app/issues/3) — Spillerne ser et leaderboard sortert på laveste netto-total under runden, og topp 3 feires på podiet med konfetti.
- `1.12.2` · [#45](https://github.com/jdlarssen/golf-app/issues/45) — Begge spillere får mail med matchresultatet i golf-standardformat («3&2», «1up», «AS») når matchen avsluttes.
- `1.12.1` · [#3](https://github.com/jdlarssen/golf-app/issues/3) — Begge spillere ser sanntids match-status under runden og vinneren feires med resultat i golf-standardformat.
- `1.11.2` · [#43](https://github.com/jdlarssen/golf-app/issues/43) — Spillerne får korrekt par-stableford-mail med lagets plassering og poeng når runden avsluttes.
- `1.11.1` — Par-stableford viser lag-leaderboard med begge partnernes poeng, og topp 3 feires på podiet med konfetti.
- `1.10.5` — «Du trenger 8 spillere»-banneret vises ikke lenger i stableford-flyten der det var misvisende.
- `1.10.4` — Bane-listen i admin viser nå datoer i samme korte format som resten av appen.
- `1.10.3` — Tom «Lag»-seksjon og Lag/Flight-kolonner vises ikke lenger i admin for stableford-spill uten lag.
- `1.10.2` — Admin-listen viser nå modus per spill, og admin-flyten støtter stableford side om side med best ball.
- `1.10.1` — Avsluttede stableford-spill viser topp 3 på podiet med konfetti, og vinnerne får tilpasset mail med plassering og poeng.
- `1.8.12` · [#129](https://github.com/jdlarssen/golf-app/issues/129) — Admin-listene over baner og spill har fått en designpass med Sekretariatet-paletten gjennomført.
- `1.8.11` · [#27](https://github.com/jdlarssen/golf-app/issues/27) — Leaderbordet etter en ferdigspilt runde har nå en subtil fairway-vinje med flaggstang i bakgrunnen.
- `1.8.10` · [#128](https://github.com/jdlarssen/golf-app/issues/128) — Profil-utfylling etter første innlogging er pusset opp med varmere velkomst og roligere typografi.
- `1.8.9` · [#113](https://github.com/jdlarssen/golf-app/issues/113) — Admin-listene bruker nå samme top-bar som resten av appen for konsistent navigasjon.
- `1.8.7` · [#113](https://github.com/jdlarssen/golf-app/issues/113) — «+ Nytt»-knappen er fjernet fra Resultatprotokoll-arkivet, og sideturnering-toggle kan aktiveres uavhengig av lag-status.
- `1.8.6` · [#117](https://github.com/jdlarssen/golf-app/issues/117) — Tilbake-pilen fra leaderbordet tar deg tilbake til Min historikk når du kom derfra.
- `1.8.5` — Replay-knappen for jubelscenene skjules når «Reduser bevegelse» er på, siden konfetti-animasjonen allerede er det.
- `1.8.4` · [#117](https://github.com/jdlarssen/golf-app/issues/117) — Tilbake-pilen fra en ferdigspilt leaderboard går tilbake til spillets hjemside uten å skape loops i PWA-modus.
- `1.8.2` — Knappene rundt scorekort og leaderboard er roet ned — primærknapper kun for hovedhandlinger.
- `1.8.1` — Du kan nå spille av jubelscenene igjen via replay-ikonet over leaderbordet.
- `1.5.2` — Tee-off-tidspunktet i admin bruker nå korrekt «nb-NO» locale-kode for konsistent datovisning.
- `1.5.1` — Innlogging- og invitasjonsskjemaene har fått en usynlig honeypot mot bot-trafikk.
- `1.4.2` — Innholdet fader inn når du bytter hull i stedet for å poppe på plass.
- `1.4.1` — Bane-redigering lagrer nå alle tee-bokser — tee 6 og 7 gikk tapt om du fylte ut mer enn fem rader.
- `1.1.10` — Tomme admin-flater for invitasjonskøen og spill-lista har nå et ikon og et hint om hva som skjer videre.
- `1.1.9` — Sensitive admin-handlinger skrives til en intern audit-log med hvem som gjorde hva og når.
- `1.1.8` — Invitasjons-flyten har nå rate-limiting som stopper burstvis utsending ved feil eller kompromittert konto.
- `1.1.7` · [#3](https://github.com/jdlarssen/golf-app/issues/3) — Du kan nå bytte mellom netto og brutto på det avsluttede leaderbordet; Total-tallet oppdaterer seg.
- `1.1.6` — Netto-tallet per hull vises nå på scorekort-oversikten også mens runden pågår.
- `1.1.5` · [#76](https://github.com/jdlarssen/golf-app/issues/76) — Når tee-off-tiden passerer og runden starter automatisk, kommer du rett inn på hull-skjermen.
- `1.1.4` — Netto-tallet per hull vises diskret under hull-navnet på hullsiden — også for plus-golfere.
- `1.1.3` — Sideturneringen viser nå hvem som er på hvert lag og hvilke kategorier som ga dem poengene.
- `1.1.2` — Initialer på scorekort bruker nå første bokstav i fornavn og etternavn i stedet for kallenavnet.
- `1.1.1` — I reveal-modus ser alle deltakere live brutto-leaderboardet på tvers av flights.
- `1.0.10` — Hjem-siden hilser deg uten emoji, og kicker-overskriften i toppbaren er ekte sentrert.
- `1.0.9` — Hull-for-hull-oversikten viser per-spiller vs-par-pille ved siden av nettoscoren, og mot-par vises ved totalsummen.
- `1.0.8` — Hull-for-hull-oversikten er ryddet: nettotall tett ved brutto, og lagets hull-score med E/+1/−1-pille til høyre.
- `1.0.7` — Hull-for-hull-oversikten har ny layout med én rad per spiller og initial foran scoren — ingen horisontal scroll.
- `1.0.6` — Scorekortet passer nå på vanlig iPhone — +slag-kolonnen er flyttet til fotnoten.
- `1.0.5` — Hull-for-hull-leaderbordet viser brutto, ekstraslag og netto i ett stack per spiller med fargefylt «Brukt netto».
- `1.0.4` — Leaderbordet oppdaterer seg automatisk når admin avslutter spillet — ingen manuell refresh.
- `1.0.3` — En «Leaderboard»-knapp på spill-hjem-siden lar deg se brutto-stillingen mens du venter på avslutning.
- `1.0.2` — Live brutto-leaderbordet viser nå under/over par ved siden av brutto-totalen.
- `1.0.1` — Par-scorene er nå korrekt plassert i samme kolonne som birdies og bogeys på hullsiden.
</details>

## Før 1.0 — alfa-historikk

<details>
<summary><strong>Pre-stabil historikk — 9 serier</strong></summary>

<details>
<summary><strong>0.10.x — Resultat-mail og closing-the-loop (28 oppføringer)</strong></summary>

Mail begge veier rundt godkjennings-flyten: admin får mail når en spiller leverer, spillere får mail når admin avslutter. Ingen polling av appen for å vite om det er noe nytt å gjøre. Pilot-polish underveis: ærligere feilmeldinger i admin når noe går galt med å lese spillerlisten, og første pass på personvern-siden.

### [0.10.27] - 2026-05-14

> Live brutto-leaderboard for reveal-spill: du ser hvordan lagene ligger an på brutto, men vinneren er fortsatt skjult. Nytt: når et spill er ferdig vises navnene som «Karl "Knølkis" Jensen», med kallenavnet midt i fullt navn som en del av reveal-en. Og du kan nå hoppe direkte til leaderboardet fra hull-skjermen via en liten knapp i toppen.

<details>
<summary>Teknisk</summary>

#### Added
- `RevealBruttoView` for `state === 'reveal-active'` på leaderboard-siden — lag-totaler basert på brutto best-ball med ingen handicap-info
- Hull-skjerm-leaderboard-ikon (pokal) i headeren med `?return=hole&n=N` for return-to-hole
- Leaderboard-side respekterer `?return=hole&n=N`-param for back-knapp i alle view-states

#### Changed
- Leaderboard 'full'-view (State4View) bruker `formatRevealName(name, nickname)` for både leder-kortet og rad-listen, både i live-mode-finished og reveal-mode-finished
- Hull-leaderboard (`/leaderboard/holes`) bruker `formatRevealName` for spillerlinjen når spillet er ferdig (mid-round beholder den kompakte first-name + HCP-formen)

</details>

---

### [0.10.26] - 2026-05-14

> Reveal-modus er nå klar: admin kan velge om netto-tallene skjules under runden og avsløres på slutten. Funker overalt — hull-skjerm, scorekort, leaderboard, godkjenning.

<details>
<summary>Teknisk</summary>

#### Added
- `/admin/games/new` og `/admin/games/[id]/edit` — fieldset «Synlighet under runden» med radio-valg `live` / `reveal`
- Server-action validering på `score_visibility` med lås mot `active`/`finished` status

#### Changed
- Hull-skjerm (`ScoreCard`) — `+N SLAG`-badge skjult når `score_visibility = reveal` og spillet er aktivt
- Scorekort-oversikt — `+slag`-kolonne skjult i reveal-aktiv; ny `Netto`-kolonne i reveal-finished med ScoreShape og netto-totalt-fotnote
- Lever-skjerm + approve-skjerm — samme oppførsel som scorekort-oversikt
- Hull-leaderboard (`/leaderboard/holes`) — tvinger brutto-modus i reveal-aktiv, ingen netto-fargekoding

</details>

---

### [0.10.25] - 2026-05-14 · #3

> Scorekort-formene følger nå med over alt der tallene står — scorekort-oversikt, lever-skjerm, godkjenning og hull-leaderboard. Samtidig krymper «HULL»-kolonnen til kun «#» for å frigjøre plass på smale skjermer.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/games/[id]/scorecard/page.tsx` — slag-kolonnen pakker tallene i `ScoreShape` (size `sm`), kolonneoverskrift `HULL` → `#`
- `app/games/[id]/submit/page.tsx` — samme behandling som scorekort-oversikten
- `app/games/[id]/approve/page.tsx` — samme behandling i det utvidbare 18-hulls-kortet
- `app/games/[id]/leaderboard/holes/page.tsx` — per-spiller-grossen i hull-griden pakkes i `ScoreShape` (size `sm`)

#### Notes
- `app/games/[id]/leaderboard/page.tsx` (state #3.5/#4) og `app/profile/historikk/page.tsx` rendrer ikke per-hull-tall, så `ScoreShape` ble bevisst hoppet over der

</details>

---

### [0.10.24] - 2026-05-14

> Tre justeringer på hull-skjermen etter første pilot-test: trippel-sirkel for albatross, dobbeltfirkant utvides til kvadruppel-firkant for blow-up-hull, og spesifikk-score-arket forenkles til kun eagle/birdie/par + X for å fjerne en score helt.

<details>
<summary>Teknisk</summary>

#### Changed
- `lib/scoring/scoreShape.ts` — utvidet shape-mapping: `triple-circle` for albatross (≤−3), `triple-square` for triple bogey, `quadruple-square` for quad bogey eller verre
- `components/scoring/ScoreShape.tsx` — rendrer 3 og 4 nestede former; sentrering fikset (lineHeight matcher shape-høyde, ikke flex)
- `components/hole/ScoreCard.tsx` — `numberFontSize` skalerer ned dynamisk basert på form-kompleksitet og siffer-antall så tallene aldri klipper innerste form
- `components/hole/SpecificValueSheet.tsx` — fra 8 til 4 knapper: eagle/birdie/par + X (fjerner score)

#### Added
- `onClear` callback i `SpecificValueSheet` som skriver `null` til scores via `writeScore`

</details>

---

### [0.10.23] - 2026-05-14

> Score-tallene på hull-skjermen får scorekort-former rundt seg — sirkel for birdies, firkant for bogeys, dobbel for eagle og double bogey.

<details>
<summary>Teknisk</summary>

#### Added
- `lib/games/visibility.ts` — `revealState` og `shouldHideNetto` helpers (foundation for kommende reveal-mode)
- `lib/scoring/scoreShape.ts` — mapper score til shape-kategori
- `lib/names/formatRevealName.ts` — full-format navn for grand-reveal moment
- `components/scoring/ScoreShape.tsx` — SVG-pakker rundt score-tall (sirkel/firkant/dobbel)
- Migrasjon 0021 — `games.score_visibility` enum-kolonne med CHECK-constraint

#### Changed
- `components/hole/ScoreCard.tsx` — delta-pillen ved siden av stortallet er fjernet og erstattet av en SVG-form rundt selve tallet (sirkel for birdie, firkant for bogey, dobbel for eagle/double-bogey)

</details>

---

### [0.10.22] - 2026-05-14

> Tilbake-knappen på personvern-siden returnerer deg nå til siden du kom fra, ikke alltid til hjem-siden.

<details>
<summary>Teknisk</summary>

#### Added

- **`components/ui/HistoryBackLink.tsx`** — client component som bruker `router.back()` når `document.referrer` er same-origin, og faller tilbake til en statisk `fallbackHref` (typisk `/`) når referrer mangler (deep link, bokmerke, eller direkte URL-tasting). Visuelt identisk med `BackLink`.
- **`TopBar` får ny `back?: 'link' | 'history'`-prop** (default `'link'`). `back="history"` bytter chevronen fra ren `<Link>` til `HistoryBackLink`. Egnet for sider som kan nås fra hvor som helst i appen.

#### Changed

- **`/legal/privacy`** bruker nå `back="history"` siden den linkes fra AppVersionFooter på praktisk talt hver side — brukeren skal returnere dit de kom fra, ikke alltid til `/`.

</details>

---

### [0.10.21] - 2026-05-14 · bug

> Personvern-siden er nå faktisk lesbar uten å logge inn — tidligere ble du sendt til /login fordi auth-gaten ikke gjorde unntak.

<details>
<summary>Teknisk</summary>

#### Fixed

- **`proxy.ts`-matcheren manglet `legal/`-unntak.** Den globale auth-gate-middleware-en redirecter alle ikke-matchende ruter til `/login?next=...` hvis bruker er uautentisert. `/legal/privacy` (og fremtidige legal-sider) skal være offentlige — særlig viktig for invitéer som skal lese personvern *før* de logger inn. La til `legal/` i matcherens negative-lookahead, parallelt med `login`, `register` og `auth/callback`.

</details>

---

### [0.10.20] - 2026-05-14

> «Personvern» er nå klikkbar fra bunnen av hver side ved siden av versjons-stempelet — også på login-siden, så invitéer kan lese den før de logger inn.

<details>
<summary>Teknisk</summary>

#### Changed

- **`AppVersionFooter`** viser nå `v0.10.20 · Personvern` i stedet for bare versjonsnummer. Lenken peker til `/legal/privacy` med samme muted-styling som footer-en. Bruker plain `<a>` (ikke SmartLink) for å unngå viewport-prefetch av personvern-siden på hver side-visning — link-en klikkes sjeldent og fortjener ikke bundle-cost. Footer rendres av AppShell på de fleste sider; game-i-progress-sider (approve/submit/scorecard) bruker `showVersion={false}` og påvirkes ikke.

</details>

---

### [0.10.19] - 2026-05-14

> Personvern-siden er nå nådbar fra profilen — liten muted-tekst med lenke rett under «Mine data»-seksjonen.

<details>
<summary>Teknisk</summary>

#### Added

- **Personvern-lenke i `/profile/page.tsx`** under GdprSection: «Les hvordan vi behandler og lagrer dataene dine i [personvernerklæringen](/legal/privacy).» Discret muted-text-stil, ingen visuell konkurranse med GDPR-kortene. Siden var allerede live på `/legal/privacy` men kunne ikke nås uten å skrive URL-en direkte — nå har den en faktisk inngang.

</details>

---

### [0.10.18] - 2026-05-14

> Hver side har nå en tydelig overskrift i den sticky top-baren — som «Sekretariatet» gjør på admin-sidene. Tidligere var det bare en chevron der med en tom plass i midten.

<details>
<summary>Teknisk</summary>

#### Changed

- **Kicker lagt til på 8 player-facing sider** i TopBar — fyller den tomme midtre slot'en med en konsekvent uppercase-section-label:
  - `/profile` → «Profil»
  - `/profile/historikk` → «Historikk»
  - `/profile/slett-konto` → «Slett konto»
  - `/legal/privacy` → «Personvern»
  - `/games/[id]` (default) → «Turnering»
  - `/games/[id]/approve` → «Godkjenning»
  - `/games/[id]/scorecard` → «Scorekort»
  - `/games/[id]/submit` → «Lever scorekort»

#### Removed

- **Dupliserte page-titler** fjernet under TopBar siden kicker'en nå bærer samme info: `PageHeader title="Min profil"` på `/profile`, `PageHeader title="Min historikk"` på historikk, `PageHeader title="Godkjenn scorekort"` på approve, `PageHeader title="Mitt scorekort"` på scorecard, `PageHeader title="Gjennomgå før levering"` på submit, `PageHeader title="Personvern"` på legal, og det custom-rendrede «Faresone» + «Slett konto»-block'en på slett-konto.
- **`/games/[id]` beholder PageHeader** med spillets navn — det er ekte sideinnhold (turneringsnavnet), ikke duplikat av kicker'en «Turnering».
- **«N fullførte runder»-subtitle** på historikk-siden er bevart som en liten muted-line rett under TopBar (den bærer faktisk informasjon — telling).

</details>

---

### [0.10.17] - 2026-05-14

> Tilbake-knappen klistrer seg nå til toppen av skjermen på alle lange admin- og profil-sider — du slipper å scrolle helt opp for å komme tilbake.

<details>
<summary>Teknisk</summary>

#### Added

- **`components/ui/TopBar.tsx`** — ny gjenbrukbar komponent som rendrer en sticky-top header med `BackLink` chevron til venstre, valgfri uppercase-kicker (f.eks. «Sekretariatet», «Spill · protokoll») i midten, og en 80 px placeholder til høyre for visuell balanse. Bruker `sticky top-0 z-30 -mx-5 px-5 bg-bg/90 backdrop-blur-sm -mt-8 pt-5 pb-2 mb-4` slik at baren strekker seg ut til AppShell-kantene og scroll-innholdet glir gjennomsiktig under.

#### Changed

- **19 sider migrert** fra inline `<div className="-mt-3 ...">`-wrapper rundt BackLink til `<TopBar />`-komponenten: alle profil-sider, alle legal-sider, alle admin-undersider unntatt de to liste-sidene med `+ Ny`-action-knapp, og fire game-undersider (approve, scorecard, submit, default-state av game-detalj). Sticky header gir også backdrop-blur-effekt så scrolling-innhold ses dempet gjennom baren — iOS-aktig følelse.

#### Skipped (med begrunnelse)

- `app/admin/courses/page.tsx` + `app/admin/games/page.tsx` — list-sider med «+ Ny»-action-knapp i topbar-høyre. Migreres senere når TopBar evt. får støtte for action-slot.
- `app/games/[id]/page.tsx` (scheduled-state) + `app/games/[id]/leaderboard/page.tsx` — bruker en `<header>`-custom-layout med `<Kicker>` i senter; matcher ikke TopBar-mønsteret.
- `app/page.tsx` — hjem-siden bruker `<BrandMark />` i stedet for en tilbake-knapp; ikke aktuelt.

</details>

---

### [0.10.16] - 2026-05-14

> Innloggings-flyten føles nå raskere og mindre forvirrende: «Send kode»-knappen viser «Sender kode …» mens den jobber, og koden logger deg inn automatisk så snart den er fylt inn — du trenger ikke trykke «Logg inn» selv.

<details>
<summary>Teknisk</summary>

#### Fixed

- **Mangler visuell tilbakemelding på «Send meg kode»-knappen.** Klikket ga ingen lokal feedback før Supabase + Resend round-trip (1–2 sek) returnerte. På mobil opplevde brukeren det som at appen ikke registrerte trykket. Skjemaet bytter nå til en sentrert «Sender kode til [email]»-state med spinner mens action'en er i flight (drevet av `useFormStatus().pending`).
- **«Koden er utløpt»-feil ved første forsøk (iOS Safari).** Når Mail.app foreslår OTP-koden over tastaturet og brukeren trykker på forslaget, fylles input'en uten visuell bekreftelse. Brukeren trykket ofte forslaget en gang til, eller trykket «Logg inn» mens iOS samtidig auto-submittet — dobbel-submission konsumerte OTP-en to ganger, og andre forsøk fikk «code expired». Skjemaet auto-submitter nå idet koden er full (8 sifre), og en `useRef`-guard pluss `useFormStatus().pending` blokkerer videre submit-forsøk fra samme komponent — selv om iOS-auto-submission fyrer parallelt.

#### Changed

- **Verify-skjemaet auto-submitter når koden er 8 sifre.** Spilleren trenger ikke trykke «Logg inn» — verken etter manuell tasting eller iOS-auto-fill fra Mail-forslag. Hvis Supabase i fremtiden konfigureres for kortere koder må `OTP_LENGTH`-konstanten i `app/(auth)/login/_components/VerifyCodeForm.tsx` oppdateres.
- **Kode-inputen strippes for ikke-sifre on-the-fly** (mail-malen formaterer koden som «1234 5678», og Safari har av og til vært observert å ta med mellomrommet ved auto-fill).
- **Kode-inputen får `autoFocus`** så virtuell tastatur åpner seg automatisk når man kommer til verify-steget.
- **Begge skjemaer ble flyttet til client components** i `app/(auth)/login/_components/` slik at vi kan bruke `useFormStatus` og `useRef` for pending-state og dobbel-submit-guard. Server-action-importer er uendret.

</details>

---

### [0.10.15] - 2026-05-14 · bug

> Du kan nå slette et spill helt uavhengig av status — også aktive spill der ikke alle har levert scorekort, og avsluttede spill. Slettesiden viser sterkere advarsel for aktive spill men blokkerer ikke handlingen.

<details>
<summary>Teknisk</summary>

#### Fixed

- **Fjernet active-blokken fra `/admin/games/[id]/slett`.** Tidligere ble admin sittende fast: `endGame` krever at alle har levert scorekort, men hvis en spiller har droppet midt i runden er det aldri tilfellet — og slett-flyten blokkerte aktive spill med beskjeden «avslutt det først». Slettsiden lar nå handlingen gå gjennom på alle statuser. Bruk-case-en var åpenbar (test-spill, avbrutte runder, etc.).
- **Status-bevisst advarsel** erstatter blokken: `draft` (ingen advarsel), `scheduled` («spillerne får ingen melding om at det er kansellert»), `active` (rød `tone="error"` banner: «slettingen fjerner alle slag som er registrert så langt»), `finished` («leaderboard og resultater forsvinner permanent — spillere som har bokmerket lenken vil få 404»).
- **Knappetekst varierer** med status: «Slett pågående spill for alltid» når status er `active`, ellers «Slett spillet for alltid» — gjør destruktiviteten mer eksplisitt på det mest risikable case'et.
- **Server-action `deleteGame`** mistet sin parallel-blokk. Kommentar dokumenterer hvorfor.

</details>

---

### [0.10.14] - 2026-05-14

> Ny «Installer Tørny som app»-knapp på hjem-siden og i profilen. Du trenger ikke lenger lete etter «Legg til på hjem-skjerm» i Safari-menyen — Tørny tilbyr installasjonen selv.

<details>
<summary>Teknisk</summary>

#### Added

- **Plattform-bevisst install-system** under `lib/pwa/` + `components/pwa/`:
  - `lib/pwa/install-state.ts` — modul-singleton som fanger `beforeinstallprompt`-event'en (Chromium-baserte nettlesere + desktop Edge) tidlig i app-livssyklus så banner/knapp kan trigge native install-dialog senere.
  - `lib/pwa/detect.ts` — SSR-trygge plattform-helpers (`isStandalone`, `isIos`, `isIosSafari`, `isIosNonSafari`).
  - `hooks/useInstallPrompt.ts` — React-hook som returnerer `status` (`loading | standalone | native | ios-safari | ios-other | unsupported`) + `install()`-funksjon. Lytter på `appinstalled`-event for å flippe til standalone-state.
  - `components/pwa/InstallPromptCapture.tsx` — montert i root layout, fanger eventen og lagrer den i singletonen.
  - `components/pwa/InstallInstructionsModal.tsx` — modal med tre varianter: iOS Safari (3 nummerte trinn med Safari-del-ikon SVG), iOS non-Safari («bytt til Safari»), og unsupported (generisk fallback).
  - `components/pwa/InstallBanner.tsx` — banner øverst på `/` med champagne-aksent. Lukker via X (localStorage: `torny-install-banner-dismissed=1`). Skjules hvis allerede installert.
  - `components/pwa/InstallButton.tsx` — permanent kort i `/profile` (over «Mine data») så brukere kan re-summe install-flyten hvis de lukket banneret.
- **Plattform-flyt:**
  - **Android Chrome / desktop Chrome+Edge:** «Installer»-klikk trigger native install-dialog via `beforeinstallprompt.prompt()`.
  - **iOS Safari:** «Installer»-klikk åpner modal med trinn-for-trinn-instruksjoner.
  - **iOS Chrome/Firefox/Edge:** modal forklarer at brukeren må bytte til Safari for å installere.
  - **Allerede installert (standalone-mode):** banner + knapp skjules helt.

#### Removed

- **`components/IosInstallHint.tsx`** — gammelt fixed-bottom-banner som bare dekket iOS Safari med én linje instruksjon. Erstattet av det nye system'et som dekker Android + iOS + desktop og har bedre instruksjoner.

</details>

---

### [0.10.13] - 2026-05-14 · bug

> Defensiv sikkerhetsstramming: innloggede brukere kan ikke lenger SELECTe vilkårlige invitasjons-rader fra `public.invitations` — kun sine egne.

<details>
<summary>Teknisk</summary>

#### Fixed

- **`invitations select by token using (true)`-policy droppet** (migrasjon `0020`) og erstattet med en smal policy `using (lower(email) = lower(auth.jwt() ->> 'email'))`. Den gamle policyen lot enhver innlogget bruker lese ALLE invitasjons-rader — app-laget filtrerte på token, men det var ikke RLS-enforced. Med magic-link-flyten retired (v0.4.0) har token-URL-er ikke vært relevant lenger.
- **Audit av kall-sites** før endring: alle `/admin/*`-paths går via `is_admin()`-gated «invitations admin write»-policy (FOR ALL); `app/invite/actions.ts` + `lib/invitations/quota.ts` bruker «invitations select own outgoing» (0008, filtrerer på `invited_by`); `app/profile/export/route.ts` bruker den nye «invitations select own incoming» (filtrerer på `email = auth.jwt()->>email`). Alle dekket.
- **Tester:** 180/180 grønne etter endring.

</details>

---

### [0.10.12] - 2026-05-14

> Ny «Min historikk»-side på profilen lar deg se alle dine fullførte runder med dato, brutto sum og snitt per hull.

<details>
<summary>Teknisk</summary>

#### Added

- **Ny rute `/profile/historikk`** — Server Component som viser brukerens fullførte runder (`games.status = 'finished'`) sortert nyeste først. Per runde: spillnavn, tee-off-dato (norsk format), brutto sum, snitt per hull, og lenke til den spesifikke leaderboarden.
- **Lenke fra `/profile`** — ny «Historikk»-seksjon med en `Card` over «Mine data» med «Se runder»-knapp som peker til `/profile/historikk`.

#### Implementation notes

- **2 round-trips totalt:** først `game_players` med `games!inner`-filter på `status='finished'` for å hente alle relevante spill, deretter ett `scores`-kall med `.in('game_id', gameIds)` + `.eq('user_id', me)` for alle scores samtidig. Aggregering skjer in-process.
- **Empty state:** «Du har ingen fullførte runder ennå. Bli med på et spill først.»
- **Date-fallback:** bruker `scheduled_tee_off_at`, faller tilbake til `ended_at` hvis NULL, dropper rad hvis begge er NULL.

</details>

---

### [0.10.11] - 2026-05-14

> Admin kan nå endre e-postadressen til en registrert spiller, og se sist innlogget + antall spill på spiller-detaljen.

<details>
<summary>Teknisk</summary>

#### Added

- **`users.last_seen_at timestamptz`** — ny kolonne (migrasjon `0019`) med index. Stamps fra `proxy.ts`-middleware på hver autentiserte request, debounced via WHERE-clause så Postgres no-op'er hvis verdien er ferskere enn 30 minutter. Best-effort, fire-and-forget via `void (async () => ...)` — feiler aldri requesten.
- **«Aktivitet»-seksjon på `/admin/spillere/[id]`** — viser «Sist innlogget: {relativeTime}» og «Antall spill: N». Null `last_seen_at` rendres som «Aldri».
- **E-post-felt i edit-formen** på samme side. Validering: må være gyldig e-post-format. Sjekker konflikt mot både `public.users` (via `email_is_registered`-RPC) og `auth.users` (via `email_is_in_auth_users`-RPC fra v0.10.6). Block: nekter å oppdatere hvis spilleren er med i et aktivt spill.

#### Changed

- **E-post-oppdatering går via service-role-klient** (`auth.admin.updateUserById`) først; bare hvis det lykkes oppdateres `public.users.email` i samme transaksjon-pakke. Sikrer at de to tabellene ikke kommer ut av synk ved feil.

</details>

---

### [0.10.10] - 2026-05-14

> Du kan nå slette et spill helt fra admin — nyttig hvis du opprettet noe ved et uhell eller vil rydde opp etter en test.

<details>
<summary>Teknisk</summary>

#### Added

- **Ny rute `/admin/games/[id]/slett`** — dedikert bekreftelses-side (per destruktiv-handling-mønsteret) som viser spillets navn, tee-off, status og hvor mye som blir slettet (game_players, scores, invitasjoner). Block-betingelse: hvis `game.status === 'active'` vises et rødt banner — admin må avslutte spillet først.
- **Server-action `deleteGame`** i `app/admin/games/[id]/slett/actions.ts` — re-sjekker admin + block-betingelsen, deretter `DELETE FROM games` (FK ON DELETE CASCADE rydder game_players, scores og invitasjoner automatisk). På suksess: redirect til `/admin/games?status=deleted&name=<spillet>` med bekreftelses-banner.
- **«Faresone»-seksjon** nederst på `/admin/games/[id]` med rødtonet ramme + lenke til slett-flyten, samme mønster som `/admin/spillere/[id]`.

</details>

---

### [0.10.9] - 2026-05-14

> Admin ser nå om en ventende invitasjon faktisk har bedt om innloggings-kode, så du vet om mailen ble lest eller bare ligger der.

<details>
<summary>Teknisk</summary>

#### Added

- **`invitations.opened_at timestamptz`** — ny kolonne (migrasjon `0018`) som stamps når invitéen ber om en OTP-kode på `/login`. Default NULL.
- **Hook i `sendCode`-actionen** i `app/(auth)/login/actions.ts` — etter `signInWithOtp` lykkes, oppdaterer service-role-klient `invitations.opened_at = now()` for rader med matching `email` (case-insensitive) der `accepted_at IS NULL AND opened_at IS NULL`. Service-role brukes fordi brukeren er pre-auth på dette punktet og RLS ville blokkert. Best-effort: feil logges men blokkerer aldri OTP-sendingen.
- **Admin-indikator i `PendingInvitations.tsx`** — under hver «Venter»-rad: «Har bedt om kode {timeAgo}» i forest-grønn hvis `opened_at IS NOT NULL`, eller «Mail sendt, men ikke åpnet ennå» i muted grå hvis NULL. `timeAgo`-helper gir norsk relativ tid («akkurat nå», «3 min siden», «i går», «5 dager siden»).

</details>

---

### [0.10.8] - 2026-05-14

> To nye GDPR-kontroller på profil-siden: du kan laste ned alt Tørny vet om deg som en JSON-fil, og du kan slette kontoen din selv (med mindre du er med i et pågående spill).

<details>
<summary>Teknisk</summary>

#### Added

- **`/profile/export`** — ny Route Handler (`app/profile/export/route.ts`) som returnerer JSON-fil med dataene Tørny har lagret om innlogget bruker. Krever auth (returnerer 401 ellers). Filnavn `torny-data-YYYY-MM-DD.json`. Eksporten inkluderer brukerens egen `users`-rad, alle `game_players`-rader, scores der `user_id` ELLER `entered_by` matcher (kun deres egne scores — ikke medspillere/motstandere, slik GDPR Article 20 tilsier), og invitasjoner der `email` matcher eller `invited_by` matcher. UI-trigger: «Last ned»-knapp i ny «Mine data»-seksjon nederst på `/profile`.
- **`/profile/slett-konto`** — ny dedikert bekreftelses-side (`app/profile/slett-konto/page.tsx`) per destruktiv-handling-mønsteret. Viser hva som slettes (profil, e-post, turnerings-tilknytninger) og hva som beholdes (scoring-data — tilhører turneringen). Block-betingelse: hvis brukeren har `game_players`-rader i et spill med `status IN ('active', 'scheduled')` vises et rødt banner i stedet for slett-knappen — kontoen kan ikke slettes mens man er med i et pågående eller planlagt spill. Server-action (`app/profile/slett-konto/actions.ts`) re-sjekker block-betingelsen før den kaller `auth.admin.deleteUser(userId)` via service-role-klient. `public.users` cascade-slettes via FK. Bruker redirectes til `/login?melding=konto_slettet` etter slettingen.
- **«Mine data»-seksjon** på `/profile/page.tsx` med to kort (eksport + slett) under «Invitér en venn». Slett-kortet bruker `#a04040`-akcent for å signalisere faresone.

#### Fixed

- **Privacy: eksport-endepunktet returnerer ikke lenger medspillere/motstanderes scores.** Første utkast av export-route returnerte ALLE scores for ALLE spill brukeren var med i — det ville lekket andre spilleres personlige data via GDPR-endepunktet. Strammet `.in('game_id', gameIds)` til `.or('user_id.eq...,entered_by.eq...')` så kun brukerens egne scores eksporteres.

</details>

---

### [0.10.7] - 2026-05-14

> Du kan nå legge til opptil 7 tee-bokser per bane i admin (var 5).

<details>
<summary>Teknisk</summary>

#### Changed

- **`MAX_TEE_BOXES` bumpet fra 5 til 7** i `app/admin/courses/CourseForm.tsx`. Norske baner har ofte 5 farger (hvit, gul, blå, rød, gull) pluss eventuelt championship-tees for herrer og damer — totalt 7 dekker den vanlige normen. Ingen DB-constraints blokkerer (verifisert mot `0001_initial_schema.sql` — `tee_boxes` har bare value-range CHECKs på slope og par_total).

</details>

---

### [0.10.6] - 2026-05-14

> Vennsinvitasjoner blokkeres nå korrekt hvis mottakeren allerede har startet en innlogging hos Tørny, ikke bare hvis de har fullført profilen.

<details>
<summary>Teknisk</summary>

#### Fixed

- **Friend-invite-gate i `app/invite/actions.ts`** sjekket bare `public.users` via `email_is_registered`-RPC-en. Brukere som var igjen i `auth.users` etter den retired magic-link-flyten (uten å fullføre `/complete-profile`) slapp gjennom — invitasjons-mailen ble sendt, og det påfølgende `signInWithOtp`-kallet overskrev deres `user_metadata.inviter_name`. Lagt til ny `email_is_in_auth_users(text)`-RPC som sjekker `auth.users` direkte, og gate-en kjører nå begge RPC-ene parallelt i `Promise.all`. Hvis enten returnerer true, blokkeres invitasjonen med samme «Denne personen er allerede på Tørny»-melding.

#### Added

- **Migrasjon `0017_email_in_auth_users_rpc.sql`** — ny SECURITY DEFINER-funksjon `public.email_is_in_auth_users(email_to_check text)` som returnerer bool. Eksplisitt `search_path = public, auth, pg_catalog` for å unngå search-path-injection. GRANT EXECUTE til anon + authenticated for defensiv symmetri med `email_is_invited`. Applied til prod via Supabase MCP.

</details>

---

### [0.10.5] - 2026-05-14 · bug

> Kontakt-lenken på personvern-siden går nå til en faktisk e-postadresse (`personvern@tornygolf.no`) i stedet for en admin-bare side spilleren ikke kunne nå.

<details>
<summary>Teknisk</summary>

#### Fixed

- **Kontakt-seksjonen på `app/legal/privacy/page.tsx`** pekte til `https://tornygolf.no/admin/spillere`, som er auth-gated til admin-brukere. En vanlig spiller som klikket for å utøve GDPR-rettighetene sine endte på en innloggingsvegg de ikke kom forbi. Erstattet med `mailto:personvern@tornygolf.no`. Domeneshop-aliaset må settes opp manuelt for at adressen skal motta mail.

</details>

---

### [0.10.4] - 2026-05-14

> Ny personvern-side på `/legal/privacy` forklarer hvilke data Tørny lagrer om deg, hvor de lagres, og hvilke rettigheter du har.

<details>
<summary>Teknisk</summary>

#### Added

- **Ny rute `app/legal/privacy/page.tsx`** — server-rendret Server Component, ingen auth-gate (offentlig tilgjengelig). Bruker eksisterende `AppShell` + `PageHeader` + `BackLink`-primitives. Norske bokmål-tekst, Fraunces serif for h1/h2 og Inter sans for body. Dekker: (1) hvilke data Tørny lagrer (navn, e-post, kallenavn, handicap, scorekort, invitasjoner), (2) hvor de lagres (Supabase EU/Frankfurt), (3) hvem som ser dem (medspillere ser navn/kallenavn/handicap/resultater, admin ser e-post), (4) hvor lenge (inntil sletting), (5) GDPR-rettigheter (innsyn, retting, sletting, portabilitet), (6) kontakt-info.
- **`export const metadata`** setter `<title>`-tag for siden.

</details>

---

### [0.10.3] - 2026-05-14

> Hvis admin-handlinger feiler på å lese spillerlisten fra databasen, sier banneret nå «Klarte ikke å lese» i stedet for misvisende «Klarte ikke å lagre».

<details>
<summary>Teknisk</summary>

#### Fixed

- **Splittet `db_players`-feilkoden i to.** Tidligere brukte alle databasefeil i admin/games-flyten samme `db_players`-key, så bruker så «Klarte ikke å lagre spillerne. Prøv igjen.» selv når det egentlige problemet var en SELECT-feil på roster. Innført ny `db_roster: 'Klarte ikke å lese spillerlisten fra databasen.'`-key som emit-es fra read-paths i tre server-actions: `app/admin/games/new/actions.ts` (publish-mode roster read), `app/admin/games/[id]/edit/actions.ts` (publish/update_scheduled roster read), og `app/admin/games/[id]/actions.ts` (start-game gamePlayers + roster reads). Write-paths (INSERT/UPDATE/DELETE på `game_players`) beholder `db_players`-meldingen.

#### Changed

- **Konsolidert duplisert `ERROR_MESSAGES` og `buildErrorMessage`-helper.** Tre admin/games-sider (`new/page.tsx`, `[id]/edit/page.tsx`, `[id]/page.tsx`) deklarerte hver sin egen kopi av samme error-message-objekt og helper. Trukket ut til `lib/admin/gameErrorMessages.ts` med to eksporterte map-er: `ERROR_MESSAGES_NEW_GAME` (brukt av new + edit, sier «kan publiseres») og `ERROR_MESSAGES_EXISTING_GAME` (brukt av detail-siden, sier «kan startes»). JSDoc dokumenterer denne kopi-variasjonen så fremtidig refaktor ikke uniformerer den ved et uhell.

</details>

---

### [0.10.2] - 2026-05-13

> SyncBanner viser nå norsk, lesbar forklaring («Mistet nett-tilkoblingen», «Innloggingen er utløpt») i stedet for tekniske Safari-feilmeldinger som «TypeError: Load failed».

<details>
<summary>Teknisk</summary>

#### Changed

- **`SyncBanner` — friendly error-mapping.** Raw `lastError` fra Supabase RPC mappes nå til norsk forklaring spilleren kan forstå og handle på:
  - `Load failed` / `Failed to fetch` / `NetworkError` → «Mistet nett-tilkoblingen»
  - `JWT` / `expired` / `session` / `401` / `unauthorized` → «Innloggingen er utløpt — logg inn på nytt»
  - `permission` / `forbidden` / `row-level` / `403` → «Tillatelse manglet»
  - `rate limit` / `429` / `too many` → «For mange forespørsler — vent litt»
  - Catch-all: «Lagring mislyktes»
- **Banneret går fra to-linjet (heading + raw-error subtext) til én-linjet** («Mistet nett-tilkoblingen. N slag venter.»). Renere på smale skjermer, ingen jargon.
- **Raw error bevares som `title`-attribute** på banner-elementet — admin kan long-press/hover for å se den eksakte underliggende meldingen til feilsøking, men spilleren ser ikke jargon-en før de eksplisitt graver i den.

</details>

---

### [0.10.1] - 2026-05-13

> Du får nå en mail hver gang en spiller leverer scorekortet sitt — du slipper å åpne appen for å sjekke om det er noe å godkjenne.

<details>
<summary>Teknisk</summary>

#### Added

- **`lib/mail/scorecardSubmittedNotification.ts`** — Resend-mail-helper med samme brand-stil som de andre mail-malene. Subject: `Scorekort levert: <playerName> — <gameName>`. CTA-button til `https://tornygolf.no/admin/games/<id>`.
- **`submitScorecard`-action** ([app/games/[id]/submit/actions.ts](app/games/[id]/submit/actions.ts)) fyrer mail til alle admin-brukere etter at submit-update lykkes. Henter submitter's navn + admin-emails i parallell (Promise.all) etter DB-update, filtrer ut submitter selv (slik at en player-admin ikke mailer seg selv), og sender via Promise.allSettled. Feil logges, blokkerer aldri.

#### Changed

- **Initial game-fetch i `submitScorecard`** inkluderer nå `name`-feltet (trengs som mail-subject).

</details>

---

### [0.10.0] - 2026-05-13

> Når du avslutter et spill får alle spillerne automatisk en mail med «Resultatet er klart» og lenke til leaderboard — du trenger ikke lenger sende beskjeden manuelt.

<details>
<summary>Teknisk</summary>

#### Added

- **`lib/mail/gameFinishedNotification.ts`** — ny Resend-mail-helper med brand-stilet HTML + plaintext-fallback. Subject: `Resultatet er klart — <gameName>`. Body: «Hei <fornavn>!» + kort hook + grønn CTA-button til `https://tornygolf.no/games/<id>/leaderboard`. Bruker samme palette + struktur som `inviteNotification.ts`.
- **`endGame`-action** ([app/admin/games/[id]/actions.ts](app/admin/games/[id]/actions.ts)) sender nå mail til alle spillere etter status-flippen til `finished`. Henter spillerne sammen med de eksisterende `submitted_at` / `approved_at`-validerings-queriene (én query, ikke to), filtrer på `users.email` ikke-tom, og fyrer `Promise.allSettled` over alle send-kall. Feil logges til Vercel via `console.error` og blokkerer aldri actionen — leaderboard er nådd in-app uavhengig av om mailen kom fram.

#### Changed

- **Initial game-fetch i `endGame`** inkluderer nå `name`-feltet (trengs som subject + body i mailen). Marginal data-overhead, sparer en re-fetch.

</details>
</details>

<details>
<summary><strong>0.9.x — Sync-feedback under runden (5 oppføringer)</strong></summary>

Hvis et slag ikke kommer fram til serveren, sier appen ifra. Ny sticky banner viser hvor mange slag som mangler synk, surface'r faktiske feilmeldinger fra Supabase, og lar deg manuelt prøve igjen — i stedet for at sync-køen stille henger i bakgrunnen. Pilot-polish underveis: scorekort wiper ikke lenger settet score hvis du tilfeldigvis trykker på det igjen.

### [0.9.4] - 2026-05-13

> Game-hjem-sidens to gate-queries kjører nå parallelt, og audit av leaderboard/submit/scorecard bekrefter at de allerede gjorde det.

<details>
<summary>Teknisk</summary>

#### Changed

- **`app/games/[id]/page.tsx` — game + me i Promise.all.** Sekvensiell awaits (`game` deretter `me`) er nå én parallel-bølge. Sparer én Supabase round-trip per load. Side-en treffes på app-åpning, fra hjem-tile, fra hver «Hjem»-tap fra hull-pages, og fra leaderboard/submit-tilbakeknappen — ofte. Estimert ~200ms spart per load.
- **Pilot-instrumentering** lagt til samme sted (`game.page game=X · gate`), parallel med hole-page-instrumenteringen.

#### Audit

- **`app/games/[id]/leaderboard/page.tsx`** — allerede parallel (Promise.all på game + profile, deretter Promise.all på players + holes + scores i suspended body). Ingen endring trengs.
- **`app/games/[id]/submit/page.tsx`** — allerede parallel (Promise.all på game + me, deretter Promise.all på holes + scores i suspended body). Ingen endring trengs.
- **`app/games/[id]/scorecard/page.tsx`** — allerede parallel (Promise.all på game + me). Ingen endring trengs.

</details>

---

### [0.9.3] - 2026-05-13

> Hull-bytte er ~60% raskere — server-rundene som tidligere kjørte sekvensielt går nå parallelt, og to av dem er slått sammen til én.

<details>
<summary>Teknisk</summary>

#### Changed

- **Hull-page server-fetch-grafen refaktorert fra 7 sekvensielle awaits til 2 parallel-bølger.** Måling på production via instrumentering fra v0.9.2 viste at hver hull-bytte kostet 1.2–2.1s server-side med median fetch ~150–200ms og outliers opp i 800ms+ (Supabase round-trip-overhead, ikke query-kompleksitet). Nye struktur ([app/games/[id]/holes/[holeNumber]/page.tsx](app/games/[id]/holes/[holeNumber]/page.tsx)):
  - **Runde 1 (Promise.all):** `games`, ALL `game_players` for spillet (med users-join), `scoreCount`. Tre uavhengige queries fyres samtidig — max-tid er den tregeste enkelt-queryen i stedet for summen.
  - **In-memory:** finn `me` blant alle game_players, derive flight ved å filtrere `flight_number === me.flight_number`. Dette fjerner én helt round-trip (tidligere kjørte vi en separat `me`-query, deretter en flight-query med WHERE flight_number=X).
  - **Runde 2 (Promise.all):** `course_holes` for gjeldende hull + `scores` for flight-medlemmer på gjeldende hull. Begge avhenger av runde 1 men er uavhengige av hverandre.
- **Estimert speedup:** fra ~1.5s gjennomsnitt til ~600ms (–60%). Trade-off: allGamePlayers-queryen returnerer 8 rader i stedet for 4 fra den gamle flight-queryen — marginal data-overhead, men én round-trip spart. RLS er upåvirket: brukere ser fortsatt kun det `game_players`-policy-en allerede tillater.
- **Instrumentering oppdatert:** logger nå `round1`, `round2` og total i stedet for syv enkelt-fetches. Verifiserer at parallellisering faktisk skjer i prod.

</details>

---

### [0.9.2] - 2026-05-13

> Skjermlesere identifiserer nå ventende invitéer korrekt i opprett-spill-flyten, og lange e-postadresser dytter ikke lenger «Venter»-pillen ut av synsfeltet.

<details>
<summary>Teknisk</summary>

#### Fixed

- **A11y på `/admin/games/new` spiller-picker.** Checkboxen får nå `aria-label={`${playerLabel(p)}${p.pending ? ' — venter på å fullføre profil' : ''}`}` slik at skjermlesere annonserer status semantisk koblet til raden i stedet for å rapportere «Venter»-pillen som flytende tekst etter check-boxen. Pillen får `aria-hidden="true"` for å unngå dobbel-annonsering.
- **Truncation på `/admin/games/new` spiller-picker label-spannet.** La til `min-w-0 truncate` så patologisk lange e-postadresser (over container-bredde) klippes med ellipsis i stedet for å dytte «Venter»-pillen ut av viewportet på smale skjermer (iPhone SE 320px).

#### Changed

- **Server-side timing instrumentering på hull-siden** ([app/games/[id]/holes/[holeNumber]/page.tsx](app/games/[id]/holes/[holeNumber]/page.tsx)). `console.time/timeEnd` rundt hver av de syv server-side awaitsene (auth, game, me, hole, flight, scores, scoreCount) + en total-wrapper, med label-prefix `hole.page game=X hole=N · <step>`. Loggene fanges av Vercel og kan pulles etter pilot-runden for å bestemme om hull-bytte-latency dominans er på Supabase-runden, RSC-serialisering, eller cold-start. Ingen brukerflate-effekt — kun observasjon. Fjernes (eller gates bak dev-flag) når arkitektur-valget i TODO.md er gjort.

</details>

---

### [0.9.1] - 2026-05-13 · bug

> Et score du har justert med + eller − blir ikke lenger nullstilt til par hvis du tilfeldigvis trykker på kortet igjen — og onboarding-banneret beskriver knappene som faktisk finnes.

<details>
<summary>Teknisk</summary>

#### Fixed

- **`ScoreCard.onCardClick` no-op'er når score allerede er satt.** Tidligere kalte tap-på-kort-body alltid `onSetScore(par)` uansett current score, så et tilfeldig touch-event etter at brukeren hadde brukt + / − wipet justeringen tilbake til par. Card-tap er nå en first-entry-snarvei kun: hvis `score == null` setter den par som baseline, ellers er kortet en no-op-flate. +/− og «…» er fortsatt full-spektrum-redigerings-overflater. Ny test (`ScoreCard.test.tsx`) verifiserer at tap når `score` er satt ikke kaller `onSetScore`.
- **Onboarding-banner-copy speiler virkeligheten.** Tidligere tekst: «Klikk det øverste kortet for å sette par. Klikk-og-dra opp eller ned for +1/−1.» — men klikk-og-dra finnes ikke i koden (kun + / − / ⋯-knapper). Ny tekst: «Trykk det øverste kortet for å sette par. Bruk + og − for å justere.»

</details>

---

### [0.9.0] - 2026-05-13

> Hvis et slag ikke kommer fram til serveren, sier appen ifra — og du kan trykke «Prøv igjen» i stedet for å lure på om scoren ble lagret.

<details>
<summary>Teknisk</summary>

#### Added

- **`SyncBanner`-komponent ([components/sync/SyncBanner.tsx](components/sync/SyncBanner.tsx))** mounted i `app/games/[id]/layout.tsx`. Sticky-top på alle game-sider (hull, leaderboard, submit, approve, scorecard, venterom). Observerer `localDb.syncQueue` via `useLiveQuery` og rendrer kun når køen har items som enten har hatt minst ett feilet forsøk (`attemptCount > 0` eller `lastError != null`) ELLER har stått i køen > 30 sekunder. Inneholder «Prøv igjen»-knapp som kaller `drainQueue()` direkte — bruker eksisterende sync-listener-disiplin, krever ingen RLS- eller migrasjonsendringer.
- **Bruker-synlig feilmelding** når Supabase RPC `upsert_score_if_newer` feiler. Banneret ekstraherer `lastError`-feltet fra første queue-item med feil og viser det som sekundær-tekst under tagline-en (eks. «Failed to fetch» ved offline, «JWT expired» ved utløpt session). Hjelper Jørgen feilsøke under pilot uten å åpne devtools.
- **«X slag venter på lagring»**-banner med 30-sekunders threshold. Internal `setInterval(1000)`-tick reaktiv-evaluerer alder på eldste queue-item slik at banneret dukker opp uten å vente på neste sync-drain.

#### Changed

- **Retry-knapp**: minimum 500ms feedback-tid via `Promise.all([drainQueue(), sleep(500)])` så «Sender…»-state ikke flasher forbi når retry blir no-op'et av `inFlight`-guarden i syncWorker. Brukeren får visuell bekreftelse på at klikket ble registrert.

</details>
</details>

<details>
<summary><strong>0.8.x — Sletting og «trekk tilbake»-flyt (27 oppføringer)</strong></summary>

Dedikert slett-side for spillere, fulgt av tre iterasjoner på «trekk tilbake»-bekreftelsen for å få den robust på iPhone-PWA. Pilot-polish på topp: tydeligere tekst utendørs i sol.

### [0.8.5] - 2026-05-13

> Hull-nummer og sekundær-tekst er nå tydeligere å lese på telefon utendørs — viktig før pilot-runden.

<details>
<summary>Teknisk</summary>

#### Changed

- **Bumpet `--text-muted` (#5C5347 → #4A3F30)** i light mode. Token brukes av tournament-name i hull-headeren, sync-status-linja, score-kort-helpere og ~20 admin-kickers — alle får en touch mer kontrast mot linen-bg (#F8F6F0). Hierarkiet bevares (#4A3F30 er fortsatt klart sekundært mot #1A2E1F text), men perseptuell vekt øker nok til at uppercase-tight-labels og 10–12px sekundær-tekst leses bedre i direkte sollys. Dark mode-tokenet er urørt.
- **`HoleStrip` future-state nummer: font-weight 500 → 600.** Hull som ikke er spilt enda (typisk 17 av 18 ved runde-start) hadde tynne 13px serif-tall som forsvant i sol. Bumpen fra 500 → 600 sharpenser nummer-rendering uten å endre farge eller hierarki — current og completed er fortsatt visuelt distinkte.

</details>

---

### [0.8.4] - 2026-05-13 · bug

> Du kan nå trekke tilbake en invitasjon fra iPhone uten at knappene oppfører seg rart.

<details>
<summary>Teknisk</summary>

#### Fixed

- **«Trekk tilbake»-flyten fungerer nå på iPhone-PWA.** Forrige fix (v0.8.3) erstattet `<details>`-popouten med en URL-toggle inline (Bekreft + Avbryt på samme rad), men brukeren rapporterte at Bekreft-knappen ikke var trykkbar på iPhone, og at Avbryt-knappen i stedet utløste tilbaketrekkingen — antagelig på grunn av en kollisjon mellom server-action form-submit og SmartLink-prefetch på samme touch-event. Bytter nå til samme mønster som slett-bruker (`/admin/spillere/[id]/slett`): «Trekk tilbake»-lenken navigerer til en dedikert bekreftelses-side på `/admin/spillere/invitations/[id]/trekk-tilbake/` med stor Bekreft-knapp og separat Avbryt-lenke. Ingen knapper deler tap-target, ingen flyktige toggle-tilstander.

</details>

---

### [0.8.3] - 2026-05-13 · bug

> Forsøk på å fikse «trekk tilbake»-bekreftelsen for iPhone — viste seg å ikke fungere helt, og ble erstattet av løsningen i 0.8.4.

<details>
<summary>Teknisk</summary>

#### Fixed

- **«Trekk tilbake»-bekreftelsen fungerte ikke på iPhone-PWA.** Den brukte `<details>`/`<summary>` for inline-popout, men iOS Safari håndterer tap-events inni open-state-popouten upålitelig (tap kan boble til summary og lukke popouten før Bekreft-knappen registrerer klikket). I tillegg ble popouten klippet av kortets `overflow-hidden`, og kunne overlappe nabo-radens knapper slik at et klikk for «Bekreft» traff «Send på nytt» på raden under. Erstattet med en server-rendret URL-toggle: trykk på «Trekk tilbake» legger til `?confirm=<id>` i URL-en, og den raden rendres i confirm-modus inline med tydelige Bekreft + Avbryt-knapper. Ingen JS, ingen popout-quirks, fungerer likt på alle nettlesere og PWA-shells.

</details>

---

### [0.8.2] - 2026-05-13 · bug

> Ventende invitéer dukker ikke lenger opp dobbelt i admin-spillerlista, og «trekk tilbake» frigjør e-postadressen som forventet.

<details>
<summary>Teknisk</summary>

#### Fixed

- **Spillerliste på `/admin/spillere` viser ikke lenger ventende invitéer dobbelt.** Etter at migrasjon `0014_pending_users` begynte å auto-opprette `public.users`-rader for hver `auth.users`, dukket ventende invitéer (de uten `profile_completed_at`) opp som «registrerte spillere» i tillegg til å være i ventende-invitasjoner-seksjonen. Spillerlista filtrerer nå på `profile_completed_at IS NOT NULL`, og «X registrert»-tellingen matcher.
- **«Trekk tilbake»-orphan-cleanup tilpasset trigger-baserte `public.users`-rader.** Sjekken var «hvis `public.users`-raden mangler, slett `auth.users`» — men siden trigger nå alltid oppretter raden, ble den sjekken alltid usann. Logikken bruker nå `profile_completed_at IS NULL` som signal på «invitéen fullførte aldri profil», så `auth.users` ryddes som forventet.
- **Null-safe visning av navn** på spiller-detalj og slett-bekreftelses-sider — invitéer uten utfylt navn vises med e-postadressen i stedet for en tom overskrift.

</details>

---

### [0.8.1] - 2026-05-13 · bug

> Hvis sletting av en spiller mislykkes, sier appen nå hvorfor — i stedet for å se ut som om ingenting skjedde.

<details>
<summary>Teknisk</summary>

#### Fixed

- **Silent banner-feil ved feilet sletting.** Detalj-siden (`/admin/spillere/[id]`) viste ingen tilbakemelding når slett-flyten feilet eller ble blokkert av self-protect — den manglet meldinger for `self_delete_forbidden`, `still_has_games` og `auth_delete_failed` i sin `ERROR_MESSAGES`-tabell. Nå viser banneret en ærlig forklaring i alle tre tilfeller, inkludert hint om mulige FK-grunner («data knyttet til seg — invitasjoner sendt, baner opprettet eller scores skrevet»).
- **Ærligere kode-kommentar om FK-cascade-grensene** i `deleteUser`-action: dokumenterer at `public.users`-cascaden kun cleaner opp én rad, og at andre FK-er (`scores.entered_by`, `invitations.invited_by` osv.) er trygt dekket i dagens admin-modell men må sjekkes eksplisitt når arrangør-rollen lander.

</details>

---

### [0.8.0] - 2026-05-13

> Du kan slette en spiller fra admin — nyttig hvis du sendte invitasjon til feil e-postadresse.

<details>
<summary>Teknisk</summary>

#### Added

- **Slett-flyt for spillere på `/admin/spillere/[id]/slett`.** Dedikert bekreftelses-side viser navn, e-post og forklaring. Slett-knappen kaller `auth.admin.deleteUser` via service-role-klienten — `auth.users`-raden slettes, `public.users` cascade-slettes automatisk, og e-posten frigjøres for ny invitasjon.
- **Block-betingelser** på server-side: kan ikke slette deg selv (self-protect), kan ikke slette en spiller som har en eller flere `game_players`-rader.

</details>
</details>

<details>
<summary><strong>0.7.x — Bruker-detalj-redigering (1 oppføring)</strong></summary>

Klikk på en spiller i admin for å redigere navn, kallenavn og handicap. Faresone-seksjon på detalj-siden forbereder slett-flyten som lander i 0.8.0.

### [0.7.0] - 2026-05-13

> Klikk på en spiller i admin for å redigere navn, kallenavn og handicap-indeks.

#### Added

- **Bruker-detalj på `/admin/spillere/[id]`.** Klikkbar rad i spillerlista åpner form for å redigere navn, kallenavn og handicap-indeks. Lagre-knapp gir ærlig success/feil-banner.
- **Faresone-seksjon** på detalj-siden viser slett-lenken som disabled inntil neste leveranse aktiverer den. Forklarende tekst hvis spilleren har historikk eller hvis det er deg selv.

#### Changed

- **RLS:** Ny policy `users admin update` lar admin oppdatere andre bruker-rader (tidligere kun egen rad). Migrasjonen heter `0015_admin_user_management` (filnavn-kollisjon med `0014_pending_users` ble rensket opp ved merge).
</details>

<details>
<summary><strong>0.6.x — Samlet spilleradministrasjon (1 oppføring)</strong></summary>

Erstatter den gamle `/admin/invitations`-flata med `/admin/spillere`, som samler registrerte spillere, ventende invitasjoner og invitasjons-form på ett sted og legger til «Send på nytt» og «Trekk tilbake»-actions.

### [0.6.0] - 2026-05-13

> Ny «Spillere»-side i admin samler registrerte spillere, ventende invitasjoner og invitasjons-form på ett sted, og du kan re-sende eller trekke tilbake invitasjoner derfra.

#### Added

- **Ny samlet spilleradministrasjon på `/admin/spillere`.** Erstatter gamle `/admin/invitations`. Tre seksjoner i én flate: registrerte spillere (med søk på navn/kallenavn/e-post), ventende invitasjoner, og en sammenfoldet «Inviter ny spiller»-form nederst.
- **«Send på nytt»-knapp på ventende invitasjoner.** Trigger ny notifikasjons-mail via Resend til samme adresse. Ingen ny DB-rad.
- **«Trekk tilbake»-knapp på ventende invitasjoner** med inline to-trinn-bekreft. Sletter `invitations`-raden; hvis invitéen hadde bedt om kode men aldri fullført profil (`profile_completed_at IS NULL`), ryddes også `auth.users`-raden via service-role slik at e-posten er ledig igjen.

#### Changed

- **Admin-hjemmeside-tile «Invitasjoner» erstattet av «Spillere»** med kombinert telling («12 registrert · 4 venter»).
- **Lenker fra «Opprett spill» og «Rediger spill»** når man trenger flere spillere peker nå til `/admin/spillere` i stedet for `/admin/invitations`.

#### Removed

- **Rute `/admin/invitations`** — funksjonaliteten finnes nå på `/admin/spillere`.
</details>

<details>
<summary><strong>0.5.x — Pending-invitees-integrasjon (11 oppføringer)</strong></summary>

Ventende invitéer kan nå velges til lag og flight før de selv har logget inn. Ti patch-bumps fulgte for å rydde fallouten fra migrasjon 0014, som auto-oppretter `public.users`-rader for hver `auth.users` og som dermed brøt onboarding-gate, picker-filter, draft-validering og start-spill-guard.

### [0.5.10] - 2026-05-13 · bug

> «Akseptert»-statusen på en invitasjon stemmer nå med om spilleren faktisk har fullført profilen sin.

#### Fixed
- `Akseptert`-pille på `/admin/invitations` reflekterer nå faktisk onboarding (`profile_completed_at IS NOT NULL`), ikke bare at invitasjons-raden ble markert akseptert ved OTP-verify. Stoppet misvisende «Akseptert»-status for brukere som klikket gammel magic-link-mail uten å fullføre profil.

### [0.5.9] - 2026-05-13 · bug

> Beskytter mot at en bruker blir hengende som «Venter» selv etter at de har lagret profilen sin.

#### Fixed
- Profil-oppdateringen stamper nå `profile_completed_at` som defence-in-depth, så en bruker som havner på `/profile` uten å ha fullført onboarding (deploy-vindu-race i tidligere release) blir ikke sittende fast som «Venter» i picker-en.

### [0.5.8] - 2026-05-13 · bug

> Du kan ikke starte et planlagt spill hvis noen av deltakerne fortsatt mangler å fullføre profilen.

#### Fixed
- «Start spillet» (draft → aktiv) blokkeres nå hvis ikke alle valgte spillere har fullført profil — samme guard som scheduled-pathen.
- Invitér-en-venn-actionen sjekker `profile_completed_at` i stedet for "rad finnes ikke" som ble dødt etter migrasjon 0014.

### [0.5.7] - 2026-05-13 · bug

> Ventende invitéer uten utfylt navn vises med e-postadressen i stedet for tom plass.

#### Fixed
- Rendring av ventende invitéer (uten utfylt navn) faller tilbake til e-postadressen i stedet for å vise tom tekst — gjelder admins spill-detaljside (lag/flight-oversikt) og spillernes venterom-visning av draft-spill.

### [0.5.6] - 2026-05-13 · bug

> Nye brukere sendes igjen til onboarding-skjermen ved første innlogging.

#### Fixed
- Nye brukere ble ikke sendt til onboarding på `/` og `/profile` etter at trigger-en fra migrasjon 0014 begynte å pre-opprette `public.users`-rader. Gate-en sjekker nå `profile_completed_at` i stedet for "rad finnes ikke".

### [0.5.5] - 2026-05-13 · bug

> Førstegangs-onboarding fungerer igjen for nye brukere — var midlertidig brutt etter en bakgrunnsendring.

#### Fixed
- `complete-profile` oppdaterer nå den auto-opprettede `public.users`-raden i stedet for å forsøke å sette inn på nytt. Uten denne ville migrasjon 0014 brutt all ny brukerregistrering.

### [0.5.4] - 2026-05-13 · bug

> Feilmeldingen for ventende spillere på opprett-spill-siden viser nå e-postadressene i stedet for «{LIST}».

#### Fixed
- Feilmelding for ventende spillere viste `{LIST}`-plassholderen bokstavelig på opprett-spill-siden. Bruker nå samme `buildErrorMessage`-helper som rediger-spill og spill-detalj.

### [0.5.3] - 2026-05-13 · bug

> Ekstra sikkerhets-sjekk: et publisert spill kan ikke startes med ventende spillere selv om databasen blir manuelt redigert.

#### Fixed
- Start spill blokkeres også (defence-in-depth) hvis et publisert spill noensinne skulle få ventende spillere via direkte DB-redigering.

### [0.5.2] - 2026-05-13 · bug

> Du kan ikke endre et eksisterende spill til publisert hvis det fortsatt har ventende invitéer.

#### Fixed
- Publisering/oppdatering fra rediger-spill blokkeres med tydelig e-postliste hvis ventende invitasjoner står på rosteret.

### [0.5.1] - 2026-05-13 · bug

> Du kan ikke publisere et nytt spill hvis noen av deltakerne ikke har fullført profilen sin.

#### Fixed
- Publisering av nytt spill blokkeres nå hvis ikke alle valgte spillere har fullført profil.

### [0.5.0] - 2026-05-13

> Du kan nå velge ventende invitéer til lag og flight før de selv har logget inn.

#### Added
- Inviterte spillere som ikke har logget inn ennå dukker opp i game-picker-en med en gul `Venter`-pille. Admin kan velge dem til lag og flight og lagre utkast.
</details>

<details>
<summary><strong>0.4.x — OTP-kode-innlogging (4 oppføringer)</strong></summary>

Bytte fra magic-link til 6–8-sifret kode i mail, som fjernet to iOS-PWA-blokkerings-bugs samtidig. Inkluderer ærligere admin-invitasjons-banner ved Resend-feil og forberedelse for pending-invitees-sporing i 0.5.x.

### [0.4.3] - 2026-05-13

> Tørny vet nå hvilke spillere som har fullført profilen — forberedelse for å vise ventende invitéer riktig i spill-pickeren.

#### Added

- Inviterte spillere som ikke har fullført registrering blir nå sporet via `profile_completed_at`. Forberedelse for å vise dem i game-picker-en.

### [0.4.2] - 2026-05-13 · bug

> Hvis «Du er invitert»-mailen ikke kommer fram, sier admin-banneret det ærlig i stedet for å lyve «Invitasjon sendt».

#### Fixed

- **Admin-invitasjons-banneret lyver ikke lenger om mail-utsending.** Tidligere viste `/admin/invitations` alltid «✓ Invitasjon sendt»-banner etter at raden var lagret, selv om Resend-utsendingen faktisk feilet — feilen ble bare stille logget i Vercel-runtime-loggene. Hvis Resend kaster nå, vises et ærlig feil-banner: «Invitasjonen ble lagret, men «Du er invitert»-mail kom ikke ut. Sjekk Vercel-loggene for detaljer.» Raden i `invitations`-tabellen bevares fortsatt (admin kan re-sende manuelt når mail-konfigen er fikset).

### [0.4.1] - 2026-05-13 · bug

> Innloggings-kode-feltet godtar nå 8-sifrede koder, som er Supabase' faktiske standard.

#### Fixed

- **Kode-input godtar nå 6–8 sifre, ikke bare 6.** Supabase' default OTP-lengde er 8 sifre (endret i mai 2024) — vi hardkodet 6 sifre i kode-feltet, så brukere som fikk en 8-sifret kode kunne kun skrive inn de første 6 og fikk feilmelding. Pattern og maxLength er nå fleksible, hjelpe-tekst sier «kode» i stedet for «6-sifret kode».

### [0.4.0] - 2026-05-13

> Du logger inn med en 6–8-sifret kode du taster inn, i stedet for å klikke en lenke i mailen. Inviterte spillere får først en notifikasjons-mail og må be om innloggings-kode selv etterpå.

#### Changed

- **Innlogging går nå via 6-sifret kode i mail i stedet for å klikke lenke.** Du skriver inn e-post som før, men i stedet for å klikke en lenke i mailen mottar du en kode (f.eks. `482 619`) som du taster inn på samme side. Fjerner to pre-existing problemer som blokkerte PWA-innlogging på iPhone: (a) magic-link åpnet seg i Safari i stedet for PWA-en og brøt PKCE-handoff-en, (b) mail-scannere konsumerte engangs-token-en før brukeren faktisk klikket. Begge problemene forsvinner når det ikke finnes noen URL å konsumere — bare en kode som leses med øynene og tastes inn.
- **Invitasjons-mailen er ny.** Når admin inviterer en kompis sender Tørny nå en kort notifikasjons-mail («Du er invitert. Gå til tornygolf.no og logg inn med din e-post.») via Resend. Selve innloggings-koden får invitéen først når de kommer til /login og taster e-posten sin der. To mailer per invitasjon (notifikasjon + kode), men én og samme innloggings-flyt for alle.

#### Removed

- **Magic-link-URL-flyten.** `/auth/callback`-route-en redirecter alle gamle klikk til `/login?error=link_expired` i en 30-dagers overgangsperiode. Etter 2026-06-13 fjernes route-en helt (tracked in TODO.md).
</details>

<details>
<summary><strong>0.3.x — Logo og pre-OTP-fixes (4 oppføringer)</strong></summary>

Tørny fikk sin egen visuelle identitet (wordmark med champagne-prikk på login og app-ikoner), pluss tre fixes som ryddet opp før OTP-omleggingen: invitasjoner som sto som «VENTER» etter aksept, tee-off-tider som lå 1–2 timer feil, og «lagre utkast» som låste seg på native HTML5-validering.

### [0.3.3] - 2026-05-13 · bug

> Invitasjoner flippes nå korrekt til «Akseptert» når mottakeren logger inn første gang — før dette sto alle som «Venter» uansett.

#### Fixed

- **Invitasjoner sto som «VENTER» selv etter aksept.** Hele tabellen `public.invitations` hadde `accepted_at = NULL` på alle 8 rader — ingen kode skrev til kolonnen noensinne. Auth-callback (`app/auth/callback/route.ts`) markerer nå alle ventende invitasjoner for innlogget brukers e-post som akseptert etter vellykket `exchangeCodeForSession`. Best-effort: feil i side-effekten blokkerer aldri innloggingen. Ny RLS-policy (`migration 0012`) lar bruker UPDATEe sin egen invitasjon — kun `accepted_at`-flippen er tillatt, alle andre kolonner må forbli identiske. Backfill kjørt mot 4 stranded rader som hadde `auth.users.confirmed_at` satt.

### [0.3.2] - 2026-05-13 · bug

> Tee-off-tider viser nå riktig tid på alle skjermer — var av med 1–2 timer i et kort vindu rett etter sideinnlasting.

#### Fixed

- **Tee-off-tider rendret 1–2 timer feil under hydration.** `lib/format/teeOff.ts` brukte lokal-TZ `Date.getHours/getMinutes/getDate/getMonth` — på Vercel-serveren (UTC) ga det feil tid i HTML-en før hydration på iPhone (Europe/Oslo) tok over. Rammet hjem-skjermen, runde-siden og leaderboarden. Bytter til `Intl.DateTimeFormat` med eksplisitt `timeZone: 'Europe/Oslo'`, så server og klient nå renderer identiske strenger uavhengig av host-TZ. DST håndteres riktig (UTC → Oslo sommer +02, vinter +01). 11 nye tester verifiserer oppførselen under flere host-TZ-er.

### [0.3.1] - 2026-05-13 · bug

> Du kan lagre et halvferdig spill-utkast uten at bane- og handicap-feltene må fylles ut først.

#### Fixed

- **«Lagre utkast» låste seg på native HTML5-validering.** Knappen blokkerte sending så snart et `<select required>`-felt (bane/tee/handicap-allowance) var tomt, selv om hele poenget med utkast er å lagre delvis utfylt skjema. Lagt til `formNoValidate` på utkast-knappen — publiser-knappen validerer fortsatt normalt, og server-siden tar fortsatt vare på `name` som eneste obligatoriske felt for utkast.

### [0.3.0] - 2026-05-13

> Tørny har fått sin egen logo — wordmark med champagne-prikk på login-skjermen og som app-ikon.

#### Changed

- **Visuell identitet — Tørny-logoen.** Login-skjermen viser nå hovedlogoen (wordmark «Tørny» + champagne-prikk + tagline *«Fyr opp golfturneringen på et par minutter»*) over innloggings-kortet, sentrert på linen-bakgrunnen. Den ekstra T-flisen og den dekorative medallion-en er fjernet — de duplikerte logoen og bråket mot brand-mark.svg-spec-en.
- **BrandMark-låsen i øverste venstre hjørne** (hjem, profil, admin) er strippet til kun wordmark «Tørny» med en liten champagne-prikk. Den mørke T-flisen og «TURNERING»-undertittelen er fjernet.
- **Tagline-formuleringen** *«Fyr opp golfturneringen på et par minutter»* (med wordplay-«par») er nå canonical i `CLAUDE.md`. Tidligere kortform uten «et par» er erstattet.

#### Added

- **App-ikoner (192×192, 512×512, 180×180)** og `brand-mark-icon-only.svg` har fått en champagne-prikk til høyre for T-en, slik at hjemskjerm-ikonet på iOS/Android og favicon-en bærer samme brand-aksent som logoen i appen.

#### Removed

- «Logg inn»-overskriften på `/login`. Hero-en + «Send meg lenke»-knappen + hjelpeteksten gir nok kontekst.

## [0.2.0] - 2026-05-12

> Innfører versjonerings-disiplin: hver bruker-synlig endring skal bumpe versjonen og legge til CHANGELOG-oppføring i samme commit.

<details>
<summary>Teknisk</summary>

#### Added

- Versjonerings-disiplin: hver commit som endrer bruker-synlig oppførsel bumper `package.json` og legger til oppføring i denne fila. Reglene står i `CLAUDE.md`.

#### Notes

- Versjonen som vises i app-footeren (`AppVersionFooter.tsx`) er allerede koblet til `package.json` via `next.config.ts` — fra og med dette bumpet vil footeren reflektere reell release-versjon istedenfor en konstant `v0.1.0`.

</details>

---

## Pre-disiplin (`0.1.0`)

Versjonen `0.1.0` dekker all utvikling fra Phase 0 til og med Phase 12.5. Ingen detaljerte lanseringsnotater ble ført i denne perioden. Et grovt sammendrag:

- **Phase 0–4**: prosjektoppsett, datamodell, Supabase + RLS, scoring-bibliotek (`lib/scoring/`) med 40 unit-tester
- **Phase 5–8**: auth-flyt (magic link), invitasjons-system, admin-flate for baner og spill, hull-skjerm med score-input
- **Phase 9–10**: offline-sync via Dexie, realtime-oppdateringer, peer-godkjenning og admin-overstyring
- **Phase 11–12**: PWA-oppsett, premium-stil med forest-and-champagne palett, leaderboard og scorekort
- **Phase 12.5**: draft-mode på venterom med progressive disclosure, fargeharmonisering for status-bannere

Full historikk: `git log` mellom prosjektstart og commit `02cf8c0`.
</details>
</details>
