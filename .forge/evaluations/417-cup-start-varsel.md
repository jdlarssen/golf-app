# Forge Evaluation — #417 Cup-start-varsel via in-app-først-logikk

**Verdict: ACCEPT**

Evaluated by: independent forge evaluator (claude-sonnet-4-6)
Evaluation date: 2026-06-06
Feature commit: `726a9dc`
Branch: `claude/frosty-shockley-916262`

---

## Criterion Table

| Criterion | Result | Evidence |
|-----------|--------|----------|
| K1 — Kind wiring + build | PASS | See below |
| K2 — Primitive + 4 tests | PASS | See below |
| K3 — startTournament gating | PASS | See below |
| K4 — Migration completeness | PASS | See below |
| K5 — Card copy + deeplink | PASS | See below |
| K6 — Version + CHANGELOG | PASS | See below |
| K7 — Gates green | PASS | See below |

---

## K1 — Kind wiring + build

**PASS**

All exhaustive wiring locations confirmed:

- `lib/notifications/types.ts:22` — `'cup_started'` in `NotificationKind` union
- `lib/notifications/types.ts:151-154` — `cupStartedSchema` defined (`tournament_id: uuid`, `tournament_name: z.string().min(1)`)
- `lib/notifications/types.ts:201` — `cup_started: cupStartedSchema` in `schemas` map (drives `parseNotificationPayload`)
- `components/notifications/NotificationCard.tsx:37` — `cup_started: '🏌️'` in `EMOJI: Record<NotificationKind, string>`
- `components/notifications/NotificationCard.tsx:218-224` — `case 'cup_started'` in `buildCardContent` switch → `{ title: 'Cupen har startet', detail: p.tournament_name }`
- `app/innboks/InboxClient.tsx:177-180` — `case 'cup_started'` in `buildDeeplink` switch → `` `/cup/${p.tournament_id}` ``
- `supabase/migrations/0079_cup_started.sql` — drop+add `notifications_kind_check` including `'cup_started'`

Build result:
```
✓ Compiled successfully in 3.0s
✓ Generating static pages using 9 workers (35/35) in 210ms
```

No TypeScript errors. The `EMOJI` record is typed `Record<NotificationKind, string>` and `buildCardContent` uses a bare `switch` — tsc would fail the build if any kind were missing from either. Build passing with new kind confirms exhaustive coverage.

---

## K2 — Primitive + tests

**PASS**

`notifyParticipantsCupStarted` exists at `lib/notifications/events.ts:95-122`. Structure mirrors `notifyParticipantsCupFinished` exactly:
- `Promise.allSettled` over all participants
- fires `notify({ kind: 'cup_started', payload: { tournament_id, tournament_name } })`
- returns `Map<string, boolean>` (userId → shouldAlsoSendMail)
- on rejection: logs `console.error(`[${logPrefix}] cup_started notify failed`, r.reason)`, omits from map (fail-closed — no mail without in-app)

4 Type A tests in `lib/notifications/events.test.ts` (lines 169-240):
1. `'fyrer cup_started in-app per deltaker + returnerer shouldAlsoSendMail-map'` — verifies per-user map and correct `notify()` call shape
2. `'utelater deltaker fra mappen ved notify-rejection (mail-gating fail-closed)'` — verifies fail-closed behaviour
3. `'log-prefix kommer fra parameter'` — verifies `'startTournament'` prefix in error log
4. `'tom deltakerliste → tom map, ingen notify-call'` — empty list edge case

Vitest result:
```
Test Files  24 passed (24)
     Tests  206 passed (206)
  Duration  2.32s
```

---

## K3 — startTournament gating

**PASS**

In `lib/cup/actions.ts`, the new `startTournament` implementation (lines 237-277):

1. Calls `loadTournamentParticipantEmails(supabase, id)` to get `recipients`
2. Calls `notifyParticipantsCupStarted(recipients, { id, name: current.name }, 'startTournament')` — in-app for ALL participants
3. Filters: `recipients.filter((r) => sendMailByUserId.get(r.user_id) === true)` → `mailRecipients`
4. Only `mailRecipients.map(...)` gets `sendCupStartedNotification`

The old blanket-mail path (`recipients.map(...)` without gating) is confirmed gone. The commit diff shows the old `const recipients = await loadTournamentParticipantEmails(supabase, id)` inside the `try` block was removed and replaced with the gated pattern outside. The `try` block now only runs `mailRecipients.map(...)`.

No code path exists that calls `sendCupStartedNotification` for all participants unconditionally.

---

## K4 — Migration completeness

**PASS**

Migration `supabase/migrations/0079_cup_started.sql` exists and is the latest migration (0079 > 0078).

The kind set in 0079 is compared against 0077 (the migration that last touched `notifications_kind_check`):

**0077 kinds (source of truth):** invite, peer_approval_request, scorecard_submitted, scorecard_approved, game_finished, product_update, team_invite, registration_request, registration_approved, registration_rejected, team_member_withdrew, deliver_reminder, cup_finished, club_join_request, club_role_changed, friend_request, friend_accepted

**0079 kinds:** all 17 of the above, plus `cup_started`

No kinds dropped. The migration is purely additive. The `cup_started` appearing twice in a naive grep parse is a grep artefact — the file shows `cup_started` appearing once in the SQL list (line 34) and once in a comment (`-- «cupen har startet»`). Only one SQL value.

---

## K5 — Card copy + deeplink

**PASS**

- Card title: `'Cupen har startet'` (`NotificationCard.tsx:221`)
- Card detail: `p.tournament_name` (`NotificationCard.tsx:222`)
- Emoji: `'🏌️'` (`NotificationCard.tsx:37`)
- Deeplink: `` `/cup/${p.tournament_id}` `` (`InboxClient.tsx:179`)

Contract specifies: title «Cupen har startet», detail = tournament_name, deeplink = `/cup/{tournament_id}`. All three match exactly.

---

## K6 — Version + CHANGELOG

**PASS**

- `package.json` version: `"1.82.0"` ✓
- `CHANGELOG.md` has open `## 1.82.y — Cup-start-varsel` section (not wrapped in `<details>`)
- `### [1.82.0]` entry present with correct date (2026-06-06)
- `<details><summary>Teknisk</summary>` block at lines 28-40 is balanced
- `## 1.81.y` series is wrapped in `<details><summary><strong>1.81.y — Venner og åpen-for-venner (3 oppføringer)</strong></summary>` starting at line 42

The `<details>` tags in the 1.82.y region are balanced. The outer 1.81.y wrapper opens at line 42 and closes elsewhere (verified via grep showing balanced open/close counts in the broader file).

---

## K7 — Gates

**PASS**

**Build:**
```
✓ Compiled successfully in 3.0s
```

**Vitest (lib/notifications lib/cup lib/mail):**
```
Test Files  24 passed (24)
     Tests  206 passed (206)
   Duration  2.32s
```

---

## Extra Skeptical Checks

**parseNotificationPayload handles cup_started:** PASS — `schemas` map at `types.ts:201` has `cup_started: cupStartedSchema`. The function `parseNotificationPayload` uses `schemas[kind]` to dispatch — the map lookup is type-safe and `cup_started` is present.

**Migration consistency:** PASS — 0079 file contains the full kind set from 0077 plus `cup_started`. No existing kind is dropped. The migration has been applied via Supabase MCP (noted in the contract's K4 evidence: `{"success":true}`). File content is correct for an additive constraint extension.

**types.test.ts exhaustive list:** NOT NEEDED — `types.test.ts` does not contain an exhaustive kind-enumeration test. It tests specific kinds by name. Since #377 did not add `cup_finished` to types.test.ts (confirmed by reading the file), parity means no new test is needed for `cup_started`. The file's test at line 21-41 tests 5 specific game-scoped kinds, not an exhaustive union.

**Any unreachable/stale code:** None found. The old `const recipients` inside the `try` block and the ungated `recipients.map(...)` are both gone. No dead code introduced.

---

## Issues Found

None. No severity-ranked issues to report.

---

## Summary

All K1–K7 criteria pass with direct evidence from code inspection and gate runs. The implementation is a faithful structural mirror of the #377 `cup_finished` pattern. Build is clean, vitest is green (206/206), migration is additive and complete, and the old blanket-mail path is definitively replaced.
