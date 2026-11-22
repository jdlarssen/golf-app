import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SkinsPodium } from './SkinsPodium';
import type { SkinsPlayerInfo } from './SkinsView';
import type { SkinsResult, SkinsPlayerLine } from '@/lib/scoring/modes/types';

function makePlayerLine(
  userId: string,
  rank: number,
  totalSkins: number,
  holesWon: number,
  tiedWith: string[] = [],
): SkinsPlayerLine {
  return { userId, totalSkins, holesWon, rank, tiedWith };
}

function makeResult(players: SkinsPlayerLine[]): SkinsResult {
  // Per-hull-data brukes ikke av podiet (topp-3) — «Hull for hull»-flaten
  // har egen render-test.
  return { kind: 'skins', scoring: 'net', holes: [], players, carriedPot: 0 };
}

function makePlayers(
  rows: Array<[string, string, string | null]>,
): Map<string, SkinsPlayerInfo> {
  return new Map(rows.map(([userId, name, nickname]) => [userId, { name, nickname }]));
}

describe('SkinsPodium', () => {
  // Type C: nøyaktig ÉN render-test — delt-førsteplass-casen (#1573).
  it('delt førsteplass: begge medvinnere får champagne, medaljong «1» og «Delt 1. plass»-merke', () => {
    window.sessionStorage.clear();
    const { unmount } = render(
      <SkinsPodium
        gameId="g1"
        gameName="Sommerturnering"
        result={makeResult([
          makePlayerLine('u1', 1, 6, 4, ['u2']),
          makePlayerLine('u2', 1, 6, 4, ['u1']),
          makePlayerLine('u3', 3, 2, 2),
        ])}
        playersById={makePlayers([
          ['u1', 'Alice Andersen', null],
          ['u2', 'Bjørn Berg', 'Bjørnen'],
          ['u3', 'Camilla Carlsen', null],
        ])}
        backHref="/games/g1"
      />,
    );

    const podium = screen.getByTestId('skins-podium');
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
    // A winner is crowned with confetti.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Skins-vinneren kåret');
    expect(document.querySelectorAll('.confetti-piece').length).toBeGreaterThan(0);

    // Audit 2026-11-20: nobody took a skin → «Ingen vinner», no confetti, no
    // «Gratulerer.». A fresh game id, so the confetti is not held back as seen.
    window.sessionStorage.clear();
    unmount();
    render(
      <SkinsPodium
        gameId="g2"
        gameName="Sommerturnering"
        result={makeResult([
          makePlayerLine('u1', 1, 0, 0, ['u2', 'u3']),
          makePlayerLine('u2', 1, 0, 0, ['u1', 'u3']),
          makePlayerLine('u3', 1, 0, 0, ['u1', 'u2']),
        ])}
        playersById={makePlayers([
          ['u1', 'Alice Andersen', null],
          ['u2', 'Bjørn Berg', 'Bjørnen'],
          ['u3', 'Camilla Carlsen', null],
        ])}
        backHref="/games/g2"
      />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ingen vinner');
    expect(document.querySelectorAll('.confetti-piece')).toHaveLength(0);
    expect(screen.queryByText('Gratulerer.')).not.toBeInTheDocument();
  });
});
