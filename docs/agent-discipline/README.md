# Agent-discipline package

A portable documentation set that makes non-frontier coding agents (Claude Sonnet/Opus,
and other models reading AGENTS.md-convention files) operate closer to frontier level:
fewer logic errors, fewer introduced bugs, fewer wasted tokens. It works by converting
the implicit judgment a stronger model applies automatically into explicit, checkable,
event-triggered procedures a weaker model can execute mechanically.

## Why this shape

Weaker models rarely fail for lack of knowledge — they fail by not invoking the right
check at the right moment, and by rationalizing past prose rules under context pressure
(that observation is what produced the hook infrastructure in #916). Hooks catch what is
mechanically checkable; this package covers the judgment gaps hooks cannot reach. Seven
design principles:

1. **Event-triggered, not memory-resident.** Rules are keyed to observable events
   ("about to commit", "output differs from the EXPECT line"), because "always remember
   X" degrades as the context window fills. The always-loaded core is only a dispatch
   table plus invariants; procedures load on demand — and are read at most once per
   session.
2. **Checkable exit conditions.** Steps state how to know they are complete ("zero
   unclassified hits", "eight lines exist"), so completion is a fact, not a feeling.
3. **Explicit SKIP conditions.** A rule without a legitimate skip path gets either
   misapplied to everything or silently ignored; each procedure states exactly when it
   does not apply.
4. **Route, don't restate.** One home per rule (AGENTS.md trap #4 applied to the docs
   themselves): generic procedures carry the principle; `bindings.md` carries this
   repo's mechanism and points into `docs/bug-prevention.md`,
   `docs/test-discipline.md`, `docs/forge-workflow.md` etc. instead of paraphrasing
   them, so copies cannot drift.
5. **Enforcement-aware.** Invariants are marked hook-enforced vs. discipline-only, so
   agents spend attention on the unenforced gaps instead of re-verifying what a hook
   already blocks.
6. **Anti-rationalization tables.** The exact thought that precedes each violation is
   named ("it's a one-line change"), because pattern-matching a thought is easier for a
   model than applying an abstract principle.
7. **Evidence-anchored.** Rules cite the real incident that created them (issue
   numbers), which both motivates compliance and lets a doc-reconciler verify claims.

## What it closes — and what it doesn't

The package closes the JUDGMENT gap: the checkable habits a frontier model applies
implicitly (verify before writing, propagate before declaring, evidence before claims,
stop-loss before thrashing). Those habits account for nearly all of this repo's shipped
agent bugs — see the incident citations. It does NOT close the raw REASONING gap: on
genuinely novel design problems a stronger model still reasons deeper. That residual is
handled structurally rather than procedurally — T1 routing sends large work through
contract/plan/subagent workflows with independent review, so a weaker builder gets a
skeptical second pair of eyes exactly where checklists run out.

## Files

| File | Loaded | Contents |
|---|---|---|
| `core.md` | Always (`@`-include in CLAUDE.md) | Trigger table T1–T9, invariants I1–I8, token economy, anti-rationalization table |
| `procedures/task-intake.md` | On T1 | Classification + reclassification, acceptance criteria, ground-truth pass, edge-case table |
| `procedures/change-propagation.md` | On T2 | All-homes enumeration, sibling-pattern recipe, full-build gate, multi-layer rules |
| `procedures/db-and-authz.md` | On T3 | Schema truth (existing vs. new identifiers), row-count asserts, enforcement-layer authz, atomicity, migrations, cache tags |
| `procedures/debugging.md` | On T4 | Reproduce/capture-first, hypothesis-falsifier loop, DEBUG-T4 sentinel, environment-cause walk |
| `procedures/testing.md` | On T5 | Type selection, red-then-green, time rules, snapshot-diff review, fixture rules |
| `procedures/commit-and-pr.md` | On T6 | Hunk-by-hunk diff audit, debris sweep, gates, metadata, merge stops |
| `procedures/done-verification.md` | On T7 | Evidence per criterion, executed-flow requirement, wording rules |
| `procedures/stuck-and-stop-loss.md` | On T8 | STATE block, one-of-three continuation, denial handling, precedence ladder |
| `bindings.md` | On demand — from procedures, and directly from core's T9 row | The ONLY repo-specific file: commands, paths, enforcement inventory, domain triggers, environment-cause table |
| `README.md` | Humans | This file |

## Porting to another repo

1. Copy `docs/agent-discipline/` into the host repo.
2. Rewrite `bindings.md` for the host: every §-section (build-gate command, DB
   introspection method, commit conventions, pre-merge verification environment,
   enforcement inventory with the host's sanctioned workarounds), the
   environment-cause table, and the domain-trigger table. This is the only file that
   must change.
3. In `core.md` AND the procedures, either re-anchor the incident citations (issue
   numbers and evidence narratives — some name files that won't exist in your repo) or
   leave them: they are evidence, not instructions, and stale evidence is harmless.
4. Wire `core.md` into whatever file your agent ALWAYS loads. Claude Code: add
   `@docs/agent-discipline/core.md` near the top of the host `CLAUDE.md` — and do NOT
   `@`-import the procedures or bindings (imports recurse up to 5 hops; that would load
   the whole package every session and destroy the on-demand design). Agents that only
   read AGENTS.md-convention files: paste the pointer line there and, if the agent has
   no auto-include mechanism, inline core.md's trigger table.
5. If both file types exist, keep the AGENTS.md pointer line — it is the only discovery
   path for non-Claude agents (they don't resolve `@`-imports).

## Maintenance — the living postmortem sink

When a bug ships despite the package: add its failure class in the SAME PR as the fix —
one row in the `bindings.md` environment-cause or domain-trigger table if it is
repo-specific; one step or table row in a generic procedure only when the class is
repo-independent. A discipline set that does not absorb postmortems decays into
wallpaper.

**Host-repo note (golf-app) — delete or rewrite on port:** this package is a governing
document (styringsdokument). When the doc-reconciler («dok-avstemmeren», #1078) gets its
claims manifest, `docs/agent-discipline/**` belongs in scope — checkable claims here
(paths, commands, hook names) are deliberately written in verifiable form. Normative
must/shall rules are owner territory and are never auto-edited, per #1078's own design.
