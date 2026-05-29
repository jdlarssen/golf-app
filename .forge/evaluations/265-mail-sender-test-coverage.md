# Evaluation: #265 — Test-dekning på 3 mail-sendere

**Verdict: ACCEPT**

Independent verification of the test-only work against contract `.forge/contracts/265-mail-sender-test-coverage.md`. All 7 success criteria pass. All gates green. No production source touched.

## Per-criterion table

| Crit | Status | Evidence |
| --- | --- | --- |
| **K1** scorecardSubmitted — 4 tests (default, `adminFirstName:null` → «Hei!», HTML-escaping, chrome-lås) | PASS | Verbose run lists exactly 4 tests for `scorecardSubmittedNotification.test.ts`: default / `adminFirstName: null` → «Hei!» / `escaper HTML-spesialtegn` / `HTML chrome`. Escaping case (line 90–98) feeds `Per & <Co>` + `Cup "2026" <b>`, snapshot shows `Per &amp; &lt;Co&gt;` + `Cup &quot;2026&quot; &lt;b&gt;` — real escaping, not placeholder. |
| **K2** cupStarted — 4 tests (default+heltall, `playerFirstName:null`, desimal `10.5→10,5`, chrome-lås) | PASS | Verbose run lists 4 tests. Decimal case (line 96–115) passes `pointsToWin: 10.5`; both text + body snapshots show `10,5`. Source `cupStartedNotification.ts:34-36` `formatPoints` = `String(n).replace('.', ',')` — branch is real and exercised. |
| **K3** cupFinished — 4 tests (vinner, `winnerTeamName:null` → «Cupen endte uavgjort», desimal `3,5 — 2,5`, chrome-lås) | PASS | Verbose run lists 4 tests. Draw case (line 85–107) sets `winnerTeamName: null`; snapshot shows `Cupen endte uavgjort.` Decimal case shows `3,5 — 2,5`. Source confirms `winnerTeamName ? … : 'Cupen endte uavgjort.'` branch (`cupFinishedNotification.ts:59-61`). |
| **K4** resend-contract `senders[]` extended with the 3 new (fixtures match per-module base params) | PASS | `it.each` runs 10 sender rows (was 7); verbose lists all 10 incl. `sendScorecardSubmittedNotification`, `sendCupStartedNotification`, `sendCupFinishedNotification`. Fixtures (lines 131–180) match each module's `baseParams` (same `to`, names, IDs). |
| **K5** Snapshots populated, re-run stable, mirror existing copy 1:1 | PASS | Two consecutive `npx vitest run lib/mail/` runs both: `12 passed (12)` / `93 passed (93)`, zero "obsolete"/"written"/"updated" markers. Snapshots stable, not regenerating. |
| **K6** Sender-count updated «7» → «10» | PASS (documented deviation) | `resend-contract.test.ts:14` reads `// Dekker alle 10 aktive mail-sendere`. Contract documents that count lived in the test comment, not AGENTS.md — confirmed: AGENTS.md has no sender-count. |
| **K7** No production source modified; no bug surfaced | PASS | `git diff --stat main...HEAD` shows only: contract `.md` + 1 modified `.test.ts` (resend-contract) + 3 new `.test.ts`. No `lib/mail/*.ts` source (non-`.test`) changed. `tsc --noEmit` → no lib/mail errors; snapshots match unmodified source output. |

## Gate outputs

```
$ npx vitest run lib/mail/
 Test Files  12 passed (12)
      Tests  93 passed (93)

$ npx tsc --noEmit | grep -i lib/mail
NO_TSC_ERRORS_IN_LIB_MAIL

$ npx eslint lib/mail/
ESLINT_EXIT=0   (clean)

$ git diff --stat main...HEAD
 .forge/contracts/265-mail-sender-test-coverage.md |  67 ++++++++
 lib/mail/__tests__/resend-contract.test.ts        |  53 ++++++-
 lib/mail/cupFinishedNotification.test.ts          | 181 ++++++++++++++++++++++
 lib/mail/cupStartedNotification.test.ts           | 167 ++++++++++++++++++++
 lib/mail/scorecardSubmittedNotification.test.ts   | 149 ++++++++++++++++++
 5 files changed, 616 insertions(+), 1 deletion(-)
```

## Type B discipline (per lib/mail/AGENTS.md) — mechanical checks

Per new test file:
- `toContain`: **0** (all three files) — no `toContain` abuse.
- `not.toContain`: **0** — no absence-via-negation.
- Full-HTML chrome-lock (`payload.html).toMatchInlineSnapshot` with `DOCTYPE`): **exactly 1 per file** — chrome locked once on default case, not per case.
- No per-module structural Resend contract: confirmed by reading — error-propagation / from-format / call-count live ONLY in shared `__tests__/resend-contract.test.ts`. Per-module files only snapshot subject + text + one extracted body region.
- Body extractors match unique template styling (`margin:0 0 24px` for scorecard; `margin:0 0 16px` ×2 for cupStarted; `margin:0 0 8px` + `font-size:20px` serif for cupFinished) — matches the contract's body-extractor spec.

## Skeptical spot-checks
- Chrome-lock snapshots are FULL HTML (DOCTYPE → `</html>`), not truncated/empty — verified by reading all three.
- Decimal tests genuinely exercise decimals (`10.5`, `3.5/2.5`) and snapshots render Norwegian commas.
- Escaping test genuinely passes `& < > " ` chars and snapshot shows them escaped.
- Draw branch (`winnerTeamName: null`) and null-salutation branches both produce distinct, correct copy in snapshots.
- Mock uses `vi.hoisted` (correct for module-level Resend mock); `send()` helper returns `sendMock.mock.calls[0][0]` per AGENTS.md minimal form.

No issues. Work is complete and contract-compliant.
