import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { State4View } from './State4View';
import type { TeamLine } from '@/lib/leaderboard';

// SmartLink kaller useRouter — stub navigasjons-konteksten for jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

function makeTeam(opts: {
  teamNumber: number;
  playerName: string;
  total: number;
  rank: number;
  tiedWith?: number[];
}): TeamLine {
  return {
    teamNumber: opts.teamNumber,
    players: [
      {
        userId: `u${opts.teamNumber}`,
        name: opts.playerName,
        nickname: null,
        teamNumber: opts.teamNumber,
        courseHandicap: 10,
      },
    ],
    // Per-hull-data brukes ikke av reveal-viewet (hero + rader).
    holes: [],
    total: opts.total,
    missingHoles: [],
    rank: opts.rank,
    tiedWith: opts.tiedWith ?? [],
  };
}

describe('State4View', () => {
  // Type C: nøyaktig ÉN render-test — delt-leder-casen (#1372). Ikke-delt
  // presentasjon dekkes av at fiksen er betinget på tiedWith.
  it('delt ledelse: hero viser «Delt 1. plass» og det like-rangerte laget får gull-medaljong', () => {
    render(
      <State4View
        gameId="g1"
        gameName="Sommerturnering"
        teams={[
          makeTeam({ teamNumber: 1, playerName: 'Alice Andersen', total: 68, rank: 1, tiedWith: [2] }),
          makeTeam({ teamNumber: 2, playerName: 'Bjørn Berg', total: 68, rank: 1, tiedWith: [1] }),
          makeTeam({ teamNumber: 3, playerName: 'Camilla Carlsen', total: 74, rank: 3 }),
        ]}
        mode="netto"
        coursePar={72}
        holesPlayed={18}
        footerSlot={<div data-testid="footer-probe" />}
      />,
    );

    // Hale-seksjonen (premier, rundereferat, trukne spillere) må nå fram i
    // hovedgrenen også — ikke bare i tom-lag-grenen (#1695).
    expect(screen.getByTestId('footer-probe')).toBeInTheDocument();

    // Hero-badgen sier «Delt 1. plass» — ikke «Leder · 1. plass» …
    expect(screen.queryByText(/Leder ·/)).toBeNull();
    // … og delt-merket står på både hero-kortet og den like-rangerte raden.
    // (Regex: radens merke deler span med « · »-separatoren.)
    expect(screen.getAllByText(/Delt 1\. plass/)).toHaveLength(2);

    // Den like-rangerte raden (lag 2) får gull-medaljong «1»,
    // ikke linen-disc + «· delt» i muted.
    const rows = screen.getAllByRole('listitem');
    const tiedRow = rows[0]!;
    expect(within(tiedRow).getByTitle('1. plass')).toBeInTheDocument();
    expect(tiedRow.textContent).not.toContain('· delt');

    // Rank 3-raden beholder dagens presentasjon (bronse-medaljong).
    const thirdRow = rows[1]!;
    expect(within(thirdRow).getByTitle('3. plass')).toBeInTheDocument();
  });
});
