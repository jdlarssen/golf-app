# Evaluation: Prøvespill — spillbar demoturnering på /demo (#1042)

**Verdict: ACCEPT**
**Evaluator:** fresh-context skeptical sub-agent (opus), independent verification
**Branch:** `claude/musing-nash-4c8a03`

## Gates (all run independently by evaluator)

| Gate | Result | Evidence |
|---|---|---|
| `npx tsc --noEmit` | PASS | exit 0 (Node v22.23.0) |
| `npx eslint <changed>` | PASS | exit 0 on all changed files |
| `npx vitest run` | PASS | full suite 368 files / 4573 tests green; targeted leaderboard+demo 41 files / 190 tests green after hardening |
| `npm run build` | PASS | exit 0; `/no/demo` + `/en/demo` in route table as `◐` PPR; no `export const runtime` |
| Playwright `e2e/demo` | PASS | 2/2 passed |
| Staging click-through | PASS | preview mot torny-staging, no+en, board re-ranks live, screenshot; network log shows zero Supabase requests |

## Success Criteria — all PASS

1. **Uinnlogget spillbar demo** — e2e asserts `/\/demo$/` with no login bounce; proxy `PUBLIC_PATH_PATTERN` matches `/demo` and locale-stripped `/en/demo`.
2. **Null server/DB-berøring** — grep of demo code shows zero imports of writeScore/sync/supabase/Dexie (only doc-comments). Transitive trace: LeaderboardRealtime bailed on null gameId; now explicitly not mounted (see hardening below). Staging network log: zero Supabase REST/auth/realtime requests.
3. **Gjenbruk, ikke kopi** — DemoGame imports the real SoloStablefordView + computeLeaderboard + ScoreCard/SpecificValueSheet; no re-implemented stableford math.
4. **CTA + inngang** — CTA `href="/login?next=%2F"`; `try-demo-link` on /login → /demo; both e2e-asserted.
5. **Copy + i18n** — `demo` namespace + 2 `auth` keys in no+en with matching structure (catalogParity/apostropheParity green); tabular-nums inherited.
6. **Flyt-diagram** — `01-bli-bruker-fremtid.svg` got a `#1042 · Prøvespill` node feeding the email step; PNG regenerated; README updated.

## Finding raised + resolution

**P3 (raised, then FIXED in-PR):** The evaluator noted `LeaderboardRealtime` was still *mounted* transitively via `LeaderboardShell`, contrary to the contract's design note ("MÅ IKKE monteres"). It was provably inert on `/demo` (`gameIdFromPath('/demo')` → null → effect bails before any Supabase call), so the isolation criterion held at runtime. But relying on an incidental null return is a latent coupling on an isolation-critical feature.

**Resolution:** Commit `cfbbd04e` adds an additive `live` prop (default `true`) to `LeaderboardShell`, threaded through `SoloStablefordView`; the demo passes `live={false}`, which skips mounting `LeaderboardRealtime` + `ShareResultButton` + `RevansjeCta` entirely. Default `true` keeps all ~14 real leaderboards unchanged (190 leaderboard tests green). Re-verified on staging: `/demo` makes zero Supabase network requests. Isolation is now explicit, not incidental.

## Adversarial checks (all cleared)
- Public-route regex matches `/demo` + `/en/demo`; anonymous visitor gets 200, not a login redirect.
- `highlightUserId` + `live` props are additive/optional; real leaderboards render unchanged.
- Version 1.170.2 → 1.171.0 (minor, correct for feat); CHANGELOG Funksjoner row with `↳ /demo`.
- No dead buttons: `⋯` opens SpecificValueSheet; reset clears state without reload.
- `prefers-reduced-motion` suppresses `.reveal-up`; re-rank is DOM-reorder, understandable without motion.
