import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

type Row = Record<string, unknown>;

/**
 * Small in-memory stand-in for the PostgREST builder: `gte`, `order` and
 * `limit` act on the rows, `or` lets every row through (so the pre-#2340
 * query still runs), the rest pass through. Awaiting the chain resolves
 * `{ data, error: null }`.
 */
function fakeClient(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const chain = {
        select: () => chain,
        not: () => chain,
        returns: () => chain,
        or: () => chain,
        gte(col: string, v: string) {
          rows = rows.filter((r) => r[col] != null && (r[col] as string) >= v);
          return chain;
        },
        order(col: string, { ascending }: { ascending: boolean }) {
          rows.sort((a, b) => {
            const cmp = String(a[col] ?? '').localeCompare(String(b[col] ?? ''));
            return ascending ? cmp : -cmp;
          });
          return chain;
        },
        limit(n: number) {
          rows = rows.slice(0, n);
          return chain;
        },
        then(resolve: (r: { data: Row[]; error: null }) => unknown) {
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        },
      };
      return chain;
    },
  };
}

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

// 13 games that ended 2–13 days ago, then, as the last row, one that started
// an hour ago. Without an order on the query, `limit(12)` keeps the first
// twelve rows and today's start never reaches the ledger.
const games: Row[] = [
  ...Array.from({ length: 13 }, (_, i) => ({
    id: `ended-${i}`,
    name: `Avsluttet ${i}`,
    started_at: null,
    ended_at: new Date(now - (2 + Math.min(i, 11)) * DAY).toISOString(),
  })),
  {
    id: 'started-today',
    name: 'Startet i dag',
    started_at: new Date(now - 60 * 60 * 1000).toISOString(),
    ended_at: null,
  },
];

vi.mock('./_dashboardContext', () => ({
  getAdminContext: async () => ({
    supabase: fakeClient({
      games,
      game_players: [],
      courses: [],
      invitations: [],
    }),
    userId: 'admin-1',
  }),
}));

vi.mock('@/components/ui/SmartLink', () => ({
  SmartLink: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { ActivityLedger } from './ActivityLedger';

describe('ActivityLedger (#2340)', () => {
  it('shows the newest game start even when many older games ended', async () => {
    const { container } = render(await ActivityLedger());

    expect(
      container.querySelector('a[href="/admin/games/started-today"]'),
    ).not.toBeNull();
  });
});
