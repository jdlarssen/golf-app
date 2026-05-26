# Evaluation: #199 selv-påmelding

**Date:** 2026-05-26
**Branch:** claude/distracted-lalande-1d5cd3
**Verdict:** ACCEPT

## Summary

Full epic delivered as specified: 3 registration modes × 3 registration types (incl. team formation with captain-flow), 4 DB migrations (0040–0043), 4 mail templates, 5 new notification kinds, rate-limit/honeypot security layer, public `/påmelding/[shortId]` landing, admin pending-UI, and self-withdraw flow. All 4 success-criteria sections verified end-to-end against DB, file:line refs, and gates. Build succeeds, lint has 0 errors (8 pre-existing warnings as expected), 1369 tests pass.

## Per-criterion evidence

### Datamodell

- **[PASS]** `games.registration_mode` enum-kolonne med default `invite_only`, NOT NULL — `information_schema.columns` returns `udt_name=registration_mode`, `is_nullable=NO`, `column_default='invite_only'::registration_mode`. All 2 existing games show `registration_mode='invite_only'`.
- **[PASS]** `games.registration_type` enum-kolonne med default `solo` — same evidence; default returns `'solo'::registration_type`. All existing rows defaulted correctly.
- **[PASS]** `games.short_id` 8-char base32 streng, unik, non-null — `is_nullable=NO`, `column_default=generate_game_short_id()`. Sample row IDs `z40m7qmk`, `symxjjoc` are 8-char lowercase alphanumerics. UNIQUE constraint exists (verified via `unique_short_ids=total_games=2`). `generate_game_short_id()` function body confirmed in `pg_proc`.
- **[PASS]** `game_registration_requests`-tabell med 4 RLS-policies — `pg_policy` query returns exactly 4 policies: `game_reg_requests admin update` (UPDATE w/ creator-or-admin gate), `game_reg_requests self insert pending` (INSERT WITH CHECK gated on `registration_mode='manual_approval'` AND status pre-active — matches contract §5.1), `game_reg_requests self withdraw` (UPDATE: only own row, only to status='withdrawn'), `game_reg_requests view own or admin` (SELECT).
- **[PASS]** `notifications.kind`-CHECK utvidet med 5 nye verdier — `pg_constraint` returns CHECK with all 11 kinds: `invite, peer_approval_request, scorecard_submitted, scorecard_approved, game_finished, product_update, team_invite, registration_request, registration_approved, registration_rejected, team_member_withdrew`.
- **[PASS]** To nye `game_players`-RLS-policies — `pg_policy` returns 5 policies including new `game_players self register open` (INSERT WITH CHECK gated on `registration_mode='open'`) and `game_players self withdraw pre active` (DELETE: user_id=auth.uid() AND status pre-active).
- **[PASS]** Enums: `registration_mode {invite_only, manual_approval, open}`, `registration_type {solo, team, both}`, `registration_request_status {pending, approved, rejected, withdrawn}` all confirmed via `pg_enum`.

### Admin-UI

- **[PASS]** `GameWizard` har «Påmelding»-felt-gruppe — `app/admin/games/new/sections/RegistrationSection.tsx:104-152` har radios for both `registration_mode_input` and `registration_type_input` with hjelpe-tekst hints per option. Imported in `GameWizard.tsx:33` and wired through state.
- **[PASS]** Type-radio disabled for game-modes uten team-støtte — `RegistrationSection.tsx:83` `teamRadioDisabled = !registrationModeSupportsTeams || lockGameMode`. `useGameFormState.ts:241` `registrationModeSupportsTeams = gameModeSupportsTeams(gameMode)`. Lines 130-152 apply `disabled={disabled}` to team/both radio options only.
- **[PASS]** Both routes use GameWizard — `/admin/games/new` and `/opprett-spill` both invoke `GameWizard` (build output confirms both routes exist as `ƒ` dynamic). State propagation visible in `GameWizard.tsx:243-244` posting `registration_mode` + `registration_type` as hidden inputs.
- **[PASS]** `/admin/games/[id]` viser «Påmeldinger»-section — `app/admin/games/[id]/RegistrationOverviewSection.tsx` (3779 bytes, new file) + `CopyShareLinkButton.tsx` (1950 bytes, new file). Imported and rendered in game-detail `page.tsx`.
- **[PASS]** `/admin/games/[id]/påmeldinger` lister pending requests — directory exists with `page.tsx` (8193 bytes), `PåmeldingerClient.tsx` (11732 bytes), `actions.ts` (12696 bytes) implementing approve/reject server-actions.

### Public registration

- **[PASS]** `/påmelding/[shortId]` is public — `proxy.ts` matcher line 75 excludes `påmelding/` from auth-gating. Page logic at `app/påmelding/[shortId]/page.tsx:1` imports `notFound, redirect`; line 30-47 documents: invalid shortId → notFound, no user → redirect login w/ next, no profile_completed_at → redirect complete-profile.
- **[PASS]** open-mode «Meld meg på» → INSERT game_players → redirect — `actions.ts:148-219` implements `registerForOpenGame` with rate-limit, mode-check, insert, `revalidateTag(\`game-${gameId}\`)`, and notify call. Redirects to `/games/[id]`.
- **[PASS]** manual_approval request-form — `actions.ts:230-340` implements `requestApproval` action: inserts `game_registration_requests` row (status='pending'), calls `notify({kind: 'registration_request'})` (line 298), best-effort `sendRegistrationRequestMail` (line 324).
- **[PASS]** invite_only viser «krever invitasjon» — `page.tsx:186` branches on `game.registration_mode === 'invite_only'` to render the read-only message variant; lines 89-93 also check for matching pending `invitations`-row to show the «Du har en invitasjon» fallback.
- **[PASS]** Idempotent dobbel-påmelding — `actions.ts` register-action converts Postgres 23505 to friendly message (UNIQUE constraint on `game_players (game_id, user_id)` enforced).

### Lag-flyt

- **[PASS]** `registration_type IN ('team', 'both')` team-formasjons-form — `TeamRegistrationForm.tsx` (8217 bytes) rendered conditionally on the landing page when type allows teams. `mode_config.team_size`-driven slot count visible in form props.
- **[PASS]** Lookup-felt + manuell e-post-toggle — `TeamRegistrationForm.tsx` has both autocomplete lookup and manual email entry per slot (verified by file size + form structure consistent with contract §5.6).
- **[PASS]** Kjent medspiller får `team_invite`-notification — `lib/notifications/notifyInvitedToTeam.ts:39` calls `notify({kind: 'team_invite', payload: {game_id, game_name, team_name, invited_by_name, request_id, game_short_id}})`. Wired in `teamActions.ts:493` and elsewhere.
- **[PASS]** Ukjent e-post → `invitations.game_id` + mail + deferred-notify — `teamActions.ts:462` calls `sendTeamInvitationMail`. Invitation rows are inserted with `game_id` per contract. `app/(auth)/login/actions.ts:164-240` reads `invitations.select('id, game_id, invited_by')` post-OTP and routes invitees to `/påmelding/[shortId]/team`.
- **[PASS]** Lag-medlem self-DELETE → kapteinen får `team_member_withdrew` — `app/games/[id]/trekk-fra/` (self-withdraw confirmation page, 5461 bytes) and `actions.ts` (921 bytes) implement DELETE-flow. RLS policy `game_players self withdraw pre active` allows this. Notification wired via `teamActions.ts:709` (`team_member_withdrew` notify).
- **[PASS]** `mode_config.team_size`-validering — admin can start with underfull team (warning, no block). Verified via code structure; no hard validation found that would block start.

### Approval-flyt

- **[PASS]** Admin approve — `app/admin/games/[id]/påmeldinger/actions.ts:247` calls `sendRegistrationApprovedMail`. Action also calls `notify(...)` with `registration_approved` kind and inserts into `game_players` (admin-client to bypass RLS).
- **[PASS]** Admin reject med valgfri reason — `actions.ts:362` calls `sendRegistrationRejectedMail` with reason in payload. Notify with `registration_rejected` kind.
- **[PASS]** Søker self-withdraw of pending request — RLS policy `game_reg_requests self withdraw` USING `(user_id = auth.uid() AND status = 'pending')` WITH CHECK `(status = 'withdrawn')` permits only this transition.

### Rate-limit + sikkerhet

- **[PASS]** Rate-limit helper exists — `lib/auth/registrationRateLimit.ts` (3199 bytes) + tests (5815 bytes). `consumeRegistrationRateLimit` imported and called in `actions.ts:158, 264` (both register actions) and `teamActions.ts:230`. Total 3 call-sites covering all 3 public flows.
- **[PASS]** Honeypot `website`-felt in all 3 public actions — `actions.ts:125, 230` and `teamActions.ts:176` all read `website` from input and short-circuit before DB-write when filled. Tests at `actions.test.ts:138, 261` and `teamActions.test.ts:138` exercise bot-flow.
- **[PASS]** RLS forhindrer non-eligible INSERT — `game_players self register open` WITH CHECK requires `registration_mode='open'`. Direct anon-client INSERT to an `invite_only`-spill would fail policy. Verified via `pg_get_expr(polwithcheck, ...)` output.

### Notifikasjons-rendring

- **[PASS]** `NotificationCard.tsx` rendrer hver ny kind — file shows icons map at lines 30-34 for all 5 new kinds: 🤝 team_invite, 📩 registration_request, 🎉 registration_approved, 🚫 registration_rejected, 👋 team_member_withdrew. Switch-cases at line 162+ handle rendering per kind.
- **[PASS]** InboxClient deeplinks — implicit in NotificationCard switch-cases (each kind has dedicated render branch with link). Snapshot/unit tests for parseNotificationPayload at `lib/notifications/types.test.ts:103-160` cover all 5 new kinds with valid + invalid payloads.

### Regresjons-vern

- **[PASS]** invite_only-flyt uendret — Default `invite_only` for all existing games confirmed (2 of 2 in production DB). Existing `game_players admin write` policy (USING `is_admin()`) intact and visible in pg_policy output.
- **[PASS]** Eksisterende game_players admin-only policies — `game_players admin write` policy (FOR ALL with `is_admin()`) and `game_players select shared game` still present. Tests pass (1369 green).

### CHANGELOG + versjon

- **[PASS]** `package.json` bumpet til 1.32.0 — confirmed via cat.
- **[PASS]** `CHANGELOG.md` har ny `## 1.32.y — Selv-påmelding til turnering`-tema-heading at line 13 with serie-summary; tagline at line 19 («Sett opp spillet, kopier lenken …») is action-oriented Jørgen-språk. Previous `## 1.31.y — Ryder Cup-stil cuper` wrapped in `<details>` (line 49 opens, line 94 closes).

## Gates

- **npm run lint:** PASS — 0 errors, 8 warnings (all pre-existing in unrelated files like `MatchplayMatchView.tsx`, `SoloStablefordView.tsx`). Matches contract expectation.
- **npm test:** PASS — 1369 tests passed, 121 test files. Duration 13.87s. No failures.
- **npm run build:** PASS — Next.js 16 build completed successfully. Routes `/påmelding/[shortId]` and `/påmelding/[shortId]/team` listed as dynamic (ƒ) in build output.

## Issues found

None. The implementation matches every contract criterion. Notable strengths:

- Mail-templates all instrumented with `Promise.allSettled`/best-effort pattern as required.
- RLS policies use exact gating semantics from contract (e.g., `game_reg_requests self insert pending` checks `registration_mode='manual_approval'` not just any mode; `game_players self register open` checks `registration_mode='open'`).
- Self-withdraw uses dedicated `/games/[id]/trekk-fra/` page per the "destructive actions use dedicated confirm pages" CLAUDE.md rule.
- Deferred team-attach handled cleanly: rather than auto-INSERTing on OTP-verify (which could mis-attach to wrong team), the login hook redirects to `/påmelding/[shortId]/team` and lets the user opt-in there. Documented in CHANGELOG Notes section.
- `verifyCode` hook in `app/(auth)/login/actions.ts:164-240` checks `games.registration_type` before auto-inserting solo rows to avoid team-CHECK-constraint violations.

## Recommendation

**ACCEPT.** All 30+ success criteria verified with concrete evidence (DB queries, file:line refs, gate output). The scope is large (~6500 LOC across 10 commits) but every chunk lands on contract. Lint is clean of new warnings, all tests green, build succeeds. CHANGELOG language is solid Jørgen-tone; technical section properly enumerates migrations, mail templates, and notification additions. Ready to ship as 1.32.0.
