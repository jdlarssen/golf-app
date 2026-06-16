# Forge-kontrakt: #651 — Saksnummer-året beregnes i Oslo-tid, ikke UTC

**Issue:** [#651](https://github.com/jdlarssen/golf-app/issues/651)
**Branch:** `claude/wizardly-nash-562848`
**Type:** `fix(admin)` — user-visible correctness fix (admin ser saksnummeret). Krever PATCH-bump + CHANGELOG.
**Prioritet:** lav (smalt nyttårs-vindu), men konkret korrekthets-feil.

## Bakgrunn

`getSakNumber()` i [`app/[locale]/admin/games/[id]/page.tsx:138-155`](app/[locale]/admin/games/[id]/page.tsx#L138) avleder «Sak {YYYY}-{NNN}» (vist i tittel-pill + footer-fotnote). Den beregner:

```ts
const created = new Date(createdAt);
const year = created.getFullYear();                       // ⟵ UTC på Vercel, ikke Oslo
const yearStartIso = `${year}-01-01T00:00:00Z`;           // ⟵ UTC-midnatt, ikke Oslo-midnatt
const yearEndIso = `${year + 1}-01-01T00:00:00Z`;         // ⟵ samme
// count games WHERE created_at IN [yearStartIso, yearEndIso) AND created_at <= createdAt
```

To sammenflettede feil, **begge** med rotårsak «lokal-tid på UTC-server» (samme familie som #637/#646):

1. **Året** (`getFullYear()`) leses i server-lokal tid = UTC, ikke Europe/Oslo.
2. **Tellings-grensene** er UTC-midnatt 1. jan, ikke Oslo-midnatt 1. jan.

### Konsekvens
Et spill opprettet i ~1-timersvinduet som straddler UTC/Oslo nyttår (1. jan 00:30 Oslo = 31. des 23:30 UTC) får **feil år** på saksnummeret OG havner i **feil års tellings-bøtte** (feil løpenummer). Smalt vindu, reell protokoll-feil.

## Designvalg (autonome — eier kan ikke programmere, jf. «No technical decisions to user»)

- **Pure helper i `lib/format/osloCalendar.ts`:** ny `osloYearWindow(date: Date): { year, startIso, endIso }`. Holder TZ-logikken testbar og ute av server-komponenten; samme fil/mønster som #646-helperne (`osloIsoWeek`, `osloTimeOfDayBucket`), bygger videre på `osloParts`.
- **Året** fra `osloParts(date).year` (samme primitiv som hele Oslo-helper-landskapet).
- **Grensene** som UTC-instant av Oslo 1. jan 00:00: `new Date(\`${year}-01-01T00:00:00+01:00\`).toISOString()`. 1. januar er **alltid** CET (UTC+1) i Oslo — DST går sent mars–sent oktober, dekker aldri januar — så offset er fast og trenger ingen runtime-probe. Dokumenteres i kommentar.
- **Ingen ny DB-kolonne, ingen migrasjon.** Saksnummeret forblir avledet on-read; kun tellings-vinduet flyttes til Oslo-instanter.
- **`getSakNumber` rewires** til å hente `{ year, startIso, endIso }` fra helperen og bruke `startIso`/`endIso` i `.gte`/`.lt`. Returtype uendret (`{ year, positionInYear }`), så `SakNumber`- og `CreatedAtFooter`-render-stedene rører jeg ikke.
- **Test:** Type A pure-logic unit-test (`lib/format/osloCalendar.test.ts`), mønster lånt fra eksisterende `osloIsoWeek`-nyttårs-test (`TZ=UTC` allerede pinnet øverst i fila). Server-komponenten + DB-tellingen testes ikke (system-grense, jf. test-disiplin Type A).

## Suksesskriterier

- [ ] **K1 — Oslo-år.** `osloYearWindow(d).year === osloParts(d).year` for alle instanter, inkl. nyttårs-straddle: `2026-12-31T23:30:00Z` (= 2027-01-01 00:30 Oslo) → `year === 2027`, ikke 2026. *Evidens: unit-test grønn + helper-kildekode.*
- [ ] **K2 — Oslo-grenser.** `startIso` = UTC-instant av Oslo 1. jan 00:00 for `year`; `endIso` = samme for `year+1`. Konkret: `osloYearWindow(new Date('2026-06-15T10:00:00Z')).startIso === '2025-12-31T23:00:00.000Z'`. *Evidens: unit-test grønn.*
- [ ] **K3 — Vindu-kjeding & inneslutning.** `endIso` for år Y === `startIso` for år Y+1 (ingen gap/overlapp). Straddle-instanten `2026-12-31T23:30:00Z` ligger i `[startIso, endIso)` for sitt eget (2027-)vindu. *Evidens: unit-test grønn.*
- [ ] **K4 — `getSakNumber` bruker helperen.** Server-komponenten leser `{ year, startIso, endIso }` fra `osloYearWindow(created)` og filtrerer tellingen på `startIso`/`endIso`; ingen gjenværende `getFullYear()` eller `…T00:00:00Z`-streng i funksjonen. Returtype + render-steder uendret. *Evidens: `page.tsx`-diff + grep.*
- [ ] **K5 — Gates grønne.** Co-located test + `tsc --noEmit` + `npm run build` passerer. Versjon patch-bumpet, CHANGELOG-oppføring lagt til (commit-msg-hook tilfredsstilt). *Evidens: kommando-output.*

## Gates (scoped til endringen)

```bash
npx vitest run lib/format/osloCalendar.test.ts   # ny + eksisterende osloCalendar-tester
npx tsc --noEmit                                  # hele typesjekken (exhaustive-feller)
npm run build                                     # Next.js-bygg (Vercel-paritet)
```

## Utenfor scope

- Andre `getFullYear()`/lokal-getter-bruk utenfor `getSakNumber` (egen triage hvis funnet → eget issue, jf. #651s søsken #637/#646/#651-familie).
- Selve render-tekstene `sakNumber` / `createdAtFooter` (allerede Oslo-pinnet via #637/#646).
- DB-backfill av historiske saksnumre (avledet on-read, ingen lagrede verdier å migrere).
- #651s nevnte «posisjon-i-året»-formatering (`padStart(3,'0')`) — uendret, kun tellings-grunnlaget korrigeres.
