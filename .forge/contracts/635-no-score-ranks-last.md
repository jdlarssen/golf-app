# Spec: Lag/spiller uten skår skal rangeres sist (ikke kåres som vinner)

**Issue:** [#635](https://github.com/jdlarssen/golf-app/issues/635)
**Branch:** `claude/forge-issue-command-2g5niz`
**Kompleksitet:** LOW-MEDIUM (lokalisert scoring-fix, men `lib/scoring/` → streng TDD)
**Type:** PATCH (feil vinner i en ferdig, låst runde)
**Dato:** 2026-06-15

## Problem

Et lag/en spiller uten registrerte skår rangeres som nr. 1 og kåres som vinner. Repro (Texas scramble, 2 lag): Lag 1 har netto 29, Lag 2 har ingen skår → live-leaderboard OG ferdig-podium viser **Lag 2 (0 slag) som vinner** over Lag 1 (29). 0 netto tolkes feilaktig som det beste resultatet. Format-bredt for alle netto-slag-sorterte lag-formater.

## Research / Ground truth (kode-scout)

I lavest-netto-vinner-formatene bygges ranking-arrayet med **`?? 0` for uspilte/manglende hull**, så et lag uten skår får total 0 = laveste = best:
- `lib/scoring/modes/bestBall.ts:175` — `arr.push(h?.teamNet ?? 0)` (kommentar: «Missing holes teller 0 her»).
- `lib/scoring/modes/texasScramble.ts:169` — `arr.push(h?.teamNet ?? 0)`. **Brukes også av `ambrose.ts` og `floridaScramble.ts`** (begge `import { computeScramble } from './texasScramble'`).
- `lib/scoring/modes/shamble.ts:222` — `arr.push(cells[i]?.teamScore ?? 0)`.

`rankTeams` (`lib/scoring/tiebreaker.ts:18`) sorterer **ascending** på total (lavest vinner) — den er format-agnostisk og vet ikke om laget har spilt.

**Presedens finnes allerede:** `soloStrokeplay.ts` og `nassau.ts` løser nøyaktig dette med `UNPLAYED_PADDING = 999` — uspilte hull padder ranking-arrayet med et stort tall, så de rangeres «verre» enn spilte hull, og en 0-hulls-deltaker havner sist (`soloStrokeplay.ts:25-43`, test `soloStrokeplay.test.ts:321` «spiller med 18 hull rangerer foran spiller med 9 hull»). De berørte lag-formatene har bare aldri tatt i bruk samme strategi (texasScramble-kommentaren l.14 hevder «samme padding-strategi» men koden bruker `?? 0`).

**Ikke berørt (verifisert / utledet):**
- **Stableford-familien** (par-stableford, patsome via negerte poeng): høyest poeng vinner → 0 poeng rangeres sist naturlig. Ingen bug.
- **Matchplay** (singles + lag): status (AS/«ikke begynt»), ikke netto-total.
- **Poeng-formater** (nassau allerede padded; skins/nines/bbb/wolf/acey: høyest vinner → 0 sist naturlig).
- **soloStrokeplay, nassau**: allerede padded.

## Design

Bruk samme `UNPLAYED_PADDING`-strategi som `soloStrokeplay`/`nassau` i de tre berørte lag-ranking-arrayene, så uspilte hull rangeres som verst og et lag uten skår havner sist:

- `bestBall.ts:175`: `arr.push(h?.teamNet ?? UNPLAYED_PADDING)`.
- `texasScramble.ts:169`: `arr.push(h?.teamNet ?? UNPLAYED_PADDING)` (dekker ambrose + florida).
- `shamble.ts:222`: `arr.push(cells[i]?.teamScore ?? UNPLAYED_PADDING)`.

`UNPLAYED_PADDING` (999) eksisterer i `soloStrokeplay.ts`. **Løft den til en delt konstant** (f.eks. `lib/scoring/tiebreaker.ts` eller en liten `lib/scoring/unplayedPadding.ts`) og importer i alle fire moduler (soloStrokeplay, bestBall, texasScramble, shamble) + behold nassau sin egen om den allerede er delt. Mål: én sannhetskilde, ingen magisk 999 duplisert.

**Hvorfor padding (ikke kun «0-hull → sist»):** padding er konsistent med eksisterende soloStrokeplay/nassau-oppførsel (flere spilte hull rangerer bedre ved ellers lik stilling), og fikser 0-hulls-vinner-bugen som et spesialtilfelle. Under aktivt spill er lagene typisk på samme hull (samme flight), så padding endrer ikke praktisk rekkefølge der — den slår kun inn når et lag faktisk mangler hull, som er nettopp bug-tilfellet.

**Viktig:** padding gjelder KUN ranking-arrayet (`holes` inn til `rankTeams`). De **viste** totalene (`team.total`, `teamNet`, leaderboard-tall) skal være UENDRET — de regnes separat fra de faktiske skårene, ikke fra det paddede arrayet (samme separasjon som soloStrokeplay: «totalNetStrokes» uten padding, ranking-array med padding). Verifiser at `teamTotal`/`missingHoles` og View-tallene ikke plukker opp 999.

## Edge Cases & Guardrails

- **Alle lag uten skår (runde ikke begynt):** alle får maks-padding → alle tied på rank 1 (uendret «ingen har begynt»-tilstand; `rankTeams` tied-logikk håndterer det).
- **Delvis spilte lag:** et lag som har spilt 9 hull får 9 ekte + 9×padding; et lag som har spilt 18 rangerer foran ved ellers lik stilling — konsistent med soloStrokeplay. Akseptert oppførsel.
- **Tie-break-cascaden (back-9/back-6/back-3/hull-18):** padding i de bakre hullene må ikke gi falske tie-breaks mellom to spilte lag. Siden begge spilte lag har ekte tall der de har spilt og padding kun på faktisk-uspilte hull, er cascaden korrekt (samme som soloStrokeplay, som allerede har denne semantikken).
- **Vist total uendret:** snapshot/Type C-tester på leaderboard-tall skal ikke endres (kun rank).
- **Ingen regresjon i stableford/matchplay/poeng-formater:** urørt.

## Key Decisions

- **Padding-strategi (gjenbruk soloStrokeplay/nassau-mønster), ikke ny «0-hull → sist»-spesialcase.** Begrunnelse: konsistens med eksisterende format-oppførsel + én mekanisme.
- **Delt `UNPLAYED_PADDING`-konstant** i stedet for duplisert 999. Reduserer drift.
- **Kun ranking-array padder; viste totaler urørt.**

**Claude's Discretion:**
- Eksakt plassering av den delte konstanten (tiebreaker.ts vs egen fil).
- Om nassau sin eksisterende padding-konstant konsolideres i samme PR eller bare refereres (unngå unødig blast-radius — nassau er ikke i bug-scope, men gjerne pek til samme konstant hvis trivielt).

## Success Criteria (TDD — feilende test FØRST per format)

- [ ] **Texas scramble:** 2 lag, Lag 1 spilt (netto 29), Lag 2 ingen skår → Lag 1 rank 1, Lag 2 rank 2 (sist). Feilende test skrevet før fix. (`texasScramble.test.ts`)
- [ ] **Best ball:** samme — lag uten skår rangeres sist, ikke nr. 1. (`bestBall.test.ts`)
- [ ] **Shamble:** samme. (`shamble.test.ts`)
- [ ] **Ambrose + Florida:** dekkes av `computeScramble`-fixen; minst én regresjonstest bekrefter (kan være i texas/ambrose-suite).
- [ ] **Viste totaler uendret:** et lag som spilte 29 viser fortsatt total 29 (ikke 29 + padding). Assertion i samme tester.
- [ ] **Ingen regresjon:** full `lib/scoring/`-suite grønn (700+ tester); `npm run build` exit 0.

## Gates

- [ ] `./node_modules/.bin/vitest run lib/scoring/` grønn (alle scoring-tester).
- [ ] `npm run build` exit 0.
- [ ] TDD-disiplin: ny feilende test commitet/vist før fix (per `docs/test-discipline.md` Type A + «bug-fix fra prod: capture som fikstur først»).

## Files Likely Touched

- `lib/scoring/modes/bestBall.ts` — `?? UNPLAYED_PADDING` i ranking-array.
- `lib/scoring/modes/texasScramble.ts` — samme (dekker ambrose + florida).
- `lib/scoring/modes/shamble.ts` — samme.
- `lib/scoring/tiebreaker.ts` (eller ny `lib/scoring/unplayedPadding.ts`) — delt `UNPLAYED_PADDING`-konstant.
- `lib/scoring/modes/soloStrokeplay.ts` — importer delt konstant (fjern lokal duplikat).
- `lib/scoring/modes/*.test.ts` — feilende-først-tester (texas, bestBall, shamble) + total-uendret-assertions.
- `package.json` + `CHANGELOG.md` — PATCH-bump + oppføring.

## Out of Scope

- **Stableford/matchplay/poeng-formater** — ikke berørt (0 rangeres sist naturlig).
- **«Ikke begynt»-label / ekskludering fra podium** — issuet nevner det som alternativ; v1-fixen rangerer sist (enkleste korrekte). Egen enhancement hvis ønsket.
- **Leaderboard-UI-endringer** — kun ranking-rekkefølge, ingen ny visning.
- **#633 (#650), #634** — egne forge-runder i klyngen.
