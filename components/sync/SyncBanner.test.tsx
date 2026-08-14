import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// IMPORTANT: mocks must be declared before importing the component under test.
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: vi.fn() }));
vi.mock('@/lib/sync/db', () => ({
  localDb: {
    syncQueue: { bulkDelete: vi.fn().mockResolvedValue(undefined) },
    conflicts: { delete: vi.fn().mockResolvedValue(undefined) },
  },
}));
vi.mock('@/lib/sync/syncWorker', () => ({
  drainQueue: vi
    .fn()
    .mockResolvedValue({ pushed: 0, rejected: 0, errored: 0, abandoned: 0 }),
}));

import { useLiveQuery } from 'dexie-react-hooks';
import {
  localDb,
  type SyncQueueItem,
  type ConflictRecord,
} from '@/lib/sync/db';
import { SyncBanner } from './SyncBanner';

/**
 * Type C render-test (én per komponent): karantene-varianten (#1369) —
 * hull-navngiving + lenker, fremmed-runde-linje, mobil-lesbar feildetalj og
 * dismiss-med-confirm. Grupperings-/parse-logikken testes i
 * `lib/sync/quarantineSummary.test.ts` (Type A) og re-asserteres ikke her.
 */

function qItem(
  overrides: Partial<SyncQueueItem> & { scoreId: string },
): SyncQueueItem {
  return {
    id: overrides.scoreId,
    attemptCount: 6,
    lastError: null,
    createdAt: '2026-08-13T10:00:00.000Z',
    abandonedAt: '2026-08-13T10:05:00.000Z',
    ...overrides,
  };
}

// SyncBanner calls useLiveQuery twice per render, queue first, conflicts
// second — a call-counter modulo keeps the pair stable across re-renders.
function mockDexieData(
  queue: SyncQueueItem[],
  conflicts: ConflictRecord[] = [],
) {
  let call = 0;
  vi.mocked(useLiveQuery).mockImplementation(() =>
    call++ % 2 === 0 ? queue : conflicts,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SyncBanner — karantene-varianten', () => {
  it('navngir hullene og lenker til dem (locale-bevart via @/i18n/navigation)', () => {
    mockDexieData([
      qItem({ scoreId: 'g1:u1:7', lastError: 'row-level security' }),
      qItem({ scoreId: 'g1:u1:3', lastError: 'row-level security' }),
    ]);
    render(<SyncBanner gameId="g1" />);

    expect(screen.getByText('Hull 3 og 7 ble ikke lagret.')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Åpne hull 3' });
    expect(link).toHaveAttribute('href', '/games/g1/holes/3');
    expect(screen.getByRole('link', { name: 'Åpne hull 7' })).toHaveAttribute(
      'href',
      '/games/g1/holes/7',
    );
  });

  it('fremmed rundes karantene får egen linje med lenke til runden', () => {
    mockDexieData([qItem({ scoreId: 'g2:u1:5' })]);
    render(<SyncBanner gameId="g1" />);

    expect(
      screen.getByText(/Ett slag fra en annen runde ble ikke lagret\./),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Åpne runden' })).toHaveAttribute(
      'href',
      '/games/g2',
    );
  });

  it('lastError er i DOM uten hover (Disclosure), og title-attributtet er borte', () => {
    mockDexieData([qItem({ scoreId: 'g1:u1:7', lastError: 'permission denied' })]);
    const { container } = render(<SyncBanner gameId="g1" />);

    // Native <details> keeps children in the DOM also when collapsed.
    expect(screen.getByText('permission denied')).toBeInTheDocument();
    expect(screen.getByText('Tekniske detaljer')).toBeInTheDocument();
    expect(container.querySelector('[title]')).toBeNull();
  });

  it('dismiss med bekreftelse sletter kun karantene-elementene', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockDexieData([
      qItem({ scoreId: 'g1:u1:7' }),
      qItem({ scoreId: 'g1:u1:9', abandonedAt: null, attemptCount: 1 }),
    ]);
    render(<SyncBanner gameId="g1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Fjern varselet' }));
    await waitFor(() =>
      expect(localDb.syncQueue.bulkDelete).toHaveBeenCalledWith(['g1:u1:7']),
    );
  });

  it('avbrutt bekreftelse sletter ingenting', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    mockDexieData([qItem({ scoreId: 'g1:u1:7' })]);
    render(<SyncBanner gameId="g1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Fjern varselet' }));
    expect(localDb.syncQueue.bulkDelete).not.toHaveBeenCalled();
  });

  it('kun aktive elementer → kompakt variant uten dismiss, med retry', () => {
    mockDexieData([
      qItem({
        scoreId: 'g1:u1:4',
        abandonedAt: null,
        attemptCount: 2,
        lastError: 'TypeError: Failed to fetch',
      }),
    ]);
    render(<SyncBanner gameId="g1" />);

    expect(screen.queryByRole('button', { name: 'Fjern varselet' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Prøv igjen' }),
    ).toBeInTheDocument();
  });

  it('auth-feil i aktiv kø → «Logg inn»-lenke med next-param (#1371)', () => {
    mockDexieData([
      qItem({
        scoreId: 'g1:u1:4',
        abandonedAt: null,
        attemptCount: 2,
        lastError: 'invalid JWT: token has expired (401)',
      }),
    ]);
    render(<SyncBanner gameId="g1" />);

    // Global usePathname-mock gir '/', så unit-testen ser kun next=%2F —
    // locale-prefikset verifiseres i staging-klikket (kontraktens NB).
    expect(screen.getByRole('link', { name: 'Logg inn' })).toHaveAttribute(
      'href',
      '/login?next=%2F',
    );
  });

  it('aktivt slag fra en annen runde gir ingen status her (#1370)', () => {
    // Still-retrying items belong to the round they were entered in — dette
    // banneret snakker for runden på skjermen. Selve filter-reglene testes i
    // lib/sync/queueScope.test.ts og re-asserteres ikke her.
    mockDexieData([
      qItem({
        scoreId: 'g2:u1:4',
        abandonedAt: null,
        attemptCount: 2,
        lastError: 'TypeError: Failed to fetch',
      }),
    ]);
    const { container } = render(<SyncBanner gameId="g1" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('malformet scoreId degraderer til generisk melding uten crash', () => {
    mockDexieData([qItem({ scoreId: 'not-a-score-key' })]);
    render(<SyncBanner gameId="g1" />);

    expect(
      screen.getByText('Kunne ikke lagre 1 slag. Kontakt arrangøren.'),
    ).toBeInTheDocument();
  });
});

/**
 * Type C: én render-assertion for medspiller-varianten (#1368). Selve gaten som
 * setter `forOwnScore` testes i `lib/sync/syncWorker.test.ts` (Type A).
 */
describe('SyncBanner — konflikt-varsel', () => {
  it('score du førte for en medspiller får sin egen tekst (#1368)', () => {
    const conflict: ConflictRecord = {
      id: 'g1:mate:7',
      gameId: 'g1',
      userId: 'mate',
      holeNumber: 7,
      localStrokes: 5,
      serverStrokes: 7,
      resolvedAt: '2026-08-14T10:00:00.000Z',
      forOwnScore: false,
    };
    mockDexieData([], [conflict]);
    render(<SyncBanner gameId="g1" />);

    expect(
      screen.getByText(
        'Hull 7: tallet du førte for en medspiller ble endret. Det nyeste gjelder nå.',
      ),
    ).toBeInTheDocument();
  });
});
