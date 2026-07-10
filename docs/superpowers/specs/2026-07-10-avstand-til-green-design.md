# Avstand til green v1 — design

**Issue:** #1210 · **Status:** eier-godkjent 2026-07-10 (brainstorm-økt) · **Effort:** ~1–2 uker

## Bakgrunn og beslutningskjede

- Idéutkast fra idémyldring 2026-07-02; eier-utvalgt blant 10 favoritter 2026-07-10.
- **Pull (hva-er-nok §5):** eier + medspiller diskuterte featuren, inkludert crowdsourcing-mekanikken, spontant på en ekte golfrunde.
- Board-møte 2026-07-10: styret anbefalte enstemmig å slice L-idéen til «ren pinning, én avstand». April Dunfords advarsel står: vi konkurrerer ikke med Garmin på presisjon — vi vinner på «alt gjengen trenger bor i samme app».
- Eier-valgt verdihypotese: **suksess = flere app-åpninger per runde.** Nytte for spillere uten klokke/laser er sidegevinst. Datastrategien (kartlagte norske baner) er langsiktig bonus.

## Kjerneidé

Spillerens egen GPS-posisjon + et crowdsourcet green-senter per hull = «~142 m til green» på hullskjermen. Innsamlingen piggybacker på det ene garanterte app-åpne-øyeblikket per hull: score-tastingen, som skjer på eller ved greenen. Hullplasseringen er per definisjon på greenen, så pins fra flere runder klynger seg rundt green-midten; medianen kaster ut avvikere.

Verken tee-punkter eller forkant/bakkant trengs i v1: avstanden regnes fra spillerens posisjon til green-senteret, og hullskjermen vet allerede hvilket hull som vises.

## Spilleropplevelse

**Se avstand:**
- Hullskjermens kontekstlinje viser «~X m til green» når hullet har green-senter og spilleren er innenfor rimelig avstand (< 1 km — ellers skjules linja; du sitter hjemme i sofaen).
- Første gang: «Vis avstand»-knapp → utløser nettleserens GPS-tillatelse. Avslag → knappen forblir, med kort hint.
- Mens hullskjermen er synlig følger GPS-en med (`watchPosition`), stoppes ved blur/navigasjon (batteri). Tilden (~) kommuniserer ±5–10 m telefon-GPS — vi lover aldri mer.

**Pinne:**
- Etter lagret score på hull med < 3 pins, og kun når online + GPS-tillatelse mulig: chip «Står du ved greenen? Lagre punkt» → ett trykk → `getCurrentPosition` (high accuracy) → insert → kort takk, chip forsvinner.
- GPS-nøyaktighet dårligere enn 30 m → pin avvises med «GPS-signalet er for svakt akkurat nå» (kvalitet per datapunkt er viktig ved 4–20 brukere).
- Offline → chipen vises ikke. Et tapt pin koster ingenting; neste runde tar det.

**Tomtilstand:** hull uten punkt viser ingen avstandslinje — bare pinne-chipen etter score.

## Datamodell

Ny tabell `green_pins`:

| Kolonne | Type | Regler |
|---|---|---|
| `id` | uuid pk | default gen_random_uuid() |
| `course_id` | uuid not null | FK courses(id) ON DELETE CASCADE |
| `hole_number` | int not null | CHECK 1..18 (samme som course_holes) |
| `lat` / `lng` | double precision not null | CHECK -90..90 / -180..180 |
| `accuracy_m` | real null | rapportert GPS-nøyaktighet |
| `user_id` | uuid null | FK users(id) **ON DELETE SET NULL** |
| `created_at` | timestamptz not null | default now() |

- Rådata lagres; **green-senter materialiseres aldri** — det regnes som median (lat og lng hver for seg) i `lib/geo/` ved lesing. Ved dagens volum (håndfuller pins per hull) er det gratis.
- Ingen unikhet per bruker/hull: flere pins fra samme spiller over flere runder er ønsket data (hullplasseringen flytter seg). Spam-risiko akseptert ved dagens skala; medianen er robust.
- **Personvern:** et pin sier «bruker X var på bane Y tidspunkt Z» → persondata. ON DELETE SET NULL anonymiserer ved konto-sletting: dugnadsdataen overlever, sporbarheten gjør det ikke. (Sjekk mot slett-konto-flyten i #1012-mønsteret ved bygging.)

## RLS

- SELECT: alle innloggede (global dugnadsdata på tvers av Tørny — det er crowdsourcing-poenget; samme verdensdeling som `courses`).
- INSERT: innlogget, `user_id = auth.uid()`, kun egen rad.
- UPDATE: **ingen policy** — stenger hostile-PATCH-flaten helt (AGENTS.md trap 3).
- DELETE: kun egen rad (angre feilpin).
- Migrasjon påføres staging først, verifiseres, deretter prod etter eier-luke (0107-mønsteret / prod-brannmuren).

## Teknisk arkitektur

- **`lib/geo/distance.ts`** — haversine, ren TS, TDD (Type A, `it.each`).
- **`lib/geo/greenCenter.ts`** — median-senter av pins, ren TS, TDD.
- **Henting:** hullsiden henter pins for banens hull server-side, parallelt med course-slimfetchen den allerede gjør (pins er course-data, IKKE game-data → holdes utenfor `game-${id}`-cachen, samme begrunnelse som courses/tee_boxes-joinen).
- **Visning:** klientkomponent i kontekstlinje-området får green-senter som prop og regner avstand lokalt fra `watchPosition`. Ingen nettverkskall per posisjon.
- **Pinning:** klientkomponent i score-flyten (ved `components/hole/ScoreCard.tsx`-området) → server-action → insert med `expectAffected`-sjekk (trap 2). Ingen Dexie-/sync-kø-endring (PuttsField-presedensen #939 viser utvidelsesmønsteret for hull-flaten, men pins trenger ikke offline-sti).
- **i18n:** nye nøkler i `messages/no.json` + `en.json`; norsk copy gjennom humanizer før commit.
- **Versjon:** feat → minor-bump + én Funksjon-linje i CHANGELOG.

## Edge-cases (Type A-testgrunnlag)

| Input-klasse | Forventet |
|---|---|
| 0 pins på hullet | senter = null → ingen avstandslinje, pinne-chip vises |
| 1 pin | senter = punktet; avstand vises |
| 2 pins | median av to = midtpunkt |
| Mange pins + én outlier (tastet på neste tee) | median forkaster outlieren |
| Duplikate punkter | median uendret |
| Samme posisjon som senter | 0 m |
| Avstand > 1 km | linja skjules |
| GPS accuracy > 30 m ved pinning | pin avvises med feilmelding |
| GPS-tillatelse avslått | «Vis avstand»-knapp m/hint, ingen krasj |
| Ugyldig lat/lng mot DB | CHECK avviser |
| Tidssone/dateline | N/A: norske baner |
| Samtidige pins fra to spillere | begge lagres; ingen konflikt (append-only) |

## Testing (docs/test-discipline.md)

- **Type A:** `lib/geo/distance.test.ts` + `lib/geo/greenCenter.test.ts` — tabellen over, `it.each`.
- **RLS:** hostile-PATCH-rigg (#440): ikke-eier kan ikke UPDATE (ingen policy), ikke inserte som annen bruker, ikke slette andres pin.
- **Type C:** maks én render-test for avstandslinja (vises/skjules på senter-prop).
- **Type D:** ingen ny e2e — golden path (slag→lever→godkjenn) er urørt.

## Bevisst utenfor v1 (kuttlista)

Forkant/bakkant, tee-punkter, bunkere, OSM-import, dedikert kartleggingsmodus, prøvespill-demoen (`live={false}`-isolasjonen røres ikke), telemetri for app-åpninger.

**V2-trigger:** pinne-adferd bevist — målbart direkte i `green_pins` (pins fra ≥ 2 ulike brukere på ≥ 2 baner). Da vurderes OSM-polygoner (F/M/B der data er godt) og flere punkttyper. Suksessmålet (app-åpninger) vurderes pragmatisk i v1: pinne-volum + gjengens egne ord.

## Flyt-forankring

Ingen endring i kjerneflyten (opprett → bli med → spill → avslutt) — featuren beriker hullskjermen som allerede står i flyten. Ingen diagram-oppdatering nødvendig.
