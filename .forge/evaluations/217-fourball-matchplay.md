# Evaluation: #217 four-ball matchplay

**Verdict:** ACCEPT
**Date:** 2026-05-26
**Evaluator:** Claude Opus 4.x (forge:evaluate sub-agent)

## Criteria checklist

- [x] **Migrasjon 0045 + types.ts:** `supabase/migrations/0045_fourball_matchplay.sql:16-32` utvider CHECK + legger til `fourball_allowance_pct smallint NOT NULL DEFAULT 85 CHECK (0..100)`. `lib/database.types.ts:795,809,823` har `fourball_allowance_pct: number` i Row/Insert/Update for tournaments. `game_mode`-kolonnen er `string` i types.ts (Supabase-CLI-konvensjon — CHECK håndheves på DB-nivå, ikke literal-typed; konsistent med eksisterende mønster i samme fil).
- [x] **Scoring-modul TDD:** `lib/scoring/modes/fourballMatchplay.ts:1-232` gjenbruker `bestBallForHole`, `classifyMatchplayHole`, `computeMatchResult`, `applyAllowance`, `strokesForHole`, `parFor`. `lib/scoring/modes/fourballMatchplay.test.ts` har **17 tester** (≥12 krav) som dekker mat-em, AS, 1up, tied hole, unplayed-hole, one-partner-unplayed, contributors-tie, allowance 0/50/85/100, blandet-kjønn-parByGender, og 4 empty-shell-stier. Run: `npx vitest run lib/scoring/modes/fourballMatchplay` → **17 passed**.
- [x] **GameMode-plumbing:** `lib/scoring/modes/types.ts:11` (union), `:25` (MODE_LABELS = 'Fourball'), `:68,645` (GameModeConfig + ModeResult), `lib/scoring/index.ts:40` (switch-case). `npx tsc --noEmit` clean.
- [x] **Validator 2v2:** `lib/games/gamePayload.ts:722-806` med 4-player + 2-2 split-håndheving og range 0..100 på allowance. **15 fourball-tester** i `gamePayload.test.ts:1176-1500+` dekker 3-spiller, 5-spiller, 3-1-fordeling, alle-på-én-side, bad_team(3), duplikat. Run: `npx vitest run lib/games/gamePayload` → **93 passed**.
- [x] **fourball_allowance_pct lagres i tournaments + pre-fylles i wizard:** `app/admin/cup/new/page.tsx` + `lib/cup/actions.ts` skriver til DB. `app/admin/games/new/page.tsx:137-166` `loadCupContext` leser kolonnen og returnerer pre-fill. `GameWizard.tsx:242,305-306` mounter `FourballAllowanceField` med seed-verdi.
- [x] **Netto/brutto-toggle:** `components/cup/FourballAllowanceField.tsx:83-91` — `selectMode('brutto')` → `commitPct(0)`. Synkron husking av siste netto-verdi i `lastNettoPct`. Pre-valg ut fra seed-verdi (0 = brutto, ellers netto). Brukes både i cup-create og wizard.
- [x] **Cup-detalj two-button:** `app/admin/cup/[id]/page.tsx:202-211` — to lenker `?game_mode=singles_matchplay` og `?game_mode=fourball_matchplay`, begge med `?tournament_id`.
- [x] **getCupSnapshot fourball-handling:** `lib/cup/getCupSnapshot.ts:275-318` — type-narrow på `mode_config.allowance_pct`, kjører `computeFourballMatchplay`. `formatSideLabel` joiner navn med «/».
- [x] **Lag-fokusert result-tekst:** `app/cup/[id]/page.tsx:151-158` og `app/admin/cup/[id]/page.tsx:242-249` — `gameMode === 'fourball_matchplay' ? team_X_name : teamXPlayerName`.
- [x] **Wizard ender opp med riktig mode_config:** Validator-output `{kind, team_size: 2, teams_count: 2, allowance_pct}` (gamePayload.ts:776-781) — testet i happy-path-case ved linje 1207.
- [x] **Manuelt røyk-test:** out-of-scope for evaluator; merket som DEFERRED til prod-deploy per kontrakt.
- [x] **CHANGELOG + 1.38.0:** `package.json` version = `"1.38.0"`. `CHANGELOG.md:17-30+` har tagline-blockquote («Du kan nå sette opp fourball-matches …») + Teknisk-details med fil-lenker.

## Gates

- [x] **tsc:** `npx tsc --noEmit 2>&1 | grep -v <preexisting test files>` → empty output.
- [x] **vitest scoped:** `npx vitest run lib/scoring/modes/fourballMatchplay lib/games/gamePayload lib/cup/computeCupLeaderboard` → **121 passed** (17 + 93 + 11). (Note: `lib/cup/getCupSnapshot` har ingen dedikert test-fil — dekkes via cup-leaderboard.)
- [x] **lint:** `npm run lint` → **0 errors, 9 warnings** — alle warnings er pre-existing `_underscore`/`_gameId`/`_gameStatus`/`_formData`-mønster (per kontrakt-instruks OK).

## Risks audited

- **Brutto path (allowance_pct=0):** Validator aksepterer 0 (range 0..100 inklusivt, gamePayload.ts:804). `FourballAllowanceField.selectMode('brutto')` commit'er pct=0. Scoring-modulen sender 0 til `applyAllowance` → `effectiveHandicap=0` → `strokesForHole(0, SI)=0` → netto = gross. Dekket av test «allowance 0% (brutto)» linje 266.
- **Mode_config robustness:** `getCupSnapshot.ts:280-287` type-narrower defensivt med `typeof === 'number'`, defaulter til 100 hvis missing. `fourballMatchplay.ts:76-82` har identisk defensive read. Malformed JSON fra Supabase kaster ikke.
- **Mixed-gender tees:** Test ved linje 385 verifiserer `side1Par=4` (mens) vs `side2Par=5` (ladies) på samme hull via `parFor(hole, side.players[0].teeGender)`. Korrekt per #240-mønster.
- **Validator gates:** 3 → `min_players_for_mode`. 5 → `too_many_players_for_mode`. 4 men 3-1 → `team_balance`. 4 men alle-på-1 → `team_balance`. bad_team(3) og duplicate_player gate-er separat. Alle 5 testene i gamePayload.test.ts:1247-1318.
- **holesPlayed semantics:** Modulen inkrementerer kun ved `side1_wins`/`side2_wins`/`tied` — IKKE ved `unplayed`. Matcher singles.

## Issues found

Ingen BLOCKER eller SHOULD-FIX. Implementasjonen følger kontrakten 1:1 med eksemplarisk gjenbruk av eksisterende helpers.

NIT (ikke krav på fix): `lib/cup/getCupSnapshot.ts` har ingen dedikerte unit-tester for fourball-stien — dekkes indirekte via cup-leaderboard. Kunne vurderes som oppfølger.

## Verdict explanation

Alle 11 success criteria oppfylt med konkrete bevis. Alle 6 gates (5 tekniske + 1 røyk-test deferred til prod) er grønne. Scoring-modulen er en ren composition av eksisterende helpers — null duplisering, ren TDD-disiplin (17 tester, ≥12 krav). Validatoren håndhever alle boundary cases inkludert allowance=0 (brutto). Cross-cutting concerns (mode_config robustness, mixed-gender, holesPlayed-semantikk) er alle dekket med tester. Eksemplarisk leveranse.
