# Evaluation: 1144-liga-scoring-net-only
**Verdict:** ACCEPT

Two minor findings (F1 stale comment, F2 miscount in prose). Neither violates a Success
Criterion or a Gate; F1 is a one-line cleanup worth taking before merge.

## Criteria

**1. `/admin/liga/new` viser ikke lenger Netto/Brutto/Begge; «Sesong-modell» uendret — PASS**
`grep -n "Scoring\|scoring" app/[locale]/admin/liga/new/CreateLigaForm.tsx` → **zero matches**.
The whole radio block (old lines 373–417) is gone; the `{/* Sesong-modell */}` block survives
untouched in the diff. Staging oracle on PR #1255: `input[name=_scoring_radio]` = 0,
`input[name=scoring]` = 0, `input[name=standings_model]` = 1, format radios = 4.

**2. `createLeagueDraft` alltid `scoring: 'net'` uansett FormData — PASS**
`lib/league/actions.ts:74-77` is now `const scoring = 'net';` — a literal, never read from
`formData`. It flows into the sole insert at `lib/league/actions.ts:163`. Guard test green
(criterion 6 below). Independently re-proven live: the staging comment injected
`<input name="scoring" value="gross">` into the real form and the row landed `net`.

**3. Ny slagspill-liga opprettes uten feil, lagres `scoring = 'net'` — PASS**
Staging SQL oracle on PR #1255: `E2E-1144-nettolaas | stroke | net` and
`E2E-1144-hostile-gross | stroke | net`; redirect to `/admin/liga/<uuid>`, 0 console errors.
Both rows deleted afterwards by explicit id. Prod-guard confirmed: all Supabase calls went to
`snwmueecmfqqdurxedxv` (staging).

**4. `/admin/liga/[id]` scoring-info-raden borte, søsknene står — PASS**
`app/[locale]/admin/liga/[id]/LigaManagement.tsx` — the `manage.infoScoring` /
`manage.scoringLabel.${league.scoring}` row (old 160–165) is deleted; `infoFormat` above and
`infoStandingsModel` below are untouched in the diff. Staging: 6 rows render (Spillform ·
Sesong-modell · Manglende runde · Bane-omfang · Runder · Deltakere), «Tabell» gone.

**5. `type Scoring`, state, hidden input, validering fjernet; ingen dangling referanser — PASS**
`type Scoring` (old :30), `useState<Scoring>` (old :57), hidden input (old :108) and
`if (scoring !== 'net' && …) return { error: 'scoring' }` (old actions.ts:107) are all gone.
`errors.scoring` removed from both the error-map object and the type union
(`CreateLigaForm.tsx:103-110`). `isPointsBasedFormat` import correctly retained — still used at
`lib/league/actions.ts:83` for `penaltyKind`. `pointsBased` correctly retained — still used at
`CreateLigaForm.tsx:408,415,422,493,494,536`. Build + lint green. See F1 for the one leftover.

**6. `package.json` MINOR-bumpet + én Funksjoner-linje — PASS**
`1.205.1 → 1.206.0` (MINOR, correct for `feat`). `git diff origin/main...HEAD -- CHANGELOG.md
| grep -c "^+<details>"` → **1**. Format matches `docs/changelog-conventions.md` exactly:
`<summary><strong>1.206 · Enklere liga-oppsett</strong></summary>`, `[#1144](…) — …` body, and
the expected `↳ /admin/liga/new · «Sett opp en liga»` link+cta line. Commit carries `Refs #1144`.

**7. Staging-verify utført og bevis postet på PR-en — PASS**
PR #1255 carries the `staging-verified` label and a 5-row acceptance table with structure
oracle + error log + SQL oracle per row, including the hostile-POST case.

## Gates

| Gate | Result |
|---|---|
| `npm run build` | **PASS** — `BUILD_EXIT=0`, `✓ Compiled successfully in 7.6s` |
| `npm run lint` | **PASS** — `✖ 55 problems (0 errors, 55 warnings)`; all 55 are pre-existing complexity/max-depth warnings in untouched files (`lib/scoring/sideTournament.ts`, `lib/wizard/fitsPlayerCount.ts`, …) |
| `npx vitest run lib/league/actions.test.ts` | **PASS** — `Test Files 1 passed (1) · Tests 9 passed (9)` |
| Staging-verify | **PASS** — see criterion 7 |

Extra gate I ran beyond the contract (the contract's gates do not cover it, and a
`CreateLigaForm.test.tsx` exists that could plausibly have asserted on the removed radio):
`npx vitest run 'app/[locale]/admin/liga' lib/league` → `Test Files 11 passed (11) · Tests 98
passed (98)`. `CreateLigaForm.test.tsx` has zero `scoring` references — no breakage.

## Adversarial checks that came back clean

**Other write sites to `leagues.scoring` — none exist.** I enumerated every
`from('leagues')` in the repo (26 hits) and checked the chained method on each:
- Read-only (`.select`): `app/[locale]/klubber/[id]/page.tsx:75`, `app/[locale]/admin/liga/page.tsx:46`,
  `app/[locale]/admin/TilesGrid.tsx:68`, `app/[locale]/admin/liga/[id]/slett/LigaDeleteConfirm.tsx:54`,
  `lib/admin/auth.ts:148`, `lib/users/deleteAccount.ts:75`, `lib/league/getLigaSnapshot.ts:109`,
  `lib/league/spectate.ts:34,67`, `lib/league/actions.ts:312,407,585,637`.
- `.update()` — only three, none touching `scoring`: `lib/league/actions.ts:525` (patch is
  `TablesUpdate<'leagues'> = { status, started_at?, finished_at? }`), `actions.ts:557`
  (`{ status: 'active', started_at }`), `lib/league/spectate.ts:80,93` (`spectate_token` only).
- `.insert()` — exactly one: `lib/league/actions.ts:157`, inside `createLeagueDraft`. No `upsert`,
  no RPC writes `leagues`.
- `e2e/league/liga.spec.ts:80,177,361` set `scoring: 'net'` but via the admin client straight to
  the DB, bypassing the action — not a leak, and consistent with the new invariant.

Conclusion: the contract's claim that `createLeagueDraft` is the only insert site holds, and it
is now the only site that writes `scoring` at all. The central claim survives.

**Deleted i18n keys have zero call sites; `games`-namespace siblings intact.** All 13 removed
leaves have no `t()` caller. The surviving `scoringLabel` / `scoringNetDesc` / `scoringGrossDesc`
call sites (`app/[locale]/admin/games/new/sections/{Wolf,Shamble,Patsome,Skins,Nines,Nassau,AceyDeucey}Setup.tsx`)
resolve under `wizard.sections.*`, a different namespace — I verified all 9 of those keys are
`PRESENT` in both locales. Leaderboard `scoringLabel` locals use `common.netto`/`common.brutto`,
untouched. `liga.standings.*` **PRESENT** in both locales (still used by the read side).

**Locales symmetric.** `no.json` 3977 keys, `en.json` 3977 keys, set-difference empty both
directions → `SYMMETRIC`. Exactly 13 leaves removed per locale, 0 added.

**Guard test is not trivially-passing — VERIFIED by composition.** Each link checked against
source rather than assumed: (a) the mock records real insert arguments —
`tests/serverActionMocks.ts:130-131` `proxy.insert = (...args) => { rec('insert', args) }`
pushing `{table, method, args}`; (b) `isPointsBasedFormat('stroke') === false`
(`lib/league/flightFormat.ts:17-19`); (c) the reverted line was
`isPointsBasedFormat(format) ? 'net' : str(formData, 'scoring') || 'net'`; (d) the test sets
`fd.set('scoring','gross')` and `fd.set('format','stroke')`; (e) `scoring` is spread into the
insert at `actions.ts:163`. So on revert the payload carries `scoring: 'gross'` and
`toMatchObject({ scoring: 'net' })` throws. The test asserts the right thing and would fail if
the fix were reverted. I did not run a live mutation because the evaluation brief is
read-and-run-only; the PR body independently reports having run exactly that mutation and
observed the expected failure.

**Out-of-scope items correctly left alone.** No migration touches `leagues.scoring`'s CHECK; no
change to `getLigaSnapshot.ts` scoring computation, `LeagueStandingsPanel.tsx`, or the
`LeagueStandingsByScoring`/`StandingsMetric` types. Per the brief, not reported as gaps.

**Flow diagram change is not scope creep.** `docs/flows/06-liga-fremtid.svg` isn't in the
contract's file list, but CLAUDE.md §Brukerflyt-forankring #3 mandates updating the diagram in
the same PR when work changes a flow — and the old subtitle advertised «netto/brutto», which
this change makes factually false. Only that one `<text>` string changed; no steps redrawn. PNG
regenerated. Disclosed under «Avvik fra kontrakten» in the PR body. Correct call.

## Findings

**F1 — Stale orphaned comment (real, minor, cosmetic).**
`app/[locale]/admin/liga/new/CreateLigaForm.tsx:141`:
```
139:      {/* Hidden fixed fields */}
140:      <input type="hidden" name="format" value={format} />
141:      {/* Poeng-ligaer er netto-only — lås tabell-verdien uansett radio-state. */}
142:      <input type="hidden" name="group_id" value={groupId ?? ''} />
```
The comment documented the deleted `<input name="scoring">`; the input went, the comment stayed.
It now sits directly above the `group_id` input and misleadingly annotates it, while referring to
a "radio-state" that no longer exists anywhere in the file. No runtime impact, and it does not
break criterion 5 literally (it is a comment, not a reference; build+lint are green), but it is a
one-line deletion that should land before merge — a future reader greps `radio-state`, finds
nothing, and loses time.

**F2 — i18n key count overstated in prose (real, trivial, no code impact).**
The commit message ("the 11 orphaned i18n keys per locale") and the PR #1255 body ("11
foreldreløse i18n-nøkler per locale") both say **11**. The actual count is **13** per locale:
`liga.create.errors.scoring`, `liga.create.{standingsLabel, stablefordStandingsLocked,
scoringNetLabel, scoringNetDesc, scoringGrossLabel, scoringGrossDesc, scoringBothLabel,
scoringBothDesc}`, `liga.manage.infoScoring`, `liga.manage.scoringLabel.{net,gross,both}`.
The undercount likely came from counting `scoringLabel` as one key rather than three leaves.
Prose only — the deletions themselves are correct and complete. Not worth a reflow of history;
worth a correction if the PR body is edited for any other reason.

**Nothing else.** I genuinely tried to break the central claim — enumerated all 26 `leagues`
access sites and classified each by method, checked both `.update()` patch shapes for a
`scoring` key, looked for `upsert`/RPC writes, checked the e2e direct-DB inserts, hunted for a
second form that still posts the field, ran the liga UI test file the contract's gates omit, and
verified the guard test's failure mode link-by-link against source. The write side is closed.
