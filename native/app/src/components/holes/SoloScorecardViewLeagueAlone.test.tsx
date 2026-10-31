// #2712 (Type B, orkestratoren 31.10 etter eierens regel): «Hull for hull» for
// en ligarunde spilt alene viser ingen plass i stillingen. Hullene (og ★) tegnes
// først når en ni åpnes; at ★ er borte, låser modellen (holeByHole.test.ts).
import { render, screen } from '@testing-library/react-native';
import { soloStablefordScorecard } from '../../../../../lib/leaderboard/soloScorecard';
import type { StablefordSoloResult } from '../../../../../lib/scoring/modes/types';
import { homePlayer } from '../../test/homeFixtures';
import { SoloScorecardView } from './SoloScorecardView';

const result: StablefordSoloResult = {
  kind: 'stableford',
  variant: 'solo',
  players: [{ userId: 'siri', totalPoints: 3, holesPlayed: 1, rank: 1, tiedWith: [] }],
  holes: [
    {
      holeNumber: 1,
      par: 4,
      strokeIndex: 1,
      perPlayer: [{ userId: 'siri', gross: 3, points: 3, par: 4 }],
      bestUserIds: ['siri'],
    },
  ],
};
const players = [homePlayer({ userId: 'siri', name: 'Siri Solo' })];

function renderCard(leagueFlight: boolean) {
  return render(
    <SoloScorecardView
      card={soloStablefordScorecard(result, () => 'mens', { leagueFlight })}
      metric="points"
      subtitle="Stableford"
      players={players}
      finished
    />,
  );
}

it('ligarunde alene: ingen rangtall i stillingen', async () => {
  await renderCard(true);
  expect(screen.getByTestId('hole-by-hole-standing-siri')).toBeTruthy();
  expect(screen.queryByTestId('hole-by-hole-rank')).toBeNull();
});

it('alene utenfor en liga: rangtallet som før', async () => {
  await renderCard(false);
  expect(screen.getByTestId('hole-by-hole-rank')).toHaveTextContent('1');
});
