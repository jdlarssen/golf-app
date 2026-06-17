# Contract: #663 — extend cup bulk-generator to greensome/chapman/gruesome + fix silent "Neste"

## Decision (owner-ratified)
Extend the generator. Greensome/chapman/gruesome are 2-player team-matchplay (same shape as
foursomes), scoring already handles all 6, DB allowance columns already exist (0063/0064/0065).
No good reason to leave them ungeneratable. Size S — plumbing only, reuse foursomes pairing.

## Success Criteria
- [ ] `CupSessionFormat` (`lib/cup/cupTemplates.ts`) widened from 3 → 6 (`greensome_matchplay`, `chapman_matchplay`, `gruesome_matchplay`).
- [ ] All downstream `Record<CupSessionFormat, string>` literals + `<select>` options updated: `lib/cup/cupPairing.ts` `FORMAT_LABEL`, and the 3 `FORMAT_LABELS` maps + the "Tilpasset" `<select>` in `GenerateMatchesWizard.tsx`. (Exhaustive maps must compile — Vercel build fails otherwise.)
- [ ] `cupMatchModeConfig` (`app/[locale]/admin/games/[id]/.../generer/actions.ts`) routes each new format to its own allowance (`greensome_allowance_pct` 100 / `chapman_allowance_pct` 100 / `gruesome_allowance_pct` 50), and the SELECT query reads those columns.
- [ ] `CupSetup.tsx` gets `AllowanceField`s for the 3 (defaults 100/100/50), and `createTournamentDraft`/`updateTournamentDraft` parse + persist them.
- [ ] Generator pairing reuses the existing `playersPerSide === 2` (foursomes) path — NO new pairing/handicap algorithm.
- [ ] Step-3 silent "Neste" fix: when the plan yields 0 matches (`GenerateMatchesWizard.tsx` ~:784-792 `canAdvance`), show an inline explanatory message (e.g. «Valgt format krever minst 2 spillere per lag») instead of a silently-greyed button. Do this regardless.
- [ ] i18n keys added in BOTH `messages/no.json` + `messages/en.json` (format labels + the step-3 message); Norwegian via the humanizer skill.
- [ ] Tests extended (`lib/cup/cupTemplates.test.ts` / `cupPairing.test.ts` `it.each` tables for the 3 new formats).
- [ ] `npm run build` + `tsc` clean; full vitest green.

## Out of scope
- Changing the 3 built-in `CUP_PRESETS` (foursomes/fourball/singles stay). The scoring layer (`computeCupMatchResult.ts`) — already complete, do not touch.
- The "hide formats at creation" alternative (rejected — more work, removes valid golf formats).

## Gates
- `npx tsc --noEmit`
- `npx vitest run lib/cup`
- `npm run build`

## Notes
- Confirm greensome/chapman/gruesome are `playersPerSide = 2` before wiring (they are, per 0063/0064/0065 + computeCupMatchResult). No schema change needed.
