# Contract: Admin-flatene viser Oslo-tid, ikke UTC (#637 + #646)

**Issues:** [#637](https://github.com/jdlarssen/golf-app/issues/637) (tee-off i UTC på admin-protokollen) + [#646](https://github.com/jdlarssen/golf-app/issues/646) (Klubbhuset-hilsen i UTC)
**Branch:** `claude/hopeful-bhabha-fccdc0`
**Type:** `fix` — bruker-synlig → bump `package.json` (1.130.1 → 1.130.2) + CHANGELOG-oppføring i samme commit som koden.
**Scope-beslutning (eier 2026-06-15):** «Klyngen» — fiks de 2 rapporterte symptomene **+** søsken med identisk rotårsak på de **samme to sidene**. Ikke app-bred feiing (det blir ev. eget audit-issue).

---

## Rotårsak (felles for begge issues)

Vercel-serveren kjører i **UTC**. Flere admin-flater rendrer dato/klokkeslett med
**lokal-tid-getters** (`Date#getHours/getDate/getMonth/getDay`) eller `toLocaleString`
**uten `timeZone`-opsjon** — som derfor blir UTC på serveren i stedet for `Europe/Oslo`.

Spiller-siden gjør det allerede riktig: [`app/[locale]/games/[id]/(home)/page.tsx:539,542`](app/[locale]/games/[id]/(home)/page.tsx) bruker de Oslo-pinnede `formatTeeOffTimeLocale` / `formatTeeOffDateLocale` fra `lib/i18n/format.ts`. Det er denne korrektheten admin-flatene skal matche.

Eksisterende Oslo-primitiv finnes allerede i [`lib/format/teeOff.ts`](lib/format/teeOff.ts) (`osloParts`, `formatTeeOffTime`, `formatTeeOffDate`) — bygd på `Intl.DateTimeFormat(..., { timeZone: 'Europe/Oslo' })`, TZ-stabil uansett server-TZ. Fiksen gjenbruker/utvider dette, oppfinner ikke en ny mekanisme.

---

## Berørte kallsteder (klyngen)

### Side A — `/admin/games/[id]` (admin-protokollen) — [`app/[locale]/admin/games/[id]/page.tsx`](app/[locale]/admin/games/[id]/page.tsx)
1. **#637 tee-off-tid** (linje ~604): `formatDateTime(scheduled_tee_off_at, locale, {day, month, hour, minute})` → `formatDateTime` (`toLocaleString`) mangler `timeZone` → UTC (08:00 i stedet for 10:00).
2. **Undertittel-dato** (linje ~208–218): `shortDate()` → `formatShortDateLocale(iso, locale)` leser lokal-getters → feil dato nær midnatt. Dekker `ended_at`/`started_at`/`scheduled_tee_off_at`/`created_at`.

### Side B — `/admin` (Klubbhuset-dashboard) — [`app/[locale]/admin/page.tsx`](app/[locale]/admin/page.tsx)
3. **#646 tid-på-døgnet** (linje ~120–126, `getTimeOfDay`): `d.getHours()` (lokal/UTC) → feil hilsen («God kveld» kl. 01:32 norsk).
4. **#646 dato-linje** (linje ~89): `formatShortDateLocale(now, locale)` → feil dato nær midnatt («14. jun» i stedet for «15. jun»).
5. **#646 ukenummer** (linje ~44–54 + 88, `isoWeek`): lokal-getters → kan bomme på uke nær årsskifte/midnatt.
6. **Aktivitets-logg klokkeslett** (linje ~56–61 `formatHHMM`, brukt linje ~679): `d.getHours()/getMinutes()` → UTC.
7. **«Sist signert / publisert»-datoer** (linje ~305, 313): `formatShortDateLocale(lastFinishedAt/lastPublishedAt, locale)` → feil dato nær midnatt.

**Ikke i scope:** app-bred sweep av alle `formatShortDateLocale`/`formatDateTime`-kall (slett-sider, historikk, liga-vinduer osv.). Bekreftet eier-avgrensning til disse to sidene.

---

## Bevisst IKKE endret (false-positives for evaluator)

- **Ingen «natt»-bøtte.** `getTimeOfDay` har i dag bøttene morgen (<10) / formiddag (<12) / ettermiddag (<18) / kveld (ellers). Etter TZ-fiksen viser kl. 01:32 Oslo «God morgen» (h<10). #646 sin «forventet» lister eksplisitt «God morgen» som akseptabelt. Å legge til en natt-bøtte er scope creep utenfor tidssone-buggen — gjøres ikke.
- **Generiske helpers (`formatDateTime`/`formatShortDateLocale`/`formatTime`) forblir TZ-nøytrale.** De pinnes ikke globalt til Oslo — Oslo-semantikk legges på kallstedet / i nye Oslo-pinnede helpers, slik teeOff-modulen allerede gjør. (Unngår å bryte ikke-admin-kallere.)
- **`formatTeeOffTime`/`formatTeeOffDate`-signaturer røres ikke** (mange kallere + 5+ snapshot/render-tester låser output).

---

## Approach (kode-org — mine valg per «no technical decisions to user»)

**Ren logikk → `lib/format/` med Type A unit-tester. Display-helpers → `lib/i18n/format.ts` (locale-aware, Oslo-pinnet).**

1. **`lib/format/teeOff.ts`:** eksporter `osloParts` (i dag privat) og utvid den med `year`. Dette er Oslo-primitivet alt annet bygger på.
2. **`lib/format/osloCalendar.ts` (ny, ren modul):**
   - `osloIsoWeek(date: Date): number` — ISO-uke beregnet fra Oslo y/m/d (intern UTC-konstruksjon `Date.UTC(...)` + `getUTC*` → TZ-stabil). Erstatter `isoWeek` i page.
   - `osloTimeOfDayBucket(date: Date): 'morgen' | 'formiddag' | 'ettermiddag' | 'kveld'` — bøtte fra `osloParts(date).hour`. Page mapper bøtte → i18n-nøkkel (`timeOfDay*`), slik at format-libben ikke kobles til oversettelses-nøkler.
3. **`lib/i18n/format.ts`:**
   - `formatShortDateOsloLocale(input, locale)` — Oslo-pinnet «15. jun» / «15 Jun». 'no' bruker `osloParts` + NO_MONTHS_SHORT (byte-identisk «15. jun», ingen trailing dot); 'en' bruker `Intl(..., {timeZone:'Europe/Oslo', day:'numeric', month:'short'})`.
   - `formatHHMMOsloLocale(input, locale)` — Oslo-pinnet «08:00» (24t, locale-uavhengig format men beholder signatur-konvensjonen). Brukes av aktivitets-loggen.
4. **Kallsteder:** rut 1–7 over til de nye/eksisterende Oslo-helpers. #637 tee-off-tid: legg `timeZone: 'Europe/Oslo'` på `formatDateTime`-opsjonene (beholder kombinert «dag måned, HH:MM»-format, kun pinnet til Oslo). `getTimeOfDay`/`isoWeek`/`formatHHMM` i page.tsx fjernes til fordel for de nye lib-funksjonene.

---

## Suksesskriterier

- [x] **K1 (#637):** Tee-off-tid på admin-protokollen vises i Oslo wall-clock. *Evidens: `formatDateTime`-kall i [`page.tsx:601`](app/[locale]/admin/games/[id]/page.tsx:601) har nå `timeZone: 'Europe/Oslo'`; unit-test «renders the tee-off time in Oslo wall-clock when timeZone is set (#637)» i `format.test.ts` (08:00Z → «10:00», ikke «08:00») under `process.env.TZ='UTC'`.*
- [x] **K2:** Admin-protokollens undertittel-dato vises i Oslo-dato. *Evidens: `shortDate()` ([`page.tsx:208`](app/[locale]/admin/games/[id]/page.tsx:208)) ruter til `formatShortOsloDayMonthLocale`; unit-test «rolls to the Oslo date in the ~22:00–24:00 window (#646 regression)» (`2026-06-14T23:32:00Z` → «15. jun»).*
- [x] **K3 (#646 hilsen):** Tid-på-døgnet følger Oslo-time. *Evidens: unit-test `osloTimeOfDayBucket` «buckets a just-past-midnight Oslo instant as morgen» (`2026-06-14T23:32:00Z` → `morgen`, ikke `kveld`); kallsted [`page.tsx`](app/[locale]/admin/page.tsx) via `TIME_OF_DAY_KEY[osloTimeOfDayBucket(now)]`.*
- [x] **K4 (#646 dato):** Dato-linjen viser Oslo-dato. *Evidens: kallsted bruker `formatShortOsloDayMonthLocale(now, locale)`; samme helper-test som K2.*
- [x] **K5 (#646 uke):** Ukenummeret beregnes fra Oslo-dato. *Evidens: unit-test `osloIsoWeek` (kjent dato → 25; nær-midnatt `2026-06-14T23:32:00Z` → 25 i stedet for UTC-uke 24; nyttår → 53).*
- [x] **K6 (logg):** Aktivitets-loggens klokkeslett vises i Oslo-tid. *Evidens: `formatHHMMOslo(row.ts)` på kallstedet; unit-test «renders 24h HH:MM in Oslo time (summer)» (08:00Z → «10:00»).* (Navngitt `formatHHMMOslo`, locale-uavhengig 24t — avvik fra kontraktens `formatHHMMOsloLocale`, se Avvik.)
- [x] **K7 (meta):** «Sist signert/publisert»-datoene vises i Oslo-dato. *Evidens: begge `metaLast*`-kall ruter til `formatShortOsloDayMonthLocale` ([`page.tsx:295,303`](app/[locale]/admin/page.tsx:295)).*
- [x] **K8 (engelsk):** 'en'-locale beholder TZ-korrekthet. *Evidens: 'en'-cases i `format.test.ts` (`formatShortOsloDayMonthLocale(... ,'en')` → «15 Jun»; `formatHHMMOslo` er locale-uavhengig 24t).*
- [x] **K9 (ingen regresjon):** *Evidens: full vitest-suite grønn — 278 filer / 3517 tester; `tsc --noEmit` rent; `npm run build` ✓ Compiled successfully (256/256 sider). Ingen endring i `formatTeeOffTime`/`formatTeeOffDate`-signatur eller -output.*
- [x] **K10 (versjon):** *Evidens: bump 1.130.1 → 1.130.2 (#637-commit) → 1.130.3 (#646-commit), hver med CHANGELOG-oppføring i samme commit; commit-msg-hook passerte uten `--no-verify`.*

**Avvik fra kontrakt (kode-org):**
1. Gjenbrukte eksisterende `formatShortOsloDayMonthLocale` (lagt til for #648) i stedet for å lage ny `formatShortDateOsloLocale` — identisk Oslo-pinnet «15. jun»/«15 Jun»-output, utvidet til å ta `Date | string`. DRY framfor duplikat.
2. Navnga HH:MM-helperen `formatHHMMOslo(input)` (locale-uavhengig, ingen falsk `locale`-param) i stedet for `formatHHMMOsloLocale` — 24-timers klokke er identisk på tvers av locale.
3. Utvidet scope-en på admin-protokoll-siden til også saksnummer-footerens dato (linje ~333) — samme rotårsak, samme side, per «klyngen»-beslutningen.

---

## Gates (kjøres scoped til det som endres)

```bash
# 1. Nye + berørte co-located tester (Type A, ren logikk)
npx vitest run lib/format/teeOff.test.ts lib/format/osloCalendar.test.ts lib/i18n/format.test.ts

# 2. Typesjekk (ekshaustive switch / Record-maps + nye exports)
npx tsc --noEmit

# 3. Full suite (regresjon — K9)
npx vitest run

# 4. Produksjonsbygg (Next 16 — fanger import-/PPR-feil tsc ikke ser)
npm run build
```

Per «Run co-located tests for changed files»: gaten MÅ inkludere de endrede filenes egne `*.test` + `tsc --noEmit`, ikke bare en smal vitest-mappe.

---

## Test-plan (per docs/test-discipline.md — Type A pure logic)

Alle test-filer pinner `process.env.TZ = 'UTC'` på toppen (samme mønster som `teeOff.test.ts`) så de fanger Vercel-regresjonen og passerer identisk på Oslo-dev-maskin.

- **`lib/format/osloCalendar.test.ts` (ny):**
  - `osloTimeOfDayBucket`: regresjons-case `2026-06-14T23:32:00Z` → `morgen` (ikke `kveld`); bøtte-grenser (Oslo 09→morgen, 10→formiddag, 12→ettermiddag, 18→kveld) via `it.each`.
  - `osloIsoWeek`: kjent dato (f.eks. 2026-06-15 → uke 25); nær-midnatt-instant der Oslo-dato ≠ UTC-dato gir Oslo-ukenummer.
- **`lib/i18n/format.test.ts` (utvid):**
  - `formatShortDateOsloLocale`: `2026-06-14T23:32:00Z` → 'no' «15. jun», 'en' «15 Jun»; sommer/vinter-instant.
  - `formatHHMMOsloLocale`: `2026-06-14T08:00:00Z` → «10:00» (sommer), vinter-case → «09:00».
- **`lib/format/teeOff.test.ts` (utvid):** `osloParts(date).year` korrekt + nær-midnatt date-boundary.
- **Ingen render-tester** for `page.tsx` (server-komponenter med admin-only data-imports; ikke unit-testbare og Type C er maks én per komponent — ikke berettiget her).

---

## Verifisering før ACCEPT

- Quick self-pass: les hvert kriterium, kjør gates, noter evidens.
- Formell evaluator: fresh-context sub-agent kjører alle gates + leser diff mot kontrakten. UI-kriteriene (K1/K3) er bevist via Type A-helper-testene med UTC-pinnet TZ — det er den deterministiske reproduksjonen av Vercel-buggen (Playwright/Chrome mot prod er ikke nødvendig siden rotårsaken er ren TZ-logikk, men evaluator kan lese diffen på kallstedene for å bekrefte at de faktisk er rutet om).

## Non-goals

- Endre tee-off-format/ordlyd, legge til «natt»-hilsen, eller røre spiller-siden (allerede korrekt).
- App-bred TZ-audit utenfor de to admin-sidene.
- Endre lagrings-/skrive-siden (tee-off lagres allerede korrekt som UTC-instant; kun visning er feil).
