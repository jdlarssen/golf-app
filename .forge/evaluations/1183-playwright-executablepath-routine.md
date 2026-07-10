# Evaluation: #1183 — Playwright executablePath override for routine environment

**Verdict: ACCEPT**

Independent re-verification performed against `.forge/contracts/1183-playwright-executablepath-routine.md`.
Commit under evaluation: `923e7ebab2cff6b2bf7c950a3d4395702f69b833` (HEAD).

## Diff scope

`git show HEAD --stat`:

```
 .../1183-playwright-executablepath-routine.md      | 22 ++++++++++++++++------
 docs/loops/nattkjoreren.md                         |  4 ++++
 playwright.config.ts                               |  8 ++++++++
 3 files changed, 28 insertions(+), 6 deletions(-)
```

Exactly the 3 files the contract's "Files Likely Touched" section names (plus the contract
doc itself, updated with checked-off evidence). No file under `.github/` changed — confirmed
via `git show HEAD --stat | grep -i '\.github'` → no match.

`playwright.config.ts` diff matches the contract's design sketch verbatim:

```ts
launchOptions: process.env.PW_CHROMIUM_EXECUTABLE_PATH
  ? { executablePath: process.env.PW_CHROMIUM_EXECUTABLE_PATH }
  : {},
```

Placed inside the existing `use: {}` block, no other fields touched.

## Gate: tsc

```
EXPECT: exit 0 from tsc --noEmit
$ npx tsc --noEmit
TSC_EXIT_CODE=0
```

ACTUAL: exit 0, no output. Matches contract's recorded evidence.

## Gate: lint

```
EXPECT: exit 0, 0 errors (warnings allowed)
$ npm run lint
✖ 54 problems (0 errors, 54 warnings)
LINT_EXIT_CODE=0
```

ACTUAL: 0 errors, 54 pre-existing warnings (all in unrelated files — `complexity` /
`max-depth` / one `no-unused-vars` in files untouched by this diff), exit 0. Matches
contract's recorded evidence (`54 problems (0 errors, 54 warnings)`) exactly.

## Gate: no `.github/` changes

Confirmed above — 0 files under `.github/` in the diff.

## Success criterion — config threading (independently reproduced)

Setup: dummy HTTP server on `127.0.0.1:3000` (python3 http.server) so Playwright's
`webServer.reuseExistingServer` logic finds a live server without needing staging env
(`npm run dev` requires `NEXT_PUBLIC_SUPABASE_URL` etc., unavailable in this evaluator
sandbox). Verified `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/` → `200`.

Wrote throwaway `e2e/_eval_probe.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
test('probe', async ({ page }) => { await page.goto('/'); expect(page.url()).toContain(':3000'); });
```

**Case A — env UNSET:**
```
EXPECT: 1 passed
$ npx playwright test e2e/_eval_probe.spec.ts --reporter=line
  1 passed (768ms)
EXIT_A=0
```
ACTUAL: `1 passed (768ms)`, exit 0. Bundled chromium (build 1223, installed at
`~/Library/Caches/ms-playwright/chromium-1223/...`) used. Confirms `launchOptions: {}` is
a true no-op — default behavior preserved bit-for-bit.

**Case B — `PW_CHROMIUM_EXECUTABLE_PATH` set to a valid local chromium-1223 binary:**
```
EXPECT: 1 passed, no "Executable doesn't exist"
$ PW_CHROMIUM_EXECUTABLE_PATH="$HOME/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" \
  npx playwright test e2e/_eval_probe.spec.ts --reporter=line
  1 passed (1.9s)
EXIT_B=0
```
ACTUAL: `1 passed (1.9s)`, exit 0, no "Executable doesn't exist" error anywhere in output.

**Case C — `PW_CHROMIUM_EXECUTABLE_PATH=/nonexistent/does-not-exist/chrome` (crisp proof):**
```
EXPECT: 1 failed, "browserType.launch: Failed to launch chromium because executable
doesn't exist at /nonexistent/does-not-exist/chrome"
$ PW_CHROMIUM_EXECUTABLE_PATH=/nonexistent/does-not-exist/chrome \
  npx playwright test e2e/_eval_probe.spec.ts --reporter=line
  Error: browserType.launch: Failed to launch chromium because executable doesn't exist
  at /nonexistent/does-not-exist/chrome
  1 failed
EXIT_C=1
```
ACTUAL: exact match — `1 failed` with the precise executable-not-found message referencing
the bogus path. This is the load-bearing evidence: if the config silently fell back to the
bundled browser, case C would have passed instead. It failed exactly as it should, proving
`process.env.PW_CHROMIUM_EXECUTABLE_PATH` genuinely flows into
`launchOptions.executablePath` and is not ignored.

**Cleanup:** deleted `e2e/_eval_probe.spec.ts`, removed `test-results/_eval_probe-*`,
killed the dummy server (port 3000 confirmed free afterward). `git status --short` →
empty output. No leftover artifacts.

## Doc criterion

```
$ grep -n "PW_CHROMIUM_EXECUTABLE_PATH" docs/loops/nattkjoreren.md
63:  `PW_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium` før `npm run e2e:gate`
```

Step 4 now has a bullet documenting the variable, its trigger condition (build mismatch →
"Executable doesn't exist"), and the mechanism (binary used directly, bypassing bundled
registry lookup), with a reference back to #1183.

## Known open item (not a rejection reason)

The 4th success criterion — "first night run logs a real `e2e:gate` attempt" — remains an
explicit `VERIFICATION GAP` per the contract, only confirmable in the actual routine Linux
environment (chromium build 1194) after merge. This is called out correctly in the contract
and is acceptable to leave open; it does not block ACCEPT.

## Summary

All gates green, all provable success criteria independently reproduced with matching
output, diff scope exactly as specced, no CI/`.github` footprint, no leftover eval
artifacts. The crisp-proof case (C) is unambiguous: the config change does exactly what it
claims.
