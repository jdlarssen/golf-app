import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KeyMetricsView, type KeyMetrics } from './KeyMetricsView';

// One render test for the «Nøkkeltall» card (#1010) — data injected as props
// into the presentational view, asserting on data-testid/values only, never
// Norwegian copy (Type C discipline). The aggregation itself lives in SQL
// (migration 0126) and is verified against manual SQL on staging — the
// numbers here only prove the view renders what it is handed. No Supabase
// mock (KeyMetricsCard owns the fetch).

// Eight consecutive Oslo Mondays (spring 2026), current week last.
const WEEK_STARTS = [
  '2026-05-11',
  '2026-05-18',
  '2026-05-25',
  '2026-06-01',
  '2026-06-08',
  '2026-06-15',
  '2026-06-22',
  '2026-06-29',
];

const METRICS: KeyMetrics = {
  usersGe1: 30,
  usersGe2: 12,
  gjengerGe2: 3,
  publicSignups: 5,
  weeks: WEEK_STARTS.map((weekStart, i) => ({ weekStart, finished: i })),
};

describe('KeyMetricsView (#1010)', () => {
  it('renders the two activation counts, the share line and the 8-week trend', () => {
    render(<KeyMetricsView metrics={METRICS} />);

    expect(screen.getByTestId('key-metrics-users-ge2')).toHaveTextContent('12');
    // 12 of 30 → 40 — share is derived in the view, so it is asserted here.
    expect(screen.getByTestId('key-metrics-users-share')).toHaveTextContent('40');
    expect(screen.getByTestId('key-metrics-gjenger-ge2')).toHaveTextContent('3');
    expect(screen.getByTestId('key-metrics-public-signups')).toHaveTextContent('5');

    const weeks = screen.getAllByTestId('key-metrics-week');
    expect(weeks).toHaveLength(8);
    expect(weeks[0]).toHaveTextContent('0');
    expect(weeks[7]).toHaveTextContent('7');
  });
});
