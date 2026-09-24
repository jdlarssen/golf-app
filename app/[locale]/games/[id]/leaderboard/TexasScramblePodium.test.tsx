import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { TexasScramblePodium } from './TexasScramblePodium';
import type { TexasScramblePlayerInfo } from './TexasScrambleView';
import type {
  TexasScrambleResult,
  TexasScrambleTeamLine,
} from '@/lib/scoring/modes/types';

// SmartLink kaller useRouter — stub navigasjons-konteksten for jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

function makeTeamLine(
  teamNumber: number,
  memberIds: string[],
  rank: number,
  totalNet: number,
  tiedWith: number[] = [],
  missingHoles: number[] = [],
): TexasScrambleTeamLine {
  return {
    teamNumber,
    members: memberIds.map((userId, i) => ({
      userId,
      courseHandicap: 12,
      isCaptain: i === 0,
    })),
    combinedCourseHandicap: 12 * memberIds.length,
    teamHandicap: 3,
    // Podiet leser bare hvor mange hull laget har en sum for (#1982).
    holes: Array.from({ length: 18 }, (_, i) => {
      const played = !missingHoles.includes(i + 1);
      return {
        holeNumber: i + 1,
        par: 4,
        strokeIndex: i + 1,
        teamGross: played ? 4 : null,
        teamExtraStrokes: 0,
        teamNet: played ? 4 : null,
      };
    }),
    totalNet,
    totalGross: totalNet + 3,
    missingHoles,
    rank,
    tiedWith,
  };
}

function makeResult(teams: TexasScrambleTeamLine[]): TexasScrambleResult {
  return { kind: 'texas_scramble', teams };
}

function makePlayers(
  rows: Array<[string, string, string | null]>,
): Map<string, TexasScramblePlayerInfo> {
  return new Map(rows.map(([userId, name, nickname]) => [userId, { name, nickname }]));
}

describe('TexasScramblePodium', () => {
  // Type C: nøyaktig ÉN render-test — delt-førsteplass-casen (#1573). Lag 1
  // mangler i tillegg to hull (#1982); regelen for når hulltallet vises eies av
  // `lib/leaderboard/holesColumn.test.ts`.
  it('delt førsteplass: begge medvinner-lag får champagne, medaljong «1» og «Delt 1. plass»-merke, og hulltallet står når ett lag mangler hull', () => {
    window.sessionStorage.clear();
    render(
      <TexasScramblePodium
        gameId="g1"
        gameName="Sommerturnering"
        result={makeResult([
          makeTeamLine(1, ['u1', 'u2'], 1, 66, [2], [17, 18]),
          makeTeamLine(2, ['u3', 'u4'], 1, 66, [1]),
          makeTeamLine(3, ['u5', 'u6'], 3, 74),
          makeTeamLine(4, ['u7', 'u8'], 4, 78),
        ])}
        playersById={makePlayers([
          ['u1', 'Alice Andersen', null],
          ['u2', 'Bjørn Berg', 'Bjørnen'],
          ['u3', 'Camilla Carlsen', null],
          ['u4', 'David Dahl', null],
          ['u5', 'Erik Eriksen', null],
          ['u6', 'Frida Frost', null],
          ['u7', 'Geir Grønn', null],
          ['u8', 'Hanne Holm', null],
        ])}
        holesPlayed={18}
        backHref="/games/g1"
      />,
    );

    const podium = screen.getByTestId('texas-podium');
    // Testid følger fortsatt slotten (posisjonen) — presentasjonen følger rank.
    const slot1 = within(podium).getByTestId('podium-rank-1');
    const slot2 = within(podium).getByTestId('podium-rank-2');
    const slot3 = within(podium).getByTestId('podium-rank-3');

    expect(slot1.dataset.rank).toBe('1');
    expect(slot2.dataset.rank).toBe('1');
    // Medvinneren på slot 2 skal ha champagne-accent og medaljong «1» — ikke sølv.
    expect(slot2.className).toMatch(/border-accent/);
    expect(within(slot2).getByTitle('1. plass')).toBeInTheDocument();
    expect(slot1.textContent).toContain('Delt 1. plass');
    expect(slot2.textContent).toContain('Delt 1. plass');

    // Tredjeplassen beholder bronse uten delt-merke.
    expect(slot3.dataset.rank).toBe('3');
    expect(within(slot3).getByTitle('3. plass')).toBeInTheDocument();
    expect(slot3.textContent).not.toContain('Delt');

    // #1982: lag 1 mangler to hull, så hulltallet står på hvert trinn og på
    // raden i restlista. Tallene selv er Type A (`teamHolesPlayed` i
    // `holesColumn.test.ts`).
    for (const slot of [slot1, slot2, slot3]) {
      expect(within(slot).getByTestId('row-holes')).toBeInTheDocument();
    }
    expect(
      within(screen.getByTestId('texas-rest')).getByTestId('row-holes'),
    ).toBeInTheDocument();
  });
});
