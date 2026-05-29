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

describe('HoleClient — par-avvik-indikator (#240)', () => {
  it('viser ingen asterisk når parByGender ikke er satt', () => {
    render(<HoleClient {...baseProps()} />);
    expect(screen.queryByTestId('par-aside-marker')).not.toBeInTheDocument();
  });

  it('viser ingen asterisk når alle kjønn har samme par', () => {
    render(
      <HoleClient
        {...baseProps({
          par: 4,
          parByGender: { mens: 4, ladies: 4, juniors: 4 },
          playerGender: 'mens',
        })}
      />,
    );
    expect(screen.queryByTestId('par-aside-marker')).not.toBeInTheDocument();
  });

  it('viser asterisk når dame-par avviker, og tooltip ekskluderer egen kjønn', () => {
    render(
      <HoleClient
        {...baseProps({
          par: 4,
          parByGender: { mens: 4, ladies: 5, juniors: 4 },
          playerGender: 'mens',
        })}
      />,
    );
    const marker = screen.getByTestId('par-aside-marker');
    expect(marker).toBeInTheDocument();
    expect(marker.getAttribute('title')).toContain('Damer: 5');
    expect(marker.getAttribute('title')).toContain('Junior: 4');
    expect(marker.getAttribute('title')).not.toContain('Herrer');
  });

  it('viser asterisk når junior-par avviker for en damespiller', () => {
    render(
      <HoleClient
        {...baseProps({
          par: 5,
          parByGender: { mens: 4, ladies: 5, juniors: 4 },
          playerGender: 'ladies',
        })}
      />,
    );
    const marker = screen.getByTestId('par-aside-marker');
    expect(marker.getAttribute('title')).toContain('Herrer: 4');
    expect(marker.getAttribute('title')).toContain('Junior: 4');
    expect(marker.getAttribute('title')).not.toContain('Damer');
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

describe('HoleClient — stableford-modus', () => {
  it('viser «Dine poeng»-subtittel når gameMode=stableford', () => {
    render(
      <HoleClient
        {...baseProps({
          gameMode: 'stableford',
          myStablefordTotal: 12,
          myStablefordForCurrentHole: 0,
        })}
      />,
    );
    const subtitle = screen.getByTestId('stableford-total-subtitle');
    expect(subtitle).toBeInTheDocument();
    expect(subtitle.textContent).toContain('Dine poeng');
    expect(subtitle.textContent).toContain('12');
  });

  it('skjuler «Dine poeng»-subtittel for best-ball', () => {
    render(<HoleClient {...baseProps({ gameMode: 'best_ball' })} />);
    expect(
      screen.queryByTestId('stableford-total-subtitle'),
    ).not.toBeInTheDocument();
  });

  it('viser «Lever ditt scorekort» på siste hull for stableford', () => {
    useLiveQueryMock.mockReturnValue([
      { strokes: 4 },
      { strokes: 5 },
      { strokes: 3 },
      { strokes: 4 },
    ]);
    render(
      <HoleClient
        {...baseProps({ currentHole: 18, gameMode: 'stableford' })}
      />,
    );
    const link = screen.getByRole('link', { name: 'Lever ditt scorekort' });
    expect(link.getAttribute('href')).toBe('/games/g1/submit');
  });

  it('viser «Lever scorekort» (uten «ditt») for best-ball', () => {
    useLiveQueryMock.mockReturnValue([
      { strokes: 4 },
      { strokes: 5 },
      { strokes: 3 },
      { strokes: 4 },
    ]);
    render(
      <HoleClient
        {...baseProps({ currentHole: 18, gameMode: 'best_ball' })}
      />,
    );
    const link = screen.getByRole('link', { name: 'Lever scorekort' });
    expect(link.getAttribute('href')).toBe('/games/g1/submit');
  });

  it('passer stableford-poeng for current hull til ScoreCard når gameMode=stableford', () => {
    useLiveQueryMock.mockReturnValue([
      { strokes: 4 }, // u1 par på par 4 = 2 poeng
      undefined,
      undefined,
      undefined,
    ]);
    render(
      <HoleClient
        {...baseProps({
          gameMode: 'stableford',
          par: 4,
          myStablefordTotal: 0,
          myStablefordForCurrentHole: 0,
        })}
      />,
    );
    // Helper-text på første kort skal vise «Netto 4 · 2 poeng»
    const helpers = screen.getAllByTestId('helper-text');
    expect(helpers[0].textContent).toBe('Netto 4 · 2 poeng');
  });

  it('passer ikke stableford-poeng til ScoreCard for best-ball-modus', () => {
    useLiveQueryMock.mockReturnValue([
      { strokes: 4 },
      undefined,
      undefined,
      undefined,
    ]);
    render(
      <HoleClient
        {...baseProps({ gameMode: 'best_ball', par: 4 })}
      />,
    );
    const helpers = screen.getAllByTestId('helper-text');
    // Best-ball-modus: kun «Netto 4», ingen «poeng»-suffix
    expect(helpers[0].textContent).toBe('Netto 4');
  });
});

describe('HoleClient — modified stableford negativ-poeng-varsel (#281)', () => {
  it('viser minus-poeng-banner når gameMode=modified_stableford, ikke for standard stableford', () => {
    const { rerender } = render(
      <HoleClient {...baseProps({ gameMode: 'modified_stableford' })} />,
    );
    const banner = screen.getByTestId('modified-stableford-banner');
    expect(banner).toBeInTheDocument();
    expect(banner.textContent).toContain('minus');

    rerender(<HoleClient {...baseProps({ gameMode: 'stableford' })} />);
    expect(
      screen.queryByTestId('modified-stableford-banner'),
    ).not.toBeInTheDocument();
  });
});
