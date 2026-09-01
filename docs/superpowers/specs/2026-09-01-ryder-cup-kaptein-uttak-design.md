# Ryder Cup i full skala + kaptein-uttak — design

**Dato:** 2026-09-01 · **Issues:** #1883 (etappe 1), #1884 (etappe 2)
**Kilde:** innsendt idé fra en navngitt ekte bruker (pull per `docs/hva-er-nok.md` §5):
16 spillere per lag + kapteiner, 8 foursomes, 8 four-ball, 12 singler. «Formatet bør
være relativt fast, men en fordel å kunne være fleksibel med antall spillere/kamper.»

## Utgangspunkt

Cup-systemet er allerede Ryder Cup-modellen: to lag, økter i rekkefølge, «Klassisk»-
preset = foursomes → four-ball → singler, matchantall derivert av lagstørrelse
(`lib/cup/cupTemplates.ts`). Med 16 per lag gir dagens kode 8 + 8 + 16. Tre hull mot
ønsket, hvorav de to første er etappe 1 og det tredje etappe 2:

1. Personlig cup er capped på 16 matcher / 24 deltakere (`lib/cup/limits.ts`) —
   oppsettet trenger 28 matcher / 34 deltakere.
2. Singles-økta setter alle i spill — ingen måte å spille 12 av 16.
3. Kapteiner finnes ikke som konsept.

## Eierbeslutninger (2026-09-01)

- Åpne for vanlige brukere — ikke rute innsenderen til klubb-cup.
- Tak: hev til Ryder-skala med slingring (40 deltakere / 36 matcher), ikke ubegrenset.
- Matchantall per økt: justerbart generelt (alle formater), kun nedjustering.
- Kapteiner: full uttaksflyt med en gang (hemmelig uttak + avdekking) — ikke bare
  byttemakt, ikke bare et merke.
- To etapper, slik at innsenderen kan sette opp cupen sin mens etappe 2 bygges.

## Etappe 1 — «Åpne opp» (#1883)

### Tak

`MAX_PERSONAL_CUP_MATCHES` 16 → 36, `MAX_PERSONAL_CUP_PLAYERS` 24 → 40.
24-taket delte historie med Kompis-runde-taket (#525) — kobles fra; kommentaren i
`limits.ts` skrives om til å begrunne Ryder-skalaen. Admin og klubb-cuper er
fortsatt uten tak; ingen endring der.

### Justerbart matchantall per økt

- Veiviseren viser derivert antall per økt som forslag (som i dag) med mulighet til å
  skru **ned**: min 1, maks = derivert antall. Aldri opp — flere matcher enn spillere
  krever dobbeltbooking-logikk innen én økt, og det bygger vi ikke.
- Gjelder alle øktformater (foursomes, four-ball, singler, greensome, chapman,
  gruesome) i både presets og «Tilpasset».
- Overstyringen er et genererings-tids-konsept som `custom_sessions`/preset ellers:
  den mates inn der `buildSessions`-resultatet konsumeres, og lagres sammen med
  planen (`tournament_plans`) slik resten av plan-oppsettet gjør.
- Hvem som benkes: generatoren fyller de N matchene fra stallen som i dag; arrangøren
  justerer etterpå med eksisterende spillerbytte (`swapCupMatchPlayer`).
- Splittet-cup-dag-preseten (#1441) er uberørt — buntstrukturen har ikke øktbaserte
  matchantall (`generateSplitDayPlan` bygger per flight).

### Kant-tilfeller (etappe 1)

| Input | Forventet |
|---|---|
| Overstyring > derivert | Klampes til derivert |
| Overstyring < 1 / ikke-tall | Valideringsfeil i plan-steget (`plan_sessions`-mønsteret) |
| Overstyring på økt som droppes (derivert = 0) | Økta droppes som i dag |
| Ingen overstyring | Derivert antall (dagens oppførsel, bakoverkompatibelt) |
| Ulik lagstørrelse | Derivert regnes fortsatt av `min(lag1, lag2)` |
| 34 deltakere / 28 matcher (innsenderens oppsett) | Passerer takene |
| 41 deltakere eller 37 matcher (ikke-admin) | Blokkeres av tak som i dag |

## Etappe 2 — Kaptein-uttak (#1884)

### Konsept

- Valgfri per cup: arrangøren utnevner én kaptein per lag i Spillere-rommet. Uten
  kapteiner fungerer cupen nøyaktig som i dag.
- Kapteinen setter opp sitt lags uttak **per økt** som en *ordnet* liste med par
  (enkeltspillere for singler). Antall plasser = øktas matchantall fra etappe 1.
  Spillere kan stå over; kapteinen må ikke sette opp seg selv.
- Hemmelighold: motstanderlaget ser ingenting av uttaket før **begge** lag har levert
  for økta. Håndheves server-side (lesestier filtrerer på rolle), ikke bare i UI.
- Avdekking: når begge uttak er inne, dannes matchene — slot 1 møter slot 1, osv.
  Rekkefølgen i uttaket ER paringen; ingen egen paringslogikk. Cupsiden viser
  avdekkings-øyeblikket («Kampene er klare») i seremoni-stilen fra
  cup-presentasjonsfilosofien, og deltakerne varsles i appen (best-effort, som øvrige
  varsler).
- Rytme: uttak leveres økt for økt — kapteinene kan reagere på stillingen underveis.
  Neste økts uttak kan leveres så snart kapteinen vil.
- Arrangør-nødluke: arrangøren ser alltid begge uttak (også uleverte), kan levere på
  vegne av en kaptein, og kan endre etter avdekking via eksisterende bytte-funksjon.

### Datamodell

- `tournament_participants` utvides med varig lagtildeling + rolle (lag deriveres i
  dag fra `game_players.team_number` — kapteiner trenger stallen FØR matchene
  finnes). Kolonneform avgjøres i byggeøkta mot live skjema (I1), men semantikken er:
  lagnummer (1/2, nullable for utildelt) + kaptein-flagg/rolle.
- Ny uttakslagring per (cup, økt, lag): ordnede slots + levert-status. Uttak i kladd
  er kun synlig for eget lags kaptein + arrangør.
- Matchene opprettes først ved avdekking, med samme mekanisme som dagens
  plan-generering (scheduled games med `game_players.team_number`) — nedstrøms
  (snapshot, roster, poeng, resultat) er uendret.
- Deltaker-synken (`participantRosterSync`) må ikke kaste ut en ikke-spillende
  kaptein: kapteinsrollen unntas fra «fjernes når hen ikke står i noen match»-regelen.

### Tilstander per økt

kladd (kapteiner redigerer hver for seg, skjult) → levert per lag (låst for
kapteinen, motstander ser fortsatt ingenting) → avdekket (begge levert; matcher
dannet; endringer skjer via bytte-funksjonen). Arrangøren kan låse opp et levert
uttak før avdekking.

### Authz

- Kaptein-gatede server-actions etter samme call-site-mønster som arrangør-gatingen
  (`requireAdminOrClubAdminOfCup` + admin-klient): ny gate «arrangør ELLER kaptein
  for laget». Alle skriv går via actions; ingen nye RLS-grants for direkte skriv.
- Lesing: cup-flatene leser med service-role og gater på call-site (#1542-mønsteret)
  — uttaks-lesing får samme behandling, med rollefilteret som selve håndhevelsen.
- Dette er en rettighets-utvidelse: **PR-en auto-merges aldri**, venter på eier.

### Kant-tilfeller (etappe 2)

| Input | Forventet |
|---|---|
| Én kaptein levert, én ikke | Ingen avdekking; levert lag ser eget uttak, motstander ingenting |
| Kaptein prøver å lese motstanderens kladd (direkte kall) | Avvist server-side |
| Uttak med samme spiller i to slots i samme økt | Valideringsfeil |
| Uttak med spiller fra feil lag / utenfor stallen | Valideringsfeil |
| Færre fylte slots enn øktas matchantall | Ufullstendig — kan ikke leveres |
| Kaptein trekker seg / byttes av arrangør | Arrangøren omutnevner; kladd består |
| Ikke-spillende kaptein | Står i stallen med rolle, aldri i uttak; synken fjerner hen ikke |
| Cup uten kapteiner | Dagens flyt uendret (generator + arrangør) |
| Avdekket økt, spiller blir syk | Arrangør bruker `swapCupMatchPlayer` som i dag |

## Testing (per docs/test-discipline.md)

- **Type A:** takene (nye grenser), klamping/validering av øktantall,
  uttaksvalidering (duplikat, feil lag, ufullstendig), slot-paring,
  tilstandsoverganger, synk-unntaket for kapteiner.
- **Type C:** maks én render-test per ny flate (uttaks-siden, avdekkings-kortet).
- **Type D:** cup-smoken utvides ikke i etappe 1; etappe 2 vurderer ett
  golden-path-løp (uttak → avdekking) hvis det får plass i eksisterende cup-smoke.
- Staging-klikkrunde av berørt flyt før merge (begge etapper).

## Utenfor scope (noteres, bygges ikke nå)

- Kaptein-flyt for splittet cup-dag.
- Uttaksfrister med nedtelling.
- Justering av matchantall **opp** (flere matcher enn spillere per økt).

## Verifiseringspunkter for byggeøkta (I1 — les live, ikke fra denne fila)

- Eksakt kolonneform på `tournament_participants`-utvidelsen mot live skjema; husk
  default på trigger-fylte NOT NULL-kolonner.
- Hvor lagsplitten faktisk settes i genereringsflyten i dag (draft-skjema har kun
  lagnavn; `team_number` skrives per match) — etappe 2 flytter kilden til
  deltakerlista.
- Hvordan plan-overstyringene best lagres på `tournament_plans` (eksisterende
  `custom_sessions`-jsonb vs. egen kolonne).
- Varsel-infraen for avdekkings-varselet (gjenbruk eksisterende in-app-kanal).
