import { describe, it, expect } from 'vitest';
import {
  filledHolesByPlayer,
  ownedScoresByPlayer,
  type FilledRosterRow,
  type FilledScoreRow,
} from './filledHoles';

/**
 * Type A (#2017): «hvor mange hull har hver spiller ført» for et helt roster.
 *
 * Eierskaps-reglene selv (`teamScoreOwnerId`, `scoreOwnerForHole`,
 * `modeCollapsesToTeamCard`) har egne suiter og re-asserteres ikke her. Denne
 * fila beviser at adapteren spør dem riktig for hvert medlem av rosteret —
 * én test per format-klasse, pluss fallbackene når laget ikke finnes.
 */

function member(
  user_id: string,
  team_number: number | null,
  withdrawn_at: string | null = null,
): FilledRosterRow {
  return { user_id, team_number, withdrawn_at };
}

/** Rader for hullene `from..to` (inklusive), alle eid av `user_id`. */
function rows(user_id: string, from: number, to: number): FilledScoreRow[] {
  return Array.from({ length: to - from + 1 }, (_, i) => ({
    user_id,
    hole_number: from + i,
  }));
}

const asObject = (m: Map<string, number>) => Object.fromEntries(m);

describe('filledHolesByPlayer — individuelle formater', () => {
  it('teller spillerens egne rader', () => {
    const result = filledHolesByPlayer({
      mode: 'solo_strokeplay',
      players: [member('a', null), member('b', null)],
      scores: [...rows('a', 1, 18), ...rows('b', 1, 7)],
    });

    expect(asObject(result)).toEqual({ a: 18, b: 7 });
  });

  it('wolf: team_number er en rotasjons-slot og slår aldri sammen radene', () => {
    // Samme slot på to spillere er ikke en ekte wolf-oppstilling, men det er
    // nøyaktig fella en gruppering på team_number inviterer til: uten
    // modus-sjekken ville «b» arvet a sine 18 hull.
    const result = filledHolesByPlayer({
      mode: 'wolf',
      players: [member('a', 1), member('b', 1)],
      scores: rows('a', 1, 18),
    });

    expect(asObject(result)).toEqual({ a: 18, b: 0 });
  });
});

describe('filledHolesByPlayer — egen ball i lag', () => {
  it('best ball: makkerens kort teller aldri for deg', () => {
    const result = filledHolesByPlayer({
      mode: 'best_ball',
      players: [member('a', 1), member('b', 1)],
      scores: rows('a', 1, 18),
    });

    expect(asObject(result)).toEqual({ a: 18, b: 0 });
  });
});

describe('filledHolesByPlayer — lag-kollapsede formater', () => {
  it('scramble: lagkameraten teller kapteinens kort, og kapteinens tall er uendret', () => {
    const result = filledHolesByPlayer({
      mode: 'texas_scramble',
      players: [
        member('b', 1),
        member('a', 1), // lex-min → kaptein
        member('c', 2),
        member('d', 2),
      ],
      scores: [...rows('a', 1, 18), ...rows('c', 1, 5)],
    });

    expect(asObject(result)).toEqual({ a: 18, b: 18, c: 5, d: 5 });
  });

  it('foursomes: begge på siden teller sidens kort', () => {
    const result = filledHolesByPlayer({
      mode: 'foursomes_matchplay',
      players: [member('a', 1), member('b', 1), member('c', 2), member('d', 2)],
      scores: [...rows('a', 1, 18), ...rows('c', 1, 18)],
    });

    expect(asObject(result)).toEqual({ a: 18, b: 18, c: 18, d: 18 });
  });

  it('foursomes på front9: kapteinen eier hull 1–9, begge teller 9 (#1441 × #1538)', () => {
    const result = filledHolesByPlayer({
      mode: 'foursomes_matchplay',
      players: [member('a', 1), member('b', 1)],
      scores: rows('a', 1, 9),
    });

    expect(asObject(result)).toEqual({ a: 9, b: 9 });
  });
});

describe('filledHolesByPlayer — patsome (delt midtveis)', () => {
  it('6 egne på 1–6 + 12 på kapteinen på 7–18 = 18 for begge', () => {
    const result = filledHolesByPlayer({
      mode: 'patsome',
      players: [member('a', 1), member('b', 1)],
      scores: [...rows('a', 1, 18), ...rows('b', 1, 6)],
    });

    expect(asObject(result)).toEqual({ a: 18, b: 18 });
  });

  it('kapteinens rader på hull 1–6 teller for kapteinen, men ikke for lagkameraten', () => {
    const result = filledHolesByPlayer({
      mode: 'patsome',
      players: [member('a', 1), member('b', 1)],
      // b har bare ført hull 1–3 selv; kapteinen har alle 18.
      scores: [...rows('a', 1, 18), ...rows('b', 1, 3)],
    });

    expect(asObject(result)).toEqual({ a: 18, b: 3 + 12 });
  });

  it('lagkameratens løse rader på hull 7–18 teller ikke', () => {
    const result = filledHolesByPlayer({
      mode: 'patsome',
      players: [member('a', 1), member('b', 1)],
      // Kapteinen har bare 4BBB-halvdelen; b har data-rester på 7–18.
      scores: [...rows('a', 1, 6), ...rows('b', 1, 18)],
    });

    expect(asObject(result)).toEqual({ a: 6, b: 6 });
  });
});

describe('filledHolesByPlayer — fallback til egne rader', () => {
  it('team_number mangler i et kollapset format (roster ikke satt opp)', () => {
    const result = filledHolesByPlayer({
      mode: 'texas_scramble',
      players: [member('a', null), member('b', null)],
      scores: rows('a', 1, 18),
    });

    expect(asObject(result)).toEqual({ a: 18, b: 0 });
  });

  it('helt trukket lag: ingen kaptein, hver teller sine egne', () => {
    const result = filledHolesByPlayer({
      mode: 'texas_scramble',
      players: [
        member('a', 1, '2026-09-02T09:00:00+00:00'),
        member('b', 1, '2026-09-02T09:05:00+00:00'),
      ],
      scores: [...rows('a', 1, 18), ...rows('b', 1, 2)],
    });

    expect(asObject(result)).toEqual({ a: 18, b: 2 });
  });
});

describe('filledHolesByPlayer — formen på svaret', () => {
  it('har én oppføring per spiller, også uten rader, og ignorerer rader fra ukjente', () => {
    const result = filledHolesByPlayer({
      mode: 'stableford',
      players: [member('a', null), member('b', null)],
      scores: [...rows('a', 1, 4), ...rows('fremmed', 1, 18)],
    });

    expect([...result.entries()]).toEqual([
      ['a', 4],
      ['b', 0],
    ]);
  });

  it('tomt roster gir et tomt kart', () => {
    const result = filledHolesByPlayer({
      mode: 'texas_scramble',
      players: [],
      scores: rows('a', 1, 18),
    });

    expect(result.size).toBe(0);
  });
});

/**
 * #2041: statussiden trenger radene bak tallet («sist aktiv» = nyeste
 * `updated_at`), ikke bare antallet. Tellingen over går gjennom samme funksjon,
 * så eierskaps-reglene re-asserteres ikke her — bare at radene kommer ut hele.
 */
describe('ownedScoresByPlayer — radene bak tallet (#2041)', () => {
  it('patsome: makkeren får egne rader på 1–6 og kapteinens på 7–18, med alle feltene i behold', () => {
    const stamped = (user_id: string, from: number, to: number) =>
      rows(user_id, from, to).map((r) => ({
        ...r,
        updated_at: `${user_id}-${r.hole_number}`,
      }));
    const kaptein = stamped('a', 1, 18);
    const makker = stamped('b', 1, 6);

    const result = ownedScoresByPlayer({
      mode: 'patsome',
      players: [member('a', 1), member('b', 1)],
      scores: [...kaptein, ...makker],
    });

    expect(result.get('a')).toEqual(kaptein);
    // Radene kommer i samme rekkefølge som i `scores`.
    expect(result.get('b')).toEqual([...kaptein.slice(6), ...makker]);
  });
});
