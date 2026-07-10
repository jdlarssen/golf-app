# Spec: Avstand til green v1 — crowdsourcet green-punkt + avstand på hullskjermen (#1210)

## Problem

Spillere uten Garmin/laser har ingen avstandsinfo, og appen har ingen grunn til å komme opp av lomma mellom score-tastingene. Eier-valgt suksessmål (board-møte 2026-07-10): **flere app-åpninger per runde** — avstanden er kroken. Ekte pull: eier + medspiller ba om featuren (inkl. crowdsourcing-mekanikken) spontant på en runde (hva-er-nok §5; bane ført inn i §3, commit `89bb043e`).

## Research Findings

- **iOS PWA ber om GPS-tillatelse per sesjon** i standalone-modus — det finnes ingen varig grant. UX-en må tåle re-prompt hver sesjon uten å mase: «Vis avstand»-knappen er inngangen hver gang tillatelsen mangler.
- **«Presis posisjon» av** i iOS-innstillinger gir accuracy 3000–9000 m, og `watchPosition` leverer da én callback + oppdatering hvert ~15. minutt. Håndteres av samme nøyaktighetsgate som ellers: upresis posisjon → avstand skjules (aldri vis et villedende tall), pins avvises.
- **Permissions API er upålitelig på iOS** (`permissions.query` svarer «prompt» selv når bruker har avslått). Bygg all logikk på faktiske `getCurrentPosition`/`watchPosition`-resultater og feilkoder, aldri på Permissions API.
- Prompt-bugs i standalone på enkelte enheter → GPS utløses alltid fra en direkte brukergest (knapp/chip-trykk), aldri automatisk on-mount.
- Kilder: MagicBell PWA iOS-guide (2026), Apple Developer Forums tråd 740270/751189/694999, progressier.com/pwa-capabilities/geolocation.

## Prior Decisions

- **Eier-godkjent design 2026-07-10:** `docs/superpowers/specs/2026-07-10-avstand-til-green-design.md` (commit `96a9cc43`) er sannhetskilden for UX og datamodell. Kontrakten her operasjonaliserer den — ved konflikt vinner designdokumentet.
- Brainstorm-avgjort: ett-trykks pinning ved score (ikke passiv klynging), «ren pinning, én avstand» (ikke OSM/F/M/B), suksess = app-åpninger.
- Repo-regler som binder: RLS = ekte authz-lag + hostile-PATCH-test (#440-rigg), `expectAffected`/`expectOne` etter mutasjoner, migrasjoner staging-først med eier-luke for prod (prod-brannmuren #1074), Dexie røres ikke, i18n no/en + humanizer på norsk copy.

## Design

**Datamodell.** Ny tabell `green_pins`: `id` uuid pk, `course_id` uuid NOT NULL FK courses ON DELETE CASCADE, `hole_number` int NOT NULL CHECK 1..18, `lat`/`lng` double precision NOT NULL med range-CHECKs, `accuracy_m` real NULL, `user_id` uuid NULL FK users **ON DELETE SET NULL** (anonymisering ved konto-sletting), `created_at` timestamptz default now(). Index på `(course_id, hole_number)`. Rådata lagres; senter materialiseres aldri.

**RLS.** SELECT: authenticated (global dugnadsdata, som `courses`). INSERT: authenticated + `user_id = auth.uid()`. UPDATE: **ingen policy.** DELETE: kun egen rad.

**Geo-bibliotek.** `lib/geo/distance.ts` (haversine, meter) + `lib/geo/greenCenter.ts` (median av lat og lng hver for seg; null ved 0 pins). Ren TS, TDD, `it.each` over edge-case-tabellen i designdokumentet (12 rader).

**Henting.** Hullsiden (`app/[locale]/games/[id]/holes/[holeNumber]/page.tsx`) legger én `green_pins`-fetch (`course_id + hole_number`) i den eksisterende `Promise.all`-batterien og sender beregnet senter (eller null) + pin-antall som props gjennom `HoleClient`. Pins er course-data og holdes UTENFOR `game-${id}`-cachen (samme begrunnelse som courses/tee_boxes-joinen).

**Avstandsvisning.** Ny klientkomponent `DistanceToGreen` i hull-hero-området: «Vis avstand»-knapp (brukergest → GPS-prompt) → `watchPosition` mens skjermen er synlig, stopp ved unmount/`visibilitychange`. Viser «~X m til green» med `tabular-nums`. Skjules når: senter mangler, avstand > 1 km, eller accuracy er ubrukelig (> ~50 m for visning). GPS-feil/avslag → tilbake til knapp med kort hint, ingen krasj.

**Pinning.** Chip i score-flaten (ved `components/hole/ScoreCard.tsx`) når ALLE holder: egen score på hullet er satt (strokes ≠ null), hullet har < 3 pins, `navigator.onLine`, GPS ikke avslått denne sesjonen. Trykk → `getCurrentPosition` (high accuracy) → accuracy ≤ 30 m? → server-action insert (`getServerClient`, `expectOne`) → takk + chip forsvinner. Accuracy > 30 m → «GPS-signalet er for svakt akkurat nå», chip består. Offline eller feilet insert → chip forsvinner stille denne sesjonen (tapt pin koster ingenting).

**Migrasjonssekvens (kjent felle).** `npm run gen:types` leser PROD-skjemaet — `green_pins`-typene finnes ikke før prod-migrasjonen er kjørt. Rekkefølge: migrasjonsfil (sjekk løpenummer mot origin/main FØRST, #543-fellen) → staging via Supabase MCP → verifiser → håndskrevet type-utvidelse i `database.types.ts` som matcher migrasjonen eksakt → prod KUN etter eksplisitt eier-godkjenning i økten (`touch .claude/approve-prod`-luken) → `gen:types` som avstemming.

## Edge Cases & Guardrails

Designdokumentets edge-case-tabell er testfasiten (0/1/2/mange pins, outlier, duplikat, 0 m, > 1 km, accuracy-gate, avslått tillatelse, ugyldig lat/lng, samtidige pins). I tillegg:

- Hostile-PATCH (#440-rigg): ikke-eier kan ikke UPDATE (ingen policy finnes), ikke INSERT med annen `user_id`, ikke DELETE andres pin.
- `watchPosition` må ryddes opp (clearWatch) ved navigasjon — hull-bytte skal ikke lekke watchers.
- Ingen GPS-kall uten brukergest (iOS-fellen over).
- Chip og avstandslinje skal ikke forstyrre modus-kontekstlinja (RR/Wolf/Skins bruker HoleHero-midtkolonnen) — de to må kunne sameksistere på samme hull.
- Prøvespill-demoen (`live={false}`) skal ikke vise noen av delene.

## Key Decisions

- Suksess = app-åpninger per runde → avstanden bor på hullskjermen, aldri en undersike. (Eier, board-møte)
- Ett-trykks pinning ved score-tasting; kun online; ingen sync-kø/Dexie-endring. (Eier, brainstorm)
- Median-senter av rådata; vises fra 1. pin; tilde alltid. (Godkjent design)
- 30 m accuracy-gate for pins, ~50 m for visning, 1 km display-gate, < 3 pins chip-terskel. (Godkjent design + research)
- `user_id` nullable + ON DELETE SET NULL — dugnadsdata overlever konto-sletting. (Godkjent design)

**Claude's Discretion:**
- Eksakt plassering/stabling av avstandslinje vs. modus-kontekstlinje i HoleHero; chip-plassering i score-flaten.
- Dismiss-semantikk for chipen (per hull per sesjon er default-forventningen).
- Norsk copy-ordlyd (gjennom humanizer; «~X m til green»-formen ligger fast).
- Server-action-filplassering (`lib/greens/` foreslått) og komponentnavn.
- Om pin-antall vises noe sted (f.eks. stille «3 punkter» i chip-takken) — valgfritt.

## Success Criteria

- [ ] `npx vitest run lib/geo` grønn — haversine + median dekker alle 12 edge-case-rader fra designdokumentet (`it.each`).
- [ ] RLS verifisert på staging: hostile-PATCH-testene (UPDATE avvist, INSERT som annen bruker avvist, DELETE av andres pin avvist) kjører grønt.
- [ ] Staging-klikkrunde (mocket geolocation via `preview_eval`): hull uten pins viser chip etter score-tasting → «pin» lagres (rad synlig i staging-DB) → hull med senter viser «~X m til green», og linja skjules ved mock-posisjon > 1 km unna.
- [ ] Accuracy-gate bevist: mocket accuracy 45 m → pin avvises med feilmelding; 10 m → pin lagres. (Komponent-/unit-test eller staging-mock.)
- [ ] `ON DELETE SET NULL` bevist på staging: slett testbruker-rad → pin-raden består med `user_id = NULL`.
- [ ] `npm run build` + `npm run lint` + co-located tester for endrede filer grønne; feat-bump (minor) + én Funksjon-linje i CHANGELOG.
- [ ] VERIFICATION GAP dokumentert i PR: ekte iOS-enhet på bane kan ikke verifiseres i økten — eier tester på neste runde.

## Gates

- [ ] `npm run build` (fanger tsc + cacheComponents-feller; aldri filtrert tsc)
- [ ] `npx vitest run lib/geo` + co-located tester for hver endret fil
- [ ] `npm run lint`
- [ ] Migrasjon: staging påført + verifisert FØR noe merges; prod kun via eier-luken

## Files Likely Touched

- `supabase/migrations/01XX_green_pins.sql` — ny tabell + RLS + index (sjekk nummer mot origin/main)
- `lib/geo/distance.ts` + `.test.ts`, `lib/geo/greenCenter.ts` + `.test.ts` — nye, ren TS
- `lib/greens/savePin.ts` (server-action) + co-located test
- `app/[locale]/games/[id]/holes/[holeNumber]/page.tsx` — pins-fetch i Promise.all, props
- `app/[locale]/games/[id]/holes/[holeNumber]/HoleClient.tsx` — prop-threading
- `components/hole/DistanceToGreen.tsx` (ny) + maks én render-test; chip-komponent ved `ScoreCard.tsx`
- `lib/supabase/database.types.ts` — håndskrevet utvidelse til prod-migrasjonen er kjørt
- `messages/no.json` + `messages/en.json` — nye nøkler
- `package.json` + `package-lock.json` + `CHANGELOG.md` — feat-bump + Funksjon-linje

## Out of Scope

- Forkant/bakkant/tee/bunkere, OSM-import, kartleggingsmodus, F/M/B-visning (v2, trigger: pinne-adferd bevist — pins fra ≥ 2 brukere på ≥ 2 baner)
- Passiv GPS-klynging ved score-tasting (v2-alternativ hvis chip-adferden uteblir)
- Telemetri for app-åpninger (suksess vurderes pragmatisk: pinne-volum + gjengens egne ord)
- Prøvespill-demoen, offline-pinning, Dexie-/sync-kø-endringer
- Deferred idé fra board-møtet: OSM-polygon-import for F/M/B der data finnes
