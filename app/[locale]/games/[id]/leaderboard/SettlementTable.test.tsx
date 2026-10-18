import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SettlementTable, type SettlementPlayerInfo } from './SettlementTable';
import type { Settlement } from '@/lib/scoring/settlement';

/**
 * Type C (#2296): the receipt's structure and the copy button. The amounts are
 * the engine's (lib/scoring/settlement.test.ts) and the text's
 * (lib/format/settlementText.test.ts); this only checks what is shown when.
 */

const writeTextMock = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  vi.clearAllMocks();
  writeTextMock.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: writeTextMock },
    configurable: true,
  });
});

const PLAYERS = new Map<string, SettlementPlayerInfo>([
  ['marte', { name: 'Marte Holm', nickname: 'Marte' }],
  ['kristian', { name: 'Kristian', nickname: null }],
  ['anders', { name: 'Anders', nickname: null }],
  ['jonas', { name: 'Jonas', nickname: null }],
]);

const SETTLEMENT: Settlement = {
  krPerUnit: 20,
  unitLabel: 'skin',
  perPlayer: [
    { userId: 'marte', units: 4, netKr: 40 },
    { userId: 'kristian', units: 3, netKr: 20 },
    { userId: 'anders', units: 1, netKr: -20 },
    { userId: 'jonas', units: 0, netKr: -40 },
  ],
  payments: [
    { fromUserId: 'jonas', toUserId: 'marte', kr: 40 },
    { fromUserId: 'anders', toUserId: 'kristian', kr: 20 },
  ],
};

function renderTable(props: { settlement?: Settlement; isFinal: boolean }) {
  return render(
    <SettlementTable
      settlement={props.settlement ?? SETTLEMENT}
      playersById={PLAYERS}
      gameName="Lørdagsrunden"
      mode="skins"
      isFinal={props.isFinal}
    />,
  );
}

describe('SettlementTable', () => {
  it('shows the receipt, and the copy button only when the game is over and someone pays', () => {
    const { rerender } = renderTable({ isFinal: true });

    const section = screen.getByRole('region', { name: 'Oppgjøret' });
    expect(within(section).getAllByRole('listitem')).toHaveLength(2);
    expect(within(section).getByTestId('settlement-copy')).toBeInTheDocument();

    // Live: «så langt», no button.
    rerender(
      <SettlementTable
        settlement={SETTLEMENT}
        playersById={PLAYERS}
        gameName="Lørdagsrunden"
        mode="skins"
        isFinal={false}
      />,
    );
    expect(screen.getByRole('region', { name: 'Oppgjøret så langt' })).toBeInTheDocument();
    expect(screen.queryByTestId('settlement-copy')).not.toBeInTheDocument();

    // Over, but nobody pays: no list and no button.
    rerender(
      <SettlementTable
        settlement={{ ...SETTLEMENT, payments: [] }}
        playersById={PLAYERS}
        gameName="Lørdagsrunden"
        mode="skins"
        isFinal
      />,
    );
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settlement-copy')).not.toBeInTheDocument();

    // The stake is formatted like the amounts: «1 000», not «1000».
    rerender(
      <SettlementTable
        settlement={{ ...SETTLEMENT, krPerUnit: 1000 }}
        playersById={PLAYERS}
        gameName="Lørdagsrunden"
        mode="skins"
        isFinal
      />,
    );
    expect(screen.getByText('1 000 kr per skin · 4 spillere')).toBeInTheDocument();

    // Inside a club's iframe (/embed) the browser refuses the clipboard: no button.
    const top = vi.spyOn(window, 'top', 'get').mockReturnValue({} as Window);
    try {
      rerender(
        <SettlementTable
          settlement={SETTLEMENT}
          playersById={PLAYERS}
          gameName="Lørdagsrunden"
          mode="skins"
          isFinal
        />,
      );
      expect(screen.getAllByRole('listitem')).toHaveLength(2);
      expect(screen.queryByTestId('settlement-copy')).not.toBeInTheDocument();
    } finally {
      top.mockRestore();
    }
  });

  it('copies the settlement as plain text and says so', async () => {
    renderTable({ isFinal: true });

    fireEvent.click(screen.getByTestId('settlement-copy'));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Kopiert!');
    });
    expect(writeTextMock).toHaveBeenCalledTimes(1);
    expect(writeTextMock.mock.calls[0][0]).toMatchInlineSnapshot(`
      "Oppgjør: Lørdagsrunden (Skins)
      20 kr per skin · 4 spillere

      Jonas betaler Marte 40 kr
      Anders betaler Kristian 20 kr

      Sluttsum:
      Marte +40 kr
      Kristian +20 kr
      Anders −20 kr
      Jonas −40 kr"
    `);
  });
});
