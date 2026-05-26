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

  it('sorterer på netto-slag (lavest øverst), respekterer rank-rekkefølgen fra compute', () => {
    render(<SoloStrokeplayView {...defaultProps()} />);
    const list = screen.getByTestId('strokeplay-leaderboard');
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0].textContent).toContain('68');
    expect(rows[0].textContent).toContain('Alice Andersen');
    expect(rows[1].textContent).toContain('72');
    expect(rows[2].textContent).toContain('75');
    expect(rows[3].textContent).toContain('80');
  });

  it('viser «N hull spilt»-tekst per rad', () => {
    render(<SoloStrokeplayView {...defaultProps()} />);
    const list = screen.getByTestId('strokeplay-leaderboard');
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0].textContent).toContain('18 hull spilt');
    expect(rows[3].textContent).toContain('17 hull spilt');
  });

  it('viser brutto-total ved siden av hull-spilt per rad', () => {
    render(<SoloStrokeplayView {...defaultProps()} />);
    const list = screen.getByTestId('strokeplay-leaderboard');
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0].textContent).toContain('78 brutto');
    expect(rows[1].textContent).toContain('82 brutto');
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

  it('tied spillere viser samme rank-nummer foran', () => {
    render(
      <SoloStrokeplayView
        {...defaultProps({
          result: makeResult([
            { userId: 'u1', totalNetStrokes: 70, totalGrossStrokes: 78, rank: 1, holesPlayed: 18 },
            { userId: 'u2', totalNetStrokes: 70, totalGrossStrokes: 80, rank: 1, holesPlayed: 18 },
            { userId: 'u3', totalNetStrokes: 75, totalGrossStrokes: 85, rank: 3, holesPlayed: 18 },
          ]),
        })}
      />,
    );
    const list = screen.getByTestId('strokeplay-leaderboard');
    const rows = within(list).getAllByRole('listitem');
    // Rad 1 + 2 begge på rank 1 (Medallion gull) — rad 3 hopper til rank 3.
    expect(rows[0].textContent).toContain('70');
    expect(rows[1].textContent).toContain('70');
    expect(rows[2].textContent).toContain('75');
  });
});
