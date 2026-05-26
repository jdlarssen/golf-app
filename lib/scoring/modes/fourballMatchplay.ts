// Four-ball matchplay-scoring (issue #217, fase 2 av #47).
//
// Fyll-ut-stub i chunk 2 — gir mode-router-en en gyldig delegering så
// typecheck er grønn. Full implementasjon + TDD-suite landerer i chunk 3.
// Returnerer empty-shell til implementasjonen er på plass; scoring-laget
// kaster aldri, det matcher singles-matchplay-mønsteret.

import type {
  ScoringContext,
  FourballMatchplayResult,
  FourballSide,
} from './types';

function placeholderSides(): [FourballSide, FourballSide] {
  return [
    {
      sideNumber: 1,
      players: [
        { userId: '', courseHandicap: 0, effectiveHandicap: 0 },
        { userId: '', courseHandicap: 0, effectiveHandicap: 0 },
      ],
    },
    {
      sideNumber: 2,
      players: [
        { userId: '', courseHandicap: 0, effectiveHandicap: 0 },
        { userId: '', courseHandicap: 0, effectiveHandicap: 0 },
      ],
    },
  ];
}

export function compute(_ctx: ScoringContext): FourballMatchplayResult {
  return {
    kind: 'fourball_matchplay',
    sides: placeholderSides(),
    holes: [],
    holesUp: 0,
    holesPlayed: 0,
    holesRemaining: 18,
    result: null,
  };
}
