# Evaluation: Nassau (issue #276)

**Verdict:** ACCEPT
**Date:** 2026-05-28
**Branch:** claude/busy-joliot-d9258e
**Commits evaluated:** 411b8a7 → 7e0ac44 (6 commits)

## Success Criteria

- [✓] Migrasjon `0050_nassau.sql` seeder format-row + intent-mapping. Verifisert via Supabase MCP:
  `formats[slug=nassau]` → `{display_name: Nassau, is_active: true, is_cup_eligible: false, scoring_module: '@/lib/scoring/modes/nassau'}`. `format_intent_mapping[nassau]` → `{intent: kompis, is_visible: true, is_primary: true, sort_order: 60}`.
- [✓] `lib/scoring/modes/nassau.ts` eksporterer `compute(ctx): NassauResult` (linje 176-287). Algoritmen er korrekt: tre seksjoner regnes hver for seg via `rankTeams` med `UNPLAYED_PADDING=999` padding til 18 elementer; vinner kun når `rank===1` etter cascade og ingen tie. Defensive fallback til 'net' når `mode_config.nassau_scoring` mangler (linje 178-182). Push-på-tie: `winnerUserIds.length > 1` ⇒ ingen unit (linje 222-232).
- [✓] `lib/scoring/modes/nassau.test.ts` har 25 Type A unit-tester (kontrakt krever ≥18). Cases er meningsfullt varierte: clean-win per seksjon, sweep, push på alle tre seksjoner, pending-state for 0/7/14 hull, partial play (én spiller komplett, annen 5/9), gross vs net, defensive fallback ved manglende `nassau_scoring`, 2-4 spillere, ulike unit-counts inkl. tiebreak på `total18EffectiveStrokes` med stabil userId-tertiær, samt strokeIndex-allokering. `npx vitest run lib/scoring/modes/nassau` → 25/25 grønne.
- [✓] `lib/scoring/index.ts` router har `case 'nassau': return nassau.compute(ctx)` (linje 49-50) og re-eksport av Nassau-typene (linje 106-109).
- [✓] `lib/scoring/modes/types.ts` har alle fire nye typer (linje 966-1017), `GameMode` utvidet (linje 14), `GameModeConfig` (linje 117-126), `MODE_LABELS` (linje 31), `ModeResult` (linje 1048).
- [✓] `lib/games/gamePayload.ts` `validateNassau` (linje 1022-1058): 2 ≤ players ≤ 4 ved publish; 0/1 → `min_players_for_mode`, 5+ → `too_many_players_for_mode`, dup → `duplicate_player`; solo team/flight null; `nassau_scoring` parse-helper defaulter til 'net' (linje 1064-1068). 12 validator-tester verifiserer alle disse veiene + draft-toleranse. Wired i `parseGameMode` (linje 240) og `modeValidators` (linje 1082).
- [✓] `lib/games/allowanceCopy.ts` har `case 'nassau':` (linje 33-37) som speiler `wolf:`-mønstret med type-completeness-tekst.
- [✓] Wizard step 2: `NassauSetup.tsx` rendres når `isNassau` (GameWizard linje 441-447), TeamSizeSelector skjules (linje 422), hidden `nassau_scoring`-input emitteres (linje 668-670). 2 Type C render-tester grønne.
- [✓] `NassauView.tsx` rendrer tre stacked sections via `result.sections.front9/back9/total18` (linje 144-164). Push viser «Delt 1.-plass» (linje 254-261), pending «Venter på spilte hull» (linje 264-275), reveal-modus viser «Resultatene avsløres etter runden» (linje 100-118). 4 Type C render-tester grønne.
- [✓] `NassauPodium.tsx` rendrer 1./2./3.-plass på `result.players` (allerede sortert på rank, linje 92-95) med F9/B9/T18 unit-badges per podium-step (`UnitBadges`, linje 343-381).
- [✓] Sweep-celebration: `sweeper = first.units === 3 ? first : null` (linje 97) renderer test-id `nassau-sweep` med strengen «Hele tavla!» + «Tok alle tre seksjoner» (linje 113-125). Idiomatisk norsk, kompis-ethos. Test-en `Hele tavla! vises ved units=3` verifiserer dette.
- [✓] Push-på-tie verifisert i `nassau.test.ts` (linje 189-249): identisk front-9-array ⇒ `winnerUserIds.length > 1` ⇒ verken `u1` eller `u2` får unit. Tre identiske 18-hull ⇒ alle tre i `winnerUserIds`, ingen units.
- [✗ deferred] E2E golden-path: `e2e/games/nassau.spec.ts` er auth-gate-only (2 redirect-tester), speiler `e2e/games/wolf.spec.ts` direkte. Deferral er JUSTIFIED — Wolf-precedent er etablert og scoring-korrekthet er dekket av 25 Type A + render-tester.
- [✓] Norsk copy: ingen «vennligst», ingen em-dash-kjeder, ingen «Tap»-anglism i `NassauSetup/NassauView/NassauPodium`. «Hele tavla!» + «Venter på spilte hull» + «Delt 1.-plass» + «Med handicap (netto)/Brutto» er idiomatiske norske vendinger. Pre-commit-hook fanget ingenting i diff-en (humanizer ren).
- [✓] CHANGELOG: `## 1.44.y — Nassau`-tema-heading + `### [1.44.0] - 2026-05-28`-oppføring med tagline-blockquote + Teknisk-details. Wolf-serien (`## 1.43.y`) wrappet i `<details>`. `package.json.version === "1.44.0"`.
- [user-side] Manuell verifikasjon i iPhone Safari: USER-SIDE.

## Gates

- [✓] `npx vitest run lib/scoring/modes/nassau`: 25/25 passed (1 file, 352ms)
- [✓] `npx vitest run lib/games/gamePayload`: 131/131 passed
- [✓] `npx vitest run NassauSetup`: 2/2 passed
- [✓] `npx vitest run NassauView NassauPodium`: 6/6 passed
- [✓] `npx vitest run` (full suite): 1765/1765 passed, 151 files
- [✓] `npm run lint`: 0 errors, 11 warnings (alle `_gameId` unused-param-konvensjon, deles av alle View-komponenter — ingen Nassau-spesifikk)
- [⚠ baseline] `npx tsc --noEmit`: kun pre-eksisterende errors i `app/admin/games/[id]/signups/actions.test.ts`, `app/games/[id]/withdrawActions.test.ts`, `app/signup/[shortId]/actions.test.ts`, `app/signup/[shortId]/teamActions.test.ts`. Ingen nye Nassau-relaterte errors. Baseline-status godkjent.

## Findings

### Critical (blocking)

Ingen.

### Important (should fix before merge)

Ingen.

### Nitpicks / nice-to-have

- **Hidden-input-passthrough har en liten støy:** `GameWizard.tsx` har en kommentar (`// wolf_scoring lagt til i initialValues-passthrough på samme måte`) i commit-meldingen som peker på Wolf, men commit la også til `nassau_scoring`-passthrough. Kommentar-presisjon, ikke korrekthets-issue.
- **`NassauSection.holesPlayed` per spiller har riktig pending-semantikk**, men det er ikke en eksplisitt test som verifiserer at en spiller med exactly 0/9 hull rangerer bak en med 9/9 (padding-strategien). Implisitt dekket via partial-play-testen, kunne vært en egen case.
- **Sweep-celebration trigges når `first.units === 3`** — hvis to spillere skulle ha 3 units (matematisk umulig siden 3 seksjoner finnes), ville bare første sett feiringen. Edge case er logisk umulig (en seksjon = én vinner alene = unique unit), så ingen ekte risk.

## Deferred Items (judgment)

- **E2E golden-path:** JUSTIFIED. Wolf-precedent (`e2e/games/wolf.spec.ts`) har identisk shape (kun auth-gate). Scoring-korrekthet er dekket av 25 Type A scoring-cases + 12 validator-cases + 6 render-tester. Det er ingen scenario der en E2E ville fanget noe Type A-suiten ikke gjør for et rent solo-strokeplay-derivat uten per-hull-state.
- **Manuell iPhone Safari:** USER-SIDE. No action needed.

## Recommendation

**Ready to ship via PR.**

Implementasjonen er gjennomtenkt og spec-tro. Algoritmen er klar og delegerer korrekt til `rankTeams`-cascade. Test-dekningen er rikelig (25 + 12 + 6 = 43 nye tester) og varierte cases dekker push-på-tie, pending, partial play, gross vs net, og defensive fallback. Migrasjon er live i Supabase. Norsk copy er idiomatisk og fri for AI-tells. CHANGELOG + version-bump følger disiplinen. Gates passerer rent på første kjøring. Wolf-precedent for E2E-deferral er forsvarlig.
