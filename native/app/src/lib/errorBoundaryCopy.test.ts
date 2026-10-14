// #2228: hvilken variant feilskjermen får per skjerm (Type A). Spillskjermene
// lover at slagene er trygge, Hjem har ingen tilbakeknapp å vise til.
import type { RootStackParamList } from '../navigation';
import { errorBoundaryVariantFor } from './errorBoundaryCopy';

describe('errorBoundaryVariantFor', () => {
  it.each([
    ['GameHome', 'game'],
    ['Hole', 'game'],
    ['Scorecard', 'game'],
    ['Leaderboard', 'game'],
    ['HoleByHole', 'game'],
    ['Home', 'noBack'],
    ['Approve', 'default'],
    ['EndGame', 'default'],
    ['Profile', 'default'],
  ] as [keyof RootStackParamList, string][])('%s → %s', (routeName, variant) => {
    expect(errorBoundaryVariantFor(routeName)).toBe(variant);
  });
});
