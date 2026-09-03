import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { CupWithdrawalContext } from '@/lib/cup/cupWithdrawalContext';

/**
 * Type C render-test per docs/test-discipline.md — ÉN test, kun struktur:
 * bekreftelsessiden skal bare tilby trekk-knappen når cupen faktisk er i gang.
 * Et utkast med genererte kamper rendret hele skjemaet, og serveren avviste
 * trykket med `wrong_status` (#1814). Selve regelen og handlingenes gater er
 * dekket av `lib/cup/withdrawalActions.test.ts`.
 */

const loadCupWithdrawalContext = vi.fn();
vi.mock('@/lib/cup/cupWithdrawalContext', () => ({
  loadCupWithdrawalContext: (args: unknown) => loadCupWithdrawalContext(args),
}));
// Form-handlerne drar med seg supabase-klientene; komponenten trenger bare
// referansene for `<form action=…>`.
vi.mock('@/lib/cup/withdrawalFormActions', () => ({
  submitCupWithdrawal: vi.fn(),
  submitUndoCupWithdrawal: vi.fn(),
}));

import { CupWithdrawConfirm } from './CupWithdrawConfirm';

function context(status: 'draft' | 'active' | 'finished'): CupWithdrawalContext {
  return {
    tournament: {
      id: 'cup-1',
      name: 'Ryder Cup 2026',
      status,
      group_id: null,
      team_1_name: 'Ørnene',
      team_2_name: 'Falkene',
    },
    player: { userId: 'p1', name: 'Kari' },
    pending: [
      {
        gameId: 'g1',
        matchLabel: 'Kamp 3',
        gameMode: 'singles_matchplay',
        status: 'scheduled',
        scheduledTeeOffAt: '2026-09-10T08:00:00.000Z',
        canPlayOn: false,
        playOn: false,
        partnerName: null,
        opponentLabel: 'Ola',
        side: 1,
        alreadyWithdrawn: false,
        outcome: {
          outcome: 'halved',
          winnerSide: 'tied',
          withdrawnSide: 1,
          withdrawnUserIds: ['p1'],
          late: false,
        },
      },
      // Fourball der makkeren alt er satt til å spille alene etter et
      // tidligere trekk: boksen skal speile det registrerte valget.
      {
        gameId: 'g2',
        matchLabel: 'Kamp 4',
        gameMode: 'fourball_matchplay',
        status: 'scheduled',
        scheduledTeeOffAt: '2026-09-11T08:00:00.000Z',
        canPlayOn: true,
        playOn: true,
        partnerName: 'Per',
        opponentLabel: 'Ola & Nils',
        side: 1,
        alreadyWithdrawn: false,
        outcome: null,
      },
    ],
    untouched: [],
  };
}

describe('CupWithdrawConfirm — cup-status-gaten (#1814)', () => {
  it.each([
    ['draft', false],
    ['finished', false],
    ['active', true],
  ] as const)('cup %s → skjema synlig: %s', async (status, formVisible) => {
    loadCupWithdrawalContext.mockResolvedValue(context(status));

    render(
      await CupWithdrawConfirm({
        tournamentId: 'cup-1',
        userId: 'p1',
        variant: 'admin',
      }),
    );

    if (formVisible) {
      expect(screen.queryByTestId('cup-withdraw-cup-not-active')).toBeNull();
      expect(screen.getByTestId('cup-withdraw-consequences')).toBeTruthy();
      expect(screen.getByRole('button')).toBeTruthy();
      // Registrert «spiller alene» må stå avkrysset — en umerket boks
      // skriver eksplisitt «etter regelen» og ville snudd valget.
      expect(
        (screen.getByTestId('cup-withdraw-playon-g2') as HTMLInputElement).checked,
      ).toBe(true);
    } else {
      expect(screen.getByTestId('cup-withdraw-cup-not-active')).toBeTruthy();
      expect(screen.queryByTestId('cup-withdraw-consequences')).toBeNull();
      expect(screen.queryByRole('button')).toBeNull();
    }
  });
});
