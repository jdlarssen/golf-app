# Evaluation: Klubbhuset-polish (#863)

**Verdict: ACCEPT**

**Date:** 2026-06-22
**Branch:** `claude/elegant-gould-1def25`
**Contract:** `.forge/contracts/863-klubbhuset-polish.md`
**Commits reviewed:** `0d70fa20` (refactor: read display name from role context) + `63629845` (fix: nav active-state, kickers, plurals, locale leaks, tile feedback)
**Parent:** `eb81d1bb`

All eight success criteria pass with concrete evidence. All three independently-run gates are green (tsc exit 0, BottomNav vitest 4/4, i18n parity 3520==3520). No scope creep, no dangling imports, no JSON corruption, no accidental kicker hits.

## Per-criterion table

| K | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| K1 | `also` array includes `/klubber` + `/spillformater`; test extended + green | PASS | `BottomNav.tsx:86-92` adds both entries (existing 3 retained). `BottomNav.test.tsx:54-60` loop extended with `/klubber`, `/klubber/abc`, `/spillformater`, asserts `aria-current="page"`. Vitest: 4 passed. |
| K2 | `PlayerKlubbhus` drops `getAdminContext()` + `users.select('name')`; uses `firstName(role.name)`; import still used elsewhere | PASS | `TilesGrid.tsx:263` = `firstName(role.name)`; the `getAdminContext()` call + `users` query removed (diff). `getAdminContext` import retained at `TilesGrid.tsx:22` and still used at `TilesGrid.tsx:39` (`TilesGrid` component) — not dangling. |
| K3 | `GreetingCard` drops `users.select('name')`; name via `firstNameValue` prop from `role.name`; `getAdminContext` import removed from page.tsx | PASS | `page.tsx:62` passes `firstNameValue={firstName(role.name)}`; `GreetingCard` body no longer queries `users`. Import line changed from `{ getAdminContext, getRole, TIME_OF_DAY_KEY }` to `{ getRole, TIME_OF_DAY_KEY }` (`page.tsx:12`). Only remaining `getAdminContext` mention in page.tsx is a comment (`:19`). tsc green confirms no unused-import / undefined-symbol break. `role` in scope via `getRole()` at `page.tsx:26`. |
| K4 | Three distinct kickers; `admin.nav.klubbhus` unchanged; no other "Klubbhuset" kicker changed | PASS | `klubb.list.kicker`: no «Klubber» / en «Clubs». `klubbhuset.kicker`: no «Spill» / en «Games». `admin.nav.klubbhus` = «Klubbhuset» (untouched, `no.json:2518`). Remaining `"kicker": "Klubbhuset"` at `no.json:3476/3489/3712` are liga ledger/create/delete sub-pages — untouched by diff. `nav.clubhouse` = «Klubbhuset»/«Clubhouse» (untouched, `:53`) → BottomNav tab label preserved. |
| K5 | `metaActiveAndPlanned` ICU plural in both locales, correct at n=1 | PASS | no.json: `{active, plural, one {# aktiv} other {# aktive}} · {planned, plural, one {# planlagt} other {# planlagte}}`. en.json mirrors form (masked adjectives). n=1 → «1 aktiv · 1 planlagt». |
| K6 | No hardcoded NO in page.tsx:66/125 or ActivityLedger.tsx:17/109/117/151; new keys in both locales | PASS | page.tsx pull-quote → `{t('pullQuote')}`; greeting-skeleton label → `{saksbehandlerLabel}` prop fed `t('saksbehandlerLabel')`. ActivityLedger: `shortName` now takes `fallback` param; all 3 call sites pass `t('ledgerUnknown')`; game fallbacks → `t('ledgerGameFallback')`; club invite → `t('ledgerClubInvite')`. Grep confirms NO literal `'(ukjent)'`/`'(spill)'`/`'klubbinvitasjon'` remain. New keys present in BOTH no.json + en.json (`:2551-2554`). |
| K7 | Tile links have focus-visible ring + color-based active/hover; no unguarded transform | PASS | `TilesGrid.tsx:209` className adds `transition-opacity duration-100 hover:opacity-95 active:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40`. Ring matches `Button.tsx:11`. Opacity-based (not transform) → no `prefers-reduced-motion` concern. Shared `TileGridView` → inherited by admin + player grids. |
| K8 | Exactly ONE PATCH bump (1.133.82→1.133.83) + CHANGELOG nested under open 1.133.y theme; other commits no bump | PASS | `package.json`: single version line change 1.133.82→1.133.83. CHANGELOG `[1.133.83]` entry sits under `## 1.133.y — Helse- og flyt-audit` (the open theme). Refactor commit `0d70fa20` touches NO package.json/CHANGELOG. |

## Gate outputs (run independently)

| Gate | Result |
|------|--------|
| `nvm use 22` + `npx tsc --noEmit` | **exit 0** (Node v22.23.0) |
| `npx vitest run components/ui/BottomNav.test.tsx` | **4 passed (4)** — 1 file passed |
| i18n leaf-key parity (node script) | **no=3520, en=3520, missing-in-EN=0, missing-in-NO=0, both JSON valid** |
| `npx eslint` on 5 changed source files | **exit 0** (clean) |

## Adversarial findings

- **JSON validity / parity:** Both message files parse; leaf counts equal (3520/3520); zero missing keys either direction. No corruption.
- **Kicker targeting:** Diff changed exactly two `"kicker"` values away from "Klubbhuset" (klubb.list, klubbhuset). The other three "Klubbhuset" kickers (liga ledger/create/delete, no.json:3476/3489/3712 — note: liga sub-pages, contract mis-cited them as ~3472/3485/3708 club sub-pages, but they are correctly untouched regardless) are intact. `admin.nav.klubbhus` and `klubbhusLabel` still "Klubbhuset".
- **BottomNav tab label:** `nav.clubhouse` unchanged → tab still reads «Klubbhuset». PASS.
- **Dangling imports:** None. `getAdminContext` kept in TilesGrid (still used :39), removed from page.tsx (now unused there). tsc green confirms.
- **Scope creep:** Diff touches only the 7 contract files + package.json/package-lock/CHANGELOG. Nothing from out-of-scope #864 (command center), #892 (player redesign), or back-office wording (Norwegian back-office strings unchanged — only keyed for parity, English equivalents are new keys). Clean.

## Minor observation (non-blocking, not a criterion failure)

The contract's *suggested* commit ordering (Key Decisions) was to land refactor/i18n tasks 2,3,4,5,6 as separate no-bump commits *first*, then 1+7 with the bump last. In practice only tasks 2+3 are in the no-bump `refactor` commit; tasks 1,4,5,6,7 are bundled into the single bumped `fix(...)` commit. This is a stylistic deviation, not a contract-criterion miss — K8 requires exactly one PATCH bump covering the user-visible work (satisfied), and the commit-msg hook would in any case demand the bump on a user-visible `fix(...)` commit. CHANGELOG explicitly documents the split. No action needed.

## Conclusion

ACCEPT. The build implements all 7 tasks exactly as specified, keeps scope tight, preserves the protected back-office voice and the «Klubbhuset» tab/hub identity, and passes every gate.
