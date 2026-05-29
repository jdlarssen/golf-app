import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BingoBangoBongoEntry } from './BingoBangoBongoEntry';

// Mock server-action — vi tester at komponenten kaller den med riktige args og
// håndterer suksess/feil-respons. Selve server-side-validering er testet i
// `lib/bbb/setBingoBangoBongoHole.test.ts`.
const setBingoBangoBongoHoleMock = vi.fn();
vi.mock('@/lib/bbb/setBingoBangoBongoHole', () => ({
  setBingoBangoBongoHole: (...args: unknown[]) =>
    setBingoBangoBongoHoleMock(...args),
}));

const PLAYERS = [
  { userId: 'u1', name: 'Anders' },
  { userId: 'u2', name: 'Bente' },
  { userId: 'u3', name: 'Carl' },
];

function defaultProps(
  overrides: Partial<Parameters<typeof BingoBangoBongoEntry>[0]> = {},
) {
  return {
    gameId: 'game-1',
    holeNumber: 5,
    players: PLAYERS,
    savedHole: null,
    disabled: false,
    onSaved: vi.fn(),
    ...overrides,
  };
}

describe('BingoBangoBongoEntry', () => {
  beforeEach(() => {
    setBingoBangoBongoHoleMock.mockReset();
    setBingoBangoBongoHoleMock.mockResolvedValue({ ok: true });
  });

  it('rendrer tre rader — Bingo, Bango, Bongo', () => {
    render(<BingoBangoBongoEntry {...defaultProps()} />);
    expect(screen.getByTestId('bbb-row-bingoUserId')).toBeTruthy();
    expect(screen.getByTestId('bbb-row-bangoUserId')).toBeTruthy();
    expect(screen.getByTestId('bbb-row-bongoUserId')).toBeTruthy();
  });

  it('rendrer alle spillere som chips pluss Ingen-knapp for alle rader', () => {
    render(<BingoBangoBongoEntry {...defaultProps()} />);
    // Tre kategorier × tre spillere
    expect(screen.getAllByTestId(/bbb-chip-bingoUserId-u\d/)).toHaveLength(3);
    expect(screen.getAllByTestId(/bbb-chip-bangoUserId-u\d/)).toHaveLength(3);
    expect(screen.getAllByTestId(/bbb-chip-bongoUserId-u\d/)).toHaveLength(3);
    // Ingen-knapp per rad
    expect(screen.getByTestId('bbb-chip-bingoUserId-ingen')).toBeTruthy();
    expect(screen.getByTestId('bbb-chip-bangoUserId-ingen')).toBeTruthy();
    expect(screen.getByTestId('bbb-chip-bongoUserId-ingen')).toBeTruthy();
  });

  it('reflekterer lagret valg — valgt spiller er markert som pressed', () => {
    render(
      <BingoBangoBongoEntry
        {...defaultProps({
          savedHole: {
            holeNumber: 5,
            bingoUserId: 'u1',
            bangoUserId: 'u2',
            bongoUserId: null,
          },
        })}
      />,
    );
    expect(
      screen.getByTestId('bbb-chip-bingoUserId-u1').getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByTestId('bbb-chip-bangoUserId-u2').getAttribute('aria-pressed'),
    ).toBe('true');
    // Bongo er null → Ingen-knappen er pressed
    expect(
      screen.getByTestId('bbb-chip-bongoUserId-ingen').getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('klikk på spiller-chip kaller setBingoBangoBongoHole og onSaved', async () => {
    const onSaved = vi.fn();
    render(<BingoBangoBongoEntry {...defaultProps({ onSaved })} />);

    fireEvent.click(screen.getByTestId('bbb-chip-bingoUserId-u2'));

    await waitFor(() => {
      expect(setBingoBangoBongoHoleMock).toHaveBeenCalledWith({
        gameId: 'game-1',
        holeNumber: 5,
        bingoUserId: 'u2',
        bangoUserId: null,
        bongoUserId: null,
      });
    });
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ bingoUserId: 'u2' }),
    );
  });

  it('viser feilmelding og tilbakestiller ved ok:false', async () => {
    setBingoBangoBongoHoleMock.mockResolvedValueOnce({
      ok: false,
      error: 'rls_denied',
    });
    const onSaved = vi.fn();
    render(<BingoBangoBongoEntry {...defaultProps({ onSaved })} />);

    fireEvent.click(screen.getByTestId('bbb-chip-bingoUserId-u1'));

    await waitFor(() => {
      expect(screen.getByTestId('bbb-error').textContent).toContain(
        'Kunne ikke lagre',
      );
    });
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('disabler alle knapper når disabled=true', () => {
    render(<BingoBangoBongoEntry {...defaultProps({ disabled: true })} />);
    const buttons = screen
      .getAllByRole('button')
      .filter((b) => b.getAttribute('data-testid')?.startsWith('bbb-chip'));
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((btn) => {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    });
  });
});
