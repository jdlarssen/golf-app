import { describe, it, expect } from 'vitest';
import { buildSocialProof } from './socialProof';

/**
 * Type A — pure core of the join-funnel social-proof signal (#1193).
 *
 * `buildSocialProof` owns every rule the contract calls hard: the viewer is
 * excluded from both the count and the friend names, only mutual friends who
 * are actually on the roster surface as names, and the 0-joined case yields a
 * line that renders nothing. No DB, no i18n — just the shaping.
 */

// Deterministic display-name lookup for the tests. Ids map to already
// public-formatted names («Ola N.»-style); an id absent from the map (or
// mapped to null) models a roster member with no resolvable name.
const NAMES: Record<string, string | null> = {
  jonas: 'Jonas',
  kari: 'Kari',
  ola: 'Ola',
  per: 'Per',
  nils: 'Nils',
  ghost: null,
};
const nameOf = (id: string): string | null => NAMES[id] ?? null;

describe('buildSocialProof (#1193)', () => {
  it('empty roster → nothing', () => {
    expect(buildSocialProof([], ['jonas'], 'me', nameOf)).toEqual({
      joinedCount: 0,
      knownFriendNames: [],
      knownFriendOverflow: 0,
    });
  });

  it('viewer is the only one joined → count excludes self → nothing', () => {
    expect(buildSocialProof(['me'], ['jonas'], 'me', nameOf)).toEqual({
      joinedCount: 0,
      knownFriendNames: [],
      knownFriendOverflow: 0,
    });
  });

  it('many joined, no mutual friends → aggregate count only', () => {
    const r = buildSocialProof(['ola', 'per', 'nils'], [], 'me', nameOf);
    expect(r.joinedCount).toBe(3);
    expect(r.knownFriendNames).toEqual([]);
    expect(r.knownFriendOverflow).toBe(0);
  });

  it('one mutual friend joined → single name, no overflow', () => {
    const r = buildSocialProof(['jonas', 'ola'], ['jonas'], 'me', nameOf);
    expect(r.joinedCount).toBe(2);
    expect(r.knownFriendNames).toEqual(['Jonas']);
    expect(r.knownFriendOverflow).toBe(0);
  });

  it('exactly two mutual friends joined → both names, no overflow', () => {
    const r = buildSocialProof(['jonas', 'kari', 'ola'], ['jonas', 'kari'], 'me', nameOf);
    expect(r.knownFriendNames).toEqual(['Jonas', 'Kari']);
    expect(r.knownFriendOverflow).toBe(0);
  });

  it('three+ mutual friends joined → one name + overflow of the rest', () => {
    const r = buildSocialProof(
      ['jonas', 'kari', 'per', 'ola'],
      ['jonas', 'kari', 'per'],
      'me',
      nameOf,
    );
    expect(r.knownFriendNames).toEqual(['Jonas']);
    expect(r.knownFriendOverflow).toBe(2);
    expect(r.joinedCount).toBe(4);
  });

  it('duplicate roster ids are counted once', () => {
    const r = buildSocialProof(['ola', 'ola', 'per'], [], 'me', nameOf);
    expect(r.joinedCount).toBe(2);
  });

  it('friends not on the roster (and pending, never in friendIds) are ignored', () => {
    // `nils` is a mutual friend but not registered; `kari` is registered but
    // not a friend. Only the intersection counts as a name.
    const r = buildSocialProof(['jonas', 'kari'], ['jonas', 'nils'], 'me', nameOf);
    expect(r.knownFriendNames).toEqual(['Jonas']);
    expect(r.knownFriendOverflow).toBe(0);
  });

  it('anonymous viewer (null) → count only, never names', () => {
    const r = buildSocialProof(['jonas', 'kari'], ['jonas'], null, nameOf);
    expect(r.joinedCount).toBe(2);
    expect(r.knownFriendNames).toEqual([]);
    expect(r.knownFriendOverflow).toBe(0);
  });

  it('a friend on the roster with no resolvable name drops out of names', () => {
    const r = buildSocialProof(['ghost', 'ola'], ['ghost'], 'me', nameOf);
    expect(r.joinedCount).toBe(2);
    expect(r.knownFriendNames).toEqual([]);
  });

  it('friend names are sorted deterministically (nb)', () => {
    const r = buildSocialProof(['kari', 'jonas'], ['kari', 'jonas'], 'me', nameOf);
    expect(r.knownFriendNames).toEqual(['Jonas', 'Kari']);
  });

  it('accepts a Set of friend ids as well as an array', () => {
    const r = buildSocialProof(['jonas'], new Set(['jonas']), 'me', nameOf);
    expect(r.knownFriendNames).toEqual(['Jonas']);
  });
});
