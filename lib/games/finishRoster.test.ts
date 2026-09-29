import { describe, it, expect } from 'vitest';
import { finishRoster } from './finishRoster';

/**
 * #2284: the admin finish page counted withdrawn players as «mangler levering»
 * and offered them as LD/CTP winners. The rule «withdrawn players are out» now
 * has one home on web; these cases lock it (Type A).
 */

type Row = { user_id: string; submitted_at: string | null; withdrawn_at: string | null };

const row = (
  user_id: string,
  submitted: boolean,
  withdrawn: boolean,
): Row => ({
  user_id,
  submitted_at: submitted ? '2026-09-29T10:00:00Z' : null,
  withdrawn_at: withdrawn ? '2026-09-29T11:00:00Z' : null,
});

const ids = (rows: readonly Row[]) => rows.map((r) => r.user_id);

describe('finishRoster (#2284)', () => {
  it('(a) a withdrawn player who never submitted is neither active nor missing', () => {
    const { active, missing } = finishRoster([row('wd', false, true)]);
    expect(ids(active)).toEqual([]);
    expect(ids(missing)).toEqual([]);
  });

  it('(b) a withdrawn player who submitted is not active', () => {
    const { active, missing } = finishRoster([row('wd', true, true)]);
    expect(ids(active)).toEqual([]);
    expect(ids(missing)).toEqual([]);
  });

  it('(c) an active non-submitter is in both lists; an active submitter only in active', () => {
    const { active, missing } = finishRoster([
      row('open', false, false),
      row('done', true, false),
    ]);
    expect(ids(active)).toEqual(['open', 'done']);
    expect(ids(missing)).toEqual(['open']);
  });

  it('keeps the caller’s row shape and order in a mixed roster', () => {
    const rows = [
      { ...row('a', true, false), name: 'A' },
      { ...row('b', false, true), name: 'B' },
      { ...row('c', false, false), name: 'C' },
    ];
    const { active, missing } = finishRoster(rows);
    expect(active.map((r) => r.name)).toEqual(['A', 'C']);
    expect(missing.map((r) => r.name)).toEqual(['C']);
  });

  it('an empty roster gives two empty lists', () => {
    expect(finishRoster([])).toEqual({ active: [], missing: [] });
  });
});
