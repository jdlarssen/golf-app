import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { headToHeadSummary } from '@/lib/leaderboard/headToHead';
import {
  HeadToHeadResult,
  type HeadToHeadResultProps,
  type StripCell,
} from './HeadToHeadResult';

// ONE structural render test (Type C, #2226). The duel math — winner, bar
// shares, verdict order, minus sign, tie and tiebreak — is Type A in
// lib/leaderboard/headToHead.test.ts. No Norwegian copy and no score digits
// here.

function defaultProps(): HeadToHeadResultProps {
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
  };
}

describe('HeadToHeadResult', () => {
  it('renders both sides, the bar from the summary, one strip cell per hole and a verdict naming the winner', () => {
    const props = defaultProps();
    render(<HeadToHeadResult {...props} />);

    const card = screen.getByTestId('head-to-head');
    expect(card.textContent).toContain('Alice Andersen');
    expect(card.textContent).toContain('Bjørnen');

    const { pctA, pctB } = headToHeadSummary({
      sideA: props.sideA,
      sideB: props.sideB,
      winnerUserId: props.winnerUserId,
      lowerWins: false,
    });
    const spans = screen.getByTestId('h2h-bar').querySelectorAll('span');
    expect(Array.from(spans, (span) => span.style.width)).toEqual([
      `${pctA}%`,
      `${pctB}%`,
    ]);

    expect(screen.getByTestId('h2h-strip').children).toHaveLength(props.strip.length);

    const verdict = within(card).getByTestId('h2h-verdict');
    expect(verdict.textContent).not.toBe('');
    expect(verdict.textContent).toContain('Alice Andersen');
  });
});
