# Regelbok-gjennomgang: handicap og poeng (#2927)

Denne fila sammenligner motoren i `lib/scoring/` med regelbøkene, format for format. Hver rad er et avvik eller en sjekk uten avvik. Eieren avgjør hver retting for seg, og orkestratoren lager en sak for hver retting eieren sier ja til.

Gjennomgangen går i fire runder. Runde 1 dekker slagspill og stableford. Runde 2 dekker matchspill, runde 3 scramble og patsome, og runde 4 pottspillene.

## Kilder

Kildene er lest 20.11.2026.

- NGF: [Handicapreglene WHS 2024](https://www.golfforbundet.no/files/documents/handicapreglene-whs-2024.pdf), Norges Golfforbund. Sidetallene i lista er de trykte, og de er like PDF-ens sidetall.
- R&A, handicapreglene: [tolkningene til regel 6](https://www.randa.org/roh/interpretations/rule-6), [vedlegg C](https://www.randa.org/roh/appendices/appendix-c), [vedlegg E](https://www.randa.org/roh/appendices/appendix-e) og [definisjonene](https://www.randa.org/roh/definitions).
- Golfreglene: [regel 21](https://www.randa.org/en/rog/the-rules-of-golf/rule-21) (stableford-tabellen i 21.1b) og [Fremgangsmåter for Komiteen, del 5](https://www.randa.org/en/rog/committee-procedures/5) (tilbaketelling i 5A(6)(d)).

NGF og R&A skiller lag to steder. Der gjelder NGF, fordi det nasjonale forbundet fastsetter handicapgodtgjørelsene (NGF vedlegg C, s. 75):

- Ni hull (6.1b): NGF fordeler 18-hulls spillehandicapet på alle 18 hull. R&A regner et eget 9-hulls banehandicap av 9-hullsverdiene.
- Individuelt slagspill og stableford: NGF anbefaler 100 %. R&A anbefaler 95 % i mellomstore felt.

## Begreper

Regelboka og appen bruker ordene ulikt. Lista bruker appens ord.

| Appen | NGF | R&A (engelsk) |
|---|---|---|
| banehandicap | spillehandicap | Course Handicap |
| spillehandicap (etter andel og tak) | redusert spillehandicap | Playing Handicap |
| andel | handicapgodtgjørelse | Handicap Allowance |
| hullindeks | hullindeks | Stroke Index |
| differensial | handicap spilt til | Score Differential |
| AGS | justert bruttoscore | Adjusted Gross Score |

## Slik leses lista

- F-nummeret følger raden gjennom alle rundene. Runde 2 fortsetter fra siste nummer i runde 1.
- Forslaget «rett» betyr at motoren bør følge regelen. «Produktvalg» betyr to fornuftige løsninger, og eieren velger. «La stå» betyr ingen endring.
- Hver rad med «rett» eller «produktvalg» har en `it.fails`-test i `lib/scoring/rulebook/` med F-nummeret i navnet. Testen påstår regelens tall og feiler i dag. Rettingen gjør testen rød, og samme PR gjør den om til `it` og oppdaterer raden her.
- Hyppighetstallene kommer fra et regneskript som ikke ligger i repoet. Skriptet går gjennom indeks +10,0 til 54,0 i steg på 0,1 på teene 113/72,0/72, 125/71,0/71 og 130/70,0/70, og på ligateen 125/70,0/72 (slope/course rating/par).

## Runde 1: slagspill og stableford

Formater: stableford (solo og lag), modified stableford, solo slagspill, best ball, shamble (netto) og ligaflightene. Testene står i `lib/scoring/rulebook/handicap.rulebook.test.ts` og `lib/scoring/rulebook/strokeplay.rulebook.test.ts`.

### Avvik

| Nr | Format | Motoren gjør | Regelen sier | Regneeksempel | Hvor ofte og hvor mye | Forslag |
|---|---|---|---|---|---|---|
| F1 | Alle formater med personlig differensial som bruker den generelle andelen eller brutto: stableford, modified stableford, solo slagspill, best ball, shamble og ligaflightene. Singles matchplay også (runde 2). | Begge stedene som regner differensialen, sender `game_players.course_handicap` til `computeScoreDifferential`: avslutningen i `lib/games/persistScoreDifferentials.ts:202` og historikken i `lib/stats/roundDifferentials.ts:99`. Tallet er spillehandicapet etter andel og tak (`lib/games/recomputeCourseHandicap.ts:88`). Hulltaket blir da par + 2 + slagene fra spillehandicapet (`lib/scoring/scoreDifferential.ts:50-52`). | NGF 3.1b, s. 31: «Spillerens fulle spillehandicap (100 %) skal brukes for alle netto dobbel bogey justeringer.» NGF 7.2a, s. 65: når Komiteen har satt en høyeste grense, «skal spillerens fulle spillehandicap bli brukt for å beregne deres justerte bruttoscore». | Ligaflight med 75 % og tak 32 på tee 125/70,0/72. Indeks 30,0 gir banehandicap 31 og spillehandicap 23. Runden har bogey på 17 hull og 9 slag på et par 4 med hullindeks 6. Regelen gir to slag på hullet og taket 8. Det gir AGS 93 og differensial 20,8. Appen gir ett slag og taket 7. Det gir AGS 92 og differensial 19,9. | Retningen er motsatt av hypotesen i kontrakten. Taket blir for lavt, og differensialen blir for lav (for god), ikke for høy. På ligateen får 512 av 541 indekser fra 0,0 til 54,0 for lavt tak på minst ett hull. Indeks 30,0 får det på 8 hull, og indeks 54,0 på alle 18 hull (26 slag til sammen). Best ball på 85 % på ligateen gir 497 av 541 indekser og opptil 9 hull. Brutto (0 %) gir taket par + 2 for alle, opptil 58 slag for lavt på ligateen. Utslaget kommer bare på hull der spilleren slår mer enn appens tak. Hvor ofte det skjer i ekte runder, er ikke målt. Differensialen vises i historikkgrafen på nett og i rundehistorikken i appen. | rett |
| F2 | Alle formater med personlig differensial (som F1). | Hulltaket er par + 2 + slagene på hullet, uten grense (`lib/scoring/scoreDifferential.ts:50-52`). | NGF 3.1b, s. 31: «Når et spillehandicap er beregnet til mer enn 54 og en spiller får 4 eller flere slag på et hull, er maksimal hullscore par + 5.» | Indeks 48,8 på tee 130/70,0/70 gir banehandicap 56 og fire slag på hullindeks 1 og 2. En 12-er på et par 4 med hullindeks 1 teller 9 etter regelen og 10 i appen. AGS blir ett slag for høy. Testen regner med slope 113 og course rating 72,0, og der blir differensialen 6,0 i appen og 5,0 etter regelen. | Gjelder bare banehandicap over 54. Det skjer på tee 130/70,0/70 fra indeks 47,4, på 125/71,0/71 fra 49,3, på ligateen fra 51,1, og aldri på 113/72,0/72. Indeks 54,0 på 130/70,0/70 gir fire slag på 8 hull. Hvert slikt hull kan gi ett slag for mye, når spilleren slår over par + 5. I dag slår det bare ut der det frosne tallet er over 54, altså på 100 %. Etter retting av F1 gjelder det alle andeler. | rett |
| F3 | Alle formater med den generelle andelen: stableford, modified stableford, solo slagspill, best ball, shamble og ligaflightene. | Andelen regnes i flyttall: `Math.round(rawCourseHandicap * (percent / 100))` (`lib/scoring/courseHandicap.ts:36`). Et tall som skal ende på nøyaktig ,5, kan havne like under og rundes ned. | NGF 6.2a, s. 55: spillehandicapet «avrundes til nærmeste heltall, hvor 0,5 avrundes oppover». | Indeks 45,0 på tee 113/72,0/72 gir banehandicap 45. 70 % av 45 er 31,5, og regelen gir 32. I flyttall blir regnestykket 31,499999999999996, og appen gir 31. | 7 av 253 836 kombinasjoner (indeks +10,0 til 54,0, fire teer, andel 1–99 %). Bare én av dem har en andel i femmergangen: 45,0 ved 70 %. Ingen gir feil ved 75 % (ligaen), 85 %, 90 % eller 95 %. Feilen er ett slag for lite. Samme feil finnes i heltallsveien `applyAllowance` (`lib/scoring/courseHandicap.ts:54`), der 45 ved 70 % også gir 31. Den veien brukes av formatene med egen prosent og hører til runde 2 og 3 og trinn 2 i #2924. | rett (liten retting, kan tas sammen med trinn 2 i #2924) |
| F4 | Stableford, modified stableford, solo slagspill, best ball og shamble. | Tilbaketellingen ser på sum, så siste 9, siste 6, siste 3 og hull 18. Står det fortsatt likt, deler spillerne plassen (`lib/scoring/tiebreaker.ts:44-51`). | Fremgangsmåter for Komiteen 5A(6)(d): «If there is still a tie, then the last six holes, three holes and final hole of the first nine holes will be considered in turn.» Står det likt etter det også, kan Komiteen kalle det uavgjort eller trekke. Regelen beskriver dette som «one method», altså ikke et krav. | Stableford med banehandicap 0. A og B har 33 poeng og like siste ni. A har 12 poeng på hull 4–9, og B har 9. Regelen kårer A. Appen gir delt førsteplass. | Avviket krever likhet på alle fem trinnene. Hvor ofte det skjer, er ikke målt. Utslaget er en delt plass der regelen ville kåret én vinner. | produktvalg |

### Sjekket, ingen avvik

| Nr | Format | Motoren gjør | Regelen sier | Regneeksempel | Hvor ofte og hvor mye | Forslag |
|---|---|---|---|---|---|---|
| F5 | Stableford, modified stableford, solo slagspill, best ball, shamble og ligaflightene (hypotese 1, dobbeltavrunding). | Andelen tas av det uavrundede banehandicapet, med én avrunding (`playingHandicapFromRaw` i `lib/scoring/courseHandicap.ts:31-38`). Det ble rettet i #2924 trinn 1 (PR #2926). | NGF 6.2a avklaring 6.2a/1, s. 55–56: andelen legges til det uavrundede spillehandicapet for å unngå dobbel avrunding. | Regelbokas eget eksempel: indeks 8,6 og 10,3 på 125/71,0/71 ved 85 % gir 8 og 10. Appen gir 8 og 10. Med dobbel avrunding ville begge fått 9. | Ingen avvik i formatene i runde 1. Formatene med egen prosent (trinn 2 i #2924) gjennomgås i runde 2 og 3. | la stå |
| F6 | Stableford og lag-stableford (hypotese 3, stableford-tabellen). | Poengene er 2 + par − netto, aldri under 0, og uten tak oppover (`lib/scoring/modes/stableford.ts:69-73`, valgt i #2218). | Golfreglene 21.1b: tabellen går fra 0 poeng (mer enn én over) til 6 poeng (fire under). Fem under står ikke i tabellen, og regelen sier ikke at 6 er tak. | Hele tabellen, fra mer enn én over til fire under, gir samme poeng i appen som i regelen. Netto fem under, for eksempel hole-in-one på par 5 med ett slag, gir 7 i appen. Regelen gir ikke noe tall. | Ingen avvik i tabellen. Netto fem under er svært sjeldent, og hvor ofte det skjer, er ikke målt. | la stå |
| F7 | Alle formatene i runde 1 (hypotese 4, plusshandicap ved nøyaktig halve). | `Math.round` runder −2,5 til −2, altså mot null (`lib/scoring/courseHandicap.ts:20` og `:36`). | NGF 6.2a, s. 55: 0,5 avrundes oppover. NGF vedlegg C, s. 76: en spiller med pluss spillehandicap «beveger … seg mot null, inkludert avrunding». | Halvparten av +5 er +2,5, og både appen og regelen gir +2. Vedlegg C/3 (s. 77–78): +4, 16, 7 og 26 ved 85 % gir +3, 14, 6 og 22 i begge. | Ingen avvik. | la stå |
| F8 | Stableford og slagspill (hypotese 5, tilbaketellingsmetoden). | Tilbaketellingen bruker poengene per hull (stableford) eller netto per hull (slagspill), med slagene fordelt etter hullindeks som i runden (`lib/scoring/tiebreaker.ts:34-51`). | Fremgangsmåter for Komiteen 5A(6)(d): brøkene (en halv, en tredel og en sjettedel av handicapet) gjelder konkurranser «where the stroke index allocation as set by the Committee is not used». Der hullindeksen brukes, skal slagene gis «consistently with how they were applied for the competition». | Med NGFs eksempelindeks (vedlegg E, s. 82: oddetall foran, partall bak) får banehandicap 9 fire slag på siste ni etter hullindeks. Med brøken ville det vært 4,5. | Appen bruker hullindeksen i alle formater, og da gjelder regelens andre setning. Metodene gir ulik vinner bare når hullindeksen fordeler slagene skjevt mellom første og siste ni. Hvor ofte det skjer, er ikke målt. | la stå |
| F9 | Alle formatene (hypotese 6, standardindeks 54,0). | Inviterte som ikke har fylt ut profilen, spiller på indeks 54,0 (`supabase/migrations/0001_initial_schema.sql:7`). | NGF 5.3, s. 45: det høyeste handicapet en spiller kan få, er 54,0. Regelboka har ingen standardverdi for en spiller uten registrert handicap. | Indeks 54,0 på 125/71,0/71 gir banehandicap 60 og tre eller fire slag på hvert hull, også for en spiller som egentlig har lav indeks. | Gjelder bare inviterte uten utfylt indeks. Hvor mange det er, er ikke målt. Det er ikke et regelavvik, og produktvalget er tatt før. | la stå |
| F10 | Alle formatene på 9-hullsbane spilt to ganger. Best ball også som back 9-vert på cupens splittede dag. | En 9-hullsbane lagres som 18 hull. Skjemaet ber om 18-hullstall: course rating ganget med to, og slope som den er (`teeNineHint` i `messages/no.json`). Par summeres over de 18 radene (`lib/courses/parseCourseForm.ts:148`). Best ball som back 9-vert får 18-hulls banehandicap og slag etter 18-hullsindeksen. | NGF 6.1a anmerkning 1, s. 54: 9-hulls slope, to ganger 9-hulls course rating og to ganger 9-hulls par. NGF 6.1b, s. 55: 18-hulls spillehandicapet fordeles på alle 18 hull etter hullindeks, og spilleren får slagene som faller på de ni hullene som spilles. | En 9-hullstee med slope 120, course rating 35,4 og par 36 gir 20,04 for indeks 20,0 etter regelen, rundet til 20. Appen gir også 20, med course rating 70,8 og par 72. Banehandicap 12 på siste ni med NGFs eksempelindeks (vedlegg E, s. 82) gir slag på hull 10, 12, 13, 14, 16 og 18, både i appen og etter regelen. | Ingen avvik. Det taler mot hypotese 8 (ni hull i matchspill) for norske baner. Runde 2 sjekker matchspill-segmentene. | la stå |
| F11 | Stableford og slagspill med flere utslagssteder eller ulik par for herrer og damer. | Hver spiller regnes mot sin egen par (`parFor`, `lib/scoring/modes/stableford.ts:102` og `lib/scoring/modes/soloStrokeplay.ts:71`). Banehandicapet bruker course rating minus par for spillerens tee. Nye slagspill rangeres mot par (`ranksByNetToPar`, `lib/scoring/tiebreaker.ts:165`). | NGF 6.2b, s. 56–57: når resultatet er mot par (ii) og i stableford (iii), gis ingen tilleggsslag. Når resultatet er netto slag (i), gis tilleggsslag lik forskjellen i par. | En herre på par 4 som slår 4, og en dame på par 5 som slår 5, får begge 2 stableford-poeng. Slagspill opprettet før `net_to_par`-flagget (#2253 og #2625) rangerer på netto slag uten tilleggsslag. Der taper en dame på par 74 to slag mot en herre på par 72. | Nye spill følger 6.2b (ii) og (iii). Hvor mange eldre slagspill med ulik par som finnes, er ikke målt. | la stå |
| F12 | Best ball og lag-stableford (standardprosenten, nevnt uten forslag). | Den generelle andelen starter på 100 % (`app/[locale]/admin/games/new/useGameFormState.ts:566-571`). | NGF vedlegg C, s. 75: individuelt slagspill og individuell stableford 100 %, four-ball slagspill og four-ball stableford 85 %. | Best ball og lag-stableford starter på 100 %. Banehandicap 20 gir da 20 slag i appen, mens NGF anbefaler 17. Solo slagspill og solo stableford følger NGF. | Gjelder alle nye best ball- og lag-stablefordspill der arrangøren ikke endrer andelen. | la stå (veiviserens standardverdier er utenfor saken) |
| F13 | Modified stableford og shamble (formater som ikke står i regelboka). | Begge bruker samme slagfordeling som stableford og best ball: brutto minus slagene etter hullindeks (`lib/scoring/modes/stableford.ts:99` og `lib/scoring/modes/shamble.ts:50`). | Golfreglene 21.1 har bare standardtabellen. Vedlegg C har ingen rad for shamble. Nærmest er «Beste 2 av 4 slagspill» med 85 %, men der slår alle eget utslag. Slagfordelingen følger vedlegg E. | Banehandicap 18: 5 slag på par 4 er netto par i begge formatene. Firerlaget fra vedlegg C/3 (+3, 14, 6 og 22) på hullindeks 1 får netto 4, 5, 4 og 4, og de to beste gir 8. | Ingen avvik i slagfordelingen. | la stå |

### Hypotesene fra kontrakten

| Hypotese | Svar |
|---|---|
| 1. Dobbeltavrunding | F5: rettet i #2926 for formatene i runde 1. |
| 2. Netto dobbeltbogey av spillehandicapet | F1: reelt, men differensialen blir for lav, ikke for høy. |
| 3. Stableford-tabellen uten tak | F6: tabellen stemmer. Regelen sier ikke hva fem under gir. |
| 4. Plusshandicap ved nøyaktig halve | F7: ingen avvik. |
| 5. Like plasseringer | F4 (avvik: stopper på hull 18) og F8 (ingen avvik i metoden). |
| 6. Standardindeks 54,0 | F9: ikke et regelavvik. |
| Fra issuet: halve tall rundes feil | F3: flyttallsfeil, 7 av 253 836 kombinasjoner. |

### Testene og funnene

| Funn | Test |
|---|---|
| F1 | `handicap.rulebook.test.ts`, to `it.fails` (én per kallested) |
| F2 | `handicap.rulebook.test.ts`, `it.fails` |
| F3 | `handicap.rulebook.test.ts`, `it.fails` |
| F4 | `strokeplay.rulebook.test.ts`, `it.fails` |
| F5–F13 | vanlige `it` i de to filene |

F1 ligger utenfor `lib/scoring`. Testene leser derfor de to kallestedene som tekst. De blir røde når kallet ikke lenger sender det frosne tallet.
