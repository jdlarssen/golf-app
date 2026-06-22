import { describe, it, expect } from 'vitest';
import { resolveActiveCardState, type ActiveCardState } from './activeCardState';

describe('resolveActiveCardState', () => {
  it.each<[string, Parameters<typeof resolveActiveCardState>[0], ActiveCardState]>([
    [
      'fresh active round',
      { submitted_at: null, withdrawn_at: null, approved_at: null, require_peer_approval: false },
      'continue',
    ],
    [
      'submitted, no peer approval needed',
      { submitted_at: 't', withdrawn_at: null, approved_at: null, require_peer_approval: false },
      'submitted',
    ],
    [
      'submitted, peer approval required but not yet given',
      { submitted_at: 't', withdrawn_at: null, approved_at: null, require_peer_approval: true },
      'pending_approval',
    ],
    [
      'submitted, peer approval required and granted',
      { submitted_at: 't', withdrawn_at: null, approved_at: 't', require_peer_approval: true },
      'submitted',
    ],
    [
      'withdrawn before submitting',
      { submitted_at: null, withdrawn_at: 't', approved_at: null, require_peer_approval: false },
      'withdrawn',
    ],
    [
      'withdrawn wins over an earlier submission',
      { submitted_at: 't', withdrawn_at: 't', approved_at: null, require_peer_approval: true },
      'withdrawn',
    ],
  ])('%s → %s', (_label, row, expected) => {
    expect(resolveActiveCardState(row)).toBe(expected);
  });
});
