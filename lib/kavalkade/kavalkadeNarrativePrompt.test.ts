import { describe, it, expect } from 'vitest';
import type { KavalkadeFacts, KavalkadeGame } from './buildKavalkadeFacts';
import {
  MAX_KAVALKADE_NARRATIVE_LENGTH,
  buildKavalkadeNarrativePrompt,
  collectUserIds,
  factsForModel,
  gamesInFacts,
  gamesNamingUnconsenting,
  sanitizeKavalkadeNarrative,
} from './kavalkadeNarrativePrompt';

/** Everyone in the fixture said yes to AI texts (#2561). */
const ALL = new Set(['u1', 'u2', 'u3', 'u4', 'u5', 'u6']);

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
      formPeak: { stretch: null, season: null },
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
      teammates: [
        { userId: 'u3', name: 'Kari', rounds: 2, averageBrutto: 70, scoredRounds: 2 },
      ],
      bestTeammates: [
        { userId: 'u3', name: 'Kari', rounds: 2, averageBrutto: 70, scoredRounds: 2 },
      ],
    },
    gang: {
      members: 6,
      games: 12,
      topWinner: { userId: 'u2', name: 'Ola', count: 5 },
      mostBirdies: { userId: 'u1', name: 'Per', count: 11 },
      mostSnowmen: { userId: 'u4', name: 'Nils', count: 7 },
      tightestFinish: null,
    },
    ...overrides,
  };
}

describe('factsForModel', () => {
  it('fjerner alle interne id-er, uansett hvor dypt de ligger', () => {
    const json = JSON.stringify(factsForModel(makeFacts(), ALL));

    expect(json).not.toContain('userId');
    expect(json).not.toContain('gameId');
    expect(json).not.toContain('"u2"');
    expect(json).not.toContain('"u3"');
    // Spill-id-er er like interne som spiller-id-er: modellen trenger navnet
    // på runden, ikke primærnøkkelen.
    expect(json).not.toContain('"g1"');
    expect(json).not.toContain('"g9"');
  });

  it('beholder navnene og tallene', () => {
    const json = JSON.stringify(factsForModel(makeFacts(), ALL));

    expect(json).toContain('Ola');
    expect(json).toContain('Kari');
    expect(json).toContain('82');
    expect(json).toContain('Losby');
  });

  it('rører ikke fakta-objektet den fikk', () => {
    const facts = makeFacts();
    factsForModel(facts, ALL);

    expect(facts.personal?.rival?.userId).toBe('u2');
    expect(facts.personal?.bestRound?.gameId).toBe('g1');
  });

  it('beholder null og tomme lister', () => {
    const stripped = factsForModel(
      makeFacts({ personal: null, team: null }),
      ALL,
    ) as Record<string, unknown>;

    expect(stripped.personal).toBeNull();
    expect(stripped.team).toBeNull();
  });
});

// #2561 PR B: a player who did not say yes to AI texts is never named.
describe('factsForModel — players without «ja»', () => {
  const tightestFinish = {
    gameId: 'g5',
    gameName: 'Onsdagsrunden',
    courseName: 'Losby',
    playedAt: '2026-09-02T16:00:00.000Z',
    strokeMargin: 1,
    leader: { userId: 'u5', name: 'Eva', brutto: 84 },
    runnerUp: { userId: 'u6', name: 'Siv', brutto: 85 },
  };
  const withFinish = () =>
    makeFacts({
      gang: { ...(makeFacts().gang as NonNullable<KavalkadeFacts['gang']>), tightestFinish },
    });

  it.each([
    ['rivalen og gjengens vinner', 'u2', 'Ola'],
    ['lagkameraten', 'u3', 'Kari'],
    ['flest birdies', 'u1', 'Per'],
    ['flest snømenn', 'u4', 'Nils'],
    ['jevneste avslutning, lederen', 'u5', 'Eva'],
    ['jevneste avslutning, nummer to', 'u6', 'Siv'],
  ])('%s', (_label, userId, name) => {
    const allowed = new Set([...ALL].filter((id) => id !== userId));
    expect(JSON.stringify(factsForModel(withFinish(), allowed))).not.toContain(name);
  });

  it('keeps the numbers next to a name it hides, and the names of those who said yes', () => {
    const stripped = factsForModel(withFinish(), new Set(['u1', 'u3', 'u4', 'u5', 'u6'])) as {
      personal: { rival: { name: string | null; wins: number } };
      team: { teammates: { name: string | null }[] };
    };
    expect(stripped.personal.rival).toEqual({ name: null, met: 8, decided: 8, wins: 3, losses: 4, ties: 1 });
    expect(stripped.team.teammates[0].name).toBe('Kari');
  });
});

describe('buildKavalkadeNarrativePrompt', () => {
  it('legger ved fakta uten id-er, og aldri rå scorer', () => {
    const { user } = buildKavalkadeNarrativePrompt(makeFacts(), ALL);

    expect(user).toContain('2026');
    expect(user).toContain('Lørdagscup');
    expect(user).not.toContain('userId');
    expect(user).not.toContain('gameId');
  });

  it.each([
    ['lengden', '2–4'],
    ['språket', 'bokmål'],
    ['formen', 'ingen markdown'],
    // #2561: a null name is a player who said no to AI texts.
    ['et navn som er null', 'Er et navn null, vil personen ikke være med'],
    // #2561: a null game name named someone who said no.
    ['et rundenavn som er null', 'Er gameName null, nevner du ikke navnet på runden'],
  ])('systemteksten sier hva som gjelder for %s', (_label, phrase) => {
    expect(buildKavalkadeNarrativePrompt(makeFacts(), ALL).system).toContain(phrase);
  });

  it('sier ifra når spilleren er under terskelen', () => {
    const { system } = buildKavalkadeNarrativePrompt(
      makeFacts({ personal: null, soloRounds: 2, rounds: 2, teamRounds: 0, team: null }),
      ALL,
    );

    expect(system).toContain('2 runder');
    expect(system).toContain('terskelen på 3');
  });

  it('bøyer «runde» riktig i entall', () => {
    const { system } = buildKavalkadeNarrativePrompt(
      makeFacts({ personal: null, soloRounds: 1, rounds: 1, teamRounds: 0, team: null }),
      ALL,
    );

    expect(system).toContain('1 runde ');
  });

  it('nevner ikke terskelen når spilleren har personlige tall', () => {
    const { system } = buildKavalkadeNarrativePrompt(makeFacts(), ALL);

    expect(system).not.toContain('terskelen på');
  });

  it('ber om «dere» bare når det finnes lagrunder', () => {
    expect(buildKavalkadeNarrativePrompt(makeFacts(), ALL).system).toContain('«dere»');
    expect(
      buildKavalkadeNarrativePrompt(makeFacts({ team: null }), ALL).system,
    ).not.toContain('«dere»');
  });
});

describe('sanitizeKavalkadeNarrative', () => {
  it('slipper gjennom en kort innledning', () => {
    expect(sanitizeKavalkadeNarrative('  Året ditt ble langt.  ')).toBe(
      'Året ditt ble langt.',
    );
  });

  it('forkaster et svar som er lengre enn kavalkadens grense', () => {
    const tooLong = 'a'.repeat(MAX_KAVALKADE_NARRATIVE_LENGTH + 1);

    expect(sanitizeKavalkadeNarrative(tooLong)).toBeNull();
    expect(sanitizeKavalkadeNarrative('a'.repeat(MAX_KAVALKADE_NARRATIVE_LENGTH))).not.toBeNull();
  });

  it('forkaster et tomt svar', () => {
    expect(sanitizeKavalkadeNarrative('   ')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// #2561: who the consent read covers, and game names that name someone
// ---------------------------------------------------------------------------

function game(
  gameId: string,
  gameName: string,
  players: { userId: string; name: string | null; nickname?: string | null }[],
): KavalkadeGame {
  return {
    gameId,
    gameName,
    courseName: null,
    gameMode: 'stableford',
    year: 2026,
    endedAt: null,
    playedAt: null,
    players: players.map((p) => ({
      ...p,
      withdrawnAt: null,
      resultSummary: null,
      courseHandicap: null,
      teamNumber: null,
      holes: [],
    })),
  };
}

describe('collectUserIds', () => {
  it('finds every player the facts name, once each', () => {
    expect(collectUserIds(makeFacts()).sort()).toEqual(['u1', 'u2', 'u3', 'u4']);
  });
});

describe('gamesInFacts', () => {
  it('keeps only the rounds the facts mention', () => {
    const games = [game('g1', 'Lørdagscup', []), game('g2', 'Onsdag', []), game('g9', 'Texas', [])];
    expect(gamesInFacts(makeFacts(), games).map((g) => g.gameId)).toEqual(['g1', 'g9']);
  });
});

describe('gamesNamingUnconsenting', () => {
  const games = [
    game('g1', 'Olas 50-årsdag', [{ userId: 'u1', name: 'Per' }, { userId: 'u7', name: 'Ola Nordmann' }]),
    game('g9', 'Texas', [{ userId: 'u3', name: 'Kari' }]),
    game('g4', 'Karis cup', [{ userId: 'u3', name: 'Kari' }]),
  ];

  it('blocks a round whose name names a participant without «ja», and only that', () => {
    expect([...gamesNamingUnconsenting(games, new Set(['u1', 'u3']))]).toEqual(['g1']);
  });

  it('blocks nothing when everyone named said yes', () => {
    expect(gamesNamingUnconsenting(games, new Set(['u1', 'u3', 'u7'])).size).toBe(0);
  });
});

describe('factsForModel — blocked game names (#2561)', () => {
  it('sets a blocked round\'s gameName to null and leaves the others', () => {
    const json = JSON.stringify(factsForModel(makeFacts(), ALL, new Set(['g1'])));
    expect(json).not.toContain('Lørdagscup');
    expect(json).toContain('Texas');
  });
});
