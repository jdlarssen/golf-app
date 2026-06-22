import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  SoloStrokeplayView,
  type SoloStrokeplayPlayerInfo,
  type SoloStrokeplayViewProps,
} from './SoloStrokeplayView';
import type { SoloStrokeplayResult } from '@/lib/scoring/modes/types';

// SmartLink kaller useRouter — stub navigasjons-konteksten for jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

function makeResult(
  players: Array<{
    userId: string;
    totalNetStrokes: number;
    totalGrossStrokes: number;
    rank: number;
    holesPlayed: number;
  }>,
): SoloStrokeplayResult {
  return {
    kind: 'solo_strokeplay',
    players: players.map((p) => ({ ...p, tiedWith: [] })),
    // Per-hull-data brukes ikke av SoloStrokeplayView (totals-liste) — den
    // format-bevisste «Hull for hull»-flaten har egen render-test (#496).
    holes: [],
  };
}

function makePlayers(
  rows: Array<[string, string, string | null]>,
): Map<string, SoloStrokeplayPlayerInfo> {
  return new Map(
    rows.map(([userId, name, nickname]) => [userId, { name, nickname }]),
  );
}

function defaultProps(
  overrides: Partial<SoloStrokeplayViewProps> = {},
): SoloStrokeplayViewProps {
  return {
    gameId: 'g1',
    gameName: 'Sommerturnering',
    result: makeResult([
      { userId: 'u1', totalNetStrokes: 68, totalGrossStrokes: 78, rank: 1, holesPlayed: 18 },
      { userId: 'u2', totalNetStrokes: 72, totalGrossStrokes: 82, rank: 2, holesPlayed: 18 },
      { userId: 'u3', totalNetStrokes: 75, totalGrossStrokes: 80, rank: 3, holesPlayed: 18 },
      { userId: 'u4', totalNetStrokes: 80, totalGrossStrokes: 88, rank: 4, holesPlayed: 17 },
    ]),
    playersById: makePlayers([
      ['u1', 'Alice Andersen', null],
      ['u2', 'Bjørn Berg', 'Bjørnen'],
      ['u3', 'Camilla Carlsen', null],
      ['u4', 'David Dahl', null],
    ]),
    holesPlayed: 18,
    backHref: '/games/g1',
    ...overrides,
  };
}

describe('SoloStrokeplayView', () => {
  it('rendrer riktig antall rader', () => {
    render(<SoloStrokeplayView {...defaultProps()} />);
    const list = screen.getByTestId('strokeplay-leaderboard');
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(4);
  });

  it('viser «N hull spilt»-tekst per rad', () => {
    render(<SoloStrokeplayView {...defaultProps()} />);
    const list = screen.getByTestId('strokeplay-leaderboard');
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0].textContent).toContain('18 hull spilt');
    expect(rows[3].textContent).toContain('17 hull spilt');
  });

  // #638: undertittelen skal følge faktisk antall spilte hull, ikke hardkodet
  // 18 — ellers lyver headeren når runden avsluttes tidlig («Avslutt likevel»).
  it('viser faktisk antall spilte hull i undertittelen (ikke hardkodet 18)', () => {
    render(<SoloStrokeplayView {...defaultProps({ holesPlayed: 2 })} />);
    expect(screen.getByText(/Etter 2 hull/)).toBeInTheDocument();
  });

  it('viser «slag»-label per rad (ikke «poeng»)', () => {
    render(<SoloStrokeplayView {...defaultProps()} />);
    const list = screen.getByTestId('strokeplay-leaderboard');
    expect(within(list).getAllByText('slag').length).toBeGreaterThanOrEqual(1);
    expect(within(list).queryAllByText('poeng')).toHaveLength(0);
  });

  it('rendrer Medallion for topp 3, rank-disc for 4+', () => {
    render(<SoloStrokeplayView {...defaultProps()} />);
    const list = screen.getByTestId('strokeplay-leaderboard');
    const rows = within(list).getAllByRole('listitem');
    // Topp 3 → svg Medallion (har SVG-element inni)
    expect(rows[0].querySelector('svg')).not.toBeNull();
    expect(rows[1].querySelector('svg')).not.toBeNull();
    expect(rows[2].querySelector('svg')).not.toBeNull();
    // Rad 4+ → tekst-rank uten SVG
    expect(rows[3].querySelector('svg')).toBeNull();
    expect(rows[3].textContent).toMatch(/^4/);
  });

  it('netto-tallene har tabular-nums for konsistent skanning', () => {
    render(<SoloStrokeplayView {...defaultProps()} />);
    const list = screen.getByTestId('strokeplay-leaderboard');
    const rows = within(list).getAllByRole('listitem');
    // score-num er Fraunces-tall-tokenen; tabular-nums sikrer fast bredde.
    const scoreNumSpans = rows[0].querySelectorAll('.score-num');
    expect(scoreNumSpans.length).toBeGreaterThan(0);
    expect(scoreNumSpans[0].className).toMatch(/tabular-nums/);
  });

  it('formatRevealName brukes på navn med kallenavn (u2 har «Bjørnen»)', () => {
    render(<SoloStrokeplayView {...defaultProps()} />);
    const list = screen.getByTestId('strokeplay-leaderboard');
    // formatRevealName-formatet legger kallenavn i guillemeter mellom for- og etternavn.
    expect(list.textContent).toContain('Bjørnen');
  });

  it('viser «Ingen spillere å vise»-tekst når result.players er tomt', () => {
    render(
      <SoloStrokeplayView
        {...defaultProps({ result: makeResult([]) })}
      />,
    );
    expect(screen.getByText(/Ingen spillere å vise/i)).toBeInTheDocument();
  });

  it('faller tilbake til «(ukjent spiller)» hvis playerInfo mangler', () => {
    render(
      <SoloStrokeplayView
        {...defaultProps({
          result: makeResult([
            { userId: 'unknown', totalNetStrokes: 70, totalGrossStrokes: 80, rank: 1, holesPlayed: 18 },
          ]),
          playersById: new Map(),
        })}
      />,
    );
    expect(screen.getByText('(ukjent spiller)')).toBeInTheDocument();
  });

  it('header-sub-tittel inneholder «Slagspill»', () => {
    render(<SoloStrokeplayView {...defaultProps()} />);
    // Sub-tittelen står over leaderboard-listen og signaliserer modus.
    expect(screen.getByText(/Slagspill/i)).toBeInTheDocument();
  });

  it('header-sub-tittel inneholder «laveste netto» (ikke «høyeste poeng»)', () => {
    render(<SoloStrokeplayView {...defaultProps()} />);
    expect(screen.getByText(/laveste netto/i)).toBeInTheDocument();
    expect(screen.queryByText(/høyeste poeng/i)).toBeNull();
  });

});
