# Runde-historikk — 1578-sibling-scored-holes

Natt-runder (på `claude/natt-1578-sibling-scored-holes`, aldri PR-et): runde 1 ACCEPT + e2e/cross-model-gates bokført der (commits 53e82df0, 0d120bc9 — bevisst ikke cherry-picket hit).

Runde 1 denne økta (2026-08-22, etter gjenoppliving): ACCEPT — ingen findings. De to kode-commitene (fcbc1c99→37acc4a0, dc39fc6b→e506a668) cherry-picket rent til fersk branch fra main (drift siden natt-basen rørte kun docs/CI — null overlapp). Evaluator verifiserte alle fire ikke-staging-kriterier selvstendig: søsken-celler bruker holeCellState med ekte score-sett + null-fallback (HoleStrip.tsx:32-36, :179-201), rad-eier-filteret har ett hjem (scoredHoleNumbers, Type A-testet), fetch-feil gir posisjonell fallback uten kast, HoleClient.test.tsx-mocken dekker 4. liveQuery. Scoped gates grønne. Staging-klikkrunde splittet cup-dag: DEFERRED til hovedøktas staging-fase.
