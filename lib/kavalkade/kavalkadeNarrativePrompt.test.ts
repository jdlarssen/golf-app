import { describe, it, expect } from 'vitest';
import type { KavalkadeFacts } from './buildKavalkadeFacts';
import {
  MAX_KAVALKADE_NARRATIVE_LENGTH,
  buildKavalkadeNarrativePrompt,
  factsForModel,
  sanitizeKavalkadeNarrative,
} from './kavalkadeNarrativePrompt';

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
  it('fjerner alle userId-er, uansett hvor dypt de ligger', () => {
    const json = JSON.stringify(factsForModel(makeFacts()));

    expect(json).not.toContain('userId');
    expect(json).not.toContain('"u2"');
    expect(json).not.toContain('"u3"');
  });

  it('beholder navnene og tallene', () => {
    const json = JSON.stringify(factsForModel(makeFacts()));

    expect(json).toContain('Ola');
    expect(json).toContain('Kari');
    expect(json).toContain('82');
    expect(json).toContain('Losby');
  });

  it('rører ikke fakta-objektet den fikk', () => {
    const facts = makeFacts();
    factsForModel(facts);

    expect(facts.personal?.rival?.userId).toBe('u2');
  });

  it('beholder null og tomme lister', () => {
    const stripped = factsForModel(
      makeFacts({ personal: null, team: null }),
    ) as Record<string, unknown>;

    expect(stripped.personal).toBeNull();
    expect(stripped.team).toBeNull();
  });
});

describe('buildKavalkadeNarrativePrompt', () => {
  it('legger ved fakta uten id-er, og aldri rå scorer', () => {
    const { user } = buildKavalkadeNarrativePrompt(makeFacts());

    expect(user).toContain('2026');
    expect(user).toContain('Lørdagscup');
    expect(user).not.toContain('userId');
  });

  it('ber om 2–4 setninger på norsk uten markdown', () => {
    const { system } = buildKavalkadeNarrativePrompt(makeFacts());

    expect(system).toContain('2–4');
    expect(system).toContain('bokmål');
    expect(system).toContain('ingen markdown');
  });

  it('sier ifra når spilleren er under terskelen', () => {
    const { system } = buildKavalkadeNarrativePrompt(
      makeFacts({ personal: null, soloRounds: 2, rounds: 2, teamRounds: 0, team: null }),
    );

    expect(system).toContain('2 runder');
    expect(system).toContain('terskelen på 3');
  });

  it('bøyer «runde» riktig i entall', () => {
    const { system } = buildKavalkadeNarrativePrompt(
      makeFacts({ personal: null, soloRounds: 1, rounds: 1, teamRounds: 0, team: null }),
    );

    expect(system).toContain('1 runde ');
  });

  it('nevner ikke terskelen når spilleren har personlige tall', () => {
    const { system } = buildKavalkadeNarrativePrompt(makeFacts());

    expect(system).not.toContain('terskelen på');
  });

  it('ber om «dere» bare når det finnes lagrunder', () => {
    expect(buildKavalkadeNarrativePrompt(makeFacts()).system).toContain('«dere»');
    expect(
      buildKavalkadeNarrativePrompt(makeFacts({ team: null })).system,
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
