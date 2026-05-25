# Evaluation: #202 Product Updates

**Verdict:** ACCEPT

**Gates:**
- **Lint:** PASS for this build. 5 errors remain in `e2e/sync/offline-sync.spec.ts` (no-explicit-any at lines 80, 91, 101, 126, 158) — confirmed pre-existing: file last touched in commit `5866728` (`test(e2e): offline-sync flow`), which is NOT in this branch's 13-commit range (`main..HEAD`). 7 warnings are also pre-existing in unrelated files. No new errors or warnings introduced by this build.
- **Tests:** PASS — 1062 tests across 91 files, all green (vitest run, 10.25s).
- **Build:** PASS — `npm run build` completes; new routes registered (`/admin/lanseringer`, `/api/cron/product-update-digest`, `/api/unsubscribe/product-update`).

## Criteria

### K1: Migration with two tables, opt-out column, CHECK extension, RLS
**Status:** PASS
**Evidence:** `supabase/migrations/0035_product_updates.sql` (filename bumped from contract's `0034` because `0034` was taken on main — deliberate, noted in user's CLAUDE memory as standard rebase pattern). Contains:
- `product_updates` table (id, title, body, link, cta_label, created_by FK, created_at) with `created_at desc` index — L14-25.
- `product_update_digests` table with `unique (period_start, period_end)` for idempotency — L29-38.
- `alter table public.users add column ... product_updates_unsubscribed_at timestamptz` — L41-42.
- Atomic drop + re-add of `notifications_kind_check` adding `'product_update'` — L45-54.
- RLS enabled on both tables; `product_updates_select_authenticated` policy `to authenticated using (true)` — L59-64. No write policy → service-role-only. Migration already applied to project `glofubopddkjhymcbaph`.

### K2: `product_update` zod schema + parseNotificationPayload test
**Status:** PASS
**Evidence:** `lib/notifications/types.ts:8-14` adds `'product_update'` to `NotificationKind` union. `lib/notifications/types.ts:57-63` defines `productUpdateSchema` with all required fields and `link: z.string().startsWith('/').optional()` enforcing internal-only. Registered in `schemas` map at L71. `lib/notifications/types.test.ts` contains 5 new tests covering happy path, full payload, external-link rejection, missing title, empty title — all passing.

### K3: `/admin/lanseringer` page, gated, with form + digest + history
**Status:** PASS
**Evidence:** `app/admin/lanseringer/page.tsx` exists. `requireAdminContext` (L40-54) calls `getProxyVerifiedUserId()` and checks `users.is_admin`, `redirect('/')` for non-admin. Renders three sections: publish form (L102-158), `<DigestCard>` (L177-211) showing current period state with "Send månedsbrev nå" disabled when already-sent, and `<PreviousUpdatesList>` (L222-280) showing last 20 updates. TopBar + AdminShell wrap. `actions.ts:10-24` independently re-asserts `requireAdmin()` server-side.

### K4: `publishProductUpdate` inserts row + fan-outs notifications
**Status:** PASS
**Evidence:** `lib/productUpdates/publish.ts:42-58` inserts into `product_updates` returning id. L62-67 queries all user ids. L69-83 fan-outs via `Promise.allSettled` calling `notify({ kind: 'product_update', payload: { source_id, ... } })` per user. L85-91 logs failures. Returns `{ id, recipientCount, failedCount }`. `app/admin/lanseringer/actions.test.ts` covers happy-path including fan-out side-effect and non-admin redirect.

### K5: `<ProductUpdateBanner />` mounted at `/`, dismiss optimistic
**Status:** PASS
**Evidence:** `components/products/ProductUpdateBanner.tsx` server component queries newest unread `product_update` notification for the user via session client (RLS auto-scopes), returns `null` if `userId` is `null` or no row found. Hands off to `ProductUpdateBannerClient.tsx` for UI. Client component (L28-38): `useState` dismissed flag, optimistic render-out before calling `markOneAsRead` via `useTransition`. Mounted in `app/page.tsx:18,69` as `<ProductUpdateBanner userId={userId} />`. Dismiss button is `h-11 w-11` (44px). CTA button uses `min-h-11`. `ProductUpdateBannerClient.test.tsx` covers render + dismiss.

### K6: `sendProductUpdateDigest` mail with RFC 8058 headers + snapshot
**Status:** PASS
**Evidence:** `lib/mail/productUpdateDigest.ts:54` subject = `Nytt i Tørny — ${periodLabel}`. L150-155 sends `headers: { 'List-Unsubscribe': '<...>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }`. Updates listed via `updateBlocksHtml`/`updateBlocksText` (L59-80, 123-131). HTML escaping at L165-172. `lib/mail/productUpdateDigest.test.ts` contains 9 tests including inline-snapshot of plain-text body (confirmed in CHANGELOG-tagged 9 tests).

### K7: Cron endpoint with CRON_SECRET + date gate + idempotency + vercel.json
**Status:** PASS
**Evidence:** `app/api/cron/product-update-digest/route.ts`:
- L18-22: 500 if `CRON_SECRET` not set; L24-27: 401 if Bearer header mismatch.
- L29-43: `Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Oslo', day: 'numeric' })` gate — skip if not the 1st.
- L46: `sendDigestForPeriod({ sentByUserId: null })` runs, which internally does idempotency check via `product_update_digests` UNIQUE on `(period_start, period_end)` (`lib/productUpdates/digest.ts:84-93`).
- `vercel.json` registers `{ path: '/api/cron/product-update-digest', schedule: '0 8 * * *' }`. Proxy matcher excludes `api/`, so endpoint bypasses auth-gate.

### K8: Unsub endpoint GET + POST + HMAC verify + DB update
**Status:** PASS
**Evidence:** `app/api/unsubscribe/product-update/route.ts`:
- GET (L40-55) renders branded HTML on success/failure (400 vs 200).
- POST (L57-74) tries query token first, falls back to form body for RFC 8058 one-click, returns empty body 200/400.
- Both delegate to `unsubscribe(token)` (L21-38) which calls `verifyUnsubToken` then `admin.from('users').update({ product_updates_unsubscribed_at: new Date().toISOString() })`.
- `unsubscribeToken.ts:41-74` does `timingSafeEqual` constant-time compare with length-prefix guard, exp check (L62), returns null on tamper/expiry. `unsubscribeToken.test.ts` has 9 tests covering round-trip, tampered sig, tampered userId, exp, garbage, missing secret, determinism.

### K9: Profile mail-settings toggle + dirty-tracking + action wiring
**Status:** PASS
**Evidence:**
- `app/profile/page.tsx:154` selects `product_updates_unsubscribed_at`; L182 passes `productUpdatesOptIn: profile.product_updates_unsubscribed_at == null`.
- `app/profile/ProfileFormBody.tsx:55` reads form value into dirty-tracking key `productUpdatesOptIn`; L125 renders the checkbox `name="product_updates_opt_in"`.
- `app/profile/actions.ts:34` parses the form field; L66 writes `product_updates_unsubscribed_at: productUpdatesOptIn ? null : now`.
- `ProfileFormBody.test.tsx` exists (4 tests per CHANGELOG).

### K10: Lint + tests + build green
**Status:** PASS (with caveat noted in Gates above)
**Evidence:** All 1062 tests pass. Build succeeds. Lint has 5 pre-existing errors in `e2e/sync/offline-sync.spec.ts` that are not this build's responsibility (verified via `git log --oneline main..HEAD -- e2e/sync/offline-sync.spec.ts` returning empty).

### K11: Version bump + CHANGELOG entry + previous serie wrapped
**Status:** PASS (with deviation)
**Evidence:** `package.json` shows `"version": "1.22.0"`. Contract said `1.17.0 → 1.18.0`, but multiple parallel minor-bumps landed on main during this build's lifetime — bumping to `1.22.0` matches the documented "CHANGELOG/version conflict on rebase" pattern in user memory. CHANGELOG.md (lines 14-65) has new `## 1.22.y` series heading "Lanseringer-kanal: in-app drypp + månedsbrev" + open entry `[1.22.0]` with stakeholder tagline as blockquote and `<details>Teknisk</details>` block. Previous `1.21.y` series wrapped in `<details><summary><strong>...</strong></summary>` at L69. Intent of K11 (minor bump for new user-visible feature + tagline + previous serie collapsed) is fully met.

## Notes / Concerns

- **Migration filename:** `0035_product_updates.sql` instead of contract's `0034`. Deliberate per the contract evaluator's brief and is the correct response to a parallel migration landing on main.
- **Version number drift:** Bumped to `1.22.0` instead of `1.18.0` — same root cause as migration drift, and consistent with project's documented practice when rebasing on a fast-moving main.
- **Banner component split into two files:** Contract listed only `ProductUpdateBanner.tsx`. Build split into server (`ProductUpdateBanner.tsx`) + client (`ProductUpdateBannerClient.tsx`) — this is the correct Next.js 16 pattern for "server component fetches, client handles interaction". Test file accordingly named `ProductUpdateBannerClient.test.tsx`. Improvement, not deviation.
- **publishProductUpdate's recipientCount semantics:** Returns `userIds.length - failedCount` (i.e. successfully notified count). The admin UI message "Lanseringen er ute hos N brukere" matches this — N reflects actual successful fan-outs, not attempted. Sensible.
- **Audit-row always inserted, even on 0 successes:** `digest.ts:149-155` inserts the digest row regardless of how many sends succeeded. This is correct for idempotency (prevents retry storm) but means a misconfigured Resend key during cron would silently log "0 sent" and mark the period as done. Operationally acceptable since cron logs show this, but worth knowing.
- **Token format note:** `unsubscribeToken.ts` uses `expMs` as integer string (not ISO) specifically to avoid `split('.')` breaking on millisecond punctuation — well-documented in the file's JSDoc.
- **Profile checkbox semantics:** Form field is `product_updates_opt_in` (positive sense), DB column is `product_updates_unsubscribed_at` (negative sense / timestamp). Mapping is correct in both directions (`null` ↔ opted-in, `now()` ↔ opted-out), and is documented through the JSDoc on the DB column.
- **Test count growth:** CHANGELOG claims 986 → 1033 (+47), actual run reports 1062 — likely the +29 difference comes from other in-flight test additions during this build's lifetime. Not a concern.

## Recommendation

ACCEPT — ready for PR. The build implements all 11 criteria with high fidelity to the contract's design, the two deliberate deviations (migration number, version number) are both forced by parallel main activity and follow documented project practice, and the only quality-gate failure (5 lint errors) is verifiably pre-existing.

For the PR, recommend including a short note about the version/migration drift in the body so the next reviewer doesn't think it's an error.
