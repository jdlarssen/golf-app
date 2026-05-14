import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RevealBruttoView } from './RevealBruttoView';
import type { TeamLine } from '@/lib/leaderboard';

// Stub the realtime subscriber — it dial out to supabase channels and we don't
// care about them in render-only tests.
vi.mock('./PreRoundLeaderboard', () => ({
  PreRoundLeaderboardRealtime: () => null,
}));

function makeTeam(opts: {
  teamNumber: number;
  rank: number;
  total: number;
  players: Array<{
    userId: string;
    name: string;
    nickname: string | null;
    courseHandicap?: number;
  }>;
  /** Per (userId, holeNumber) gross strokes. */
  scores?: Array<{ userId: string; hole: number; gross: number }>;
}): TeamLine {
  const par = 4;
  const playedHoles = new Set(opts.scores?.map((s) => s.hole) ?? []);
  const holes = Array.from({ length: 9 }, (_, i) => {
    const holeNumber = i + 1;
    const players = opts.players.map((p) => {
      const scoreRow = opts.scores?.find(
        (s) => s.userId === p.userId && s.hole === holeNumber,
      );
      return {
        userId: p.userId,
        gross: scoreRow?.gross ?? null,
        extraStrokes: 0,
        net: scoreRow ? scoreRow.gross : null,
        isContributor: false,
      };
    });
    const grosses = players
      .map((pc) => pc.gross)
      .filter((g): g is number => g != null);
    return {
      holeNumber,
      par,
      strokeIndex: holeNumber,
      teamNet: grosses.length > 0 ? Math.min(...grosses) : null,
      contributorIds: [],
      players,
    };
  });
  return {
    teamNumber: opts.teamNumber,
    players: opts.players.map((p) => ({
      userId: p.userId,
      name: p.name,
      nickname: p.nickname,
      teamNumber: opts.teamNumber,
      courseHandicap: p.courseHandicap ?? 0,
    })),
    holes,
    total: opts.total,
    missingHoles: [...Array.from({ length: 9 - playedHoles.size })].map(
      (_, i) => i + playedHoles.size + 1,
    ),
    rank: opts.rank,
    tiedWith: [],
  };
}

describe('RevealBruttoView', () => {
  it('renders LIVE LEADERBOARD kicker, brutto subtitle, and tease text', () => {
    render(
      <RevealBruttoView
        gameId="g1"
        gameName="Sommerturnering"
        teams={[]}
        holesPlayed={0}
        backHref="/games/g1"
      />,
    );

    expect(screen.getByText('LIVE LEADERBOARD')).toBeInTheDocument();
    expect(
      screen.getByText(/Vinneren avsløres når runden er ferdig/),
    ).toBeInTheDocument();
    expect(screen.getByText('Brutto · etter 0 hull')).toBeInTheDocument();
  });

  it('renders team rows with brutto totals and per-player brutto sums', () => {
    const team = makeTeam({
      teamNumber: 3,
      rank: 1,
      total: 18,
      players: [
        { userId: 'u1', name: 'Karl Jensen', nickname: 'Knølkis' },
        { userId: 'u2', name: 'Per Olsen', nickname: null },
      ],
      scores: [
        { userId: 'u1', hole: 1, gross: 4 },
        { userId: 'u1', hole: 2, gross: 5 },
        { userId: 'u2', hole: 1, gross: 5 },
        { userId: 'u2', hole: 2, gross: 4 },
      ],
    });

    render(
      <RevealBruttoView
        gameId="g1"
        gameName="Sommerturnering"
        teams={[team]}
        holesPlayed={2}
        backHref="/games/g1/holes/2"
      />,
    );

    expect(screen.getByText('Lag 3')).toBeInTheDocument();
    // Total brutto column
    expect(screen.getByText('18')).toBeInTheDocument();
    // Per-player brutto sums (4 + 5 = 9 each)
    const nines = screen.getAllByText('9');
    expect(nines.length).toBeGreaterThanOrEqual(2);
    // Nickname rendering for u1 (Knølkis); first-name for u2 (Per)
    expect(screen.getByText('Knølkis')).toBeInTheDocument();
    expect(screen.getByText('Per')).toBeInTheDocument();
  });

  it('renders empty state when no teams are present', () => {
    render(
      <RevealBruttoView
        gameId="g1"
        gameName="Sommerturnering"
        teams={[]}
        holesPlayed={3}
        backHref="/games/g1"
      />,
    );
    expect(screen.getByText('Ingen lag å vise.')).toBeInTheDocument();
  });
});
