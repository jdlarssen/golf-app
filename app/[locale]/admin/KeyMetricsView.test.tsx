import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KeyMetricsView, type KeyMetrics } from './KeyMetricsView';

// KeyMetricsCard imports the request-scoped Supabase context; parseMetrics
// is pure, so the context is stubbed out rather than exercised.
vi.mock('./_dashboardContext', () => ({ getAdminContext: vi.fn() }));
import { parseMetrics } from './KeyMetricsCard';

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

const MONTHS = [
  '2025-10',
  '2025-11',
  '2025-12',
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
  '2026-09',
];

const METRICS: KeyMetrics = {
  usersGe1: 30,
  usersGe2: 12,
  gjengerGe2: 3,
  publicSignups: 5,
  weeks: WEEK_STARTS.map((weekStart, i) => ({ weekStart, finished: i })),
  funnel: {
    invited: 20,
    opened: 15,
    accepted: 10,
    profileCompleted: 8,
    firstScore: 6,
  },
  // Twelve Oslo months across a year boundary, oldest first (RPC order).
  months: MONTHS.map((month, i) => ({
    month,
    finished: 10 + i,
    byOthers: i,
    withoutAdmin: i % 2,
  })),
  livstegnTotal: { finished: 31, byOthers: 7, withoutAdmin: 3 },
};

describe('KeyMetricsView (#1010)', () => {
  it('renders the two activation counts, the share line, the 8-week trend and the funnel', () => {
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

    // Funnel (#1192): counts render per step; the invited row has no share,
    // later steps derive share-of-invited in the view (6 of 20 → 30).
    expect(screen.getByTestId('key-metrics-funnel-invited')).toHaveTextContent('20');
    expect(
      screen.queryByTestId('key-metrics-funnel-invited-share'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('key-metrics-funnel-opened')).toHaveTextContent('15');
    expect(screen.getByTestId('key-metrics-funnel-accepted')).toHaveTextContent('10');
    expect(
      screen.getByTestId('key-metrics-funnel-profile-completed'),
    ).toHaveTextContent('8');
    expect(screen.getByTestId('key-metrics-funnel-first-score')).toHaveTextContent('6');
    expect(
      screen.getByTestId('key-metrics-funnel-first-score-share'),
    ).toHaveTextContent('30');
  });
});

describe('KeyMetricsView livstegn (#2119)', () => {
  it('renders twelve month rows newest first with the all-time totals', () => {
    render(<KeyMetricsView metrics={METRICS} />);

    const section = screen.getByTestId('key-metrics-livstegn');
    // Livstegn sits at the top of the card, before the activation counts.
    expect(
      section.compareDocumentPosition(screen.getByTestId('key-metrics-users-ge2')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const rows = screen.getAllByTestId('key-metrics-livstegn-month');
    expect(rows.map((r) => r.getAttribute('data-month'))).toEqual(
      [...MONTHS].reverse(),
    );
    // Newest row (2026-09, index 11): finished 21, by others 11, without 1.
    const newest = Array.from(rows[0].querySelectorAll('td')).map(
      (td) => td.textContent,
    );
    expect(newest).toEqual(['21', '11', '1']);
    // Oldest row (2025-10, index 0): 10 / 0 / 0.
    const oldest = Array.from(rows[11].querySelectorAll('td')).map(
      (td) => td.textContent,
    );
    expect(oldest).toEqual(['10', '0', '0']);

    // Year shows on the top row and where the year changes (2025-12), only.
    expect(rows[0]).toHaveTextContent('2026');
    expect(rows[1]).not.toHaveTextContent('2026');
    expect(rows[9]).toHaveTextContent('2025');
    expect(rows[10]).not.toHaveTextContent('2025');

    expect(
      screen.getByTestId('key-metrics-livstegn-total-finished'),
    ).toHaveTextContent('31');
    expect(
      screen.getByTestId('key-metrics-livstegn-total-by-others'),
    ).toHaveTextContent('7');
    expect(
      screen.getByTestId('key-metrics-livstegn-total-without-admin'),
    ).toHaveTextContent('3');
  });
});

describe('parseMetrics (#2119)', () => {
  const RAW = {
    users_ge1: 30,
    users_ge2: 12,
    gjenger_ge2: 3,
    public_signups: 5,
    weeks: [{ week_start: '2026-06-29', finished: 2 }],
    funnel: {
      invited: 20,
      opened: 15,
      accepted: 10,
      profile_completed: 8,
      first_score: 6,
    },
    months: [
      { month: '2026-08', finished: 25, by_others: 1, without_admin: 1 },
      { month: '2026-09', finished: 4, by_others: 3, without_admin: 2 },
    ],
    livstegn_total: { finished: 35, by_others: 8, without_admin: 7 },
  };

  it('maps months and the total to camelCase in RPC order', () => {
    const parsed = parseMetrics(RAW);
    expect(parsed?.months).toEqual([
      { month: '2026-08', finished: 25, byOthers: 1, withoutAdmin: 1 },
      { month: '2026-09', finished: 4, byOthers: 3, withoutAdmin: 2 },
    ]);
    expect(parsed?.livstegnTotal).toEqual({
      finished: 35,
      byOthers: 8,
      withoutAdmin: 7,
    });
  });

  it.each([
    ['months missing', { months: undefined }],
    ['months not an array', { months: {} }],
    [
      'a month row missing without_admin',
      { months: [{ month: '2026-09', finished: 4, by_others: 3 }] },
    ],
    [
      'a month label not YYYY-MM',
      {
        months: [
          { month: '2026-09-01', finished: 4, by_others: 3, without_admin: 2 },
        ],
      },
    ],
    ['livstegn_total missing', { livstegn_total: undefined }],
    [
      'livstegn_total with a string count',
      { livstegn_total: { finished: '35', by_others: 8, without_admin: 7 } },
    ],
  ])('returns null (card hidden) when %s', (_label, override) => {
    expect(parseMetrics({ ...RAW, ...override })).toBeNull();
  });
});
