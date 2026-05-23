import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TeamSizeSelector } from './TeamSizeSelector';

describe('TeamSizeSelector', () => {
  it('rendrer tre tiles: Solo / Par / 4-mann i et radiogroup', () => {
    render(<TeamSizeSelector mode="stableford" value={1} onChange={() => {}} />);

    expect(
      screen.getByRole('group', { name: /velg lagstørrelse/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /solo/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /par/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /4-mann/i })).toBeInTheDocument();
  });

  it('Stableford: Solo aktiv, Par + 4-mann disabled med "kommer snart"', () => {
    render(<TeamSizeSelector mode="stableford" value={1} onChange={() => {}} />);

    const solo = screen.getByRole('radio', { name: /solo/i });
    const par = screen.getByRole('radio', { name: /par/i });
    const fourMann = screen.getByRole('radio', { name: /4-mann/i });

    expect(solo).not.toBeDisabled();
    expect(par).toBeDisabled();
    expect(fourMann).toBeDisabled();

    // "Kommer snart" på begge inaktive tiles.
    expect(screen.getAllByText(/kommer snart/i)).toHaveLength(2);
  });

  it('Best ball netto: Par aktiv, Solo + 4-mann disabled', () => {
    render(
      <TeamSizeSelector mode="best_ball_netto" value={2} onChange={() => {}} />,
    );

    const solo = screen.getByRole('radio', { name: /solo/i });
    const par = screen.getByRole('radio', { name: /par/i });
    const fourMann = screen.getByRole('radio', { name: /4-mann/i });

    expect(par).not.toBeDisabled();
    expect(solo).toBeDisabled();
    expect(fourMann).toBeDisabled();
  });

  it('caller onChange med ny størrelse når aktiv tile klikkes', () => {
    const onChange = vi.fn();
    render(
      <TeamSizeSelector mode="stableford" value={1} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole('radio', { name: /solo/i }));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('ignorerer klikk på disabled tile', () => {
    const onChange = vi.fn();
    render(
      <TeamSizeSelector mode="stableford" value={1} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole('radio', { name: /par/i }));
    fireEvent.click(screen.getByRole('radio', { name: /4-mann/i }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('markerer valgt tile med aria-checked=true', () => {
    render(
      <TeamSizeSelector mode="best_ball_netto" value={2} onChange={() => {}} />,
    );

    const par = screen.getByRole('radio', { name: /par/i });
    const solo = screen.getByRole('radio', { name: /solo/i });
    expect(par.getAttribute('aria-checked')).toBe('true');
    expect(solo.getAttribute('aria-checked')).toBe('false');
  });

  it('hele kontrollen disables via disabled-prop (for edit-flyten med mode-lock)', () => {
    const onChange = vi.fn();
    render(
      <TeamSizeSelector
        mode="best_ball_netto"
        value={2}
        onChange={onChange}
        disabled
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: /par/i }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: /par/i })).toBeDisabled();
  });
});
