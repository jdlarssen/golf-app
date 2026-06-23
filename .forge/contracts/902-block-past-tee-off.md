# Contract: #902 — Block creating/editing a game with a tee-off in the past

Worktree: `.claude/worktrees/sad-easley-4c7265` · Branch: `claude/sad-easley-4c7265` (off origin/main @ c308bb81)
Issue: [#902](https://github.com/jdlarssen/golf-app/issues/902) · `enhancement, area:admin`

**Non-interference note:** a parallel chat owns #921 (RLS invite-eligibility on `game_players`).
This work touches `games`-creation validation only — disjoint files, **no migration**, no
`game_players` / RLS / invite-eligibility code. Sole shared files are `messages/{no,en}.json`,
`package.json`, `CHANGELOG.md` (append-only, trivial rebase).

## Problem

The create/edit flow persists `games.scheduled_tee_off_at` raw, never compared to "now". A
past tee-off → the `/games/[id]` E1 auto-start fallback fires immediately (game jumps to
`active` on first visit without the admin pressing "Start runden nå"), and "Starter om X"
countdowns go negative. Picking a past date is almost always a mistyped date.

## Decisions (from owner, locked in /forge:contract)

1. **Block, not clamp.** Owner prefers a hard server-side block with a Norwegian error.
   (Clamp-to-now + toast was the stated fallback; not needed — block is clean here.)
2. **Grace margin = 5 minutes.** Reject only if the tee-off instant is **more than 5 min**
   before server-now. Absorbs "create the game as the round starts" + form-submit latency +
   small clock skew, while still catching yesterday / this-morning mistakes.
3. **Server is authoritative** (AGENTS.md trap #3). Client `min` is a UX nudge only —
   `datetime-local` `min` is not enforced cross-browser.
4. **One home for the rule** (AGENTS.md trap #4): a single pure helper, imported by both
   action sites, so create and edit agree by construction. A unit test pins the helper.
5. **Scope guard:** liga rounds (`lib/league/actions.ts`) + cup matches have the same missing
   guard but are **explicitly out of scope** (issue says: own follow-up issue). Do not touch.

## File boundaries

ONLY touch:
- `lib/games/gamePayload.ts` — add `TEE_OFF_PAST_GRACE_MS` + `isTeeOffInPast(iso, nowMs)`.
- `lib/games/gamePayload.test.ts` — unit tests for the helper.
- `app/[locale]/admin/games/new/actions.ts` — `createGameInternal`, guard on `mode === 'publish'`.
- `app/[locale]/admin/games/[id]/edit/actions.ts` — `updateGameInternal`, guard on `publish | update_scheduled`.
- `app/[locale]/admin/games/new/sections/BasicsSection.tsx` — `min` on the tee-off `<Input>`.
- `messages/no.json` + `messages/en.json` — new `errors.tee_off_in_past` key.
- `package.json` (+`package-lock.json`) + `CHANGELOG.md` — patch bump + entry.

Do NOT touch: any migration, `game_players`, RLS, `lib/league/`, cup actions, scoring.

## Implementation notes

- **Helper** (`gamePayload.ts`):
  ```ts
  export const TEE_OFF_PAST_GRACE_MS = 5 * 60 * 1000;
  /** True when the tee-off instant is more than the grace margin before `nowMs`.
   *  Instant-vs-instant compare → timezone-correct (the Oslo wall-clock is already
   *  resolved by parseOsloDateTimeLocal). Malformed/empty ISO → false (handled upstream). */
  export function isTeeOffInPast(teeOffIso: string, nowMs: number = Date.now()): boolean {
    const t = new Date(teeOffIso).getTime();
    if (Number.isNaN(t)) return false;
    return t < nowMs - TEE_OFF_PAST_GRACE_MS;
  }
  ```
- **Create guard** — after `scheduledTeeOffAt` is parsed (actions.ts ~L77-94), before the
  side-tournament block: `if (mode === 'publish' && scheduledTeeOffAt && isTeeOffInPast(scheduledTeeOffAt))`
  → `redirect({ href: ${errorBase}?error=tee_off_in_past, locale })`. Drafts tolerate past/null.
- **Edit guard** — same shape after parse (edit/actions.ts ~L69-82):
  `if ((mode === 'publish' || mode === 'update_scheduled') && scheduledTeeOffAt && isTeeOffInPast(scheduledTeeOffAt))`
  → `redirect({ href: ${editBase}?error=tee_off_in_past, locale })`. `save_draft` tolerates.
- **Client `min`** — `BasicsSection` is `'use client'`. Compute the browser-local
  `YYYY-MM-DDTHH:mm` `min` **after mount** (`useState(undefined)` + `useEffect`) to avoid an
  SSR/CSR hydration mismatch; pass `min={minTeeOff}` through `<Input>` (it spreads `...props`).
  Local getters are correct here (it's the user's browser, not the UTC server).
- **Message** — `errors.tee_off_in_past`. NO: "Tee-off kan ikke være tilbake i tid. Velg et
  tidspunkt fra nå av." EN: "The tee-off time can't be in the past. Pick a time from now on."
  Run `humanizer` on the Norwegian string + the CHANGELOG tagline before commit.

## Success criteria

- [ ] `isTeeOffInPast` + `TEE_OFF_PAST_GRACE_MS` exist in `gamePayload.ts`; instant-compare with 5-min grace.
- [ ] Publishing a game (create) with tee-off >5 min in the past redirects with `?error=tee_off_in_past`; the page renders the Norwegian message.
- [ ] Edit `publish` and `update_scheduled` apply the same guard; `save_draft` does not.
- [ ] Same-day / "start now" not broken: tee-off at now, within 5-min grace, or in the future passes.
- [ ] `datetime-local` field has a `min` (hydration-safe) nudging away from past picks.
- [ ] Unit test: `it.each` covering >grace-past rejected, within-grace accepted, exactly-at-boundary, future accepted.
- [ ] `errors.tee_off_in_past` present in both `messages/no.json` and `messages/en.json`.
- [ ] Patch bump to 1.140.8 + CHANGELOG entry (`· #902`) under the open "Tall på flisene" theme; humanizer-clean tagline.

## Gates (scoped to changed files)

- `npx tsc --noEmit` (whole-project; new code must typecheck).
- `npx eslint app/[locale]/admin/games/new/actions.ts app/[locale]/admin/games/[id]/edit/actions.ts app/[locale]/admin/games/new/sections/BasicsSection.tsx lib/games/gamePayload.ts`
- `npx vitest run lib/games/gamePayload.test.ts` (+ any co-located action tests that exercise the changed files).
- Commit-msg hook enforces `fix` → patch bump + `Refs #902` in body.

## Out of scope

- Liga/cup symmetric guard → file a follow-up issue at close (issue explicitly defers it).
- Clamp-to-now fallback (block chosen instead).
- DB-level CHECK/trigger (server-action guard is sufficient; a CHECK can't reference `now()` cleanly).
