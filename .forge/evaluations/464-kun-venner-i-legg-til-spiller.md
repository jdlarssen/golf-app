# Evaluation: #464 — Picker-kilde følger kontekst (venner / klubbmedlemmer)

**Verdict: NEEDS WORK**

**Date:** 2026-06-07
**Branch:** `claude/tender-mahavira-4c9d72`
**Evaluator:** forge:evaluate (skeptical, independent)

## TL;DR

Gates all pass (tsc 0, vitest 49/49, build OK). The pure function, the club-member
helper, the liga path, the empty-states, the `FriendQuickAdd` removal, and the version/
CHANGELOG bookkeeping are all correctly done. **But the central behavior the issue
exists for — the games-wizard step-4 selectable list must never show the whole
user base — is NOT achieved.** A runtime probe confirms a non-friend stranger still
renders as a selectable checkbox in step 4. The `pickList` is wired into
`PlayersSection`'s `players` prop, but that prop is dead for the rendered list:
`PlayersSection` renders `state.filteredPlayers`, which is derived inside
`useGameFormState` from the **full roster** (`GameWizard.tsx:165`), not from `pickList`.

## Gate results

| Gate | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit 2>&1 \| grep -c "error TS"` | **0 errors — PASS** |
| Unit/component | `npx vitest run lib/wizard/selectablePlayers app/admin/games/new/GameWizard.test.tsx lib/games/newGameFormData lib/league` | **5 files, 49 tests pass — PASS** |
| Build (Vercel parity) | `npm run build` | **Success (full route table, no error) — PASS** |
| Playwright | (frontend touched) | **Out of scope** — needs auth + seeded friends/clubs against prod; not run. Component test is the substitute and is inadequate (see Gap 1 / Criterion 2). |

## Per-criterion verdict

| Criterion | Verdict | Evidence |
|---|---|---|
| `selectablePlayers.ts` exists + Type-A `it.each` covers kompis/cup→friends, klubb+club→members, klubb-no-club→friends, solo→unchanged, empty-friends→[], empty-members→[]; vitest green | **PASS** | `lib/wizard/selectablePlayers.ts:36-47`; `selectablePlayers.test.ts` has all listed cases incl. self-always-present + order-preservation (12 cases). All green. |
| Wizard step 4 (`PlayersSection`) shows **only friends** for kompis/cup, **only club members** for klubb-with-club | **FAIL** | `pickList` reaches the prop (`GameWizard.tsx:795`), but `PlayersSection` renders `state.filteredPlayers` (`PlayersSection.tsx:166,174`) which is derived from the FULL roster passed to `useGameFormState` (`GameWizard.tsx:165`; derivation at `useGameFormState.ts:667-676`). Runtime probe: stranger NOT in `friendPlayerIds` STILL rendered a selectable checkbox `aria-label="Fremmedperson — HCP 18.0"` in step 4. The `players` prop is only consumed for the `length===0` empty guard and chip-name lookup — never for the selection list. |
| `FriendQuickAdd` removed (component + render); `grep` empty | **PASS** | `grep -rn FriendQuickAdd` over `.ts/.tsx` returns nothing (exit 1). Render block + component gone from `GameWizard.tsx`. |
| Liga `[id]` "Legg til deltakere" lists only friends (`getFriendPlayerOptions`), not whole roster | **PASS** | `app/admin/liga/[id]/page.tsx:69` fetches `getFriendPlayerOptions(userId)` and passes it as `players` to `LigaAddPlayers` (line 211). `getNewGameFormData()` kept only for `courses`. |
| Empty-state: friends-context no-friends shows `/profile/venner` link (wizard + LigaAddPlayers); klubb-no-members shows hint | **PASS** | Wizard: `PickerSourceEmptyHint` (`GameWizard.tsx:1085-1108`) — link for friends-context, "Ingen andre medlemmer i klubben ennå." for klubb. Gated on `pickListOthers === 0` (line 792). LigaAddPlayers: `LigaAddPlayers.tsx:40-56` splits no-friends (link) vs all-friends-already-participants ("Alle vennene dine er allerede deltakere."). |
| `getClubMemberPlayerOptions` returns email-free options + `memberIdsByClub`; both wizard server-pages merge options + send `clubMemberIdsByClub` | **PASS** | `lib/clubs/getClubMemberPlayerOptions.ts` — admin client, no email selected (line 85), best-effort EMPTY on error. `/admin/games/new/page.tsx:331,360-361` (admin roster already has all, sends id-map + currentUserId). `/opprett-spill/page.tsx:151,159-166,189-190` merges friend+club rows into roster, sends id-map + currentUserId. |
| tsc + build green; co-located tests; version 1.85.0 + CHANGELOG | **PASS** | Gates above. `package.json` = `1.85.0`. CHANGELOG: 1.85.y theme open at top, 1.84.y (#463) collapsed into "Tidligere versjoner" `<details>` drawer. |

## Gaps found

### Gap 1 — HIGH severity (correctness): friend-filter does not reach the games-wizard selection list

**The issue's core requirement is unmet for the games wizard.** `PlayersSection` renders
`state.filteredPlayers`, computed in `useGameFormState` from the full roster
(`GameWizard.tsx:165` passes `players`, not `pickList`, into the hook). Passing
`pickList` as the `players` prop to `PlayersSection` changes only the empty-guard and
chip-name lookup — the rendered checkbox list still shows everyone.

Confirmed by runtime probe (throwaway component test, since removed): rendered
`GameWizard` with `players={[friend, stranger]}`, `friendPlayerIds={['friend-1']}`,
`currentUserId="self"`, navigated kompis → stableford → step 4. The stranger's
checkbox was present (`expected <input> to be null` failed; received the stranger's
checkbox). The friend was also present. So **non-friends leak into the kompis/cup/klubb
picker** — exactly what #464 set out to prevent.

Note: the liga path (Criterion 4) is correct because `LigaAddPlayers` filters its own
`players` prop directly (`LigaAddPlayers.tsx:29`), so the friends-only source genuinely
takes effect there. Only the games-wizard half is broken.

Likely fix direction (not prescriptive): feed `pickList` into the state that drives the
rendered list — either pass `pickList` into `useGameFormState` as the source for
`filteredPlayers`, or have `PlayersSection` intersect `state.filteredPlayers` with its
`players` prop. The selected-players / TeamsAssignment lookup must keep the full roster
(per contract) so already-selected players surviving an intent switch still resolve.

### Gap 2 — MEDIUM severity (test coverage): component test does not prove exclusion

`GameWizard.test.tsx`'s `renderWizard` helper defaults
`friendPlayerIds = players.map((p) => p.id)` (every roster player is a friend). No test
puts a stranger in `players` but out of `friendPlayerIds` and asserts the stranger's
step-4 checkbox is absent. So the suite is a regression guard for "wizard still works
when all are friends" but never exercises the filter's exclusion at the UI layer — which
is precisely why Gap 1 slipped through green gates. Success criterion 2's "Verifisert i
kode (pickList-wiring) + Playwright" is only half-met: the wiring exists in source but
does not function, and no UI-level test catches it. A single component test of the
stranger-exclusion shape (the probe above) would have failed and surfaced Gap 1.

## Scope discipline — PASS (no gold-plating)

- 0 migrations added (`supabase/migrations/` untouched).
- No `group_id` on `tournaments`/`leagues`, no club-scoped cup/liga schema (#480) — only prose mentions in contract/CHANGELOG.
- No solo-intent removal / solo-vs-team split (#477/#478) — `selectablePlayers` leaves solo unchanged as specified.
- No auto-friendship-on-accept (#481).
- Diff is confined to the 11 expected files + package/lock + contract doc.

## Rationale

Five of seven success criteria and all four gates pass cleanly, and scope is disciplined.
But the one criterion that is the literal reason the issue exists — step-4 of the games
wizard must not show the whole base — fails in practice. The implementation wired the
filtered list to a prop that the rendering component ignores for its list, so the change
is a no-op for the games picker (the most-used path). The liga path works; the wizard
path does not. Because this is a correctness miss on the headline behavior, verified by a
direct runtime probe, the work is **NEEDS WORK** until the games-wizard step-4 list
actually sources from `pickList` and a UI-level test locks the stranger-exclusion.

---

## Cycle 2 re-evaluation

**Verdict: ACCEPT**

**Date:** 2026-06-07
**Branch:** `claude/tender-mahavira-4c9d72`
**Evaluator:** forge:evaluate (skeptical, independent — cycle 2)
**Fix under review:** commit `3980595` ("refactor(games): apply picker filter to the rendered checkbox list (#464)")

### TL;DR

The cycle-1 HIGH leak is **CLOSED**. `PlayersSection` now renders the checkbox `<ul>`
from `visiblePlayers = filteredPlayers.filter(p => selectableIds.has(p.id))`
(`PlayersSection.tsx:74-76,193`), not raw `filteredPlayers`. `GameWizard` passes
`selectableIds={pickIds}` where `pickIds = new Set(pickList.map(p => p.id))`
(`GameWizard.tsx:187,801`) and `pickList` comes from `selectablePlayers(...)`
(`GameWizard.tsx:171-184`). The full roster is still passed as the `players` prop
(`GameWizard.tsx:800`) for chips and `TeamsAssignment` lookups. Two new UI-level tests
(cycle-1 Gap 2) genuinely assert stranger-exclusion, and a tamper probe proves they are
not tautological. All gates pass. No regressions; scope still disciplined.

### Leak-closed evidence (the decisive probe)

I reintroduced the leak (`const visiblePlayers = filteredPlayers;`, dropping the
`selectableIds` filter) and ran the new `#464 picker-kilde` tests:

- **Both tests FAILED** with exactly the cycle-1 symptom:
  `expected <input aria-label="Fremmed Person — HCP 18.0" type="checkbox"> to be null`.
- Restoring the committed fix → both tests PASS (`2 passed | 15 skipped`).
- Working tree restored byte-identical (`git diff` on PlayersSection empty).

So the test is a true regression guard, and the fix is what makes it green. The
stranger (`s1`, not a friend, not self — `currentUserId` defaults to `''`) is correctly
excluded; the friend (`f1`) is present. The cycle-1 runtime probe (stranger checkbox
rendered) no longer reproduces.

Static confirmation:
- Rendered list driven by `visiblePlayers` (filtered) — `PlayersSection.tsx:193`. ✔
- `GameWizard` passes `selectableIds={pickIds}` derived from `pickList`/`selectablePlayers` — `GameWizard.tsx:171-187,798-803`. ✔
- No other step-4 selectable full-roster path: `TeamsAssignmentSection` only iterates `selectedPlayerIds` and uses `players.find(...)` for name lookup (`TeamsAssignmentSection.tsx:107,114,116,303,388-389`); it never renders a roster checkbox list. ✔

### Gate results (cycle 2)

| Gate | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit 2>&1 \| grep -c "error TS"` | **0 — PASS** |
| Unit/component | `npx vitest run lib/wizard/selectablePlayers app/admin/games/new/GameWizard.test.tsx lib/games/newGameFormData lib/league` | **5 files, 51 tests pass — PASS** (was 49; +2 new #464 exclusion tests) |
| Build (Vercel parity) | `npm run build` | **Success — PASS** |
| Tamper probe | reintroduce leak → run picker tests | **2 FAIL as expected → restore → 2 PASS** (test is non-tautological) |

### Chip / cross-context behavior (cycle-1 PASS criteria preserved)

- Step-4 `PlayersSection` `players` prop = full roster (`GameWizard.tsx:800`), not `pickList`. Chips use `players.find(...)` (`PlayersSection.tsx:142`). A friend selected then intent-switched still resolves. ✔
- `TeamsAssignmentSection` keeps full `players` (`GameWizard.tsx:809`). ✔

### Other criteria re-confirmed (no regression from the fix)

- Liga `[id]` sources friends only: `getFriendPlayerOptions(userId)` → `players={friends}` (`app/admin/liga/[id]/page.tsx:69,211`); `getNewGameFormData()` kept only for courses. ✔
- Empty-states: wizard `PickerSourceEmptyHint` gated on `pickListOthers === 0` (`GameWizard.tsx:188,795`); LigaAddPlayers splits no-friends (link) vs all-already (`LigaAddPlayers.tsx:40-53`). ✔
- `getClubMemberPlayerOptions` email-free (`select('id, name, nickname, hcp_index, profile_completed_at, gender, level')`, no email — `getClubMemberPlayerOptions.ts:86`); returns `memberIdsByClub` + options. ✔
- Both wizard server-pages pass `currentUserId` + `clubMemberIdsByClub`; `/opprett-spill` merges friend+club rows into roster with id-dedup (`opprett-spill/page.tsx:159-166,189-190`); `/admin/games/new` (`page.tsx:360-361`). ✔
- `FriendQuickAdd` gone — `grep` empty. ✔
- Version `1.85.0`; CHANGELOG `1.85.y` theme open at top, `1.84.y` (#463) collapsed under "Tidligere versjoner" `<details>` (`CHANGELOG.md:47-53`). ✔
- Scope discipline: 0 migrations; no `group_id` on tournaments/leagues; solo unchanged (`selectablePlayers.ts:40 return players`); no #480/#477/#478/#481 code (only an explanatory comment). Diff = 14 files (12 source/config + contract doc + lock). ✔

### Minor note (not a gap)

`selectablePlayers` gained a `selfId` field not in the contract's `Ctx` sketch, and the
rule now always keeps self selectable in non-solo contexts (`selectablePlayers.ts:46`).
The contract said "don't add self here — existing 'du er med' logic handles it," but this
wizard has no auto-add-self path; the arranger picks themselves from the list. Including
`selfId` lets the arranger add themselves and is filtered out of the empty-state count via
`pickListOthers` (`GameWizard.tsx:188`). It does **not** re-leak strangers (only the
arranger's own id, only if in roster). This is a sound, leak-safe adaptation, covered by
the `selectablePlayers.test.ts` self-always-present cases. No action needed.

### Rationale

The single HIGH gap from cycle 1 is closed at the rendering layer (the `<ul>` now sources
from the intersected `visiblePlayers`), proven by a tamper probe that flips the new tests
red↔green. The cycle-1 MEDIUM test-coverage gap is also closed — two UI-level tests now
lock stranger-exclusion at the wizard layer. All gates pass, all previously-passing
criteria are intact, and scope remains disciplined. **ACCEPT.**
