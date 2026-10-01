import { describe, it, expect } from 'vitest';
import {
  finishGate,
  needsPeerApproval,
  splitFinishRoster,
  stampsFromRow,
  type FinishStamps,
} from './finishGate';

/**
 * #2222: the finish gate has one home. The web core (`endGameCore`), the four
 * web finish surfaces and the app (`finishRound`, `buildFinishPlan`) all read
 * this module, so its rules are tested here once (Type A).
 */

const SUBMITTED = '2026-09-01T09:00:00.000Z';
const APPROVED = '2026-09-01T09:30:00.000Z';
const WITHDRAWN = '2026-09-01T10:00:00.000Z';

type Player = { id: string } & FinishStamps;

const p = (id: string, stamps: Partial<FinishStamps> = {}): Player => ({
  id,
  submittedAt: SUBMITTED,
  approvedAt: APPROVED,
  withdrawnAt: null,
  ...stamps,
});

const self = (player: Player): FinishStamps => player;
const names = (players: readonly Player[]) => players.map((player) => player.id);

const GATE = { requirePeerApproval: false, allowMissing: false };
const PEER = { requirePeerApproval: true, allowMissing: false };

describe('needsPeerApproval', () => {
  it.each([
    ['levert og godkjent', SUBMITTED, APPROVED, false],
    ['levert, ikke godkjent', SUBMITTED, null, true],
    ['verken levert eller godkjent', null, null, false],
    // Uoppnåelig i dag (`reopenScorecard` nuller begge sammen), men fail-closed
    // for en fremtidig sti som bare nuller den ene halvdelen.
    ['godkjent uten levering', null, APPROVED, true],
  ] as [string, string | null, string | null, boolean][])(
    'svarer %s → %s',
    (_label, submittedAt, approvedAt, expected) => {
      expect(needsPeerApproval(submittedAt, approvedAt)).toBe(expected);
    },
  );
});

describe('finishGate', () => {
  it('an empty roster is no_players', () => {
    expect(finishGate([], self, GATE)).toEqual({ ok: false, reason: 'no_players' });
  });

  it('a roster where everyone withdrew can be finished (raw rows count)', () => {
    const roster = [
      p('a', { withdrawnAt: WITHDRAWN, submittedAt: null, approvedAt: null }),
      p('b', { withdrawnAt: WITHDRAWN }),
    ];
    expect(finishGate(roster, self, PEER)).toEqual({ ok: true });
  });

  it('one player without a delivery blocks, unless allowMissing', () => {
    const roster = [p('a'), p('b', { submittedAt: null, approvedAt: null })];
    expect(finishGate(roster, self, GATE)).toEqual({
      ok: false,
      reason: 'not_all_submitted',
      blocked: [roster[1]],
    });
    expect(finishGate(roster, self, { ...GATE, allowMissing: true })).toEqual({
      ok: true,
    });
  });

  it('delivered but not approved blocks under peer approval, with or without allowMissing', () => {
    const roster = [p('a'), p('b', { approvedAt: null })];
    for (const allowMissing of [false, true]) {
      expect(finishGate(roster, self, { ...PEER, allowMissing })).toEqual({
        ok: false,
        reason: 'not_all_approved',
        blocked: [roster[1]],
      });
    }
  });

  it('without peer approval, a missing approval never blocks', () => {
    const roster = [p('a', { approvedAt: null })];
    expect(finishGate(roster, self, GATE)).toEqual({ ok: true });
  });

  it('approved but not delivered blocks under allowMissing (fail-closed)', () => {
    const roster = [p('a'), p('b', { submittedAt: null })];
    expect(finishGate(roster, self, { ...PEER, allowMissing: true })).toEqual({
      ok: false,
      reason: 'not_all_approved',
      blocked: [roster[1]],
    });
  });

  it('a withdrawn player never blocks, neither as undelivered nor as unapproved', () => {
    const roster = [
      p('a'),
      p('wd-open', { withdrawnAt: WITHDRAWN, submittedAt: null, approvedAt: null }),
      p('wd-unapproved', { withdrawnAt: WITHDRAWN, approvedAt: null }),
      p('wd-approved-only', { withdrawnAt: WITHDRAWN, submittedAt: null }),
    ];
    expect(finishGate(roster, self, PEER)).toEqual({ ok: true });
  });

  it('roster order picks the reason, and blocked collects every player with it', () => {
    const open1 = p('open-1', { submittedAt: null, approvedAt: null });
    const open2 = p('open-2', { submittedAt: null, approvedAt: null });
    const pending = p('pending', { approvedAt: null });

    expect(finishGate([open1, pending, open2], self, PEER)).toEqual({
      ok: false,
      reason: 'not_all_submitted',
      blocked: [open1, open2],
    });
    expect(finishGate([pending, open1, open2], self, PEER)).toEqual({
      ok: false,
      reason: 'not_all_approved',
      blocked: [pending],
    });
  });

  it('reads snake_case rows through stampsFromRow', () => {
    const rows = [
      { user_id: 'a', submitted_at: SUBMITTED, approved_at: null, withdrawn_at: null },
    ];
    expect(finishGate(rows, stampsFromRow, PEER)).toEqual({
      ok: false,
      reason: 'not_all_approved',
      blocked: [rows[0]],
    });
  });
});

describe('splitFinishRoster', () => {
  it('withdrawn players are out of all three lists', () => {
    const roster = [
      p('wd-open', { withdrawnAt: WITHDRAWN, submittedAt: null, approvedAt: null }),
      p('wd-unapproved', { withdrawnAt: WITHDRAWN, approvedAt: null }),
    ];
    expect(splitFinishRoster(roster, self, true)).toEqual({
      active: [],
      missing: [],
      unapproved: [],
    });
  });

  it('unapproved lists the pending approvals only under peer approval', () => {
    const roster = [p('done'), p('pending', { approvedAt: null })];
    expect(names(splitFinishRoster(roster, self, true).unapproved)).toEqual(['pending']);
    expect(splitFinishRoster(roster, self, false).unapproved).toEqual([]);
  });
});

/**
 * #2284: the admin finish page counted withdrawn players as «mangler levering»
 * and offered them as LD/CTP winners. The rule «withdrawn players are out» now
 * has one home on web; these cases lock it (Type A). Moved here from
 * `finishRoster.test.ts` when `finishRoster` became `splitFinishRoster` (#2222).
 */

type Row = {
  user_id: string;
  submitted_at: string | null;
  approved_at: string | null;
  withdrawn_at: string | null;
};

const row = (
  user_id: string,
  submitted: boolean,
  withdrawn: boolean,
): Row => ({
  user_id,
  submitted_at: submitted ? '2026-09-29T10:00:00Z' : null,
  approved_at: null,
  withdrawn_at: withdrawn ? '2026-09-29T11:00:00Z' : null,
});

const ids = (rows: readonly Row[]) => rows.map((r) => r.user_id);

// The old helper's two lists, read through the new one; the assertions below
// are the original ones.
const finishRoster = <T extends Row>(rows: readonly T[]) => {
  const { active, missing } = splitFinishRoster(rows, stampsFromRow, false);
  return { active, missing };
};

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
