import { describe, it, expect } from 'vitest';
import {
  oppositeSegmentHalf,
  isSegmentSiblingCandidate,
  pickSiblingCandidate,
} from './segmentSibling';
import { candidatesOnSameSplitDay } from './splitDayPairing';

// Type A per docs/test-discipline.md — ren utvalgs-logikk (#1441 finding B).
describe('oppositeSegmentHalf', () => {
  it('front9 → back9', () => {
    expect(oppositeSegmentHalf('front9')).toBe('back9');
  });
  it('back9 → front9', () => {
    expect(oppositeSegmentHalf('back9')).toBe('front9');
  });
});

describe('isSegmentSiblingCandidate', () => {
  it('true for en front9-host med tournament', () => {
    expect(
      isSegmentSiblingCandidate({
        holeSegment: 'front9',
        sourceGameId: null,
        tournamentId: 't1',
      }),
    ).toBe(true);
  });

  it('true for en back9-host med tournament', () => {
    expect(
      isSegmentSiblingCandidate({
        holeSegment: 'back9',
        sourceGameId: null,
        tournamentId: 't1',
      }),
    ).toBe(true);
  });

  it('false for full-segment spill (ordinær cup/enkeltspill)', () => {
    expect(
      isSegmentSiblingCandidate({
        holeSegment: 'full',
        sourceGameId: null,
        tournamentId: 't1',
      }),
    ).toBe(false);
  });

  it('false for et avledet spill (source_game_id satt) — ingen egen entry-flate', () => {
    expect(
      isSegmentSiblingCandidate({
        holeSegment: 'front9',
        sourceGameId: 'host-1',
        tournamentId: 't1',
      }),
    ).toBe(false);
  });

  it('false uten tournament_id (ikke en cup-match)', () => {
    expect(
      isSegmentSiblingCandidate({
        holeSegment: 'front9',
        sourceGameId: null,
        tournamentId: null,
      }),
    ).toBe(false);
  });
});

describe('pickSiblingCandidate', () => {
  it('null når det ikke finnes kandidater', () => {
    expect(
      pickSiblingCandidate([], [
        { game_id: 'g1', submitted_at: null, team_number: null },
      ]),
    ).toBeNull();
  });

  it('null når brukeren ikke er aktiv spiller i noen kandidat', () => {
    const candidates = [{ id: 'back9-a', game_mode: 'best_ball' as const }];
    expect(pickSiblingCandidate(candidates, [])).toBeNull();
  });

  it('plukker kandidaten brukeren faktisk er aktiv spiller i, med submitted_at + team_number', () => {
    const candidates = [
      { id: 'back9-a', game_mode: 'best_ball' as const },
      { id: 'back9-b', game_mode: 'best_ball' as const },
    ];
    expect(
      pickSiblingCandidate(candidates, [
        { game_id: 'back9-b', submitted_at: null, team_number: 2 },
      ]),
    ).toEqual({
      id: 'back9-b',
      game_mode: 'best_ball',
      submitted_at: null,
      team_number: 2,
    });
  });

  it('#1466: bærer med søsterspillets submitted_at (levert søsken)', () => {
    const candidates = [{ id: 'front9-a', game_mode: 'greensome_matchplay' as const }];
    expect(
      pickSiblingCandidate(candidates, [
        { game_id: 'front9-a', submitted_at: '2026-08-07T10:00:00Z', team_number: 1 },
      ]),
    ).toEqual({
      id: 'front9-a',
      game_mode: 'greensome_matchplay',
      submitted_at: '2026-08-07T10:00:00Z',
      team_number: 1,
    });
  });

  it('ignorerer medlemskap som ikke matcher noen kandidat (defensivt)', () => {
    const candidates = [{ id: 'back9-a', game_mode: 'best_ball' as const }];
    expect(
      pickSiblingCandidate(candidates, [
        { game_id: 'some-other-game', submitted_at: null, team_number: null },
      ]),
    ).toBeNull();
  });
});

// #1449 finding 1: findSegmentSibling day-scopes its opposite-half candidates so
// a two-day cup (one tournament_id spanning day-1 and day-2 hosts) never resolves
// the wrong day's host. The pure day-rule (shared with the admin reminder batch)
// is candidatesOnSameSplitDay; these lock its behaviour.
describe('candidatesOnSameSplitDay (segment-sibling day-scope)', () => {
  const DAY1 = {
    scheduled_tee_off_at: '2026-06-12T08:00:00Z',
    created_at: '2026-06-12T07:00:00Z',
  };
  const DAY2 = {
    scheduled_tee_off_at: '2026-06-13T08:00:00Z',
    created_at: '2026-06-13T07:00:00Z',
  };

  it('a day-2 source resolves the day-2 sibling, never the day-1 host', () => {
    const source = { id: 'front9-day2', ...DAY2 };
    const candidates = [
      { id: 'back9-day1', ...DAY1 },
      { id: 'back9-day2', ...DAY2 },
    ];
    expect(
      candidatesOnSameSplitDay(source, candidates).map((c) => c.id),
    ).toEqual(['back9-day2']);
  });

  it('a source with no anchor (no tee-off, no created_at) resolves nothing', () => {
    const source = { scheduled_tee_off_at: null, created_at: null };
    const candidates = [{ id: 'back9-day1', ...DAY1 }];
    expect(candidatesOnSameSplitDay(source, candidates)).toEqual([]);
  });

  it('falls back to created_at when scheduled_tee_off_at is null (same physical day)', () => {
    const source = { scheduled_tee_off_at: null, created_at: '2026-06-12T09:00:00Z' };
    const candidates = [
      { id: 'back9-day1', scheduled_tee_off_at: null, created_at: '2026-06-12T09:05:00Z' },
      { id: 'back9-day2', ...DAY2 },
    ];
    expect(
      candidatesOnSameSplitDay(source, candidates).map((c) => c.id),
    ).toEqual(['back9-day1']);
  });

  it('drops a candidate that cannot be anchored', () => {
    const source = { id: 'front9', ...DAY1 };
    const candidates = [
      { id: 'anchorless', scheduled_tee_off_at: null, created_at: null },
      { id: 'back9-day1', ...DAY1 },
    ];
    expect(
      candidatesOnSameSplitDay(source, candidates).map((c) => c.id),
    ).toEqual(['back9-day1']);
  });
});
