import { describe, expect, it } from 'vitest';
import { parseCupBatchMatches } from './parseCupBatchMatches';

/** Type A (#2752): en håndlaget kropp stoppes før kjernen, og bare planens felt slipper gjennom. */

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const match = (over: Record<string, unknown> = {}) => ({
  id: 'singles_matchplay-1',
  format: 'singles_matchplay',
  label: 'Singel 1',
  side1: [A],
  side2: [B],
  segment: 'full',
  ...over,
});

describe('parseCupBatchMatches', () => {
  it('slipper en plan gjennom, uten felt planen ikke har', () => {
    const [parsed] = parseCupBatchMatches([match({ created_by: B, group_id: 'x' })]) ?? [];
    expect(parsed).toEqual(match());
  });

  it('beholder delt dags felt', () => {
    const body = match({
      format: 'greensome_matchplay',
      segment: 'front9',
      flightIndex: 1,
      sourceId: 'best_ball-1',
      teamStrokesOverride: { team1: 3, team2: 4 },
    });
    expect(parseCupBatchMatches([body])).toEqual([body]);
  });

  it('en tom liste er en liste: kjernen svarer no_matches', () => {
    expect(parseCupBatchMatches([])).toEqual([]);
  });

  it.each([
    ['ikke en liste', { id: 'x' }],
    ['manglende spillere', [match({ side1: [] })]],
    ['for mange på en side', [match({ side2: [A, B, A] })]],
    ['spiller som ikke er en id', [match({ side1: ['x'] })]],
    ['ukjent format', [match({ format: 'stableford' })]],
    ['ukjent segment', [match({ segment: 'back6' })]],
    ['tom match-id', [match({ id: '' })]],
    ['label som ikke er tekst', [match({ label: 7 })]],
    ['flight som ikke er et heltall', [match({ flightIndex: 1.5 })]],
    ['en rad som ikke er et objekt', ['singel']],
  ])('%s stoppes', (_name, body) => {
    expect(parseCupBatchMatches(body)).toBeNull();
  });

  it('kroppen har en øvre grense', () => {
    expect(parseCupBatchMatches(Array.from({ length: 401 }, () => match()))).toBeNull();
  });
});
