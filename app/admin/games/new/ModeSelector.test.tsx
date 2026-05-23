import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModeSelector } from './ModeSelector';

describe('ModeSelector', () => {
  it('rendrer to tiles: Stableford og Best ball netto, gruppert i et radiogroup', () => {
    render(<ModeSelector value="best_ball_netto" onChange={() => {}} />);

    expect(
      screen.getByRole('group', { name: /velg spillmodus/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /stableford/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /best ball/i })).toBeInTheDocument();
  });

  it('viser beskrivelses-tekst for hver modus', () => {
    render(<ModeSelector value="best_ball_netto" onChange={() => {}} />);

    expect(
      screen.getByText(/poeng per hull\. par = 2/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/sum av beste netto-resultat/i),
    ).toBeInTheDocument();
  });

  it('markerer valgt tile som checked via aria-checked', () => {
    render(<ModeSelector value="best_ball_netto" onChange={() => {}} />);

    const stbl = screen.getByRole('radio', { name: /stableford/i });
    const bbn = screen.getByRole('radio', { name: /best ball/i });
    expect(stbl.getAttribute('aria-checked')).toBe('false');
    expect(bbn.getAttribute('aria-checked')).toBe('true');
  });

  it('caller onChange med ny modus ved tile-klikk', () => {
    const onChange = vi.fn();
    render(<ModeSelector value="best_ball_netto" onChange={onChange} />);

    fireEvent.click(screen.getByRole('radio', { name: /stableford/i }));
    expect(onChange).toHaveBeenCalledWith('stableford');

    fireEvent.click(screen.getByRole('radio', { name: /best ball/i }));
    expect(onChange).toHaveBeenLastCalledWith('best_ball_netto');
  });

  it('ignorerer klikk når disabled=true', () => {
    const onChange = vi.fn();
    render(
      <ModeSelector value="best_ball_netto" onChange={onChange} disabled />,
    );

    fireEvent.click(screen.getByRole('radio', { name: /stableford/i }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
