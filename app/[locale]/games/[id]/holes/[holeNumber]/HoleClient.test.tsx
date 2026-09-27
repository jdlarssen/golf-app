import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { Mock } from 'vitest';

// IMPORTANT: All mocks must be declared before importing the component under
// test, otherwise the module under test resolves the real implementations.

// The hole page's four Dexie live queries, mocked by name (#2226): each test
// sets what a hook returns, whatever order or how often HoleClient calls it.
// The glue inside the hooks is tested in holeLiveQueries.test.ts.
vi.mock('./holeLiveQueries', () => ({
  useHoleCards: vi.fn(),
  useMyScoredHoles: vi.fn(),
  useSiblingScoredHoles: vi.fn(),
  usePendingSyncCount: vi.fn(),
}));

// #1611: the hole seed now goes through the shared server->local merge, which
// runs inside a real Dexie transaction. Mocked at the module boundary like
// writeScore — the merge's own semantics are covered by mergeServerScore.test.ts.
vi.mock('@/lib/sync/mergeServerScore', () => ({
  mergeServerScore: vi.fn().mockResolvedValue('applied'),
}));

vi.mock('@/lib/sync/currentUser', () => ({
  currentDeviceUserId: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/sync/writeScore', () => ({
  writeScore: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/sync/syncWorker', () => ({
  drainQueue: vi.fn().mockResolvedValue(undefined),
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

// The BBB and Wolf hole screens re-read their rows through the browser client
// (#1950, #2092).
vi.mock('@/lib/bbb/readBingoBangoBongoHoles', () => ({
  readBingoBangoBongoHoles: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/wolf/readWolfChoices', () => ({
  readWolfChoices: vi.fn().mockResolvedValue([]),
}));

import { writeScore } from '@/lib/sync/writeScore';
import { drainQueue } from '@/lib/sync/syncWorker';
import { HoleClient, type HoleClientProps, ONBOARDING_KEY } from './HoleClient';
import {
  useHoleCards,
  useMyScoredHoles,
  usePendingSyncCount,
  useSiblingScoredHoles,
} from './holeLiveQueries';

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

/** A segment's full set of entered holes — «round complete» for that segment. */
const FRONT9_SCORED = Array.from({ length: 9 }, (_, i) => i + 1);
const BACK9_SCORED = Array.from({ length: 9 }, (_, i) => i + 10);

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
    myScoredHoles: [],
    players: makePlayers(),
    ...overrides,
  };
}

type LocalRow = { strokes?: number | null; putts?: number | null } | undefined;

/**
 * useHoleCards lays rows[i] on player i, as the Dexie read does. The holder is
 * read on every render, so a test can swap the rows between two renders — a
 * score arriving over realtime.
 */
function cardsFrom(holder: { rows: LocalRow[] }) {
  vi.mocked(useHoleCards).mockImplementation((_gameId, _hole, players) =>
    players.map((p, i) => ({
      ...p,
      score: holder.rows[i]?.strokes ?? null,
      putts: holder.rows[i]?.putts ?? null,
    })),
  );
}

function withLocalRows(rows: LocalRow[]) {
  cardsFrom({ rows });
}

function activeRowId(): string | null {
  const row = screen
    .getAllByTestId('flight-row')
    .find((r) => r.getAttribute('data-active') === 'true');
  return row?.getAttribute('data-player-id') ?? null;
}

function railButton(strokes: number): HTMLElement {
  const button = screen
    .getAllByTestId('rail-option')
    .find((b) => b.getAttribute('data-strokes') === String(strokes));
  if (!button) throw new Error(`no rail button for ${strokes}`);
  return button;
}

async function tap(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element);
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  // Defaults: no local scores, only the server's scored holes, no split-day
  // sibling, an empty sync queue.
  vi.mocked(useHoleCards).mockImplementation((_gameId, _hole, players) =>
    players.map((p) => ({ ...p, score: null, putts: null })),
  );
  vi.mocked(useMyScoredHoles).mockImplementation(
    (args) => new Set(args.myScoredHoles),
  );
  vi.mocked(useSiblingScoredHoles).mockReturnValue(null);
  vi.mocked(usePendingSyncCount).mockReturnValue(0);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('HoleClient — rendering', () => {
  it('renders one flight row per player (#2251)', () => {
    render(<HoleClient {...baseProps()} />);
    const rows = screen.getAllByTestId('flight-row');
    expect(rows.map((r) => r.getAttribute('data-player-id'))).toEqual([
      'u1',
      'u2',
      'u3',
      'u4',
    ]);
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

  it('prefers nickname over name on the row', () => {
    const players = makePlayers(1);
    players[0].name = 'Anders Andersen';
    players[0].nickname = 'AA';
    render(<HoleClient {...baseProps({ players })} />);
    const row = screen.getByTestId('flight-row');
    expect(row.textContent).toContain('AA');
    expect(row.textContent).not.toContain('Anders Andersen');
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
    withLocalRows([
      { strokes: 4 }, // u1 = myUserId — only mine is entered
      undefined,
      undefined,
      undefined,
    ]);
    render(<HoleClient {...baseProps({ currentHole: 7 })} />);
    const link = screen.getByRole('link', { name: 'Neste hull · 8' });
    expect(link.getAttribute('href')).toBe('/games/g1/holes/8');
  });

  it('shows "Lever scorekort" on hole 18 as soon as MY OWN score is entered (#1058)', () => {
    withLocalRows([
      { strokes: 4 }, // u1 = myUserId
      undefined,
      undefined,
      undefined,
    ]);
    render(<HoleClient {...baseProps({ currentHole: 18 })} />);
    const link = screen.getByRole('link', { name: 'Lever scorekort' });
    expect(link.getAttribute('href')).toBe('/games/g1/submit');
  });

  it('still activates the CTA when literally everyone has entered a score', () => {
    withLocalRows([
      { strokes: 4 },
      { strokes: 5 },
      { strokes: 3 },
      { strokes: 4 },
    ]);
    render(<HoleClient {...baseProps({ currentHole: 7 })} />);
    const link = screen.getByRole('link', { name: 'Neste hull · 8' });
    expect(link.getAttribute('href')).toBe('/games/g1/holes/8');
  });
});

describe('HoleClient — missing flight-mate scores hint (#1058)', () => {
  // #2251: on the rail the rows show «—» for a missing score, so the hint
  // only lives on in Bingo Bango Bongo, which keeps its cards.
  it.each(['best_ball', 'singles_matchplay', 'skins', 'wolf'] as const)(
    'shows no hint in %s — the rows already show who is missing',
    (gameMode) => {
      withLocalRows([{ strokes: 4 }, undefined, undefined, undefined]);
      render(<HoleClient {...baseProps({ gameMode })} />);
      expect(
        screen.queryByTestId('missing-flight-scores-hint'),
      ).not.toBeInTheDocument();
    },
  );

  it('BBB: shows a passive hint counting the other missing scores', () => {
    withLocalRows([
      { strokes: 4 }, // mine — entered
      undefined,
      undefined,
      { strokes: 5 },
    ]);
    render(<HoleClient {...baseProps({ gameMode: 'bingo_bango_bongo' })} />);
    const hint = screen.getByTestId('missing-flight-scores-hint');
    expect(hint.textContent).toContain('2');
  });

  it('BBB: my own missing score is not counted, and no hint when the rest are in', () => {
    // Nobody has entered anything: the hint counts the OTHER 3 cards only.
    const { unmount } = render(
      <HoleClient {...baseProps({ gameMode: 'bingo_bango_bongo' })} />,
    );
    expect(screen.getByTestId('missing-flight-scores-hint').textContent).toContain('3');
    unmount();

    withLocalRows([
      { strokes: 4 },
      { strokes: 5 },
      { strokes: 3 },
      { strokes: 4 },
    ]);
    render(<HoleClient {...baseProps({ gameMode: 'bingo_bango_bongo' })} />);
    expect(
      screen.queryByTestId('missing-flight-scores-hint'),
    ).not.toBeInTheDocument();
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
  it('a rail tap writes par for the active seat, drains, and moves the rail on (#2251)', async () => {
    // #2211: u2 has submitted — their row is locked, so the rail skips it and
    // a tap on the row selects nothing.
    const players = makePlayers();
    players[1] = { ...players[1], submitted: true };
    cardsFrom({ rows: [undefined, undefined, undefined, undefined] });
    render(<HoleClient {...baseProps({ players })} />);
    expect(activeRowId()).toBe('u1');

    await tap(screen.getAllByTestId('flight-row')[1]);
    expect(activeRowId()).toBe('u1');

    await tap(railButton(4));
    expect(writeScoreMock).toHaveBeenCalledTimes(1);
    expect(writeScoreMock).toHaveBeenCalledWith({
      gameId: 'g1',
      userId: 'u1',
      holeNumber: 1,
      strokes: 4,
      enteredBy: 'u1',
    });
    expect(drainQueueMock).toHaveBeenCalled();
    expect(activeRowId()).toBe('u3');
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
    withLocalRows([
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
    withLocalRows([
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

  it('shows the sync line while this round has strokes waiting', () => {
    // The UI side of #1370: HoleClient shows whatever usePendingSyncCount
    // gives. That the count leaves out other rounds' queue items is tested
    // in holeLiveQueries.test.ts.
    vi.mocked(usePendingSyncCount).mockReturnValue(1);
    render(<HoleClient {...baseProps({ gameId: 'g1' })} />);
    expect(vi.mocked(usePendingSyncCount)).toHaveBeenCalledWith('g1');
    expect(screen.getByTestId('sync-dot')).toBeInTheDocument();
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
    withLocalRows([
      undefined, // team 1 card — not entered
      { strokes: 5 }, // team 2 card (mine) — entered
    ]);
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
    withLocalRows([
      undefined, // team 1 — not entered
      { strokes: 5 }, // team 2 (mine) — entered
    ]);
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
    withLocalRows([
      { strokes: 4 }, // team 1 — entered
      undefined, // team 2 (mine) — not entered
    ]);
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

  it('resolves my card by userId — not by team — in an individual format (#1657)', () => {
    // The other direction of the same rule: the collapse must stay OFF for an
    // individual format. I am the THIRD player, so a wrongly-collapsed lookup
    // falls through the teamNumber match to cards[0] — Player 1's empty card —
    // and the CTA would still read «Tast inn scoren din».
    withLocalRows([
      undefined, // u1 — not entered
      undefined, // u2 — not entered
      { strokes: 5 }, // u3 = myUserId — entered
      undefined, // u4 — not entered
    ]);
    render(
      <HoleClient
        {...baseProps({ gameMode: 'solo_strokeplay', myUserId: 'u3' })}
      />,
    );
    const link = screen.getByRole('link', { name: 'Neste hull · 2' });
    expect(link.getAttribute('href')).toBe('/games/g1/holes/2');
  });
});

describe('HoleClient — deliver CTA for a non-captain (#1577)', () => {
  // The team's rows live under the captain's user_id, so a non-captain has no
  // rows of their own. Which holes count as mine (the owner rule) is decided
  // in useMyScoredHoles and tested in holeLiveQueries.test.ts; here only the
  // UI reaction: a complete set surfaces the deliver CTA.
  const teamCard: HoleClientProps['players'] = [
    {
      userId: 'a-captain',
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
  ];
  const WHOLE_ROUND = new Set(Array.from({ length: 18 }, (_, i) => i + 1));

  it('texas_scramble: a complete TEAM card surfaces the deliver CTA for the non-captain', () => {
    withLocalRows([{ strokes: 4 }]);
    vi.mocked(useMyScoredHoles).mockReturnValue(WHOLE_ROUND);
    const holeStripSibling = {
      gameId: 'g-back9',
      holes: [10, 11, 12, 13, 14, 15, 16, 17, 18],
      gameMode: 'texas_scramble' as const,
      teamOwnerId: 'a-captain',
      formerTeamRowOwnerIds: [],
      scoredHoles: [],
    };
    render(
      <HoleClient
        {...baseProps({
          gameMode: 'texas_scramble',
          currentHole: 7,
          players: teamCard,
          myUserId: 'u-viewer',
          myTeamNumber: 1,
          myTeamScoreOwnerId: 'a-captain',
          myFormerTeamRowOwnerIds: ['u-withdrawn'],
          myScoredHoles: [1, 2],
          holeStripSibling,
        })}
      />,
    );
    const link = screen.getByRole('link', { name: 'Lever lagets scorekort' });
    expect(link.getAttribute('href')).toBe('/games/g1/submit');

    // The props reach the hooks — with them mocked by name, nothing else
    // checks that HoleClient hands them over.
    expect(vi.mocked(useMyScoredHoles)).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: 'g1',
        gameMode: 'texas_scramble',
        myUserId: 'u-viewer',
        myTeamScoreOwnerId: 'a-captain',
        myFormerTeamRowOwnerIds: ['u-withdrawn'],
        myScoredHoles: [1, 2],
      }),
    );
    expect(vi.mocked(useSiblingScoredHoles)).toHaveBeenCalledWith({
      holeStripSibling,
      myUserId: 'u-viewer',
    });
  });

  it('patsome: a complete round surfaces the deliver CTA for the non-captain', () => {
    withLocalRows([{ strokes: 4 }]);
    vi.mocked(useMyScoredHoles).mockReturnValue(WHOLE_ROUND);
    render(
      <HoleClient
        {...baseProps({
          gameMode: 'patsome',
          currentHole: 7,
          players: teamCard,
          myUserId: 'u-viewer',
          myTeamNumber: 1,
          myTeamScoreOwnerId: 'a-captain',
        })}
      />,
    );
    const link = screen.getByRole('link', { name: 'Lever scorekort' });
    expect(link.getAttribute('href')).toBe('/games/g1/submit');
  });
});

describe('HoleClient — hole-segment scope (#1441)', () => {
  it('front9 game: hole 9 is the last hole, so the CTA offers "Lever scorekort" once my score is entered', () => {
    withLocalRows([{ strokes: 4 }, undefined, undefined, undefined]);
    render(
      <HoleClient {...baseProps({ currentHole: 9, holeSegment: 'front9' })} />,
    );
    const link = screen.getByRole('link', { name: 'Lever scorekort' });
    expect(link.getAttribute('href')).toBe('/games/g1/submit');
  });

  it('back9 game: hole 12 is NOT the last hole (18 is) — still shows "Neste hull"', () => {
    withLocalRows([{ strokes: 4 }, undefined, undefined, undefined]);
    render(
      <HoleClient {...baseProps({ currentHole: 12, holeSegment: 'back9' })} />,
    );
    const link = screen.getByRole('link', { name: 'Neste hull · 13' });
    expect(link.getAttribute('href')).toBe('/games/g1/holes/13');
  });

  it('back9 game: round is complete once 9 holes are filled (not 18) — CTA becomes submit even mid-round', () => {
    withLocalRows([{ strokes: 4 }, undefined, undefined, undefined]);
    render(
      <HoleClient
        {...baseProps({
          currentHole: 12,
          holeSegment: 'back9',
          myScoredHoles: BACK9_SCORED,
        })}
      />,
    );
    const link = screen.getByRole('link', { name: 'Lever scorekort' });
    expect(link.getAttribute('href')).toBe('/games/g1/submit');
  });

  it('front9 hole 9 with a resolved sibling: shows a secondary "Videre til hull 10" bridge link alongside the primary CTA (#1441 finding B)', () => {
    withLocalRows([{ strokes: 4 }, undefined, undefined, undefined]);
    render(
      <HoleClient
        {...baseProps({
          currentHole: 9,
          holeSegment: 'front9',
          segmentSibling: { gameId: 'back9-game', holeNumber: 10, gameMode: 'best_ball' },
        })}
      />,
    );
    // Primary CTA is untouched — still routes to this game's own submit flow.
    const submitLink = screen.getByRole('link', { name: 'Lever scorekort' });
    expect(submitLink.getAttribute('href')).toBe('/games/g1/submit');
    // Secondary bridge link navigates straight into the sibling's hole 10.
    const bridgeLink = screen.getByRole('link', {
      name: 'Videre til hull 10 · Best ball',
    });
    expect(bridgeLink.getAttribute('href')).toBe('/games/back9-game/holes/10');
  });

  it('front9 hole 9 with no sibling resolved: no bridge link renders', () => {
    withLocalRows([{ strokes: 4 }, undefined, undefined, undefined]);
    render(
      <HoleClient
        {...baseProps({ currentHole: 9, holeSegment: 'front9', segmentSibling: null })}
      />,
    );
    expect(screen.queryByText(/Videre til hull/)).toBeNull();
  });
});

// #1466 §2: broModus — a front9 host whose back9 sibling is undelivered. The
// broBridge prop is the materialized broModus decision (server-resolved). When
// set it REPLACES every «Lever scorekort» with the bridge to hole 10 and
// suppresses the duplicate secondary link. Null → self-healed (deliver returns).
describe('HoleClient — broModus (#1466)', () => {
  const broBridge = { gameId: 'back9-game', holeNumber: 10, gameMode: 'best_ball' as const };

  it('broModus on hole 9: the bridge REPLACES the deliver-CTA and no duplicate secondary link renders', () => {
    withLocalRows([{ strokes: 4 }, undefined, undefined, undefined]);
    render(
      <HoleClient
        {...baseProps({
          currentHole: 9,
          holeSegment: 'front9',
          // Boundary hole → both broBridge (primary) and segmentSibling
          // (secondary) would be set; secondary must be suppressed.
          segmentSibling: { gameId: 'back9-game', holeNumber: 10, gameMode: 'best_ball' },
          broBridge,
        })}
      />,
    );
    // No «Lever scorekort» anywhere — one delivery happens on the back9 host.
    expect(screen.queryByRole('link', { name: 'Lever scorekort' })).toBeNull();
    // Exactly ONE bridge link (the primary CTA), routing into the sibling.
    const bridges = screen.getAllByRole('link', {
      name: 'Videre til hull 10 · Best ball',
    });
    expect(bridges).toHaveLength(1);
    expect(bridges[0].getAttribute('href')).toBe('/games/back9-game/holes/10');
  });

  it('broModus on a mid-round front9 hole once complete: the bridge replaces the deliver-CTA there too (not just hole 9)', () => {
    render(
      <HoleClient
        {...baseProps({
          currentHole: 3,
          holeSegment: 'front9',
          myScoredHoles: FRONT9_SCORED, // roundComplete surfaces the CTA on every hole
          broBridge,
        })}
      />,
    );
    expect(screen.queryByRole('link', { name: 'Lever scorekort' })).toBeNull();
    const bridge = screen.getByRole('link', {
      name: 'Videre til hull 10 · Best ball',
    });
    expect(bridge.getAttribute('href')).toBe('/games/back9-game/holes/10');
  });

  it('self-healing: broBridge null (sibling delivered) → the deliver-CTA returns on the front9 host', () => {
    render(
      <HoleClient
        {...baseProps({
          currentHole: 3,
          holeSegment: 'front9',
          myScoredHoles: FRONT9_SCORED,
          // broBridge is null because the back9 was delivered (e.g. front9
          // rejected after the cascade) — the server passes no boundary bridge
          // off hole 9 anyway.
          segmentSibling: null,
          broBridge: null,
        })}
      />,
    );
    const submitLink = screen.getByRole('link', { name: 'Lever scorekort' });
    expect(submitLink.getAttribute('href')).toBe('/games/g1/submit');
  });
});

// #2251: the score rail. One test per row of the contract's edge-case table
// that isn't pure logic (those live in lib/scorecard/scoreRail.test.ts).
describe('HoleClient — score rail (#2251)', () => {
  const empty = (): LocalRow[] => [undefined, undefined, undefined, undefined];

  it('starts on my seat, walks 2 → 3 → 4 → 1, then shrinks to one line', async () => {
    cardsFrom({ rows: empty() });
    render(<HoleClient {...baseProps({ myUserId: 'u2' })} />);
    const seen: Array<string | null> = [activeRowId()];
    for (let i = 0; i < 4; i++) {
      await tap(railButton(4));
      seen.push(screen.queryByTestId('score-rail-all-scored') ? null : activeRowId());
    }
    expect(seen).toEqual(['u2', 'u3', 'u4', 'u1', null]);
    expect(screen.queryAllByTestId('rail-option')).toHaveLength(0);
  });

  it('«Neste: X →» skips a player without writing', async () => {
    cardsFrom({ rows: empty() });
    render(<HoleClient {...baseProps()} />);
    await tap(screen.getByTestId('score-rail-skip'));
    expect(activeRowId()).toBe('u2');
    expect(writeScoreMock).not.toHaveBeenCalled();
  });

  it('when I have withdrawn, the rail starts on the first empty seat that is not mine', () => {
    cardsFrom({ rows: empty() });
    render(<HoleClient {...baseProps({ withdrawn: true })} />);
    expect(activeRowId()).toBe('u2');
    expect((screen.getAllByTestId('flight-row')[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it('when everyone has a score on load: one line, and «Neste hull» is live', () => {
    withLocalRows([{ strokes: 4 }, { strokes: 5 }, { strokes: 3 }, { strokes: 4 }]);
    render(<HoleClient {...baseProps({ currentHole: 7 })} />);
    expect(screen.getByTestId('score-rail-all-scored')).toBeInTheDocument();
    expect(activeRowId()).toBeNull();
    expect(screen.getByRole('link', { name: 'Neste hull · 8' })).toBeInTheDocument();
  });

  it('with putts on, the rail waits on the player until a putt chip is picked', async () => {
    localStorage.setItem('torny:putts:g1', '1');
    cardsFrom({ rows: empty() });
    render(<HoleClient {...baseProps({ gameMode: 'stableford' })} />);
    await tap(railButton(4));
    expect(activeRowId()).toBe('u1');

    await tap(screen.getByRole('button', { name: '2 putter på Player 1' }));
    expect(writeScoreMock).toHaveBeenLastCalledWith({
      gameId: 'g1',
      userId: 'u1',
      holeNumber: 1,
      putts: 2,
      enteredBy: 'u1',
    });
    expect(activeRowId()).toBe('u2');
  });

  it('with putts on and putts already entered, the rail moves on at once', async () => {
    localStorage.setItem('torny:putts:g1', '1');
    cardsFrom({ rows: [{ putts: 2 }, undefined, undefined, undefined] });
    render(<HoleClient {...baseProps({ gameMode: 'stableford' })} />);
    await tap(railButton(4));
    expect(activeRowId()).toBe('u2');
  });

  it('a realtime score moves the rail on from a seat it chose, but not from a row the user picked', async () => {
    const holder = { rows: empty() };
    cardsFrom(holder);
    const props = baseProps();
    const { rerender } = render(<HoleClient {...props} />);
    expect(activeRowId()).toBe('u1');

    // A flight-mate's phone enters u1 — the rail chose u1 itself, so it moves.
    holder.rows = [{ strokes: 5 }, undefined, undefined, undefined];
    rerender(<HoleClient {...props} />);
    expect(activeRowId()).toBe('u2');

    // I pick u3's row; a score for u3 arrives — the rail stays on my choice.
    await tap(screen.getAllByTestId('flight-row')[2]);
    holder.rows = [{ strokes: 5 }, undefined, { strokes: 6 }, undefined];
    rerender(<HoleClient {...props} />);
    expect(activeRowId()).toBe('u3');
  });

  it('correcting a row: −/+ and «Angre» write, and the rail stays on it', async () => {
    cardsFrom({ rows: [{ strokes: 5 }, undefined, undefined, undefined] });
    render(<HoleClient {...baseProps()} />);
    expect(activeRowId()).toBe('u2');

    await tap(screen.getAllByTestId('flight-row')[0]);
    expect(activeRowId()).toBe('u1');
    await tap(screen.getByRole('button', { name: '-1 for Player 1' }));
    expect(writeScoreMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ userId: 'u1', strokes: 4 }),
    );
    await tap(screen.getByRole('button', { name: 'Nullstill scoren for Player 1' }));
    expect(writeScoreMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ userId: 'u1', strokes: null }),
    );
    expect(activeRowId()).toBe('u1');
  });

  it('«Annet» opens the sheet for the active player, and a pick moves the rail on', async () => {
    cardsFrom({ rows: empty() });
    render(<HoleClient {...baseProps()} />);
    await tap(screen.getByTestId('rail-other'));
    await tap(screen.getByRole('button', { name: 'Sett score til 9' }));
    expect(writeScoreMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ userId: 'u1', strokes: 9 }),
    );
    expect(activeRowId()).toBe('u2');
  });

  it('a plus handicap gets no «får slag», and the buttons show net strokes plus one', () => {
    const players = makePlayers();
    players[0] = { ...players[0], extraStrokes: -1 };
    cardsFrom({ rows: empty() });
    render(<HoleClient {...baseProps({ players })} />);
    expect(screen.getByTestId('score-rail-heading').textContent).toBe('Player 1');
    expect(railButton(4).getAttribute('aria-label')).toContain('netto 5');
  });

  it.each([
    { extra: 0, points: 2 },
    { extra: 1, points: 3 },
    { extra: 2, points: 4 },
  ])('stableford: par with $extra strokes on the hole shows $points points', ({ extra, points }) => {
    const players = makePlayers();
    players[0] = { ...players[0], extraStrokes: extra };
    cardsFrom({ rows: empty() });
    render(<HoleClient {...baseProps({ gameMode: 'stableford', players })} />);
    expect(railButton(4).getAttribute('aria-label')).toContain(`${points} poeng`);
  });

  it('modified stableford: bogey shows −1 and «Stryk» −3', async () => {
    cardsFrom({ rows: empty() });
    render(<HoleClient {...baseProps({ gameMode: 'modified_stableford' })} />);
    expect(railButton(5).getAttribute('aria-label')).toMatch(/[−-]1 poeng/);
    await tap(screen.getByTestId('rail-other'));
    expect(screen.getByTestId('specific-value-strike').textContent).toMatch(/[−-]3 p/);
  });

  it('reveal: the stroke badge stays, but no points and no net anywhere', async () => {
    const players = makePlayers();
    players[0] = { ...players[0], extraStrokes: 1 };
    cardsFrom({ rows: [undefined, { strokes: 4 }, undefined, undefined] });
    render(
      <HoleClient {...baseProps({ gameMode: 'stableford', hideNetto: true, players })} />,
    );
    expect(screen.getByTestId('score-rail-heading').textContent).toContain('1 slag');
    for (const option of screen.getAllByTestId('rail-option')) {
      expect(option.getAttribute('aria-label')).not.toMatch(/poeng|netto/);
    }
    expect(screen.queryByTestId('flight-row-points')).not.toBeInTheDocument();
    await tap(screen.getByTestId('rail-other'));
    expect(screen.getByTestId('specific-value-strike').textContent).toBe('Stryk');
  });

  const teamPlayers = (): HoleClientProps['players'] =>
    [1, 2].map((team) => ({
      userId: `captain-team-${team}`,
      name: `Lag ${team}`,
      nickname: null,
      initial: String(team),
      extraStrokes: 0,
      initialStrokes: null,
      initialPutts: null,
      initialClientUpdatedAt: null,
      initialServerUpdatedAt: null,
      submitted: false,
      teamNumber: team,
    }));

  it.each([
    { gameMode: 'texas_scramble' as const, currentHole: 1 },
    { gameMode: 'foursomes_matchplay' as const, currentHole: 1 },
    { gameMode: 'patsome' as const, currentHole: 7 },
  ])('$gameMode on hole $currentHole: one row per team, starting on my team', ({ gameMode, currentHole }) => {
    cardsFrom({ rows: [undefined, undefined] });
    render(
      <HoleClient
        {...baseProps({
          gameMode,
          currentHole,
          players: teamPlayers(),
          myUserId: 'im-not-the-captain',
          myTeamNumber: 2,
        })}
      />,
    );
    expect(screen.getAllByTestId('flight-row')).toHaveLength(2);
    expect(activeRowId()).toBe('captain-team-2');
  });

  it('patsome on holes 1–6 keeps one row per player', () => {
    cardsFrom({ rows: empty() });
    render(<HoleClient {...baseProps({ gameMode: 'patsome', currentHole: 3 })} />);
    expect(screen.getAllByTestId('flight-row')).toHaveLength(4);
  });

  it('Bingo Bango Bongo keeps its cards and has no rail', () => {
    render(<HoleClient {...baseProps({ gameMode: 'bingo_bango_bongo' })} />);
    expect(screen.getAllByTestId('score-card')).toHaveLength(4);
    expect(screen.queryByTestId('score-rail')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('flight-row')).toHaveLength(0);
  });

  it('a locked page hides the rail and leaves the rows read-only', () => {
    render(<HoleClient {...baseProps({ gameStatus: 'finished' })} />);
    expect(screen.queryByTestId('score-rail')).not.toBeInTheDocument();
    for (const row of screen.getAllByTestId('flight-row')) {
      expect((row as HTMLButtonElement).disabled).toBe(true);
    }
  });
});
