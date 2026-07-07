# Evaluation: #1124 Discord-knapper — toveis loop-styring

**Commit reviewed:** 2c30105b · **Branch:** claude/1124-discord-knapper
**Contract:** .forge/contracts/discord-knapper.md

## Verdict

**ACCEPT (partial) — receiving-endpoint slice only.**

The commit delivers a correct, defensively-coded Discord Interactions endpoint
(`app/api/discord/interactions/route.ts`) plus its pure logic module
(`lib/loops/discordActions.ts`), both backed by real-cryptography unit tests.
Every gate is green and the security posture holds up under adversarial
reasoning and live mutation-testing (see Findings). However, the contract's
Design section has four numbered items and this commit ships only #1
(interactions endpoint) and #2 (discordActions.ts) — **Design item 3
(sender-side bot-API + buttons) is not implemented anywhere in the tree**, and
Design item 4 (owner setup recipe) is not posted to the issue. Criteria 4 and
5 are correctly self-identified as PENDING ACTIVATION, and that framing holds
up — but the evaluator flags that without item 3, there is currently no
button in existence for a real owner to press. This is a legitimate,
well-executed partial slice, not a finished feature. Recommend: accept this
commit as merge-worthy infrastructure, but do not close #1124 — the sender
side is a required follow-up before the feature has any user-visible effect.

## Gates

| Gate | Expected | Result |
|---|---|---|
| `npx vitest run lib/loops app/api/discord` | 32/32 | **32/32 passed** ✅ |
| `npm run typecheck` | clean | **clean, no output** ✅ |
| `npm run lint` | 0 errors | **0 errors, 54 warnings** (all pre-existing complexity warnings in unrelated files — none in the new discord files) ✅ |
| `npm run build` | green, no `runtime` export trap | **green**; `grep -n runtime route.ts` → no match; `/api/discord/interactions` listed as `ƒ` (Dynamic) alongside sibling `/api/cron/*` routes ✅ |
| `bash tests/hooks/guard.test.sh` | pass | **39 bestått, 0 feilet** ✅ |

All EXPECT predictions matched actual output exactly.

## Criteria (from contract's Success Criteria list)

1. **Unit-tests for signature verification + custom_id parsing (mocked GitHub client), `npx vitest run lib/loops app/api/discord`** — **PASS**. 32 tests, real ed25519 keypairs generated per test run (not mocked crypto), covers valid/tampered/wrong-key/garbage-hex, all `merge_pr`/`ready_issue`/`answer` paths incl. draft-PR, red CI, pending CI, closed PR, and GitHub-error propagation.
2. **PING→PONG and non-owner rejection verified in test** — **PASS**. Both explicit tests present and pass; mutation-tested (see Findings) to confirm they're not vacuous.
3. **`npm run build` green + full gates** — **PASS**. See Gates table.
4. **Stagingbevis-porten (#1076): signed test-interaction against staging deploy performs a real label action** — **PENDING ACTIVATION, correctly framed**. Owner has already set the real Discord public key on both Vercel envs, so a synthetic signed staging probe is impossible without the real private key (which only Discord holds). This is a genuine constraint, not an excuse — judged sound (see Findings).
5. **End-to-end with owner: a real button press merges a real PR** — **PENDING ACTIVATION, but currently un-activatable**. There is no button to press: Design item 3 (sender-side wiring in the morning brief / escalation paths) was not implemented in this commit, and `docs/loops/morgenbriefen.md` still documents plain-webhook-text-only mirroring with no `custom_id`/button generation. This criterion cannot be exercised until a follow-up commit ships item 3.

## Findings

**Security review — route.ts (line by line):**
- Raw body is read via `request.text()` (line 85) **before** any parsing — signature is correctly computed over raw bytes per Discord's contract. Confirmed no earlier `request.json()` call exists.
- Missing `x-signature-ed25519` / `x-signature-timestamp` headers → falls into the same `if` as verification failure → 401. Confirmed via header-omission test.
- Freshness window (`isTimestampFresh`, 300s) is checked in the same short-circuit `if` as the signature — malformed/stale timestamps fail closed before crypto verification even runs (cheap check first, correct ordering for a fail-closed gate either way).
- Missing env vars (`DISCORD_PUBLIC_KEY`/`DISCORD_OWNER_ID`/`GITHUB_LOOP_PAT`) → 500 with a generic `'Not configured'` body; the only detail written is to `console.error` server-side (LOG_PREFIX), never in the HTTP response. No leakage.
- Owner check reads `interaction.member?.user?.id ?? interaction.user?.id` — covers both guild-context (`member.user.id`) and DM-context (`user.id`) interaction shapes per Discord's API, matching real-world payload variance.
- Non-owner and unknown-`custom_id` paths both return `CHANNEL_MESSAGE` (type 4) with `flags: EPHEMERAL` (64) and **return before any GitHub client is constructed or called** — confirmed structurally (the `githubClient(pat)` call and `after()` block are both below both guard clauses) and behaviorally (test asserts `fetch` not called).
- PAT is only ever placed in the `Authorization` header sent to GitHub; never interpolated into any logged string. Grepped for `pat` usage — confined to `githubClient()` header construction.
- `followUpUrl` is built from `interaction.application_id`/`interaction.token`, which are fields inside the **already signature-verified** raw body. An attacker cannot supply a forged `application_id`/`token` pair without possessing Discord's private key (the same key gating PING/button verification) — reasoned through and considered sound, not a gap. Worst case for a compromised/malicious *legitimate* Discord-signed payload would be misdirecting its own follow-up, which has no security consequence beyond wasted effort.

**discordActions.ts:**
- SPKI prefix `302a300506032b6570032100` verified byte-for-byte correct against a freshly `crypto.generateKeyPairSync('ed25519')`-derived key exported as DER/SPKI (checked programmatically in this review, not just read) — first 12 bytes match exactly.
- `verifyDiscordSignature` fail-closed confirmed: try/catch swallows malformed hex/key-format errors and returns `false`, never throws to caller. Test covers garbage hex explicitly.
- `parseCustomId` regexes are fully anchored (`^...$`), digit-only capture groups — no path-traversal or injection surface even with absurd inputs (verified with a 20-digit number: `Number()` coerces cleanly, GitHub API would just 404 it).
- `merge_pr` flow ordering verified correct: PR fetch → check-runs fetch → **only if clean** → draft-to-ready GraphQL → merge PUT. No mutating call happens before the CI gate — confirmed both by reading the switch case and by the test asserting exact call-order arrays (`['GET','GET','PUT']` / `['GET','GET','GRAPHQL','PUT']`) and by the red/pending-CI tests asserting exactly 2 calls (both reads, zero mutations).
- Merge method is hardcoded to `'rebase'` with no code path to override it — squash is structurally unreachable, matching repo policy.
- All error paths return Norwegian, specific, non-generic messages including the underlying GitHub HTTP status or `message` field — no silent failures.

**Test-quality checks performed (not just read — executed):**
- Removed the `await Promise.all(afterState.pending)` line from the route test and reran: the follow-up-URL assertion genuinely failed (`false` where `true` expected), proving the test actually depends on awaiting the `after()` work rather than passing vacuously. Reverted; suite confirmed clean afterward (git diff empty, 5/5 green).
- Mutation-tested `verifyDiscordSignature` by temporarily replacing it with a function that always returns `true`: 4 tests immediately failed (including the tampered-body and no-signature-headers cases), proving the suite is exercising real ed25519 verification rather than a bypassable stub. Reverted; confirmed clean (git diff empty, 32/32 green).
- `vi.stubGlobal('fetch', ...)` in `beforeEach` is paired with `vi.unstubAllGlobals()` in `afterEach` — ran the route test file in isolation (`vitest run app/api/discord/interactions/route.test.ts`) and confirmed no cross-test leakage.

**Gap hunt:**
- **Design item 3 (sender-side bot-API + buttons) is undelivered.** No `DISCORD_BOT_TOKEN`/`DISCORD_CHANNEL_ID` usage exists anywhere outside the contract file itself; `docs/loops/morgenbriefen.md`'s "Discord-speiling" section is unchanged and still describes plain-webhook-text mirroring only, with no button/`custom_id` generation. This is the missing half of the feature — the endpoint under review has nothing to receive from yet.
- **Design item 4 (owner setup recipe)** does not appear to have been posted anywhere in this commit (not in the diff, and this evaluation was not asked to check the GitHub issue thread — flagging as unverified rather than PASS/FAIL).
- No path was found where an unverified/unsigned request can reach the GitHub client — every code path to `githubClient()`/`executeAction()` sits behind both the signature+freshness gate and the owner-ID check.
- Version bump: 1.181.0 → 1.182.0, correct minor bump for a `feat` commit per repo convention. `CHANGELOG.md` untouched with `[no-changelog]` present in the commit body — defensible, since this ships no user-visible surface yet (no button exists to press) — though it's worth noting to the owner that this is a `feat`-prefixed commit riding the internal-change escape hatch; reasonable given the phased rollout, not a rule violation.
- `proxy.ts` matcher confirmed to exclude all of `api/` from the auth gate, matching the contract's stated assumption — this route is public by design, not by accident.

## Runde 2

**Commit reviewed:** 9168cc08 (docs-only fix on top of 2c30105b) · **Branch:** claude/1124-discord-knapper

**Verdict: ACCEPT.** The single gap from round 1 — Design item 3, the
sender side that actually produces a button to press — is now closed.

**Scope check.** `git show --stat 9168cc08` touches exactly three files:
`docs/loops/morgenbriefen.md`, `.forge/evaluations/1124-discord-knapper.md`,
`.forge/evaluations/1124-discord-knapper-runder.md`. No `app/` or `lib/` path
appears in the diff — this is a docs-and-evaluations-only commit, as
expected for a spec-completeness fix. No code changed, so the round-1 code
review (security walkthrough, mutation-testing, gate results) still stands
unmodified.

**Custom_id contract cross-check (character-by-character).** The new
"Discord-speiling (utgående varsel + knapper)" section in
`docs/loops/morgenbriefen.md` (lines 64–87) declares three button mappings.
Checked each against `lib/loops/discordActions.ts`'s `parseCustomId`
regexes:

| Doc text | Regex | Match |
|---|---|---|
| `custom_id: merge_pr:<N>` | `/^merge_pr:(\d+)$/` | exact — literal prefix + digits |
| `custom_id: answer:<issue>:<A\|B>` | `/^answer:(\d+):(A\|B)$/` | exact — literal prefix + digits + `:` + `A\|B` |
| `custom_id: ready_issue:<N>` | `/^ready_issue:(\d+)$/` | exact — literal prefix + digits |

All three are fully anchored in the regex (`^...$`) and the doc promises
nothing the parser can't accept — no phantom button, no format drift (e.g.
no accidental hyphen vs. colon, no extra segment). Doc lists the three in
merge/answer/ready order while the code comment in `discordActions.ts` lists
merge/ready/answer — cosmetic ordering only, not a contract mismatch.

**Other Design-item-3 sub-requirements, verified present in the new text:**
- Bot-API posting path with both env vars: line 72–73, `DISCORD_BOT_TOKEN` +
  `DISCORD_CHANNEL_ID`, `POST /api/v10/channels/{DISCORD_CHANNEL_ID}/messages`
  with `Authorization: Bot …` — matches the contract's Design item 3 and item
  4 env-var list verbatim (`.forge/contracts/discord-knapper.md` line 30).
- 5-per-row limit: line 82, attributed correctly to Discord's own button-row
  cap, with an explicit overflow strategy (more rows/messages).
- 1800-char shortening rule: line 83, shorten + link back to the #1110
  comment — consistent with the existing webhook-fallback shortening
  behavior described earlier in the same file (line 44 area), so the two
  size-limit rules don't contradict each other.
- Webhook-text fallback: line 85–86, `DISCORD_WEBHOOK_URL`-only case falls
  back to the pre-existing plain-text mirror ("som før") — correctly
  reflects that regular webhooks can't send components, matching the
  contract's stated Discord-constraint (contract line 13).
- Missing-both silent skip: line 86–87, "Mangler begge: hopp stille over" —
  present, matches the original heartbeat-vakta section's established
  silent-skip convention for missing optional env vars.

**Round-history file.** `.forge/evaluations/1124-discord-knapper-runder.md`
exists, is committed in 9168cc08, and its round-1 row/note accurately
reflects this file's round-1 verdict (ACCEPT partial), the finding signature
(sender-side missing), and the correct PENDING ACTIVATION framing for
criteria 4–5 — no rewriting of history, no score inflation.

**Cross-check for contradictions.** Read the full new section against
`route.ts` and `discordActions.ts` line by line: no button/custom_id is
promised that the endpoint can't parse, no env var is named that the route
doesn't also check (`route.ts` checks `DISCORD_PUBLIC_KEY` /
`DISCORD_OWNER_ID` / `GITHUB_LOOP_PAT` for receiving; the doc's new bot-API
path uses the disjoint sender-side pair `DISCORD_BOT_TOKEN` /
`DISCORD_CHANNEL_ID`, correctly not conflated with the receiving-side vars).
No inconsistency found.

**Remaining PENDING ACTIVATION items (unchanged from round 1, not blocking):**
Design item 4 (owner setup recipe posted to the issue) and criteria 4–5
(real staging button press, real merge) still require the owner's manual
Discord Developer Portal setup — this is infrastructure that cannot be
verified in-repo and was already correctly scoped as PENDING ACTIVATION in
round 1. The docs-only fix in this round doesn't change that scoping; it
closes the one code-adjacent gap (the protocol text that makes the sender
side buildable/operable) that was actually reviewable from the tree.
