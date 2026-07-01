# Research: kilder for masse-import av norske golfbaner (med tees/slope/CR)

> **Issue:** [#56 — Massiv-import av norske golfbaner via NGF-database](https://github.com/jdlarssen/golf-app/issues/56)
> **Type:** Research-leveranse (dokument, ikke kode). Avklart med eier 2026-06-22.
> **Milestone:** Backlog — uplanlagt / scale-triggered
> **Dato:** 2026-07-01

## TL;DR

Ja, det finnes flere API-er som kan levere norske baner med tees, slope og course rating — men de deler seg i to klasser med ulik pris i innsats. **NGF/GolfBox er den autoritative kilden** (NGF rangerer hver norske bane offisielt, så slope/CR herfra er WHS-fasit), men den er **partner-gated**: tilgang går via en integrasjonsavtale med NGF/GolfBox, ikke en selv-betjent utviklerportal. De **selv-betjente tredjeparts-API-ene** (GolfCourseAPI, golfapi.io) er nåbare med en e-post-signup, men Norge-dekningen og datakvaliteten på norske slope/CR er **uverifisert** og ofte community-bidratt.

Anbefalt retning (eiers valg 2026-06-22): **«frø nå, NGF senere»** via en **kilde-agnostisk importer**. Bygg en adapter-grense (`CourseSource`) slik at en tredjeparts-kilde kan brukes som redigerbar frø-data nå, og NGF/GolfBox kan kobles på senere uten å bygge om. Importerte baner skal alltid være **redigerbare utkast admin verifiserer** — aldri ukontrollert slope/CR rett i produksjonsspill, fordi netto-handicap regnes fra CR + slope og feil tall korrumperer scoring stille.

Dette er fortsatt et utrednings-svar, ikke en feature. Ingen kode, migrasjoner eller import bygges i denne runden.

## Kilde-katalog

Innsamlet 2026-06-22, oppdatert og lenke-verifisert 2026-07-01 (web-søk + live probe med `curl`).

### Kilde A — NGF / GolfBox (autoritativ, men partner-gated)

NGF bekrefter at GolfBox har utviklet **åpne API-er** (standardintegrasjoner) for klubb-, bane- og medlemsdata, besluttet på Golftinget 2021/2023, under uttesting med utvalgte leverandører. Leveransen av en mer fleksibel integrasjons-infrastruktur var planlagt klar rundt 1. mai 2026, med NGF i en koordinerende rolle mellom GolfBox, nye leverandører og klubbene.

- **Ikke selv-betjent.** Tilgang går via en godkjent leverandør-/integrasjonsavtale med NGF/GolfBox — ikke en portal man registrerer seg på. Sannsynlig B2B-kontrakt og mulig kostnad.
- **Autoritativ for WHS.** NGF course-rater hver norske bane offisielt, så slope/CR herfra er fasit. Slope-systemet er omtalt på [golfforbundet.no/klubb/anlegg/slope](https://www.golfforbundet.no/klubb/anlegg/slope).
- **Krever eier-handling.** Å skaffe tilgang er en tredjeparts-relasjon Claude ikke kan opprette autonomt — eier må kontakte NGF/GolfBox.

Kilder (offisielle NGF-artikler; live i nettleser, men bot-gater direkte `curl` → 404):
[GolfBox: Åpne API'er foreligger](https://www.golfforbundet.no/ngf-nytt/golfbox-apent-api-foreligger) ·
[GolfBox: Oppfølging av standardintegrasjoner (åpne API'er)](https://www.golfforbundet.no/ngf-nytt/golfbox-oppfolging-av-standardintegrasjoner-apne-api%E2%80%99er) ·
[Digitaliseringsprosjektet](https://www.golfforbundet.no/klubb/organisasjon/digitaliseringsprosjektet/).

| Kilde | Tilgangsmodell | Selv-betjent? | Norge-dekning | Data-felter (slope/CR/tees/SI) | Lisens for lokal lagring | Kostnad | Ferskhet/autoritet |
|---|---|---|---|---|---|---|---|
| NGF / GolfBox | Partner-/integrasjonsavtale | Nei | Full (alle norske klubber) | Full, offisiell | Avtales i kontrakt | Ukjent, sannsynlig B2B | Høyest — WHS-fasit |

### Kilde B — Selv-betjente tredjeparts-API-er (global dekning, kvalitet usikker)

- **[GolfCourseAPI](https://golfcourseapi.com/)** — gratis-tier 50 req/døgn, Pro $9.99/mnd (10k/døgn), Enterprise $24.99/mnd. ~30k baner. **Live-probet 2026-07-01:** `GET https://api.golfcourseapi.com/v1/courses/{id}` svarer `401` uten nøkkel (auth = `Authorization: Key <token>`), så endepunktet finnes og er nøkkel-gated. E-post-signup for nøkkel. Datamodell (per dok): course name, location, tees med `course_rating`, `slope_rating`, `par_total`, hull-data — strukturert per kjønn (male/female tee-sett).
- **[golfapi.io](https://www.golfapi.io/)** — 42k baner / 100+ land. REST **eller** full CSV-eksport (`clubs.csv`, `courses.csv`, `tees.csv`, `coordinates.csv`) → kan importeres direkte. Felter: pars, stroke index, tees, lengder, slope/CR, koordinater. Endepunkter `/clubs?country=`, `/clubs/{id}`, `/courses/{id}`. Nøkkel via `contact@golfapi.io`. Pris ikke offentlig.
- **iGolf Connect / SportsFirst / Golf Intelligence / GolfLogix** — kommersielle, 38k+ baner, full tee/slope/par-dekning. Dyrere, B2B. Overkill for hobby-tier nå.
- **Felles forbehold (kritisk):** Norge-dekning er **ikke verifisert** på noen av disse, og data er ofte community-bidratt → slope/CR kan mangle, være utdatert eller feil for norske baner.

| Kilde | Tilgangsmodell | Selv-betjent? | Norge-dekning | Data-felter (slope/CR/tees/SI) | Lisens for lokal lagring | Kostnad | Ferskhet/autoritet |
|---|---|---|---|---|---|---|---|
| GolfCourseAPI | API-nøkkel (e-post-signup) | Ja | Uverifisert | slope/CR/par_total/tees/hull, per kjønn | Må avklares med leverandør | Gratis 50/døgn · $9.99–24.99/mnd | Community-bidratt, ukjent ferskhet |
| golfapi.io | API-nøkkel + CSV-eksport | Ja | Uverifisert | slope/CR/SI/tees/lengder/koordinater | Må avklares med leverandør | Ikke offentlig | Community-bidratt, ukjent ferskhet |
| iGolf / SportsFirst m.fl. | B2B-avtale | Nei (kontakt) | Uverifisert | Full | Avtales i kontrakt | Dyrere B2B | Kommersiell |

### Kilde C — Manuell / community-liste (kun navn)

[Wikipedia: List of golf courses in Norway](https://en.wikipedia.org/wiki/List_of_golf_courses_in_Norway) (~160 baner) og lignende community-kataloger gir navn/lokasjon, men **ikke** pålitelig slope/CR/tee-data. (1golf.eu ble også vurdert, men bot-gater `curl` → 403 og gir uansett bare navn.) Utelukket som primærkilde; kan på sin høyde brukes til å krysssjekke at en importert liste dekker de faktiske norske banene.

| Kilde | Tilgangsmodell | Selv-betjent? | Norge-dekning | Data-felter (slope/CR/tees/SI) | Lisens for lokal lagring | Kostnad | Ferskhet/autoritet |
|---|---|---|---|---|---|---|---|
| Wikipedia / community-lister | Åpen web | Ja | ~160 navn | Kun navn/lokasjon — ingen slope/CR/SI | CC-BY-SA (Wikipedia) | Gratis | Dugnad, ujevn |

## Mapping til Tørnys skjema

En fremtidig importer skal gjenbruke den eksisterende atomiske opprettings-veien, ikke finne opp en ny insert. Verifisert mot live kode (`supabase/migrations/0113_create_course_with_layout.sql`, `lib/courses/coursePayload.ts`, `docs/schema-ground-truth.md`):

- **RPC:** `create_course_with_layout(p_name text, p_holes jsonb, p_tees jsonb)` (migrasjon `0113`, #737) lager `courses` + `course_holes` + `tee_boxes` i én transaksjon, med `created_by = auth.uid()`.
- **`course_holes`:** `par_mens`, `par_ladies`, `par_juniors` (alle `NOT NULL`, **ingen `par`-kolonne**), `stroke_index` (`CHECK 1..18`).
- **`tee_boxes`:** `length_meters`, og per kjønn `slope_*` (int), `course_rating_*` (numeric), `par_total_*` (int). `tee_boxes.course_rating_*` har en DB-CHECK (#817, `0112`) — korrupt CR feiler allerede ved insert.
- **Validatorer** (`lib/courses/coursePayload.ts`): slope **55–155** (heltall), course rating **50–80**, lengde **1000–12000** meter. En rating er kun brukbar når **både** slope og CR er fylt (delvis-fylt avvises).

Fire friksjonspunkter en importer må håndtere:

1. **Per-kjønn tee-merge.** Eksterne API-er strukturerer ofte tees som `{ male: [...], female: [...] }` (separate tee-sett per kjønn), mens Tørny har **én tee-rad med begge kjønns kolonner**. Import må slå sammen likt-navngitte male/female-tees til én rad (`slope_mens`/`slope_ladies`, `course_rating_mens`/`course_rating_ladies` osv.).
2. **`par_juniors`-fallback.** Junior-par finnes sjelden eksternt → fall tilbake til `par_mens`.
3. **`hcp`/`handicap` per hull → `stroke_index`.** Eksterne felt for hull-vanskelighet mapper til vårt `stroke_index` (1–18, unike per bane).
4. **Lengde-enhet.** Mange API-er gir yards; Tørny bruker meter (CHECK 1000–12000) → konverter (1 yd = 0,9144 m) før insert.

### Konkret eksempel — GolfCourseAPI → Tørny

En forenklet ekstern bane (per GolfCourseAPI sin dokumenterte shape):

```jsonc
// GolfCourseAPI (forenklet)
{
  "course_name": "Byneset Golfklubb",
  "tees": {
    "male":   [{ "tee_name": "Gul", "course_rating": 71.2, "slope_rating": 132, "par_total": 72,
                 "holes": [{ "par": 4, "handicap": 5, "yardage": 402 }, /* ... */] }],
    "female": [{ "tee_name": "Rød", "course_rating": 73.0, "slope_rating": 128, "par_total": 72,
                 "holes": [{ "par": 5, "handicap": 5, "yardage": 358 }, /* ... */] }]
  }
}
```

mapper til RPC-argumentene:

```jsonc
// create_course_with_layout(p_name, p_holes, p_tees)
p_name  = "Byneset Golfklubb"
p_holes = [ { "hole_number": 1, "par_mens": 4, "par_ladies": 5,
              "par_juniors": 4 /* fallback = par_mens */, "stroke_index": 5 /* = handicap */ }, /* ... */ ]
p_tees  = [ { "name": "Gul", "length_meters": 368 /* 402 yd × 0,9144, avrundet */,
              "slope_mens": 132, "course_rating_mens": 71.2, "par_total_mens": 72,
              "slope_ladies": 128, "course_rating_ladies": 73.0, "par_total_ladies": 72,
              "slope_juniors": null, "course_rating_juniors": null, "par_total_juniors": null } ]
// Merk: "Gul" (male) og "Rød" (female) er ulike tee-navn her, så de blir to rader
// med kun ett kjønn fylt hver — med mindre kilden bruker samme tee-navn for begge.
```

All importert data må gjennom `coursePayload.ts`-validatorene og DB-CHECK-ene (Trap #4 «en regel har ett hjem» — WHS-grensene bor i CHECK + validator + RLS + UI samtidig).

## WHS-korrekthetsrisiko

Dette er farligere for Tørny enn for en ren GPS-app. Netto-handicap regnes fra **course rating + slope**, så en feil importert slope eller CR korrumperer scoring **stille** — spillet ser riktig ut, men banehandicapet blir feil for alle. En GPS-app viser bare avstander; en feil der er kosmetisk. Hos oss forplanter den seg inn i resultatet.

Derfor: importerte baner skal være **redigerbare utkast admin verifiserer**, ikke rett i produksjonsspill. Konkret sikkerhetstiltak: en importert bane markeres som «uverifisert utkast» til en admin har sett over slope/CR mot en autoritativ kilde (helst NGF sin rating). CHECK-ene på `course_rating_*` (#817) fanger grovt korrupt data ved insert, men fanger ikke «plausibelt men feil» tall — det er derfor menneske-verifikasjon er nødvendig.

## Anbefaling — «frø nå, NGF senere» (kilde-agnostisk)

Bygg importeren rundt en **adapter-grense** slik at kilden kan byttes uten å røre insert-laget:

- En `CourseSource`-grense (f.eks. `fetchCourses()` / `fetchCourseDetail(id)`) som normaliserer en ekstern banes felter til Tørnys skjema-shape (`p_holes`/`p_tees` for `create_course_with_layout`).
- **Nå:** en tredjeparts-adapter (f.eks. `GolfCourseApiSource`) leverer redigerbar frø-data. Baner kommer inn som uverifiserte utkast.
- **Senere:** en `NgfGolfBoxSource`-adapter kobles på når partner-tilgang foreligger, uten å bygge om resten — samme normaliserings- og utkast-flyt.
- Selve inserten går alltid gjennom `create_course_with_layout` + `coursePayload.ts`-validatorene.

Dette er høyt nivå med vilje — nok til at et fremtidig bygge-issue kan plukke det opp, ikke en implementasjonsspec.

## Eier-forutsetninger (handlingsliste)

Disse er **eier-handlinger** (tredjeparts-relasjoner / mulig kostnad) — Claude anbefaler dem, men utfører dem ikke autonomt:

- **(a) GolfCourseAPI:** skaff en gratis API-nøkkel via e-post-signup på [golfcourseapi.com](https://golfcourseapi.com/), så vi kan verifisere faktisk Norge-dekning og datakvalitet på norske slope/CR før vi bygger noe.
- **(b) NGF/GolfBox:** kontakt NGF om partner-/integrasjonstilgang til de åpne API-ene (autoritativ WHS-data). Sannsynlig B2B-avtale, mulig kostnad.
- **(c) golfapi.io:** be `contact@golfapi.io` om pris, Norge-dekning og — viktig — **lisens for lokal lagring** av dataene i vår DB.

## Åpne spørsmål / må-verifiseres-før-bygg

- **Faktisk Norge-dekning** per selv-betjent kilde (uverifisert i dag — krever gratis nøkkel å sjekke).
- **Lisens for lokal lagring/caching** av tredjeparts-data i Tørnys DB (må tillates av leverandøren før bygg).
- **Datakvalitet** på norske slope/CR (community-bidratt → kan være utdatert/feil).
- **Oppdateringsfrekvens** — hvor ofte re-hentes en bane som endrer rating?
- **GDPR:** kun bane-data (ikke persondata) → lav risiko, men nevnes.

## Neste steg

Ikke bygg importeren ennå. Når (og hvis) en kilde består dekning-/kvalitet-sjekken (eier-forutsetning (a)), opprett et **oppfølgende bygge-issue** i Backlog for selve importeren + admin-import-flaten, med denne research-en og `CourseSource`-skissen som utgangspunkt. Betingelsen — «en kilde er verifisert å dekke norske baner med korrekt slope/CR» — er porten; uten den frøer vi bare feil data raskere.

---

_Research-leveranse for #56. Ingen kode/migrasjoner i denne runden. Lenker verifisert 2026-07-01; NGF-artikkel-lenkene er live i nettleser men bot-gater direkte `curl`._
