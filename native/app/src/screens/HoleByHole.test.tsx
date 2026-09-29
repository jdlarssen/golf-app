// #2255 PR 3a: den ene render-testen (Type C) for «Hull for hull» i appen.
//
// Hva radene, deltotalene og hullvinneren ER, låses i `soloScorecard.test.ts`
// (webbens og appens felles modell). Her låses koblingen: overskriften, at
// stillingen og begge niene kommer på skjermen, at stjerna er dekor, og at en
// blind runde som pågår holder alt tilbake.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { render, screen } from '@testing-library/react-native';
import { holeScores, homeBundle, homePlayer } from '../test/homeFixtures';
import { HoleByHoleBody } from './HoleByHole';

jest.mock('../supabase', () => require('../test/supabaseMock'));

const HIDDEN = { includeHiddenElements: true };

const players = [
  homePlayer({ userId: 'ola', name: 'Ola Kompis', courseHandicap: 0 }),
  homePlayer({ userId: 'kari', name: 'Kari Nordmann', courseHandicap: 0 }),
];
const stableford = { gameMode: 'stableford', modeConfig: { kind: 'stableford', team_size: 1, points_table: 'standard' } };
// Ola 4 slag (par, 2 p) på hull 1–3, Kari 5 slag (1 p) på hull 1–2.
const scores = [...holeScores('g1', 'ola', 3, 4), ...holeScores('g1', 'kari', 2, 5)];

it('avsluttet solo stableford: overskrift, stilling, Ut og Inn, og hullvinneren med stjerne', async () => {
  const bundle = homeBundle({ game: { id: 'g1', status: 'finished', ...stableford }, players });
  await render(<HoleByHoleBody bundle={bundle} scores={scores} />);

  expect(screen.getByRole('header', { name: 'Hull for hull' })).toBeTruthy();
  expect(screen.getByTestId('hole-by-hole-standing-ola')).toBeTruthy();
  expect(screen.getByTestId('hole-by-hole-standing-kari')).toBeTruthy();
  expect(screen.getByTestId('hole-by-hole-front9')).toBeTruthy();
  expect(screen.getByTestId('hole-by-hole-back9')).toBeTruthy();
  expect(screen.getByTestId('hole-by-hole-front9-subtotal-ola')).toBeTruthy();
  // Hull 1: Ola alene best. Stjerna er dekor for skjermleseren.
  expect(screen.queryByTestId('hole-by-hole-best-1')).toBeNull();
  expect(screen.getByTestId('hole-by-hole-best-1', HIDDEN)).toBeTruthy();
  expect(screen.getAllByTestId(/^hole-by-hole-card-/)).toHaveLength(18);
});

it('blind runde som pågår: alt holdes tilbake', async () => {
  const bundle = homeBundle({
    game: { id: 'g1', status: 'active', scoreVisibility: 'reveal', ...stableford },
    players,
  });
  await render(<HoleByHoleBody bundle={bundle} scores={scores} />);
  expect(screen.getByTestId('hole-by-hole-reveal-hidden')).toBeTruthy();
  expect(screen.queryByTestId('hole-by-hole')).toBeNull();
});

it('et format appen ikke har «Hull for hull» for: en rolig linje', async () => {
  const bundle = homeBundle({
    game: { id: 'g1', status: 'finished', gameMode: 'wolf', modeConfig: { kind: 'wolf' } },
    players,
  });
  await render(<HoleByHoleBody bundle={bundle} scores={[]} />);
  expect(screen.getByTestId('hole-by-hole-unavailable')).toBeTruthy();
});
