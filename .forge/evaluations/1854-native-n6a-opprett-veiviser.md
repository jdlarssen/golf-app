# Evaluering: #1854 — Native N6a, opprett-veiviser i appen

**Verdict: NEEDS WORK**

Evaluert 2026-08-31 mot `claude/n6a-opprett-veiviser-native` @ `963c9455`, base `origin/main` @ `de966161`.
Alle porter kjørt på nytt lokalt. Alle DB-påstander verifisert med egne spørringer mot staging
(`snwmueecmfqqdurxedxv`, read-only). 11 mutasjonsprober kjørt. Arbeidstreet er tilbakestilt og rent.

Byggingen er gjennomarbeidet, og de fleste påstandene holder eksakt. To ting stopper en ACCEPT:

1. **En funksjonell feil som bryter kriterium 3 direkte** (F1): en lekket `stablefordTeamSize`
   gir wolf/skins/BBB et lag-UI de ikke skal ha, og TØMMER spillerlista i payloaden.
2. **En regresjonsvakt som ikke vokter** (F2): kontrakten, testkommentaren og runbooken hevder
   alle at tee-off-testen fanger en gjeninnført Oslo-konvertering. Den gjør den ikke — mutanten
   er grønn på nøyaktig den maskinen alt bevis ble produsert på.

---

## Kriterier

| # | Kriterium | Min uavhengige evidens | Dom |
|---|---|---|---|
| 1 | Jest-låst payload-paritet, 8 modi, `kind`, accepted_at, kompenserende delete, tee-off i fortid | `npx jest` 35/35 suiter, 499/499, exit 0. Mutasjon M1 (accepted_at), M2 (kompensasjon), M3b (expectAffected/trap 2), M4 (mode-gate), M5 (etikett), M7 (wolf-lag), M8 (spillertak) → alle RØDE. `rosterLimits.test.ts:68` kjører den DELTE byggeren på cap og cap+1 — ekte kobling, ikke gjentatt konstant | PASS |
| 2 | Ende-til-ende staging: stableford + 2 medspillere + side (1 LD/1 CTP), `scheduled`, `mode_config`, `accepted_at` null for andre, åpner i web | Egen SQL: `51780e73` = `status='scheduled'`, `mode_config {"kind":"stableford","team_size":1,"points_table":"standard"}`, `side_tournament_enabled=t`, `ld=1`, `ctp=1`, `disabled_categories=[]`, 3 game_players, `accepted_at` satt KUN for `created_by`. Alle 22 games-kolonner webben skriver er verifisert mot `actions.ts:238-277`; resten står på DB-default akkurat som på web. Web-åpningen er IKKE re-kjørt av meg (se «Kunne ikke verifisere») | PASS (m/ gap) |
| 3 | Lag-modus gir riktig `team_number`; wolf får INGEN lag-UI og ingen `team_number` | SQL: `e092565e` team 1,1,2,2 / flight 1,1,1,1 — identisk med webbens `teamDefaultFlight` (lag 1+2 → flight 1). `d2c39cbe` wolf: `team_number` null på alle 3. **MEN** wolf får et 4-slots lag-UI og tom spillerliste på en reachable sti — se F1 | **FAIL** |
| 4 | Veiviseren viser nøyaktig de 8 modiene; fetch-feil gir ærlig note | Egen SQL mot staging: alle 8 slugs `is_active=true` med ≥1 `is_visible`-mapping → katalogen gir nøyaktig 8. Etikett-paritet mot `messages/no.json` verifisert av meg direkte, 8/8 tegn-for-tegn. `FORMAT_CATALOG_FETCH_NOTE` er wired i `FormatStep.tsx:48`; fetch kaster ved feil | PASS |
| 5 | Dobbel-trykk-lås + RLS-avvisning → games-rad kompensert bort | `SummaryStep.tsx:74` `disabled={busy \|\| !canPublish}` + `busy`-guard i `publish()`. M2 (fjernet kompensasjon) → 4 tester røde. M3b (0 rader = suksess) → 2 tester røde. `rls_denied` (42501) og `no_rows` har egne koder og egen norsk copy | PASS |
| 6 | Web uendret; rot-vitest identisk med baseline | `npx vitest run` → **522 filer / 7028 tester, exit 0** — eksakt som påstått. `git diff --name-only origin/main...HEAD` utenfor `native/`/`docs/`/`.forge/` = **0 filer**. Rot-`package.json` urørt | PASS |
| 7 | Alle porter grønne + runbook-seksjon | Alle 7 porter kjørt av meg, alle exit 0 (tabell under). Runbook `docs/native/app-spike.md:490` dekker arkitektur, shim, Metro-fella, Oslo-fella, medspiller-begrensningen, pod-oppskrift, verifiseringsresept. Runbooken gjentar den uriktige påstanden fra F2 | PASS (m/ F2-forbehold) |

---

## Porter (mine egne kjøringer, Node 22)

| Port | Resultat | Tall |
|---|---|---|
| `npx jest` (native/app) | exit 0 | 35 suiter, 499 tester |
| `npx tsc --noEmit` (native/app) | exit 0 | — |
| `npx expo export --platform ios` | exit 0 | `dist/` slettet etterpå |
| `npm run typecheck` (rot) | exit 0 | — |
| `npx vitest run` (rot) | exit 0 | 522 filer / 7028 tester = baseline |
| `npx eslint native/app` | exit 0 | — |
| `npm run build` (rot, pipefail) | exit 0 | — |
| `git diff --name-only origin/main...HEAD` utenfor native/docs/forge | 0 filer | 30 filer totalt |

Nye deps: nøyaktig de to kontrakten tillot (`@react-native-community/datetimepicker@9.1.0`, `zod`).
Ingen `lib/`-endring. `theme.ts` fikk kun de to tokenene (`label`, `input`) drift-tabellen ba om.

---

## Mutasjonsprober

| # | Hva jeg brøt | Test rød? | Konklusjon |
|---|---|---|---|
| M1 | `accepted_at: acceptedAtForActor(...)` → alltid `now()` | JA (1) | Self-vs-andre-regelen er låst |
| M2 | Fjernet kompenserende DELETE (returnerte falsk suksess) | JA (4) | #737-rollbacken er låst |
| M3b | `expectAffected` → godtar 0 rader | JA (2) | Trap 2-vernet er ekte |
| M4 | Byttet `skins` → `nassau` i `APP_SUPPORTED_MODES` | JA (7, 4 suiter) | Format-gaten er låst |
| M5 | Etikett `Best ball` → `Bestball` | JA (1) | `no.json`-pariteten er låst |
| M7 | La `wolf` inn i `MODES_WITH_TEAM_ASSIGNMENT` | JA (8, 3 suiter) | Wolf-uten-lag er låst |
| M8 | `skins` cap 16 → 17 | JA (1) | Spillertaket er koblet til den delte byggeren |
| **M6** | **Gjeninnførte veggklokke → `parseOsloDateTimeLocal` i `teeOffInstant`** | **NEI — 499/499 grønne** | **F2: vakten vokter ikke (Oslo-TZ)** |
| M6b | Samme mutant under `TZ=UTC` | JA (2) | Vakten er TZ-avhengig, ikke DST-bevisst |
| **M9** | **`bestBallDefaultFlight` → alltid `1` (lag 3/4 mister flight 2)** | **NEI — 499/499 grønne** | **F3: uvoktet gren** |
| Metro | Fjernet `resolver.nodeModulesPaths` | `expo export` exit 1 «Unable to resolve module zod from lib/games/prizes.ts»; `jest` 499/499 GRØNN | Byggerens Metro-påstand er eksakt riktig |

Kontroll: ren kode under `TZ=UTC` og `TZ=America/New_York` → 499/499. Suiten er ellers TZ-robust.
Etter alle prober: `git status --porcelain` tom, HEAD uendret, jest 499/499.

---

## Funn

### F1 — ALVORLIG. `stablefordTeamSize` lekker over format-bytte: wolf/skins/BBB får lag-UI og TOM spillerliste

Bryter kriterium 3 («et wolf-spill opprettes UTEN lag-UI») på en sti arrangøren lett treffer.

**Årsak — regelen leses uten å se på modusen:**
- `native/app/src/lib/wizardPayload.ts:129-132` — `draftNeedsTeamAssignment` returnerer true på
  `draft.setup?.stablefordTeamSize === 2` uansett `gameMode`.
- `native/app/src/lib/rosterLimits.ts:106-114` — `teamLayoutFor(mode, parStableford)` faller
  gjennom til `if (parStableford) return { slots: 4, noun: 'lag' }` for ENHVER modus.
- `native/app/src/screens/CreateGame.tsx:189-199` — `selectMode` nullstiller `picked[].teamNumber`
  og navnet, men **aldri `setup`**.
- `native/app/src/components/create/SetupStep.tsx:61-62,83` — team-size-kontrollen rendres kun for
  stableford-familien, så arrangøren kan ikke angre valget fra wolf-oppsettet.

**Reproduksjon:** Steg 1 velg «Stableford» → Steg 2 trykk «Par» (`create-team-size-2`) →
«Tilbake» → Steg 1 velg «Wolf». (Samme via «Modifisert Stableford».)

**Målt (jest-probe mot den ekte koden, tre spillere valgt):**

| Modus | `draftNeedsTeamAssignment` | `teamLayoutFor(mode, true)` | Slots emittert | `errorCode` |
|---|---|---|---|---|
| wolf | true | `{slots:4,noun:'lag'}` | **0 / 3** | `min_players_for_mode` |
| skins | true | `{slots:4,noun:'lag'}` | **0 / 4** | `min_players_for_mode` |
| bingo_bango_bongo | true | `{slots:4,noun:'lag'}` | **0 / 4** | `min_players_for_mode` |

**Hva arrangøren ser:** et «Lag 1–4»-rutenett på et wolf-spill (`PlayersStep.tsx:118`); en
oppsummeringsmerknad «3 spillere mangler lag og blir ikke med i runden. Gå tilbake og gi dem et
lag …» der det ikke finnes noe lag-UI å gå tilbake til for den modusen; og ved publisering
«Formatet trenger flere spillere. Legg til noen før du publiserer.» — med tre spillere valgt.
Kontraktens «ærlig feil framfor stille suksess» holder (ingen rad skrives), men meldingen er
direkte villedende og arrangøren står i en blindvei.

Ingen test dekker stien: `wizardPayload.test.ts` tester lag-dropping kun for ekte lag-modi, og
`CreateGame.test.tsx` bytter aldri format etter steg 2.

*Retning (ikke fikset, per mandat):* enten nullstill `setup` i `selectMode`, eller — bedre, siden
regelen da bare finnes ett sted — la `draftNeedsTeamAssignment` og `teamLayoutFor` ignorere
`stablefordTeamSize` med mindre modusen er i stableford-familien.

### F2 — MIDDELS. Tee-off-regresjonsvakten vokter ikke, og både kontrakt, test og runbook påstår at den gjør det

`native/app/src/lib/wizardPayload.test.ts:375-389` sier: «Datoene under er valgt paa hver sin side
av sommertid-skiftet, saa en gjeninnfoert Oslo-konvertering ville brutt minst en av dem uansett
hvilken vei den bommet.» `docs/native/app-spike.md` gjentar det («Regresjonsvakten prøver begge
sider av sommertid-skiftet»), og kontraktens Bevis-seksjon hviler på det.

**Påstanden er usann.** Jeg gjeninnførte nøyaktig den førpre-`87eef602`-stien
(`Date` → veggklokke-streng → `parseOsloDateTimeLocal`) i `teeOffInstant`. Resultat:
**499/499 grønne.** Testen `expect(teeOffInstant(picked)).toBe(picked.toISOString())` er en
identitet så lenge kjøremaskinens TZ er Europe/Oslo — og feilen var Hermes-spesifikk
(`Intl`-streng-sammenligning mot `'GMT+2'`), som Node aldri reproduserer.

Samme mutant under `TZ=UTC` faller (2 tester). Vakten biter altså bare utenfor Oslo, og:
- `jest.config.js` pinner ingen TZ; maskinen rapporterer `Europe/Oslo`.
- **`native/app`-suiten kjøres ikke av noen GitHub Actions-workflow** (sjekket `.github/workflows/`).

Den eneste maskinen suiten faktisk kjører på er altså den ene der vakten er blind. Produksjons-
koden er riktig (DB-radene bekrefter `21:00Z` = Oslo 23:00), men regresjonen er ubeskyttet.

### F3 — LAV/MIDDELS. Best-ball flight-default for lag 3–4 er verken testet eller kjørt

`native/app/src/lib/wizardPayload.ts:113-115`. Å flate `bestBallDefaultFlight` til alltid `1`
lar alle 499 tester stå grønne. Staging-beviset brukte 2 lag, så grenen lag 3/4 → flight 2 har
aldri kjørt noe sted. Koden matcher webbens `teamDefaultFlight`
(`app/[locale]/admin/games/new/useGameFormState.ts:1022-1025`) ved inspeksjon, men ingenting
holder den der — og `MAX_PLAYERS_BY_MODE.best_ball = 8` gjør 4 lag reachable fra appen.

### F4 — LAV. `catalogForPlayerCount` er død kode med tre tester

`native/app/src/data/formatCatalog.ts:144`. Eksportert og testet, men aldri kalt fra
produksjonskode — `CreateGame.tsx:293` gir `FormatStep` den ufiltrerte `formats.data`. Valget er
bevisst (antalls-gaten er flyttet til publisering, jf. drift-tabellens punkt 4), men da er
funksjonen + testene gullbelegg, og kontraktens Design §1 («`fitsPlayerCount`-filteret anvendes»)
er ikke oppfylt slik den er skrevet. Enten wire den, eller slett den og noter avviket.

### F5 — LAV. Feil JSDoc på `RosterCandidate.gender` — en felle for neste leser

`native/app/src/data/createGame.ts:59` sier «`'M' | 'D' | 'J'` fra profilen, eller null». DB-enumen
er `user_gender: 'mens' | 'ladies'` (`lib/database.types.ts:2254`), og den ekte konsumenten
`teeGenderFor` (`native/app/src/screens/CreateGame.tsx:136-138`) sammenligner riktig mot
`'ladies'`. En som stoler på JSDoc-en ville skrevet `gender === 'D'` og stille satt alle kvinner
på herretee. (Feltet `pending` og resten av mappingen er korrekt.)

### F6 — INFO. zod-versjonsavvik mot kontraktens drift-tabell

Drift-tabellen sier `zod@^4.4.3` ble lagt til; faktisk er det `zod@^4.5.4`
(`native/app/package.json`), som resolver til 4.5.4 i appen mot rotas 4.4.3. Samme major, lav
risiko, men delt `lib/games/prizes.ts` valideres nå av to ulike zod-bygg.

---

## Det som holdt (verifisert, ikke tatt på tro)

- **Metro/zod-historien er eksakt riktig.** Uten `resolver.nodeModulesPaths` feiler
  `expo export` med «Unable to resolve module zod from lib/games/prizes.ts» mens jest står
  499/499 grønn. Nøyaktig den kombinasjonen byggeren beskrev.
- **Tidssone-historien om `681ca24b` er korrekt.** SQL: `22:00 UTC` = Oslo `00:00` (dagen etter)
  for før-fiks-raden; `21:00Z` = Oslo `23:00` for de tre etter. Stemmer med fortellingen.
- **Avviket fra kriterium 2s ordlyd er skjerpende og åpent bokført.** Byggeren brukte e2e-SPILLEREN
  (`252e1a6f`, `is_admin=false`) i stedet for admin. Verifisert i DB: alle fire `created_by` er
  spilleren. Det beviser RLS-insert-stien og medspiller-subsettet, som en admin-kjøring ikke ville.
- **Kolonneparitet er fullstendig.** Alle 22 kolonnene `actions.ts:238-277` skriver er dekket, med
  samme verdier; de øvrige 16 `games`-kolonnene står på DB-default på begge sider (inkl.
  `hole_segment='full'` — webbens veiviser setter den heller ikke).
- **`mode_config` er byggerens egen output.** Best ball uten `allowance_pct` er riktig
  (`validateBestBall` emitterer `{kind, team_size, teams_count}`); `allowance_pct: 85` på
  sammenlignings-raden kommer fra cup-stien, ikke veiviseren.
- **Feilhåndteringen er ærlig.** `describeCreateGameFailure` har ingen `default` (uttømmende via
  `tsc`), `orphan_game` sier eksplisitt at raden kan stå igjen, og jeg fant ingen sti der en
  feilet skriving kan rapporteres som suksess.
- **Test-disiplin (Type C):** `CreateGame.test.tsx` har nøyaktig ÉN render-test, og den asserterer
  kobling gjennom stegene — ikke tall fra Type A. Innenfor `docs/test-discipline.md`.

---

## Kunne ikke verifisere

- **At `/games/<id>` faktisk åpner i webben** for de app-opprettede radene. Jeg re-kjørte ikke
  staging-build + innlogging. Indirekte dekning er sterk (alle kolonner og `mode_config` er
  bit-for-bit det samme settet webbens egen veiviser skriver, produsert av samme delte bygger),
  men byggerens «HTTP 200»-påstand står ubekreftet av meg. Merk at HTTP 200 uansett er svakt
  bevis i Next 16 — `notFound()` gir 200 i dev.
- **Oppførsel på fysisk iPhone.** Byggeren bokfører selv dette som gjenstående (`VERIFICATION GAP`).
- **Simulator-/UI-observasjonene** (skjermbildet av de 8 modiene i kriterium 4, «ingen lag-UI for
  wolf» i kriterium 3). Jeg verifiserte DB-halvdelen av begge og lag-UI-logikken i kode — og det
  var i kodehalvdelen F1 dukket opp, på en sti simulator-kjøringen ikke gikk.
- **`iOS Release xcodebuild`-porten.** Ikke kjørt på nytt (ikke i mitt portsett).

---

## Anbefaling

**NEEDS WORK.** F1 må fikses med en dekkende test (format-bytte etter at par er valgt), og F2 må
enten få en vakt som faktisk biter — pinn TZ i `jest.config.js`, eller test mot en stubbet
`Intl`/Hermes-oppførsel — eller så må påstanden fjernes fra test, runbook og kontrakt. F3 er en
billig test å legge til mens man først er i fila. F4/F5/F6 kan tas i samme runde eller bokføres.

Alt annet i kontrakten står seg under press.
