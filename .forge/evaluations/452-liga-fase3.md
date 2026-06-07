# Evaluation: #452 Liga — Fase 3 (medlems-initiert «Bli med i ligaen»)

**Branch:** `issue-452-liga-fase3` (4 commits since `main`)
**Evaluated:** 2026-06-07
**Verdict:** ✅ **ACCEPT**

The work fully implements the contract. All gates pass, every success criterion is verified
with concrete evidence (including live, rolled-back MCP probes of the RPCs and RLS), and the one
deviation from the contract (redirect-based `joinClubLeague` instead of `LeagueActionError`-returning)
is sound and matches the established `leaveClub` precedent.

---

## Gate results

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | **PASS** — `TSC_EXIT=0`, 0 errors |
| `npx vitest run lib/league components/league app/liga` | **PASS** — 5 files, 41 tests passed |
| `npx eslint app/liga lib/league components/league` | **PASS** — `ESLINT_EXIT=0`, no output |
| `npm run build` | **PASS** — `BUILD_EXIT=0`, Compiled; `/liga/[id]/meld-av` present as ƒ (dynamic) |
| `lib/league/selfService.test.ts` (co-located) | **PASS** — 8 tests |
| Humanizer / AI-tell scan on new Norwegian copy | **PASS** — no matches for known tells |

---

## Success criteria — per-criterion evidence

### 1. Migration 0086 added + applied to prod; types regenerated ✅
- `list_migrations` shows `league_self_service` (version `20260607160000`) as the last entry → applied to prod.
- Live `pg_proc`: both `join_club_league` and `leave_club_league` exist, `prosecdef=true` (SECURITY DEFINER),
  `proconfig=["search_path=\"\""]` (empty search_path). Matches the contract exactly.
- `lib/database.types.ts:1655,1657` — both RPC signatures present:
  `join_club_league: { Args: { p_league_id: string }; Returns: string }` (+ leave).
- Grant lockdown verified live via `has_function_privilege`: **anon=false, authenticated=true, public=false**
  for both functions.

### 2. `leagueSelfServiceState` covered by Type-A tests ✅
- `lib/league/selfService.ts` predicate matches the contract verbatim (draft-only join, leave-before-played,
  club-only via `groupId !== null`).
- `lib/league/selfService.test.ts` — 8 tests, all scope combinations green. Both true and false paths of
  every AND-clause in `canJoin`/`canLeave` are exercised (standalone, member/non-member, participant/not,
  draft/active/finished, played/not). Not shallow. The standalone+participant sub-case also guards `canLeave`.

### 3. `getLigaSnapshot` returns `hasPlayed` per deltaker ✅
- `lib/league/getLigaSnapshot.ts:208-226` — `playedUserIds = Set(gamePlayers.filter(submitted_at !== null).map(user_id))`,
  attached as `hasPlayed: playedUserIds.has(p.user_id)`. No extra DB query (reuses already-fetched `game_players`,
  which the select already pulled `submitted_at` on).
- The derivation aligns exactly with the RPC's `already_played` check: both scope to game_players whose game's
  `league_round_id` belongs to the league (snapshot via `gameIds ⊆ games where league_round_id in roundIds`).
- A participant who never had a `game_players` row → not in the set → `hasPlayed=false`. Correct.

### 4. «Bli med» shows only on draft club league for a non-participant member; join sets `accepted_at` ✅
Traced `app/liga/[id]/page.tsx:158-207` adversarially:
- **Non-participant club member, draft club league:** `isClubMember=true`, `canJoin=true` → button shows. ✓
- **Global admin (not a club member):** `membership=null` → `isClubMember=false`; allowed via `is_admin` (no notFound),
  but `canJoin=false` → no button. ✓ (organizer, not player)
- **Participant:** block skipped, `canJoin=false`. ✓
- **Standalone league:** `group_id=null` → whole gate block skipped, `isClubMember=false`, `canJoin=false`. ✓
- **Active/finished club league:** `canJoin` requires `status==='draft'` → false. ✓
- Live probe (rolled back): member B joins draft club league → RPC returns `'joined'`; row inserted with
  `accepted_at = now()` (#463 self-confirmed, per migration source line `values (p_league_id, v_uid, now())`).

### 5. Non-played participant sees «Meld deg av» → /meld-av → row removed; after play button gone + RPC rejects ✅
- `app/liga/[id]/meld-av/page.tsx:60-67` gates on `canLeave` (recomputed via the same predicate) and
  `redirect('/liga/[id]')` otherwise. Error codes wired to Norwegian via `LEAVE_ERROR_MESSAGES`.
- Live probe (rolled back): B (participant, not played) leave → `'left'`; leave again → `'not_member'`.
- Live probe: B with a submitted scorecard in a league flight → leave → **`'already_played'`** (button hidden by
  `canLeave=false` since `hasPlayed=true`, RPC is the backstop).

### 6. RLS/security enforced — live MCP probe (all rolled back) ✅
All probes ran inside `begin; … rollback;` (verified zero leftover `PROBE %` rows after each):

| Scenario | Expected | Actual |
|----------|----------|--------|
| member joins draft club league | joined | **joined** |
| join again (idempotent) | already_member | **already_member** |
| join active club league | not_draft | **not_draft** |
| join standalone league | not_club_league | **not_club_league** |
| non-member joins | not_member | **not_member** |
| participant (not played) leaves | left | **left** |
| leave again | not_member | **not_member** |
| leave after submitted scorecard | already_played | **already_played** |
| leave finished league | finished | **finished** |
| join finished league | not_draft | **not_draft** |
| **direct INSERT into league_players by member (bypass RPC)** | blocked | **BLOCKED: new row violates RLS policy** |

- `league_players` RLS write policy unchanged and admin/club-admin-only: the `ALL` policy is
  `is_admin() OR (league_group_id IS NOT NULL AND is_group_admin(...))`. The only member-direct write is the
  pre-existing #463 `self mark accepted` UPDATE (NULL→NOT NULL only, cannot insert/delete). So the two RPCs are
  genuinely the only member INSERT/DELETE path; defense-in-depth confirmed.
- `anon` has no execute on either RPC (verified).

### 7. MINOR bump → v1.93.0 + CHANGELOG; `Part of #452` ✅
- `package.json` / `package-lock.json` → `1.93.0` (only change). 
- `CHANGELOG.md` — new `## 1.93.y — Liga · meld deg på selv` series with three-layer structure (tagline blockquote
  + `<details>` Teknisk), and the previous 1.92.y series correctly re-wrapped under a `<details>` "2 serier" group.
- PR-body instruction is the author's responsibility; contract specifies `Part of #452` (cannot verify a PR that
  isn't created yet — not in scope of code eval).

### 8. Flow diagram updated ✅
- `docs/flows/06-liga-fremtid.svg` + `.png` updated: club-liga branch (#480) extended with
  "Medlemmer kan melde seg på selv før ligaen starter (#452)"; badge relabeled "#480 + #452".
- `docs/flows/README.md` Flyt 6 line updated to describe Fase 3.

---

## Deviations from contract

1. **`joinClubLeague` returns `void` (redirect-based), not `LeagueActionError`.**
   The contract's Design §4 *type signature* (line 161) said `Promise<LeagueActionError>`, but the *prose* of the
   same section and the cited `leaveClub`/`/klubber/[id]/forlat` precedent both describe redirect-based handling
   (`?error=<kode>`). The implementation matches the prose + precedent and is **sound**:
   - No `try/catch` wraps the `redirect()` calls, so the thrown `NEXT_REDIRECT` propagates correctly — no swallowing.
   - Control flow is correct: error → redirect (throws/exits); joined/already_member → revalidate + redirect (exits);
     other codes → `redirect(?error=<code>)`. The trailing redirect is only reachable for soft-reject codes.
   - The page reads `?error` and maps via `JOIN_ERROR_MESSAGES`; `Banner tone="error"` renders it.
   Verdict: **acceptable** — consistent UX with the existing leave-club flow, and the page error-mapping makes the
   `void` form strictly better for a `<form action>` button than returning a value nobody reads.

## Minor observations (non-blocking, no fix required)

- `lib/database.types.ts` diff also strips the trailing newline at EOF (cosmetic; the file is generated). Not worth a
  change unless a linter ever complains.
- `meld-av/page.tsx` passes `isClubMember: false` to the predicate with a comment "irrelevant for canLeave" — correct,
  since `canLeave` doesn't read `isClubMember`. Clean.

## Norwegian copy review

New strings are idiomatic bokmål, action-verb-first, no anglicisms, no særskriving, no "vennligst", no em-dash chains:
- "Bli med i ligaen" / "Du er medlem i klubben. Meld deg på før ligaen starter." / "Melder deg på …" / "Melder deg av …"
- "Meld deg av «{league.name}»?" / "Du tas ut av sesong-tabellen, men kan bli med igjen så lenge ligaen ikke har startet."
- Error copy: "Ligaen har allerede startet. Be klubb-admin om å legge deg til." / "Du har allerede spilt en runde. Be klubb-admin om å fjerne deg." etc.
No AI-tells found by mechanical scan or manual read.

---

## Conclusion

**ACCEPT.** Every success criterion is met with verifiable evidence; all six gates pass; the security model is
confirmed live (RPCs are the sole gated member write-path, RLS blocks direct writes, anon has no execute, return codes
are exactly correct across 11 scenarios including the played/finished edges); and the lone contract deviation is a
sound, precedent-aligned improvement. No fixes required.
