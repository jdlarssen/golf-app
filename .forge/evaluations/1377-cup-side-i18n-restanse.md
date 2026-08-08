# Evaluering: #1377 — cup-side i18n-restanse

**Verdikt:** ACCEPT
**Dato:** 2026-08-08 · runde 1

Alt verifisert uavhengig i denne økten (ingen bevislinje overtatt fra byggeren).
Diff under vurdering: `42c169a0` (fiksen) + `a83c4a22` (kontrakt-bokføring), 4 kodelinjer
i 2 ruter + 4 katalognøkler.

## Drift-påstandene — verifisert mot `origin/main`

Kontraktens drift-seksjon påstår at fire av sju punkter allerede var fikset. Sjekket med
`git show origin/main:<path> | grep -n`:

| Kontraktens punkt | Påstand | Verifisert |
|---|---|---|
| `{winnerName} vant` | fikset | ✅ `origin/main:app/[locale]/cup/[id]/resultater/page.tsx:112` → `t('results.winner', { team: winnerName })` |
| `Uavgjort` | fikset | ✅ samme fil `:115` → `t('results.tied')` |
| `m.matchLabel ?? 'Match'` | fikset | ✅ `cup/[id]/page.tsx:140`, `resultater/page.tsx:201`, `CupManagement.tsx:263/266/476` → alle `t('matchFallback')`. Null treff på `'Match'`-literal. |
| Søsken-defekt CupManagement.tsx | fikset | ✅ `:480` → `t('manage.mot')`; `grep -n "result.formatted\|winnerSide"` mot `origin/main:CupManagement.tsx` → **ingen treff**, altså ingen `til ${…}`-interpolering å fikse |
| `'Delt (AS)'` | fortsatt hardkodet | ✅ `origin/main:resultater/page.tsx:211` |
| `mot` | fortsatt hardkodet, 2 steder | ✅ `origin/main:cup/[id]/page.tsx:144` + `resultater/page.tsx:205` |
| `${formatted} til ${navn}` | fortsatt hardkodet | ✅ `origin/main:resultater/page.tsx:213–224` |

Drift-seksjonen er **korrekt**. Ingen av «allerede fikset»-påstandene er pyntet på.

## Kriterier

| # | Kriterium | Status | Bevis |
|---|---|---|---|
| 1 | Null hardkodede bruker-synlige strenger igjen i cup-rutene (kontraktens grep) | ✅ | `grep -rn "Halvert\|'Delt\|>mot<\|til \${" 'app/[locale]/cup' 'app/[locale]/admin/cup'` → `NONE`. Bredere sveip (subagent leste alle 15 cup-rutefiler i sin helhet): begge public-rutene og alle rendret-komponenter er rene. To treff på admin-siden — se Merknad 1, pre-eksisterende og utenfor issue-scope. |
| 2 | `CupManagement.tsx` null treff for `'Match'`-fallback og `til`-interpolering | ✅ | Verifisert på BÅDE `origin/main` og HEAD — filen var alt ren, og PR-en rører den ikke (`git diff --stat` lister den ikke) |
| 3 | Nye nøkler i både no.json og en.json, med samme ICU-plassholdere | ✅ | `python3` mot begge filer: `no matchTied='Delt (AS)' resultTo='{result} til {name}'` · `en matchTied='Halved (AS)' resultTo='{result} to {name}'`. Plassholdernavnene `{result}`/`{name}` er identiske i begge locales — ingen `{navn}`-drift. Nøkkellistene under `cup.results` er identiske i no og en (16 nøkler, samme rekkefølge). |
| 4 | Norsk copy ord-for-ord uendret | ✅ | `git diff -- messages/no.json`: kun to tillegg, verbatim `"Delt (AS)"` og `"{result} til {name}"`. `git diff` på begge page.tsx viser kun literal→`t()`-bytte, ingen tekstendring. Bekreftet i kjørende UI: `/no` viser fortsatt «mot», «Delt (AS)», «5&4 til Nord», «31–35 til Nord» — inkludert bevart en-dash i tallresultatene. |
| 5 | `npx tsc --noEmit` grønn | ✅ | exit 0, ingen output |

**Bonus-verifisering (ikke i kontrakten):** ICU-argumentene mates med ferdigformaterte
strenger (`m.result.formatted`), og next-intl setter argumentverdier inn verbatim — ingen
tallformatering slår inn på `1up`/`31–35`. Bekreftet empirisk i UI-runden.

## Gates

| Gate | Resultat | Output |
|---|---|---|
| `npx tsc --noEmit` | ✅ | exit 0, tom output |
| `npm run lint` | ✅ | `✖ 56 problems (0 errors, 56 warnings)`. Alle warnings er pre-eksisterende complexity/max-depth. Filtrert på «cup»: `CupManagement.tsx:181`, `generer/actions.ts:169`, `lib/cup/getCupSnapshot.ts:186` — **ingen av de to endrede filene** (`cup/[id]/page.tsx`, `cup/[id]/resultater/page.tsx`) har noen warning i det hele tatt. |
| `npx vitest run lib/cup 'app/[locale]/cup'` | ✅ | `Test Files 24 passed (24) · Tests 386 passed (386)` |
| `npm run build` | ⚠️ hoppet over — men indirekte bekreftet | Jeg kjørte den ikke selv (ville klobbet `.next` for prod-serveren på :3120 som UI-runden bruker). Indirekte bevis: serveren på :3120 ER en produksjonsbygg av dette treet, og den serverer «Halved (AS)» / «vs» / «5&4 to Nord» — strenger som kun finnes i HEAD. En produksjonsbygg av akkurat denne koden har altså kjørt grønt. |
| Versjonsbump + CHANGELOG | ✅ | `package.json 1.229.0 → 1.229.1` (patch, riktig for `fix`), CHANGELOG-linje `1.229.1 · #1377` lagt til og teller bumpet 28 → 29 |
| Commit-disiplin | ✅ | Begge commits har `Refs #1377` i body; atomisk (fiks separat fra bokføring) |
| Staging-klikkrunde | ✅ | Se under |

## UI-verifisering (kjørt selv, mot staging)

Kjørte byggerens driver `drive1377b.mjs` selv, og skrev i tillegg en egen
(`eval1377.mjs`) som dekker den ANDRE endrede ruta (`/cup/<id>`, som byggerens
script ikke traff) og gjør en aktiv norsk-lekkasjesjekk på engelsk locale.

**`/cup/<id>/resultater`:**
- `no`: «Anders Berg/Kristian Strand **mot** Lars Vik/Bjørn Dahl», «5&4 **til** Nord»,
  «31–35 **til** Nord», «**Delt (AS)**»
- `en`: «Anders Berg/Kristian Strand **vs** Lars Vik/Bjørn Dahl», «5&4 **to** Nord»,
  «31–35 **to** Nord», «**Halved (AS)**»

**`/cup/<id>` (public cup-side):**
- `no`: 12 parvise linjer med «mot», overskrift «MATCHER», status «Spilt»
- `en`: 12 parvise linjer med «vs», «MATCHES», «Played», «12 of 12 matches played»

**Lekkasjesjekk:** filtrerte hele body-teksten på engelsk locale (begge ruter) etter
`mot|til|Delt|Uavgjort|vant|Halvert|poeng|slag` → **tom liste**. Ingen norsk igjen på
engelsk cup-flate.

`missingMessage`: `[]` (ingen `MISSING_MESSAGE`/`IntlError` i konsollen).
`prodGuard`: `[]` — alle Supabase-kall gikk mot `snwmueecmfqqdurxedxv` (staging).
**Ingen skriv mot noen database; kun lesing.**

## Merknader (ikke blokkerende)

1. **`'Ukjent spiller'` hardkodet på to admin-cup-flater.** Bredere sveip fant to
   gjenværende hardkodede norske strenger i cup-rutene:
   - `app/[locale]/admin/cup/[id]/generer/GenerateMatches.tsx:84`
   - `app/[locale]/admin/cup/[id]/spillere/CupParticipants.tsx:38`

   Begge er `u?.nickname?.trim() || u?.name?.trim() || 'Ukjent spiller'`. Nøkkelen finnes
   allerede (`cup.manage.unknownPlayer` = «Ukjent spiller» / «Unknown player») og brukes
   riktig i `CupManagement.tsx:270`.

   **Hvorfor ikke blokkerende:** (a) begge står uendret på `origin/main` — PR-en verken
   innførte eller forverret dem; (b) de ligger på admin-flater, mens #1377 handler om den
   offentlige cup-siden; (c) mønsteret er systemisk, ikke cup-spesifikt: 19 forekomster av
   `'Ukjent spiller'` repo-vidt; (d) de treffer bare når en deltaker mangler både kallenavn
   og navn. Kontraktens «Out of Scope» sier at øvrige cup-flater er utenfor.

   **Anbefaling:** eget issue (i18n, P3) på hele `'Ukjent spiller'`-mønsteret repo-vidt, ikke
   en cup-lokal lappe.

2. **Nøkkelplassering avviker fra kontraktens Design** (`cup.results.*` i stedet for
   `cup.manage.*`, og kontraktens tre `public.*`-nøkler ble ikke laget). Avviket er ærlig
   dokumentert i drift-seksjonen, og begrunnelsen holder: begge strengene brukes nå kun på
   resultatsiden, mens `manage.mot` faktisk deles av tre ruter og derfor med rette ble
   gjenbrukt. Ingen duplisering innført.

3. **Ingen tester lagt til** — riktig per test-disiplinen (ren copy-flytting). Verifisert at
   ingen test, snapshot eller e2e-spec asserterer på `'Delt (AS)'`, `'Halvert'`, `mot` eller
   `til ${`: `grep` mot `e2e/`, `lib/cup/`, `app/[locale]/cup/` → `NONE`. Ingen regresjonsrisiko
   i suiten, bekreftet av 386 grønne tester.

## Konklusjon

**ACCEPT.** Endringen gjør nøyaktig det den lover og ikke mer: fire strenger flyttet fra
kode til katalog, null logikkendring, norsk visning bevist uendret ned til en-dash-nivå,
og engelsk locale nå fri for norsk på begge cup-ruter. Drift-seksjonen i kontrakten er
etterprøvd punkt for punkt og stemmer — byggeren har ikke krysset av noe som ikke holder.
Alle gates grønne; `npm run build` er den ene jeg ikke kjørte selv, men prod-serveren som
UI-runden kjørte mot er bygget fra denne koden og serverer de nye nøklene.

Ett funn utenfor scope (`'Ukjent spiller'`, Merknad 1) bør bli et eget issue før merge, per
repo-regelen om reviewer-funn.
