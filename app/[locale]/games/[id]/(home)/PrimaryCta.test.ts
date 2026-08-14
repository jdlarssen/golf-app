import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Wiring-tests for PrimaryCtaSection's completion counting (#1624 — third
 * surface of the #1577/#1538 pattern). The section is called as a plain async
 * function and the returned element's props are inspected — no render, so
 * this stays a logic test (the inner component's markup is untouched).
 *
 * The supabase mock EMULATES the query filters (eq/in on user_id, not on
 * strokes): the old code filtered `eq('user_id', viewer)` server-side, so a
 * mock that ignored filters would have handed the team's rows to the old
 * code too and the regression could never go RED.
 */

type Row = { hole_number: number; user_id: string; strokes: number | null };

function makeSupabase(rows: Row[]) {
  const captured: { inIds: string[] | null; eqUserId: string | null } = {
    inIds: null,
    eqUserId: null,
  };
  function builder() {
    let filtered = [...rows];
    const b = {
      select: () => b,
      eq: (col: string, val: string) => {
        if (col === 'user_id') {
          captured.eqUserId = val;
          filtered = filtered.filter((r) => r.user_id === val);
        }
        return b;
      },
      in: (col: string, vals: string[]) => {
        if (col === 'user_id') {
          captured.inIds = vals;
          filtered = filtered.filter((r) => vals.includes(r.user_id));
        }
        return b;
      },
      not: (col: string, op: string, val: unknown) => {
        if (col === 'strokes' && op === 'is' && val === null) {
          filtered = filtered.filter((r) => r.strokes != null);
        }
        return b;
      },
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
        Promise.resolve({ data: filtered, error: null }).then(resolve),
    };
    return b;
  }
  const client = {
    from: () => builder(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { client, captured };
}

let supabaseHolder: { client: unknown };
vi.mock('./gameContext', () => ({
  getGameContext: async () => ({
    supabase: supabaseHolder.client,
    userId: 'viewer',
  }),
}));
vi.mock('@/lib/games/segmentSibling', () => ({
  findSegmentSibling: vi.fn(async () => null),
}));

const VIEWER = 'b-viewer';
const CAPTAIN = 'a-captain'; // lex-min → owns the team rows

function rowsFor(userId: string, holes: number[]): Row[] {
  return holes.map((h) => ({ hole_number: h, user_id: userId, strokes: 4 }));
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

async function callSection(opts: {
  rows: Row[];
  gameMode: string;
  teamScoreOwnerId: string | null;
}) {
  const { PrimaryCtaSection } = await import('./PrimaryCta');
  const { client, captured } = makeSupabase(opts.rows);
  supabaseHolder = { client };
  const el = await PrimaryCtaSection({
    gameId: 'game-1',
    currentUserId: VIEWER,
    submittedAt: null,
    approvedAt: null,
    requirePeerApproval: false,
    holeSegment: 'full',
    tournamentId: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gameMode: opts.gameMode as any,
    teamScoreOwnerId: opts.teamScoreOwnerId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { props: (el as any).props, captured };
}

describe('PrimaryCtaSection completion counting (#1624)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('greensome non-captain with a complete team card reaches ready_to_submit', async () => {
    const { props, captured } = await callSection({
      rows: rowsFor(CAPTAIN, range(1, 18)),
      gameMode: 'greensome_matchplay',
      teamScoreOwnerId: CAPTAIN,
    });
    expect(captured.inIds).toEqual(expect.arrayContaining([VIEWER, CAPTAIN]));
    expect(props.state).toBe('ready_to_submit');
    expect(props.strokesCount).toBe(18);
  });

  it("patsome non-captain: captain's rows on the 4BBB half (1–6) do not mask a missing own hole", async () => {
    // Viewer tapped 1–5 (hole 6 missing); captain owns 1–18 (own 4BBB rows +
    // the shared foursomes rows). Hole 6 must count as MISSING and be the
    // next-hole target — a flat id-set would have counted the captain's row 6.
    const { props } = await callSection({
      rows: [...rowsFor(VIEWER, range(1, 5)), ...rowsFor(CAPTAIN, range(1, 18))],
      gameMode: 'patsome',
      teamScoreOwnerId: CAPTAIN,
    });
    expect(props.state).toBe('in_progress');
    expect(props.strokesCount).toBe(17); // own 1–5 + captain's 7–18
    expect(props.nextHole).toBe(6);
  });

  it('patsome non-captain with own 1–6 and captain 7–18 is complete', async () => {
    const { props } = await callSection({
      rows: [...rowsFor(VIEWER, range(1, 6)), ...rowsFor(CAPTAIN, range(7, 18))],
      gameMode: 'patsome',
      teamScoreOwnerId: CAPTAIN,
    });
    expect(props.state).toBe('ready_to_submit');
    expect(props.strokesCount).toBe(18);
  });

  it('solo mode (no team owner) counts own rows exactly as before', async () => {
    const { props, captured } = await callSection({
      rows: [...rowsFor(VIEWER, range(1, 17)), ...rowsFor(CAPTAIN, range(1, 18))],
      gameMode: 'solo_strokeplay',
      teamScoreOwnerId: null,
    });
    expect(props.state).toBe('in_progress');
    expect(props.strokesCount).toBe(17);
    expect(props.nextHole).toBe(18);
    // Solo asks only for the viewer's rows, whichever filter form is used.
    expect(captured.inIds ?? [captured.eqUserId]).toEqual(['b-viewer']);
  });
});
