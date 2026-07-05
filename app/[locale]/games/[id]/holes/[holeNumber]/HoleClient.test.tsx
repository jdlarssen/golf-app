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
  const syncQueue = {
    toArray: vi.fn().mockResolvedValue([]),
  };
  return {
    localDb: { scores, syncQueue },
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

// Wolf/BBB subscribe helpers open a real Supabase realtime channel, which
// throws in jsdom without env vars. HoleClient only calls them when
// gameMode is wolf/bingo_bango_bongo (#1058 needs wolf coverage for the
// missing-scores hint) — stub both so those modes render without a live
// Supabase client.
vi.mock('@/lib/wolf/subscribeWolfChoices', () => ({
  subscribeWolfChoices: vi.fn(() => () => {}),
}));

vi.mock('@/lib/bbb/subscribeBingoBangoBongo', () => ({
  subscribeBingoBangoBongo: vi.fn(() => () => {}),
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
    initialPutts: null,
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

// useLiveQuery is called three times per HoleClient render:
//   1st: localRows (scores per player) — return [undefined,...] per player slot
//   2nd: localCompletedHoles (count) — return undefined (treated as 0)
//   3rd: syncQueue (pending items) — return [] (empty queue, no pending)
// Using mockImplementation with a counter lets each call return the right shape.
function defaultUseLiveQueryImpl() {
  let callCount = 0;
  return () => {
    callCount++;
    if (callCount === 1) return [undefined, undefined, undefined, undefined];
    if (callCount === 3) return [];
    return undefined;
  };
}

// Same 3-call contract as defaultUseLiveQueryImpl, but lets a test control
// exactly what localRows (1st call) resolves to — e.g. "my" card has a score
// while flight-mates' cards don't yet.
function useLiveQueryImplWithLocalRows(
  localRows: Array<{ strokes?: number | null; putts?: number | null } | undefined>,
) {
  let callCount = 0;
  return () => {
    callCount++;
    if (callCount === 1) return localRows;
    if (callCount === 3) return [];
    return undefined;
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  useLiveQueryMock.mockImplementation(defaultUseLiveQueryImpl());
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
  it('shows "Tast inn scoren din" and is disabled when MY OWN score is missing (#1058)', () => {
    // No scores at all — including mine (u1, cards[0]).
    render(<HoleClient {...baseProps()} />);
    const btn = screen.getByRole('button', { name: 'Tast inn scoren din' });
    expect(btn.tagName).toBe('BUTTON');
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows "Neste hull · {N+1}" as soon as MY OWN score is entered, even if flight-mates are missing (#1058)', () => {
    useLiveQueryMock.mockImplementation(
      useLiveQueryImplWithLocalRows([
        { strokes: 4 }, // u1 = myUserId — only mine is entered
        undefined,
        undefined,
        undefined,
      ]),
    );
    render(<HoleClient {...baseProps({ currentHole: 7 })} />);
    const link = screen.getByRole('link', { name: 'Neste hull · 8' });
    expect(link.getAttribute('href')).toBe('/games/g1/holes/8');
  });

  it('shows "Lever scorekort" on hole 18 as soon as MY OWN score is entered (#1058)', () => {
    useLiveQueryMock.mockImplementation(
      useLiveQueryImplWithLocalRows([
        { strokes: 4 }, // u1 = myUserId
        undefined,
        undefined,
        undefined,
      ]),
    );
    render(<HoleClient {...baseProps({ currentHole: 18 })} />);
    const link = screen.getByRole('link', { name: 'Lever scorekort' });
    expect(link.getAttribute('href')).toBe('/games/g1/submit');
  });

  it('still activates the CTA when literally everyone has entered a score', () => {
    useLiveQueryMock.mockImplementation(
      useLiveQueryImplWithLocalRows([
        { strokes: 4 },
        { strokes: 5 },
        { strokes: 3 },
        { strokes: 4 },
      ]),
    );
    render(<HoleClient {...baseProps({ currentHole: 7 })} />);
    const link = screen.getByRole('link', { name: 'Neste hull · 8' });
    expect(link.getAttribute('href')).toBe('/games/g1/holes/8');
  });
});

describe('HoleClient — missing flight-mate scores hint (#1058)', () => {
  it('shows no hint when nobody else is missing a score', () => {
    useLiveQueryMock.mockImplementation(
      useLiveQueryImplWithLocalRows([
        { strokes: 4 },
        { strokes: 5 },
        { strokes: 3 },
        { strokes: 4 },
      ]),
    );
    render(<HoleClient {...baseProps()} />);
    expect(
      screen.queryByTestId('missing-flight-scores-hint'),
    ).not.toBeInTheDocument();
  });

  it('shows a passive hint naming how many flight scores are missing on this hole', () => {
    useLiveQueryMock.mockImplementation(
      useLiveQueryImplWithLocalRows([
        { strokes: 4 }, // mine — entered
        undefined,
        undefined,
        { strokes: 5 },
      ]),
    );
    render(<HoleClient {...baseProps()} />);
    const hint = screen.getByTestId('missing-flight-scores-hint');
    expect(hint.textContent).toContain('2');
  });

  it('does not count my own missing score in the hint (that is the CTA disabled-state job)', () => {
    // Nobody has entered anything, including me — hint should count only
    // the OTHER 3 cards, not all 4.
    render(<HoleClient {...baseProps()} />);
    const hint = screen.getByTestId('missing-flight-scores-hint');
    expect(hint.textContent).toContain('3');
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

describe('HoleClient — modified stableford (#281)', () => {
  it('viser ikke lenger minus-poeng-banner på hull-skjermen', () => {
    render(<HoleClient {...baseProps({ gameMode: 'modified_stableford' })} />);
    expect(
      screen.queryByTestId('modified-stableford-banner'),
    ).not.toBeInTheDocument();
  });
});

describe('HoleClient — sync status line (#744)', () => {
  it('skjuler synkstatus-linjen på et tomt hull før første tastetrykk', () => {
    // On mount: syncing=false, savedAt='' — no real activity yet.
    // The SyncStatusLine must not appear to avoid a false "Lagret nylig" receipt.
    render(<HoleClient {...baseProps()} />);
    expect(screen.queryByTestId('sync-dot')).not.toBeInTheDocument();
  });
});

describe('HoleClient — own-card gate in team-collapsed modes (#1058)', () => {
  // Texas scramble: server collapses each team to ONE card, keyed on the
  // captain's userId. myUserId may not equal that captain's userId for
  // non-captain team members — "my card" must resolve via teamNumber, not
  // via cards[0].
  function makeTeamPlayers(): HoleClientProps['players'] {
    return [
      {
        userId: 'captain-team-1',
        name: 'Lag 1 · Ola, Kari',
        nickname: null,
        initial: '1',
        extraStrokes: 0,
        initialStrokes: null,
        initialPutts: null,
        initialClientUpdatedAt: null,
        initialServerUpdatedAt: null,
        submitted: false,
        teamNumber: 1,
      },
      {
        userId: 'captain-team-2',
        name: 'Lag 2 · Per, Anne',
        nickname: null,
        initial: '2',
        extraStrokes: 0,
        initialStrokes: null,
        initialPutts: null,
        initialClientUpdatedAt: null,
        initialServerUpdatedAt: null,
        submitted: false,
        teamNumber: 2,
      },
    ];
  }

  it('gates on MY team card (via teamNumber), not cards[0], for texas_scramble', () => {
    // I am a non-captain member of team 2 — my userId never appears as a
    // card userId, only teamNumber ties me to "Lag 2 · Per, Anne".
    useLiveQueryMock.mockImplementation(
      useLiveQueryImplWithLocalRows([
        undefined, // team 1 card — not entered
        { strokes: 5 }, // team 2 card (mine) — entered
      ]),
    );
    render(
      <HoleClient
        {...baseProps({
          gameMode: 'texas_scramble',
          players: makeTeamPlayers(),
          myUserId: 'im-not-the-captain',
          myTeamNumber: 2,
        })}
      />,
    );
    const link = screen.getByRole('link', { name: 'Neste hull · 2' });
    expect(link).toBeInTheDocument();
  });

  it('gates on MY team card for foursomes_matchplay (alternate-shot family)', () => {
    useLiveQueryMock.mockImplementation(
      useLiveQueryImplWithLocalRows([
        undefined, // team 1 — not entered
        { strokes: 5 }, // team 2 (mine) — entered
      ]),
    );
    render(
      <HoleClient
        {...baseProps({
          gameMode: 'foursomes_matchplay',
          players: makeTeamPlayers(),
          myUserId: 'im-not-the-captain',
          myTeamNumber: 2,
        })}
      />,
    );
    const link = screen.getByRole('link', { name: 'Neste hull · 2' });
    expect(link).toBeInTheDocument();
  });

  it('stays disabled when MY team card has no score yet, even if the other team is done', () => {
    useLiveQueryMock.mockImplementation(
      useLiveQueryImplWithLocalRows([
        { strokes: 4 }, // team 1 — entered
        undefined, // team 2 (mine) — not entered
      ]),
    );
    render(
      <HoleClient
        {...baseProps({
          gameMode: 'texas_scramble',
          players: makeTeamPlayers(),
          myUserId: 'im-not-the-captain',
          myTeamNumber: 2,
        })}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Tast inn scoren din' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('HoleClient — missing-score hint renders in team/pot formats (#1058)', () => {
  it.each(['singles_matchplay', 'skins', 'wolf'] as const)(
    'shows the hint for %s when a flight-mate score is missing',
    (gameMode) => {
      useLiveQueryMock.mockImplementation(
        useLiveQueryImplWithLocalRows([
          { strokes: 4 }, // mine
          undefined,
          undefined,
          undefined,
        ]),
      );
      render(<HoleClient {...baseProps({ gameMode })} />);
      expect(
        screen.getByTestId('missing-flight-scores-hint'),
      ).toBeInTheDocument();
    },
  );
});
