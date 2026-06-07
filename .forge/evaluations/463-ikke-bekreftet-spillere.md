Verdict: ACCEPT

# Skeptical evaluation — #463 «Ikke bekreftet» player confirmation

Branch: `claude/eager-ptolemy-2f8319`
Evaluated: 2026-06-07
Contract: `.forge/contracts/463-ikke-bekreftet-spillere.md`

## Gates (all green)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | exit 0, no output (clean) |
| `npx vitest run` | exit 0 — **229 test files, 2843 tests, all passing** |
| `npm run build` | exit 0 — Vercel parity, all routes rendered |
| Co-located #463 tests | 4 files / 41 tests passing (participantAcceptance, types, UnconfirmedBadge, login/actions) |

The only console line during vitest is the benign jsdom `Not implemented: navigation to another Document` — pre-existing, not a failure.

## Criterion-by-criterion evidence

### 1. Migration 0082 + prod DB parity — PASS
File `supabase/migrations/0082_player_accepted_at.sql`:
- Both columns nullable `timestamptz` (lines 16-17, 25-26); backfill `now()` (19, 28).
- Self-mark-accepted RLS on BOTH tables (38-46): `using (user_id = auth.uid() and accepted_at is null)`, `with check (... and accepted_at is not null)`.
- `player_added` added to `notifications_kind_check` via drop+re-add that preserves all 18 prior kinds incl. `cup_started` (52-75).

Prod DB verified via Supabase MCP (`glofubopddkjhymcbaph`):
- `information_schema.columns`: both `accepted_at`, `timestamp with time zone`, `is_nullable=YES`.
- `pg_policies`: both `game_players self mark accepted` + `league_players self mark accepted` present with the exact USING/WITH CHECK from the migration (plus the pre-existing 0012 `invitations` mirror).
- Backfill worked: `gp_total=13, gp_null=0`; `lp_total=0, lp_null=0` — **zero null rows, no historical player shows "Ikke bekreftet".**
- `notifications_kind_check` contains `player_added` and all 18 prior kinds.

### 2. Insert rules — PASS (every site sets accepted_at)
Helper `lib/games/participantAcceptance.ts:14-20`: `acceptedAtForActor(acting, row, now) = acting===row ? now : null`. Test covers both branches + injected-now (`participantAcceptance.test.ts`).

| Site | File:line | Value | Correct |
|---|---|---|---|
| Picker-add | `inviteToGameActions.ts:71` | `null` (hardcoded) | ✅ organizer-adds-other |
| Email→existing user | `inviteToGameActions.ts:167` | `null` (hardcoded) | ✅ |
| OTP verifyCode | `login/actions.ts:275` | `now()` | ✅ self-accept |
| Self-register open | `signup/actions.ts:207` | `now()` | ✅ |
| Team captain self | `teamActions.ts:333` | `acceptedAtForActor(captain,captain)`→now | ✅ |
| Team co-player | `teamActions.ts:419` | `acceptedAtForActor(captain,existingUser)`→null | ✅ |
| acceptTeamInvite | `teamActions.ts:645` | `acceptedAtForActor(user,user)`→now | ✅ |
| attachToCaptainTeam | `teamActions.ts:962` | `acceptedAtForActor(user,user)`→now | ✅ |
| Bulk create | `admin/games/new/actions.ts:229` | `acceptedAtForActor(userId,p.user_id,rowAcceptedAt)` per-row | ✅ |
| createLeagueDraft | `lib/league/actions.ts:140` | `acceptedAtForActor(userId,uid,draftNow)` per-row | ✅ |
| addLeaguePlayers | `lib/league/actions.ts:275` | `null` | ✅ |
| startLeagueRoundFlight game_players | `lib/league/actions.ts:469` | `acceptedAtForActor(user.id,uid,flightNow)` starter→now,co→null | ✅ |

NOTE (cosmetic, not a defect): the two `inviteToGameActions.ts` branches hardcode `null` rather than calling the helper. This is correct — a picker/email add is by definition an organizer adding someone. The only theoretical edge is an organizer picking themselves, which would yield a spurious badge; the contract explicitly classifies this as an acceptable fail-safe. No fix required.

### 3. Confirm + auto-confirm — PASS
- `confirmActions.ts:13-33` (game) and `39-61` (league): user-client, own row (`.eq('user_id', user.id)`), `.is('accepted_at', null)` guard, RLS-backed. Idempotent — no-op once set.
- `lib/games/confirmParticipation.ts` + `lib/league/confirmLeagueParticipation.ts`: admin-client, atomic `update … where accepted_at is null`, best-effort (swallows errors).
- Auto-confirm IS called and guarded:
  - game-home `app/games/[id]/page.tsx:258-262` — inside `after()`, only when `me.accepted_at == null`.
  - liga `app/liga/[id]/page.tsx:134-140` — inside `after()`, only when `me.acceptedAt == null`.
- No infinite-write: every write path carries `.is('accepted_at', null)`, so it becomes a no-op after the first success.

### 4. Badge — PASS (4 surfaces, all null-conditioned, all read the column)
- game-home roster `app/games/[id]/page.tsx:909-911` + `985-987` (`p.acceptedAt == null && !p.isCurrentUser`); column in `getGameWithPlayers.ts:159` select (tag `game-${id}`).
- admin game detail `app/admin/games/[id]/page.tsx:777-779` (`p.accepted_at == null && !p.withdrawn_at`); select line 349.
- admin status `app/admin/games/[id]/status/page.tsx:286-288` (`r.acceptedAt == null`); select line 95, mapped 138.
- liga `components/league/LeagueStandingsTable.tsx:164-166` (`participant?.acceptedAt == null`); `getLigaSnapshot.ts:108` select, mapped 137.

`UnconfirmedBadge.tsx` renders static "Ikke bekreftet", muted ModeChip styling, `data-testid="unconfirmed-badge"`; caller owns the null check.

### 5. Notification — PASS
- `player_added` in union (`types.ts:27`), zod `playerAddedSchema` `{game_id, game_name, added_by_name}` (191-195), schemas map (216), EMOJI map (`NotificationCard.tsx:42`), rendered (`NotificationCard.tsx:260-266`), deeplinked to `/games/${game_id}` (`InboxClient.tsx:197-200`).
- On-add path uses the existing `invite` kind everywhere (`notifyInvitedToGame` in inviteToGameActions, bulk create, verifyCode; `notifyInvitedToTeam` for team co-players). `player_added` is fired ONLY by the admin purre `remindUnconfirmedPlayers` (`status/actions.ts:162`). **No double-notify.** Matches the contract's deliberate simplification (and its stated deviation).
- Admin purre filters `accepted_at is null` + `!withdrawn_at` (`status/actions.ts:139,142`), best-effort `Promise.allSettled`.

### 6. Adversarial hunt — PASS
- **No hard gate.** grep of all `accepted_at`/`acceptedAt` usages in app/lib/components: every occurrence is a SELECT (plumbing), an INSERT value, a badge null-check, a confirm `.is()` guard, or the purre filter. No scoring/submit/start/ranking/leaderboard/standings code reads it as a blocker.
- **No dead code.** `notifyPlayerAdded` has zero references (helper was never created / fully gone). No orphaned imports surfaced (tsc + build clean).
- **Backfill protects historical rows.** Verified 0 nulls in prod for both tables; no existing player flips to "Ikke bekreftet".
- **Exhaustive maps complete.** `EMOJI: Record<NotificationKind,string>` has `player_added` (build would catch a gap; verified present). Both kind switch/cases (NotificationCard, InboxClient) handle it.
- **Norwegian copy clean.** Badge "Ikke bekreftet"; notification "{navn} la deg til i {spill}" / "Åpne spillet for å bekrefte at du er med."; status "X spillere har ikke bekreftet deltakelse ennå. Send en påminnelse." / "Purr X ubekreftede spillere" / "Sende bekreftelses-påminnelse til X spillere?" / "✓ Bekreftelses-påminnelse sendt til X spillere." No särskriving, no anglicism, action-oriented brand voice. "Purr" reuses the #376 verb. "Bekreftelses-påminnelse" hyphenation is consistent with house style (cf. "leverings-påminnelse" #376), not an error.
- **CHANGELOG/version.** `package.json` = `1.84.0`. CHANGELOG opens with `## 1.84.y — Bekreftet deltakelse` + `### [1.84.0]` entry; 1.83.y collapsed under `## Tidligere versjoner` in nested `<details>`. The 1.84.0 change added exactly 3 `<details>`/3 `</details>` (balanced). A raw tag-count delta of 13 exists but is identical on `origin/main` (pre-existing, from `<details>` strings inside summary/comment text) — **not introduced by #463**.

## Issues found

None blocking.

- **LOW / cosmetic:** `inviteToGameActions.ts:71,167` hardcode `accepted_at: null` instead of routing through `acceptedAtForActor`. Behaviourally correct for all real flows; only an organizer picking themselves would get a spurious (self-clearing) badge — contract-sanctioned as acceptable fail-safe. No action needed.
- **LOW / informational:** `playerAddedSchema` is game-only (`game_id`) whereas the contract summary floated `{game_id|league_id}`. Consistent with the purre being game-scoped only; leagues have no `player_added` purre. Internally coherent; documented as a contract deviation in the contract's own "Avvik" section.

## Conclusion

All 9 contract acceptance criteria are satisfied with code-level + prod-DB evidence. All three gates plus the co-located tests are green. `accepted_at` is provably a label-only mechanism with no hard gate, idempotent confirm/auto-confirm, correct insert semantics at all 12 sites, badge on all 4 surfaces, single non-duplicated notification path, and clean Norwegian copy. **ACCEPT.**
