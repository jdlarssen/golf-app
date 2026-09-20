import { describe, expect, it } from 'vitest';
import type {
  KavalkadeFacts,
  TeammateFact,
} from './buildKavalkadeFacts';
import {
  buildKavalkadeDeck,
  isKavalkadeEmpty,
  type KavalkadeCardId,
} from './kavalkadeCards';

function mate(
  userId: string,
  name: string,
  rounds: number,
  averageBrutto: number | null,
): TeammateFact {
  return { userId, name, rounds, averageBrutto, scoredRounds: rounds };
}

/** Full kavalkade: hvert kort har fakta. Overrides slår av det testen vil bort. */
function makeFacts(overrides: Partial<KavalkadeFacts> = {}): KavalkadeFacts {
  return {
    year: 2026,
    cutoff: '2026-12-23T23:00:00.000Z',
    rounds: 12,
    soloRounds: 10,
    teamRounds: 2,
    roundsNeeded: 3,
    personal: {
      rounds: 10,
      season: null,
      bestRound: {
        gameId: 'g1',
        gameName: 'Lørdagscup',
        courseName: 'Losby',
        brutto: 82,
        playedAt: '2026-06-14T08:00:00.000Z',
      },
      nemesisHole: { holeNumber: 7, played: 9, averageToPar: 1.44, worstStrokes: 8 },
      rival: {
        userId: 'u2',
        name: 'Ola',
        met: 8,
        decided: 8,
        wins: 3,
        losses: 4,
        ties: 1,
      },
      formPeak: {
        stretch: {
          rounds: 3,
          averageBrutto: 84,
          fromDate: '2026-06-01T08:00:00.000Z',
          toDate: '2026-07-01T08:00:00.000Z',
        },
        season: null,
      },
    },
    team: {
      rounds: 2,
      bestRound: {
        gameId: 'g9',
        gameName: 'Texas',
        courseName: 'Losby',
        playedAt: '2026-08-02T08:00:00.000Z',
        brutto: 68,
        teammates: [{ userId: 'u3', name: 'Kari' }],
      },
      teammates: [mate('u3', 'Kari', 2, 70)],
      bestTeammates: [mate('u3', 'Kari', 2, 70)],
    },
    gang: {
      members: 6,
      games: 12,
      topWinner: { userId: 'u2', name: 'Ola', count: 5 },
      mostBirdies: { userId: 'u1', name: 'Jørgen', count: 11 },
      mostSnowmen: { userId: 'u4', name: 'Per', count: 4 },
      tightestFinish: {
        gameId: 'g4',
        gameName: 'Tirsdagsrunden',
        courseName: 'Losby',
        playedAt: '2026-05-05T08:00:00.000Z',
        strokeMargin: 1,
        leader: { userId: 'u1', name: 'Jørgen', brutto: 84 },
        runnerUp: { userId: 'u2', name: 'Ola', brutto: 85 },
      },
    },
    ...overrides,
  };
}

const ids = (cards: { id: KavalkadeCardId }[]) => cards.map((card) => card.id);

describe('isKavalkadeEmpty', () => {
  it('is true only when the year holds no finished round', () => {
    expect(isKavalkadeEmpty(makeFacts({ rounds: 0 }))).toBe(true);
    expect(isKavalkadeEmpty(makeFacts({ rounds: 1 }))).toBe(false);
  });
});

describe('buildKavalkadeDeck — order and completeness', () => {
  it('puts the opening first, then the personal cards, then «Som lag»', () => {
    const deck = buildKavalkadeDeck(makeFacts());

    expect(ids(deck.personal)).toEqual([
      'year',
      'best-round',
      'nemesis-hole',
      'rival',
      'form-peak',
      'team',
    ]);
    expect(ids(deck.gang)).toEqual([
      'gang-summary',
      'gang-winner',
      'gang-birdies',
      'gang-snowmen',
      'gang-tightest',
    ]);
    expect(deck.defaultTab).toBe('personal');
  });

  it('copies the opening numbers straight from the facts', () => {
    const deck = buildKavalkadeDeck(makeFacts(), 'Et år å huske.');

    expect(deck.personal[0]).toEqual({
      id: 'year',
      year: 2026,
      rounds: 12,
      soloRounds: 10,
      teamRounds: 2,
      narrative: 'Et år å huske.',
    });
  });

  it('leaves the opening without text when no narrative was stored', () => {
    const deck = buildKavalkadeDeck(makeFacts());

    expect(deck.personal[0]).toMatchObject({ id: 'year', narrative: null });
  });

  it('skips every card whose fact is missing instead of showing an empty one', () => {
    const facts = makeFacts();
    const deck = buildKavalkadeDeck(
      makeFacts({
        personal: {
          ...facts.personal!,
          bestRound: null,
          nemesisHole: null,
          rival: null,
          formPeak: { stretch: null, season: null },
        },
        team: null,
        gang: { ...facts.gang!, topWinner: null, mostSnowmen: null },
      }),
    );

    expect(ids(deck.personal)).toEqual(['year']);
    expect(ids(deck.gang)).toEqual([
      'gang-summary',
      'gang-birdies',
      'gang-tightest',
    ]);
  });

  it('keeps the form card when only the season shape survived', () => {
    const facts = makeFacts();
    const deck = buildKavalkadeDeck(
      makeFacts({
        personal: {
          ...facts.personal!,
          formPeak: {
            stretch: null,
            season: {
              brutto: { start: 92, now: 84, best: 82 },
              netto: { start: null, now: null, best: null },
            },
          },
        },
      }),
    );

    expect(ids(deck.personal)).toContain('form-peak');
  });

  it('gives an empty year no cards at all', () => {
    const deck = buildKavalkadeDeck(
      makeFacts({ rounds: 0, soloRounds: 0, teamRounds: 0, personal: null, team: null, gang: null }),
    );

    expect(deck.personal).toEqual([]);
    expect(deck.gang).toEqual([]);
    expect(deck.defaultTab).toBe('personal');
  });
});

describe('buildKavalkadeDeck — under the threshold', () => {
  const belowFacts = () =>
    makeFacts({ rounds: 2, soloRounds: 2, teamRounds: 0, personal: null, team: null });

  it('replaces the personal cards with one short message', () => {
    const deck = buildKavalkadeDeck(belowFacts());

    expect(ids(deck.personal)).toEqual(['year', 'below-threshold']);
    expect(deck.personal[1]).toEqual({
      id: 'below-threshold',
      soloRounds: 2,
      roundsNeeded: 3,
      teamRounds: 0,
    });
  });

  it('opens on «Gjengen», because «Ditt år» only holds the message', () => {
    expect(buildKavalkadeDeck(belowFacts()).defaultTab).toBe('gang');
  });

  it('opens on «Ditt år» when «Som lag» gives it something to read', () => {
    const facts = makeFacts();
    const deck = buildKavalkadeDeck(
      makeFacts({ rounds: 4, soloRounds: 2, teamRounds: 2, personal: null }),
    );

    expect(ids(deck.personal)).toEqual(['year', 'below-threshold', 'team']);
    expect(deck.defaultTab).toBe('personal');
    expect(deck.personal[2]).toMatchObject({ id: 'team', rounds: facts.team!.rounds });
  });

  it('stays on «Ditt år» when the gang card set is empty too', () => {
    const deck = buildKavalkadeDeck(
      makeFacts({ rounds: 2, soloRounds: 2, teamRounds: 0, personal: null, team: null, gang: null }),
    );

    expect(deck.defaultTab).toBe('personal');
  });
});

describe('buildKavalkadeDeck — the teammate the «Som lag» card names', () => {
  const teamFacts = (
    teammates: TeammateFact[],
    bestTeammates: TeammateFact[],
  ): KavalkadeFacts => {
    const facts = makeFacts();
    return makeFacts({
      team: { ...facts.team!, teammates, bestTeammates },
    });
  };

  it('names the best teammates when the threshold was reached', () => {
    const best = [mate('u3', 'Kari', 2, 70), mate('u5', 'Siri', 2, 70)];
    const deck = buildKavalkadeDeck(
      teamFacts([...best, mate('u6', 'Nils', 4, 78)], best),
    );

    expect(deck.personal.at(-1)).toMatchObject({
      id: 'team',
      highlight: { kind: 'best', teammates: best },
    });
  });

  it('falls back to the one you played the most team rounds with', () => {
    const deck = buildKavalkadeDeck(
      teamFacts([mate('u3', 'Kari', 1, 70), mate('u6', 'Nils', 3, 81)], []),
    );

    expect(deck.personal.at(-1)).toMatchObject({
      id: 'team',
      highlight: { kind: 'mostRounds', teammates: [mate('u6', 'Nils', 3, 81)] },
    });
  });

  it('names everyone tied on the most team rounds', () => {
    const deck = buildKavalkadeDeck(
      teamFacts(
        [mate('u3', 'Kari', 2, 70), mate('u6', 'Nils', 2, 81), mate('u7', 'Ada', 1, 66)],
        [],
      ),
    );

    expect(deck.personal.at(-1)).toMatchObject({
      highlight: {
        kind: 'mostRounds',
        teammates: [mate('u3', 'Kari', 2, 70), mate('u6', 'Nils', 2, 81)],
      },
    });
  });

  it('names nobody when the team rounds had no other player on the card', () => {
    const deck = buildKavalkadeDeck(teamFacts([], []));

    expect(deck.personal.at(-1)).toMatchObject({ highlight: { kind: 'none' } });
  });

  it('keeps the team card without a best round', () => {
    const facts = makeFacts();
    const deck = buildKavalkadeDeck(
      makeFacts({ team: { ...facts.team!, bestRound: null } }),
    );

    expect(deck.personal.at(-1)).toMatchObject({ id: 'team', bestRound: null });
  });
});
