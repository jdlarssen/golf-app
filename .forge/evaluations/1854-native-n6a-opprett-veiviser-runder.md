# Evaluation: #1854 — Native N6a: opprett-veiviser i appen

**Builder:** hovedchat (Opus) + to Opus-bygge-subagenter
**Evaluator:** Opus, fersk kontekst
**Contract:** `.forge/contracts/1854-native-n6a-opprett-veiviser.md` (lå allerede på main,
drift-verifisert mot HEAD før første kodelinje)
**Branch:** `claude/n6a-opprett-veiviser-native` fra `origin/main@de966161`
**PR:** #1860

## Runde 0 — drift-verifisering av kontrakten

Alle kontraktens påstander kontrollert mot HEAD før bygging. **Fire var feil**, og to
presiseringer endret byggeplanen vesentlig. Full tabell i kontraktens
«Drift-verifisering»-seksjon (commit `7ff018fe`).

| Funn | Konsekvens |
| --- | --- |
| `formats` har INGEN navne-kolonne | Etikettene kan ikke komme fra DB. Speiles lokalt + paritetstest mot `messages/no.json`, som #1850 |
| `format_intent_mapping` nøkles på `format_slug`, ikke `game_mode` | Spørringen rettet |
| `useGameFormState.ts` ligger ikke i `lib/wizard/` | Verdiene stemte, stien ikke |
| «Formatvalg re-valideres når rosteret endres» finnes ikke | Appen speiler webbens faktiske semantikk (gate ved publisering), ikke en strengere watcher |
| **Metro kunne ikke resolve `zod`** fra delt `prizes.ts` — `expo export` rødt mens jest var grønt | `resolver.nodeModulesPaths` + `zod` som ekte dep. Ny regel: bare-importer fra delt graf MÅ være deklarert dep i `native/app` (`b08004f0`) |
| `getFormatsForIntent`/`validateGameMode` er hard `server-only` | Kan ikke importeres; appen leser tabellene direkte under RLS |

## Runde 1 — bygg → porter → staging → evaluator

### Endringer

| Fil | Endring |
| --- | --- |
| `native/app/metro.config.js`, `package.json` | `resolver.nodeModulesPaths`; `zod` + `@react-native-community/datetimepicker` som deps |
| `src/lib/wizardFormData.ts` (ny) | Map-basert FormData-shim med `get()` — alt den delte byggeren bruker |
| `src/lib/wizardPayload.ts` (ny, +test) | `GameDraft` → webbens feltnavn; delt `buildGameInsertPayload` dømmer |
| `src/lib/appFormats.ts` (ny, +paritetstest) | De 8 modiene + speilede etiketter, låst mot `messages/no.json` |
| `src/lib/rosterLimits.ts` (ny, +test) | Spillertak per modus, speilet fra byggerens slot-tellinger |
| `src/lib/createGameCopy.ts` (ny, +test) | Typet feilkode → norsk setning, uttømmende switch |
| `src/data/formatCatalog.ts` (ny, +test) | RLS-lesing av `formats` + intent-mapping; kaster ved feil |
| `src/data/createGame.ts` (ny, +test) | Kandidater/baner + publiseringsflyten m/ kompenserende sletting |
| `src/screens/CreateGame.tsx` (ny, +1 render-test) + `components/create/*` | Veiviseren, fem steg i én skjerm |
| `src/theme.ts` | `input`- og `label`-token i begge paletter |
| `src/navigation.tsx`, `src/screens/Home.tsx` | Ruta + «Opprett spill»-CTA |
| `docs/native/app-spike.md` | +98 linjer runbook |

### Feil funnet under staging-kjøring (ikke av testene)

**Tee-off lagret én time feil.** Pickeren viste 23:00, DB fikk 22:00Z (= Oslo 00:00).
Årsak: veien gikk om en veggklokke-streng inn i webbens `parseOsloDateTimeLocal`, som
velger sommer-/vintertid ved å STRENG-SAMMENLIGNE `Intl`-utdata mot `'GMT+2'` — en
sammenligning som ikke slår til under Hermes. Appen bruker nå pickerens absolutte
øyeblikk (`87eef602`). Webben er urørt; den MÅ gå om veggklokke fordi
`<input type="datetime-local">` ikke har tidssone.

## Runde 2 — evaluator: NEEDS WORK, to reelle funn

Evaluatoren kjørte alle porter selv, mutasjonstestet sju påstander og leste DB-radene.
Fem mutasjoner gikk røde som lovet (accepted_at, kompenserende delete, trap 2-vakten,
`APP_SUPPORTED_MODES`, etikett-paritet, wolf-uten-lag, roster-taket). To ting holdt ikke:

| # | Funn | Fiks |
| --- | --- | --- |
| **F1** | **`stablefordTeamSize` lakk på tvers av format-bytte.** Stableford → «Par» → Tilbake → Wolf: regelen spurte «er team_size 2?» UTEN å spørre hvilket format. Wolf/skins/BBB trodde de var lag-modi, `orderedSlots` droppet alle spillere uten lagtildeling, og payloaden ble TOM — publisering døde med «Formatet trenger flere spillere» mens tre spillere sto valgt. Feltet har ingen UI utenfor stableford-familien, så arrangøren kunne ikke angre | `isParStableford` — ÉTT hjem, spør om modusen via delt `isStablefordFamily`. Format-bytte nullstiller hele `setup`. 9 tester røde på den gamle regelen (`d3928166`) |
| **F2** | **Tee-off-vakten voktet ingenting.** Assertionen var en identitet under `TZ=Europe/Oslo`; evaluatoren gjeninnførte hele feilen og alle 499 testene forble grønne | `jest.config.js` pinner `TZ=UTC`; vakten går nå gjennom den EKTE payload-veien til `scheduled_tee_off_at`; strukturell sjekk forbyr importen uansett sone. 3 tester røde på mutanten (`d3928166`) |
| F3 | Best ball-flight for lag 3–4 uprøvd | Test lagt til |
| F4 | `catalogForPlayerCount` var død kode med tester | Fjernet |
| F5 | JSDoc påsto `users.gender` er `'M'\|'D'\|'J'`; enumen er `mens\|ladies`. Koden var riktig, dokumentasjonen ville ledet neste leser til å bryte den | Rettet, med advarsel |
| F6 | Drift-tabellen sa `zod@^4.4.3`, faktisk `^4.5.4` | Rettet |

⚠️ `d3928166` bundler F1–F6 i én commit, men meldingen beskriver bare F1. Svakere
atomisk commit-disiplin enn repoet ber om; kan ikke amendes, så det står her i stedet.

### Suksesskriterier — verifisert

| # | Kriterium | Bevis | Resultat |
| --- | --- | --- | --- |
| 1 | Jest-låst payload-paritet, 8 modi | 35 suiter / 511 tester, exit 0. Egen test mater byggeren et rått `{get}`-objekt og krever identisk payload | PASS |
| 2 | Ende-til-ende på staging | `+N6a+side`: `scheduled`, riktig `mode_config`, side 1 LD + 1 CTP, `accepted_at` kun for arrangøren, alle kolonner mot `actions.ts:238-277`. Åpner i web (prod-server-modus): HTTP 200, ingen error-boundary, «TEE-OFF 23:00 · man. 31. aug» | PASS |
| 3 | Lag-modus + wolf | Best ball: `team_number` 1/1/2/2, `flight` 1. Wolf: `team_number` NULL, ingen lag-UI. **Etter F1-fiksen re-verifisert med selve lekkasje-reproen på enhet: wolf publiserte med 3 spillere og 0 team_number** | PASS |
| 4 | Format-gaten | Nøyaktig de 8 modiene fra ekte DB-lesing, hver med spillerkrav. Fetch-feil → ærlig note (jest) | PASS |
| 5 | Guardrail | Kompenserende delete, 0-rads-fella, `42501`, tee-off i fortid — alle jest-låst, alle mutasjons-røde | PASS |
| 6 | Web uendret | `npx vitest run` 522/7028 = baseline. Web-diff utenfor `native/`/`docs/`/`.forge/` = 0 filer | PASS |
| 7 | Porter + runbook | Alle syv grønne + iOS Release ×4. Runbook skrevet. **Eier-tapptest på fysisk iPhone gjenstår** | PASS (m/ gap) |

### Porter

| Port | Resultat |
| --- | --- |
| `npx jest` (native/app) | exit 0 — 35 suiter, 511 tester |
| `npx tsc --noEmit` (native/app) | exit 0 |
| `npx expo export --platform ios` | exit 0 |
| `npm run typecheck` (rot) | exit 0 |
| `npx vitest run` (rot) | exit 0 — 522/7028 = baseline |
| `npx eslint native/app` | exit 0 |
| `npm run build` (rot, pipefail) | exit 0 |
| `xcodebuild` Release | `** BUILD SUCCEEDED **` ×4 |
| CI på PR #1860 | verify, e2e, scan, Vercel — alle pass |

### Restanser

- **#1858** — webbens feiltekster i opprett-veiviseren navngir feil spillform (funnet her, gjelder nettsiden).
- **#1859** — appen kan ikke velge tee-sett per spiller; junior utilgjengelig.
- **#1861** — appens testsuite kjører ikke i CI. Begge feilene over overlevde nettopp fordi en port manglet eller ikke bet.
- Eier-tapptest på fysisk iPhone.
- Produktvalg til eieren i PR-en: format-stegets form (flat liste vs. intensjons-steg vs. filtrert).

### Verifiseringsgap

- Evaluatoren re-kjørte ikke web-åpningen av `/games/[id]`, simulator-skjermbildene eller
  `xcodebuild`. Hovedchatten gjorde alle tre.
- RN `Switch` tar ikke imot injiserte tapp fra simulator-verktøyet (dra i stedet); knappe-raden
  må treffes rundt y≈835 i punktrommet, ikke der en naiv skjermbilde-brøk peker. Bokført i runbooken.
