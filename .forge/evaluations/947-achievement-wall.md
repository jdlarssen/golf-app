# Evaluation: Achievement-vegg + unlock-varsel (#947)

**Verdict: ACCEPT**

Skeptical, independent re-verification of all contract success criteria + gates. Everything
the build claimed is backed by code I read and gates I ran myself. No blocking issues. Two
minor non-blocking observations noted at the bottom; neither warrants a separate issue.

Branch: `origin/main..HEAD` (7 commits). Diff is 23 files, +872/-4, scoped exactly to the
contract's "Files Likely Touched" list — **no scope creep**.

---

## Gate results (run by evaluator, Node 22)

| Gate | Result | Evidence |
| --- | --- | --- |
| `npm run build` | **PASS** — `BUILD_EXIT=0`, full route tree rendered | Critical exhaustive-switch/Record gate. Green ⇒ all three switches (cardContent, deeplink) + EMOJI Record are complete. |
| `npm run lint` | **PASS** — `0 errors, 51 warnings` | All 51 are pre-existing `complexity`/`max-depth` warnings (incl. `cardContent.ts:18` complexity 35, acknowledged in contract). No new errors. |
| `npx vitest run` (changed files + catalogParity) | **PASS** — `16 files / 136 tests passed` | `lib/stats/achievements`, `lib/notifications/*`, `lib/games/notifyAchievementUnlocks`, `components/stats/AchievementWall`, `messages/catalogParity.test.ts`. |

---

## Per-criterion verification

| Criterion | Verified? | Evidence (file:line) |
| --- | --- | --- |
| New `achievement_unlocked` `NotificationKind` + zod schema | ✅ | `lib/notifications/types.ts:30` (union), `:238-249` (schema, `moments.min(1)`, `count.int().positive()`), `:273` (schemas Record). |
| Migration 0118 drop/re-adds kind-CHECK with new kind, preserving all prior kinds | ✅ | `supabase/migrations/0118_*.sql:8-34`. Diffed kind-set vs `0094`: **only** `achievement_unlocked` added, **zero** dropped. Drop+add atomic pattern. Migration number 0118 free on origin/main. **Live staging constraint confirms all 22 kinds present** (queried `pg_get_constraintdef`). |
| `selectNotableMoments` returns ace/eagle/turkey/snowman, NEVER birdie, stable order | ✅ | `lib/stats/achievements.ts:58-67`. No birdie entry exists. Order fixed hole-in-one→eagle→turkey→snowman. Test `achievements.test.ts:113-114` asserts `selectNotableMoments({birdie:5}) === []`. |
| Ace→eagle collapse correct | ✅ | `achievements.ts:59` `eagleSansAce = Math.max(0, a.eagle - a.holeInOne)`. Test `:135-138` asserts a pure ace yields only `[{hole_in_one,1}]`. A genuine extra eagle (e.g. par-5) survives. Logic is correct. |
| Fired from BOTH endGame paths, best-effort, after status-flip, skips withdrawn | ✅ | `endGame`: `actions.ts:535` (after status flip `:512`). `endGameWithSideWinners`: `avslutt/actions.ts:203` (after status flip `:181`). Helper wraps everything in try/catch returning 0 — never throws (`notifyAchievementUnlocks.ts:38,139`). Withdrawn filtered at `:105`. No-moment skip at `:120`. `notify()` itself swallows insert errors (`notify.ts:55-56`). |
| Exactly ONE bundled notification per achiever | ✅ | One `notify()` call per player with ≥1 moment (`notifyAchievementUnlocks.ts:122`). Test asserts `sent === 1` / `notifyMock` called once, withdrawn ace excluded (`notifyAchievementUnlocks.test.ts:66-79`). Double-fire prevented by status-flip guard (`actions.ts:464`, `avslutt:85`). |
| `cardContent.ts` locale-aware title+detail; exhaustive switch | ✅ | `cardContent.ts:217-235`. Neutral umbrella title; `×N` only when count>1 (`:225`). Switch has no `default` ⇒ TS exhaustiveness enforced by build. |
| `deeplink.ts` → `/profile/historikk` | ✅ | `deeplink.ts:103-105`. Exhaustive switch (no default). |
| EMOJI `Record<NotificationKind>` updated | ✅ | `NotificationCard.tsx:27` (Record type), `:49` (`achievement_unlocked: '🏅'`). Record completeness enforced by build. |
| `AchievementWall` shows all 5 types, dimmed at 0, gold when earned | ✅ | `AchievementWall.tsx:15` (ORDER = all 5 incl. birdie), `:45-54` (earned→accent border/text, else `opacity-50`). `tabular-nums` at `:63`. Render test green. |
| Wall lifetime aggregation = sum of per-round counts | ✅ | `historikk/page.tsx:317-329` reduces `seasonRounds[].achievements` (each = `countRoundAchievements`, `:310`) over **all** finished games (query `:120` filters `status='finished'`, no season/partial filter on the map). True lifetime total. Achievements not gated on `completeBrutto` ⇒ 9-hole aces count, which is correct. |
| Rendered in `/profile/historikk` Statistikk tab after SeasonRecapPanel | ✅ | `historikk/page.tsx:374-385` (after `<SeasonRecapPanel/>` at `:373`). |
| "Mine tall" pills UNTOUCHED (`profile/page.tsx` not modified) | ✅ | `git diff origin/main...HEAD -- app/[locale]/profile/page.tsx` is **empty**. |
| i18n keys present + symmetric (no + en) | ✅ | `messages/no.json` + `en.json` both add `inbox.kinds.achievementUnlocked.{title,detail,moments.*}` + `historikk.achievements{Heading,Subtitle,Badge_*}`. catalogParity test green. Keys match all consumers. |
| Web Push works with no push-specific wiring | ✅ | `lib/notifications/push/sendPush.ts:35-36` reuses `buildNotificationText` + `notificationDestination`. New kind gets title/detail/URL free. |
| Version bump feat→minor (1.153.1→1.154.0) | ✅ | `package.json` 1.153.1 → 1.154.0. Correct semver for feat. |
| CHANGELOG Funksjon entry | ✅ | `CHANGELOG.md` adds `1.154 · Feir bragdene fra runden` entry in `## Funksjoner`, matching the file's established `<details>` + `↳ route` convention exactly. |

---

## Issues found

**None blocking.** Build, lint, vitest all green; every criterion independently verified against
actual code and (where relevant) the live staging schema.

### Minor / non-blocking observations

1. **CHANGELOG route line only names the wall, not the notification.**
   `↳ /profile/historikk · «Statistikk»` covers the badge-wall half but the unlock-*notification*
   half (the inbox card) isn't surfaced. Pure copy nuance — the prose body does mention "får du nå
   beskjed". Not worth a fix.

2. **Fire-helper test coverage is narrow (by design).** `notifyAchievementUnlocks.test.ts` covers
   withdrawn-skip, no-moment-skip, ace-collapse payload, and game-fetch-error no-op, but does NOT
   exercise the multi-moment `×N` join or the snowman path *through the helper*. Those are covered
   in `cardContent.test.ts` and `achievements.test.ts`, so coverage is adequate and consistent with
   the project's "max 2 tests" discipline. No action needed.

3. **Deploy gate (carried from contract, NOT an evaluator finding):** migration 0118 is applied to
   staging (verified live) but **prod application was intentionally deferred** (gated by the
   prod-deploy guard). Must be applied to prod at/before merge-deploy, else `notify('achievement_unlocked')`
   will fail the prod CHECK constraint. Additive widen (0107 pattern). This is the documented
   deploy-note, restated here so it isn't lost.

### Out-of-scope findings for separate issues

None. The diff is clean and tightly scoped; nothing unrelated was touched.

---

## Skeptic's summary

I tried to break this and couldn't. The two highest-risk spots — the ace→eagle collapse and the
migration not silently dropping a kind — both hold up: the collapse is `Math.max(0, eagle − ace)`
with a dedicated test, and a set-diff of migration 0118 vs 0094 (plus the live staging constraint)
proves zero kinds were dropped. Both endGame paths fire the helper after the status flip in a
genuinely best-effort wrapper that cannot throw out of the finish flow. "Mine tall" is provably
untouched. Build (the real exhaustiveness gate) is green.

**ACCEPT.**
