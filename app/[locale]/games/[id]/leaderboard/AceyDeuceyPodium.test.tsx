import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { AceyDeuceyPodium } from './AceyDeuceyPodium';
import type { AceyDeuceyPlayerInfo } from './AceyDeuceyView';
import type { AceyDeuceyResult, AceyDeuceyPlayerLine } from '@/lib/scoring/modes/types';

// SmartLink kaller useRouter — stub navigasjons-konteksten for jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

function makePlayerLine(
  userId: string,
  rank: number,
  total: number,
  aces: number,
  deuces: number,
  tiedWith: string[] = [],
): AceyDeuceyPlayerLine {
  return { userId, aces, deuces, total, rank, tiedWith };
}

function makeResult(players: AceyDeuceyPlayerLine[]): AceyDeuceyResult {
  // Per-hull-data brukes ikke av podiet (topp-3) — «Hull for hull»-flaten
  // har egen render-test.
  return { kind: 'acey_deucey', scoring: 'net', holes: [], players };
}

function makePlayers(
  rows: Array<[string, string, string | null]>,
): Map<string, AceyDeuceyPlayerInfo> {
  return new Map(rows.map(([userId, name, nickname]) => [userId, { name, nickname }]));
}

describe('AceyDeuceyPodium', () => {
  // Type C: nøyaktig ÉN render-test — delt-førsteplass-casen (#1573).
  it('delt førsteplass: begge medvinnere får champagne, medaljong «1» og «Delt 1. plass»-merke', () => {
    window.sessionStorage.clear();
    render(
      <AceyDeuceyPodium
        gameId="g1"
        gameName="Sommerturnering"
        result={makeResult([
          makePlayerLine('u1', 1, 12, 5, 1, ['u2']),
          makePlayerLine('u2', 1, 12, 5, 1, ['u1']),
          makePlayerLine('u3', 3, -6, 1, 3),
        ])}
        playersById={makePlayers([
          ['u1', 'Alice Andersen', null],
          ['u2', 'Bjørn Berg', 'Bjørnen'],
          ['u3', 'Camilla Carlsen', null],
        ])}
        backHref="/games/g1"
      />,
    );

    const podium = screen.getByTestId('acey-deucey-podium');
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

    // Tredjemann beholder bronse uten delt-merke.
    expect(slot3.dataset.rank).toBe('3');
    expect(within(slot3).getByTitle('3. plass')).toBeInTheDocument();
    expect(slot3.textContent).not.toContain('Delt');
  });
});
