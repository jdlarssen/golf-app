import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TeamSizeSelector } from './TeamSizeSelector';

// #478: velgeren viser kun lagstørrelsene formatet faktisk støtter — ingen
// grayed-out «kommer snart»-fliser lenger.
describe('TeamSizeSelector', () => {
  it('Stableford: viser kun Solo + 4BBB, ingen «kommer snart»', () => {
    render(<TeamSizeSelector mode="stableford" value={1} onChange={() => {}} />);

    expect(
      screen.getByRole('group', { name: /velg lagstørrelse/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /solo/i })).toBeInTheDocument();
    // Stableford-familien: team_size 2 vises som «4BBB», ikke «Par» (#282).
    expect(screen.getByRole('radio', { name: /4bbb/i })).toBeInTheDocument();
    // 4-mann finnes ikke for stableford → ingen tile, ingen «kommer snart».
    expect(
      screen.queryByRole('radio', { name: /4-mann/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/kommer snart/i)).not.toBeInTheDocument();
  });

  it('Best ball: viser kun «Par» (verken Solo eller 4-mann)', () => {
    render(<TeamSizeSelector mode="best_ball" value={2} onChange={() => {}} />);

    expect(screen.getByRole('radio', { name: /par/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('radio', { name: /solo/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('radio', { name: /4-mann/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('radio', { name: /4bbb/i }),
    ).not.toBeInTheDocument();
  });

  it('Texas scramble: viser Par + 4-mann, men ikke Solo (scramble er lag-spill)', () => {
    render(
      <TeamSizeSelector mode="texas_scramble" value={2} onChange={() => {}} />,
    );

    expect(screen.getByRole('radio', { name: /par/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /4-mann/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('radio', { name: /solo/i }),
    ).not.toBeInTheDocument();
  });

  it('caller onChange med valgt størrelse når en tile klikkes', () => {
    const onChange = vi.fn();
    render(
      <TeamSizeSelector mode="stableford" value={1} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole('radio', { name: /4bbb/i }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('markerer valgt tile med aria-checked=true', () => {
    render(<TeamSizeSelector mode="stableford" value={2} onChange={() => {}} />);

    expect(
      screen.getByRole('radio', { name: /4bbb/i }).getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      screen.getByRole('radio', { name: /solo/i }).getAttribute('aria-checked'),
    ).toBe('false');
  });

  it('hele kontrollen disables via disabled-prop (edit-flyten med mode-lock)', () => {
    const onChange = vi.fn();
    render(
      <TeamSizeSelector
        mode="best_ball"
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
