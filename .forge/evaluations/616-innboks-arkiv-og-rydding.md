# Evaluation — #616 Innboks: arkiver/fjern, «Tøm leste», 2-linjers undertekst

**Verdict: ACCEPT**

Fresh-context skeptical re-verification of `.forge/contracts/616-innboks-arkiv-og-rydding.md` on branch `claude/peaceful-moser-b3aee5` vs `origin/main`. All nine success criteria independently re-derived (not trusting the contract's own checkmarks). Both gates green. No blocking issues.

## Gate results (real output)

```
$ npx tsc --noEmit
TSC_EXIT=0            # no errors, empty output

$ npx vitest run "app/[locale]/innboks" "lib/notifications" "components/notifications" "messages"
VITEST_EXIT=0
 Test Files  14 passed (14)
      Tests  130 passed (130)
   Duration  1.59s
```

## Per-criterion verification

| # | Criterion | Result | Evidence |
|---|---|---|---|
| C1 | Migration adds nullable `archived_at` + partial index `where archived_at is null` | PASS | `supabase/migrations/0098_notifications_archived_at.sql:15-16` adds `archived_at timestamptz` (nullable, additive); `:22-24` creates `notifications_user_active_created on (user_id, created_at desc) where archived_at is null`. Index name distinct from existing `notifications_user_unread_created` (0032). Migration already applied to prod per contract — SQL reviewed only. |
| C2 | `archive.ts` exports `archiveNotifications({userId, notificationId?})`; single → sets `archived_at`+`read_at`; bulk → `.not('read_at','is',null).is('archived_at',null)`; best-effort + revalidateTag | PASS | `lib/notifications/archive.ts:39-66`. Single path `:41-46` updates `{archived_at, read_at}` with `.eq(user_id).eq(id).is(archived_at,null)`. Bulk path `:53-57` updates `{archived_at}` only, filtered `.not('read_at','is',null).is('archived_at',null)`. `console.error` on both error branches, returns silently. `revalidateTag(\`notifications-${userId}\`, 'max')` at `:65` (Next 16 two-arg form). |
| C3 | `actions.ts` has `archiveOne`/`clearRead`, both resolve `userId` via `getProxyVerifiedUserId()` | PASS | `app/[locale]/innboks/actions.ts:41-46` (`archiveOne`), `:52-56` (`clearRead`). Both call `getProxyVerifiedUserId()` server-side and early-return on null — client cannot spoof another user's id. |
| C4 | Inbox query filters `archived_at is null` | PASS | `app/[locale]/innboks/page.tsx:38` adds `.is('archived_at', null)` to the notifications select. Query columns + filter match the partial index. |
| C5 | `NotificationCard` ✕ is a sibling (not nested), `w-11`, localized `archiveAria`, calls `onArchive` not `onTap` | PASS | `components/notifications/NotificationCard.tsx:84` root is `<div>`; `:98-129` main tap `<button onClick={onTap}>`; `:132-139` ✕ `<button onClick={onArchive} aria-label={t('archiveAria')} className="… w-11 …">`. Two **siblings** under the div — no nested `<button>`. `XIcon` svg is `aria-hidden`, so accessible name = aria-label only. |
| C6 | InboxClient: ✕ optimistically removes one + calls `archiveOne`, no nav; «Tøm leste» removes all read + calls `clearRead`, shown only when ≥1 read | PASS | `InboxClient.tsx:92-99` `handleArchive` filters out the single id then `archiveOne(id)` (no router push). `:101-107` `handleClearRead` filters `read_at == null` (keeps unread) then `clearRead()`. `:50` `hasRead = items.some(read_at != null)`; toolbar `:126,128` renders «Tøm leste» only `{hasRead && …}`. Test «arkiverer kortet og navigerer IKKE» asserts `archiveOneMock('a')` called, card gone, `routerPushMock` NOT called. |
| C7 | Detail line uses `line-clamp-2`, not `truncate` | PASS | `NotificationCard.tsx:118` `className="mt-1 line-clamp-2 …"`. `truncate` removed (diff confirms). |
| C8 | 3 new i18n keys in BOTH no.json + en.json, same paths; catalogParity green | PASS | `messages/no.json:58-60` and `messages/en.json:58-60` both add `inbox.clearRead`, `inbox.clearingPending`, `inbox.archiveAria`. `messages/catalogParity.test.ts` flattens both catalogs and asserts bidirectional leaf-key parity — runs in the green suite (within `messages`). |
| C9 | Version 1.128.1→1.129.0 (minor) + CHANGELOG entry | PASS | `package.json:3` `"version": "1.129.0"`. `CHANGELOG.md:20-43` new theme `## 1.129.y — Rydd i innboksen` with tagline blockquote + Teknisk `<details>`. |

## Risk-area scrutiny

- **Nested interactive elements:** Confirmed clean. Root `<div className="relative …">`; the main tap `<button>` and the ✕ `<button>` are direct siblings (`NotificationCard.tsx:98` and `:132`). No `<button>` inside another. ✕ has its own `onClick={onArchive}`; clicking it cannot fire `onTap`. Verified by the real-component test asserting `routerPushMock` is not called.
- **Dangling unread dot:** Single-archive path sets BOTH `archived_at` and `read_at` (`archive.ts:43`). The bulk «clear read» path touches only already-read rows (`.not('read_at','is',null)`, `:56`) and leaves `read_at` alone. The bottom-nav counter (`hooks/useUnreadNotificationsCount.ts:72` initial `.is('read_at', null)`; `:108-114` realtime UPDATE handler decrements on null→non-null) therefore never counts an archived row. No phantom dot.
- **Query filter:** `page.tsx:38` `.is('archived_at', null)` — archived rows disappear from `/innboks`.
- **i18n parity:** All 3 keys present in both catalogs at identical paths; catalogParity test covers them bidirectionally and passes.
- **«Tøm leste» visibility:** `hasRead`-gated (`:126`); «Marker alle som lest» stays `hasUnread`-gated (`:128`). Test «viser IKKE Tøm leste når alt er ulest» passes.
- **Optimistic state:** ✕ removes exactly one card (`prev.filter(n.id !== id)`); «Tøm leste» removes all read, keeps unread (`prev.filter(read_at == null)`). Both covered by passing tests.

## Migration review

`0098_notifications_archived_at.sql` is additive and nullable (`add column archived_at timestamptz` — no default, no NOT NULL, no backfill needed; old code ignores the column). The partial index predicate `where archived_at is null` exactly matches the query filter `.is('archived_at', null)` and the selected/ordered columns `(user_id, created_at desc)`. No new RLS policy needed — `archived_at` UPDATE is covered by existing `notifications_update_own`. Index name does not collide with `notifications_user_unread_created`.

## Issues found

**None blocking.**

Non-blocking observations (no action required for this PR):
- `lib/database.types.ts` notifications Row (line ~1173) does NOT include `archived_at`. tsc still passes because `getServerClient()` (`lib/supabase/server.ts`) creates the client WITHOUT a `<Database>` generic, so the table is loosely typed and `.update({archived_at})`/`.is('archived_at', …)` are not column-checked. The column exists in prod, so runtime is correct. This is the same stale-types condition already tracked as issue #488 — pre-existing, not a regression introduced here.
- `ProductUpdateBanner.tsx` and `useUnreadNotificationsCount.ts` query `notifications` without `archived_at is null`. Verified harmless: both filter `read_at is null`, and archiving always sets `read_at`, so an archived row can never appear in the banner or count. No leak.

## Out-of-scope gold-plating

None. Scope matches the contract exactly: ✕-button + «Tøm leste» (not swipe), game_finished kept (no source suppression), bottom-nav dot kept (no count badge), no un-archive UI, no hard delete / new RLS policy. The locally-defined `XIcon` is a single-call-site helper (justified inline per the contract's gray-area note), not a new shared icon file.
