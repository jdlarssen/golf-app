# Kontrakt: #263 deletion-slice — surgical Type-C trim (eier go-ahead)

**Issue:** [#263](https://github.com/jdlarssen/golf-app/issues/263)
**Branch:** `issue-263-test-discipline-deletions`
**Type:** `test(...)` — ingen bruker-synlig oppførsel → ingen version-bump.
**Eier-beslutning (2026-06-22):** «Få det gjort om det er kun det som gjenstår på den.» (eksplisitt go-ahead for sletting.)

## Funn (opus read-only-analyse, verifisert mot lib/scoring-tester)

- **kat 2 (leaderboard):** hypotesen holder DELVIS. Reell men beskjeden Type-A-via-DOM-bloat i solo/team score-list-views + de 3 store podiene. Matchplay-familien + exotic-format-views er **by-design render-tester (IKKE slettbare)**. **Null sole-coverage-risiko** — hvert scoring-tall er dekket i `lib/scoring/modes/*.test.ts`.
- **kat 3 (admin-form): FORELDET.** Validering allerede ekstrahert (`gamePayload.ts` 251 Type-A-tester, `coursePayload.ts`, `CourseForm.tsx` eksporterer `sumHolePars`/`hasHoleChanges` Type-A-testet in-file). De 139 trio-testene er legitim interaksjon/wiring — **0 slettinger**.

## Scope: 7 filer, slett kun re-assert-av-Type-A-tall-via-DOM

1. `SoloStrokeplayView.test.tsx` — slett `sorterer på netto-slag`, `tied spillere viser samme rank`, `brutto-total ved siden av`.
2. `SoloStablefordView.test.tsx` — slett `sorterer på poeng`.
3. `TeamStablefordView.test.tsx` — slett rad-rekkefølge-på-compute-tall-testen.
4. `PatsomeView.test.tsx` — slett totalpoeng-rad-verdi-re-assert (fold inn i Lag-label-struktur-testen).
5. `SoloStrokeplayPodium.test.tsx` — slett `rangering er allerede lavest-først` + overlappende vinner-netto-total-test.
6. `TeamStablefordPodium.test.tsx` — slett per-plass-verdi-trioen (42/36/28-tallene).
7. `SoloStablefordPodium.test.tsx` — slett vinner-poeng-verdi-re-assert (38).

**Behold alltid:** én strukturell render-test per komponent, alle interaksjons-tester (reveal-toggle, confetti-key, details-collapse), edge/fallback-tester (empty/unknown/nickname), tabular-nums/Medallion-struktur. **Rør ikke:** matchplay-familien, exotic-views (1–4 tester), `SideTournamentView` (snapshot-lås #812), `WolfPodium`/`RoundRobinPodium` (eneste render-test = Type-C-budsjett).

## Suksesskriterier

- [ ] **K1.** De 7 filene har kun fått fjernet re-assert-av-scoring-tall-tester; render/interaksjon/edge beholdt. *Evidens: diff per fil.*
- [ ] **K2.** Ingen gjenværende fil mister sin eneste render-test. *Evidens: hver komponent har ≥1 render-test igjen.*
- [ ] **K3.** kat 3 dokumentert som allerede-adressert (0 slettinger). *Evidens: closing-kommentar.*
- [ ] **K4.** Gates grønne: `npx vitest run <hver berørt fil>` + `npx tsc --noEmit` + `npm run lint` (ingen ubrukte imports/fixtures etter sletting).
- [ ] **K5.** Atomisk commit per fil, alle med `Refs #263`.

## Gates
- Per berørt fil: `npx vitest run <fil>` grønt (gjenværende tester passerer).
- Til slutt: `npx tsc --noEmit`, `npm run lint` grønt (slettinger kan etterlate ubrukte fixtures/imports → rydd).
