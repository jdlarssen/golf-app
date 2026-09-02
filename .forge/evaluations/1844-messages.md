# Evaluering — #1844 «Splitt WEB_ONLY_RESULT_MESSAGE i tre meldinger»

**Branch:** `claude/contract-1844-messages-e3156a` · **Commit:** `cb1516cb` · **PR:** #1924 (draft)
**Kontrakt:** issue #1844, kommentar `5486146679`
**Evaluert:** 2026-09-02, uavhengig kjøring av alle porter i worktreet.

## Verdict: ACCEPT

Alle fire porter er grønne i min egen kjøring, begge suksesskriteriene er oppfylt, samtlige
edge-case-krav er innfridd, ingen forbudte filer er rørt. Funnene under er dokumentasjons-
og copy-nivå — ingen av dem er en regresjon eller en brukersynlig feil, og ingen av dem
er en betingelse i kontrakten.

---

## Gate-resultater (kjørt av meg, ikke byggerens tall)

Alle kjørt fra `<worktree>/native/app` med Node v22.23.0 (`source ~/.nvm/nvm.sh && nvm use 22`).

| Gate | Kommando | Exit | Utdrag |
|---|---|---|---|
| Typer | `npx tsc --noEmit` | **0** | ingen utdata |
| Tester | `npx jest` | **0** | `Test Suites: 47 passed, 47 total` / `Tests: 762 passed, 762 total` |
| Lint | `npx eslint src` | **0** | kun Next.js-`no-html-link-for-pages`-notisen (ikke en feil, ikke en warning i tellingen) |
| Bundle | `npx expo export --platform ios` | **0** | `ios bundles (1): _expo/static/js/ios/index-e2cb3358….hbc (3.9MB)` · `Exported: dist` |

`rm -rf dist` kjørt etterpå; `git status --porcelain` er tomt — arbeidstreet er rent.

Målrettet kjøring av den berørte fila (`npx jest src/screens/Leaderboard.test.tsx --verbose`), exit 0:

```
✓ henviser til nettsiden for et gatet format, uten å røre motoren (2 ms)
✓ sier at oppsettet mangler — ikke at formatet finnes på nettsiden (1 ms)
✓ sier rolig fra i stedet for å krasje på en ukjent resultatform (2 ms)
Tests: 9 passed, 9 total
```

**Ikke verifisert av meg:** PR-teksten oppgir også «pre-push-gaten (7290 web-tester)». Den lå
utenfor portene jeg ble bedt om å kjøre. Diffen rører ingen web-fil, så risikoen er lav, men
tallet er byggerens, ikke mitt.

---

## Kriterium for kriterium

### SK1 — `npx tsc --noEmit` og `npx jest` grønne
**PASS.** Exit 0 på begge, se tabellen over. I tillegg grønn på `eslint src` og
`expo export --platform ios`, som eieren la til.

### SK2a — de tre tilfellene gir tre ULIKE meldinger
**PASS.** Jeg sporet hver av dem fra trigger til rendret `CalmNote`:

| # | Trigger | Vei | Tekst | testID |
|---|---|---|---|---|
| 1 | `gateReason(game) !== null` — `'mode'` (patsome), `'segment'` (delrunde), `'derived'` (avledet) — `lib/formatGate.ts:55–60` | `Leaderboard.tsx:194–196` | `gateMessage(gate)` → «Dette formatet føres på nettsiden ennå.» / «Denne runden føres på nettsiden ennå.» (`formatGate.ts:72–76`) | `leaderboard-gated-format` |
| 2a | motoren sender en `kind` appen ikke kjenner | `ResultView.tsx:325–336` (default-grenen, bak `never`-vakten) | «Appen kjenner ikke dette formatet ennå.» (`ResultView.tsx:37`) | `leaderboard-unknown-format` |
| 2b | `games.game_mode` utenfor `KNOWN_MODES` (`scoringContext.ts:135–164`) → `'unknown-mode'` | `Leaderboard.tsx:222–228` via `PROBLEM_MESSAGES` | samme konstant | `leaderboard-unknown-format` (`Leaderboard.tsx:102`) |
| 3 | `mode_config` mangler / `kind` ≠ `game_mode` → `'missing-config'` | `Leaderboard.tsx:222–228` | «Formatet er ikke satt opp for denne runden.» (`Leaderboard.tsx:87`) | `leaderboard-missing-config` (`Leaderboard.tsx:103`) |

Tre distinkte strenger, ingen overlapp. Alle tre er nåbare: gate-grenen kjører først, og
`'patsome'` er den eneste gatede moden, så et ukjent `game_mode` eller en manglende
`mode_config` på et vanlig `'full'`-spill uten `source_game_id` faller gjennom til
adapter-grenen som forutsatt. Testen `sier at oppsettet mangler` beviser tilfelle 3
ende-til-ende og asserterer eksplisitt at gate-grenen IKKE ble tatt.

### SK2b — grepen leser rent
**PASS.**

```
$ grep -rn "WEB_ONLY_RESULT_MESSAGE|leaderboard-web-only" native/app/ --exclude-dir=node_modules
exit=1   (ingen treff)
```

Repo-vidt (utenom `node_modules`/`.git`) finnes navnet kun i to historiske linjer i
`.forge/contracts/1832-native-wolf-bbb-valg-ui.md` (linje 32 og 305) — et arkivert
kontraktdokument som beskriver fortiden, ikke kode. Riktig å la stå.

### EC1 — gate-grenen bruker `gateMessage(gateReason(game))`, ikke én fast konstant
**PASS.** `Leaderboard.tsx:194–195`: `const gate = gateReason(game); if (gate !== null) return <CalmNote text={gateMessage(gate)} …>`.
Dekker alle tre `GateReason`-ene. `formatGate.test.ts:66–68` låser de to ordlydene, og
`GameHome.tsx:266` bruker samme `gateMessage` — føring-CTA-en og resultatflaten kan ikke drive fra hverandre.

### EC2 — testID utledet per `outcome.problem` på det delte kallstedet
**PASS.** `PROBLEM_TEST_IDS: Record<ScoringContextProblem, string>` (`Leaderboard.tsx:101–107`)
brukes på kallstedet (`Leaderboard.tsx:226`). Typen er `Record` over unionen, så `tsc`
håndhever uttømmelighet — en sjette `ScoringContextProblem` vil ikke kompilere før den har
både melding og testID. Ingen testID-skrivefeil: `PROBLEM_TEST_IDS['unknown-mode']` og
`ResultView.tsx:332` er tegn for tegn samme streng.

### EC3 — tekstene for `missing-choices` / `no-course` / `no-players` urørt
**PASS.** Diffen rører kun de to første radene i `PROBLEM_MESSAGES`; de tre andre står
uendret på `Leaderboard.tsx:88–93`.

### EC4 — kommentaren i `SideTournamentSection.tsx:23` oppdatert
**PASS.** Peker nå på `GATED_FORMAT_RESULT_MESSAGE`. Symbolet finnes (`ResultView.tsx:28`),
så referansen er ikke død.

### EC5 — eksisterende tester oppdatert, ingen tester utover det splitten krever
**PASS.** Begge de gamle assertene er flyttet til de nye testID-ene/strengene. Én ny test
lagt til (`sier at oppsettet mangler …`) — den er nødvendig, for uten den finnes det ingen
dekning for det tredje tilfellet, som er selve leveransen. Ingen andre nye tester.

### Eierens tilleggsinstrukser
- **Tilfelle 2 og 3 nevner ikke nettsiden** — **PASS**, verifisert på strengnivå.
- **Tilfelle 1 beholder «på nettsiden ennå» ordrett** — **PASS**: begge `gateMessage`-variantene inneholder frasen ordrett.
- **Egen eksportert konstant + egen testID for tilfelle 1** — **PASS med forbehold**, se Funn 1.
- **Kun copy + konstant/testID-splitt, ingen logikkendring** — **PASS**. Eneste kontrollflyt-endring er at `gateReason(game)` bindes til en variabel før den gjenbrukes i `gateMessage(gate)`. Samme predikat, samme rekkefølge.
- **Forbudte filer** — **PASS**. `git diff --name-only origin/main...HEAD` gir nøyaktig fire filer: `ResultView.tsx`, `SideTournamentSection.tsx`, `Leaderboard.test.tsx`, `Leaderboard.tsx`. Ingen av `EndGame.tsx`, `endGameCopy.ts`, `OrganiserSection.tsx`, `Scorecard.tsx`.
- **`[no-changelog]`** — **PASS**. Etablert konvensjon for `native/app`: samtlige seks siste `feat(native)`/`fix(native)`-commits jeg sjekket (`e21358d2`, `fd61a761`, `c9a73aaf`, `f4e85328`, `43042d37`, `175b5568`) bruker den og har ingen `.changes/`-notat.

---

## Funn

### 1. `GATED_FORMAT_RESULT_MESSAGE` er nå bare nåbar fra en gren koden selv kaller unåbar — og JSDoc-en beskriver en rolle konstanten ikke lenger har
`native/app/src/components/leaderboard/ResultView.tsx:19–28` (doc) og `:313–322` (eneste bruk)

Konstantens ENESTE brukssted er `case 'patsome'` i `ResultView`, og kommentaren rett over
den (`:314–315`) sier selv «Gatet i `formatGate` — kan ikke nås fra appen». Jeg bekreftet med
grep at det ikke finnes noe annet brukssted: `ResultView` kalles kun fra `Leaderboard.tsx:270`,
altså etter gate-grenen som returnerer tidlig for nettopp `'patsome'`. Teksten «Formatet vises
på nettsiden ennå.» kan dermed ikke nå en spiller i dag.

Samtidig sier JSDoc-en over konstanten at den er «Teksten for et format som er STENGT i appen
med vilje (`formatGate`)» og at ordlyden er delt «så føring-CTA-en og resultatflaten ikke lover
to ulike ting». Begge påstandene gjelder nå `gateMessage`, ikke denne konstanten — og de to
strengene er faktisk ikke like: «Formatet **vises** på nettsiden ennå.» mot «Dette formatet
**føres** på nettsiden ennå.» (vises = kan ses der, føres = tastes inn der — ulikt løfte).

**Feilscenario:** #1891 skal feste «Åpne runden på nettsiden»-knappen på tilfelle 1. En
utvikler leser JSDoc-en, finner `GATED_FORMAT_RESULT_MESSAGE`, endrer/utvider teksten der og
tester — ingenting skjer på skjermen, fordi den gatede runden rendres av `gateMessage`.
Alternativt: noen «rydder» ordlyden i konstanten og tror de har endret gate-teksten.

**Merk:** dette er ikke byggerens feil alene — det er den innebygde spenningen mellom eierens
krav om «egen eksportert konstant» og kontraktens edge case om `gateMessage`. Splitten er løst
riktig for #1891 (testID-en `leaderboard-gated-format` sitter på den NÅBARE grenen, som er det
knappen trenger), men JSDoc-en burde si at konstanten er fallskjermen for en framtidig
åpning av patsome, ikke den levende gate-teksten. Ren dokumentasjonsretting, ingen kodeendring.

### 2. «Formatet er ikke satt opp for denne runden.» lover en handling brukeren ikke kan gjøre
`native/app/src/screens/Leaderboard.tsx:87`

Copyen er rolig, korrekt bokmål, skylder ikke på spilleren, og har god parallellitet med
søsteren `'no-course': 'Banen er ikke satt for denne runden ennå.'` (`:92`). Voice-presedens
finnes: `wolfHole.ts:147` bruker samme mønster. Så på ren språkkvalitet: godkjent.

Innvendingen er handlingsrom. De tre søsknene peker alle mot noe arrangøren kan fikse — sett
banen, meld på spillere, kom på nett igjen. `missing-config` er derimot en datadefekt
(`mode_config` mangler eller har `kind` ≠ `game_mode`, `scoringContext.ts:54–56`) som ingen
UI-flate lar arrangøren rette. «… er ikke satt opp» leser som «noen glemte et steg i
veiviseren», og arrangøren vil lete etter det steget forgjeves.

**Feilscenario:** arrangør ser meldingen, går inn i runde-innstillingene for å «sette opp
formatet», finner ingen slik knapp, og melder inn en bug om en manglende innstilling.

Byggeren flagget selv den analoge blindveien for tilfelle 2 i PR-ens ulemper-blokk, men ikke
denne. Formuleringer som lukker gapet uten å bli tekniske: «Vi får ikke lest oppsettet for
denne runden.» eller «Noe mangler i oppsettet for denne runden.» Dette er en produkt-/copy-
vurdering for eieren, ikke et kontraktbrudd.

### 3. `leaderboard-gated-format` dekker to rendringssteder med ulik tekst
`native/app/src/screens/Leaderboard.tsx:195` og `native/app/src/components/leaderboard/ResultView.tsx:319`

Samme testID, to ulike strenger. I praksis ufarlig i dag, siden det andre stedet er unåbart
(Funn 1), men hvis patsome en dag slippes ut av gaten blir testID-en `…-gated-format` sittende
på et format som per definisjon ikke lenger er gatet — og #1891-knappen ville da dukket opp på
en flate der «Åpne runden på nettsiden» kanskje ikke er ønsket svar. Lav alvorlighet, verdt en
linje i #1891.

### 4. `PROBLEM_TEST_IDS['unknown-mode']` har ingen test
`native/app/src/screens/Leaderboard.tsx:102`

Den eneste testen som asserterer `leaderboard-unknown-format` (`Leaderboard.test.tsx:373`)
går via `ResultView`s default-gren, ikke via adapterens `'unknown-mode'`. Konsekvensen er
minimal — `Record<ScoringContextProblem, string>` gjør oppføringen obligatorisk, og strengen
er en literal ved siden av sin tvilling — og kontrakten sa uttrykkelig «ingen nye tester
utover det splitten krever». Rapportert som opplysning, ikke som mangel.

### Ting jeg lette etter og IKKE fant
Ingen testID-skrivefeil. Ingen ubrukte importer (`gateMessage`, `gateReason`,
`UNKNOWN_FORMAT_RESULT_MESSAGE`, `CalmNote` er alle i bruk; `eslint` og `tsc` er grønne).
Ingen `Record` som har mistet uttømmeligheten. Ingen gren som ble unåbar av denne endringen
(`case 'patsome'` var like unåbar før). Ingen død kode utover Funn 1. Ingen motstridende
melding i samme flyt: `Scorecard.tsx:113` og `Hole.tsx:164/172` kaller riktignok
`computeGameLeaderboard`, men leser aldri `.problem` og viser ingen konkurrerende tekst, og
`GameHome.tsx:266` bruker samme `gateMessage`. JSDoc-en over `PROBLEM_MESSAGES`
(«INGEN av dem nevner nettsiden») stemmer — jeg sjekket alle fem strengene.
Den nye testen asserterer noe reelt: uten splitten kunne den ikke skilt tilfelle 3 fra
gate-grenen, og `queryByTestId('leaderboard-gated-format')).toBeNull()` er nettopp den
regresjonsvakten.

---

## Byggerens erklærte avvik fra kontrakten

Byggeren skriver i PR #1924: kontrakten sier «tre konstanter», men tilfelle 3
(`missing-config`) fikk teksten sin inline i `PROBLEM_MESSAGES` som sine tre søsken — altså
to eksporterte konstanter pluss én `Record`-oppføring.

**Vurdering: akseptabelt, og det bedre valget.** «Tre konstanter» sto i kontraktens
*Design*-avsnitt, ikke i Success Criteria. Kriteriet er ordrett «De tre tilfellene gir tre
ulike meldinger med hver sin testID» — det er oppfylt uavhengig av hvor den tredje strengen
bor. `missing-config`-teksten har nøyaktig ett rendringssted og ingen ekstern konsument, akkurat
som `'no-course'` og `'no-players'`; å eksportere den fra `ResultView.tsx` ville flyttet en
melding som bare `Leaderboard.tsx` bruker inn i en annen fil, og brutt symmetrien i tabellen
den bor i. De to som ER eksportert har hver sin grunn: `UNKNOWN_FORMAT_RESULT_MESSAGE` fordi
den deles av to filer (`ResultView`s default-gren og `Leaderboard`s `unknown-mode`), og
`GATED_FORMAT_RESULT_MESSAGE` fordi eieren ba om den eksplisitt for #1891.

Avviket er erklært åpent i PR-teksten, slik disiplinen krever. Ingen innvending.
