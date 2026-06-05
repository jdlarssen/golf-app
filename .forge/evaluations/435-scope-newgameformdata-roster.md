# Evaluation: #435 — scope getNewGameFormData()

## Verdict: ACCEPT

Commit under evaluation: `90fd0a0` (`fix(security): scope getNewGameFormData() so non-admin create/edit drops co-player emails`).

Independently verified by reading source (not trusting the contract's claimed line numbers), grepping all call sites, and running every gate. The core privacy claim holds: the `email` column is dropped at the data layer for both non-admin flows, so co-player e-postadresser never enter the RSC payload.

## Per-criterion results

| AK | Result | Evidence |
|----|--------|----------|
| **AK1** — non-admin `/opprett-spill` gets no other users' `email` in payload | PASS | `newGameFormData.ts:54-56` builds `userColumns` with no `email` when `includeEmail===false`; mapping `:100-116` returns `base` (no `email` key, not `email: undefined`) unless `includeEmail && u.email !== undefined`. Both `/opprett-spill` reads pass `false` (`page.tsx:101,129`). Test `'email' in p === false` green. No alternate email path: grep of wizard/create/edit code shows no other `from('users')` or email fetch; `sp.emails` refs are invite-error search-params, not roster. |
| **AK2** — `/games/[id]/rediger` uses e-post-fri variant | PASS | `rediger/page.tsx:131` calls `getNewGameFormData(false)`; the parallel `game_players` fetch (`:132-136`) selects only `user_id, team_number, flight_number, tee_gender` — no email. |
| **AK3** — picker works without email; pending = "Invitert spiller"; selected chip survives | PASS | All fallbacks land: PlayersSection `:28,30,37,38`, TeamsAssignmentSection `:38,39` (`?? PENDING_PLAYER_LABEL`), WolfSetup `:159`, RoundRobinSetup `:110` (`|| PENDING_PLAYER_LABEL`), useGameFormState haystack `:630` (`?? ''`). Selected-chip render iterates `selectedPlayerIds.map(pid => players.find(x=>x.id===pid))` keyed on id (`PlayersSection.tsx:122-126,133`) — email-independent, so a pending co-player's chip does NOT vanish; it shows "Invitert spiller". |
| **AK4** — admin `/admin/games/new` unchanged | PASS | `page.tsx:263,306` call `getNewGameFormData()` with no arg (default `true`). Page self-gates: `:80-82` `if (!role.isAdmin) redirect('/opprett-spill')`. |
| **AK5** — co-located loader test | PASS | `lib/games/newGameFormData.test.ts` 4 tests: captures the exact `.select(cols)` string and asserts `not.toContain('email')` for false / `toContain('email')` for true/default, plus `'email' in p` on output. Real proof of both legs, not superficial. |
| **AK6** — `tsc --noEmit` 0; `npm run build` ok | PASS | tsc exit 0; build `✓ Compiled successfully`, full route table rendered, no errors. |
| **AK7** — affected co-located tests green | PASS | 7 files / 96 tests pass (incl. GameForm, useGameFormState, GameWizard, WolfSetup, RoundRobinSetup, actions, new loader test). |

## Gate results

- `npx vitest run` (7 files: newGameFormData + GameForm + useGameFormState + GameWizard + WolfSetup + RoundRobinSetup + actions): **PASS** — `Test Files 7 passed (7) / Tests 96 passed (96)`.
- `npx tsc --noEmit`: **PASS** — `tsc exit: 0`.
- `npm run build`: **PASS** — `✓ Compiled successfully in 2.5s`, no errors/warnings in output.

## Test quality assessment

`newGameFormData.test.ts` is genuine, not superficial. It mocks the Supabase server client and captures the literal column string handed to `.from('users').select(...)` — the data-layer contract — and asserts `email` is absent from that string when `includeEmail=false`. It separately awaits the mapped output and asserts `'email' in p === false` for every player, AND asserts the default/true path keeps `email` in both select and output. Both legs of AK1 (select-string omits email AND output omits the key) are proven. The thenable mock correctly models the awaited PostgREST builder.

## Skeptical findings

I actively hunted for a residual leak vector and found none:

- **Alternate email path into the payload:** grepped `app/opprett-spill`, `app/games/[id]/rediger`, `GameWizard.tsx`, `GameForm.tsx` for `email` / `from('users')`. The only matches are the optional `PlayerOption.email?` type decl and unrelated `sp.emails` (admin invite-error search-param, a string the *creator* typed — not other users' addresses). The edit flow's secondary `game_players` join carries no email column. No leak.
- **`email: undefined` vs key-omission:** the mapping spreads `email` in only `includeEmail && u.email !== undefined`, returning a base object literal with no `email` property otherwise — so it is true key omission, which the test asserts with `'email' in p`. Correct.
- **Chip-vanish edge case (the gray-area decision):** confirmed the selected-chip lookup is id-based (`players.find(x=>x.id===pid)`), independent of email, so a pre-selected pending co-player in `/games/[id]/rediger` renders as "Invitert spiller" rather than disappearing. Decision honored in code.
- **React `cache` dedupe:** the arg is a primitive boolean (`includeEmail = true`), and both `/opprett-spill` reads pass the same literal `false` — value-equal, so they share one cache entry. The contract's reasoning is sound; an options-object would indeed have produced two identities. (Not independently runtime-verified, but the static premise is correct.)
- **Admin gating:** `/admin/games/new` keeps the full roster but self-gates on `role.isAdmin` before any roster load, redirecting non-admins to `/opprett-spill`. Admin's own search-on-email haystack still works (admin path keeps email); `?? ''` is a no-op there.

Genuinely tried to break it and could not. The fix is correctly scoped, the data-layer omission is real (not just a presentational mask), no other code path reintroduces the email, and all gates pass.
