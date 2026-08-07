# Evaluering: #1497 Cup per-spiller-poengregnskap

**Verdict: ACCEPT**
**Evaluator:** fresh-context forge-evaluator, 2026-08-08
**Range:** `e4459102..6d12904a` (arbeid: 4e52bda0, cf282143, 93560a86)

Staging-gaten (klikkrunde + bevis-kommentar + label) er åpen by design og kjøres av
hovedchatten på PR-en FØR merge — den holder ikke verdiktet tilbake alene. Alt annet
er selvstendig verifisert med bevis under.

## Per-kriterium funn

### 1. Aggregator: full vektet kreditt, sum på tvers av kamper — OPPFYLT

- Full kreditt til HVER spiller på siden: `lib/cup/computeCupPlayerPoints.ts:132-146`
  (`creditSide` itererer `userIds` og gir hver spiller hele `points`). Delt lagkamp-test
  asserter at ALLE fire spillere får hele `tie_points` (1, ikke 0,5):
  `computeCupPlayerPoints.test.ts:145-174`.
- Vektede verdier: `it.each` med win=2/tie=1 og win=5/tie=2 asserter
  `winPoints + tiePoints` per spiller — aldri 1/0,5 (`test.ts:119-143`). Ikke
  tautologisk: kombinerer to kamper + avrunding.
- Sum på tvers av kamper: `test.ts:94-117` (p1 i g1+g2 → 2 poeng, 2 contributions).
  Avledede kamper er bare flere `CupMatchSummary`-rader med egne `teamNUserIds`
  (se pkt. 3) — host + avledet krediteres som to separate kamper, korrekt per design.
- Taper-side aldri kreditert: guard `points <= 0` (`computeCupPlayerPoints.ts:132`) +
  eksplisitt assert taper = 0 (`test.ts:90`).
- Gate-bevis: `npx vitest run lib/cup "app/[locale]/cup/[id]/resultater"` →
  **366/366 grønne, 22 filer** (kjørt av evaluator, denne økten).

### 2. Ingen gjenberegning av kamppoeng — OPPFYLT

- `grep -n "win_points\|tie_points\|winPoints\|tiePoints\|0\.5" lib/cup/computeCupPlayerPoints.ts`
  → eneste treff er kommentar på linje 7. Ingen hardkodede 1/0,5 i kode.
- Aggregatoren leser kun `m.pointsTeam1`/`m.pointsTeam2` (`computeCupPlayerPoints.ts:93,100`) —
  beregnet ett sted, i `pointsForMatch` (`computeCupLeaderboard.ts:163-173`).
- Uferdig/result-null-kamp har allerede 0 der (`pointsForMatch` gater på
  `status !== 'finished' || result === null`) — ingen dobbel gating, som kontrakten krever.

### 3. Wiring: getCupSnapshot setter teamNUserIds per kamp — OPPFYLT

- `lib/cup/getCupSnapshot.ts:454-458`: `team1UserIds/team2UserIds` fra
  `side1Players/side2Players`, som er `gPlayers.filter(team_number === N)` PER game
  i loopen (`getCupSnapshot.ts:330-332`) — avledede kamper har egne `game_players`-rader
  og får dermed sine egne ID-er. Bevis i eksisterende splittet-dag-test:
  `getCupSnapshot.test.ts:249-251` (g1 host får `['p1','p2']`/`['p3','p4']`).
- Pass-through til summary: `CupMatchSummary = CupMatchInput & {...}`
  (`computeCupLeaderboard.ts:131`) og `{ ...m, pointsTeam1, pointsTeam2 }`-spread
  (`computeCupLeaderboard.ts:186-193`).
- Feltene er valgfrie på `CupMatchInput` (`computeCupLeaderboard.ts:65-74`) —
  pre-#1497 call-sites/tester upåvirket; defensiv fallback testet
  (`computeCupPlayerPoints.test.ts:261-271`).

### 4. ctp/ld via winnerUserId; gir + utenfor-roster stille ignorert — OPPFYLT

- `computeCupPlayerPoints.ts:109-116`: `kind === 'gir'` → skip; `!winnerUserId` → skip;
  roster-oppslag i begge lag-kart, miss → stille fallthrough (ingen crash).
- Tester: riktig spiller kreditert for ctp + ld (`test.ts:214-231`), ghost/null-vinner
  gir 0 overalt (`test.ts:233-245`), gir bidrar aldri (`test.ts:247-259`).
- Fixtures matcher den faktiske union-typen `CupSideAwardSnapshot`
  (`getCupSnapshot.ts:58-77`), inkl. gir-varianten med `maxPerTeam/team1Count/team2Count`.

### 5. Deterministisk sortering + avrunding — OPPFYLT

- `computeCupPlayerPoints.ts:157`: `b.points - a.points || a.displayName.localeCompare(b.displayName, 'nb')`
  — poeng desc, navn asc med norsk collator.
- Testene beviser begge akser og at de ikke er innsettings-artefakter:
  navn-sortering overstyrer innsettings-rekkefølge ([Bård, Anders] → [Anders, Bård],
  `test.ts:176-196`; [Knut, Kari] → [Kari, Knut], `test.ts:57-67`), poeng desc går
  foran navn (`test.ts:198-212`).
- Avrunding til 0,1: `Math.round(points * 10) / 10` (`computeCupPlayerPoints.ts:154`),
  flyt-presisjonstest 3 × 0,5 → 1,5 (`test.ts:273-285`).
- Hele rosteret får rad (0-poeng-spillere med tom contributions): `test.ts:57-67, 90-91`.

### 6. UI: kun finished-gren, tabular-nums, native details, egen-rad — OPPFYLT

- Låst-gren uendret: `page.tsx:56-71` returnerer FØR beregningen (linje 82) og
  seksjonen (linje 152-155); diff rører ikke låst-grenen.
- Seksjon kun i finished-returen: `page.tsx:152-155`, plassert mellom lagtotalene
  (`cup-results-totals`-seksjonen) og kamplisten — som kontrakten spesifiserer.
- `CupPlayerPoints.tsx`: ingen `'use client'` (ren ikke-async server-kompatibel
  komponent, verifisert linje 1-13); `tabular-nums` på poeng (linje 81) og
  kontribusjonslinjer (linje 112); native `<details>` per utbrettbar rad (linje 89),
  rad uten bidrag rendres uten details (linje 118-126) — ingen tom utbrett.
- Egen-rad: champagne-tint i GOLD_CARD_STYLE-palett (linje 17-20, 91, 121) +
  «Dine poeng»-markør (linje 75) + `data-testid="cup-player-points-me"` (linje 92, 122);
  seksjons-testid `cup-player-points` (linje 52).

### 7. i18n begge locales — OPPFYLT

- Fem nye nøkler under `cup.results.*` i BÅDE `messages/no.json:4783-4787` og
  `messages/en.json:4783-4787` (playerPointsHeading, yourPoints, wonAgainst,
  tiedWith, sideContribution).
- Gjenbrukte nøkler finnes i begge: `sideAwards.kindCtp`/`kindLd` (no/en:4794-4795),
  `sideAwards.holeShort` (no/en:4799). Alle `t()`-kall i komponenten
  (`CupPlayerPoints.tsx:39, 44-46, 54, 75`) matcher eksisterende nøkler — verifisert
  én for én.
- Norsk copy er knapp resultattavle-stil uten AI-tells («Vant mot {opponent} · +{points}»).

### 8. Test-disiplin — OPPFYLT

- Nøyaktig ÉN render-testfil med ÉN test for komponenten
  (`CupPlayerPoints.test.tsx:37` — eneste `it` i fila; diff-stat bekrefter ingen
  andre nye testfiler i resultater-mappen).
- Ingen re-assertering av Type A-tall: testen asserter struktur (seksjon, testid-er,
  input-rekkefølge — eksplisitt «komponenten sorterer ikke»), egen-rad-markering og
  at kontribusjons-etiketter BYGGES (ICU-interpolering) — ikke aggregerings-/
  sorteringslogikk.
- Type A-suiten (`computeCupPlayerPoints.test.ts`) dekker hele edge-tabellen fra
  kontrakten: tom cup, singles-vinner, flere kamper, vektede poeng, delt lagkamp,
  tie-sortering, ghost/null-vinner, gir, manglende userIds, avrunding, displayName-
  fallback (14 testcases).

### 9. Versjon + CHANGELOG — OPPFYLT

- `package.json`: 1.227.9 → 1.228.0 (minor for feat — korrekt bump-type).
- `CHANGELOG.md`: Funksjoner-oppføring «1.228 · Poengregnskap per spiller» med
  issue-link og sti-hint.

## Gate-resultater (kjørt av evaluator, Node 22)

| Gate | Resultat |
|---|---|
| `npx vitest run lib/cup "app/[locale]/cup/[id]/resultater"` | 366/366 grønne (22 filer) |
| `npm run lint` | 0 errors, 56 pre-eksisterende warnings (ingen i berørte filer) |
| `npm run build` (pipefail) | exit 0, route-oversikt produsert |
| Staging-klikkrunde | ÅPEN by design — hovedchatten kjører staging-verify på PR-en FØR merge |

## Issues som må fikses

Ingen.

## Observasjoner (ikke blokkerende, ingen aksjon kreves)

- `CupPlayerPoints.test.tsx:56-57` asserter norske copy-strenger via getByText
  (vitest-setupen bruker ekte meldinger). Innenfor Type C-disiplinen (strukturell
  etikett-bygging, én test), men en fremtidig copy-endring i `results.wonAgainst`/
  `sideContribution` krever manuell test-oppdatering (ikke `vitest -u`).
- Sorterings-collatoren er hardkodet `'nb'` også for engelsk locale — bevisst per
  kontraktens «norsk collator», og deterministisk uansett locale.
