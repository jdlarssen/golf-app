// Type A — generalprøven av Kavalkaden (#3020, B1). Golfåret i
// `__fixtures__/golfaar3020.ts` er regnet for hånd (`GOLFAAR_FASIT`). Testen
// kjører den ekte poengmotoren og den ekte fakta-byggeren på det samme året og
// krever at hvert tall og hvert navn er lik fasiten. Den står som vakt etter
// 24. desember: en endring som flytter et tall på kortene, feller den her.
import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import messages from '@/messages/no.json';
import { buildModeResultFromData } from '@/lib/scoring/buildModeResultFromData';
import { computeResultSummaries } from '@/lib/scoring/resultSummary';
import { effectiveYear } from '@/lib/stats/effectiveDate';
import {
  GOLFAAR_COURSE,
  GOLFAAR_FASIT,
  GOLFAAR_GAMES,
  GOLFAAR_PLAYERS,
  golfaarPar,
  golfaarStrokesOf,
  type GolfaarGame,
  type GolfaarPlayerKey,
} from './__fixtures__/golfaar3020';
import {
  buildKavalkadeFacts,
  type GangLeaderFact,
  type KavalkadeGame,
} from './buildKavalkadeFacts';
import { buildKavalkadeCardModel, type KavalkadeCardStrings } from './cardModel';
import { buildKavalkadeDeck } from './kavalkadeCards';
import { KAVALKADE_CUTOFF, KAVALKADE_YEAR } from './release';

const COURSE_ID = 'course-golfaar3020';
const idOf = (key: GolfaarPlayerKey) => `u-${key.toLowerCase()}`;
const gameByKey = (key: string) => GOLFAAR_GAMES.find((g) => g.key === key)!;

const COURSE_ROWS = GOLFAAR_COURSE.holes.map((h) => ({
  hole_number: h.hole,
  par_mens: h.par,
  par_ladies: h.par,
  par_juniors: h.par,
  stroke_index: h.strokeIndex,
}));

/** Spillerens slag i runden, som scores-radene riggen skriver. */
function scoreRows(game: GolfaarGame) {
  return game.players.flatMap((p) =>
    golfaarStrokesOf(game, p.key, idOf).map((s) => ({
      user_id: idOf(p.key),
      hole_number: s.hole,
      strokes: s.strokes,
    })),
  );
}

/** Runden slik `loadKavalkadeInput` leverer den. */
function toKavalkadeGame(game: GolfaarGame): KavalkadeGame {
  return {
    gameId: game.key,
    gameName: game.name,
    courseId: COURSE_ID,
    courseName: GOLFAAR_COURSE.name,
    gameMode: game.gameMode,
    year: effectiveYear({ scheduled_tee_off_at: game.teeOffAt, ended_at: game.endedAt }),
    endedAt: new Date(game.endedAt),
    playedAt: new Date(game.teeOffAt),
    leagueFlight: game.leagueFlight ?? false,
    players: game.players.map((p) => ({
      userId: idOf(p.key),
      name: GOLFAAR_PLAYERS[p.key].name,
      nickname: null,
      withdrawnAt: null,
      resultSummary: game.expected[p.key] ?? null,
      courseHandicap: 0,
      teamNumber: p.team ?? null,
      holes: golfaarStrokesOf(game, p.key, idOf).map((s) => ({
        holeNumber: s.hole,
        strokes: s.strokes,
        par: golfaarPar(s.hole),
      })),
    })),
  };
}

function factsFor(viewer: GolfaarPlayerKey) {
  return buildKavalkadeFacts({
    viewerUserId: idOf(viewer),
    year: KAVALKADE_YEAR,
    cutoff: KAVALKADE_CUTOFF,
    games: GOLFAAR_GAMES.map(toKavalkadeGame),
  });
}

/** Navnene på et «mest av noe»-kort i visningsrekkefølge, og tallet. */
function leader(fact: GangLeaderFact | null) {
  if (!fact) return null;
  return { names: [fact.name, ...(fact.tiedWith ?? []).map((p) => p.name)], count: fact.count };
}

describe('golfåret: motoren lagrer resultatene fasiten sier', () => {
  it.each(GOLFAAR_GAMES.map((g) => [g.key, g] as const))('%s', (_key, game) => {
    const result = buildModeResultFromData(
      {
        id: game.key,
        game_mode: game.gameMode,
        mode_config: game.modeConfig,
        course_id: COURSE_ID,
        hole_segment: 'full',
      },
      game.players.map((p) => ({
        user_id: idOf(p.key),
        team_number: p.team ?? null,
        flight_number: p.team ?? null,
        course_handicap: 0,
        raw_course_handicap: 0,
        tee_gender: 'mens' as const,
        withdrawn_at: null,
        users: { name: GOLFAAR_PLAYERS[p.key].name, nickname: null },
      })),
      COURSE_ROWS,
      scoreRows(game),
    );
    expect(result).not.toBeNull();
    const stored = Object.fromEntries(computeResultSummaries(result!));
    const expected = Object.fromEntries(
      Object.entries(game.expected).map(([key, summary]) => [idOf(key as GolfaarPlayerKey), summary]),
    );
    expect(stored).toEqual(expected);
  });
});

describe.each(Object.keys(GOLFAAR_FASIT) as GolfaarPlayerKey[])(
  'golfåret sett fra %s: hvert tall på kortene er lik fasiten',
  (viewer) => {
    const fasit = GOLFAAR_FASIT[viewer]!;
    const facts = factsFor(viewer);

    it('teller rundene', () => {
      expect({ rounds: facts.rounds, soloRounds: facts.soloRounds, teamRounds: facts.teamRounds }).toEqual({
        rounds: fasit.rounds,
        soloRounds: fasit.soloRounds,
        teamRounds: fasit.teamRounds,
      });
    });

    it('har de personlige kortene fasiten sier', () => {
      if (fasit.personal == null) {
        expect(facts.personal).toBeNull();
        return;
      }
      const p = facts.personal!;
      const want = fasit.personal;
      expect({ game: p.bestRound?.gameName, brutto: p.bestRound?.brutto }).toEqual(want.bestRound);
      expect(p.nemesisHole).toEqual({
        holeNumber: want.nemesisHole.hole,
        courseName: GOLFAAR_COURSE.name,
        played: want.nemesisHole.played,
        averageToPar: want.nemesisHole.averageToPar,
        worstStrokes: want.nemesisHole.worstStrokes,
      });
      const { userId: _rivalId, ...rival } = p.rival!;
      expect(rival).toEqual(want.rival);
      expect(p.formPeak.stretch).toEqual({
        rounds: 3,
        averageBrutto: want.formPeak.averageBrutto,
        fromDate: gameByKey(want.formPeak.from).teeOffAt,
        toDate: gameByKey(want.formPeak.to).teeOffAt,
      });
      expect(p.formPeak.season?.brutto).toEqual({
        start: want.formPeak.start,
        now: want.formPeak.now,
        best: want.formPeak.best,
      });
    });

    it('har lagkortet fasiten sier', () => {
      const teamCard = buildKavalkadeDeck(facts).personal.find((c) => c.id === 'team');
      if (fasit.team == null) {
        expect(facts.team).toBeNull();
        expect(teamCard).toBeUndefined();
        return;
      }
      expect(facts.team?.rounds).toBe(fasit.team.rounds);
      expect(facts.team?.bestRound?.brutto).toBe(fasit.team.bestBrutto);
      expect(facts.team?.bestRound?.teammates.map((m) => m.name)).toEqual(fasit.team.bestWith);
      expect(teamCard).toMatchObject({ highlight: { kind: 'mostRounds' } });
      const mates = teamCard && 'highlight' in teamCard ? teamCard.highlight : null;
      expect(mates && 'teammates' in mates ? mates.teammates.map((m) => m.name) : []).toEqual(
        fasit.team.mostRoundsWith,
      );
    });

    it('har gjengekortene fasiten sier, med navnene i rekkefølge', () => {
      if (fasit.gang == null) {
        expect(facts.gang).toBeNull();
        return;
      }
      const g = facts.gang!;
      expect({ members: g.members, games: g.games }).toEqual({
        members: fasit.gang.members,
        games: fasit.gang.games,
      });
      expect(leader(g.topWinner)).toEqual(fasit.gang.winner);
      expect(leader(g.mostBirdies)).toEqual(fasit.gang.birdies);
      expect(leader(g.mostSnowmen)).toEqual(fasit.gang.snowmen);
      const t = g.tightestFinish;
      expect(
        t && {
          game: t.gameName,
          margin: t.strokeMargin,
          leader: [t.leader.name, t.leader.brutto],
          runnerUp: [t.runnerUp.name, t.runnerUp.brutto],
        },
      ).toEqual(fasit.gang.tightest);
    });
  },
);

describe('golfåret: kortene slik delebildet skriver dem', () => {
  const t = createTranslator({ locale: 'no', messages, namespace: 'kavalkadeShare' });
  const strings: KavalkadeCardStrings = {
    t: (key, values) => (t as unknown as (k: string, v?: Record<string, unknown>) => string)(key, values),
    formatDate: () => null,
    playerFallback: 'Spiller',
  };
  const _ = ' ';

  it('Aud ser to vinnere, tre birdie-konger og fire snømenn', () => {
    const facts = factsFor('A');
    expect(buildKavalkadeCardModel(facts, 'gang-winner', strings)).toMatchObject({
      title: 'Årets vinnere',
      hero: { value: `Aud${_}A. og Bjørn${_}B.`, caption: '2 seire hver' },
    });
    expect(buildKavalkadeCardModel(facts, 'gang-birdies', strings)?.hero).toEqual({
      value: `Dag${_}D., Cecilie${_}C. og Maximiliansebastians${_}G.`,
      caption: '3 birdier hver',
    });
    expect(buildKavalkadeCardModel(facts, 'gang-snowmen', strings)?.hero).toEqual({
      value: `Bjørn${_}B., Dag${_}D., Cecilie${_}C. og 1 til`,
      caption: '1 snowman hver',
    });
  });

  it('Bjørn står først på sine egne kort', () => {
    const facts = factsFor('B');
    expect(buildKavalkadeCardModel(facts, 'gang-winner', strings)?.hero.value).toBe(
      `Bjørn${_}B. og Aud${_}A.`,
    );
    expect(buildKavalkadeCardModel(facts, 'gang-birdies', strings)?.hero.value).toBe(
      `Bjørn${_}B., Aud${_}A., Cecilie${_}C. og 1 til`,
    );
  });

  it('navnene i faktaene er kortnavnene, aldri fulle navn', () => {
    const json = JSON.stringify([factsFor('A'), factsFor('B'), factsFor('E')]);
    for (const player of Object.values(GOLFAAR_PLAYERS)) {
      expect(json).not.toContain(player.name);
    }
  });
});
