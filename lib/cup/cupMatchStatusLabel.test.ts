import { describe, it, expect } from 'vitest';
import {
  cupMatchStatusKey,
  cupMatchStatusValues,
  CUP_MATCH_STATUS_MESSAGE_KEY,
} from './cupMatchStatusLabel';
import type { CupMatchWithdrawal } from './cupWithdrawalOutcome';

describe('cupMatchStatusKey', () => {
  it('finished → played, regardless of submissions', () => {
    expect(cupMatchStatusKey({ status: 'finished', allScorecardsSubmitted: false })).toBe('played');
    expect(cupMatchStatusKey({ status: 'finished', allScorecardsSubmitted: true })).toBe('played');
  });

  it('active + all submitted → scorecardsSubmitted', () => {
    expect(cupMatchStatusKey({ status: 'active', allScorecardsSubmitted: true })).toBe('scorecardsSubmitted');
  });

  it('active + not all submitted → inProgress', () => {
    expect(cupMatchStatusKey({ status: 'active', allScorecardsSubmitted: false })).toBe('inProgress');
  });

  it('draft/scheduled → notStarted, regardless of submissions', () => {
    expect(cupMatchStatusKey({ status: 'draft', allScorecardsSubmitted: false })).toBe('notStarted');
    expect(cupMatchStatusKey({ status: 'scheduled', allScorecardsSubmitted: true })).toBe('notStarted');
  });
});

describe('CUP_MATCH_STATUS_MESSAGE_KEY', () => {
  it('maps every status key to a cup-namespaced message key', () => {
    expect(CUP_MATCH_STATUS_MESSAGE_KEY).toEqual({
      played: 'public.matchPlayed',
      scorecardsSubmitted: 'public.matchScorecardsSubmitted',
      inProgress: 'public.matchInProgress',
      decidedHalved: 'public.matchDecidedHalved',
      decidedWalkover: 'public.matchDecidedWalkover',
      notStarted: 'public.matchDraft',
    });
  });
});

// #1814: en kamp avgjort ved trekk står fortsatt `scheduled` i DB-en — uten en
// egen status-nøkkel ville den vist «Ikke startet» for alltid.
describe('cupMatchStatusKey — avgjort ved trekk (#1814)', () => {
  const halved: CupMatchWithdrawal = {
    outcome: 'halved',
    winnerSide: 'tied',
    withdrawnSide: 1,
    withdrawnUserIds: ['p1'],
    late: false,
  };
  const walkover: CupMatchWithdrawal = {
    outcome: 'walkover',
    winnerSide: 2,
    withdrawnSide: 1,
    withdrawnUserIds: ['p1', 'p2'],
    late: true,
  };

  it('scheduled + halvert → decidedHalved', () => {
    expect(
      cupMatchStatusKey({
        status: 'scheduled',
        allScorecardsSubmitted: false,
        withdrawal: halved,
      }),
    ).toBe('decidedHalved');
  });

  it('scheduled + walkover → decidedWalkover', () => {
    expect(
      cupMatchStatusKey({
        status: 'scheduled',
        allScorecardsSubmitted: false,
        withdrawal: walkover,
      }),
    ).toBe('decidedWalkover');
  });

  it('lar «Spilt» og «Pågår» gå foran — de er ikke avgjort ved trekk', () => {
    expect(
      cupMatchStatusKey({ status: 'finished', allScorecardsSubmitted: true, withdrawal: halved }),
    ).toBe('played');
    expect(
      cupMatchStatusKey({ status: 'active', allScorecardsSubmitted: false, withdrawal: halved }),
    ).toBe('inProgress');
  });

  it('faller til notStarted uten trekk', () => {
    expect(
      cupMatchStatusKey({ status: 'scheduled', allScorecardsSubmitted: false, withdrawal: null }),
    ).toBe('notStarted');
  });
});

describe('cupMatchStatusValues (#1814)', () => {
  const opts = {
    nameOf: (uid: string) => ({ p1: 'Per', p2: 'Pål' })[uid] ?? uid,
    team1Name: 'Lag Skog',
    team2Name: 'Lag Sjø',
  };

  it('gir tomme verdier for en kamp uten trekk', () => {
    expect(cupMatchStatusValues({ withdrawal: null }, opts)).toEqual({ name: '', team: '' });
  });

  it('joiner flere trukne med skråstrek og lar laget stå tomt ved halvert', () => {
    expect(
      cupMatchStatusValues(
        {
          withdrawal: {
            outcome: 'halved',
            winnerSide: 'tied',
            withdrawnSide: 1,
            withdrawnUserIds: ['p1', 'p2'],
            late: false,
          },
        },
        opts,
      ),
    ).toEqual({ name: 'Per/Pål', team: '' });
  });

  it('navngir vinnerlaget ved walkover', () => {
    expect(
      cupMatchStatusValues(
        {
          withdrawal: {
            outcome: 'walkover',
            winnerSide: 2,
            withdrawnSide: 1,
            withdrawnUserIds: ['p1'],
            late: true,
          },
        },
        opts,
      ),
    ).toEqual({ name: 'Per', team: 'Lag Sjø' });
  });
});
