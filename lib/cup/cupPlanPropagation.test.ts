import { describe, it, expect } from 'vitest';
import {
  planCupPlanPropagation,
  type StoredCupMatch,
} from './cupPlanPropagation';

/**
 * Type A-tester for #1523: hvilke lagrede cup-matcher som skal få Oppsett-
 * planens bane/tee/starttid, og hvilken starttid hver av dem skal ha.
 *
 * Fasiten er genereringen (`createCupMatchesFromPlan` +
 * `generateSplitDayPlan`): en propagert match skal ende med NØYAKTIG samme
 * felt som en nygenerert match med samme plan ville fått. Testene under er
 * derfor skrevet mot genereringens observerbare output, ikke mot
 * implementasjonen her.
 */

const PLAN = {
  courseId: 'course-new',
  teeBoxId: 'tee-new',
  scheduledTeeOffAt: '2026-09-01T08:00:00.000Z',
};

/** Én lagret rad; overstyr det testen faktisk handler om. */
function match(overrides: Partial<StoredCupMatch> & { id: string }): StoredCupMatch {
  return {
    status: 'scheduled',
    sourceGameId: null,
    matchLabel: null,
    holeSegment: 'full',
    ...overrides,
  };
}

/**
 * De fire radene genereringen skriver for én splittet-cup-dag-flight:
 * greensome-host (front9), best-ball-host (back9) og to avledede singles som
 * peker på best-ball-hosten. Label-nummeret følger genereringens per-format-
 * teller: hostene teller én per flight, singles to.
 */
function flightRows(flightIndex: number): StoredCupMatch[] {
  const bestBallId = `bb-${flightIndex}`;
  return [
    match({
      id: `gs-${flightIndex}`,
      matchLabel: `Greensome ${flightIndex}`,
      holeSegment: 'front9',
    }),
    match({
      id: bestBallId,
      matchLabel: `Best ball ${flightIndex}`,
      holeSegment: 'back9',
    }),
    match({
      id: `s-${flightIndex}-a`,
      matchLabel: `Singel ${flightIndex * 2 - 1}`,
      holeSegment: 'back9',
      sourceGameId: bestBallId,
    }),
    match({
      id: `s-${flightIndex}-b`,
      matchLabel: `Singel ${flightIndex * 2}`,
      holeSegment: 'back9',
      sourceGameId: bestBallId,
    }),
  ];
}

describe('planCupPlanPropagation', () => {
  it('ingen genererte matcher: tom liste (stille no-op, ikke en feil)', () => {
    expect(planCupPlanPropagation([], PLAN)).toEqual([]);
  });

  it('alle scheduled: hver match får planens bane, tee og starttid', () => {
    const updates = planCupPlanPropagation(
      [
        match({ id: 'g1', matchLabel: 'Singel 1' }),
        match({ id: 'g2', matchLabel: 'Singel 2' }),
      ],
      PLAN,
    );

    expect(updates).toEqual([
      {
        gameId: 'g1',
        courseId: 'course-new',
        teeBoxId: 'tee-new',
        scheduledTeeOffAt: '2026-09-01T08:00:00.000Z',
      },
      {
        gameId: 'g2',
        courseId: 'course-new',
        teeBoxId: 'tee-new',
        scheduledTeeOffAt: '2026-09-01T08:00:00.000Z',
      },
    ]);
  });

  it('blandet status: kun scheduled-radene er med — active og finished røres aldri', () => {
    const updates = planCupPlanPropagation(
      [
        match({ id: 'sched', matchLabel: 'Singel 1' }),
        match({ id: 'act', matchLabel: 'Singel 2', status: 'active' }),
        match({ id: 'fin', matchLabel: 'Singel 3', status: 'finished' }),
        match({ id: 'utkast', matchLabel: 'Singel 4', status: 'draft' }),
      ],
      PLAN,
    );

    expect(updates.map((u) => u.gameId)).toEqual(['sched']);
  });

  it('splittet cup-dag: flight 1 får cup-start, flight 2 ti minutter etter', () => {
    const updates = planCupPlanPropagation(
      [...flightRows(1), ...flightRows(2)],
      PLAN,
    );

    const teeOffById = new Map(updates.map((u) => [u.gameId, u.scheduledTeeOffAt]));
    expect(teeOffById.get('gs-1')).toBe('2026-09-01T08:00:00.000Z');
    expect(teeOffById.get('bb-1')).toBe('2026-09-01T08:00:00.000Z');
    expect(teeOffById.get('gs-2')).toBe('2026-09-01T08:10:00.000Z');
    expect(teeOffById.get('bb-2')).toBe('2026-09-01T08:10:00.000Z');
  });

  it('avledet singles arver hostens flight-tid — aldri sitt eget label-nummer', () => {
    // «Singel 3»/«Singel 4» ligger i flight 2: leses label-nummeret rått, ville
    // de fått base + 20 min i stedet for hostens base + 10 min.
    const updates = planCupPlanPropagation(
      [...flightRows(1), ...flightRows(2)],
      PLAN,
    );

    const teeOffById = new Map(updates.map((u) => [u.gameId, u.scheduledTeeOffAt]));
    expect(teeOffById.get('s-1-a')).toBe('2026-09-01T08:00:00.000Z');
    expect(teeOffById.get('s-1-b')).toBe('2026-09-01T08:00:00.000Z');
    expect(teeOffById.get('s-2-a')).toBe('2026-09-01T08:10:00.000Z');
    expect(teeOffById.get('s-2-b')).toBe('2026-09-01T08:10:00.000Z');
  });

  it('avledet match får samme bane og tee som hosten', () => {
    const updates = planCupPlanPropagation(flightRows(2), PLAN);

    const host = updates.find((u) => u.gameId === 'bb-2');
    const derived = updates.find((u) => u.gameId === 's-2-a');
    expect(derived).toEqual({ ...host, gameId: 's-2-a' });
  });

  it('avledet match hvis host er startet: hosten står, den avledede får ny tid', () => {
    const rows = flightRows(2).map((m) =>
      m.id === 'bb-2' ? { ...m, status: 'active' as const } : m,
    );
    const updates = planCupPlanPropagation(rows, PLAN);

    expect(updates.map((u) => u.gameId)).not.toContain('bb-2');
    expect(updates.find((u) => u.gameId === 's-2-a')?.scheduledTeeOffAt).toBe(
      '2026-09-01T08:10:00.000Z',
    );
  });

  it('eldre preset uten flight-konsept: alle matcher deler ren base-tid', () => {
    const updates = planCupPlanPropagation(
      [
        match({ id: 'g1', matchLabel: 'Foursome 1' }),
        match({ id: 'g2', matchLabel: 'Foursome 2' }),
        match({ id: 'g3', matchLabel: 'Singel 7' }),
      ],
      PLAN,
    );

    for (const u of updates) {
      expect(u.scheduledTeeOffAt).toBe('2026-09-01T08:00:00.000Z');
    }
  });

  it('planens starttid tømmes: hver match får NULL (auto-start av)', () => {
    const updates = planCupPlanPropagation(
      [...flightRows(1), ...flightRows(2)],
      { ...PLAN, scheduledTeeOffAt: null },
    );

    expect(updates).toHaveLength(8);
    for (const u of updates) {
      expect(u.scheduledTeeOffAt).toBeNull();
    }
  });

  it('bunt-host uten tall i labelen: ren base-tid, aldri en gjettet forskyvning', () => {
    const updates = planCupPlanPropagation(
      [
        match({ id: 'rar', matchLabel: 'Greensome', holeSegment: 'front9' }),
        match({ id: 'tom', matchLabel: null, holeSegment: 'back9' }),
      ],
      PLAN,
    );

    for (const u of updates) {
      expect(u.scheduledTeeOffAt).toBe('2026-09-01T08:00:00.000Z');
    }
  });

  it('avledet rad uten host i settet: ren base-tid (defensivt, FK hindrer det)', () => {
    const updates = planCupPlanPropagation(
      [match({ id: 'foreldreløs', matchLabel: 'Singel 3', holeSegment: 'back9', sourceGameId: 'borte' })],
      PLAN,
    );

    expect(updates[0].scheduledTeeOffAt).toBe('2026-09-01T08:00:00.000Z');
  });

  it('idempotent: to like lagringer gir identisk oppdaterings-sett', () => {
    const rows = [...flightRows(1), ...flightRows(2)];
    expect(planCupPlanPropagation(rows, PLAN)).toEqual(
      planCupPlanPropagation(rows, PLAN),
    );
  });
});
