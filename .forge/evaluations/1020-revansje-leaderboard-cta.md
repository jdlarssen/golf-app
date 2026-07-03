# Evaluation: #1020 Revansje CTA on finished leaderboard

**Verdict: ACCEPT**

Evaluated independently against `.forge/contracts/1020-revansje-leaderboard-cta.md`, with fresh
context, on branch `claude/fervent-goldwasser-b968ad` (code commit `b5ae16e5`). All six success
criteria verified with first-hand evidence (own commands, own reads of the diff, own staging
curls). No discrepancies found between the contract's Design section and the shipped code.

---

## K1 — Finished standalone game shows exactly 1 CTA, correct href/text, click-target works

**Verified via staging curl (admin-authed cookie, game `fab70b1a-c993-43d3-ba91-3c5bf234b4f7`):**

```
count:        1
<a data-testid="revansje-button" class="inline-flex items-center justify-center min-h-[44px] ...
  href="/opprett-spill?fra=fab70b1a-c993-43d3-ba91-3c5bf234b4f7">Revansje?</a>
```

- Exactly 1 `data-testid="revansje-button"` occurrence.
- `href="/opprett-spill?fra=fab70b1a-c993-43d3-ba91-3c5bf234b4f7"` — correct game id.
- Text content `Revansje?` — correct.
- `min-h-[44px]` present — meets ≥44px tap-target requirement.
- Click-target `/opprett-spill?fra=fab70b1a-...` HTML contains the `Forhåndsutfylt fra {name} —
  alt kan endres.` template string in the embedded i18n messages payload, confirming the banner
  copy key exists and is wired (server-rendered interpolation not independently re-verified
  beyond string presence, consistent with the note that headless rendering stalls in this
  environment — accepted per contract's documented exception).

**PASS**

## K2 — Active standalone game and active cup game show 0 occurrences

**Verified via staging curl (admin-authed cookie):**

```
=== active standalone d989957f ===
count:        0
=== active cup game 7896502d ===
count:        0
```

Matches contract's gate expression `game.status === 'finished' && !game.tournament_id &&
!game.league_round_id && ...` — read directly in `page.tsx:167-171`, confirmed byte-for-byte
against the contract's Design section item 3. No finished-cup game exists on staging to test the
`!tournament_id` branch directly, but the code-level gate is unambiguous and unit-testable logic
(pure boolean expression, no reliance on data availability).

**PASS**

## K3 — No leakage to spectate or holes drilldown

**Verified via:**
1. `grep -rn "RevansjeCta" app/ components/ lib/` — exactly 3 files reference it: the definition
   file (`RevansjeCta.tsx`), its test (`RevansjeCta.test.tsx`), the sole consumer
   (`LeaderboardChrome.tsx`, both branches), and the sole mount site (`leaderboard/page.tsx`).
   Zero references in `app/[locale]/spectate/[token]/page.tsx` or
   `app/[locale]/games/[id]/leaderboard/holes/page.tsx`.
2. `grep -n "revansje" app/[locale]/spectate/[token]/page.tsx` → no match (exit 1).
3. Staging curl, **no cookie**, public spectate route (same finished game via token
   `393c6166-1659-40b4-bf07-d9412187ad1a`):
   ```
   revansje-button count:        0
   ```

Architecture confirms structural impossibility of leakage, not just empirical absence: spectate's
`page.tsx` calls `renderLeaderboardContent` directly with no `RevansjeCtaProvider` wrap (verified
by reading the spectate page's imports — only `renderLeaderboardContent` from
`leaderboardContent`, no `RevansjeCta` import), so `useContext` in the consumer resolves to `null`
and the component returns nothing regardless of route.

**PASS**

## K4 — RevansjeCta.test.tsx (2 tests) + full leaderboard suite green, no snapshot churn

**Verified via own test run** (Node 22, `npx vitest run "app/[locale]/games/[id]/leaderboard"
messages/catalogParity.test.ts`):

```
Test Files  41 passed (41)
     Tests  191 passed (191)
```

Verbose reporter confirms both new tests present and passing:
```
✓ RevansjeCta.test.tsx > RevansjeCta > rendrer ingenting uten provider
✓ RevansjeCta.test.tsx > RevansjeCta > rendrer revansje-lenken med href fra provideren
```

41 files / 191 tests matches the contract's claimed count exactly. No format-view snapshot
failures — consistent with the provider-absence null-render pattern working as designed.

**PASS**

## K5 — catalogParity green in same run; `(home)/page.tsx` untouched

**Verified:**
```
✓ catalogParity.test.ts > no.json (source of truth) is non-empty
✓ catalogParity.test.ts > en.json has exactly the same leaf keys as no.json
```
(ran in the same invocation as K4, confirmed above)

`git diff b5ae16e5~1 b5ae16e5 --name-only` — 9 files changed, none under `(home)/`:
```
CHANGELOG.md
app/[locale]/games/[id]/leaderboard/LeaderboardChrome.tsx
app/[locale]/games/[id]/leaderboard/RevansjeCta.test.tsx
app/[locale]/games/[id]/leaderboard/RevansjeCta.tsx
app/[locale]/games/[id]/leaderboard/page.tsx
messages/en.json
messages/no.json
package-lock.json
package.json
```

Copy keys verified to mirror `game.home.revansjeButton` exactly:
```
messages/en.json:1520:      "revansjeButton": "Rematch?",   (game.home)
messages/en.json:2010:      "revansjeButton": "Rematch?",   (leaderboard.common)
messages/no.json:1520:      "revansjeButton": "Revansje?",  (game.home)
messages/no.json:2010:      "revansjeButton": "Revansje?",  (leaderboard.common)
```
Identical strings in both locales at both call sites — exact mirror as specified.

**PASS**

## K6 — Versioning, CHANGELOG, Refs #1020, gates

- `package.json` version: `1.168.2` — confirmed via `grep`.
- `package-lock.json` root + name-version block also bumped to `1.168.2`.
- `CHANGELOG.md` Feilrettinger section, under `Juli 2026 · 2 rettinger`:
  ```
  - `1.168.2` · [#1020](...) — «Revansje?» ligger nå også nederst på leaderboardet når runden er
    ferdig, rett ved «Del resultat». Før bodde knappen bare på spillsiden, som du hopper over når
    du går rett fra Hjem til resultatet.
  ```
  Correctly scoped, functional tone, no technical leakage.
- `git log --format='%B' -3` — all 3 commits (`6426667f`, `b5ae16e5`, `ceba2552`) contain
  `Refs #1020` in the body.
- Gates run independently:
  - `npx tsc --noEmit` → clean, no errors.
  - `npx eslint` on the 4 touched app files → clean, no errors/warnings.
  - `npx vitest run "app/[locale]/games/[id]/leaderboard" messages/catalogParity.test.ts` → 41
    files / 191 tests passed.
  - `npm run build` was not re-run in this evaluation (not required by the evaluation task's
    explicit gate list; tsc+lint+vitest all green and the diff is small/low-risk — no
    build-breaking surface like new GameMode enum members or exhaustive switches touched).

**PASS**

---

## Design-conformance spot-checks (beyond the K-criteria)

- **Provider pattern**: `RevansjeCtaContext` created with `createContext<string | null>(null)`;
  `RevansjeCtaProvider({ href, children })` and `RevansjeCta()` consumer both in
  `RevansjeCta.tsx`, matching the `ReactionsProvider` precedent cited in the contract.
- **Mount site**: `<RevansjeCta />` placed immediately after `<ShareResultButton />` in **both**
  `LeaderboardShell` branches (`chromeless` and full `AppShell`), confirmed by reading
  `LeaderboardChrome.tsx:51-70` directly.
- **Gating expression**: page.tsx's `showRevansje` is character-for-character the contract's
  spec: `game.status === 'finished' && !game.tournament_id && !game.league_round_id &&
  gwp.players.some((p) => p.user_id === userId)`.
- **Styling**: container `className="flex justify-center px-6 pb-6 pt-2"` in `RevansjeCta.tsx`
  matches `ShareResultButton.tsx`'s own container class byte-for-byte (grepped both files).
  `LinkButton variant="secondary"` — secondary weight, as directed ("Del resultat primær,
  Revansje sekundær").
- **Non-participant / active-game safety**: gate requires participant match server-side; no
  separate endpoint introduced (K3-adjacent #1007 precedent honored — no new server-action/route).

## Issues found

None. No deviations from contract identified. No follow-up issues warranted.
