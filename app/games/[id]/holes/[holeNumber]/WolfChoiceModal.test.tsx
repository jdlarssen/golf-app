import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WolfChoiceModal } from './WolfChoiceModal';

// Mock server-action — vi tester at modalen kaller den med riktige args og
// håndterer suksess/feil-respons. Selve server-side-validering er testet i
// `lib/wolf/setWolfChoice.test.ts`.
const setWolfChoiceMock = vi.fn();
vi.mock('@/lib/wolf/setWolfChoice', () => ({
  setWolfChoice: (...args: unknown[]) => setWolfChoiceMock(...args),
}));

const OTHER_PLAYERS = [
  { userId: 'u2', name: 'Anders' },
  { userId: 'u3', name: 'Bente' },
  { userId: 'u4', name: 'Carl' },
];

function defaultProps(overrides: Partial<Parameters<typeof WolfChoiceModal>[0]> = {}) {
  return {
    isOpen: true,
    gameId: 'game-1',
    holeNumber: 3,
    wolfUserId: 'u1',
    otherPlayers: OTHER_PLAYERS,
    onClose: vi.fn(),
    onChoiceSaved: vi.fn(),
    ...overrides,
  };
}

describe('WolfChoiceModal', () => {
  beforeEach(() => {
    setWolfChoiceMock.mockReset();
    setWolfChoiceMock.mockResolvedValue({ ok: true });
  });

  it('rendrer ingenting når isOpen=false', () => {
    render(<WolfChoiceModal {...defaultProps({ isOpen: false })} />);
    expect(screen.queryByTestId('wolf-choice-modal')).toBeNull();
    expect(screen.queryByTestId('wolf-lone-button')).toBeNull();
  });

  it('rendrer 5 knapper når åpen (3 partnere + Lone + Blind)', () => {
    render(<WolfChoiceModal {...defaultProps()} />);
    expect(screen.getByTestId('wolf-partner-button-u2')).toBeTruthy();
    expect(screen.getByTestId('wolf-partner-button-u3')).toBeTruthy();
    expect(screen.getByTestId('wolf-partner-button-u4')).toBeTruthy();
    expect(screen.getByTestId('wolf-lone-button')).toBeTruthy();
    expect(screen.getByTestId('wolf-blind-button')).toBeTruthy();
  });

  it('viser navn på partner-knapper', () => {
    render(<WolfChoiceModal {...defaultProps()} />);
    expect(screen.getByText(/Partner: Anders/)).toBeTruthy();
    expect(screen.getByText(/Partner: Bente/)).toBeTruthy();
    expect(screen.getByText(/Partner: Carl/)).toBeTruthy();
  });

  it('klikk på partner-knapp kaller setWolfChoice med choice=partner + partnerUserId', async () => {
    const onChoiceSaved = vi.fn();
    const onClose = vi.fn();
    render(
      <WolfChoiceModal
        {...defaultProps({ onChoiceSaved, onClose })}
      />,
    );
    fireEvent.click(screen.getByTestId('wolf-partner-button-u3'));
    await waitFor(() => {
      expect(setWolfChoiceMock).toHaveBeenCalledWith({
        gameId: 'game-1',
        holeNumber: 3,
        wolfUserId: 'u1',
        choice: 'partner',
        partnerUserId: 'u3',
      });
    });
    expect(onChoiceSaved).toHaveBeenCalledWith('partner', 'u3');
    expect(onClose).toHaveBeenCalled();
  });

  it('klikk på Lone Wolf kaller setWolfChoice med choice=lone, partnerUserId=null', async () => {
    const onChoiceSaved = vi.fn();
    render(<WolfChoiceModal {...defaultProps({ onChoiceSaved })} />);
    fireEvent.click(screen.getByTestId('wolf-lone-button'));
    await waitFor(() => {
      expect(setWolfChoiceMock).toHaveBeenCalledWith(
        expect.objectContaining({
          choice: 'lone',
          partnerUserId: null,
        }),
      );
    });
    expect(onChoiceSaved).toHaveBeenCalledWith('lone', null);
  });

  it('klikk på Blind Wolf kaller setWolfChoice med choice=blind, partnerUserId=null', async () => {
    const onChoiceSaved = vi.fn();
    render(<WolfChoiceModal {...defaultProps({ onChoiceSaved })} />);
    fireEvent.click(screen.getByTestId('wolf-blind-button'));
    await waitFor(() => {
      expect(setWolfChoiceMock).toHaveBeenCalledWith(
        expect.objectContaining({
          choice: 'blind',
          partnerUserId: null,
        }),
      );
    });
    expect(onChoiceSaved).toHaveBeenCalledWith('blind', null);
  });

  it('viser feilmelding ved rls_denied uten å lukke modalen', async () => {
    setWolfChoiceMock.mockResolvedValueOnce({ ok: false, error: 'rls_denied' });
    const onClose = vi.fn();
    const onChoiceSaved = vi.fn();
    render(
      <WolfChoiceModal {...defaultProps({ onClose, onChoiceSaved })} />,
    );
    fireEvent.click(screen.getByTestId('wolf-lone-button'));
    await waitFor(() => {
      expect(screen.getByTestId('wolf-modal-error').textContent).toContain(
        'Wolf på dette hullet',
      );
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(onChoiceSaved).not.toHaveBeenCalled();
  });
});
