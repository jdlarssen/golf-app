-- Migration: 0066_format_rules_content
-- Adds four nullable content columns to formats, then seeds rules_long and
-- rules_example for all 22 game modes. rules_summary and rules_points are
-- left NULL so the app falls back to MODE_GUIDE in code (contract decision).

alter table public.formats
  add column rules_summary text,
  add column rules_points  text[],
  add column rules_long    text,
  add column rules_example text;

-- best_ball
UPDATE public.formats SET
  rules_long    = 'Dere er to på lag, og begge spiller hvert hull med sin egen ball. På hvert hull teller bare den laveste netto-scoren av dere to — partneren med den beste scoren «bidrar» og drar laget fremover. Netto regnes ved å trekke fra slagene du får på hullet fra gross-scoren din. Lavest sum av bidragende netto-scorer etter alle 18 hull vinner.',
  rules_example = 'Hull 7, par 4: du scorer 5 (netto 4 etter ett slag på SI 8), makker scorer 4 (netto 4 uten ekstraslag). Begge er netto 4 — laget tar 4. Hull 12, par 5: du scorer 7 (netto 6), makker scorer 6 (netto 5). Makker bidrar, laget tar 5.'
WHERE slug = 'best_ball';

-- stableford
UPDATE public.formats SET
  rules_long    = 'Du samler stableford-poeng på hvert hull basert på scoren din mot par etter at handikap-slagene er trukket fra. To poeng er normalen — ett for å fullføre hullet med ett slag over par (bogey), tre for å gjøre birdie. Scorer du dobbeltbogey eller verre, gir du opp hullet og tar ett poeng. Høyest poengsum etter 18 hull vinner.',
  rules_example = 'Hull 3, par 4, SI 5: du har CH 12 og får ett ekstraslag. Du scorer 5 gross (netto 4) → par → 2 poeng. Hull 15, par 3, SI 17: du scorer 3 gross (netto 3) → par → 2 poeng. Hull 10, par 5, SI 3: du scorer 5 gross (netto 4) → birdie → 3 poeng.'
WHERE slug = 'stableford';

-- modified_stableford
UPDATE public.formats SET
  rules_long    = 'Stableford med proff-skala der du premieres tungt for de gode prestasjonene og straffes for de virkelig svake. Eagle gir 5 poeng, birdie 2, par 0. Bogey trekker 1 poeng, dobbeltbogey eller verre trekker 3. Du kan havne under null på totalen. Handikap-slagene regnes inn på vanlig måte, og høyest sum etter 18 hull vinner.',
  rules_example = 'Hull 6, par 5, SI 1: du har CH 18 og får ett ekstraslag. Du scorer 5 gross (netto 4) → eagle → +5 poeng. Hull 11, par 4: du scorer 7 gross (netto 6) → dobbeltbogey → −3 poeng. Netto for disse to hullene: +5 + (−3) = +2 poeng.'
WHERE slug = 'modified_stableford';

-- singles_matchplay
UPDATE public.formats SET
  rules_long    = 'Du spiller én mot én, hull for hull. Den som bruker færrest netto-slag på et hull vinner hullet. Det er antall vunne hull som avgjør kampen — ikke total score. Handikap-slagene er med i beregningen, og den spilleren som leder med flere hull enn det er igjen å spille, har vunnet og kampen stoppes der.',
  rules_example = 'Hull 4, par 4: du scorer 4 (netto 4), motspiller scorer 5 (netto 4 med ett slag). Likt → hull deles. Hull 9, par 3: du scorer 3 (netto 3), motspiller scorer 4 (netto 4). Du vinner hullet og leder 1 up. Etter 16 hull: du leder 3 up med 2 hull igjen → 3&2, kampen er avgjort.'
WHERE slug = 'singles_matchplay';

-- solo_strokeplay
UPDATE public.formats SET
  rules_long    = 'Klassisk slagspill: du teller alle slagene dine gjennom hele runden og trekker fra handikap-slagene til slutt. Ingen lagkamerater, ingen hull-per-hull-oppgjør — bare du mot banen og klokken. Den som ender med færrest netto-slag etter 18 hull, vinner.',
  rules_example = 'Du spiller en runde med CH 10. Gross-score er 85. Netto = 85 − 10 = 75. Konkurrenten din scorer 83 gross med CH 7, netto 76. Du vinner med netto 75 mot 76. Ett dårlig hull gjør deg ikke ferdig, men alt teller til slutt.'
WHERE slug = 'solo_strokeplay';

-- texas_scramble
UPDATE public.formats SET
  rules_long    = 'Alle på laget slår fra tee, dere samler inn ballene og velger det beste utslaget. Alle legger ned sine baller på det stedet og slår sitt neste slag derfra. Slik fortsetter dere til ballen er i hullet. Laget teller én score per hull, og lag-handicapet (vanligvis 10–25 % av sum-CH) trekkes fra totalen.',
  rules_example = 'Hull 2, par 4: A slår 200 m rett frem, B slår 185 m i ruff, C slår 220 m på fairway — dere velger C sitt utslagsted. Alle legger ned til 220 m og slår. Beste andreslag ender 4 m fra hullet. Alle legger ned og putter, og den korteste putter inn på 2 putter. Lagets score: 4 (2 slag + 2 putter).'
WHERE slug = 'texas_scramble';

-- ambrose
UPDATE public.formats SET
  rules_long    = 'Ambrose er en scramble-variant med et lag-handicap som veier inn alle spillernes nivå. Alle slår fra tee, dere plukker beste utslag og alle slår derfra igjen. Slik fortsetter dere hull for hull. Lag-handicapet beregnes som sum-CH delt på to ganger lagstørrelsen (12,5 % for 4-mannslag), og det trekkes fra lagets brutto-total.',
  rules_example = 'Lag på 4: CH 8, 12, 16 og 20 → sum-CH 56. Lag-handicap = 56 ÷ (2 × 4) = 7. Hull 5, par 5: alle slår fra tee, beste utslag 240 m på fairway. Dere chipper til 2 m på neste slag (alle spiller derfra). En av spillerne putter inn. Lagets brutto hull-score: 3. Netto etter 18 hull: brutto-total − 7.'
WHERE slug = 'ambrose';

-- florida_scramble
UPDATE public.formats SET
  rules_long    = 'Florida Scramble er en Texas-scramble-variant med én viktig regel: den spilleren som slo det valgte slaget, hopper over neste slag. Resten av laget slår, og dere velger igjen det beste blant de gjenværende. Slik rullerer dere gjennom hullet, og alle bidrar. Laget spiller lag à 3 eller 4, og lag-handicapet (10–15 % av sum-CH) trekkes fra totalen.',
  rules_example = 'Hull 8, par 4, lag på 4 (A, B, C, D): A slår det beste utslaget. A hopper over neste slag — B, C og D slår fra det stedet. C slår best. C hopper over — A, B og D putter fra 3 m. B er best og går i hull. Lagets score: 1 (A sitt utslagslag) + 1 (C sitt andre) + 1 (B putter inn) = 3.'
WHERE slug = 'florida_scramble';

-- fourball_matchplay
UPDATE public.formats SET
  rules_long    = 'To lag på to mot hverandre, og alle fire spiller sin egen ball. På hvert hull er det lagets beste netto-score som teller. Det laget med lavest beste netto vinner hullet. Det er antall vunne hull som avgjør, ikke total score, og laget som leder med flere hull enn det er igjen, har vunnet.',
  rules_example = 'Hull 5, par 4: side 1 scorer A netto 4, B netto 5 → lagets beste er 4. Side 2 scorer C netto 3, D netto 6 → lagets beste er 3. Side 2 vinner hullet. Hull 10, par 3: begge lag har lagets beste netto 3 → hullet deles. Etter 14 hull leder side 1 med 5 up og 4 hull igjen → 5&4, matchen er avgjort.'
WHERE slug = 'fourball_matchplay';

-- foursomes_matchplay
UPDATE public.formats SET
  rules_long    = 'To lag à to, men begge lag deler én ball og slår annenhver gang hele runden. Den ene partneren slår på oddetallshull fra tee, den andre på partallshull. Derfra bytter dere systematisk. Lag-handicapet er basert på halvparten av differansen mellom lagenes sum-CH. Det laget med lavest score vinner hullet, og laget som leder med flere hull enn det er igjen, har vunnet.',
  rules_example = 'Lag A (spiller 1 og 2) vs. lag B (spiller 3 og 4). Hull 3 (oddetall): spiller 1 slår ut, spiller 2 slår andreslag, spiller 1 tredjeslaget og spiller 2 putter — lagets score 4. Lag B: spiller 3 slår ut, de bytter, spiller 3 putter inn på 3. Lag B vinner hullet. Hull 4 (partall): spiller 2 i lag A slår ut, og slik fortsetter dere annenhver gjennom runden.'
WHERE slug = 'foursomes_matchplay';

-- greensome_matchplay
UPDATE public.formats SET
  rules_long    = 'To mot to, og begge slår fra tee på hvert hull. Paret velger det beste av de to utslagene, og derfra spiller dere annenhver gang inn til hullet. Partneren til den som eier den valgte ballen, slår andreslaget. Lag-handicap beregnes som 60 % av laveste CH pluss 40 % av høyeste. Det laget med lavest score vinner hullet.',
  rules_example = 'Hull 6, par 4: A slår 210 m til fairway, B slår 195 m i ruff. Dere velger A sitt utslag. B (partneren) slår neste, 160 m til green. A putter til 1 m, B putter inn. Lagets score: 4. Motstanderlaget velger sitt beste utslag, spiller seg inn og fullfører på 5. Dere vinner hullet.'
WHERE slug = 'greensome_matchplay';

-- chapman_matchplay
UPDATE public.formats SET
  rules_long    = 'To mot to, og Chapman — også kjent som Pinehurst — legger inn et ekstra element. Begge slår fra tee, men så bytter dere: du slår partnerens ball som andreslag, og partneren din slår din ball. Etter andreslagene velger dere hvilken ball dere vil gå videre med, og derfra spiller dere annenhver slag til hullet er i mål. Lag-handicap beregnes som greensome-formelen (60/40-blanding).',
  rules_example = 'Hull 11, par 4: A slår ut til 200 m, B til 215 m. A slår B sin ball som andreslag (185 m), B slår A sin ball (195 m). Dere har nå to baller: A sin på 195 m og B sin på 185 m. Dere velger A sin ball (195 m). B slår tredjeslaget, A putter — lagets score 5.'
WHERE slug = 'chapman_matchplay';

-- gruesome_matchplay
UPDATE public.formats SET
  rules_long    = 'Gruesome er foursomes med en ekstra utfordring: motstanderlaget velger hvilken av de to tee-ballene dere må spille videre med. De velger typisk den verste. Etter at valget er gjort, slår partneren til den som eier den valgte ballen det neste slaget, og dere spiller annenhver derfra som vanlig foursomes. Lag-handicap beregnes som i foursomes (50 % av sum-CH-differansen).',
  rules_example = 'Hull 2, par 5: A slår til 230 m på fairway, B slår til 200 m i bunker. Motstanderlaget sier «B sin» (den i bunkeren). A (partneren til B) slår ut av bunkeren, B slår andreslag mot green, A putter. Lagets score: 5. Motstanderlaget, som er i ordinær foursomes-turnus selv, fullfører på 4 og vinner hullet.'
WHERE slug = 'gruesome_matchplay';

-- wolf
UPDATE public.formats SET
  rules_long    = 'Fire spillere, og rollen som «ulv» roterer gjennom runden: hull 1 er spiller 1 ulv, hull 2 er spiller 2, og så videre. Ulven ser de tre andres utslag og velger underveis hvem som skal bli partner, eller går alene mot de tre andre. Går ulven alene og vinner, gir det dobbelt så mye.',
  rules_example = 'Hull 4: Petter er ulv. Etter at alle har slått ser han at Lars slo best. Petter peker på Lars som partner. Petter og Lars (2v2) slår best netto 4, motstanderne slår best netto 5. Wolf-side vinner → Petter og Lars får 2 poeng hver, de to andre betaler. Hull 7: Per går lone wolf. Per vinner hullet med netto 3 mot de andres 4 → Per tar 4 poeng, de tre andre betaler 1 hver.'
WHERE slug = 'wolf';

-- nassau
UPDATE public.formats SET
  rules_long    = 'Nassau deler runden i tre separate oppgjør: front nine (hull 1–9), back nine (hull 10–18) og hele 18 hull samlet. Hvert av de tre oppgjørene avgjøres uavhengig av hverandre, slik at du kan tape de første ni og likevel ta de siste ni og sammenlagt. Du kan spille brutto eller netto med handikap, alt etter hva som er avtalt.',
  rules_example = 'Etter hull 9: du er nede 2 hull på front nine og taper den delen. Hull 10–18: du spiller sterk tilbake og vinner 3 hull mer enn motstanderen, du vinner back nine. Totalscoren: du har 88 netto mot motstanderens 89 netto over 18 hull — du vinner helhetsdelen. Sluttresultat: 1–2 i nassau, du vant to av tre oppgjør.'
WHERE slug = 'nassau';

-- skins
UPDATE public.formats SET
  rules_long    = 'Hvert hull er verdt ett skin. Den spilleren som har lavest score på hullet helt alene — ingen andre deler den scoren — vinner skinnet. Deler to eller flere spillere den laveste scoren, går skinnet ikke til noen, men ruller over til neste hull. Det neste hullet er da verdt to skins. Kjeden kan fortsette, og det kan samle seg store gevinster på et enkelt hull.',
  rules_example = 'Hull 1: A scorer 3, B scorer 4, C scorer 4, D scorer 5. A vinner alene → A tar skinnet (verdi 1). Hull 2: A scorer 4, B scorer 3, C scorer 3, D scorer 5. B og C deler lavest → ingen vinner, skinnet ruller over. Hull 3 er nå verdt 2 skins. Hull 3: A scorer 4, B scorer 5, C scorer 4, D scorer 3. D vinner alene → D tar 2 skins.'
WHERE slug = 'skins';

-- bingo_bango_bongo
UPDATE public.formats SET
  rules_long    = 'Tre poeng er i spill på hvert hull, og de tildeles i rekkefølge. «Bingo» går til den som treffer green først (uansett antall slag). «Bango» går til den som ligger nærmest hullet når alle er på green. «Bongo» går til den som går i hull først. Slagspill-rekkefølgen gjelder: den som ligger lengst fra hullet, slår alltid neste slag. Alle tre poengene kan gå til samme spiller.',
  rules_example = 'Hull 5, par 4: A chipper opp på green med andreslag (bingo). B og C er i ruff og D er i bunkeren — ingen av dem er på green ennå. Alle kommer på green til slutt. C ligger 60 cm fra hullet, B 1,5 m, D 2 m, A 3 m. C tar bango. Putte-rekkefølge: A putter først (lengst borte), så D og B. C putter sist og går i hull direkte — bongo til C.'
WHERE slug = 'bingo_bango_bongo';

-- nines
UPDATE public.formats SET
  rules_long    = 'Tre spillere konkurrerer om poeng på hvert hull. Den med lavest effektiv score (netto i net-modus) tar størst del av potten: i Nines fordeles 9 poeng per hull med 5–3–1 til henholdsvis laveste, midtre og høyeste score. I Split Sixes fordeles 6 poeng (4–2–0). Deler to spillere en score, legges poengene for de to plassene sammen og deles likt.',
  rules_example = 'Hull 3, Nines-modus: A scorer netto 3, B netto 4, C netto 5. A tar 5, B tar 3, C tar 1. Hull 7: A netto 4, B netto 4, C netto 5. A og B deler lavest (plass 1 og 2 → 5+3 = 8 delt på to = 4 hver), C tar 1. Hull 12: alle tre scorer netto 4. 5+3+1 = 9 delt på tre = 3 poeng hver.'
WHERE slug = 'nines';

-- round_robin
UPDATE public.formats SET
  rules_long    = 'Fire spillere, og partnerne skifter hvert sjette hull. Slik spiller du med og mot alle de andre i løpet av runden. Hull 1–6 er segment 1, hull 7–12 segment 2, hull 13–18 segment 3 — konstellasjonene er fastlagte og deterministiske. Hvert hull spilles som best ball matchplay: lagets beste netto teller, og det laget med lavest beste netto vinner hullet og får ett poeng hver. Delt hull gir ingen poeng til noen.',
  rules_example = 'Segment 1 (hull 1–6): A og B mot C og D. Hull 3: A netto 4, B netto 5 → lag A best er 4. C netto 3, D netto 5 → lag C best er 3. C-siden vinner → C og D får 1 poeng hver. Hull 6 delt → ingen poeng. Segment 2 (hull 7–12): A og C mot B og D. A er nå på lag med C som var motspilleren hans i segment 1.'
WHERE slug = 'round_robin';

-- acey_deucey
UPDATE public.formats SET
  rules_long    = 'Fire spillere, og på hvert hull er det to roller i spill: «acey» (lavest score alene) tar tre poeng fra alle de andre. «Deucey» (høyest score alene) gir tre poeng til de andre. De to i midten beveger seg ikke. Deler to eller flere den laveste scoren, gis ace-siden ingen poeng det hullet. Samme gjelder for deuce-siden. Totalen kan bli negativ.',
  rules_example = 'Hull 4: A netto 3, B netto 4, C netto 4, D netto 6. A er acey (+3) → A tar 3 fra de andre (B −1, C −1, D −1). D er deucey (−3) → D gir 3 til de andre (B +1, C +1, A +1). Nettoeffekt hull 4: A +4, B 0, C 0, D −4. Hull 8: A og B scorer netto 3, C netto 5, D netto 6. Ingen acey (delt lavest). D er deucey → D −3 til de andre.'
WHERE slug = 'acey_deucey';

-- shamble
UPDATE public.formats SET
  rules_long    = 'Alle slår fra tee, og laget velger det beste utslaget. Derfra spiller alle sin egen ball inn til hullet. Det er ikke én lag-ball som i scramble — hver spiller scorer for seg. Lagets hull-score settes til summen av de to (eller arrangørvalgt antall) laveste individuelle scorene på hullet. I Champagne Scramble-varianten velger arrangøren om det er én, to eller tre scorer som skal telle.',
  rules_example = 'Hull 9, par 5, 4-mannslag (shamble-variant, 2 scorer teller): alle slår, C sitt utslagsted velges. A scorer 5, B 6, C 5, D 7 på hullet. To laveste: A og C, begge netto 4 etter handikap. Lag-hull-score = 4 + 4 = 8. Lag 2 på samme hull: to laveste netto er 5 + 4 = 9. Lag 1 vinner hullet i eventuell per-hull-sammenligning.'
WHERE slug = 'shamble';

-- patsome
UPDATE public.formats SET
  rules_long    = 'Patsome kombinerer tre spilleformer i én runde. Hull 1–6 spilles som 4BBB-stableford: begge spiller sin ball, lagets beste stableford-poeng per hull teller. Hull 7–12 er greensome: begge slår ut, dere velger beste utslag og spiller annenhver slag derfra. Hull 13–18 er foursomes: dere deler én ball og slår annenhver slag, også fra tee. Lagets totale stableford-poeng fra alle tre segmentene summeres, og flest poeng vinner.',
  rules_example = 'Hull 4 (4BBB): A tar 3 stableford-poeng (birdie), B tar 2 (par). Laget tar 3. Hull 8 (greensome): A slår best ut, B slår andreslaget, A tredjeslaget, B putter. Lagets score: 4 → 2 stableford-poeng (par). Hull 15 (foursomes): A slår ut, B slår andreslaget, A chipper, B putter inn. Score 4 → 2 poeng. Laget legger alle poengene fra 18 hull sammen.'
WHERE slug = 'patsome';
