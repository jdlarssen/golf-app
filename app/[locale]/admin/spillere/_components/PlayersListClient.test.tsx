import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSyncExternalStore } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlayersListClient, type PlayerRow } from './PlayersListClient';

// Stateful stand-in for next/navigation: the URL params live in a tiny store, so
// a click on a filter button re-renders the list the way the router would.
const paramsStore = (() => {
  let current = new URLSearchParams();
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (next: URLSearchParams) => {
      current = next;
      for (const l of listeners) l();
    },
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
})();

const replaceMock = vi.fn((href: string) => {
  paramsStore.set(new URLSearchParams(href.startsWith('?') ? href.slice(1) : href));
});

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
  useSearchParams: () =>
    useSyncExternalStore(paramsStore.subscribe, paramsStore.get, paramsStore.get),
}));

vi.mock('@/components/ui/GuestBadge', () => ({
  GuestBadge: () => <span>Gjest</span>,
}));

beforeEach(() => {
  paramsStore.set(new URLSearchParams());
  replaceMock.mockClear();
});

function row(n: number, over: Partial<PlayerRow> = {}): PlayerRow {
  return {
    id: `p${n}`,
    name: `Spiller ${n}`,
    nickname: null,
    email: `p${n}@example.com`,
    hcp_index: 10,
    is_admin: false,
    is_guest: false,
    created_at: '2026-01-01T00:00:00Z',
    rounds: 1,
    lastPlayedAt: null,
    playedThisYear: false,
    lastPlayedLabel: null,
    metaLabel: `HCP 10,0 · 1 runde`,
    ...over,
  };
}

function renderList(rows: PlayerRow[]) {
  return render(
    <PlayersListClient
      rows={rows}
      initialQuery=""
      initialFilter="alle"
      searchAriaLabel="Søk"
      searchPlaceholder="Søk etter navn eller e-post"
      filterGroupLabel="Filtrer"
      filterLabels={{ alle: 'Alle', 'spilt-i-aar': 'Spilt i år', gjester: 'Gjester' }}
      showAllLabel={`Vis alle ${rows.length}`}
      emptyNoPlayers="Ingen spillere"
      emptyNoMatchTemplate="Ingen treff på «{query}»."
      emptyFilterLabels={{ 'spilt-i-aar': 'Ingen i år', gjester: 'Ingen gjester' }}
    />,
  );
}

describe('PlayersListClient', () => {
  it('toggles the guest filter and pages the plain list with focus on row 21', () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      row(i + 1, { is_guest: i === 2, playedThisYear: i < 3 }),
    );
    renderList(rows);

    const alle = screen.getByRole('button', { name: 'Alle' });
    const gjester = screen.getByRole('button', { name: 'Gjester' });
    expect(alle).toHaveAttribute('aria-pressed', 'true');
    expect(gjester).toHaveAttribute('aria-pressed', 'false');

    // 25 rows: the first 20, then «Vis alle».
    expect(screen.getAllByRole('link')).toHaveLength(20);
    fireEvent.click(screen.getByRole('button', { name: 'Vis alle 25' }));
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(25);
    expect(links[20]).toHaveFocus();

    fireEvent.click(gjester);
    expect(gjester).toHaveAttribute('aria-pressed', 'true');
    expect(alle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Vis alle/ })).toBeNull();
  });
});
