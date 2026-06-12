import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSyncExternalStore } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { createTranslator } from 'use-intl/core';
import noMessages from '../../../../messages/no.json';
import {
  CoursesLedgerClient,
  applySortAndFilter,
  rowKicker,
  readStateFromParams,
  type CoursesLedgerItem,
} from './CoursesLedgerClient';

// Translator + locale for rowKicker standalone tests.
const tCourses = createTranslator<typeof noMessages, 'admin.courses'>({
  locale: 'no',
  messages: noMessages,
  namespace: 'admin.courses',
  onError: () => {},
  getMessageFallback: ({ namespace: ns, key }) => (ns ? `${ns}.${key}` : key),
});
const NO_LOCALE = 'no' as const;

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

// useRouter migrated to @/i18n/navigation; useSearchParams stays next/navigation.
vi.mock('@/i18n/navigation', async () => {
  const { createElement } = await import('react');
  return {
    useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
    usePathname: () => '/',
    Link: ({ href, children, ...rest }: { href: string; children: unknown; [k: string]: unknown }) =>
      createElement('a', { href, ...rest }, children as never),
    redirect: vi.fn(),
    getPathname: vi.fn(() => '/'),
  };
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
    last_played_at: null,
    ...overrides,
  };
}

const NO_FILTERS = {
  hasLadiesTee: false,
  hasJuniorsTee: false,
  activeGames: false,
  playedRecently: false,
} as const;

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
    last_played_at: '2026-05-22T15:00:00Z',
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
    last_played_at: null, // aldri spilt
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
    last_played_at: '2026-05-24T10:00:00Z',
  }),
];

describe('rowKicker', () => {
  it('viser «Lagt til» når updated_at er innenfor 60s av created_at og banen aldri er spilt', () => {
    const item = makeItem({
      created_at: '2026-04-01T12:00:00.000Z',
      updated_at: '2026-04-01T12:00:30.000Z',
      last_played_at: null,
    });
    expect(rowKicker(item, tCourses, NO_LOCALE)).toMatch(/^Lagt til/);
  });

  it('viser «Endret» når updated_at har gått frem mer enn 60s og banen aldri er spilt', () => {
    const item = makeItem({
      created_at: '2026-04-01T12:00:00.000Z',
      updated_at: '2026-04-01T12:01:30.000Z',
      last_played_at: null,
    });
    expect(rowKicker(item, tCourses, NO_LOCALE)).toMatch(/^Endret/);
  });

  it('viser «Sist spilt» som høyest prioritet når banen har vært spilt', () => {
    const item = makeItem({
      created_at: '2026-04-01T12:00:00.000Z',
      updated_at: '2026-04-15T12:00:00.000Z',
      last_played_at: '2026-05-12T18:30:00.000Z',
    });
    expect(rowKicker(item, tCourses, NO_LOCALE)).toMatch(/^Sist spilt/);
  });

  it('«Sist spilt» overstyrer «Endret» selv når updated_at er nyere enn last_played_at', () => {
    const item = makeItem({
      created_at: '2026-04-01T12:00:00.000Z',
      updated_at: '2026-05-20T12:00:00.000Z',
      last_played_at: '2026-04-10T12:00:00.000Z',
    });
    expect(rowKicker(item, tCourses, NO_LOCALE)).toMatch(/^Sist spilt/);
  });
});

describe('applySortAndFilter', () => {
  it('returnerer alle items uten sort-endring i created_at desc-default', () => {
    const result = applySortAndFilter(ITEMS, '', NO_FILTERS, 'created_at');
    expect(result.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorterer på updated_at desc', () => {
    const result = applySortAndFilter(ITEMS, '', {
      ...NO_FILTERS,
    }, 'updated_at');
    // a er sist endret (2026-05-20), c nest (2026-05-15), b sist (2026-04-15)
    expect(result.map((i) => i.id)).toEqual(['a', 'c', 'b']);
  });

  it('sorterer på active_game_count desc, ties brytes med navn asc', () => {
    const result = applySortAndFilter(ITEMS, '', {
      ...NO_FILTERS,
    }, 'active_game_count');
    // c=5, a=2, b=0
    expect(result.map((i) => i.id)).toEqual(['c', 'a', 'b']);
  });

  it('filtrerer på hasLadiesTee', () => {
    const result = applySortAndFilter(ITEMS, '', {
      ...NO_FILTERS,
      hasLadiesTee: true,
    }, 'created_at');
    expect(result.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('AND-kombinerer hasLadiesTee + hasJuniorsTee', () => {
    const result = applySortAndFilter(ITEMS, '', {
      ...NO_FILTERS,
      hasLadiesTee: true,
      hasJuniorsTee: true,
    }, 'created_at');
    expect(result.map((i) => i.id)).toEqual(['b']);
  });

  it('filtrerer på activeGames > 0', () => {
    const result = applySortAndFilter(ITEMS, '', {
      ...NO_FILTERS,
      activeGames: true,
    }, 'created_at');
    expect(result.map((i) => i.id)).toEqual(['a', 'c']);
  });

  it('kombinerer søk + filter + sort', () => {
    const result = applySortAndFilter(ITEMS, 'TRONDHEIM', {
      ...NO_FILTERS,
      activeGames: true,
    }, 'created_at');
    // Søk «trondheim» matcher b og c. activeGames filtrerer ut b (0 aktive).
    expect(result.map((i) => i.id)).toEqual(['c']);
  });

  it('sorterer på last_played desc med null sist og navn-asc tie-break', () => {
    // a: 2026-05-22, b: null, c: 2026-05-24 → forventet: c, a, b
    const result = applySortAndFilter(ITEMS, '', NO_FILTERS, 'last_played');
    expect(result.map((i) => i.id)).toEqual(['c', 'a', 'b']);
  });

  it('sort på last_played: aldri-spilte baner sorteres med navn asc seg imellom', () => {
    const items = [
      makeItem({ id: 'z-bane', name: 'Z-bane', last_played_at: null }),
      makeItem({ id: 'a-bane', name: 'A-bane', last_played_at: null }),
      makeItem({ id: 'spilt', name: 'M-bane', last_played_at: '2026-05-22T12:00:00Z' }),
    ];
    const result = applySortAndFilter(items, '', NO_FILTERS, 'last_played');
    expect(result.map((i) => i.id)).toEqual(['spilt', 'a-bane', 'z-bane']);
  });

  it('filtrerer på playedRecently (siste 30 dager)', () => {
    // Stub Date.now() til 2026-05-26 (test-dato fra CLAUDE.md). Cutoff =
    // 2026-04-26. Stiklestad (2026-05-22) og Sjø-bane (2026-05-24) er innenfor;
    // Trondheim (null) er ute.
    const originalNow = Date.now;
    Date.now = () => new Date('2026-05-26T12:00:00Z').getTime();
    try {
      const result = applySortAndFilter(ITEMS, '', {
        ...NO_FILTERS,
        playedRecently: true,
      }, 'created_at');
      expect(result.map((i) => i.id).sort()).toEqual(['a', 'c']);
    } finally {
      Date.now = originalNow;
    }
  });

  it('playedRecently filtrerer ut baner med last_played eldre enn 30 dager', () => {
    const items = [
      makeItem({ id: 'recent', last_played_at: '2026-05-20T12:00:00Z' }),
      makeItem({ id: 'old', last_played_at: '2026-03-01T12:00:00Z' }),
      makeItem({ id: 'never', last_played_at: null }),
    ];
    const originalNow = Date.now;
    Date.now = () => new Date('2026-05-26T12:00:00Z').getTime();
    try {
      const result = applySortAndFilter(items, '', {
        ...NO_FILTERS,
        playedRecently: true,
      }, 'created_at');
      expect(result.map((i) => i.id)).toEqual(['recent']);
    } finally {
      Date.now = originalNow;
    }
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

  it('viser «Sist spilt»-kicker for baner som har vært spilt', () => {
    render(<CoursesLedgerClient items={ITEMS} />);
    // a og c har last_played_at satt; b er null.
    expect(screen.getAllByText(/^Sist spilt/i).length).toBeGreaterThanOrEqual(2);
  });

  it('rendrer sort-option «Sist spilt» i dropdown-en', () => {
    render(<CoursesLedgerClient items={ITEMS} />);
    const select = screen.getByLabelText('Sortér') as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toContain('last_played');
  });

  it('endrer rekkefølge til last_played-desc når sort velges', () => {
    const { container } = render(<CoursesLedgerClient items={ITEMS} />);

    const select = screen.getByLabelText('Sortér') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'last_played' } });

    const rows = container.querySelectorAll('a[href*="/admin/courses/"]');
    // c: 2026-05-24, a: 2026-05-22, b: null (sist)
    expect(rows[0].textContent).toContain('Sjø-bane Trondheim');
    expect(rows[1].textContent).toContain('Stiklestad GK');
    expect(rows[2].textContent).toContain('Trondheim GK');
  });

  it('rendrer ny chip «Spilt siste 30 dager» og toggler den', () => {
    const originalNow = Date.now;
    Date.now = () => new Date('2026-05-26T12:00:00Z').getTime();
    try {
      render(<CoursesLedgerClient items={ITEMS} />);

      const chip = screen.getByRole('button', { name: 'Spilt siste 30 dager' });
      expect(chip.getAttribute('aria-pressed')).toBe('false');

      fireEvent.click(chip);

      expect(chip.getAttribute('aria-pressed')).toBe('true');
      // a og c har last_played innen 30 dager; b filtreres ut.
      expect(screen.getByText('Stiklestad GK')).toBeTruthy();
      expect(screen.getByText('Sjø-bane Trondheim')).toBeTruthy();
      expect(screen.queryByText('Trondheim GK')).toBeNull();
    } finally {
      Date.now = originalNow;
    }
  });

  it('viser «Endret»-tekst når updated_at har gått frem etter created_at og banen ikke er spilt', () => {
    // Lokalt datasett — eksisterende ITEMS har last_played_at satt på de
    // redigerte banene, så «Sist spilt» tar prioritet over «Endret». Her vil
    // vi isolere «Endret»-fallback-banen for kicker-prioritets-test.
    const kickerItems = [
      makeItem({
        id: 'edited',
        name: 'Endret bane',
        created_at: '2026-05-01T12:00:00Z',
        updated_at: '2026-05-15T12:00:00Z',
        last_played_at: null,
      }),
      makeItem({
        id: 'fresh',
        name: 'Helt ny bane',
        created_at: '2026-05-20T12:00:00Z',
        updated_at: '2026-05-20T12:00:00Z',
        last_played_at: null,
      }),
    ];
    render(<CoursesLedgerClient items={kickerItems} />);
    expect(screen.getAllByText(/^Endret/i).length).toBeGreaterThan(0);
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
        playedRecently: false,
      },
    });
  });

  it('parses each param correctly', () => {
    const result = readStateFromParams(
      new URLSearchParams('q=stik&sort=updated_at&ladies=1&active=1&recent=1'),
    );
    expect(result).toEqual({
      query: 'stik',
      sortBy: 'updated_at',
      filters: {
        hasLadiesTee: true,
        hasJuniorsTee: false,
        activeGames: true,
        playedRecently: true,
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

  it('skriver sort=last_played til URL og fjerner den ved bytte tilbake', () => {
    render(<CoursesLedgerClient items={ITEMS} />);
    const select = screen.getByLabelText('Sortér') as HTMLSelectElement;

    fireEvent.change(select, { target: { value: 'last_played' } });
    let lastHref = replaceMock.mock.calls.at(-1)![0] as string;
    expect(lastHref).toContain('sort=last_played');

    fireEvent.change(select, { target: { value: 'created_at' } });
    lastHref = replaceMock.mock.calls.at(-1)![0] as string;
    expect(lastHref).not.toContain('sort=');
  });

  it('toggler recent-chip via URL (recent=1 → empty)', () => {
    render(<CoursesLedgerClient items={ITEMS} />);
    const chip = screen.getByRole('button', { name: 'Spilt siste 30 dager' });

    fireEvent.click(chip);
    let lastHref = replaceMock.mock.calls.at(-1)![0] as string;
    expect(lastHref).toContain('recent=1');

    fireEvent.click(chip);
    lastHref = replaceMock.mock.calls.at(-1)![0] as string;
    expect(lastHref).not.toContain('recent=');
  });

  it('initialiserer ny sort + recent-chip fra URL ved første render', () => {
    paramsStore.set(new URLSearchParams('sort=last_played&recent=1'));
    render(<CoursesLedgerClient items={ITEMS} />);

    const select = screen.getByLabelText('Sortér') as HTMLSelectElement;
    expect(select.value).toBe('last_played');

    const chip = screen.getByRole('button', { name: 'Spilt siste 30 dager' });
    expect(chip.getAttribute('aria-pressed')).toBe('true');
  });
});
