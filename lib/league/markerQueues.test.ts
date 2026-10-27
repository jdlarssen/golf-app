import { describe, expect, it } from 'vitest';
import { markerQueues, type AwaitingMarkerCard } from './markerQueues';

const card = (over: Partial<AwaitingMarkerCard>): AwaitingMarkerCard => ({
  gameId: 'g1',
  userId: 'anders',
  markerUserId: 'mia',
  submittedBy: 'anders',
  ...over,
});
const rounds = [
  {
    label: 'Runde 1',
    awaitingMarker: [
      card({}),
      card({ gameId: 'g2', userId: 'org', markerUserId: 'kari', submittedBy: 'org' }),
      card({ gameId: 'g3', userId: 'per', markerUserId: 'kari', submittedBy: 'org' }),
      card({ gameId: 'g4', userId: 'ola', markerUserId: 'org', submittedBy: 'ola' }),
    ],
  },
  { label: 'Runde 2', awaitingMarker: [card({ gameId: 'g5', markerUserId: 'mia' })] },
];
const ids = (cards: { gameId: string }[]) => cards.map((c) => c.gameId);

describe('markerQueues', () => {
  it('the marker sees the cards that name them, with the round', () => {
    const { forMarker, forOrganizer } = markerQueues(rounds, 'mia', false);
    expect({ forMarker: forMarker.map((c) => [c.gameId, c.roundLabel]), forOrganizer }).toEqual({
      forMarker: [
        ['g1', 'Runde 1'],
        ['g5', 'Runde 2'],
      ],
      forOrganizer: [],
    });
  });

  it('the organiser sees the other waiting cards, never one they own, delivered or mark', () => {
    const { forMarker, forOrganizer } = markerQueues(rounds, 'org', true);
    expect({ forMarker: ids(forMarker), forOrganizer: ids(forOrganizer) }).toEqual({
      forMarker: ['g4'],
      forOrganizer: ['g1', 'g5'],
    });
  });

  it('a signed-out viewer sees nothing', () => {
    expect(markerQueues(rounds, null, true)).toEqual({ forMarker: [], forOrganizer: [] });
  });
});
