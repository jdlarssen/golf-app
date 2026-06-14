import { describe, expect, it } from 'vitest';
import {
  filterRosterCandidates,
  rosterDisplayName,
  type RosterCandidate,
} from './rosterCandidates';

describe('rosterDisplayName', () => {
  it.each<[Omit<RosterCandidate, 'id'>, string]>([
    [{ name: 'Ola Nordmann', nickname: null, email: 'ola@x.no' }, 'Ola Nordmann'],
    [{ name: 'Ola', nickname: 'Bomber', email: 'ola@x.no' }, 'Ola «Bomber»'],
    [{ name: null, nickname: null, email: 'ola@x.no' }, 'ola@x.no'],
    [{ name: null, nickname: 'Bomber', email: 'ola@x.no' }, 'ola@x.no «Bomber»'],
  ])('%o → %s', (over, expected) => {
    expect(rosterDisplayName({ id: '1', ...over })).toBe(expected);
  });
});

describe('filterRosterCandidates', () => {
  const list: RosterCandidate[] = [
    { id: '1', name: 'Ola Nordmann', nickname: null, email: 'ola@x.no' },
    { id: '2', name: 'Kari', nickname: 'Birdie', email: 'kari@y.no' },
    { id: '3', name: null, nickname: null, email: 'per@z.no' },
  ];

  it('blank search returns all up to the limit', () => {
    expect(filterRosterCandidates(list, '   ').map((c) => c.id)).toEqual(['1', '2', '3']);
  });

  it('matches name, nickname and email case-insensitively', () => {
    expect(filterRosterCandidates(list, 'NORDMANN').map((c) => c.id)).toEqual(['1']);
    expect(filterRosterCandidates(list, 'birdie').map((c) => c.id)).toEqual(['2']);
    expect(filterRosterCandidates(list, 'per@z').map((c) => c.id)).toEqual(['3']);
  });

  it('caps results to the limit', () => {
    expect(filterRosterCandidates(list, '', 2)).toHaveLength(2);
  });

  it('preserves extra fields (e.g. hcpIndex) via the generic type', () => {
    const withHcp = [
      { id: '1', name: 'Ola', nickname: null, email: 'o@x.no', hcpIndex: 12.3 },
    ];
    expect(filterRosterCandidates(withHcp, 'ola')[0].hcpIndex).toBe(12.3);
  });
});
