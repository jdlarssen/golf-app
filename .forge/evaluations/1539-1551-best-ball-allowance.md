# Evaluering: best ball-allowance skal ha ett hjem (#1539 + #1551)

**VERDICT: ACCEPT** — alle seks kriteriene holder mot koden, alle porter er grønne, og jeg klarte ikke å falsifisere kjernepåstanden. Fire mindre funn (ingen blokkerende) står nederst.

Evaluert: `claude/kjoer-auto-neste-010b4f` (PR #1556, draft) mot `origin/main`.
Diff: 3 commits, 13 filer, +547/−115.

## Kriterie-tabell

| # | Verdikt | Evidens jeg selv utledet |
|---|---|---|
| **K1** | PASS | `lib/cup/cupMatchAllowance.ts:82-103` — `cupMatchAllowance('best_ball', …)` returnerer `{ hcpAllowancePct: allowances.bestBall, modeConfigAllowancePct: null }` (linje 86-88). Ren funksjon, ingen I/O. Type `CupMatchAllowance` på `:54-59`. Kontrakten oppgir `:82-104`; funksjonen slutter faktisk på `:103`. |
| **K2** | PASS | `lib/cup/cupMatchAllowance.test.ts:80-113` — to `it.each(ALL_CUP_MATCH_FORMATS)`-blokker (WHS-defaults + skjeve arrangør-verdier). **Bevist falsifiserbar:** jeg endret `cupMatchAllowance.ts:87` til `modeConfigAllowancePct: allowances.bestBall` → `5 failed \| 19 passed (24)`, inkludert *begge* invariant-casene for `best_ball`. Endringen ble reversert; `git status --porcelain` er tom. Se «Forsøk på å falsifisere» for to forbehold. |
| **K3** | PASS | `app/[locale]/admin/cup/[id]/generer/actions.ts:377` — `hcp_allowance_pct: cupMatchAllowance(match.format, allowances).hcpAllowancePct` inne i `insertMatch`. Jeg verifiserte at fila har **kun ett** `games`-insert (`grep -n "from('games')"` → `:264` er en SELECT-teller, `:346` er rollback-DELETE, `:363-364` er inserten). Begge pass (host + avledet) går gjennom `insertMatch`. `allowances` bygges `:303-314` med `plan.best_ball_allowance_pct ?? fourballPct`. |
| **K4** | PASS | `lib/cup/computeCupBestBallAward.ts` — `applyAllowance`- og `ALLOWANCE_DEFAULTS`-importene er borte (diff), `:73` er `strokesForHole(p.courseHandicap, hole.strokeIndex)`, og `CupBestBallAwardInput` (`:31-35`) har ingen `allowancePct`. `lib/cup/getCupSnapshot.ts:424-429` sender ikke feltet. `grep -rn "computeCupBestBallAward"` → én eneste ikke-test-kaller (`getCupSnapshot.ts:424`). |
| **K5** | PASS | `lib/cup/computeCupBestBallAward.test.ts:139-176` sammenligner `bestBallCompute(ctx)`-lagtotalene mot `computeCupBestBallAward(...).formatted` på samme frosne input `{a1:37, a2:4, b1:9, b2:2}`. **Bevist at den fanger defekten:** med et gjeninnført 85 %-trekk i `computeCupBestBallAward.ts:73` ble den rød med `expected '36–37' to be '35–36'` — og den var den ENESTE testen i hele fila som ble rød. Staging-påstanden delvis korroborert: jeg leste `torny-staging` read-only og fant Ryder Cup 2026-klonen med `hcp_allowance_pct = 85` OG `mode_config.allowance_pct = 85` (dobbelt-trekk-dataen intakt) på alle tre best-ball-kampene — riktig regresjons-oppsett. Selve klikk-runden har jeg ikke gjentatt. |
| **K6** | PASS | Diffen rører verken `useGameFormState.ts`, `gamePayload.ts`, `GameForm.tsx` eller `ReadyStep.tsx`. Frittstående best ball får sin allowance fra veiviserens `AllowanceField fieldName="hcp_allowance_pct"` (`app/[locale]/admin/games/new/GameForm.tsx:748-757` og `sections/ReadyStep.tsx:445-461`, begge med `gameMode === 'best_ball'` i betingelsen), og `lib/games/gamePayload.ts:572` bygger `mode_config: { kind: 'best_ball', team_size: 2, teams_count }` — uten `allowance_pct`, i tråd med `lib/scoring/modes/types.ts:408`. Anvendes én gang i `lib/games/startScheduledGame.ts:234`. |

## Observert port-output (mine egne kjøringer, Node v22.23.0)

| Port | Kommando | Resultat |
|---|---|---|
| Full enhetssuite | `npx vitest run` | **454 filer passed, 5821 tester passed**, 0 failed (83.78 s) |
| Scoring-suiten | `npx vitest run lib/scoring` | **46 filer passed, 1130 tester passed** (20.33 s) — identisk med main, `lib/scoring/` er urørt i diffen |
| Cup-suiten | `npx vitest run lib/cup` | **24 filer passed, 417 tester passed** (3.60 s) |
| Full build | `npm run build` | `✓ Compiled successfully in 6.1s`, `BUILD_EXIT=0` (kjørt på nytt på ren arbeidstre etter at scratch-endringene var reversert) |
| Lint | `npm run lint` | `✖ 55 problems (0 errors, 55 warnings)` — alle warnings er pre-eksisterende kompleksitets-varsler i urørte filer; pre-push-gaten feiler kun på errors |

Kontraktens egne tall (24/417, 46/1130) stemmer eksakt med mine.

## Forsøk på å falsifisere

**1. Leser eller skriver noen ANNEN kodesti fortsatt `mode_config.allowance_pct` for `best_ball`?**
Nei. `grep -rn "allowance_pct" lib app components supabase e2e scripts`: de eneste ikke-test-leserne er `lib/cup/computeCupMatchResult.ts:88` (matchplay-dispatcheren — `getCupSnapshot.ts:419` sender aldri `best_ball` dit, best_ball tar `if`-grenen), `lib/scoring/modes/{fourball,foursomes,greensome,chapman,gruesome,roundRobin}` (egne format), `app/[locale]/games/[id]/holes/[holeNumber]/page.tsx:704-711` (kun foursomes-familien, `best_ball` treffer aldri grenen) og `lib/games/editGameInitialValues.ts:190` (kun round_robin). Ingen skriver setter feltet for best_ball lenger — `cupMatchModeConfig` (`generer/actions.ts:76-89`) returnerer nå en `best_ball`-config uten feltet, og `gamePayload.ts:572/:2156` gjorde det aldri.

**2. Trekkes allowancen fortsatt to ganger noe sted?**
`grep -rn "applyAllowance"` gir seks ikke-test-kallesteder: `courseHandicap.ts:52` (selve helperen), `startScheduledGame.ts:234` (frysingen), `recomputeCourseHandicap.ts:78` (re-frysing, leser samme `games.hcp_allowance_pct`), `fourballMatchplay.ts:103` og `roundRobin.ts:308` (egne format via mode_config). Ingen av dem rører en best-ball-sti to ganger.

**3. Brekker det frittstående (ikke-cup) best ball?**
Nei — se K6. Verdt å merke: det er ingen `key`/remount-felle her, veiviser-stien er bit-identisk med main.

**4. Brekker det andre cup-format?**
Nei. `cupMatchAllowance` gir alle fem matchplay-2v2-formatene `{ hcpAllowancePct: 100, modeConfigAllowancePct: <arrangørens pct> }` (`cupMatchAllowance.ts:92-102` — samme kjede som den gamle inline-koden i `actions.ts`), og `singles_matchplay` `{100, null}`. Før endringen ble `hcp_allowance_pct` utelatt fra inserten og arvet DB-defaulten `100` (`supabase/migrations/0001_initial_schema.sql:46`); nå settes samme `100` eksplisitt → null atferdsendring. Assertion finnes i `app/[locale]/admin/cup/[id]/generer/actions.test.ts` (`greensomeRow.hcp_allowance_pct` = 100) og i `cupMatchAllowance.test.ts:59-71`.

**5. Kan invariant-testen faktisk feile?**
Ja — bevist (se K2). To forbehold, begge dokumentert som funn under: invarianten gjelder helperens returverdi, ikke selve DB-skrivingen, og `ALL_CUP_MATCH_FORMATS` har ingen kompileringstids-uttømmelsesvakt.

**6. Er «Ryder Cup 2026-regresjonen» en ekte vakt?**
**Nei — den passerer trivielt.** Se funn 1.

**7. Finnes det eksisterende spill/tester som avhenger av den fjernede `allowancePct`-parameteren?**
Nei. `grep -rn "allowancePct"` i `lib/cup` gir kun `computeCupMatchResult`s egen (urørte) parameter. Full suite grønn.

**8. Finnes det prod-data som stille endrer resultat?**
Read-only SELECT mot prod (`glofubopddkjhymcbaph`): det finnes **fem** `best_ball`-spill totalt, alle `finished` — TestCup – Best ball 1 (`hcp=100`, `mc=85`, **`tournament_id = NULL`**), Ryder Cup 2026 – Best ball 1–3 (`hcp=85`, `mc=85`, i cup) og SICKlestad (`hcp=100`, ingen `mc`). Kontraktens prod-tabell stemmer. Ingen levende (`scheduled`/`active`) best-ball-cupkamp finnes, så ingen pågående stilling flytter seg ved deploy.

## Funn

**1. `lib/cup/computeCupBestBallAward.test.ts:118-163` — «Ryder Cup 2026-regresjonen» er ingen regresjonsvakt; den passerer med feilen gjeninnført.**
Bevist empirisk: med `strokesForHole(Math.round(p.courseHandicap * 85 / 100), …)` på `:73` kjørte hele fila og bare K5-krysstesten ble rød — `✓ Ryder Cup 2026-regresjonen` og `✓ bruker det frosne banehandicapet rått` passerte begge. Årsaken er at sluttassertionen `:162` (`expect(result?.formatted).not.toBe(doubleAllowanced?.formatted)`) sammenligner funksjonen med seg selv på to ulike input (CH 37 vs. CH 31) — den ulikheten holder uansett hvilken allowance funksjonen selv anvender. Kommentaren på `:88` («derfor er det den EKSPLISITTE grensen under som faktisk fanger dobbelttrekket») er dermed faktuelt feil, og K5-evidensen i kontrakten er den eneste som faktisk bærer.
*Forslag:* lås tallet i stedet for å sammenligne med seg selv — `expect(result?.formatted).toBe('<eksakt streng>')` med verdien regnet fra frosset 37. Da blir testen rød så snart funksjonen anvender noe som helst. Alternativt: fjern testen og la K5-krysstesten stå som den ene vakten, og rett kommentaren på `:88`.

**2. `lib/cup/cupMatchAllowance.ts:66-74` — `ALL_CUP_MATCH_FORMATS` har ingen uttømmelsesvakt, så et nytt cup-format slipper stille forbi invarianten.**
JSDoc-en på `:62-65` hevder at den eksplisitte lista hindrer at «en ny `CupBundleFormat` … stille slipper unna invarianten», men `as const satisfies readonly CupBundleFormat[]` sjekker bare at hvert element ER et gyldig format — ikke at alle format er med. Testen på `cupMatchAllowance.test.ts:73-74` (`toHaveLength(7)`) er sirkulær: den måler lengden på den samme lista. Legges et åttende format til `CupBundleFormat`, kompilerer alt grønt, invarianten dekker det aldri — og `cupMatchAllowance.ts:101` gir det stille `allowances.gruesome` via `else`-halen.
*Forslag:* utled lista fra en `Record`-nøkkel slik `cupPairing.ts:94` allerede gjør — f.eks. `const CUP_MATCH_FORMATS: Record<CupBundleFormat, true> = { … }` og `ALL_CUP_MATCH_FORMATS = Object.keys(CUP_MATCH_FORMATS) as CupBundleFormat[]`. Da blir et nytt format en tsc-feil.

**3. `lib/cup/cupMatchAllowance.test.ts:65` — ødelagt `it.each`-tittel (kosmetisk).**
Malen `'%s får %i %% i mode_config og 100 på spill-raden'` renderes som «fourball_matchplay får 85 % **undefined** i mode_config og 100 på spill-raden». `%%` spiser ikke argumentet som forventet.
*Forslag:* `'%s får %i prosent i mode_config og 100 på spill-raden'`.

**4. `CHANGELOG.md` (linja for `1.230.4`) refererer kun #1539, ikke #1551.**
PR-body-en lukker begge (`Closes #1539` / `Closes #1551`), og teksten beskriver begge symptomene, men lenka peker bare på det ene issuet.
*Forslag:* legg til `+ [#1551](…)` i samme linje, eller la det stå — versjons-hooken godtar det, og det er en ren sporbarhets-detalj.

**Ikke et funn, men verdt å si til eieren:** kontraktens «Kjent konsekvens» om at TestCup – Best ball 1 går fra 85 % til 100 % i cup-poenget er moot — spillet har `tournament_id = NULL` i prod og kommer aldri inn i `getCupSnapshot`. Det har altså aldri hatt et cup-poeng. Ingen prod-effekt i det hele tatt av den endringen.

**Sekundær (positiv) atferdsendring som ikke står i kontrakten:** en best-ball-kamp som opprettes MANUELT i veiviseren og knyttes til en cup (`app/[locale]/admin/games/new/page.tsx:376`) fikk tidligere `computeCupBestBallAward` til å defaulte til 85 % oppå veiviserens egen `hcp_allowance_pct` — også der var det dobbelt-trekk. Den stien er nå riktig av samme grunn. Ingen slike spill finnes i prod.

## Disiplin-sjekk (CLAUDE.md)

| Regel | Status |
|---|---|
| Versjonsbump for `fix` | ✅ `package.json` 1.230.3 → **1.230.4** (patch — korrekt for `fix`) |
| CHANGELOG-linje for bruker-synlig fix | ✅ ny Feilrettinger-linje, teller bumpet 35 → 36 |
| `[no-changelog]` på interne commits | ✅ `chore(forge)` og `test(cup)` har begge markøren |
| `Refs #N` i commit-body | ✅ alle tre commits har `Refs #1539` + `Refs #1551` |
| `--no-verify` | ✅ ingen spor; commits er hook-passerte |
| PR-presentasjon | ✅ `Closes #1539` + `Closes #1551`, «Fordeler / ulemper»-blokk til stede, draft-først per #1516 |
| `lib/scoring/` urørt | ✅ ingen filer i diffen, 1130 tester uendret grønne |

## Reversering av eksperimenter

Begge scratch-endringene (gjeninnført allowance i `computeCupBestBallAward.ts:73`, brutt invariant i `cupMatchAllowance.ts:87`) er reversert med `git checkout --`. `git status --porcelain` er tom, og build-en over ble kjørt PÅ NYTT etter reverseringen.
