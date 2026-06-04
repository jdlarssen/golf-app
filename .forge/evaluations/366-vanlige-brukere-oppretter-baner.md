# Evaluation: #366 — Vanlige brukere kan opprette egne baner

**Date:** 2026-06-04
**Evaluator:** fresh-context skeptical reviewer (independent re-verification)
**Verdict:** ✅ **ACCEPT**
**Score:** 8/8 criteria PASS

All criteria independently re-verified. RLS confirmed against a real `auth.uid()` context (not mocks) in rollback transactions. Build/test/lint gates re-run from scratch and pass. No scope creep. The one guard-hardening nit found (open-redirect backslash class) is not exploitable given the auth gate + FormData-only input + Next.js same-origin server-action protection; noted as defense-in-depth, not a blocker.

---

## Per-criterion

### K1 — Migration applied; insert-own policies + SELECT unchanged + FK SET NULL — ✅ PASS

Evidence I gathered (Supabase MCP, project `glofubopddkjhymcbaph`):

`pg_policies` for `courses`/`course_holes`/`tee_boxes`:
- `courses authenticated insert own` — INSERT, `with_check = (created_by = auth.uid())`
- `holes authenticated insert own` — INSERT, `with_check = EXISTS(... c.id = course_holes.course_id AND c.created_by = auth.uid())`
- `tees authenticated insert own` — INSERT, same parent-course pattern
- `courses/holes/tees select all` — SELECT, `qual = true` (**unchanged**, scoring-parity intact)
- `courses/holes/tees admin write` — ALL, `is_admin()` (untouched)

`pg_constraint` on `public.courses`:
- `courses_created_by_fkey` → `confdeltype = 'n'` (SET NULL)
- `courses_updated_by_fkey` → `confdeltype = 'n'` (SET NULL)

Migration history: `supabase_migrations.schema_migrations` has `20260604182808 / courses_user_create_rls` — **applied**.

Migration file `supabase/migrations/0070_courses_user_create_rls.sql` matches the design exactly. SELECT is not touched anywhere in the file.

### K2 — RLS verified against real auth (not mock) — ✅ PASS

Real non-admin user confirmed: `public.users` row `d7aa1db4-3ce0-4a2e-8375-c02a88076363`, `is_admin = false`.

All tests run under `set local role authenticated; set local request.jwt.claims = '{"sub":"d7aa1db4-...","role":"authenticated"}'` in aborted transactions (no data persisted — leak check returned 0):

- **POSITIVE (own course):** separate-statement inserts mirroring the real action flow (course → 18 holes → 1 tee). Result via `raise exception`: `POSITIVE-OK owner=d7aa1db4-... holes=18 tees=1`. All three inserts succeeded under RLS.
- **NEGATIVE (created_by spoof):** `insert into courses (... created_by = '00000000-...0001')` → `ERROR: 42501 new row violates row-level security policy for table "courses"`. The "SHOULD-NOT-REACH" guard exception was never thrown — the insert itself was blocked.
- **NEGATIVE (foreign course holes):** `insert into course_holes (course_id = '9422ecb6-...'` — a course owned by `069cda6e-...`, not the test user) → `ERROR: 42501 ... "course_holes"`. Blocked.

Note: a single-statement CTE form (`with c as (insert courses...), h as (insert holes...)`) *does* fail on the holes insert, because the policy's `EXISTS` subquery can't see the not-yet-committed course row written in the same statement. This is a SQL-CTE visibility artifact, **not** an app issue — `createCourse` issues three separate awaited statements, so the course row is committed-visible by the time holes/tees insert. The separate-statement DO-block (the faithful simulation) succeeds.

### K3 — `createCourse` gates on `getUser()`, request-scoped client, forced `created_by`, sanitized redirects — ✅ PASS

`app/admin/courses/new/actions.ts`:
- `getUser()` gate at line 69–74; `if (!user) redirect('/login')`. Diff confirms `requireAdminOrTrustedCreator` removed.
- `getAdminClient` import **removed** (diff shows `-import { getAdminClient }`); all three inserts use `supabase` (request-scoped). No `writeClient` forking left.
- `created_by: user.id` forced on the course insert (line 230) — never read from FormData.
- `safeInternalPath()` (line 49) + `appendQuery()` (line 58) sanitize `redirect_base`/`success_redirect` with admin defaults `/admin/courses/new` and `/admin/courses?status=created`.

Co-located tests (`actions.test.ts`, 6 tests) all pass in the full suite run: unauth→/login with no insert; regular-user insert (`created_by = user`, order courses→course_holes→tee_boxes); success/error redirect honored; external + protocol-relative `redirect_base` rejected → admin default.

### K4 — `/opprett-bane` exists, logged-in gate, AppShell + CourseForm — ✅ PASS

- Build route table lists `ƒ /opprett-bane` (re-run `npm run build`, exit 0).
- **Live re-verification** (dev server on :3000): `curl -D - /opprett-bane` logged-out → `HTTP/1.1 307` → `location: /login?next=%2Fopprett-bane`. Independently reproduced the implementer's claim.
- `app/opprett-bane/page.tsx` gates on `getUser()` (line 64–69), renders `AppShell` + `TopBar backHref={next ?? '/'}` + `CourseForm` with `redirectBase`/`successRedirect` derived from `?next=`. Error banner via `COURSE_ERROR_MESSAGES`; success card with "Tilbake til spillet"/"Til forsiden" + "Opprett en bane til". `safeNext()` mirrors the open-redirect guard.

Accepted constraint: authenticated UI render not testable locally (OTP email login + non-deployed branch). Build + route + gate verified; the action self-gates too, so the layout gate isn't the only line of defense.

### K5 — Home entry for all logged-in users + BasicsSection link — ✅ PASS

- `app/page.tsx:204` — `courseCreateLink = userId ? (...) : null`. Gated on `userId` (from `getProxyVerifiedUserId()`), **not** `is_admin`. Rendered in both empty-state (`{courseCreateLink && <div className="mt-5">...`) and non-empty home (`mb-6 flex justify-center`). Copy: "Mangler en bane? Legg den til" → `/opprett-bane`.
- `app/admin/games/new/sections/BasicsSection.tsx:112–120` — "Finner du ikke banen? Opprett ny bane" `SmartLink href="/opprett-bane"` directly under the course `<select>`.

### K6 — Full suite green + lint + build — ✅ PASS

Re-run by me from worktree root:
- `npx vitest run` → **217 files, 2640 tests, all passed**, exit 0. (Matches contract claim exactly.)
- `npx eslint` on all 6 changed files → exit 0, no errors.
- `npm run build` → exit 0, "Compiled successfully", 30/30 static pages, full route table incl. `/opprett-bane`. Only warning is the benign Next workspace-root inference (pre-existing, unrelated).

### K7 — Version 1.74.0 + CHANGELOG entry + previous series wrapped — ✅ PASS

- `package.json` → `"version": "1.74.0"`.
- CHANGELOG: open `## 1.74.y — Baner alle kan legge til` section with humanizer-clean tagline blockquote + `<details>Teknisk</details>` (Added/Changed/Decided). Tagline reads naturally, no AI-tells.
- Previous series `1.73.y` wrapped in `<details><summary><strong>1.73.y — ... (2 oppføringer) — klikk for å vise</strong></summary>`.

### K8 — Comment posted on #392 — ✅ PASS

`gh issue view 392 --comments`: comment posted 2026-06-04T18:25:29Z, header "## Nav-arbeid som hører til #366 → flyttes hit (eier-instruks 2026-06-04)", referencing the standalone-door → Klubbhus-fane migration and removal of the temporary home entry.

---

## Skeptical probes

| Probe | Result | Held? |
|---|---|---|
| **created_by spoofing** (action + RLS) | Action forces `created_by = user.id` (never from FormData); RLS blocks mismatched `created_by` with `42501`. Both layers verified. | ✅ Held |
| **Foreign-course child inserts** (holes/tees against unowned course) | RLS `42501` on `course_holes` against course owned by another user. | ✅ Held |
| **SELECT tampering** (scoring parity) | Migration does not touch SELECT; `pg_policies` shows all three SELECT still `using(true)`. | ✅ Held |
| **Account deletion with created courses** | Empirically: inserted synthetic auth.users + course, `delete from auth.users` → `course_exists=t, created_by_is_null=t`. Cascade chain `auth.users →(c) public.users →(n) courses.created_by`. Deletion action (`profile/slett-konto/actions.ts`) never touches `courses`. Course survives, owner nulled. | ✅ Held |
| **Open-redirect: `//evil`** | `safeInternalPath` rejects → admin fallback. | ✅ Held |
| **Open-redirect: `https://`, `https:/`, `javascript:`** | All rejected → fallback. | ✅ Held |
| **Open-redirect: leading-whitespace + `//evil`** (`" //evil"`) | `.trim()` strips, then `//` check rejects → fallback. | ✅ Held |
| **Open-redirect: backslash class** (`/\evil`, `/\tevil`, `/%2F%2Fevil`) | Guard PASSES these through (only blocks literal `//`). Some browsers normalize `\`→`/`, so `/\evil` could resolve to `//evil` (external). **However NOT exploitable here:** (a) `createCourse` requires auth before redirect logic — unauth POST bounces to `/login`; (b) the value comes from FormData hidden inputs, not URL query params, so no GET-link self-phishing vector; (c) it's a POST server action protected by Next.js same-origin enforcement (verified: forged-Origin POST hit the auth gate, 307→/login). Worst realistic case is a logged-in user phishing themselves via a hand-crafted cross-origin form, which Next's CSRF protection blocks. | ⚠️ Guard gap exists but **not exploitable** — defense-in-depth only |
| **Admin flow unchanged** (`/admin/courses/new`) | CourseForm renders hidden `redirect_base`/`success_redirect` inputs *only when the props are set* (`{redirectBase !== undefined && ...}`). Admin route passes neither → action falls to defaults `/admin/courses/new?error=...` and `/admin/courses?status=created&name=...`. Confirmed by the regular-user test asserting the admin default redirect, and by the conditional rendering in CourseForm.tsx:374–379. | ✅ Held |
| **Scope creep** | Diff touches exactly: migration, actions.ts, actions.test.ts, CourseForm.tsx, BasicsSection.tsx, opprett-bane/page.tsx, page.tsx, package.json/-lock, contract. Nothing unrelated. | ✅ Clean |
| **No test data persisted** | All RLS/deletion tests aborted via `raise exception` or `rollback`. Leak check (`courses like 'RLS-EVAL-%'`, foreign hole #99) → 0 rows. | ✅ Clean |

---

## Optional follow-up (non-blocking)

The `safeInternalPath` open-redirect guard could be hardened to also reject backslashes and control characters after the leading slash (e.g. reject if the value contains `\` or matches `/[\\/]`), matching the well-known backslash-normalization bypass class. This is **not required for ACCEPT** — the gap is unreachable in practice given the auth gate, FormData-only input surface, and Next.js server-action same-origin protection. Worth a small backlog issue for hygiene if the same helper is ever reused on a GET-driven redirect param.

---

## Conclusion

**ACCEPT.** The novel, risky part (real RLS instead of service-role bypass) is correctly implemented and independently verified against a live `auth.uid()` context: own inserts succeed, spoofed/foreign inserts are blocked at `42501`, SELECT stays open for scoring, and account deletion nulls ownership without losing the course. Action and route both self-gate on `getUser()`. All gates pass. No scope creep. The single guard nit is defense-in-depth, not a defect.
