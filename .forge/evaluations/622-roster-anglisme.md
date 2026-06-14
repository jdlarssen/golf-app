# Forge-evaluering: #622 — «roster» anglisme → «spillerliste»

**Dato:** 2026-06-14
**Evaluator:** Skeptical evaluator (fresh context)
**Commit:** `019c0bff fix(i18n): replace «roster» anglicism with «spillerliste» in Norwegian UI`

## Verdict: ACCEPT

All 7 success criteria pass. No over-reach. No regressions. No missed user-facing instances.

---

## Criterion table

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| K1 | All 7 values changed exactly per contract table | PASS | Diff matches all 7 before/after pairs word-for-word, including preposition «i» (not «på»), and ✓ prefixes preserved on rows 1/3. Lines: 2614, 2706, 2836, 2844, 3769, 3771, 3867. |
| K2 | No «roster» left in no.json VALUES | PASS | `grep -nE ':[[:space:]]*"[^"]*[Rr]oster' messages/no.json` returns nothing. |
| K3 | en.json untouched | PASS | `git diff origin/main...HEAD --stat -- messages/en.json` returns empty. |
| K4 | Catalog parity test passes | PASS | `npx vitest run messages/catalogParity.test.ts` → 3 passed, 1 test file. All keys unchanged, en↔no parity holds. |
| K5 | Term consistency: only hankjønn «spillerliste/spillerlisten», no «spillerlista» | PASS | `grep '"spillerlista"' messages/no.json` → nothing. All 7 new strings use hankjønnsformen, consistent with pre-existing `db_roster` strings at lines 970 and 2557. |
| K6 | Norwegian copy quality — no AI-tells, no særskriving, idiomatic | PASS | All 7 strings read naturally. «lagt til i spillerlisten» is idiomatically correct (one joins *a list*, not *on* it). «Spillerliste» (capitalized as heading) is correct. The ✓ prefix is an established app convention. Row 4 («til i spillerlisten») looks double-preposition at a glance but is correct: «legge spilleren til» is the phrase, then «i spillerlisten» as prepositional object — fully idiomatic. No vague attributions, no em-dash overuse, no AI-vocabulary. |
| K7 | Version bumped 1.129.6 → 1.129.7, CHANGELOG entry present | PASS | `package.json` version = `1.129.7`. CHANGELOG has `### [1.129.7] - 2026-06-14 · #622` with tagline and Technical details block. |

---

## Over-reach / regression checks

- **JSON keys renamed?** No. All key names (`rosterHeading`, `emptyRoster`, `rosterEntry`, `allOnRoster`, `db_players`, `invite_added`, `approved`) are unchanged. `grep -n '"rosterSearch'` confirms `rosterSearch`, `rosterSearchPlaceholder`, `rosterSearchAriaLabel` keys also untouched.
- **Unrelated strings changed?** No. Diff shows exactly 7 string value changes plus CHANGELOG/version bump. No other no.json content touched.
- **TypeScript compilation:** `npx tsc --noEmit` exits cleanly (no output = no errors).
- **JSON validity:** `node -e "JSON.parse(...)"` → `no.json valid`.
- **Files changed:** `.forge/contracts/622-roster-anglisme.md`, `CHANGELOG.md`, `messages/no.json`, `package-lock.json`, `package.json` — exactly the expected set for a contract + copy-fix + version bump.

---

## Completeness check

Scanned all `.tsx` and `.ts` files in `app/`, `components/`, `lib/` for «rosteren» and «Lag-roster». Findings:

- `CupManagement.tsx:190` — `{/* Lag-roster */}` — JSX comment, not user-facing. Not a miss.
- `GameWizard.tsx:844` — `/* ...hele rosteren, ... */` — JSX comment. Not a miss.
- All other hits: `actions.ts`, `actions.test.ts`, `GameWizard.test.tsx`, `page.tsx`, `InviteToGameSection.tsx`, `inviteToGameActions.ts`, `PlayersSection.tsx`, `selectablePlayers.ts`, `getClubMemberPlayerOptions.ts`, `login/actions.test.ts` — all occurrences are in code comments, JSDoc, or test descriptions. None are string literals rendered to users.

No missed user-facing Norwegian «roster» prose found.

---

## Summary

**ACCEPT.** The builder changed exactly the 7 contracted strings, used the correct Norwegian term and gender throughout, left all JSON keys and `en.json` untouched, the parity test passes, types compile clean, and the version bump + CHANGELOG entry are in order. No over-reach, no regressions, no missed instances.
