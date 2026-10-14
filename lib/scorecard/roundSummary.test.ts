import { describe, it, expect } from 'vitest';
import type { GameMode } from '@/lib/scoring/modes/types';
import type { HoleScore } from '@/lib/stats/achievements';
import {
  flightRoundStatus,
  roundDoneHeadline,
  roundHighlights,
  type RoundRosterRow,
  type RoundScoreRow,
} from './roundSummary';

/**
 * Type A (#2299): oppsummeringen etter siste hull. Ordet for et slag
 * (`strokeTerm`) og eier-regelen for lagkort (`ownedScoresByPlayer`) har egne
 * suiter; her låses bare det denne modulen legger til: hvilket hull som blir
 * beste og verste, hvilken status hver i flighten får, og hvilket tall som
 * står først.
 */

/** Hull 1–n på par 4, med slagene gitt per hull (`null` = uspilt). */
function card(strokes: (number | null)[], par = 4): HoleScore[] {
  return strokes.map((s, i) => ({ holeNumber: i + 1, strokes: s, par }));
}

describe('roundHighlights', () => {
  it.each([
    {
      name: 'likhet på beste: to birdier, laveste hull vinner',
      holes: card([4, 3, 4, 3, 4]),
      best: { holeNumber: 2, strokes: 3, term: 'birdie' },
      worst: null,
    },
    {
      name: 'likhet på verste: to doble, laveste hull vinner',
      holes: card([4, 6, 4, 6, 4]),
      best: { holeNumber: 1, strokes: 4, term: 'par' },
      worst: { holeNumber: 2, strokes: 6, term: 'doubleBogey' },
    },
    {
      name: 'ingen birdie: beste blir første par',
      holes: card([5, 4, 5, 4]),
      best: { holeNumber: 2, strokes: 4, term: 'par' },
      worst: null,
    },
    {
      name: 'bare bogeyer: ingen beste',
      holes: card([5, 5, 5]),
      best: null,
      worst: null,
    },
    {
      name: 'ingen dobbel: ingen verste',
      holes: card([3, 4, 5]),
      best: { holeNumber: 1, strokes: 3, term: 'birdie' },
      worst: null,
    },
    {
      name: 'trippel slår dobbel som verste',
      holes: card([6, 7, 4]),
      best: { holeNumber: 3, strokes: 4, term: 'par' },
      worst: { holeNumber: 2, strokes: 7, term: 'tripleBogey' },
    },
    {
      name: 'eagle slår birdie som beste',
      holes: card([3, 2, 4]),
      best: { holeNumber: 2, strokes: 2, term: 'eagle' },
      worst: null,
    },
    {
      name: 'uspilt hull hoppes over',
      holes: card([null, 4, null, 7]),
      best: { holeNumber: 2, strokes: 4, term: 'par' },
      worst: { holeNumber: 4, strokes: 7, term: 'tripleBogey' },
    },
    {
      name: 'ingen spilte hull: ingen av dem',
      holes: card([null, null]),
      best: null,
      worst: null,
    },
  ])('$name', ({ holes, best, worst }) => {
    const result = roundHighlights(holes);
    expect(result.best && {
      holeNumber: result.best.holeNumber,
      strokes: result.best.strokes,
      term: result.best.term,
    }).toEqual(best);
    expect(result.worst && {
      holeNumber: result.worst.holeNumber,
      strokes: result.worst.strokes,
      term: result.worst.term,
    }).toEqual(worst);
  });

  it('damepar: samme slag gir et annet ord med et annet par', () => {
    // Hull 1 er par 4 for herrer og par 5 for damer; 5 slag er bogey for den
    // ene og par for den andre. Paret er alt valgt per spiller ved kallstedet.
    const mens = roundHighlights([{ holeNumber: 1, strokes: 5, par: 4 }]);
    const ladies = roundHighlights([{ holeNumber: 1, strokes: 5, par: 5 }]);
    expect(mens.best).toBeNull();
    expect(ladies.best).toMatchObject({ holeNumber: 1, term: 'par', par: 5 });
  });

  it('hole-in-one gir holeInOne: true, et vanlig hull false', () => {
    const result = roundHighlights([
      { holeNumber: 1, strokes: 4, par: 4 },
      { holeNumber: 7, strokes: 1, par: 3 },
    ]);
    expect(result.best).toMatchObject({ holeNumber: 7, holeInOne: true });
    expect(roundHighlights(card([3])).best).toMatchObject({ holeInOne: false });
  });
});

describe('flightRoundStatus', () => {
  const ALL = Array.from({ length: 18 }, (_, i) => i + 1);

  function player(
    user_id: string,
    opts: { team?: number | null; withdrawn?: boolean; submitted?: boolean } = {},
  ): RoundRosterRow {
    return {
      user_id,
      team_number: opts.team ?? null,
      withdrawn_at: opts.withdrawn ? '2026-10-14T10:00:00Z' : null,
      submitted_at: opts.submitted ? '2026-10-14T12:00:00Z' : null,
    };
  }

  /** Rader for `holes`, alle eid av `user_id`. */
  function scored(user_id: string, holes: readonly number[], strokes: number | null = 4): RoundScoreRow[] {
    return holes.map((hole_number) => ({ user_id, hole_number, strokes }));
  }

  const without = (...skip: number[]) => ALL.filter((h) => !skip.includes(h));

  it('gir alle tre statusene, i rekkefølgen fra mateIds', () => {
    const result = flightRoundStatus({
      players: [
        player('me'),
        player('marte'),
        player('tore'),
        player('kari', { submitted: true }),
        player('jonas'),
      ],
      mateIds: ['tore', 'jonas', 'kari', 'marte'],
      scores: [
        ...scored('me', ALL),
        ...scored('marte', ALL),
        ...scored('tore', ALL),
        ...scored('kari', ALL),
        ...scored('jonas', without(17)),
      ],
      mode: 'stableford',
      holeNumbers: ALL,
    });
    expect(result).toEqual({
      submitted: ['kari'],
      complete: ['tore', 'marte'],
      missing: [{ userId: 'jonas', holes: [17] }],
    });
  });

  it('levert går foran manglende hull', () => {
    const result = flightRoundStatus({
      players: [player('me'), player('kari', { submitted: true })],
      mateIds: ['kari'],
      scores: scored('kari', [1, 2, 3]),
      mode: 'stableford',
      holeNumbers: ALL,
    });
    expect(result.submitted).toEqual(['kari']);
    expect(result.missing).toEqual([]);
  });

  it('manglende hull står stigende, også når radene kommer i annen rekkefølge', () => {
    const result = flightRoundStatus({
      players: [player('me'), player('jonas')],
      mateIds: ['jonas'],
      scores: scored('jonas', [...without(17, 3, 12)].reverse()),
      mode: 'solo_strokeplay',
      holeNumbers: ALL,
    });
    expect(result.missing).toEqual([{ userId: 'jonas', holes: [3, 12, 17] }]);
  });

  it('lagkort hos kapteinen: makkerens hull telles på kapteinens rader', () => {
    // Texas scramble: laget deler én ball, og «a» (lex-min) eier radene.
    const result = flightRoundStatus({
      players: [player('a', { team: 1 }), player('b', { team: 1 }), player('me', { team: 2 })],
      mateIds: ['a', 'b'],
      scores: [...scored('a', ALL), ...scored('me', ALL)],
      mode: 'texas_scramble',
      holeNumbers: ALL,
    });
    expect(result.complete).toEqual(['a', 'b']);
    expect(result.missing).toEqual([]);
  });

  it('trukket tidligere kaptein: radene hans telles for laget', () => {
    // «a» var kaptein og trakk seg etter hull 9. Radene 1–9 står på hans id,
    // 10–18 på «b», som eier laget nå.
    const result = flightRoundStatus({
      players: [player('a', { team: 1, withdrawn: true }), player('b', { team: 1 })],
      mateIds: ['b'],
      scores: [...scored('a', [1, 2, 3, 4, 5, 6, 7, 8, 9]), ...scored('b', [10, 11, 12, 13, 14, 15, 16, 17, 18])],
      mode: 'texas_scramble',
      holeNumbers: ALL,
    });
    expect(result.complete).toEqual(['b']);
  });

  it('rader med strokes: null teller ikke som ført', () => {
    const result = flightRoundStatus({
      players: [player('me'), player('jonas')],
      mateIds: ['jonas'],
      scores: [...scored('jonas', without(17)), ...scored('jonas', [17], null)],
      mode: 'stableford',
      holeNumbers: ALL,
    });
    expect(result.missing).toEqual([{ userId: 'jonas', holes: [17] }]);
  });

  it('holeNumbers 1–9 sjekker bare de ni', () => {
    const result = flightRoundStatus({
      players: [player('me'), player('jonas')],
      mateIds: ['jonas'],
      scores: scored('jonas', [1, 2, 3, 4, 5, 6, 7, 8, 9]),
      mode: 'singles_matchplay',
      holeNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    });
    expect(result.complete).toEqual(['jonas']);
  });

  it('ingen medspillere gir tomme lister', () => {
    expect(
      flightRoundStatus({
        players: [player('me')],
        mateIds: [],
        scores: scored('me', ALL),
        mode: 'stableford',
        holeNumbers: ALL,
      }),
    ).toEqual({ submitted: [], complete: [], missing: [] });
  });
});

describe('roundDoneHeadline', () => {
  it.each<{ mode: GameMode; shown: 'points' | 'net' | 'gross' }>([
    { mode: 'stableford', shown: 'points' },
    { mode: 'modified_stableford', shown: 'points' },
    { mode: 'solo_strokeplay', shown: 'net' },
    { mode: 'texas_scramble', shown: 'gross' },
  ])('$mode gir $shown, og skjult netto gir gross', ({ mode, shown }) => {
    expect(roundDoneHeadline(mode, false)).toBe(shown);
    expect(roundDoneHeadline(mode, true)).toBe('gross');
  });
});
