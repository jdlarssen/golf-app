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

  // #2453: én lagstørrelse er ikke et valg — den står som en linje.
  it('Best ball: én linje, ingen radiogruppe og ingen radio', () => {
    const { rerender } = render(
      <TeamSizeSelector mode="best_ball" value={2} onChange={() => {}} />,
    );

    expect(screen.getByTestId('team-size-line')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();

    // Ett par er ett lag: oppstillingen ville bare gjentatt størrelsen, så
    // linja står som uten antall.
    const withoutCount = screen.getByTestId('team-size-line').textContent;
    rerender(<TeamSizeSelector mode="best_ball" value={2} onChange={() => {}} playerCount={2} />);
    expect(screen.getByTestId('team-size-line').textContent).toBe(withoutCount);
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
        mode="texas_scramble"
        value={4}
        onChange={onChange}
        disabled
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: /par/i }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: /par/i })).toBeDisabled();
  });

  // #2453: med et kompis-antall står størrelsene som ikke går opp, grå. Hva
  // de sier for hvert antall, eier teamSizeFit (Type A); her bare at kortene
  // leser det.
  it('Texas med 4 spillere: Par er valgt, de andre er grå og sier hvorfor', () => {
    const { rerender } = render(
      <TeamSizeSelector
        mode="texas_scramble"
        value={2}
        onChange={() => {}}
        playerCount={4}
      />,
    );

    expect(
      screen.getByRole('radio', { name: /par/i }).getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      screen.getByRole('radio', { name: /tremannslag/i, description: /trenger 6/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole('radio', { name: /4-mann/i, description: /trenger 8/i }),
    ).toBeDisabled();

    // Beslutning 3: det valgte kortet er aldri grått, heller ikke når
    // størrelsen ikke går opp (et gammelt utkast med 4-mann og fire spillere).
    rerender(
      <TeamSizeSelector
        mode="texas_scramble"
        value={4}
        onChange={() => {}}
        playerCount={4}
      />,
    );
    const chosen = screen.getByRole('radio', { name: /4-mann/i });
    expect(chosen.getAttribute('aria-checked')).toBe('true');
    expect(chosen).not.toBeDisabled();
    expect(chosen).toHaveAccessibleDescription('');
  });
});
