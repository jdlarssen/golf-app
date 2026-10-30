import { describe, expect, it } from 'vitest';
import { leagueFlightName } from './flightName';

describe('leagueFlightName', () => {
  it('puts the round label after the league name', () => {
    expect(leagueFlightName('Vinterliga 2026-2027', 'Runde 1', 120)).toBe('Vinterliga 2026-2027 – Runde 1');
  });

  it('keeps a label that is not a number', () => {
    expect(leagueFlightName('Liga', 'Finalen', 120)).toBe('Liga – Finalen');
  });

  it('cuts the league name, never the label, when the name is too long', () => {
    const name = leagueFlightName('L'.repeat(200), 'Runde 12', 40);
    expect(name).toHaveLength(40);
    expect(name.endsWith('… – Runde 12')).toBe(true);
  });

  it('fits exactly at the limit without an ellipsis', () => {
    const league = 'L'.repeat(110);
    expect(leagueFlightName(league, 'Runde 1', 120)).toBe(`${league} – Runde 1`);
  });

  it('falls back to the league name when the label is blank', () => {
    expect(leagueFlightName('Vinterliga', '  ', 120)).toBe('Vinterliga');
  });

  it('never goes over the limit, even with a label longer than the limit', () => {
    expect(leagueFlightName('Liga', 'R'.repeat(30), 10)).toHaveLength(10);
  });
});
