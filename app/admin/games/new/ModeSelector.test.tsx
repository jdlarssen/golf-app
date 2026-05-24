import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModeSelector } from './ModeSelector';

describe('ModeSelector', () => {
  it('rendrer fire tiles: Stableford, Best ball netto, Matchplay og Slagspill, gruppert i et radiogroup', () => {
    render(<ModeSelector value="best_ball_netto" onChange={() => {}} />);

    expect(
      screen.getByRole('group', { name: /velg spillmodus/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /stableford/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /best ball/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /matchplay/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /slagspill/i })).toBeInTheDocument();
  });

  it('viser beskrivelses-tekst for hver modus', () => {
    render(<ModeSelector value="best_ball_netto" onChange={() => {}} />);

    expect(
      screen.getByText(/poeng per hull\. par = 2/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/sum av beste netto-resultat/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/1v1 hull-for-hull/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/individuelt scorekort/i),
    ).toBeInTheDocument();
  });

  it('markerer valgt tile som checked via aria-checked', () => {
    render(<ModeSelector value="best_ball_netto" onChange={() => {}} />);

    const stbl = screen.getByRole('radio', { name: /stableford/i });
    const bbn = screen.getByRole('radio', { name: /best ball/i });
    const mp = screen.getByRole('radio', { name: /matchplay/i });
    const sl = screen.getByRole('radio', { name: /slagspill/i });
    expect(stbl.getAttribute('aria-checked')).toBe('false');
    expect(bbn.getAttribute('aria-checked')).toBe('true');
    expect(mp.getAttribute('aria-checked')).toBe('false');
    expect(sl.getAttribute('aria-checked')).toBe('false');
  });

  it('caller onChange med ny modus ved tile-klikk', () => {
    const onChange = vi.fn();
    render(<ModeSelector value="best_ball_netto" onChange={onChange} />);

    fireEvent.click(screen.getByRole('radio', { name: /stableford/i }));
    expect(onChange).toHaveBeenCalledWith('stableford');

    fireEvent.click(screen.getByRole('radio', { name: /best ball/i }));
    expect(onChange).toHaveBeenLastCalledWith('best_ball_netto');

    fireEvent.click(screen.getByRole('radio', { name: /matchplay/i }));
    expect(onChange).toHaveBeenLastCalledWith('singles_matchplay');

    fireEvent.click(screen.getByRole('radio', { name: /slagspill/i }));
    expect(onChange).toHaveBeenLastCalledWith('solo_strokeplay_netto');
  });

  it('matchplay-tile får aria-checked=true når value=singles_matchplay', () => {
    render(<ModeSelector value="singles_matchplay" onChange={() => {}} />);

    const mp = screen.getByRole('radio', { name: /matchplay/i });
    expect(mp.getAttribute('aria-checked')).toBe('true');
  });

  it('slagspill-tile får aria-checked=true når value=solo_strokeplay_netto', () => {
    render(<ModeSelector value="solo_strokeplay_netto" onChange={() => {}} />);

    const sl = screen.getByRole('radio', { name: /slagspill/i });
    expect(sl.getAttribute('aria-checked')).toBe('true');
  });

  it('ignorerer klikk når disabled=true', () => {
    const onChange = vi.fn();
    render(
      <ModeSelector value="best_ball_netto" onChange={onChange} disabled />,
    );

    fireEvent.click(screen.getByRole('radio', { name: /stableford/i }));
    fireEvent.click(screen.getByRole('radio', { name: /matchplay/i }));
    fireEvent.click(screen.getByRole('radio', { name: /slagspill/i }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
