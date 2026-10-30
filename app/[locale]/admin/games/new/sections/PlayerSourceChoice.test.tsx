import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useGameFormState } from '../useGameFormState';
import { PlayerSourceChoice } from './PlayerSourceChoice';

// Type C (docs/test-discipline.md): the step 4 choice «Hvordan får dere
// spillere?» (#2447). Which mode a card writes, when «Slipp venner direkte
// inn» shows, and the lock. Looks are compared with the artboard on staging.

function Harness({ locked = false }: { locked?: boolean }) {
  const state = useGameFormState({
    players: [],
    courses: [],
    ...(locked ? { initialValues: { lock_game_mode: true } } : {}),
  });
  return (
    <>
      <PlayerSourceChoice state={state} />
      <output data-testid="mode">{state.registrationMode}</output>
      <output data-testid="skip">{String(state.letFriendsSkipGate)}</output>
    </>
  );
}

describe('PlayerSourceChoice', () => {
  it('three cards in a named radiogroup, «Jeg velger dem nå» chosen from the start', () => {
    render(<Harness />);

    const group = screen.getByRole('radiogroup', { name: /hvordan får dere spillere\?/i });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual([
      'invite_only',
      'manual_approval',
      'open',
    ]);
    expect(screen.getByRole('radio', { name: /jeg velger dem nå/i })).toBeChecked();
    expect(screen.getByTestId('mode')).toHaveTextContent('invite_only');
  });

  it('says what each mode means, with the Find tournaments line on the two sign-up modes', () => {
    render(<Harness />);

    expect(screen.getByText('Bare de du velger, er med. Privat.')).toBeInTheDocument();
    expect(screen.getByText('Spillet vises i Finn turneringer.')).toBeInTheDocument();
    expect(
      screen.getByText('Alle med lenken kan melde seg på. Spillet vises i Finn turneringer.'),
    ).toBeInTheDocument();
  });

  it('a card writes its registration mode', () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('radio', { name: /åpen påmelding/i }));
    expect(screen.getByTestId('mode')).toHaveTextContent('open');
    fireEvent.click(screen.getByRole('radio', { name: /de ber om plass, jeg godkjenner/i }));
    expect(screen.getByTestId('mode')).toHaveTextContent('manual_approval');
    fireEvent.click(screen.getByRole('radio', { name: /jeg velger dem nå/i }));
    expect(screen.getByTestId('mode')).toHaveTextContent('invite_only');
  });

  it('«Slipp venner direkte inn» shows only under the approval card, and writes the flag', () => {
    render(<Harness />);
    const skip = /slipp venner direkte inn/i;

    expect(screen.queryByRole('checkbox', { name: skip })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /åpen påmelding/i }));
    expect(screen.queryByRole('checkbox', { name: skip })).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: /de ber om plass, jeg godkjenner/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: skip }));
    expect(screen.getByTestId('skip')).toHaveTextContent('true');

    fireEvent.click(screen.getByRole('radio', { name: /jeg velger dem nå/i }));
    expect(screen.queryByRole('checkbox', { name: skip })).toBeNull();
  });

  it('every card is disabled when the game mode is locked', () => {
    render(<Harness locked />);

    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
  });
});
