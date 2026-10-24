import { describe, it, expect } from 'vitest';
import { roundPlayedBy } from './roundPlayedBy';

const participants = [
  { userId: 'J', name: 'Jørgen' },
  { userId: 'M', name: 'Martin' },
  { userId: 'K', name: 'Kristian' },
  { userId: 'E', name: 'Erlend' },
  { userId: 'S', name: 'Sindre' },
];

const names = (g: Array<{ name: string | null; isViewer: boolean }>) =>
  g.map((p) => (p.isViewer ? `*${p.name}` : p.name));

describe('roundPlayedBy («Har spilt / I gang / Mangler», #2638)', () => {
  it('splits the participants by the round locks, the viewer last in their group', () => {
    const groups = roundPlayedBy(participants, ['J', 'M'], ['E'], 'K');
    expect({
      delivered: names(groups.delivered),
      inProgress: names(groups.inProgress),
      missing: names(groups.missing),
    }).toEqual({
      delivered: ['Jørgen', 'Martin'],
      inProgress: ['Erlend'],
      missing: ['Sindre', '*Kristian'],
    });
  });

  it('a lock for someone who is no longer a participant is not shown', () => {
    const groups = roundPlayedBy(participants.slice(0, 1), ['X'], [], null);
    expect({ delivered: groups.delivered, missing: names(groups.missing) }).toEqual({
      delivered: [],
      missing: ['Jørgen'],
    });
  });

  it('nobody has played: everyone is missing', () => {
    const groups = roundPlayedBy(participants.slice(0, 2), [], [], null);
    expect(names(groups.missing)).toEqual(['Jørgen', 'Martin']);
  });

  it('a player who delivered is not also in progress', () => {
    const groups = roundPlayedBy(participants.slice(0, 1), ['J'], ['J'], 'J');
    expect({ delivered: names(groups.delivered), inProgress: groups.inProgress }).toEqual({
      delivered: ['*Jørgen'],
      inProgress: [],
    });
  });
});
