# Evaluation: F2 — Wizard redesign (issue #272)

**Date:** 2026-05-27
**Branch:** claude/272-wizard
**Verdict:** ACCEPT

## Criteria

### 1. Step 1 viser 4 intent-kort (Kompis/Klubb/Cup/Solo) — mobil-først 2×2-grid
**VERIFIED.** `app/admin/games/new/IntentSelector.tsx:70-75` definerer `TILES` med fire intents i rekkefølgen `kompis`, `klubb`, `cup`, `solo`. Linje 97 setter grid-klassen `grid grid-cols-2 gap-3` (2-col baseline = mobile-først 2×2). Hver tile har `min-h-[140px]` (linje 112) — godt over 44px tap-target. Dedikerte SVG-ikoner per intent (linjer 26–68) i samme inline-stil som format-ikoner. ARIA-mønstret er `radiogroup` med `role="radio"` + `aria-checked` per tile (linje 95, 105–106). Render-test (`IntentSelector.test.tsx:14-36`) bekrefter alle fire roller + onChange-flyt.

### 2. Step 2 (Kompis/Klubb/Solo) leser `getFormatsForIntent(intent)` og viser primary + sekundære
**VERIFIED.** `app/admin/games/new/page.tsx:227-233` forhåndshenter format-katalogen for alle tre intents via parallell `Promise.all` med `getFormatsForIntent('kompis'|'klubb'|'solo')`. Disse passeres til `GameWizard` som `formatsByIntent`-prop (linjer 249-254). `GameWizard.tsx:402-413` leser `formatsByIntent[state.intent]` og render-er `FormatGrid` med den listen. `FormatGrid.tsx:27-28` partisjonerer på `is_primary` i UI-laget (per F1-helperens flate-liste-kontrakt). Primary i 2×2 (3-col tablet+, linje 48). Sekundære i 2-col (linje 92). Render-test (`FormatGrid.test.tsx:38-79`) bekrefter både primary og sekundære radiogroups + onChange.

### 3. Step 2 (Cup) viser lag-navn (2 felt), points-to-win, multi-select av cup-eligible formats
**VERIFIED.** `app/admin/games/new/CupSetup.tsx`:
- Lag-navn 2 felt: linjer 75-92 (`team_1_name`, `team_2_name` med `Input`-komponenter, krevet, maxLength 40).
- Points-to-win: linjer 95-105 (felt-name `points_to_win`, defaultValue "4,5", decimal pattern, hint-tekst).
- Multi-select cup-eligible: linjer 124-164 (kart-ut av `cupEligibleFormats`, checkbox per format, slug-prefiks `cup_format_`, default-all valgt).
- Validerer minst 1 valg: linje 47 (`atLeastOneFormat = selectedFormats.size >= 1`), disabled submit + feilmelding (linjer 165-169, 176).

Render-test (`CupSetup.test.tsx`) verifiserer alle felt + multi-select-toggle-flow + minst-én-validering.

### 4. `/admin/cup/new`-ruten slettet — hard 404 ved direct access
**VERIFIED.** `ls app/admin/cup/new` returnerer "No such file or directory". `grep -rn "/admin/cup/new" --include="*.tsx" --include="*.ts"` finner kun to docstring-referanser (`CupSetup.tsx:17`, `lib/cup/actions.ts:87`) — ingen call-sites. Commit `a3d27a5` removed the route. Next.js 16 routing returnerer 404 for ikke-eksisterende ruter automatisk.

### 5. `app/admin/cup/page.tsx` "Opprett ny Cup"-knapp peker på `/admin/games/new?intent=cup`
**VERIFIED.** `app/admin/cup/page.tsx:102-104`:
```tsx
<Link href="/admin/games/new?intent=cup">
  <Button className="w-full">Opprett ny cup</Button>
</Link>
```

### 6. `app/admin/cup/[id]/page.tsx` "+ Match"-knapp(er) peker på `/admin/games/new?intent=cup&tournament_id=<id>`
**VERIFIED.** `app/admin/cup/[id]/page.tsx:201-212` har to "+ Match"-knapper:
- `+ Singles match` → `/admin/games/new?intent=cup&tournament_id=${id}&game_mode=singles_matchplay`
- `+ Fourball match` → `/admin/games/new?intent=cup&tournament_id=${id}&game_mode=fourball_matchplay`

Begge bærer `intent=cup` og `tournament_id=<id>` — over kontrakt-kravet, men i tråd med design-doc-ens nevning av `?game_mode=` query-param-mønster fra #217.

### 7. Side-tournaments-banner i step 2 for alle intents
**VERIFIED.** `app/admin/games/new/SideTournamentsBanner.tsx` (komplett komponent, info-banner). Inkludert i:
- Standard wizard step 2 (`GameWizard.tsx:477`) — vises uavhengig av om format er valgt.
- Cup-creation-flyt step 2 (`GameWizard.tsx:352`) — etter `CupSetup`.

### 8. Server-action `createGame` kaller `isValidActiveGameMode(slug)` før insert
**VERIFIED.** `app/admin/games/new/actions.ts:13` importerer `isValidActiveGameMode`. Linjer 46-49:
```ts
const modeValid = await isValidActiveGameMode(payload.game_mode);
if (!modeValid) {
  redirect('/admin/games/new?error=invalid_game_mode');
}
```
Kallet er plassert ETTER `buildGameInsertPayload` (linje 35) men FØR `supabase.from('games').insert(...)` (linje 131) — som spesifisert.

### 9. Modus-lock for publiserte spill respekteres i ny intent-picker
**VERIFIED.** `useGameFormState.ts:253` definerer `lockGameMode = initialValues?.lock_game_mode ?? false`. `GameWizard.tsx:345-347` passerer `disabled={state.lockGameMode}` til `IntentSelector`. `IntentSelector.tsx:88-90, 108` respekterer `disabled` med `<fieldset disabled>` + `disabled` på hver button + `disabled:cursor-not-allowed disabled:opacity-50`. I tillegg viser `GameWizard.tsx:394-401` en banner med valgt format og melding "Kan ikke endres etter spill-start" når lockGameMode er på (i stedet for FormatGrid).

### 10. Type C render-tester for step 1, step 2-Klubb, step 2-Cup
**VERIFIED.** Tre dedikerte test-filer:
- `app/admin/games/new/IntentSelector.test.tsx` — én test som rendrer alle 4 kort, verifiserer `aria-checked` per tile, og onChange ved klikk på 3 av 4 tiles.
- `app/admin/games/new/FormatGrid.test.tsx` — én test med Klubb-katalog (4 primary + 1 sekundær), verifiserer partisjonering i UI, både primary- og sekundær-radiogroup, og onChange ved klikk på primary og sekundær.
- `app/admin/games/new/CupSetup.test.tsx` — én test med 2 cup-eligible formats, verifiserer lag-navn-felt, point-mål, multi-select default-all, toggle-flow, og minst-én-validering.

Hver test er fokusert (én `it`-block) per docs/test-discipline.md (maks én render-test per komponent).

### 11. Mobil-skjermbilde verifisert i Safari — manual-only, cannot verify in agent context
**NOT VERIFIABLE FROM AGENT.** Markert som manual-only i kontrakten ("Mobil-skjermbilde verifisert i Safari før merge — alle tap-targets ≥44px"). Tap-targets ER ≥44px i kode: `IntentSelector` har `min-h-[140px]` (langt over), `FormatGrid` primary og sekundære har `min-h-[44px]`, og `CupSetup` checkboxes har `min-h-[44px]`. Reduced-motion respekteres via `motion-reduce:transition-none` i stepper-headeren. Endelig mobil-verifikasjon må gjøres av Jørgen før merge.

### 12. CHANGELOG-oppføring + version bump (1.40.0)
**VERIFIED.** `package.json` har `"version": "1.40.0"`. `CHANGELOG.md` har en ny seksjon `## 1.40.y — Intent-først wizard (Fase 2 av format-katalog-epic)` med stakeholder-tagline (blockquote) og full Teknisk-blokk listende Added (5 komponenter), Changed (GameWizard, useGameFormState, +flere), og dekker også cup-route-fjerning + server-action-validering. Strukturen følger docs/changelog-conventions.md (tema-heading + per-versjon blockquote-tagline + sammenfoldbar Teknisk).

## Gates

### `npx tsc --noEmit`
**PASS for nye/endrede filer.** Pre-eksisterende test-errors i urelaterte filer:
- `app/admin/games/[id]/signups/actions.test.ts`
- `app/games/[id]/withdrawActions.test.ts`
- `app/signup/[shortId]/actions.test.ts`
- `app/signup/[shortId]/teamActions.test.ts`

Alle er TS2556 (spread argument) eller TS2493 (tuple length 0) — vitest-mock-typing-feil, ikke runtime-feil. Ikke berørt av F2-arbeidet. Grep mot F2-filer (`IntentSelector|FormatGrid|CupSetup|GameWizard|formats/icons|wizard/intent|games/new/actions|admin/cup`) returnerer **0 treff** — ingen nye errors fra F2.

### `npx vitest run app/admin/games/new/`
**PASS.** `Test Files 9 passed (9)`, `Tests 94 passed (94)`. Inkluderer de tre nye Type C-testene + eksisterende GameWizard/GameForm/ModeSelector/TeamSizeSelector/useGameFormState/actions-tester.

### `npx vitest run` (full suite)
**PASS.** `Test Files 134 passed (134)`, `Tests 1564 passed (1564)`. Én log-line `"Not implemented: navigation to another Document"` (jsdom kvist, ikke en feil).

### `npm run lint`
**PASS.** `0 errors, 9 warnings`. Alle warnings er pre-eksisterende `no-unused-vars` i urelaterte filer (courses/edit, leaderboard-viewers, GameForm.test.tsx) — ingen i F2-touched filer.

## Verdict reasoning

Alle 11 kode-verifiserbare success-criteria sjekker ut med konkret file:line-evidens. Mobil-skjermbilde-kriterium 11 er eksplisitt manual-only og ikke blokkerende per evaluator-instruksjon. Implementasjonen følger design-doc + kontrakt nøyaktig: intent-først step 1 i 2×2-grid, dynamisk step 2 per intent som leser fra F1-helpers, Cup-flyten smeltet inn som intent (med egen `<form action=createTournamentDraft>`-sub-flyt for å unngå nested-form-HTML), `/admin/cup/new` hard-removed, call-sites oppdatert, server-action-validering på plass, og test-disiplin respektert (én Type C per ny komponent).

Alle gates passerer. Test-suite-utvidelsen er fokusert og innenfor docs/test-discipline.md-grensene. CHANGELOG + version-bump er gjort i samme commit-batch som koden. Disiplin rundt out-of-scope-arbeid (F3 #273 + `tournaments.allowed_match_formats`-persistens utsatt til Wave-2) er eksplisitt dokumentert i CupSetup-docstring. Klart ACCEPT.

## Open notes

- **Manual-only verifikasjon:** Jørgen bør spot-sjekke wizard step 1 + step 2 i iPhone Safari før merge for å bekrefte at 2×2-grid leser greit, tekst ikke wrappet stygt, og tap-targets faktisk er behagelige. Spesielt kort-høyden 140px og sekundær-strip 44px.
- **Deferred (per kontrakt):** Multi-select i `CupSetup` persisterer ikke til `tournaments.allowed_match_formats` ennå — dokumentert i CupSetup-docstring som Wave-2-issue. Default-all-oppsettet betyr at admin ikke får ulempe inntil filtering legges på.
- **Pre-eksisterende tsc-feil i test-filer** (signups/withdrawActions/actions.test): Ikke F2's ansvar, men verdt et eget cleanup-issue hvis dette er nytt — ellers kan det vente til full test-suite-rydd-issuet rakk inn.
- **Wave-2 follow-up som er nevnt i kontrakt:** Format-tile på admin-home er bevisst utsatt; cup-detalj-sidens "+ Match"-knapper viser alle cup-eligible formats inntil multi-select-persistens lander.
