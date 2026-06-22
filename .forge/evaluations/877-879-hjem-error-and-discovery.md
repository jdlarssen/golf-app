# Evaluation: Hjem-bunt #877 + #879

## Verdict: ACCEPT

Two commits on `claude/fervent-cannon-7c6c82` (`df5fc9c6` #877, `11d9a4a7` #879). All 4 automated gates pass, all 7 success criteria independently verified against the code, the preview-mode rendering logic was confirmed via a throwaway render test, and no Out-of-Scope guardrail was violated.

## Gate results

| Gate | Command | Result |
|------|---------|--------|
| Type-check | `npx tsc --noEmit` | **PASS** — exit 0 |
| Lint | `npx eslint app/[locale]/page.tsx app/[locale]/HomeDiscoverySection.tsx lib/games/getFinishedGamesForUser.ts` | **PASS** — exit 0, no output |
| Tests | `npx vitest run app/[locale]/HomeDiscoverySection.test.tsx lib/games/getDiscoverableGames.test.ts` | **PASS** — 2 files, 18/18 tests passed |
| JSON validity | `python3 -c "json.load no.json; json.load en.json"` | **PASS** — both valid |

(Node 22 via nvm, as required.)

## Criteria

1. **`getFinishedGamesForUser` throws on error (no `data ?? []` swallow)** — **PASS**
   `lib/games/getFinishedGamesForUser.ts:52` now destructures `{ data, error }`; `lib/games/getFinishedGamesForUser.ts:64` `if (error) throw error;` is placed before the `return (data ?? [])` at line 66. Comment cites #877 + the `/spill-arkiv` shared-helper consequence. (df5fc9c6)

2. **`HomeBody` throws `rawActiveRes.error` before `activeGames`/`isEmptyState`** — **PASS**
   `app/[locale]/page.tsx:181-183` `if (rawActiveRes.error) { throw rawActiveRes.error; }` sits BEFORE `activeGames` (line 185) and `isEmptyState` (line 198). The `[]`-masking path is genuinely closed. Mirrors the existing `profileError` throw at line 170-172. (df5fc9c6)

3. **Discovery fetched for all logged-in users, not gated, no serial latency** — **PASS**
   `getDiscoverableGames(userId!)` is the 4th element of `HomeBody`'s `Promise.all` (`app/[locale]/page.tsx:163`). The old serial `const discoveryData = isEmptyState && userId ? await getDiscoverableGames(userId) : null;` gate is removed. The profile-completion redirect (`page.tsx:173-175`) still fires for not-onboarded users (discovery fetch is wasted on that rare path — explicitly accepted by the contract). `discoveryData` is now non-nullable and used without `?.` at lines 224-227. (11d9a4a7)

4. **Filled state with content → capped cards + "Se alle" tail; without content → fallback link-card** — **PASS**
   `app/[locale]/page.tsx:420-435`: `{hasDiscoveryContent ? <HomeDiscoverySection data={discoveryData} preview /> : <Section …><SmartLink href="/finn-turneringer">…{t('discoverCard')}…</Section>}`. `HomeDiscoverySection.tsx:25` `PREVIEW_CAP = 3`; passive lists sliced at lines 47-55; "Se alle" tail at lines 128-141 links to `/finn-turneringer`. Render logic verified via throwaway test (below).

5. **`pendingRequests` shown uncapped when present** — **PASS**
   `HomeDiscoverySection.tsx:46` destructures `pendingRequests` from `data` directly (no slice). Only `clubGames`/`friendGames`/`openGames` are sliced by `PREVIEW_CAP`. Throwaway test confirmed the pending item renders in both preview and default mode.

6. **`home.discoverCard` tightened + new `seeAllTournaments`, both locales, humanizer clean** — **PASS**
   `home.discoverCard`: `«Se åpne turneringer du kan bli med i»` → `«Bli med i en åpen turnering»` (NO) / `"See open tournaments you can join"` → `"Join an open tournament"` (EN). New `discover.seeAllTournaments`: `«Se alle turneringer»` / `"See all tournaments"`. Both keys present in `no.json` AND `en.json`. Namespaces correct: `seeAllTournaments` lives in `discover` (component uses `useTranslations('discover')`), `discoverCard` in `home` (page uses `getTranslations('home')`). Both copy strings are short action-verb phrases, no anglicism/em-dash; eslint+pre-commit-clean (commits exist, hook not bypassed).

7. **`package.json` + `CHANGELOG.md` bumped: PATCH (#877), MINOR (#879)** — **PASS**
   `package.json` version = `1.135.0`. CHANGELOG has `[1.134.5] - 2026-06-22 · #877` under `#### Fixed` (nested in open `1.134.y` theme) AND `[1.135.0] - 2026-06-22 · #879` under `#### Changed` (new theme «Funn rett på Hjem»). Three-layer format (theme heading + tagline blockquote + Teknisk details) respected.

## UI render verification

Wrote a throwaway vitest (`app/[locale]/__eval_preview_throwaway.test.tsx`) mirroring the existing `HomeDiscoverySection.test.tsx` setup (mocks `next/navigation`; relies on the global `vitest.setup.ts` next-intl stub that renders real `no` translations). Rendered `HomeDiscoverySection` with 5 open games + 1 pending request.

- **preview mode:** exactly **3** `«Meld meg på»` links (5 capped to 3) ✓; one `«Se alle turneringer»` link with `href="/finn-turneringer"` ✓; pending request text rendered ✓.
- **default mode (no `preview`):** all **5** open links rendered ✓; **no** "Se alle" tail ✓; pending text still rendered ✓.

Result: **2/2 passed.** Throwaway file deleted; `git status` confirms a clean working tree (only the pre-existing untracked contract file remains).

## Issues found

None.

## Notes

- The `[locale]/error.tsx` boundary that the #877 throws degrade into exists (`app/[locale]/error.tsx`, 700 bytes), so a thrown active-games or finished-games fetch error renders the retry screen rather than a misleading empty Home, as the contract claims.
- Out-of-Scope/guardrails all respected: `lib/games/getDiscoverableGames.ts` (query/dedup) is NOT among the 7 changed files; no committed test files were added or modified (`getDiscoverableGames.test.ts` and `HomeDiscoverySection.test.tsx` untouched, both still green); the «enda»→«ennå» typo in `home.emptyBodyWithDiscovery` was NOT touched (#883); no create-doors added to Home (#392) — the filled-state branch only swaps the static link-card for the preview component.
- The only behavioral risk worth naming: discovery is now fetched on every Home load including the rare not-onboarded redirect path (one wasted query). The contract explicitly accepts this, and it's parallelized so it adds no wall-clock latency on the common path.
- The "Se alle"/last-block spacing keys off `hasPassiveDiscovery` (computed pre-slice from the full lists, `HomeDiscoverySection.tsx:57-60`), so the tail correctly renders only when passive content exists and never when only `pendingRequests` are present — matching the contract's guardrail.
