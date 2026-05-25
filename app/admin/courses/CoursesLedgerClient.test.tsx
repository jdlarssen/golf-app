import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSyncExternalStore } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  CoursesLedgerClient,
  applySortAndFilter,
  rowKicker,
  readStateFromParams,
  type CoursesLedgerItem,
} from './CoursesLedgerClient';

// Stateful mock for next/navigation: useSearchParams subscribes to a small
// in-memory store; useRouter().replace mutates the store and triggers a
// re-render in every consumer. Lets the existing interaction-tests keep
// driving the UI via fireEvent without rewriting them per-test.
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
    reset: () => {
      current = new URLSearchParams();
      for (const l of listeners) l();
    },
  };
})();

const replaceMock = vi.fn((href: string) => {
  const qs = href.startsWith('?') ? href.slice(1) : href;
  paramsStore.set(new URLSearchParams(qs));
});

vi.mock('next/navigation', () => {
  return {
    useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
    useSearchParams: () =>
      useSyncExternalStore(
        paramsStore.subscribe,
        () => paramsStore.get(),
        () => paramsStore.get(),
      ),
  };
});

beforeEach(() => {
  paramsStore.reset();
  replaceMock.mockClear();
});

function makeItem(overrides: Partial<CoursesLedgerItem> = {}): CoursesLedgerItem {
  return {
    id: 'x',
    name: 'Test GK',
    created_at: '2026-04-01T12:00:00Z',
    updated_at: '2026-04-01T12:00:00Z',
    tee_count: 3,
    has_ladies_tee: false,
    has_juniors_tee: false,
    active_game_count: 0,
    ...overrides,
  };
}

const ITEMS: CoursesLedgerItem[] = [
  makeItem({
    id: 'a',
    name: 'Stiklestad GK',
    created_at: '2026-05-01T12:00:00Z',
    updated_at: '2026-05-20T12:00:00Z',
    tee_count: 3,
    has_ladies_tee: true,
    has_juniors_tee: false,
    active_game_count: 2,
  }),
  makeItem({
    id: 'b',
    name: 'Trondheim GK',
    created_at: '2026-04-15T12:00:00Z',
    updated_at: '2026-04-15T12:00:00Z',
    tee_count: 4,
    has_ladies_tee: true,
    has_juniors_tee: true,
    active_game_count: 0,
  }),
  makeItem({
    id: 'c',
    name: 'Sjø-bane Trondheim',
    created_at: '2026-03-10T12:00:00Z',
    updated_at: '2026-05-15T12:00:00Z',
    tee_count: 2,
    has_ladies_tee: false,
    has_juniors_tee: false,
    active_game_count: 5,
  }),
];

describe('rowKicker', () => {
  it('viser «Lagt til» når updated_at er innenfor 60s av created_at', () => {
    const item = makeItem({
      created_at: '2026-04-01T12:00:00.000Z',
      updated_at: '2026-04-01T12:00:30.000Z',
    });
    expect(rowKicker(item)).toMatch(/^Lagt til/);
  });

  it('viser «Endret» når updated_at har gått frem mer enn 60s', () => {
    const item = makeItem({
      created_at: '2026-04-01T12:00:00.000Z',
      updated_at: '2026-04-01T12:01:30.000Z',
    });
    expect(rowKicker(item)).toMatch(/^Endret/);
  });
});

describe('applySortAndFilter', () => {
  it('returnerer alle items uten sort-endring i created_at desc-default', () => {
    const result = applySortAndFilter(ITEMS, '', {
      hasLadiesTee: false,
      hasJuniorsTee: false,
      activeGames: false,
    }, 'created_at');
    expect(result.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorterer på updated_at desc', () => {
    const result = applySortAndFilter(ITEMS, '', {
      hasLadiesTee: false,
      hasJuniorsTee: false,
      activeGames: false,
    }, 'updated_at');
    // a er sist endret (2026-05-20), c nest (2026-05-15), b sist (2026-04-15)
    expect(result.map((i) => i.id)).toEqual(['a', 'c', 'b']);
  });

  it('sorterer på active_game_count desc, ties brytes med navn asc', () => {
    const result = applySortAndFilter(ITEMS, '', {
      hasLadiesTee: false,
      hasJuniorsTee: false,
      activeGames: false,
    }, 'active_game_count');
    // c=5, a=2, b=0
    expect(result.map((i) => i.id)).toEqual(['c', 'a', 'b']);
  });

  it('filtrerer på hasLadiesTee', () => {
    const result = applySortAndFilter(ITEMS, '', {
      hasLadiesTee: true,
      hasJuniorsTee: false,
      activeGames: false,
    }, 'created_at');
    expect(result.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('AND-kombinerer hasLadiesTee + hasJuniorsTee', () => {
    const result = applySortAndFilter(ITEMS, '', {
      hasLadiesTee: true,
      hasJuniorsTee: true,
      activeGames: false,
    }, 'created_at');
    expect(result.map((i) => i.id)).toEqual(['b']);
  });

  it('filtrerer på activeGames > 0', () => {
    const result = applySortAndFilter(ITEMS, '', {
      hasLadiesTee: false,
      hasJuniorsTee: false,
      activeGames: true,
    }, 'created_at');
    expect(result.map((i) => i.id)).toEqual(['a', 'c']);
  });

  it('kombinerer søk + filter + sort', () => {
    const result = applySortAndFilter(ITEMS, 'TRONDHEIM', {
      hasLadiesTee: false,
      hasJuniorsTee: false,
      activeGames: true,
    }, 'created_at');
    // Søk «trondheim» matcher b og c. activeGames filtrerer ut b (0 aktive).
    expect(result.map((i) => i.id)).toEqual(['c']);
  });
});

describe('CoursesLedgerClient — søk (regresjon fra Fase 1)', () => {
  it('viser alle baner som default når søk er tomt', () => {
    render(<CoursesLedgerClient items={ITEMS} />);
    expect(screen.getByText('Stiklestad GK')).toBeTruthy();
    expect(screen.getByText('Trondheim GK')).toBeTruthy();
    expect(screen.getByText('Sjø-bane Trondheim')).toBeTruthy();
  });

  it('filtrerer ledger case-insensitivt på substring av navn', () => {
    render(<CoursesLedgerClient items={ITEMS} />);

    const input = screen.getByLabelText('Søk etter banenavn');
    fireEvent.change(input, { target: { value: 'TRONDHEIM' } });

    expect(screen.getByText('Trondheim GK')).toBeTruthy();
    expect(screen.getByText('Sjø-bane Trondheim')).toBeTruthy();
    expect(screen.queryByText('Stiklestad GK')).toBeNull();
  });

  it('viser empty-state med søke-strengen når ingen baner matcher', () => {
    render(<CoursesLedgerClient items={ITEMS} />);

    const input = screen.getByLabelText('Søk etter banenavn');
    fireEvent.change(input, { target: { value: 'xyz' } });

    expect(screen.getByText('Ingen baner matcher «xyz».')).toBeTruthy();
  });
});

describe('CoursesLedgerClient — sort + filter UI', () => {
  it('endrer rekkefølge når sort-dropdown velges', () => {
    const { container } = render(<CoursesLedgerClient items={ITEMS} />);

    const select = screen.getByLabelText('Sortér') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'active_game_count' } });

    // SmartLink rendrer hver rad som <a>; første rad etter sort skal være
    // Sjø-bane Trondheim (5 aktive spill).
    const rows = container.querySelectorAll('a[href*="/admin/courses/"]');
    expect(rows[0].textContent).toContain('Sjø-bane Trondheim');
    expect(rows[1].textContent).toContain('Stiklestad GK');
    expect(rows[2].textContent).toContain('Trondheim GK');
  });

  it('toggler dame-tee-chip og filtrerer ut baner uten dame-tee', () => {
    render(<CoursesLedgerClient items={ITEMS} />);

    const chip = screen.getByRole('button', { name: 'Har dame-tee' });
    expect(chip.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(chip);

    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Stiklestad GK')).toBeTruthy();
    expect(screen.getByText('Trondheim GK')).toBeTruthy();
    expect(screen.queryByText('Sjø-bane Trondheim')).toBeNull();
  });

  it('AND-kombinerer flere chips', () => {
    render(<CoursesLedgerClient items={ITEMS} />);

    fireEvent.click(screen.getByRole('button', { name: 'Har dame-tee' }));
    fireEvent.click(screen.getByRole('button', { name: 'Har junior-tee' }));

    expect(screen.queryByText('Stiklestad GK')).toBeNull();
    expect(screen.getByText('Trondheim GK')).toBeTruthy();
    expect(screen.queryByText('Sjø-bane Trondheim')).toBeNull();
  });

  it('viser filter-spesifikk empty-state når søk + chip ikke matcher', () => {
    render(<CoursesLedgerClient items={ITEMS} />);

    const input = screen.getByLabelText('Søk etter banenavn');
    fireEvent.change(input, { target: { value: 'stiklestad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Har junior-tee' }));

    expect(
      screen.getByText('Ingen baner matcher «stiklestad» og filteret.'),
    ).toBeTruthy();
  });

  it('viser «Endret»-tekst når updated_at har gått frem etter created_at', () => {
    render(<CoursesLedgerClient items={ITEMS} />);
    // Stiklestad ble endret 2026-05-20; rad-kicker skal si «Endret».
    expect(screen.getAllByText(/^Endret/i).length).toBeGreaterThan(0);
    // Trondheim har samme created/updated_at → «Lagt til».
    expect(screen.getAllByText(/^Lagt til/i).length).toBeGreaterThan(0);
  });
});

describe('readStateFromParams', () => {
  it('returns defaults for an empty URLSearchParams', () => {
    expect(readStateFromParams(new URLSearchParams())).toEqual({
      query: '',
      sortBy: 'created_at',
      filters: {
        hasLadiesTee: false,
        hasJuniorsTee: false,
        activeGames: false,
      },
    });
  });

  it('parses each param correctly', () => {
    const result = readStateFromParams(
      new URLSearchParams('q=stik&sort=updated_at&ladies=1&active=1'),
    );
    expect(result).toEqual({
      query: 'stik',
      sortBy: 'updated_at',
      filters: {
        hasLadiesTee: true,
        hasJuniorsTee: false,
        activeGames: true,
      },
    });
  });

  it('falls back to created_at for an unknown sort value', () => {
    const result = readStateFromParams(
      new URLSearchParams('sort=garbage_value'),
    );
    expect(result.sortBy).toBe('created_at');
  });
});

describe('CoursesLedgerClient — URL state persistence (Fase 3)', () => {
  it('initialises sort + chips + search from URL params on first render', () => {
    paramsStore.set(
      new URLSearchParams('q=stiklestad&sort=updated_at&ladies=1'),
    );
    render(<CoursesLedgerClient items={ITEMS} />);

    const input = screen.getByLabelText('Søk etter banenavn') as HTMLInputElement;
    expect(input.value).toBe('stiklestad');

    const select = screen.getByLabelText('Sortér') as HTMLSelectElement;
    expect(select.value).toBe('updated_at');

    const ladiesChip = screen.getByRole('button', { name: 'Har dame-tee' });
    expect(ladiesChip.getAttribute('aria-pressed')).toBe('true');
  });

  it('writes search query into URL via router.replace', () => {
    render(<CoursesLedgerClient items={ITEMS} />);
    const input = screen.getByLabelText('Søk etter banenavn');
    fireEvent.change(input, { target: { value: 'Trondheim' } });

    expect(replaceMock).toHaveBeenCalled();
    const lastHref = replaceMock.mock.calls.at(-1)![0] as string;
    expect(lastHref).toContain('q=Trondheim');
  });

  it('removes the q-param when the search box is cleared', () => {
    paramsStore.set(new URLSearchParams('q=stik'));
    render(<CoursesLedgerClient items={ITEMS} />);
    const input = screen.getByLabelText('Søk etter banenavn');

    fireEvent.change(input, { target: { value: '' } });
    const lastHref = replaceMock.mock.calls.at(-1)![0] as string;
    expect(lastHref).not.toContain('q=');
  });

  it('writes non-default sort into URL and omits default sort', () => {
    render(<CoursesLedgerClient items={ITEMS} />);
    const select = screen.getByLabelText('Sortér') as HTMLSelectElement;

    fireEvent.change(select, { target: { value: 'active_game_count' } });
    let lastHref = replaceMock.mock.calls.at(-1)![0] as string;
    expect(lastHref).toContain('sort=active_game_count');

    // Bytter tilbake til default → sort-param fjernes.
    fireEvent.change(select, { target: { value: 'created_at' } });
    lastHref = replaceMock.mock.calls.at(-1)![0] as string;
    expect(lastHref).not.toContain('sort=');
  });

  it('toggles chip params (ladies=1 → empty) into the URL', () => {
    render(<CoursesLedgerClient items={ITEMS} />);
    const chip = screen.getByRole('button', { name: 'Har dame-tee' });

    fireEvent.click(chip);
    let lastHref = replaceMock.mock.calls.at(-1)![0] as string;
    expect(lastHref).toContain('ladies=1');

    fireEvent.click(chip);
    lastHref = replaceMock.mock.calls.at(-1)![0] as string;
    expect(lastHref).not.toContain('ladies=');
  });
});
