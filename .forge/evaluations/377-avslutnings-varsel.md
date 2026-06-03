# Evaluation — #377 Avslutnings-varsel via in-app-først-logikk

**Verdict: ACCEPT**

Independently verified every criterion K1–K8 by reading code, querying the live DB, and
running both gates myself. All pass. No blocking issues. The single behavioral risk the
contract flagged (participants silently dropped from in-app because `loadTournamentParticipantEmails`
skips users without email) is disproven against the live schema: `users.email` is `NOT NULL`.

---

## Gate results (run by evaluator, not trusted from builder)

### `npm run build` → PASS (exit 0)
```
✓ Compiled successfully in 4.7s
✓ Generating static pages using 9 workers (29/29) in 199ms
```
tsc exhaustiveness is genuinely enforced: neither `buildCardContent` nor `buildDeeplink`
has a `default:` case (`grep "default:"` returns nothing for both files), and `EMOJI` /
`schemas` are `Record<NotificationKind, …>` / keyed maps. A missing `cup_finished` wiring
would have failed the build. It passed.

### `npx vitest run lib/notifications lib/cup lib/mail` → PASS (exit 0)
```
Test Files  24 passed (24)
      Tests  202 passed (202)
```
Includes `lib/notifications/events.test.ts` with 4 new `notifyParticipantsCupFinished` tests
(8 tests total in that describe-pair, all green).

---

## Per-criterion verdict

### K1 — Single-game finish already in-app-first, mail off-app only — PASS
- `notify()` (`lib/notifications/notify.ts:41-46`) ALWAYS inserts the in-app row; the returned
  `shouldAlsoSendMail` is purely informative and is `false` only on insert error (fail-closed,
  line 54-62). Mail gating never blocks in-app. This is the load-bearing mechanism.
- `endGame` (`app/admin/games/[id]/actions.ts:340`): `notifyPlayersGameFinished(players!, …)`
  fires for ALL players; mail filtered at line 359-361:
  `recipients.filter((r) => sendMailByUserId.get(r.userId) === true)`.
- `endGameWithSideWinners` (`app/admin/games/[id]/avslutt/actions.ts:195`): identical pattern,
  mail filter at line 212-214.
- No blanket-mail path in either. Type A tests exist (`events.test.ts:19-93`).

### K2 — `cup_finished` wired through ALL exhaustive sites — PASS
- Union: `lib/notifications/types.ts:21` (`| 'cup_finished'`).
- Schema: `cupFinishedSchema` (`types.ts:135-138`, `{tournament_id: uuid, tournament_name: min(1)}`).
- schemas map: `types.ts:154` (`cup_finished: cupFinishedSchema`). `NotificationPayload<K>` is
  `z.infer<(typeof schemas)[K]>`, so a missing map entry breaks tsc.
- EMOJI Record: `components/notifications/NotificationCard.tsx:36` (`cup_finished: '🏁'`).
- `buildCardContent` case: `NotificationCard.tsx:206-212`.
- `buildDeeplink` case: `app/innboks/InboxClient.tsx:173-176`.
- Migration CHECK: `supabase/migrations/0069_cup_finished.sql` (additive drop+add).
- Build passes → exhaustiveness confirmed mechanically.

### K3 — `notifyParticipantsCupFinished` primitive — PASS
- `lib/notifications/events.ts:53-82`: fires `notify({kind:'cup_finished', payload:{tournament_id,
  tournament_name}})` per participant via `Promise.allSettled` (best-effort); builds
  `Map<userId, shouldAlsoSendMail>`; on rejection it logs and OMITS the user from the map
  → `.get()` returns `undefined` → filtered out of mail (fail-closed).
- Tests `events.test.ts:95-166`: locks (a) map built from notify results, (b) exact notify
  call shape incl. `kind:'cup_finished'` and payload, (c) fail-closed omission on rejection,
  (d) log-prefix passthrough, (e) empty list → no notify call. Not tautological — they lock
  the kind string, payload contract, and the no-mail-without-in-app invariant. Mock is at the
  `./notify` system boundary (correct per test discipline).

### K4 — `finishTournament` in-app to all, mail to off-app only, no blanket path — PASS
- `lib/cup/actions.ts:308-313`: `recipients = loadTournamentParticipantEmails(...)` then
  `notifyParticipantsCupFinished(recipients, {id, name}, 'finishTournament')` → in-app for ALL.
- `lib/cup/actions.ts:324-326`: `mailRecipients = recipients.filter((r) =>
  sendMailByUserId.get(r.user_id) === true)`.
- `lib/cup/actions.ts:327-341`: `sendCupFinishedNotification` fan-out iterates ONLY
  `mailRecipients`. Repo-wide grep confirms `sendCupFinishedNotification` has exactly ONE
  call-site (line 329) and `notifyParticipantsCupFinished` exactly ONE (line 309). The
  pre-#377 blanket `recipients.map(...)` is gone. No remaining unconditional all-participant mail.

### K5 — Migration 0069 exists, applied, additive — PASS
- File present (`supabase/migrations/0069_cup_finished.sql`, 1066 bytes). Pure drop+add of
  `notifications_kind_check`, identical kind list plus `cup_finished`. Non-destructive.
- Verified against LIVE DB: `pg_get_constraintdef` on `notifications_kind_check` returns the
  ARRAY including `'cup_finished'::text`. Migration is applied in prod.

### K6 — Inbox card + deeplink + participant-facing route — PASS
- Card: title «Cupen er ferdigspilt», detail = `tournament_name` (`NotificationCard.tsx:206-212`).
  Norwegian copy sensible, tie-safe (avoids «avgjort» which would imply a winner).
- Deeplink: `/cup/${p.tournament_id}` (`InboxClient.tsx:173-176`).
- Route `app/cup/[id]/page.tsx` is `PublicCupPage` — NOT admin-gated. It calls
  `getProxyVerifiedUserId()` but never uses the result to restrict access (only `getCupSnapshot`
  + `notFound()` gate). Any signed-in participant reaches it. Correct for a participant deeplink.

### K7 — MINOR bump + CHANGELOG in feature commit — PASS
- `package.json` version = `1.72.0` (MINOR from 1.71.x).
- `CHANGELOG.md` has `## 1.72.y — Avslutnings-varsel for cup` + `### [1.72.0] - 2026-06-03`.
- Feature commit `f7067df` (`feat(cup): in-app-first finish notification, mail only off-app`)
  stages `lib/cup/actions.ts` + `package.json` + `package-lock.json` + `CHANGELOG.md` together,
  satisfying the commit-msg hook. The earlier scaffold commits (`d97ffe6`, `cbdfcb9`) use
  `chore(notifications)` prefix and correctly skip the bump (no user-visible behavior on their own).

### K8 — Gates green — PASS
See "Gate results" above. Both exit 0.

---

## Skeptical hunt — findings

- **Blanket-mail path on cup finish?** None. Single grep-confirmed call-site, gated on
  `sendMailByUserId.get(r.user_id) === true`.
- **Does in-app reach ACTIVE participants?** Yes. `notify()` inserts the row unconditionally
  before any mail logic; `shouldAlsoSendMail` only gates mail. Active users get in-app, no mail.
- **Could a participant be silently dropped from in-app?** Contract's concern was that
  `loadTournamentParticipantEmails` does `if (!email) continue;` (actions.ts:89), so a
  participant without email would be skipped from BOTH mail AND in-app (unlike the single-game
  path, where in-app uses the full `game_players` set). VERIFIED AGAINST LIVE DB:
  `users.email` is `NOT NULL` (`is_nullable = NO`) and 0/11 users have null/empty email. The
  email-OTP invariant is enforced by a column constraint, not just convention. Safe. (A dangling
  `game_players`→`users` FK is the only theoretical gap; FK + RLS prevent it.) No blocker, but
  worth a one-line note: this is the one spot where cup's in-app set is the email-subset rather
  than the raw participant set — fine today, would silently regress if email ever became nullable.
- **tsc exhaustiveness gap / broken import / type error?** None. Build green; no `default:`
  swallowing a missing kind; all 5 wiring sites present.
- **Tautological tests?** No. The new tests lock kind string, payload shape, and fail-closed
  gating — the exact contracts K3/K4 rely on. Mock at boundary only.
- **Call-site integration test for `finishTournament` mail-filter?** Absent, but consistent with
  the pre-existing single-game pattern (primitive unit-tested, call-site verified by read+tsc).
  Within contract's Type-A scope. Not a blocker.

## Out-of-scope items correctly deferred
- Cup-START blanket mail (`sendCupStartedNotification`, actions.ts:238) untouched — contract
  scopes #377 to finish only. Confirmed still present and unchanged.
