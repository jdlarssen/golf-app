import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  HeadToHeadResult,
  type HeadToHeadResultProps,
  type StripCell,
} from './HeadToHeadResult';

// SmartLink kaller useRouter — stub navigasjons-konteksten for jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

function defaultProps(
  overrides: Partial<HeadToHeadResultProps> = {},
): HeadToHeadResultProps {
  const strip: StripCell[] = ['a', 'halved', 'b', 'a', 'unplayed'];
  return {
    gameId: 'g1',
    gameName: 'Sommer-Skins',
    formatLabel: 'Skins · Netto',
    unitLabel: 'skins',
    sideA: {
      userId: 'u1',
      name: 'Alice Andersen',
      nickname: null,
      score: 5,
      subLabel: '4 hull vunnet',
    },
    sideB: {
      userId: 'u2',
      name: 'Bjørn Berg',
      nickname: 'Bjørnen',
      score: 3,
      subLabel: '2 hull vunnet',
    },
    winnerUserId: 'u1',
    strip,
    hangingNote: '1 skin hang igjen. Siste spilte hull ble delt.',
    backHref: '/games/g1',
    ...overrides,
  };
}

describe('HeadToHeadResult', () => {
  it('rendrer versus-kort, tug-of-war-bar, momentum-strip og dom', () => {
    render(<HeadToHeadResult {...defaultProps()} />);

    const card = screen.getByTestId('head-to-head');
    // Begge spillere + scorene.
    expect(card.textContent).toContain('Alice Andersen');
    expect(card.textContent).toContain('Bjørnen');
    expect(card.textContent).toContain('5');
    expect(card.textContent).toContain('3');

    // Tug-of-war-bar finnes.
    expect(screen.getByTestId('h2h-bar')).toBeTruthy();

    // Momentum-strip: ett felt per hull (5 i fixturen).
    const stripEl = screen.getByTestId('h2h-strip');
    expect(stripEl.children).toHaveLength(5);

    // Dom: vinner kåret med score-differansen.
    const verdict = within(card).getByTestId('h2h-verdict');
    expect(verdict.textContent).toContain('Alice Andersen');
    expect(verdict.textContent).toContain('vant duellen 5–3');
  });

  it('viser uavgjort når winnerUserId er null og scorene er like', () => {
    render(
      <HeadToHeadResult
        {...defaultProps({
          winnerUserId: null,
          sideA: {
            userId: 'u1',
            name: 'Alice Andersen',
            nickname: null,
            score: 3,
          },
          sideB: {
            userId: 'u2',
            name: 'Bjørn Berg',
            nickname: null,
            score: 3,
          },
          hangingNote: null,
        })}
      />,
    );
    const verdict = screen.getByTestId('h2h-verdict');
    expect(verdict.textContent).toContain('Uavgjort 3–3');
  });

  it('lowerWins: vinneren er lavest score, og dommen viser vinnerens score først', () => {
    // Slagspill-netto: u1 = 78 (lavest, vinner), u2 = 85. winnerUserId styrer
    // crown; dommen skal lese «78–85» (vinnerens lave score først), ikke «85–78».
    render(
      <HeadToHeadResult
        {...defaultProps({
          formatLabel: 'Slagspill · Netto',
          unitLabel: 'slag',
          lowerWins: true,
          winnerUserId: 'u1',
          sideA: { userId: 'u1', name: 'Jørgen Larsen', nickname: null, score: 78 },
          sideB: { userId: 'u2', name: 'Ola Olsen', nickname: null, score: 85 },
          hangingNote: null,
        })}
      />,
    );
    const verdict = screen.getByTestId('h2h-verdict');
    expect(verdict.textContent).toContain('Jørgen Larsen');
    expect(verdict.textContent).toContain('vant duellen 78–85');
  });

  it('tug-of-war-baren er robust mot negative scorer (modified stableford)', () => {
    // Modified stableford bruker netto-poeng der par = 0, så totaler kan bli
    // negative. u1 = +2 (vinner), u2 = −3 (taper). Baren skal ikke få negative
    // bredder, og vinneren skal få den største andelen.
    render(
      <HeadToHeadResult
        {...defaultProps({
          formatLabel: 'Modified Stableford',
          unitLabel: 'poeng',
          winnerUserId: 'u1',
          sideA: { userId: 'u1', name: 'Jørgen Larsen', nickname: null, score: 2 },
          sideB: { userId: 'u2', name: 'Ola Olsen', nickname: null, score: -3 },
          hangingNote: null,
        })}
      />,
    );
    const bar = screen.getByTestId('h2h-bar');
    const spans = bar.querySelectorAll('span');
    const widthA = (spans[0] as HTMLElement).style.width;
    const widthB = (spans[1] as HTMLElement).style.width;
    // Ingen negative bredder.
    expect(widthA.startsWith('-')).toBe(false);
    expect(widthB.startsWith('-')).toBe(false);
    // Vinner-siden (A, +2) får den største andelen.
    expect(parseInt(widthA, 10)).toBeGreaterThanOrEqual(parseInt(widthB, 10));
    expect(screen.getByTestId('h2h-verdict').textContent).toContain('Jørgen Larsen');
  });
});
