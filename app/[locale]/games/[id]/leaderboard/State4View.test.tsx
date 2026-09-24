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
  missingHoles?: number[];
}): TeamLine {
  const missingHoles = opts.missingHoles ?? [];
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
    // Reveal-viewet leser bare hvor mange hull laget har en sum for (#1982).
    holes: Array.from({ length: 18 }, (_, i) => ({
      holeNumber: i + 1,
      par: 4,
      strokeIndex: i + 1,
      teamNet: missingHoles.includes(i + 1) ? null : 4,
      contributorIds: [],
      players: [],
    })),
    total: opts.total,
    missingHoles,
    rank: opts.rank,
    tiedWith: opts.tiedWith ?? [],
  };
}

describe('State4View', () => {
  // Type C: nøyaktig ÉN render-test — delt-leder-casen (#1372). Ikke-delt
  // presentasjon dekkes av at fiksen er betinget på tiedWith. Lederlaget mangler
  // i tillegg to hull (#1982); regelen for når hulltallet vises eies av
  // `lib/leaderboard/holesColumn.test.ts`.
  it('delt ledelse: hero viser «Delt 1. plass», det like-rangerte laget får gull-medaljong og hulltallet står når ett lag mangler hull', () => {
    render(
      <State4View
        gameId="g1"
        gameName="Sommerturnering"
        teams={[
          makeTeam({
            teamNumber: 1,
            playerName: 'Alice Andersen',
            total: 68,
            rank: 1,
            tiedWith: [2],
            missingHoles: [17, 18],
          }),
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

    // #1982: manglende hull teller 0 i rangeringen, så laget med færre hull
    // havner oftest på hero-kortet. Hulltallet står der OG på hver rad: tre i
    // alt, to av dem i radene, altså det tredje på hero-kortet. Tallene selv
    // er Type A (`teamHolesPlayed` i `holesColumn.test.ts`).
    expect(screen.getAllByTestId('row-holes')).toHaveLength(3);
    expect(within(tiedRow).getByTestId('row-holes')).toBeInTheDocument();
    expect(within(thirdRow).getByTestId('row-holes')).toBeInTheDocument();
  });
});
