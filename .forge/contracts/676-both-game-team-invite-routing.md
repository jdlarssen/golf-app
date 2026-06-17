# Contract: #676 — email-invited co-player on a 'both' game must not become a solo dead-end

## Context
A captain self-registers on a game with `registration_type = 'both'` and invites an
unregistered co-player by email → an `invitations` row with `game_id` is created.
When that co-player verifies their OTP, `verifyCode` only treats the game as team-only
when `registration_type === 'team'`. For `'both'` games it (a) auto-inserts a SOLO
`game_players` row and (b) flips the invitation's `accepted_at`, which destroys the
signal the team-attach page relies on (`/signup/[shortId]/team` only offers "Bli med på
lag" while a pending invitation with `accepted_at IS NULL` exists). Net: the invited
player is detached from the captain's team as a lone solo entry with no path back. P2.

Files:
- `app/[locale]/(auth)/login/actions.ts` — `verifyCode` (guard ~:287, accepted_at flip ~:253-257, solo insert ~:294-321)
- `app/[locale]/signup/[shortId]/team/page.tsx` — attach flow (~:94-116)

## Success Criteria
- [ ] For a game whose `registration_type` is `'team'` OR `'both'`, `verifyCode` does NOT auto-insert a solo `game_players` row for an email-invited co-player.
- [ ] For team/both invitations, the `accepted_at` flip does NOT consume the invitation before the team-attach flow can find it (skip/defer the flip for team-scoped invitations, OR find the invitation by a non-consumed field).
- [ ] After verifying, an email-invited co-player on a team/both game is routed to `/signup/[shortId]/team` (the attach flow), not to `/games/[gameId]`.
- [ ] The team-attach page (`team/page.tsx`) still finds the pending invitation and offers "Bli med på lag" for both `'team'` and `'both'` games.
- [ ] Solo invitations (game `registration_type` not team/both, or no game_id) keep their existing behaviour (solo insert + accepted_at flip + redirect to game).
- [ ] Co-located test(s) covering: 'both' game email-invite → no solo row + invitation still findable + redirect to team page.
- [ ] `npx tsc --noEmit` clean; relevant vitest green.

## Out of scope
- Adding a brand-new `team_request_id` column / migration if the flip can be safely skipped without one (prefer the minimal, migration-free fix).
- The invite_only TEAM signup dead-end (#685) — different file path, separate issue.

## Gates
- `npx tsc --noEmit`
- `npx vitest run` on the co-located test(s) for login/actions + team flow

## Notes
- Next.js 16 conventions apply (server actions, `redirect`). Check `node_modules/next/dist/docs/` if unsure.
- Any new user-facing Norwegian copy must go through next-intl message catalogs (app is fully i18n'd) and the humanizer skill.
