## Verdict

ACCEPT

## Criteria

**Gate — docs-only diff.** `git diff --stat origin/main..HEAD` (base `2ad78849`'s parent, i.e. `origin/main`) touches exactly three files, all `.md`: `.forge/contracts/1077-konvergensregler.md` (+45), `.forge/templates/eskalering.md` (+30), `docs/forge-workflow.md` (+10). PASS.

**Success Criterion 1 — `docs/forge-workflow.md` Konvergensregler section covers all six sub-points:**

- **Runde-historikk-fil:** satisfied. Quote: "Etter hver evaluate-runde: appender én linje til `.forge/evaluations/<kontrakt-slug>-runder.md` med runde-nummer, verdikt (ACCEPT/NEEDS WORK) og finding-signaturene." — file path, format (one line per round: number, verdict, signatures), and persistence rationale ("evalueringssignaler skal overleve kontekstvinduet") all present.
- **Finding-signatur:** satisfied. Quote: "Hvert funn normaliseres til `fil + kriterium` (f.eks. `bash-guard.sh + logg-lekkasje`), ikke fritekst. Fremgang måles mekanisk: signatur-settet i runde k sammenlignes med runde k−1." — matches contract's design spec verbatim (file+criterion, not free text) and gives a concrete example.
- **No-progress-definisjon:** satisfied. Quote: "To påfølgende runder med identisk signatur-sett = ingen fremgang." — explicitly "two identical rounds," mechanically defined via the signature-set comparison from point 2.
- **Strategibytte-mekanisme:** satisfied. Quote: "Da er blind retry forbudt — bytt strategi: dispatch en fresh-context fix-subagent som KUN får evalueringsrapporten som spec (aldri den forrige agentens kontekst eller antagelser)." — forced (blind retry forbidden), fresh-context-only, spec = evaluation report only. Matches contract's "fresh-context fix-subagent som KUN får evalueringsrapporten som spec" almost word for word.
- **Begge takene:** satisfied. Quote: "Maks 5 evaluate-runder totalt per kontrakt; maks 2 no-progress-runder etter strategibytte. Taket nås → gå til punkt 5, aldri «én runde til»." — both caps present (5 total rounds, 2 no-progress rounds post-switch) plus an explicit anti-rationalization clause ("never one more round").
- **Aldri-stille-exit-regelen:** satisfied. Quote: "Aldri kast delarbeid, aldri reset, aldri stille exit: push delarbeidet som draft-PR og post `.forge/templates/eskalering.md` (utfylt) som kommentar på issuet — inkludert ETT konkret A/B-spørsmål eieren kan besvare uten å lese kode." — never-silent-exit, draft-PR, template-posting, and the A/B-question requirement all present in one sentence.

All six sub-points of Criterion 1: PASS.

**Success Criterion 2 — `.forge/templates/eskalering.md` has all four template parts + A/B question:**

Verified by reading the file. Contains:
1. "Hva som er bygget så langt" with draft-PR link placeholder (line 7).
2. Round table ("Runde-historikk") with columns Runde/Verdikt/Gjenstående funn, sourced explicitly from `.forge/evaluations/<kontrakt-slug>-runder.md` (lines 9–14).
3. "Hva som ble prøvd" per strategy (Strategi A / Strategi B, lines 16–19).
4. ONE concrete A/B question in app/user terms with an explicit example form ("Skal X oppføre seg som A: … eller B: …?") and A/B consequence placeholders (lines 21–28).

Header comment (lines 1–3) explicitly instructs: "Alle `<…>`-plassholdere erstattes; ingen fjernes stille" — placeholders are replaced, never silently dropped, matching the contract's Out of Scope / Key Decisions intent and the task's instruction to verify this rule is present. PASS.

**Success Criterion 3 — round-history activation:** PENDING FIRST USE, as expected. No `.forge/evaluations/*-runder.md` file exists yet in the worktree (checked — only `1008-ai-rundereferat.md` matches "runder" and is unrelated). This is correctly an activation criterion, not a build-time deliverable; treated as PENDING, not FAIL, per the task's explicit instruction.

## Findings

- No blocking findings. Diff is docs-only (2 commits: `2ad78849` adds the contract file, `59362cb1` adds the actual section + template — both `Refs #1077`, both skip-type `docs(...)` prefix so the version-bump/CHANGELOG hook correctly does not fire).
- Cross-checked against the sibling protocol `docs/loops/ci-vakta.md` (#1075, same epic #1073), which has its own narrower "Eskalér ved ikke-konvergens" section (3 iterations, draft-PR, A/B hypothesis). No contradiction: the two protocols govern different loops (CI-fix iteration count vs. forge:auto evaluate rounds) and share the same never-silent-exit / draft-PR / A/B-question philosophy. Nothing in the new section overrides or duplicates ci-vakta.md's numbers.
- No contradiction found against CLAUDE.md conventions (Refs #N commit-msg requirement satisfied; docs-only changes correctly use skip-type prefixes; no unrelated files touched).
- Minor, non-blocking observation: the contract's Key Decisions note ("Autonomi-kontraktens tunge maskineri (manifest.jsonl + Stop-hook) bevisst utelatt") is not restated in the shipped section text itself — it's a design rationale that lives only in the contract, not in `docs/forge-workflow.md`. This is fine since the contract isn't required to be mirrored verbatim into the docs, and Out of Scope explicitly confirms this was deliberate.
