# Forge-kontrakt: #945 — Kalender (.ics) + kart/veibeskrivelse for tee-off

**Issue:** [#945](https://github.com/jdlarssen/golf-app/issues/945) · **Milestone:** Runde 1 — Nå · **Effort:** S→M · **Branch:** `claude/heuristic-curie-68ea31`

## Mål (funksjonelt)

På tee-off-flaten (game-home venterom) får spilleren to nye handlinger:

1. **«Legg til i kalender»** — laster ned en `.ics`-fil for den planlagte tee-off-tiden, slik at runden havner i telefonens kalender med en påminnelse 1 time før.
2. **«Vis på kart»** — åpner Google Maps-søk på banens navn for veibeskrivelse.

Dette fjerner to friksjonspunkter konkurrenter (Golfbox) har som standard: glemte tee-tider og separat fomling etter baneadresse.

## Beslutninger (avklart med eier + tekniske valg)

| Tema | Valg | Begrunnelse |
|------|------|-------------|
| Kalender-hendelsens varighet | **4,5 timer** (270 min) fra tee-off | Eier-valg: realistisk 18-hulls runde, blokkerer ettermiddagen mot dobbeltbooking |
| Påminnelse | **VALARM 1 time før** (`TRIGGER:-PT1H`, `ACTION:DISPLAY`) | Eier-valg: hele poenget er å ikke glippe tee-tiden |
| `.ics`-levering | **Server-rute** (`route.ts`), ikke klient-blob | iOS standalone-PWA håndterer blob-nedlasting upålitelig; en rute med `Content-Type: text/calendar` + `Content-Disposition: attachment` trigger «Legg til i kalender»-arket robust. Primær-plattform er iOS PWA. |
| Tidssone i `.ics` | **UTC-form** (`YYYYMMDDTHHMMSSZ`) | `scheduled_tee_off_at` er en `timestamptz` (absolutt instant). UTC-emisjon er entydig og konverteres til lokal tid av kalender-appen. Ingen `VTIMEZONE`-blokk nødvendig. Oslo-helpers er for *visning*, ikke for `.ics`-absoluttid. |
| Kart-lenke | **Google Maps navne-søk** `https://www.google.com/maps/search/?api=1&query=<banenavn>` | `courses`-tabellen har **kun `name`** — ingen adresse/lat-lng i skjemaet. Navne-søk er eneste mulighet uten skjema-endring (utenfor scope). Universal URL åpner Maps-app på iOS, Google Maps ellers. |
| UI-form | To server-rendrede `<a>`-lenker i bane-kortet | Begge er rene lenker (rute gjør jobben server-side; kart-URL er statisk). **Ingen `'use client'`-komponent nødvendig** → lavere risiko, mindre kode. |
| Synlighet | Kalender-lenke kun når `scheduled_tee_off_at` er satt; kart-lenke alltid (bane finnes alltid) | `.ics` krever tee-off-tid; kart krever bare banenavn |
| Skjema-endring | **Ingen** | Adresse-kolonner på `courses` er bevisst utenfor scope (eget issue hvis ønsket senere) |

## Berørte filer

- **NY** `lib/calendar/teeOffIcs.ts` — ren funksjon som bygger RFC-5545 VCALENDAR-streng (Type A pure logic, TDD)
- **NY** `lib/calendar/teeOffIcs.test.ts` — unit-tester for `.ics`-bygger
- **NY** `app/[locale]/games/[id]/calendar/route.ts` — GET-rute som returnerer `.ics` (auth-mønster speiler `leaderboard/export/route.ts`)
- **ENDRE** `app/[locale]/games/[id]/(home)/page.tsx` — legg actions-rad i bane-kortet (rundt L496–611)
- **ENDRE** `messages/no.json` + `messages/en.json` — nye nøkler under `game.home` (+ evt. liten `game.teeOffCalendar`-namespace for rute-tekster/feil), **i begge filer** (catalog-parity)
- **ENDRE** `package.json` (+ `package-lock.json`) — versjon-bump minor (`feat`)
- **ENDRE** `CHANGELOG.md` — én Funksjon-rad

## `.ics`-byggerens kontrakt (lib/calendar/teeOffIcs.ts)

Ren funksjon, signatur omtrent:

```ts
buildTeeOffIcs(input: {
  uid: string;            // stabil, f.eks. `teeoff-${gameId}@tornygolf.no`
  gameName: string;
  courseName: string | null;
  teeOffAt: Date;
  durationMinutes: number;   // 270
  reminderMinutes: number;   // 60
  summary: string;           // lokalisert tittel, f.eks. "Golf: <gameName>"
  description: string;       // lokalisert, inkl. lenke tilbake til spillet
  dtstamp: Date;             // injisert (ikke Date.now() inni — testbarhet)
}): string
```

Krav til output (RFC 5545):
- `BEGIN:VCALENDAR` … `END:VCALENDAR` med `VERSION:2.0` + `PRODID`
- Ett `VEVENT` med `UID`, `DTSTAMP`, `DTSTART`, `DTEND` (= start + duration), `SUMMARY`, `LOCATION`, `DESCRIPTION`
- Ett `VALARM` med `ACTION:DISPLAY`, `TRIGGER:-PT{reminderMinutes}M` (eller `-PT1H`), `DESCRIPTION`
- **CRLF** (`\r\n`) linjeskift
- TEXT-verdier escapet: `\` → `\\`, `;` → `\;`, `,` → `\,`, newline → `\n`
- Dato/tid i UTC-form `YYYYMMDDTHHMMSSZ`

## Rutens kontrakt (app/[locale]/games/[id]/calendar/route.ts)

Speiler `leaderboard/export/route.ts`:
- `getProxyVerifiedUserId()` → 401 hvis ikke innlogget
- `getGameWithPlayers(id)` → 404 hvis spill mangler
- admin ELLER deltaker → ellers 404
- `scheduled_tee_off_at` satt OG `status !== 'finished'` → ellers 404 (kalender gir ikke mening etter at runden er ferdig / uten tee-off)
- Banenavn hentes som slim direkte-call `supabase.from('courses').select('name').eq('id', game.course_id).single()` (join-data ikke i cachen, jf. CLAUDE.md)
- Respons: `Content-Type: text/calendar; charset=utf-8`, `Content-Disposition: attachment; filename="torny-teeoff-<id>.ics"`, `Cache-Control: no-store`

## Suksesskriterier

- [x] **K1 — `.ics`-bygger:** `lib/calendar/teeOffIcs.ts:106` ren funksjon → RFC-5545 VCALENDAR med VEVENT (DTSTART/DTEND/SUMMARY/LOCATION/UID/DTSTAMP) + VALARM. TEXT-escaping (`teeOffIcs.ts:58`) + 75-octet folding (`teeOffIcs.ts:76`) + CRLF. *(Bevis: `npx vitest run lib/calendar` → 17/17 grønne; escaping/CRLF/VALARM-tester i `teeOffIcs.test.ts`)*
- [x] **K2 — Tidssone:** `formatUtc` (`teeOffIcs.ts:43`) emitterer UTC-form `YYYYMMDDTHHMMSSZ`. *(Bevis: test «emits DTSTART as the tee-off instant in UTC form» asserter `DTSTART:20260715T090000Z` for `new Date('2026-07-15T09:00:00Z')`; rollover-test for DTEND over midnatt)*
- [x] **K3 — Server-rute:** `app/[locale]/games/[id]/calendar/route.ts` — 401 uten userId (`:45`), 404 mangler/ikke-deltaker (`:67,:75`), 404 finished/ingen tee-off (`:79`), slim course-fetch (`:86`), headers `text/calendar` + `attachment` (`:111`). Auth speiler `leaderboard/export/route.ts`. *(Bevis: fil:linje over)*
- [x] **K4 — UI-lenker:** Bane-kortet (`(home)/page.tsx:534`) rendrer «Legg til i kalender» (ren `<a>` → ruten) når tee-off satt + «Vis på kart» (Google Maps-søk) når banenavn finnes. `min-h-[44px]`. *(Bevis: verifisert live mot torny-staging — preview-screenshot av kortet, begge lenker `height=44px`; calendar-href `/no/games/.../calendar`, map-href `google.com/maps/search/?api=1&query=Byneset%20North` med `target=_blank rel=noopener noreferrer`; tee-off 09:00 Oslo fra 07:00Z; ingen konsoll-feil. `.ics`-ruten authed → 200 `text/calendar` gyldig VCALENDAR; aktivt spill u/tee-off → 404)*
- [x] **K5 — i18n-paritet:** `game.home.addToCalendar`/`viewOnMap` + `game.teeOffCalendar.*` i begge filer. *(Bevis: `npx vitest run messages` → 4/4 grønne (catalog + apostrophe parity); copy gjennom humanizer (en-dash→kolon i summary))*
- [x] **K6 — Versjon + CHANGELOG:** `package.json` 1.149.0 → 1.150.0 (minor); Funksjon-rad «1.150 · Tee-off rett i kalenderen» i `CHANGELOG.md`. *(Bevis: commit 9d7f1e00)*

## Gates (kjøres scoped til endringer)

```bash
npm run typecheck                       # tsc --noEmit
npm run lint                            # eslint
npx vitest run lib/calendar messages    # ny .ics-test + catalog/apostrophe-parity
```

Bruker-synlig flyt verifiseres mot **torny-staging** (preview_start) før merge — game-home-kortet med begge lenker, og at `.ics`-ruten returnerer text/calendar.

## Out of scope (ikke bygg)

- Adresse/lat-lng-kolonner på `courses` (skjema-endring — eget issue ved behov)
- `navigator.share` av recap-kort (det er #942)
- Kalender-knapp andre steder enn game-home venterom (hjem-feed-listen røres ikke)
- VTIMEZONE-blokker / flertidssone-støtte (UTC-instant er nok)
