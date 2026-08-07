import { describe, it, expect } from 'vitest';
import {
  cupMatchStatusKey,
  CUP_MATCH_STATUS_MESSAGE_KEY,
} from './cupMatchStatusLabel';

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
      notStarted: 'public.matchDraft',
    });
  });
});
