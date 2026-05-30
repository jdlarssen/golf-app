# Forge-evaluering: Patsome (issue #286)

**Verdikt: ACCEPT**
**Evaluator:** skeptisk fresh-context sub-agent
**Branch:** `issue-286-patsome`
**Dato:** 2026-05-31

Alle ni suksesskriterier verifisert ved å LESE koden (ikke ved å stole på kontraktens
hakemerker). Gates kjørt selv. Ingen must-fix-funn. Implementasjonen matcher kontrakten
presist — inkludert de subtile algoritme-detaljene (allowance-avrunding, MAX-regel,
negert-poeng-ranking) og guardrail-ene mot draft-state.

---

## Gate-resultater (faktisk output)

| Gate | Kommando | Resultat |
|------|----------|----------|
| Scoped tester | `npx vitest run patsome.test.ts gamePayload.test.ts PatsomeView.test.tsx patsomeActions.test.ts` | **4 filer, 222 tester PASS** |
| Build | `npm run build` | **exit 0** (eneste advarsel er kosmetisk «inferred workspace root», urelatert) |
| Full suite (regresjon) | `npx vitest run` | **173 filer, 2041 tester PASS, 0 fail** |

`patsome.test.ts` inneholder 60+ `it()`-blokker (kontrakten sa «36» — implementasjonen
overgår tallet; det er flere assertions, ikke færre).

---

## Kriterie-matrise

| K | Status | Konkret bevis |
|---|--------|---------------|
| **K1 — Typer + uttømmende maps** | ✅ PASS | `npm run build` exit 0 — fanger alle manglende `Record<GameMode,…>`/switch-medlemmer. `modeValidators` har `patsome:` ([gamePayload.ts:1371](lib/games/gamePayload.ts)). `database.types.ts:694` har tabell-shape som matcher migrasjonen kolonne-for-kolonne. |
| **K2 — Scoring-modul** | ✅ PASS | `patsome.ts`: `segmentFor()` 1–6/7–12/13–18 ([:58-62](lib/scoring/modes/patsome.ts)); 4BBB `teamPoints = Math.max(...players.map(points))` ([:236](lib/scoring/modes/patsome.ts)); greensome `Math.round(0.6*minCH + 0.4*maxCH)` ([:127](lib/scoring/modes/patsome.ts)); foursomes `Math.round(0.5*sumCH)` ([:131](lib/scoring/modes/patsome.ts)); gross-modus → `teamHandicap = 0` i begge 1-ball-segmenter ([:127,:131](lib/scoring/modes/patsome.ts)); ranking via `rankTeams` med negerte per-hull-poeng-arrays ([:178-183](lib/scoring/modes/patsome.ts)) — identisk mønster som `stableford.ts:317`. |
| **K3 — Type A unit-tester** | ✅ PASS | Testene asserterer faktisk algoritmen, ikke bare shape: MAX-regel ([:129](lib/scoring/modes/patsome.test.ts)), contributor ved tie ([:171](lib/scoring/modes/patsome.test.ts)), greensome `.5`-avrunding ([:278](lib/scoring/modes/patsome.test.ts)), foursomes odde-sum-avrunding ([:344](lib/scoring/modes/patsome.test.ts)), net↔gross-flip ([:449-490](lib/scoring/modes/patsome.test.ts)), uspilte hull ([:492-541](lib/scoring/modes/patsome.test.ts)), multi-team rank + `tiedWith` ([:544-599](lib/scoring/modes/patsome.test.ts)), draft-state 1/3/0-medlemmer uten krasj ([:600-651](lib/scoring/modes/patsome.test.ts)), kaptein lex-min ([:653-688](lib/scoring/modes/patsome.test.ts)). |
| **K4 — Validator + regresjon** | ✅ PASS | `validatePatsome` ([gamePayload.ts:1299-1352](lib/games/gamePayload.ts)): `< 4 → min_players_for_mode` ([:1325](lib/games/gamePayload.ts)), `count !== 2 → team_balance` ([:1334](lib/games/gamePayload.ts)), `bad_team` ([:1316](lib/games/gamePayload.ts)), `duplicate_player` ([:1311](lib/games/gamePayload.ts)). `gamePayload.test.ts` (del av 222) asserterer feilkodene. |
| **K5 — Migrasjon + tee-starter-tabell** | ✅ PASS | `0055_patsome.sql`: tabell m/ PK `(game_id, team_number)` + 4 RLS-policies (read=enhver deltaker, insert/update/delete=lag-medlem ELLER admin) + `updated_at`-trigger + format-seed (`is_active true`, `is_cup_eligible false`) + intent-mapping (`klubb`, `is_primary false`, sort 90). Numerering ren — ingen 0055-kollisjon. `database.types.ts` håndskrevet (akseptert per kontrakt). |
| **K6 — Hybrid scorekort-inntasting** | ✅ PASS | Collapse-betingelse EKSAKT `if (isTexas \|\| isFoursomes \|\| (isPatsome && holeNumber >= 7))` ([page.tsx:431](app/games/[id]/holes/[holeNumber]/page.tsx)). Per-segment lag-handicap matcher scoring-modulen: gross→0, greensome (≤12) `round(0.6*min+0.4*max)`, foursomes `round(0.5*combinedCH)` ([:458-473](app/games/[id]/holes/[holeNumber]/page.tsx)). Hull 1–6 forblir per-spiller ([:505-533](app/games/[id]/holes/[holeNumber]/page.tsx)). **Andre modi urørt** — `isFoursomes`-grenen ([:441-457](app/games/[id]/holes/[holeNumber]/page.tsx)) og texas-grenen ([:474-480](app/games/[id]/holes/[holeNumber]/page.tsx)) er additive, ikke endret. `PatsomeSegmentBanner` + tee-starter-slots faktisk RENDRET i JSX ([:606-607](app/games/[id]/holes/[holeNumber]/page.tsx)). |
| **K7 — Tee-starter** | ✅ PASS | `setPatsomeTeeStarter` ([patsomeActions.ts:26-101](app/games/[id]/patsomeActions.ts)): kaller-medlemskap ([:46](app/games/[id]/patsomeActions.ts)) + kandidat-medlemskap ([:60](app/games/[id]/patsomeActions.ts)) + ikke-finished ([:73](app/games/[id]/patsomeActions.ts)) + game_mode patsome ([:76](app/games/[id]/patsomeActions.ts)) + upsert m/ `onConflict: 'game_id,team_number'` ([:86](app/games/[id]/patsomeActions.ts)). Paritet odd=starter/even=partner i hint-komponenten. `patsomeActions.test.ts` dekker ALLE authz-feilkoder + 2 happy paths. |
| **K8 — Leaderboard + podium** | ✅ PASS | `renderPatsome` ([page.tsx:2543-2596](app/games/[id]/leaderboard/page.tsx)) dispatcher og narrower på `result.kind !== 'patsome' → notFound()`. `PatsomeView`: lag-rader + tre segment-delsummer (signatur-elementet, `patsome-segments-{n}` testid) + per-hull-rutenett m/ segment-dividers etter hull 6/12 + `tiedWith`-label + reveal-aware tidlig-return (`patsome-reveal-hidden` testid). `PatsomeView.test.tsx` PASS (del av 222). |
| **K9 — CHANGELOG + versjon** | ✅ PASS | `package.json` 1.50.0 → 1.51.0 (MINOR). commit-msg-hook passerte (`feat(formats)` commit `64674ea`). |

---

## Detaljert skeptisk gransking (krav fra oppgaven)

**Scoring-korrekthet (K2/K3):**
- Segment-grenser: `segmentFor()` returnerer `fourball` for ≤6, `greensome` for ≤12, ellers `foursomes`. ✔
- 4BBB MAX-regel: `Math.max(...players.map(pc => pc.points))`, tom array → 0 (eksplisitt guard `players.length === 0 ? 0`). ✔
- Greensome allowance er **eksakt** `Math.round(0.6 * minCH + 0.4 * maxCH)`. ✔
- Foursomes allowance er **eksakt** `Math.round(0.5 * sumCH)`. ✔
- Gross-modus nuller strokes: begge `teamHandicap = ... : 0`, og 4BBB-cellene bruker `netStrokes = gross` når `scoring !== 'net'`. ✔
- Ranking bruker negerte poeng via `rankTeams` (`.map(pts => -pts)` etter `padTo18`). ✔
- Draft-state (≠2 medlemmer) kaster ikke: kaptein-fallback `''` ved tomt lag, MAX over tom array → 0, manglende kaptein-rad → `teamGross = null → 0 poeng`. Testene `:600-651` beviser ingen krasj for 0/1/3 medlemmer. ✔

**Validator (K4):** håndhever 2-per-lag + min 4 + alle fire feilkoder eksisterer og asserteres. ✔

**Score-entry hybrid (K6):** per-segment lag-handicap matcher scoring-modulen 1:1; isTexas/isFoursomes-stiene urørt (foursomes beholder WHS-diff-formelen, texas beholder `team_handicap_pct`). ✔

**Tee-starter (K7):** full authz-kjede + upsert. ✔

**Leaderboard (K8):** dispatch + narrowing + struktur + reveal. ✔

**Migrasjon (K5):** tabell + RLS + seed + types-entry. ✔

---

## Funn

**Must-fix før merge:** Ingen.

**Nice-to-have / oppfølging (IKKE blokkerende):**

1. **`patsome_tee_starters_read`-policy lar IKKE admin lese eksplisitt.** Read-policyen
   krever at leseren er `game_players`-deltaker i spillet; det finnes ingen `or public.is_admin()`
   slik insert/update/delete-policyene har. Konsekvens: en admin som IKKE er spiller i spillet
   ser ikke andres tee-starter-valg via RLS. Dette er et rent UI-hint (scoring leser aldri tabellen),
   og server-action-en bruker uansett deltaker-bruker-konteksten, så praktisk effekt er minimal.
   Verdt en liten oppfølging for konsistens, ikke en blokker.

2. **`patsome.compute` antar 18 hull, men hardkoder ikke segment-grensene mot bane-lengde.**
   Dette er DOKUMENTERT og bevisst per kontrakt (Edge Cases: «9-hulls bane → degraderer grasiøst»),
   så IKKE et funn — nevnes kun for fullstendighet.

**Bevisst utenfor scope (korrekt IKKE flagget som mangel):**
- Ingen separate greensome/foursomes-strokeplay-moduler (orchestrator regner direkte). ✔ per «Avvik fra issue».
- Ingen cup-eligibility. ✔
- `/scorecard`-oversikt kollapser til kaptein. ✔ dokumentert forenkling.
- Migrasjon ikke kjørt mot prod ennå (format-rad `is_active`, koordineres med deploy — nines-presedens). ✔
- `database.types.ts` håndskrevet. ✔

---

## Konklusjon

**ACCEPT.** Alle K1–K9 PASS med konkret kode-bevis. Gates grønne (222 scoped + 2041 full
suite + build exit 0). Ingen regresjon i eksisterende modi (texas/foursomes-stiene additive
og urørt; eneste sidekant-endring er revert av dødt Ambrose-`formatLabel`-prop, dekket av
grønn full suite). Algoritmen matcher kontraktens spesifikasjon presist, inkludert de subtile
avrundings- og ranking-detaljene. De to nice-to-have-funnene er ikke-blokkerende og kan
adresseres som oppfølgings-issue om ønskelig.
