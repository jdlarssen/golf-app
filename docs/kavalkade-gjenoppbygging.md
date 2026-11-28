# Kavalkaden: slette og bygge radene på nytt

> For orkestratoren og eieren. Skrevet etter generalprøven på staging (#3020).

Kavalkaden lagrer én rad per spiller og år i `kavalkades` første gang spilleren åpner den. Raden endres aldri etterpå (`lib/kavalkade/getOrCreateKavalkade.ts`). En feil i raden rettes derfor bare ved å slette den, så neste åpning bygger den på nytt.

## 1. Når oppskriften brukes

- En regnefeil i tallene er funnet etter 24. desember.
- AI-teksten manglet ved første åpning, for eksempel fordi AI-nøkkelen i prod ikke virket.

En feil i hvordan kortet vises, ikke i tallene, trenger ikke denne oppskriften. Se punkt 6.

## 2. Rett koden først

1. Skriv en Type A-test som viser feilen (`lib/kavalkade/*.test.ts`), og se den feile.
2. Rett koden. Testen skal være grønn.
3. Merge PR-en.
4. Sjekk at prod kjører den nye koden før noe slettes. En merge til main gir ikke alltid en utrulling («Merge ≠ deploy»):

   ```bash
   gh api 'repos/jdlarssen/golf-app/deployments?environment=Production&per_page=5' --jq '.[] | "\(.sha) \(.created_at)"'
   git merge-base --is-ancestor <merge-sha> <sha-fra-lista> && echo "prod har rettingen"
   ```

   Svarer kommandoen ikke «prod har rettingen», sletter du ikke. Vent på neste utrulling.

## 3. Tell radene og få eierens ja

1. Tell radene som skal slettes, med en lesing i prod. Gjør alle lesinger FØR prod-merket settes, fordi en lesing med et skriveord kan bruke opp merket.

   ```sql
   select count(*) as alle, count(*) filter (where narrative is null) as uten_tekst
   from kavalkades where year = 2026;
   ```

2. Vis tallet til eieren, og si hvilken av de to slettingene i punkt 4 du vil kjøre.
3. Vent på eierens skrevne «ja». At eieren setter prod-merket (`touch .claude/approve-prod` i hovedmappa, gyldig én gang i 10 minutter), er ikke et ja i seg selv (prod-brannmuren #1074).

## 4. Slett radene

Kjør én av de to spørringene. `returning` viser hvor mange rader som faktisk ble slettet. Sammenlign tallet med tellingen i punkt 3.

Alle radene for året:

```sql
delete from kavalkades where year = 2026 returning id;
```

Bare radene uten AI-tekst:

```sql
delete from kavalkades where year = 2026 and narrative is null returning id;
```

Gir `returning` 0 rader, er ingenting slettet. Stopp og finn ut hvorfor (felle 2, `docs/bug-prevention.md`).

## 5. Hva som skjer etterpå

- Neste gang en spiller åpner Kavalkaden, bygges raden på nytt med koden som kjører i prod da.
- Spillere som har sagt ja til AI-tekster, får ett nytt modellkall hver. En spiller uten «ja» får fortsatt ingen tekst.
- Får ikke siden lest samtykkene, viser den kortene uten tekst og lagrer ingen rad. Da prøver neste åpning igjen.
- `kavalkade_shares` røres ikke. Den peker på spilleren, ikke på raden, så tallet på hvem som har delt står.
- Bilder som allerede er delt, har de gamle tallene. De kan ikke hentes tilbake.

## 6. Appen

Appen tegner kortene selv fra `facts` i raden (`native/app/src/screens/Kavalkade.tsx`). Den henter raden fra `/api/kavalkade/2026` hver gang skjermen åpnes, og lagrer den ikke på telefonen.

- En feil i tallene: slett raden etter punkt 1–4. Appen viser de nye tallene neste gang skjermen åpnes.
- En feil i hvordan kortet vises: rett appen og send et nytt appbygg. Ikke slett rader. Raden er riktig, og det nye bygget tegner den riktig.

Generalprøven på staging (28.11) viste dette:

- Appen tegnet Auds 11 kort fra svaret på `/api/kavalkade/2026`, med de samme tallene og navnene som nettet, både i iPhone-simulatoren og på Android-emulatoren.
- Prøven fant én forskjell: nemesis-kortet i appen manglet banenavnet. Det er rettet i appen (#3020) og kommer med neste appbygg. Raden trengte ingen endring.
- Appbygget testerne har i dag (bygg 15), tegnet Auds lagrede rad uten feil. Ved likt antall viser det bare det første navnet.
- Ikke vist: selve nettverkskallet fra appen. Bildene startet appen med svaret fra API-et lagt inn. At appen henter raden på nytt ved hver åpning, er lest i koden (`useKavalkade` i `Kavalkade.tsx`, ingen lagring på telefonen).
