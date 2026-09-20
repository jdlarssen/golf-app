import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import messages from '@/messages/no.json';
import {
  KAVALKADE_CARD_KINDS,
  buildKavalkadeCardModel,
  isKavalkadeCardKind,
  type KavalkadeCardKind,
  type KavalkadeCardStrings,
} from './cardModel';
import type { KavalkadeFacts } from './buildKavalkadeFacts';

/**
 * Type A: hvilke tall som havner på hvilket kort, og hva som skjer når faktumet
 * mangler. Oversettelsene er de EKTE fra `messages/no.json` — en nøkkel som
 * mangler, eller en ICU-streng som ikke parser, feller testen her og ikke først
 * når kortet rendres (§T4 rad 5).
 */

const base = createTranslator({
  locale: 'no',
  messages,
  namespace: 'kavalkadeShare',
});

const strings: KavalkadeCardStrings = {
  t: (key, values) =>
    (base as unknown as (k: string, v?: Record<string, unknown>) => string)(key, values),
  formatDate: (iso) => (iso ? `dato(${iso.slice(0, 10)})` : null),
  playerFallback: 'Spiller',
};

/** Et komplett år. Enkeltkort-testene nuller ut det de vil mangle. */
function fullFacts(overrides: Partial<KavalkadeFacts> = {}): KavalkadeFacts {
  return {
    year: 2026,
    cutoff: '2026-12-23T23:00:00.000Z',
    rounds: 11,
    soloRounds: 8,
    teamRounds: 3,
    roundsNeeded: 3,
    personal: {
      rounds: 8,
      season: null,
      bestRound: {
        gameId: 'g1',
        gameName: 'Tirsdagsrunden',
        courseName: 'Losby',
        brutto: 79,
        playedAt: '2026-06-14T10:00:00.000Z',
      },
      nemesisHole: {
        holeNumber: 7,
        played: 9,
        averageToPar: 1.44,
        worstStrokes: 8,
      },
      rival: {
        userId: 'u2',
        name: 'Ada Berg',
        met: 6,
        decided: 5,
        wins: 3,
        losses: 1,
        ties: 1,
      },
      formPeak: {
        stretch: {
          rounds: 3,
          averageBrutto: 81,
          fromDate: '2026-07-01T10:00:00.000Z',
          toDate: '2026-07-20T10:00:00.000Z',
        },
        season: {
          brutto: { start: 92, now: 84, best: 79 },
          netto: { start: 80, now: 74, best: 71 },
        },
      },
    },
    team: {
      rounds: 3,
      bestRound: {
        gameId: 'g9',
        gameName: 'Scramble-kvelden',
        courseName: 'Miklagard',
        playedAt: '2026-08-02T10:00:00.000Z',
        brutto: 68,
        teammates: [{ userId: 'u2', name: 'Ada Berg' }],
      },
      teammates: [],
      bestTeammates: [
        {
          userId: 'u2',
          name: 'Ada Berg',
          rounds: 3,
          averageBrutto: 70,
          scoredRounds: 3,
        },
      ],
    },
    gang: {
      members: 7,
      games: 14,
      topWinner: { userId: 'u3', name: 'Bo Dahl', count: 5 },
      mostBirdies: { userId: 'u4', name: 'Cato Ek', count: 12 },
      mostSnowmen: { userId: 'u5', name: 'Dina Fossum', count: 3 },
      tightestFinish: {
        gameId: 'g4',
        gameName: 'Klubbmesterskapet',
        courseName: 'Oslo GK',
        playedAt: '2026-09-01T10:00:00.000Z',
        strokeMargin: 1,
        leader: { userId: 'u3', name: 'Bo Dahl', brutto: 74 },
        runnerUp: { userId: 'u4', name: 'Cato Ek', brutto: 75 },
      },
    },
    ...overrides,
  };
}

function model(kind: KavalkadeCardKind, facts: KavalkadeFacts = fullFacts()) {
  return buildKavalkadeCardModel(facts, kind, strings);
}

describe('kortslugene', () => {
  it('kjenner igjen sine egne, og ingen andre', () => {
    for (const kind of KAVALKADE_CARD_KINDS) {
      expect(isKavalkadeCardKind(kind)).toBe(true);
    }
    expect(isKavalkadeCardKind('beste-runde')).toBe(false);
    expect(isKavalkadeCardKind('')).toBe(false);
  });

  it('gir hvert kort samme overlinje som året i fakta', () => {
    for (const kind of KAVALKADE_CARD_KINDS) {
      expect(model(kind)?.eyebrow).toBe('Kavalkaden 2026');
    }
  });
});

describe('tallene på kortene kommer fra fakta', () => {
  it('golfåret teller runder, egen ball og lag', () => {
    const card = model('year');
    expect(card?.hero.value).toBe('11');
    expect(card?.hero.caption).toBe('11 runder');
    expect(card?.lines).toEqual([
      { label: 'Med egen ball', value: '8 runder' },
      { label: 'Som lag', value: '3 runder' },
      { label: 'Gjengen', value: '7 spillere, 14 runder' },
    ]);
  });

  it('beste runde viser brutto, spill, bane og dato', () => {
    const card = model('best-round');
    expect(card?.title).toBe('Årets beste runde');
    expect(card?.hero.value).toBe('79');
    expect(card?.lines).toEqual([
      { label: 'Spill', value: 'Tirsdagsrunden' },
      { label: 'Bane', value: 'Losby' },
      { label: 'Dato', value: 'dato(2026-06-14)' },
    ]);
  });

  it('nemesis-hullet viser hullet, snittet, antall ganger og verste besøk', () => {
    const card = model('nemesis-hole');
    expect(card?.hero.value).toBe('Hull 7');
    expect(card?.hero.caption).toContain('44'); // 1,44 i norsk tallformat
    expect(card?.lines).toEqual([
      { label: 'Spilt', value: '9 ganger' },
      { label: 'Verste besøk', value: '8 slag' },
    ]);
  });

  it('rival-kortet setter navnet i tittelen og regnskapet i tallet', () => {
    const card = model('rival');
    expect(card?.title).toBe('Regnskapet mot Ada Berg');
    expect(card?.hero.value).toBe('3–1–1');
    expect(card?.lines).toEqual([
      { label: 'Møttes', value: '6 runder' },
      { label: 'Avgjort', value: '5 runder' },
    ]);
  });

  it('formtoppen viser snittet over strekket og årets beste', () => {
    const card = model('form-peak');
    expect(card?.hero.value).toBe('81');
    expect(card?.hero.caption).toBe('i snitt over 3 runder');
    expect(card?.lines).toEqual([
      { label: 'Perioden', value: 'dato(2026-07-01) til dato(2026-07-20)' },
      { label: 'Årets beste', value: '79 slag' },
    ]);
  });

  it('lagkortet teller lagrunder og navngir beste lagkamerat', () => {
    const card = model('team');
    expect(card?.hero.value).toBe('3');
    expect(card?.hero.caption).toBe('3 lagrunder');
    expect(card?.lines).toEqual([
      { label: 'Beste lagrunde', value: '68 slag' },
      { label: 'Hvor', value: 'Miklagard · dato(2026-08-02)' },
      { label: 'Beste lagkamerat', value: 'Ada Berg' },
    ]);
  });

  it('gjengekortene navngir lederen og teller', () => {
    expect(model('gang-winner')?.hero).toEqual({ value: 'Bo Dahl', caption: '5 seire' });
    expect(model('gang-birdies')?.hero).toEqual({ value: 'Cato Ek', caption: '12 birdier' });
    expect(model('gang-snowmen')?.hero).toEqual({
      value: 'Dina Fossum',
      caption: '3 snowman',
    });
  });

  it('tetteste oppgjør viser marginen og begge brutto', () => {
    const card = model('gang-tightest');
    expect(card?.hero.value).toBe('1 slag');
    expect(card?.lines).toEqual([
      { label: 'Bo Dahl', value: '74 slag' },
      { label: 'Cato Ek', value: '75 slag' },
      { label: 'Hvor', value: 'Oslo GK · dato(2026-09-01)' },
    ]);
  });

  it('kaller delt ledelse ved sitt navn i stedet for «0 slag»', () => {
    const facts = fullFacts();
    facts.gang!.tightestFinish!.strokeMargin = 0;
    expect(model('gang-tightest', facts)?.hero.value).toBe('Delt ledelse');
  });
});

describe('manglende fakta gir intet kort', () => {
  it('under terskelen finnes ingen personlige kort', () => {
    const facts = fullFacts({ personal: null, soloRounds: 2 });
    expect(model('best-round', facts)).toBeNull();
    expect(model('nemesis-hole', facts)).toBeNull();
    expect(model('rival', facts)).toBeNull();
    expect(model('form-peak', facts)).toBeNull();
    // Gjengens og lagets kort står igjen.
    expect(model('team', facts)).not.toBeNull();
    expect(model('gang-winner', facts)).not.toBeNull();
  });

  it('uten lagrunder finnes ikke lagkortet', () => {
    expect(model('team', fullFacts({ team: null }))).toBeNull();
    expect(
      model(
        'team',
        fullFacts({ team: { rounds: 0, bestRound: null, teammates: [], bestTeammates: [] } }),
      ),
    ).toBeNull();
  });

  it('uten gjeng finnes ingen gjengekort', () => {
    const facts = fullFacts({ gang: null });
    expect(model('gang-winner', facts)).toBeNull();
    expect(model('gang-birdies', facts)).toBeNull();
    expect(model('gang-snowmen', facts)).toBeNull();
    expect(model('gang-tightest', facts)).toBeNull();
  });

  it('et år uten runder gir ikke årskortet', () => {
    expect(model('year', fullFacts({ rounds: 0 }))).toBeNull();
  });

  it('hopper over linjer som mangler i stedet for å vise tomme felt', () => {
    const facts = fullFacts();
    facts.personal!.bestRound!.courseName = null;
    facts.personal!.bestRound!.playedAt = null;
    expect(model('best-round', facts)?.lines).toEqual([
      { label: 'Spill', value: 'Tirsdagsrunden' },
    ]);
  });
});

describe('navn', () => {
  it('lister alle ved ekte likhet blant lagkameratene', () => {
    const facts = fullFacts();
    facts.team!.bestTeammates = [
      { userId: 'u2', name: 'Ada Berg', rounds: 3, averageBrutto: 70, scoredRounds: 3 },
      { userId: 'u6', name: 'Even Holm', rounds: 3, averageBrutto: 70, scoredRounds: 3 },
    ];
    const line = model('team', facts)?.lines.at(-1);
    expect(line).toEqual({ label: 'Beste lagkamerater', value: 'Ada Berg og Even Holm' });
  });

  it('faller tilbake til «Spiller» når navnet mangler', () => {
    const facts = fullFacts();
    facts.gang!.topWinner!.name = null;
    facts.personal!.rival!.name = '   ';
    expect(model('gang-winner', facts)?.hero.value).toBe('Spiller');
    expect(model('rival', facts)?.title).toBe('Regnskapet mot Spiller');
  });
});
