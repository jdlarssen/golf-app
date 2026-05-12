import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { Mock } from 'vitest';

// IMPORTANT: All mocks must be declared before importing the component under
// test, otherwise the module under test resolves the real implementations.
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(),
}));

vi.mock('@/lib/sync/db', () => {
  const scores = {
    get: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
    bulkGet: vi.fn().mockResolvedValue([]),
  };
  return {
    localDb: { scores },
    scoreKey: (gameId: string, userId: string, holeNumber: number) =>
      `${gameId}:${userId}:${holeNumber}`,
  };
});

vi.mock('@/lib/sync/writeScore', () => ({
  writeScore: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/sync/syncWorker', () => ({
  startSyncListener: vi.fn(),
  drainQueue: vi.fn().mockResolvedValue(undefined),
}));

// SmartLink calls useRouter, which throws outside a Next.js app context. Stub
// the router so the link renders harmlessly in jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

import { useLiveQuery } from 'dexie-react-hooks';
import { writeScore } from '@/lib/sync/writeScore';
import { drainQueue } from '@/lib/sync/syncWorker';
import { HoleClient, type HoleClientProps, ONBOARDING_KEY } from './HoleClient';

const useLiveQueryMock = useLiveQuery as unknown as Mock;
const writeScoreMock = writeScore as unknown as Mock;
const drainQueueMock = drainQueue as unknown as Mock;

function makePlayers(n = 4): HoleClientProps['players'] {
  return Array.from({ length: n }, (_, i) => ({
    userId: `u${i + 1}`,
    name: `Player ${i + 1}`,
    nickname: null,
    initial: `P`,
    extraStrokes: 0,
    initialStrokes: null,
    initialClientUpdatedAt: null,
    initialServerUpdatedAt: null,
    submitted: false,
  }));
}

function baseProps(
  overrides: Partial<HoleClientProps> = {},
): HoleClientProps {
  return {
    gameId: 'g1',
    gameName: 'Sommerturnering',
    gameStatus: 'active',
    currentHole: 1,
    par: 4,
    strokeIndex: 7,
    myUserId: 'u1',
    myCompletedHoles: 0,
    players: makePlayers(),
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  useLiveQueryMock.mockReturnValue([undefined, undefined, undefined, undefined]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('HoleClient — rendering', () => {
  it('renders one ScoreCard per player', () => {
    render(<HoleClient {...baseProps()} />);
    expect(screen.getByText('Player 1')).toBeInTheDocument();
    expect(screen.getByText('Player 2')).toBeInTheDocument();
    expect(screen.getByText('Player 3')).toBeInTheDocument();
    expect(screen.getByText('Player 4')).toBeInTheDocument();
  });

  it('renders the tournament name in the header', () => {
    render(<HoleClient {...baseProps({ gameName: 'Tørny 2026' })} />);
    expect(screen.getByText('Tørny 2026')).toBeInTheDocument();
  });

  it('renders back link to the game home', () => {
    render(<HoleClient {...baseProps({ gameId: 'abc' })} />);
    const back = screen.getByRole('link', {
      name: 'Tilbake til turneringen',
    });
    expect(back.getAttribute('href')).toBe('/games/abc');
  });

  it('prefers nickname over name on the card', () => {
    const players = makePlayers(1);
    players[0].name = 'Anders Andersen';
    players[0].nickname = 'AA';
    render(<HoleClient {...baseProps({ players })} />);
    expect(screen.getByText('AA')).toBeInTheDocument();
    expect(screen.queryByText('Anders Andersen')).not.toBeInTheDocument();
  });
});

describe('HoleClient — bottom CTA', () => {
  it('shows "Bekreft alle scorer" and is disabled when no cards confirmed', () => {
    render(<HoleClient {...baseProps()} />);
    const btn = screen.getByRole('button', { name: 'Bekreft alle scorer' });
    expect(btn.tagName).toBe('BUTTON');
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows "Neste hull · {N+1}" when all confirmed and not last hole', () => {
    useLiveQueryMock.mockReturnValue([
      { strokes: 4 },
      { strokes: 5 },
      { strokes: 3 },
      { strokes: 4 },
    ]);
    render(<HoleClient {...baseProps({ currentHole: 7 })} />);
    const link = screen.getByRole('link', { name: 'Neste hull · 8' });
    expect(link.getAttribute('href')).toBe('/games/g1/holes/8');
  });

  it('shows "Lever scorekort" on hole 18 when all confirmed', () => {
    useLiveQueryMock.mockReturnValue([
      { strokes: 4 },
      { strokes: 5 },
      { strokes: 3 },
      { strokes: 4 },
    ]);
    render(<HoleClient {...baseProps({ currentHole: 18 })} />);
    const link = screen.getByRole('link', { name: 'Lever scorekort' });
    expect(link.getAttribute('href')).toBe('/games/g1/submit');
  });
});

describe('HoleClient — onboarding banner', () => {
  it('shows banner on hole 1 by default', () => {
    render(<HoleClient {...baseProps({ currentHole: 1 })} />);
    expect(screen.getByText(/Prøv dette/)).toBeInTheDocument();
  });

  it('hides banner on hole 2', () => {
    render(<HoleClient {...baseProps({ currentHole: 2 })} />);
    expect(screen.queryByText(/Prøv dette/)).not.toBeInTheDocument();
  });

  it('respects dismissed flag in localStorage', () => {
    localStorage.setItem(ONBOARDING_KEY, '1');
    render(<HoleClient {...baseProps({ currentHole: 1 })} />);
    expect(screen.queryByText(/Prøv dette/)).not.toBeInTheDocument();
  });
});

describe('HoleClient — score writes', () => {
  it('tapping a ScoreCard fires writeScore and drainQueue', async () => {
    render(<HoleClient {...baseProps()} />);
    const cards = screen.getAllByRole('button', { name: /Sett score for/ });
    // The first ScoreCard belongs to u1 (myUserId in our base props).
    await act(async () => {
      fireEvent.click(cards[0]);
    });
    expect(writeScoreMock).toHaveBeenCalledTimes(1);
    expect(writeScoreMock).toHaveBeenCalledWith({
      gameId: 'g1',
      userId: 'u1',
      holeNumber: 1,
      strokes: 4,
      enteredBy: 'u1',
    });
    expect(drainQueueMock).toHaveBeenCalled();
  });
});
