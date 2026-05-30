# Evaluation: Ambrose (#284) — net scramble med team-handicap

**Verdict: ACCEPT**

Independent skeptical re-derivation of all contract success criteria. Every gate passed, every criterion verified by reading code and running commands. No bugs found. One soft UX limitation noted (non-blocking).

## Gate results (re-run myself)

| Gate | Result |
|------|--------|
| `npm run build` | **PASS** — route listing completed without error (the `.test.ts` spread-arg tsc errors that `next build` ignores did not block the build). |
| `npm test` | **PASS** — 170 test files, **1984 tests passed**, 0 failed. |
| `npx vitest run lib/scoring/modes/ambrose.test.ts lib/games/gamePayload.test.ts` | **PASS** — 2 files, **166 tests passed**. |

## Per-criterion verdict

| # | Criterion | Pass/Fail | Evidence |
|---|-----------|-----------|----------|
| 1 | `ambrose.compute(ctx)` returns `kind:'texas_scramble'`; router routes `ambrose` there | **PASS** | `lib/scoring/index.ts:50-51` `case 'ambrose': return ambrose.compute(ctx);`. `ambrose.ts:44` returns `computeScramble(...)` which returns `{kind:'texas_scramble'}` (`texasScramble.ts:185`). Test `ambrose.test.ts:61` asserts `result.kind === 'texas_scramble'`. |
| 2 | `ambroseDefaultPct(2)===25`, `(4)===12.5`; combinedCH 74 @ 12.5% → teamHandicap 9 | **PASS** | `ambrose.ts:30-32` `100/(2*teamSize)` → 25 / 12.5 (NOT the issue's garbled ÷4/÷6). Tests `ambrose.test.ts:40,44` assert 25 and 12.5; `:65-87` asserts combinedCH 74 → teamHandicap 9. `Math.round((74*12.5)/100)=round(9.25)=9` (`texasScramble.ts:113`). |
| 3 | `texasScramble.compute` unchanged after `computeScramble` extraction | **PASS** | `texasScramble.compute` (lines 52-58) reads its own pct and delegates to `computeScramble`; full suite incl. texas tests green (1984 passed). Texas's `parseTexasHandicapPct` integer guard untouched (`gamePayload.ts:727` `Number.isInteger`). |
| 4 | `validateAmbrose` produces `kind:'ambrose'`; rejects 3-team / unbalanced / out-of-range; accepts fractional 12.5 | **PASS** | `gamePayload.ts:749-809` validator; `parseAmbroseHandicapPct:831-837` uses `Number.isFinite` (accepts 12.5, vs Texas integer guard). 6 test cases (`gamePayload.test.ts:1280-1386`): 25% ok, fractional 12.5 ok, team_balance, 3-team→unsupported_mode_size_combo, 101→bad_allowance, draft partial. |
| 5 | Migration 0055 — deferred to post-deploy (deliberate) | **PASS (deferred, sound)** | `0055_ambrose.sql` mirrors `0054_nines.sql` exactly (formats row + intent-mapping, no CHECK change; intent `klubb` per contract). Verified via Supabase MCP: latest applied migration is `0054_nines` (20260529222134); `formats` table has `nines`+`texas_scramble` but **no `ambrose` row**. Deferral reasoning confirmed sound — `FormatGrid` is DB-driven (`getFormatsForIntent`), so seeding the row pre-deploy would render a live Ambrose tile pointing at a `scoring_module` the deployed code lacks. |
| 6 | Admin can create Ambrose game (team_size 2 & 4); shows label "Ambrose" | **PASS (code-verified; live smoke deferred per migration)** | ModeSelector tile `ambrose` (`ModeSelector.tsx:233-238`); `TeamSizeSelector.tsx:61` `ambrose: new Set([2,4])`; `useGameFormState` `isAmbrose` branches + default-pct wiring (`:397-398, :419-420`); validator produces mode_config. Live wizard tile appears only post-migration (expected, not a defect). |
| 7 | Leaderboard renders Texas view with brutto + team-HCP + netto, format-label "Ambrose" | **PASS** | `leaderboard/page.tsx:373` routes via `isScrambleFamily`, passes `formatLabel: MODE_LABELS[game.game_mode]` (= "Ambrose"). `renderTexasScramble` forwards `formatLabel` to both `TexasScrambleView` and `TexasScramblePodium` (lines 1848, 1860). Views default `formatLabel='Texas scramble'` but receive "Ambrose" for ambrose games. Type-guard `result.kind !== 'texas_scramble'` (line 1827) passes since ambrose compute returns texas kind. |
| 8 | `npm run build` green — all exhaustive switches cover `ambrose` | **PASS** | Build succeeded. `GameMode` union, `MODE_LABELS`, router switch, `modeValidators` Record, all per-page `game_mode` unions, and `bruttoHelperFor` switch all include `ambrose`. |
| 9 | Version bump 1.50.0 → 1.51.0 + CHANGELOG entry in `feat` commit | **PASS** | `package.json` version `1.51.0`. CHANGELOG `## 1.51.y — Ambrose` series with tagline blockquote + Teknisk `<details>`; prior `1.50.y` series correctly re-wrapped in `<details>`. Bump landed in `feat(formats)` commit `8c9805a`. |

## Format-name leak audit (criterion b — #1 risk)

Traced every user-facing surface for an ambrose game; the format name resolves via `MODE_LABELS[game_mode]` / `formatLabel` prop = **"Ambrose"** everywhere, never a hardcoded "Texas scramble":

- **Leaderboard view + podium:** `formatLabel` prop threaded from `MODE_LABELS[game.game_mode]`. ✓
- **Game-home (admin detail):** `formatDisplayLabel(game.game_mode, ...)` (`app/admin/games/[id]/page.tsx:401`). ✓
- **Hull-page:** team-card path gated on `texas_scramble || ambrose`; team-HCP read generically (`page.tsx:443`, `HoleClient.tsx:248`). ✓
- **Mail:** subject is `Resultatet er klart — ${gameName}` (game name, never format name); Texas body line is format-agnostic ("Laget endte på X. plass av N lag"). Dispatcher routes ambrose via `isScrambleFamily` → `buildTexasScrambleRecipients`, which sends real `game_mode` to router and sets payload `kind:'texas_scramble'`. ✓
- **modeGuide / spillformer / ModeSelector / ReadyStep:** all have dedicated `ambrose` entries with "Ambrose" label. ✓

All hardcoded `'Texas scramble'` literals are either JSDoc comments, texas-specific tiles/labels, or the default value of `formatLabel` props (overridden for ambrose). **No leak on any ambrose path.**

## Exhaustiveness audit (criterion c)

Grepped every `'texas_scramble'` / `=== 'texas_scramble'` / `kind === 'texas_scramble'` / `isTexas` hit in `app/` + `lib/` (non-test). For each structural gate, confirmed ambrose is also handled:

- **`isScrambleFamily`** used at the 4 structural routing sites: leaderboard routing, admin game-detail team display, mail dispatcher, (+ exported from index). ✓
- **`isTexas` flags** in `holes/page.tsx:102`, `HoleClient.tsx:248` are defined as `texas_scramble || ambrose` — cover ambrose. ✓
- **Wizard `isTexas`/`isAmbrose`** are parallel sibling flags throughout `useGameFormState`, `GameForm`, `GameWizard`, sections — ambrose mirrors texas at every branch. ✓
- **`scorecardLayout.ts:126,137`**, **`scorecardTitle.ts:32-33`**, **`registration.ts:41`**, **`edit/page.tsx:388/397`** all include `|| 'ambrose'` (or a `cfg.kind === 'ambrose'` sibling). ✓
- **`result.kind !== 'texas_scramble'` guards** (leaderboard:1827, mail:687) and **`mode?.kind === 'texas_scramble'`** (notification:181) correctly PASS for ambrose because ambrose's compute returns `kind:'texas_scramble'` and the mail payload is built with `kind:'texas_scramble'`. ✓
- **Texas-SPECIFIC sites correctly left texas-only:** `useGameFormState.ts:392,416` (NGF 10%/25% default), `defaultTexasHandicapPct`, texas helper copy. These have ambrose siblings with the 12.5% default. ✓

No structural gate found that handles bare texas while missing ambrose. **No exhaustiveness bug.**

## Fractional 12.5% end-to-end (criterion d)

- **Validator parse:** `parseAmbroseHandicapPct` uses `Number.isFinite` → accepts 12.5; `parseTexasHandicapPct` retains `Number.isInteger` → Texas unbroken. Verified by both grep and the green test `gamePayload.test.ts:1310` (fractional 12.5 → ok).
- **Wizard default flows through:** `useGameFormState` sets `ambroseHandicapPct = ambroseDefaultPct(teamSize)` on both mode-change (`:397`) and team-size-change (`:419`). The hidden input carries `String(ambroseHandicapPct)` = `"12.5"` (`GameForm.tsx:333`, `GameWizard.tsx:305,709`). `AllowanceField`'s controlled `value={ambroseHandicapPct}` and its internal hidden input (`:215`) also carry `"12.5"`. Default 12.5 reaches the submitted `ambrose_team_handicap_pct` unchanged.
- **AllowanceField NOT broken for Texas:** Ambrose reuses the shared `AllowanceField` faithfully mirroring the Texas wiring (including the harmless double-hidden-input pattern Texas already uses — both inputs carry identical controlled-state values; `FormData.get` returns the first which equals the second). Texas's field config (`GameForm.tsx:461`) is untouched.

## Test-discipline compliance

- Type A: `ambrose.test.ts` (7 focused logic tests) + 6 ambrose cases in `gamePayload.test.ts`. Both tightly scoped to the change.
- **No new Type C render test** — correct, since ambrose reuses Texas's view/podium; a duplicate render test would re-cover #44's surface (per Type C "max one render-test per component" rule). Explicitly noted in CHANGELOG Tests section.
- No copy-pasted mock setup, no gratuitous "while I was here" tests.

## Norwegian copy quality

- Decimal comma + percent spacing correct throughout user copy: `25 %`, `12,5 %` (`GameForm.tsx:494-495`, CHANGELOG, modeGuide).
- No AI-tells: scanned new ambrose strings (ModeSelector, modeGuide, migration short_description, GameForm helpers) for `vennligst`, em-dash chains, "sømløs", etc. — clean.
- modeGuide Ambrose entry uses idiomatic, action-oriented Norwegian consistent with the brand voice.

## Concerns (non-blocking)

1. **Soft UX limitation in `AllowanceField` number input:** The visible number input has `step={1}` and an `Number.isInteger(v)` guard on *change* (`AllowanceField.tsx:193,197`). This means an admin cannot *manually type* a fractional value into the field; if they edit it, the value must land on an integer. The **default 12.5 is preserved if untouched** (it flows through the hidden input and displays correctly at line 194), so end-to-end correctness holds. But an admin who wants to nudge the ambrose lag-handicap to, say, 12.5 after changing it would be unable to re-enter the fractional. This is a minor polish gap, not a correctness bug — the contract (line 61) explicitly allowed "juster minimalt om nødvendig" and the chosen low-risk path (don't touch AllowanceField's integer step, rely on the default flowing through) is defensible. Worth a follow-up issue if fractional manual entry is ever desired, but does not block acceptance.

## Post-deploy follow-up (expected, not a defect)

- Apply migration `0055_ambrose.sql` to prod via Supabase MCP `apply_migration` AFTER the PR merges and deploys, then verify the `formats` row exists with `is_active=true`. Until then the live wizard correctly does not show the Ambrose tile.
- Live Playwright/Safari smoke of the wizard + a couple of hull entries once the migration is applied.
