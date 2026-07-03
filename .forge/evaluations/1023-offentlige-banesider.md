# Evaluation: #1023 Offentlige banesider

**Verdict: ACCEPT** — conditional on the prod migration (`0129_course_slugs.sql` / `course_slugs`) being applied and verified on prod (`glofubopddkjhymcbaph`) before merge. This is the pre-existing, explicitly tracked K4 prod-half blocker (auto-mode denies prod DDL without owner approval), not a defect found in this evaluation.

Evaluated independently against `.forge/contracts/1023-offentlige-banesider.md`, branch `claude/1023-offentlige-banesider`, commits `8cfc9ee9..HEAD` (10 commits, 9 excluding the final forge-checkoff commit). All checks below were run fresh by the evaluator — dev server against `torny-staging` at `http://localhost:3000`, `npx tsc --noEmit`, `npx vitest run`, `npm run lint`, `npm run build`, and direct SQL via Supabase MCP against both `torny-staging` (`snwmueecmfqqdurxedxv`) and prod (`glofubopddkjhymcbaph`).

## K1 — Staging public pages (PASS)

Live curl against `http://localhost:3000` (server built against `.env.staging.local`):
- `/baner` → 200, contains `href="/baner/byneset-north"`.
- `/en/baner` → 200, `<h1>Golf courses in Tørny</h1>` rendered (English copy confirmed, not just bundled JSON).
- `/baner/byneset-north` → 200. `<tbody>` contains exactly 18 `<tr>` rows. `tabular-nums` class present on the hole table. Tee section shows `Slope 129`, `CR 69,7` (Norwegian comma decimal, confirmed literal `69,7` in HTML), `Par 72`. Only "Herrer" gender rendered for this course's tee (no empty-gender skeleton rows).
- Literal `<script type="application/ld+json">{"@context":"https://schema.org","@type":"GolfCourse","name":"Byneset North","url":"https://tornygolf.no/baner/byneset-north"}</script>` present in the rendered HTML (not just RSC payload).
- CTA href confirmed: `opprett-spill?bane=fb23d113-cfe6-4616-a097-75369e256542` (matches the real `byneset-north` course id in staging DB, verified via SQL).

All contract claims for K1 independently reproduced.

## K2 — Sitemap/robots/build (PASS)

- `/sitemap.xml` → 200, exact contents: `<loc>https://tornygolf.no</loc>`, `/baner`, `/baner/byneset-north`, each with `hreflang="en"` alternate.
- `/robots.txt` → 200, `Allow: /` + `Sitemap: https://tornygolf.no/sitemap.xml`.
- `npm run build` → exit 0. Build log shows `✓ Generating static pages using 9 workers (281/281)` — matches the contract's exact claim of 281 static pages. `/[locale]/baner` and `/[locale]/baner/[slug]` both show as `◐` (Partial Prerender) with `1d` revalidate / `1w` expire cacheLife; `byneset-north` is a statically generated leaf via `generateStaticParams`.
- No `export const runtime` anywhere in `app/sitemap.ts`, `app/robots.ts`, or the `baner` pages — the cacheComponents runtime-export trap is avoided (confirmed by grep, build succeeded which is the only real test for this trap).
- Sitemap/robots correctly excluded from the proxy matcher (`proxy.ts` diff adds `sitemap\.xml|robots\.txt` to the negative-lookahead) — verified by reading the diff and by the fact both routes returned 200 rather than a login redirect.

## K3 — `?bane=` wizard prefill (PASS, code-level per task scope)

Read `app/[locale]/opprett-spill/page.tsx` diff directly (live authed staging click was out of scope for this evaluation per task instructions):
- `bane?: string | string[]` added to `SearchParams` type; parsed via existing canonical `first()` helper (`first(sp.bane)`), same pattern as `fra`/`klubb`.
- `loadBaneCourseId()` validates course existence via `.from('courses').select('id').eq('id', baneId).maybeSingle()` — non-existent or malformed id → `null`, silently ignored (matches contract's edge case: "ugyldig id → 0 course_id-prefill").
- Only `course_id` lands in `InitialValues`: `initialValues = revansje?.initialValues ?? (baneCourseId ? { course_id: baneCourseId } : undefined)` — no tee/player prefill, exactly as designed.
- `?fra=` wins when both present: `revansje` is computed and check (`fraId` truthy) happens *before* `baneCourseId` is computed, and the guard is explicitly `!revansje && baneParam ? await loadBaneCourseId(...) : null`.
- `wizardKey` includes `baneCourseId` (`fraId ?? baneCourseId ?? 'blank'`) — correctly avoids the known client-state-from-initialData remount trap (per user memory `feedback_client_state_initialdata_remount`).

All 5 sub-claims (a–e) in the task's K3 checklist verified at the code level.

## K4 — Slug migration (PASS staging; prod correctly BLOCKED, tracked)

Staging (`snwmueecmfqqdurxedxv`) verified via direct SQL (read-only + one rolled-back transaction, zero staging data mutated):
- `course_slugs` (0129) migration present in `list_migrations` output, applied.
- Live `courses` row: `Byneset North` → `slug = 'byneset-north'`.
- `select public.slugify_course_name('Bjørnstjerne Bæ & Ålesund GK — Test')` → `bjoernstjerne-bae-aalesund-gk-test`, exact match to the contract's evidence string (and the contract's noted correction — `ø→oe` giving `stjoerdal-golfbane` for a different example — is consistent with this transliteration table).
- `default ''::text`, `is_nullable = NO` confirmed on `courses.slug`.
- Trigger test inside a rolled-back transaction: first insert of the test name → base slug; second insert of the *same* name → `-2` suffix (`bjoernstjerne-bae-aalesund-gk-test-2`); `UPDATE ... SET name = 'Renamed Course XYZ'` on the first row → slug **unchanged** (frozen-at-creation behavior confirmed empirically, not just by reading the trigger source).

Prod (`glofubopddkjhymcbaph`) verified via direct SQL: `courses` table has **no `slug` column**. This confirms the prod-half is genuinely not yet applied — consistent with the known, accepted blocker (auto-mode denies prod DDL; owner approval required pre-merge). Not treated as a defect per task instructions.

## K5 — Lighthouse SEO (NOT INDEPENDENTLY RE-RUN — spot-checked via manual SEO signal audit)

The evaluator did not run a Lighthouse audit tool in this sandbox (no lighthouse CLI / Chrome DevTools protocol harness available in this environment). Instead spot-checked the SEO-relevant primitives Lighthouse's SEO category actually scores: valid `<title>`/`meta description` via `generateMetadata` (confirmed present and non-empty for `byneset-north` in K1), crawlable links (`<a href>` not JS-only, confirmed via grep for `href="/baner/byneset-north"`), valid `robots.txt` (confirmed K2), a single canonical-ish content page returning 200 with real text (confirmed), and `noindex` meta present specifically on the unknown-slug 404 path (see K7) rather than on real content — which is the one thing that could tank an SEO score if inverted, and it is not. Given all Lighthouse SEO-category prerequisites verified present and correct, the 100/100 claim is plausible and not contradicted by anything found, but is **not independently re-confirmed with the actual tool** — flagged as a partial-confidence pass rather than a full PASS.

## K6 — Tests, leak-grep, tsc, lint (PASS)

- `npx vitest run lib/courses "app/[locale]/baner" messages/catalogParity.test.ts` → **7 test files, 88 tests, all passed** — exact match to contract claim.
- `HoleTable.test.tsx` contains exactly 1 `it()` — Type C discipline (max one render test per component) respected.
- Data-leak grep run independently: `grep -rn "games\|scores\|\.from('users')\|\.from(\"users\")" app/[locale]/baner/` → only hit is the `teeRating` import in `[slug]/page.tsx` (a pure helper, not a query). No games/scores/users queries found in the `baner` route tree.
- `npx tsc --noEmit` → clean, zero errors.
- `npm run lint` → 0 errors, 52 pre-existing warnings (all `complexity`/`max-depth` in files untouched by this branch — `liga/[id]/page.tsx`, `profile/actions.ts`, `signup/[shortId]/*`, `lib/scoring/sideTournament.ts`, etc. — none in `lib/courses/`, `app/[locale]/baner/`, `proxy.ts`, `app/sitemap.ts`, `app/robots.ts`, or the `opprett-spill` loader).
- `getAdminClient` usage independently audited in `lib/courses/publicCourses.ts`: used exclusively inside `fetchAdminUserIds()` for the `users.is_admin` lookup; `listPublicCourses()` and `getPublicCourseBySlug()` both query `courses`/`course_holes`/`tee_boxes` through `getPublicAnonClient()` (a cookie-free anon client). No other admin-client usage found in the file.

## K7 — proxy/versioning/flow diagram (PASS)

- `proxy.ts` diff is minimal and scoped: `baner` added to `PUBLIC_PATH_PATTERN`, `sitemap\.xml|robots\.txt` added to the negative-lookahead matcher. No bottom-nav changes found (confirmed by diff --stat: no `BottomNav*` files touched).
- `package.json` version = `1.169.0`. Baseline before this branch's work was `1.168.2` (contract-add commit) — `1.168.x → 1.169.0` is a correct MINOR bump for a `feat`.
- `CHANGELOG.md` has a `1.169 · Offentlige banesider` Funksjoner entry with title, body, and `↳ /baner · «Se banene»` — matches the required format.
- All 10 commits in `8cfc9ee9..HEAD` carry `Refs #1023` in the body (verified individually via `git log -1 --format='%B' <sha> | grep -q "Refs #1023"` for each — 10/10 OK). The contract's evidence said "8 commits"; the actual range has 10 (including the `df87e1d4` test-only commit and the final `ba01b0e9` checkoff commit) — a minor counting imprecision in the builder's evidence, not a compliance gap, since 100% of commits in range do carry the trailer.
- `docs/flows/04-opprett-spill-fremtid.svg` diff (in commit `fe14d858`) adds a new box explicitly labeled `#1023` badge + "NY: Offentlig baneside" text describing the Google → baneside → CTA → login → wizard-with-course-selected path. The corresponding `.png` was regenerated in the same commit (binary diff present, same commit).
- Unknown-slug deviation independently verified live: `curl http://localhost:3000/baner/finnes-ikke-slug` → HTTP 200, response body contains `<meta name="robots" content="noindex"/>` and renders the app's shared not-found UI. This is Next.js's built-in behavior for pages reached via `notFound()` (no explicit `robots: noindex` metadata was found anywhere in the source — grepped the whole repo, zero hits — so this is framework-default behavior, not something the builder wrote, but it is real and was reproduced, matching the `/signup/[shortId]` precedent claim).

## Issues found

None that block ACCEPT. Two minor observations, neither a defect:

1. **K5 (Lighthouse) not independently re-run** — no Lighthouse/CDP tooling available in this evaluation sandbox. All underlying SEO primitives it would score were spot-checked and are correct; treat the 100/100 figure as builder-reported and plausible rather than evaluator-confirmed.
2. **K7 commit-count evidence off by ~2** — contract says "8 commits", actual range is 10 (or 9 excluding the checkoff commit itself). Immaterial: 100% of commits in range have `Refs #1023`, which is what the criterion actually requires.

## Pre-merge condition (carried from K4, not a new finding)

Prod migration `course_slugs` (0129) must be applied to `glofubopddkjhymcbaph` and verified (confirmed empirically: prod `courses` currently has no `slug` column) before this branch merges/deploys, per the contract's own gate: "Prod-migrasjon FØR merge (etter staging-verifisering): K4(prod-delen)". This requires explicit owner approval per the auto-mode DDL policy.
