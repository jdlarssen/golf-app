# Evaluering: Dedup greensomeMatchplay ↔ foursomesMatchplay (#628)

**Commit under evaluering:** `16ddeead` — `refactor(scoring): greensome matchplay delegates to shared foursomes core`
**Evaluator:** fresh-context skeptisk verifisering, alle gates kjørt på nytt.

## VERDICT: ACCEPT

Ren strukturell dedup. Greensome delegerer nå til `computeFoursomesCore` med
`greensomeTeamHandicap`-strategien, identisk mønster som chapman/gruesome.
Linje-for-linje-sammenligning mot den slettede inline-implementasjonen viser
NULL logikk-divergens. Testfilen er uendret (karakteriserings-låsen intakt),
alle 16 greensome-tester + hele scoring-suiten (854) grønne, tsc rent.

## Suksesskriterier

| K | Krav | Status | Bevis |
|---|------|--------|-------|
| K1 | Delegerer til `computeFoursomesCore` m/ `greensomeTeamHandicap`; ingen duplisert hull-loop/side-bygging igjen | **PASS** | `greensomeMatchplay.ts:46` = `return computeFoursomesCore(ctx, readAllowancePct(ctx), greensomeTeamHandicap);`. Grep etter `pickTeamCaptain\|strokesForHole\|parFor\|classifyMatchplayHole\|computeMatchResult\|placeholderSides\|emptyShell\|buildSidePlayers\|FoursomesHoleRow\|FoursomesSide` i filen → exit 1 (ingen treff). Filen er 47 linjer, kun kommentar + `greensomeTeamHandicap` + `readAllowancePct` + `compute`. |
| K2 | Eksportert API uendret: `compute` + `greensomeTeamHandicap` samme signaturer | **PASS** | Begge fortsatt `export function`. `greensomeTeamHandicap(chA: number, chB: number): number` (l.24) identisk med gammel versjon (`git show HEAD~1`). `compute(ctx: ScoringContext): FoursomesMatchplayResult` (l.45) uendret. Importører: `lib/scoring/index.ts:67` (`greensomeMatchplay.compute`), `lib/cup/computeCupMatchResult.ts:4` (`compute as computeGreensomeMatchplay`), test (`compute`, `greensomeTeamHandicap`). Ingen importerer slettede symboler (`placeholderSides`/`buildSidePlayers`/`emptyShell` var alle module-private `function` uten `export`). |
| K3 | `greensomeMatchplay.test.ts` grønn, uendret testfil | **PASS** | `git diff 16ddeead -- ...test.ts` → tom (exit 0, uendret). `git show 16ddeead --stat` lister kun kontrakt-docen + `greensomeMatchplay.ts` (218 endrede linjer). `npx vitest run lib/scoring/modes/greensomeMatchplay.test.ts` → **16 passed**. |
| K4 | Hele scoring-suiten grønn (søsken-regresjon) | **PASS** | `npx vitest run lib/scoring/` → **36 test files passed, 854 tests passed**, 3.50s. Ingen regresjon i foursomes/chapman/gruesome/patsome/fourball/singles. |
| K5 | Typecheck rent | **PASS** | `npx tsc --noEmit` → **exit 0**. Ingen ubrukt-import-/type-feil. |
| K6 | Netto linjereduksjon, ingen ny fil | **PASS** | `wc -l` = **47 linjer** (var 227 → −180). `--stat`: kun `greensomeMatchplay.ts` endret + `.forge/contracts/`-docen lagt til; ingen ny source-fil opprettet. |

## Behaviour-equivalence — detaljert verifisering (kritisk risiko)

Diffet den slettede inline-`compute`-kroppen (`git show HEAD~1:...`) mot
`computeFoursomesCore` (`foursomesMatchplay.ts:133-260`), steg for steg:

- **Side-filtrering/sortering:** begge `filter(teamNumber===1/2).slice().sort((a,b)=>a.userId.localeCompare(b.userId))` — byte-identisk.
- **2-per-side-guard:** begge → `emptyShell()` med `kind:'foursomes_matchplay'`, tomt `holes`, `holesRemaining:18`, `result:null`. Identisk shell-shape (den nye gjenbruker `emptyShell` i `foursomesMatchplay.ts`, byte-identisk med den slettede greensome-kopien).
- **Allowance-lesing:** greensome beholder sin EGEN `readAllowancePct` som sjekker `config.kind !== 'greensome_matchplay'` (l.36). Resultatet sendes som argument; `computeFoursomesCore` re-leser ALDRI allowance. Greensome-spesifikk kind-guard er dermed bevart. Evalueres én gang, samme som før (ingen dobbel-lesing).
- **Side-handicap:** OLD kalte `greensomeTeamHandicap(p[0].ch, p[1].ch)`; NEW kaller `sideHcp(p[0].ch, p[1].ch)` der `sideHcp === greensomeTeamHandicap`. SAMME funksjon, SAMME argument-rekkefølge. `SideHandicapFn = (ch1:number, ch2:number)=>number` matcher `greensomeTeamHandicap(chA,chB)`. Funksjonen er order-uavhengig (min/max), så ulik partner-rekkefølge kan uansett ikke endre output.
- **teamDiff / highSideExtraHCP / highSideNumber / side1Extra / side2Extra:** alle fire uttrykk byte-identiske (`Math.abs`, `Math.round((diff*pct)/100)`, `side2>side1?2:1`, conditional extra).
- **sides-objekt, grossByKey-map, hull-loop, net = gross − strokesForHole(extra, SI), classifyMatchplayHole, par via captainPlayer.teeGender, holesUp/holesPlayed/holesRemaining, computeMatchResult, retur-shape:** alle byte-identiske.

Konklusjon: ingen sti der output kan avvike. Karakteriserings-suiten (som
låser shape, 60/40, høy/lav-side strokes, tie, 3&2/AS/2up, uspilt hull, 0 %
allowance, kaptein lex-min, empty shell) er grønn FØR (gammel impl) og ETTER
(delegert) — det empiriske beviset på 0 oppførselsendring.

## Gråsone-disiplin (kontrakt-compliance)

- Gråsone 1 (kjerne blir i `foursomesMatchplay.ts`): ✅ ingen ny modul.
- Gråsone 2 (`greensomeTeamHandicap` beholdes navngitt/eksportert, IKKE kollapset til `chapmanSideHandicap`): ✅ fortsatt egen eksportert funksjon (l.24), selv om formelen er identisk med chapman. Bevisst — testen importerer den. Liten note: greensome importerer IKKE den delte strategien fra `foursomesMatchplay` slik chapman/gruesome gjør; den holder sin lokale tvilling. Dette er eksakt det kontrakten foreskriver, ikke et avvik.
- Gråsone 3 (`readAllowancePct` beholdt): ✅ bevart med greensome-kind-guard.

## Concerns / residual risk

- **Ingen substantiell risiko funnet.** Refaktoren er mekanisk korrekt.
- **Mindre observasjon (ikke en defekt):** `greensomeTeamHandicap` og
  `chapmanSideHandicap` har nå identisk 60/40-formel i to filer. Dette er en
  bevisst gråsone-avgjørelse (#2), ikke en oversett dup — matchplay-familie-
  mønsteret holder per-format navngitt handicap. Hvis formlene noen gang skal
  divergere er separasjonen riktig; hvis ikke, er det ~2 linjers akseptert
  redundans. Ingen handling kreves.
- **Kommentar-kvalitet:** topp-kommentaren er oppdatert til å si «delegerer til
  `computeFoursomesCore`» à la søsknene (kontrakt-krav oppfylt).
