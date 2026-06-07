# Evaluation: #488 — Regenerate `lib/database.types.ts`

**Verdict: ACCEPT**

Pure mechanical chore; all criteria verified with reproducible evidence. No fresh-context
sub-agent evaluator spawned — there is no UI, no logic, and no judgment call; every criterion
is mechanically provable, and the decisive check (byte-identity to generator output) was run
directly.

## Criteria

| Criterion | Evidence |
|---|---|
| `league_group_id` RPC present | `grep -c league_group_id` = 1 (was 0 pre-regen). |
| `befriend_inviter` RPC retained | `grep -c befriend_inviter` = 1; prod `list_migrations` shows `auto_friendship_via_invitation` (0084) applied. |
| Verbatim generator output, no hand-edits | Re-ran `generate_typescript_types`; `diff` vs committed file = IDENTICAL. |
| `tsc --noEmit` clean | `TSC_EXIT=0`. |
| Atomic `chore(types):` commit, no bump | commit `df1ab82`; `git diff --stat` = single file `lib/database.types.ts`, 207 ins / 205 del. |

## Notes

- File is not imported anywhere (Supabase clients omit the `Database` generic), so zero compile/runtime impact — confirms the issue's "ren vedlikehold" framing.
- Wiring the `Database` generic into the clients is explicitly a non-goal (separate concern).
