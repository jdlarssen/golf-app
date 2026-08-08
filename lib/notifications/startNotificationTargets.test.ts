import { describe, it, expect } from 'vitest';
import {
  pickStartNotificationTargets,
  type StartedGameForNotify,
} from './startNotificationTargets';

const CUP = 'cup-1';

function game(
  over: Partial<StartedGameForNotify> & Pick<StartedGameForNotify, 'id'>,
): StartedGameForNotify {
  return {
    name: `Spill ${over.id}`,
    tournamentId: null,
    holeSegment: 'full',
    sourceGameId: null,
    playerIds: [],
    ...over,
  };
}

/**
 * Én splittet-cup-dag-flight (#1441): fire spill, samme tee-off, samme fire
 * spillere. `g-greensome` er front9-verten, `g-bestball` back9-verten, og de to
 * singles-matchene er avledet fra best ball.
 */
function bundleFlight(): StartedGameForNotify[] {
  return [
    game({
      id: 'g-greensome',
      name: 'Sommercup – Greensome 1',
      tournamentId: CUP,
      holeSegment: 'front9',
      playerIds: ['a', 'b', 'c', 'd'],
    }),
    game({
      id: 'g-bestball',
      name: 'Sommercup – Best ball 1',
      tournamentId: CUP,
      holeSegment: 'back9',
      playerIds: ['a', 'b', 'c', 'd'],
    }),
    game({
      id: 'g-singles-1',
      name: 'Sommercup – Singles 1',
      tournamentId: CUP,
      holeSegment: 'back9',
      sourceGameId: 'g-bestball',
      playerIds: ['a', 'c'],
    }),
    game({
      id: 'g-singles-2',
      name: 'Sommercup – Singles 2',
      tournamentId: CUP,
      holeSegment: 'back9',
      sourceGameId: 'g-bestball',
      playerIds: ['b', 'd'],
    }),
  ];
}

describe('pickStartNotificationTargets', () => {
  it('ingen startede spill → ingen varsler', () => {
    expect(pickStartNotificationTargets([])).toEqual([]);
  });

  it('ett frittstående spill → hele troppen varsles (uendret oppførsel)', () => {
    const targets = pickStartNotificationTargets([
      game({ id: 'g1', name: 'Fredagsrunden', playerIds: ['a', 'b'] }),
    ]);
    expect(targets).toEqual([
      { game: { id: 'g1', name: 'Fredagsrunden' }, playerIds: ['a', 'b'] },
    ]);
  });

  it('splittet cup-dag: ett varsel per spiller, og det peker på greensome', () => {
    const targets = pickStartNotificationTargets(bundleFlight());

    expect(targets).toEqual([
      {
        game: { id: 'g-greensome', name: 'Sommercup – Greensome 1' },
        playerIds: ['a', 'b', 'c', 'd'],
      },
    ]);
  });

  it.each([
    ['host først', (ms: StartedGameForNotify[]) => ms],
    ['avledet først', (ms: StartedGameForNotify[]) => ms.slice().reverse()],
    [
      'best ball før greensome',
      (ms: StartedGameForNotify[]) => [ms[1], ms[3], ms[0], ms[2]],
    ],
  ])(
    'er uavhengig av rekkefølgen due-spørringen gir (%s)',
    (_label, reorder) => {
      expect(pickStartNotificationTargets(reorder(bundleFlight()))).toEqual(
        pickStartNotificationTargets(bundleFlight()),
      );
    },
  );

  it('kun avledede spill startet → ingen varsler', () => {
    const derivedOnly = bundleFlight().filter((g) => g.sourceGameId != null);
    expect(pickStartNotificationTargets(derivedOnly)).toEqual([]);
  });

  it('to verter med samme segment: id stigende avgjør, ikke input-rekkefølgen', () => {
    const games = [
      game({
        id: 'g-b',
        tournamentId: CUP,
        holeSegment: 'back9',
        playerIds: ['a'],
      }),
      game({
        id: 'g-a',
        tournamentId: CUP,
        holeSegment: 'back9',
        playerIds: ['a'],
      }),
    ];
    const targets = pickStartNotificationTargets(games);
    expect(targets).toEqual([
      { game: { id: 'g-a', name: 'Spill g-a' }, playerIds: ['a'] },
    ]);
  });

  it('spill uten cup dedupes aldri — to samtidige runder gir to varsler', () => {
    const targets = pickStartNotificationTargets([
      game({ id: 'g1', playerIds: ['a'] }),
      game({ id: 'g2', playerIds: ['a'] }),
    ]);
    expect(targets.map((t) => t.game.id)).toEqual(['g1', 'g2']);
  });

  it('to ulike cuper samme minutt: spilleren varsles én gang per cup', () => {
    const targets = pickStartNotificationTargets([
      game({
        id: 'g1',
        tournamentId: 'cup-1',
        holeSegment: 'front9',
        playerIds: ['a'],
      }),
      game({
        id: 'g2',
        tournamentId: 'cup-1',
        holeSegment: 'back9',
        playerIds: ['a'],
      }),
      game({
        id: 'g3',
        tournamentId: 'cup-2',
        holeSegment: 'front9',
        playerIds: ['a'],
      }),
    ]);
    expect(targets.map((t) => t.game.id)).toEqual(['g1', 'g3']);
  });

  it('et spill som mister alle spillerne til et tidligere spill utelates helt', () => {
    const targets = pickStartNotificationTargets([
      game({
        id: 'g-front',
        tournamentId: CUP,
        holeSegment: 'front9',
        playerIds: ['a', 'b'],
      }),
      game({
        id: 'g-back',
        tournamentId: CUP,
        holeSegment: 'back9',
        playerIds: ['a', 'b'],
      }),
    ]);
    expect(targets).toHaveLength(1);
    expect(targets[0].game.id).toBe('g-front');
  });

  it('delvis overlapp: bare de uvarslede spillerne følger med videre', () => {
    const targets = pickStartNotificationTargets([
      game({
        id: 'g-front',
        tournamentId: CUP,
        holeSegment: 'front9',
        playerIds: ['a', 'b'],
      }),
      game({
        id: 'g-back',
        tournamentId: CUP,
        holeSegment: 'back9',
        playerIds: ['b', 'c'],
      }),
    ]);
    expect(targets).toEqual([
      { game: { id: 'g-front', name: 'Spill g-front' }, playerIds: ['a', 'b'] },
      { game: { id: 'g-back', name: 'Spill g-back' }, playerIds: ['c'] },
    ]);
  });

  it('muterer ikke input-lista', () => {
    const games = bundleFlight();
    const snapshot = JSON.parse(JSON.stringify(games));
    pickStartNotificationTargets(games);
    expect(games).toEqual(snapshot);
  });
});
