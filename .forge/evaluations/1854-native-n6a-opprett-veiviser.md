# Evaluering: #1854 — Native N6a, opprett-veiviser i appen (runde 2)

**Verdict: ACCEPT**

Evaluert 2026-08-31 mot `claude/n6a-opprett-veiviser-native` @ `27b7ffce`, base `origin/main` @ `de966161`.
Fiksen ligger i `d3928166`. Alle sju porter kjørt på nytt lokalt (Node 22). Sju nye mutasjonsprober
kjørt, inkludert to som er konstruert for å omgå den nye strukturelle vakten. Staging-radene lest med
egne spørringer (`snwmueecmfqqdurxedxv`, read-only). Arbeidstreet er tilbakestilt og rent
(`git status --porcelain` tom, HEAD `27b7ffce`, jest 511/511 etter alle prober).

**Alle seks runde-1-funnene er ekte fikset**, og de to blokkerende er begge lukket med tester som
faktisk biter — jeg brøt koden på nytt og fikk rødt hver gang. De nye funnene under er alle LAV/INFO
og ingen av dem er en levende feil i koden som shippes; de hører hjemme som oppfølger-issues,
ikke som en ny runde.

---

## Runde 1-funn og hva som skjedde med dem

| # | Funn | Fikset? | Mutasjonsprobe |
|---|---|---|---|
| **F1** | `stablefordTeamSize` lekket over format-bytte → wolf/skins/BBB fikk lag-UI og TOM spillerliste | **JA** | Mode-blind `isParStableford` gjeninnført → **9 tester røde**. Full UI-repro (Stableford → «Par» → Tilbake → Wolf) i en render-probe mot den ekte skjermen: payloaden beholder alle 3 spillere, ingen lag-grid, Format-linja sier «Wolf» |
| **F2** | Tee-off-vakten voktet ingenting under `TZ=Europe/Oslo` | **JA** | Hele Oslo-rundturen gjeninnført → **3 røde**. Samme feil re-implementert INLINE uten import (usynlig for den strukturelle vakten) → **2 røde**. Begge også røde med `TZ=Europe/Oslo` eksportert i skallet |
| **F3** | `bestBallDefaultFlight` for lag 3–4 uvoktet | **JA** | Flatet til `return 1` → **1 rød** |
| **F4** | `catalogForPlayerCount` død kode med tester | **JA** | Fjernet. Null gjenværende referanser i hele repoet (kun i evaluerings-doccene), `fitsPlayerCount`-importen ryddet, eslint exit 0. Begrunnelsen for at filteret IKKE ligger i formatlista står nå i `FormatStep.tsx`-headeren |
| **F5** | JSDoc påsto `users.gender` er `'M'\|'D'\|'J'` | **JA** | Enumen sjekket direkte i staging: `user_gender = {mens, ladies}`. JSDoc-en (`createGame.ts:59-67`) sier nå det, med eksplisitt advarsel mot `=== 'D'`. `teeGenderFor` (`CreateGame.tsx:137-138`) sammenligner fortsatt mot `'ladies'` |
| **F6** | Drift-tabellen sa `zod@^4.4.3` | **JA** | Kontrakten sier `^4.5.4`; `native/app/package.json` sier `^4.5.4` og resolver til 4.5.4, rota til 4.4.3 |

---

## F2 i detalj — dette var rundens viktigste sjekk

Runde 1 falt på at vakten var en identitet på nøyaktig den maskinen alt bevis ble produsert på.
Tre uavhengige bevis for at den nå biter:

1. **Gjeninnført feil, med import** (`Date` → veggklokke → `parseOsloDateTimeLocal`):
   `Tests: 3 failed, 508 passed` — begge sommertid-/vintertid-radene OG den strukturelle sjekken.
2. **Gjeninnført feil, INLINE uten noen import** — samme bug-form, håndskrevet `Intl`-sammenligning
   mot `'GMT+2'`, altså usynlig for den strukturelle sjekken: `Tests: 2 failed, 509 passed`.
   Det er den TZ-pinnede påstanden gjennom `draftToFormData` som fanger den. Vakten er ekte.
3. **TZ-pinningen når faktisk workerne, og slår ambient TZ.** Kjørt med `TZ=Europe/Oslo` eksportert
   i skallet og `--maxWorkers=8`: mutanten er fortsatt rød. En probe inne i en worker rapporterte
   `pid=18581 ppid=18554 TZ=UTC local=2026-08-31T23:00:00.000Z` — altså en forked child-prosess der
   lokaltid ER UTC. `process.env.TZ = 'UTC'` i `jest.config.js` arves av workerne, og config-en
   vinner over miljøet.

Ingen andre tester endrer betydning av pinningen: `formatTeeOff` har ingen test i det hele tatt, og
alt annet dato-bruk i suiten er enten absolutt ISO eller `jest.useFakeTimers`-frosset. Ingen test
går grønn av feil grunn på grunn av UTC.

---

## Porter (mine egne kjøringer, Node 22.23.0)

| Port | Resultat | Tall |
|---|---|---|
| `npx jest` (native/app) | exit 0 | **35 suiter, 511 tester** |
| `npx tsc --noEmit` (native/app) | exit 0 | — |
| `npx expo export --platform ios` | exit 0 | `dist/` slettet etterpå |
| `npm run typecheck` (rot) | exit 0 | — |
| `npx vitest run` (rot) | exit 0 | **522 filer / 7028 tester = baseline** |
| `npx eslint native/app` | exit 0 | ingen output |
| `npm run build` (rot, pipefail) | exit 0 | — |
| `git diff --name-only origin/main...HEAD` | 33 filer | **0 utenfor `native/`/`docs/`/`.forge/`** |

Testtallet 499 → 511 stemmer med diffen: −2 (`catalogForPlayerCount`-testene) +14 nye i
`wizardPayload.test.ts`.

---

## Staging (read-only, egne spørringer)

Wolf-raden byggeren viser til er ekte og etter-fiks:

| Felt | Verdi |
|---|---|
| `id` / `name` | `6951df3a-681c-45e8-9691-a6dc783e4eef` / `Wolf` |
| `created_at` (Oslo) | `2026-08-31 22:50:43` — **8 minutter etter fiks-commiten** (`d3928166`, 22:42:43) |
| `status` | `scheduled` |
| `mode_config` | `{"kind":"wolf","team_size":1,"teams_count":3,"wolf_scoring":"net"}` — `kind` på plass |
| `game_players` | 3 rader, **`team_number` NULL på alle tre**, `flight_number` NULL på alle tre |
| `accepted_at` | satt KUN for `created_by`; null for de to andre |
| `scheduled_tee_off_at` | `22:00Z` = Oslo `2026-09-01 00:00` |

Tee-off-en ser først ut som førfiks-mønsteret, men er riktig: `defaultTeeOff()` er «nåtid, minutter
nullet, +2 timer», og 22:50 Oslo → 22:00 → 00:00 neste døgn = 22:00Z. Samme regning treffer alle de
andre radene eksakt, inkludert den ene som var feil: `681ca24b` ble opprettet 21:47 (→ 23:00 Oslo
forventet) og fikk 22:00Z = midnatt, altså den ene timen for mye. De tre etterfiks-radene fra
21:56–22:03 fikk alle 21:00Z = Oslo 23:00. Fortellingen henger sammen fra alle kanter.

---

## Nye funn (alle LAV/INFO — ingen er en levende feil i det som shippes)

### N1 — LAV. Regelen har fortsatt TO hjem: oppsummeringens format-etikett er mode-blind

`native/app/src/screens/CreateGame.tsx:447` leser `draft.setup?.stablefordTeamSize === 2` uten å
spørre om modusen — nøyaktig mønsteret F1 handlet om. Commit-meldingen i `d3928166` sier «Regelen
har naa ETT hjem (`isParStableford`)». Den har to.

**Målt:** med KUN `selectMode`-nullstillingen fjernet (og `isParStableford` intakt) rendrer
veiviseren Format = **«Wolf i par»** på oppsummeringen. Payloaden er riktig — ingen lag-grid, ingen
droppede spillere — så den alvorlige halvdelen av F1 er ekte lukket. Men etiketten er feil, og
ingenting fanger den.

Ikke nåbar i koden som shippes (nullstillingen lukker den). Fix: rut linja gjennom
`isParStableford(mode, draft.setup)`.

### N2 — LAV. Belt-and-braces-halvdelen av F1-fiksen er helt utestet

`native/app/src/screens/CreateGame.tsx:201-202` (`setSetup({})` + `setSetupText({...})`).
**Fjernet jeg de to linjene: `Tests: 511 passed, 511 total`, `tsc --noEmit` exit 0.** Ingenting i
suiten holder dem der. Commit-meldingen fører dem opp som en del av fiksen; de er reelt ubeskyttet.
Én assertion i `CreateGame.test.tsx` (bytt format etter steg 2, les Format-linja) dekker N1 og N2 i
samme slag.

### N3 — LAV. Fiksen innførte et lite fottrinn: å trykke på det ALLEREDE valgte formatet kaster oppsettet

`selectMode` (`CreateGame.tsx:190`) har ingen `if (mode === gameMode) return;`. Kortet i steg 1 er
en vanlig `SelectRow` — det navigerer ikke, «Neste» gjør det — så et trykk på det uthevede kortet
(«ja, denne») er en naturlig gest.

**Målt:** Stableford → «Par» → Tilbake → trykk Stableford igjen → chippen står på «Alene» igjen.
Navnet overlever (`nameTouched` verner det), oppsettet gjør ikke. Gjelder også
`greensomeAllowancePct` (som da faller til 100) og `krPerUnit`. Før runde 2 mistet en slik gest bare
lagtildelingene; nå mister den hele oppsettet.

Feltene er synlige på steg 2 på veien framover, så det er merkbart snarere enn stille — men en
no-op-gest bør ikke kaste arbeid. Én linje å fikse.

### N4 — LAV. Tredje kopi av stableford-familie-regelen, håndskrevet

`native/app/src/components/create/SetupStep.tsx:61-62` skriver
`mode === 'stableford' || mode === 'modified_stableford'` for hånd, i stedet for den delte
`isStablefordFamily` som fiksen ellers ruter alt gjennom. Korrekt i dag. Vokser den delte familien,
forsvinner «Alene/Par»-chippene stille for det nye medlemmet. Ingen test.

### N5 — INFO. Den strukturelle vakten er et supplement, ikke en vakt

`native/app/src/lib/wizardPayload.test.ts:417` matcher bare named-import-syntaks i en hardkodet
to-fils-liste. Den ser ikke en namespace-import, en `require`, en ny fil — eller en inline
re-implementasjon: **min M6b-mutant passerte den glatt.** Det er TZ-pinningen + payload-påstanden
som faktisk vokter. Regexen er verken for streng eller for løs for det den er; bare ikke len deg på
den alene. (Den forbyr også `import type`, som er harmløst — bagatell.)

### N6 — INFO. Runbooken nevner ikke pinningen som gjør vakten ekte

`docs/native/app-spike.md:537-538` sier fortsatt bare «Regresjonsvakten prøver begge sider av
sommertid-skiftet». Det er nå SANT (jeg beviste begge sider), men den bærende delen —
`process.env.TZ = 'UTC'` i `jest.config.js` — står ikke der. Flytter noen suiten eller fjerner
pinningen, forsvinner vakten stille (bortsett fra det den strukturelle sjekken fanger, jf. N5).
Én setning i runbooken lukker det.

### N7 — INFO, prosess. `d3928166` bundler F1–F6 i én commit

Meldingen beskriver bare F1, og commiten rører i tillegg kontrakten. Svakere atomisk disiplin enn
repoet ber om. Byggeren har alt bokført dette selv i runde-fila — nevnt her kun for fullstendighet.

*Bagatell, ikke et funn:* `native/app/src/data/formatCatalog.ts:131-132` har en dobbel tomlinje
igjen etter F4-slettingen.

---

## Det jeg ikke kunne verifisere

- **At Wolf-raden ble produsert ved å GÅ lekkasje-reproen** (Stableford → Par → Tilbake → Wolf) og
  ikke bare ved å velge Wolf direkte. Raden er beviselig etter-fiks og har alle de riktige
  egenskapene, men databasen kan ikke skille de to UI-veiene. Jeg dekket hullet på min side ved å
  kjøre hele reproen gjennom den ekte skjermen i en render-probe — den gir «Wolf», tre spillere,
  ingen lag-grid.
- **At `/games/<id>` faktisk åpner i webben** for de app-opprettede radene. Byggeren rapporterer
  HTTP 200 i prod-server-modus + riktig tee-off-tekst; jeg re-kjørte det ikke. Indirekte dekning er
  sterk (kolonneparitet + delt bygger).
- **Fysisk iPhone, simulator-skjermbilder og `xcodebuild`.** Ikke i mitt portsett.
- **CI-dekning for native-suiten.** Fortsatt ingen workflow som kjører `native/app`-testene
  (bokført som #1861). Vakten fra F2 er derfor fortsatt bare så sterk som den lokale kjøringen —
  men den er nå deterministisk (UTC) uansett hvem som kjører den.

---

## Anbefaling

**ACCEPT.** Begge de blokkerende funnene fra runde 1 er lukket med tester jeg selv har brutt koden
for å bevise. Alle sju porter er grønne med de tallene kontrakten krever, rot-vitest er nøyaktig
baseline, og diffen rører ingenting utenfor `native/`, `docs/` og `.forge/`.

Før merge bør N1–N4 opprettes som oppfølger-issues (repoets egen regel for evaluator-funn som ikke
lander i samme PR). N1+N2 er ett issue og én assertion; N3 er én linje; N4 er en import. Ingen av
dem er en levende feil for arrangøren i dag.
