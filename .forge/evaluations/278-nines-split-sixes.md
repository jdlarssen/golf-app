# Forge-evaluering: #278 — Nines / Split Sixes

**Dato:** 2026-05-30
**Evaluator:** uavhengig skeptisk verifisering (fresh context)
**Branch:** `claude/eager-antonelli-dd18da`
**Commits vurdert:** `a68c4c4`, `0352f9b`, `cd56d15`, `ef28b06`, `579cd0a` (+ docs `64a52b3`)

---

## Verdict: ACCEPT

Alle 8 suksesskriterier verifisert uavhengig. Begge gates grønne (177 målrettede tester + full scoring-sweep 550 grønne; `npm run build` Compiled successfully, exit 0). Tie-split-algoritmen er manuelt sport mot alle påkrevde utfall og stemmer. Scope er ren — ingen lekkasje til andre shipped modes. Ingen blockers, ingen should-fix-funn. To nits (ikke-blokkerende), listet under.

---

## Gates (faktisk output)

### Målrettede vitest-suiter
```
npx vitest run lib/scoring/modes/nines.test.ts lib/games/gamePayload.test.ts \
  app/games/[id]/leaderboard/NinesView.test.tsx \
  app/admin/games/new/sections/NinesSetup.test.tsx

 Test Files  4 passed (4)
      Tests  177 passed (177)
```

### Regresjons-sweep (modeGuide + hele scoring-laget)
```
npx vitest run lib/formats/modeGuide.test.ts lib/scoring/

 Test Files  22 passed (22)
      Tests  550 passed (550)
```

### Full build (AUTORITATIV completeness-gate)
Kjørt UTEN maskerende pipe, eksplisitt exit-kode:
```
EXIT_CODE=0
✓ Compiled successfully in 2.5s
```
Bekrefter at alle uttømmende `Record<GameMode>`-maps og `switch`-er kompilerer med `nines` til stede — ingen manglende exhaustive-member.

**Test-count-sanity:** `nines.test.ts` har 21 `it`/`it.each`-deklarasjoner; den ene `it.each` med 2 parametere ekspanderer til 2 → 22 runtime-tester. Kontraktens «22 tester» er korrekt.

---

## Per-kriterium K1–K8

### K1 — Typer + uttømmende maps: PASS
- `GameMode`-union (`types.ts:18`), `MODE_LABELS` (`types.ts:39`), `GameModeConfig`-variant (`types.ts:185-190`), `ModeResult`-union (`types.ts:1308`) alle inkluderer `nines`.
- `computeLeaderboard`-switch: `case 'nines'` (`index.ts:61-62`); re-eksport av `NinesResult`/`NinesHoleRow`/`NinesPlayerLine` (`index.ts:132-134`).
- Uttømmende `Record<GameMode>`-maps verifisert: `MODE_LABELS` (types.ts), `MODE_SUMMARY_LABELS` (ReadyStep.tsx:59), `ENABLED_COMBOS` (TeamSizeSelector.tsx:83 = `Set([1])`), `MODE_GUIDE` (modeGuide.ts:133). Alle har `nines`.
- **Kritisk: hardkodede literal-union-mirrors.** `app/games/[id]/page.tsx:81-94` — `game_mode`-literal-union INKLUDERER `'nines'` (linje 94). `HoleClient.tsx:64` bruker importert `GameMode`-type direkte (ikke lokal mirror) → arver `nines` automatisk. Ingen drift.
- Ingen `@ts-expect-error`/`@ts-ignore`/`as any`/`as never` i nines-source-filer (kun i test-fixtures, forventet). Build exit 0 bekrefter ingen skjult gap.

### K2 — Scoring-modul: PASS
`lib/scoring/modes/nines.ts` `compute()`:
- Pot: `nines → [5,3,1]`, `split_sixes → [4,2,0]` (linje 131).
- `effectiveFor` (linje 44-52): `gross` direkte, eller `gross − strokesForHole(courseHandicap, strokeIndex)` — korrekt net/brutto via `strokesForHole`.
- Defensiv fallback (linje 124-129): manglende/feil `nines_variant` → `'nines'`, `nines_scoring` → `'net'`. Speiler skins.ts.
- Pending (linje 151-165): `cells.some(c => c.gross === null)` → alle 0, `pending:true`, `continue` (hopper over working-total-oppdatering). **INGEN carryover-flag** — neste hull-iterasjon starter friskt. Bekreftet at pending IKKE fryser senere hull.
- `pot[k] ?? 0` for out-of-range (linje 187) — degraderer trygt for n≠3.

**Manuell algoritme-tracing (alle påkrevde utfall):**

| Situasjon | Nines (sort asc, group-walk) | Resultat | Split Sixes | Resultat |
|---|---|---|---|---|
| To delt lavest | grp[0,1]=(5+3)/2=4, grp[2]=1 | **[4,4,1]** ✓ | (4+2)/2=3, 0 | **[3,3,0]** ✓ |
| To delt høyest | grp[0]=5, grp[1,2]=(3+1)/2=2 | **[5,2,2]** ✓ | 4, (2+0)/2=1 | **[4,1,1]** ✓ |
| Alle tre delt | grp[0,1,2]=(5+3+1)/3=3 | **[3,3,3]** ✓ | (4+2+0)/3=2 | **[2,2,2]** ✓ |
| Tre ulike | size-1 grupper | [5,3,1] ✓ | [4,2,0] ✓ |

Pot-sum-invariant holder for alle: fullt hull summerer alltid til 9 (Nines) / 6 (Split Sixes), inkl. tie-splits (group-walk fordeler nøyaktig hele potten).

### K3 — Type A unit-tester: PASS (ikke hollow)
`nines.test.ts` 22 cases asserter EKSAKTE poeng-verdier, ikke bare shape:
- Tre-ulike + alle tie-permutasjoner for BEGGE varianter med eksplisitte `toBe(4)`/`toBe(2)`-asserts + pot-sum-total-sjekk.
- Net-vs-brutto-flip (linje 346-389): samme gross, ulik CH → net-ranking [1,4,4] vs gross-ranking [2,2,5] — ekte flip verifisert.
- `effectiveScore` eksponert korrekt i `perPlayer` (linje 391-416).
- Pending: senere fully-scored hull deler ut poeng (linje 453-465); eksplisitt «ingen carryover»-test (linje 468-493).
- Multi-hull-akkumulering + shared rank + `tiedWith` (linje 500-552).
- Tom state (alle rank 1, tiedWith=2 andre), defensive defaults, pot-sum-invariant via `it.each`.
Delte fixtures (`makeCtx`/`makePlayer`/`par4Holes`) — ingen kopier-lim-mock.

### K4 — Validator + regresjonstest: PASS
`validateNines` (`gamePayload.ts:1226-1264`):
- `players.length < 3` → `min_players_for_mode` (linje 1247); `> 3` → `too_many_players_for_mode` (linje 1250).
- `mode_config` = `{kind:'nines', team_size:1, nines_variant, nines_scoring}` (linje 1257-1263).
- `parseGameMode` whitelist inkluderer `raw === 'nines'` (linje 244).
- `modeValidators` Record: `nines: validateNines` (linje 1282).
- `parseNinesVariant`/`parseNinesScoring` (linje 1205-1215) speiler `parseSkinsScoring` med defensive defaults.
6 regresjonstester (`gamePayload.test.ts:2330-2413`) ekserserer ekte: 3-spillere-ok-med-default-config, 2→min, 4→too_many, duplikat, variant+scoring-parse (split_sixes+gross), draft-med-1-ok. Ikke hollow.

### K5 — Migrasjon: PASS
`supabase/migrations/0054_nines.sql`:
- `formats`-rad: slug `'nines'`, display `'Nines / Split Sixes'`, icon_key `'nines'`, `scoring_module '@/lib/scoring/modes/nines'`, `is_active true`, `is_cup_eligible false`.
- `format_intent_mapping`: `('nines','kompis',true,false,71)` — sekundær (is_primary false).
- Kolonne-listene matcher sibling 0051 (skins) / 0053 (bbb) EKSAKT: `(slug, display_name, icon_key, short_description, scoring_module, is_active, is_cup_eligible)` + `(format_slug, intent, is_visible, is_primary, sort_order)`. Plain insert, ingen `on conflict` — som siblings. Ingen ny tabell (strokeplay-utledet).
- sort_order 71 kolliderer ikke med andre migrasjoner. (Skins=70, BBB=90; 71 er unik.)
- **Ikke applisert mot DB ennå — forventet deploy-steg, ikke en defekt.**

### K6 — Leaderboard-visning + podium: PASS
- Dispatch: `if (game.game_mode === 'nines') return renderNines({...})` (`leaderboard/page.tsx:449`).
- `renderNines` (`page.tsx:2402-2511`): bygger `ScoringContext` fra raw rows (par_mens/ladies/juniors + parByGender som siblings), kaller `computeModeResult`, guard `result.kind !== 'nines'` → `notFound()` (linje 2458). Finished → `<NinesPodium>` + `<NinesView chromeless>`; ellers `<NinesView>` alene. `scoreVisibility` + `gameStatus` propagert.
- `NinesView.tsx`: reveal-hiding `isRevealHidden = scoreVisibility === 'reveal' && gameStatus !== 'finished'` (linje 79-80) — matcher SkinsView-pattern. Rangert tabell + per-hull-rutenett (`tabular-nums`), tied-label («Delt {rank}. plass» + `T{rank}`), pending → «—» + «Venter på score».
- `NinesPodium.tsx`: topp-3 Medallion + ConfettiBurst (distinkt key `torny-nines-podium-confetti-seen-`), `totalPoints` metrikk, flat rest-liste (defensiv for <3). Speiler BingoBangoBongoPodium.
- Type C `NinesView.test.tsx`: meningsfull — asserter 3 spiller-rader, tied-indikator på begge T1, pending-hull-tekst, og at reveal-mode skjuler `nines-leaderboard`/`nines-hole-list`. Re-asserter IKKE Type A-matematikk (leser kun fixture-verdier i riktig rad).
- Live browser-verifisering utsatt til migrasjon kjørt mot delt prod-DB (deploy-steg) — render-test + build er stående UI-bevis, per kontrakt.

### K7 — Wizard: PASS
- `useGameFormState.ts`: `ninesVariant`/`ninesScoring`-state med defensive defaults (linje 275-279), `isNines` (444), `ninesPlayersValid = exactly 3` (847-848), `defaultTeamSizeForMode('nines') → 1` (solo-player-selection), `canPublish`-gate inkluderer `isNines` (895), `missingForPublish` med «Nines krever nøyaktig 3»-melding (1013-1023).
- `GameWizard.tsx`: `<NinesSetup>` gated på `state.isNines` (460-461); hidden inputs `nines_variant`+`nines_scoring` gated på `isNines` (700-703); mode_config-wiring (307-308).
- `NinesSetup.tsx`: variant-radio (Nines «9 poeng per hull (5–3–1)» / Split Sixes «6 poeng per hull (4–2–0)») + netto/brutto-radio (default netto). `role="radiogroup"`, sr-only inputs, korrekte labels.
- Ikon: `NinesIcon` + `nines: NinesIcon` i `ICON_MAP` (`lib/formats/icons.tsx:187-243`) — samme fil/pattern som BBB ble lagt til. (Se Nit 1 om ModeSelector.)
- `GameForm.tsx` (legacy edit-form) threader også `nines_variant`/`nines_scoring` for prefill.
- Type C `NinesSetup.test.tsx`: verifiserer begge radio-grupper, default-valg, og onChange-firing. Disiplinert.

### K8 — CHANGELOG + versjon: PASS
- `package.json`: `1.50.0` (MINOR bump fra 1.49.0). Release-commit `579cd0a`.
- `CHANGELOG.md`: `## 1.50.y — Nines / Split Sixes`-tema-heading + `### [1.50.0]`-oppføring med tagline-blockquote + `<details>Teknisk`. Tre-lags-struktur per docs/changelog-conventions.md. 1.49.y-serien wrappet under (commit-msg-hook passerte → version+CHANGELOG staget sammen).
- Tagline-copy er idiomatisk, action-orientert norsk — ingen AI-tells.

---

## Issues found

**Ingen blockers. Ingen should-fix.** To nits (ikke-blokkerende, ingen handling påkrevd for ACCEPT):

1. **(nit) `ModeSelector.tsx` har ikke `nines`-ikon.** Det finnes to ikon-maps: `lib/formats/icons.tsx` (wizard step 2 / FormatGrid / CupSetup — HAR `nines`) og `app/admin/games/new/ModeSelector.tsx` (legacy `GameForm.tsx`-path, inline icon-map). ModeSelector lister kun 5 eldste modes og mangler HELE kompis-batchen (wolf/nassau/skins/bbb/nines). Dette er konsistent med presedensen — BBB la også kun til `lib/formats/icons.tsx`, ikke ModeSelector. Ikke en regresjon, og den nye wizarden (FormatGrid) er den primære opprett-flyten. Hvis ModeSelector noen gang skal vise kompis-batchen er det et separat, allerede-eksisterende gap som ikke hører til dette issuet.

2. **(nit) `NinesView.test.tsx` asserter `playerRows[0].textContent).toContain('5')`.** Dette leser en poeng-verdi fra fixture (ikke Type A-derivert matematikk), så det er innenfor test-disiplinen (verifiserer at totalen rendrer i riktig rad). Strengt tatt en tall-assert i en Type C-test, men forsvarlig som «riktig spiller har riktig total i UI» snarere enn re-test av scoring. Ikke verdt en endring.

---

## Scope-sjekk: REN

- `git diff origin/main -- app/admin/games/new/useGameFormState.ts`: KUN nines-relaterte tillegg. `defaultTeamSizeForMode` la til ÉN `nines`-case — ingen nassau/skins/bbb-modifikasjon. Den out-of-scope `defaultTeamSizeForMode`-endringen kontrakten nevnte er bekreftet reversert.
- Full feature-diff (22 filer, +2475/−8): `git diff origin/main --name-only | grep -iE "nassau|skins|wolf|bingo|stableford|bestBall|texas|fourball|foursomes|matchplay|solo"` (eksl. nines) → **tom**. Ingen annen mode-source rørt.
- `−8` deletions er in-place linje-modifikasjoner (f.eks. `: false` → `: isNines ? ...`-ternary, gate-arrays utvidet), ikke fjerning av eksisterende features.
- Regresjons-sweep 550 grønne bekrefter ingen utilsiktet skade på andre modes.

---

## Deploy-noter (ikke defekter)

- `0054_nines.sql` må applisere mot Supabase prod-DB før formatet er valgbart i UI (format-row + intent-mapping styrer FormatGrid-synlighet). Forventet deploy-steg.
- Live preview-verifisering av leaderboard/podium krever migrasjon applisert + app mot delt prod-DB. Render-tester + build dekker dette i mellomtiden, per kontrakt.
