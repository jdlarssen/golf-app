# Evaluation: #1850 — Native sideturnering (LD/CTP + poengjakt)

**Builder:** hovedchat (Opus) + fire Opus-bygge-subagenter
**Evaluator:** Opus, fersk kontekst
**Contract:** `.forge/contracts/1850-native-sideturnering.md` (adoptert fra issue-kommentar,
drift-verifisert mot HEAD før bygging)
**Branch:** `claude/native-sideturnering-1850` fra `origin/main@38cd745d`

## Runde 0 — drift-verifisering av kontrakten

Kontrakten ble skrevet i en egen spec-økt. Alle påstander ble kontrollert mot HEAD før
første kodelinje. **Ingen påstand var feil**, men tre presiseringer endret byggeplanen:

| Funn | Konsekvens |
|---|---|
| #1833 har ikke landet — `Leaderboard.tsx:35` bruker fortsatt statiske `COLORS, ui` | Nye flater bygges mot statiske tokens, ikke `useTheme()` |
| `formatGate.ts` gater i dag KUN `patsome` | Grouping må dekke hele det åpne format-settet, ikke «de 8 Must-formatene» |
| Appen importerer delt kode med RELATIVE stier, ikke `@/`-aliaset | Husets stil følges i alle nye filer |

Bokført i kontraktens «Drift-verifisering»-seksjon (commit `079cd450`).

## Runde 1 — bygg → porter → staging → evaluator → ACCEPT

### Endringer

| Fil | Endring |
|---|---|
| `native/app/src/data/gameBundle.ts` (+test) | Fire side-kolonner gjennom `GAME_SELECT`/`GameRow`/`BundleGame`/`toBundle`; `BUNDLE_PAYLOAD_VERSION` 2 → 3 |
| `native/app/src/data/sideWinners.ts` (ny, +test) | RLS-les av `game_side_winners`; kaster ved feil så «tomt» og «vet ikke» ikke kan forveksles |
| `native/app/src/lib/sideTournament.ts` (ny, +test) | Speilet montering → delt `calculateSideTournament`; grouping utledet av delt `isSoloFormat` |
| `native/app/src/lib/sideTournamentCopy.ts` (ny, +paritetstest) | ~74 strenger speilet fra `messages/no.json`, låst av jest-paritet |
| `native/app/src/components/leaderboard/SideTournamentSection.tsx` (ny, +1 render-test) | LD/CTP-linjer + poengjakt, alle 45 kategorier, seks grupper, dense rank |
| `native/app/src/lib/useSideWinners.ts` (ny, +test) | Fokus-henting uten polling; `settled`/`neverLoaded`-tilstandsmaskin |
| `native/app/src/screens/Leaderboard.tsx` | Gate + treing under hovedresultatet |
| `docs/native/app-spike.md` | +79 linjer runbook |

### Suksesskriterier — verifisert

| # | Kriterium | Bevis | Resultat |
|---|---|---|---|
| 1 | Jest-låst logikk | `npx jest` 28 suiter / 350 tester, exit 0. Evaluator kjørte 4 mutasjonsprober (winnersMissing, to copy-strenger, resolveTeamGrouping) — alle røde, alle revertert grønt. | PASS |
| 2 | Ende-til-ende på staging, score-format | App og web gir 66/34/10/4 på spill A; Test Spillers kort tegn for tegn likt over alle seks grupper. Evaluator reimplementerte i tillegg webbens `computeSideTournament` uavhengig mot rå staging-data og fikk samme tall. | PASS |
| 3 | Matchplay + aktiv runde | Spill B: kompakt seksjon under duellkortet («Lengste drive #1: Anders», 66p/32p). Spill C (aktiv): hovedtabell 16/10/10, ingenting side-relatert; hentingen fyres ikke (`useSideWinners.ts:59`). | PASS |
| 4 | Guardrail — ærlig note | `SideTournamentSection.tsx` bytter tavla mot noten; mutasjonsprobe gjorde render-testen rød. | PASS |
| 5 | Web uendret | `git diff --name-only origin/main...HEAD` utenfor `native/`/`docs/`/`.forge/` = **0 filer**. `npx vitest run`: 522 filer / 7028 tester — identisk med baseline målt før første kodelinje, verifisert uavhengig av evaluator. | PASS |
| 6 | Porter + runbook | Alle porter grønne (tabell under). Runbook-seksjon skrevet. Eier-tapptest utført på fysisk iPhone: begge LD-slotene og CTP-en står riktig, og begge lag-radene folder seg ut. | PASS |

### Gates

| Gate | Kommando | Resultat |
|---|---|---|
| Native tester | `npx jest` (native/app) | exit 0 — 28 suiter, 350 tester |
| Native typer | `npx tsc --noEmit` (native/app) | exit 0 |
| JS-bundling | `npx expo export --platform ios` | exit 0 (`dist/` slettet) |
| Rot-typer | `npm run typecheck` | exit 0 |
| Web-suite | `npx vitest run` | exit 0 — 522/7028, = baseline |
| Lint | `npx eslint native/app` | exit 0 |
| Rot-build | `npm run build` (pipefail) | exit 0 |
| iOS Release | `xcodebuild … -configuration Release` | `** BUILD SUCCEEDED **`, exit 0 (×2) |

### Evaluator-verdikt: ACCEPT

Med fem funn. To ble fikset i samme runde, tre står som noter.

| Funn | Håndtering |
|---|---|
| **F1** — den ærlige noten fungerte også som laste-tilstand: hver åpning av et avsluttet side-spill viste «fikk ikke tak i vinnerne» før tavla kom | **FIKSET** (`a1cd90c4`). `settled` skilt fra `neverLoaded`; mens vi venter vises ingenting. Begge grener mutasjonsprøvd. |
| **F2** — `useSideWinners` hadde ingen test | **FIKSET** (`a1cd90c4`). Fire caser låser tilstandsmaskinen; vente-tilstanden krever en henting holdt i lufta. |
| **F3** — restrisiko i det dokumenterte navne-filter-avviket hvis en `users`-rad noen gang mangler | Note. FK gjør det utilgjengelig i praksis; nevnt i closing-kommentaren. |
| **F4** — noten skjuler også LD/CTP-linjene | Smakssak, beholdt: det er nettopp de radene som mangler. |
| **F5** — appen arver #1852 (dublert «hull») bevisst for paritet | Filet som eget issue. |

### Avvik fra kontrakten (tre, alle bevisste og bokført)

1. **Navne-filteret droppet.** Kontrakten sa eligible = `users != null && withdrawn_at == null`.
   Bundelen kollapser «ingen users-rad» og «users-rad uten navn» til `name: null`, så filteret
   ville kastet ut ferske selvregistrerte spillere og ikke fanget en eneste slettet.
   Evaluator verifiserte begrunnelsen mot `0016`, `0131`, `gameBundle.ts:211` og
   `scoringContext.ts:188` — **sann på alle fire punkter**.
2. **Grouping utledes** av delt `isSoloFormat` i stedet for en modus-tabell. Evaluator
   stikkprøvde 22/22 mot webbens renderere, inkludert `gruesome_matchplay` (den mest
   sannsynlige lekkasjen) og `best_ball` (som går en helt annen kodevei på web).
3. **Copy-oppslaget nøklet på `SideCategory`**, ikke `SideCategoryId` — unionene avviker på
   to navn (#1851).

### Funn filet som egne issues

- **#1851** — `SideCategory` vs `SideCategoryId`: to 45-medlems-unioner for samme domene.
- **#1852** — «18 hull hull 1–18»: dublert «hull» i webbens `longestBogeyFreeDetail`.

### Ikke verifisert

- Webbens sideturnerings-FANE visuelt av evaluatoren (React hydrerte ikke i dens
  nettleser-panel, jf. #1219). Hovedchatten gjorde den sammenligningen tidligere i økta med
  utskrift og skjermbilder; evaluator erstattet den med en uavhengig rekjøring av oppskriften,
  som er sterkere for tallene men ikke beviser webbens rendring.
- ~~Eier-tapptest på fysisk iPhone~~ — **utført**, se kontraktens kriterium 6.
