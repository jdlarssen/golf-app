import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { WolfPodium, type WolfPodiumProps } from './WolfPodium';
import type { WolfPlayerInfo } from './WolfView';
import type { WolfResult, WolfPlayerLine } from '@/lib/scoring/modes/types';

// SmartLink kaller useRouter — stub navigasjons-konteksten for jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

function makePlayerLine(
  userId: string,
  rank: number,
  totalPoints: number,
  wolfHolesPlayed: number,
  blindWolfWins = 0,
): WolfPlayerLine {
  return {
    userId,
    teamNumber: rank,
    totalPoints,
    wolfHolesPlayed,
    blindWolfWins,
    rank,
    tiedWith: [],
  };
}

function makeResult(players: WolfPlayerLine[]): WolfResult {
  return {
    kind: 'wolf',
    scoring: 'net',
    rotation: 'random_with_trailing',
    holes: [],
    players,
  };
}

function makePlayers(
  rows: Array<[string, string, string | null]>,
): Map<string, WolfPlayerInfo> {
  return new Map(
    rows.map(([userId, name, nickname]) => [userId, { name, nickname }]),
  );
}

function defaultProps(
  overrides: Partial<WolfPodiumProps> = {},
): WolfPodiumProps {
  return {
    gameId: 'g1',
    gameName: 'Sommer-Wolf',
    result: makeResult([
      makePlayerLine('u1', 1, 16, 5, 2),
      makePlayerLine('u2', 2, 10, 4, 0),
      makePlayerLine('u3', 3, 6, 6, 0),
      makePlayerLine('u4', 4, 2, 3, 0),
    ]),
    playersById: makePlayers([
      ['u1', 'Alice Andersen', null],
      ['u2', 'Bjørn Berg', 'Bjørnen'],
      ['u3', 'Camilla Carlsen', null],
      ['u4', 'David Dahl', null],
    ]),
    backHref: '/games/g1',
    ...overrides,
  };
}

describe('WolfPodium', () => {
  it('rendrer 1./2./3. plass med navn + poeng, Mest Wolf-hull-strip, og Blind Wolf-strip kun for spillere med blindWolfWins > 0', () => {
    window.sessionStorage.clear();
    render(<WolfPodium {...defaultProps()} />);

    // Podium-trinnene.
    const podium = screen.getByTestId('wolf-podium');
    const first = within(podium).getByTestId('podium-rank-1');
    const second = within(podium).getByTestId('podium-rank-2');
    const third = within(podium).getByTestId('podium-rank-3');

    expect(first.textContent).toContain('Alice Andersen');
    expect(first.textContent).toContain('16');
    expect(second.textContent).toContain('Bjørnen');
    expect(second.textContent).toContain('10');
    expect(third.textContent).toContain('Camilla Carlsen');
    expect(third.textContent).toContain('6');

    // 4.-plass i rest-listen.
    const rest = screen.getByTestId('wolf-rest');
    expect(rest.textContent).toContain('David Dahl');
    expect(rest.textContent).toContain('2');

    // Bragging-stats: Mest Wolf-hull → u3 (Camilla, 6).
    const mostHoles = screen.getByTestId('wolf-most-holes');
    expect(mostHoles.textContent).toContain('Mest Wolf-hull');
    expect(mostHoles.textContent).toContain('Camilla Carlsen');
    expect(mostHoles.textContent).toContain('(6)');

    // Blind Wolf-strip: kun u1 (Alice, 2 potter). u2/u3/u4 har 0 og skal ikke listes.
    const blindStrip = screen.getByTestId('wolf-blind-strip');
    const blindRows = within(blindStrip).getAllByRole('listitem');
    expect(blindRows).toHaveLength(1);
    expect(blindRows[0].textContent).toContain('Alice Andersen');
    expect(blindRows[0].textContent).toContain('2 potter');

    // Blind Wolf-strip skjules helt når INGEN har blindWolfWins.
    const { rerender } = render(
      <WolfPodium
        {...defaultProps({
          result: makeResult([
            makePlayerLine('u1', 1, 8, 5, 0),
            makePlayerLine('u2', 2, 6, 4, 0),
            makePlayerLine('u3', 3, 4, 6, 0),
            makePlayerLine('u4', 4, 2, 3, 0),
          ]),
        })}
      />,
    );
    // Vi har nå to render-rot — bruk queryAll for å sjekke at minst ett mangler.
    const allBlind = screen.queryAllByTestId('wolf-blind-strip');
    // Den første render-en hadde u1 med 2 potter → 1 strip. Den nye har ingen → fortsatt 1 totalt.
    expect(allBlind).toHaveLength(1);
    // Mest Wolf-hull skal fortsatt være tilstede i begge render-rot.
    const allMost = screen.queryAllByTestId('wolf-most-holes');
    expect(allMost.length).toBeGreaterThanOrEqual(2);
    // Bruk rerender bare for å unngå at TypeScript klager på unbrukt variabel.
    void rerender;
  });
});
