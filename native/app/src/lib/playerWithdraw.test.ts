// #1954 A1: når en spiller kan trekke seg selv i appen. Reglene er webbens
// (`games/[id]/(home)/page.tsx` og `trekk-fra/page.tsx`): før start for alle
// påmeldte utenom cup-kamper, under runden når formatet kjenner frafall.
import { playerWithdrawKind } from './playerWithdraw';

const base = { status: 'scheduled', gameMode: 'stableford', tournamentId: null } as const;

describe('playerWithdrawKind', () => {
  it('gir før-start-trekket i et planlagt eller utkast-spill', () => {
    expect(playerWithdrawKind(base, { withdrawnAt: null }, false)).toBe('pre-start');
    expect(playerWithdrawKind({ ...base, status: 'draft' }, { withdrawnAt: null }, true)).toBe(
      'pre-start',
    );
  });

  it('gir det myke trekket i en aktiv runde når formatet kjenner frafall', () => {
    expect(playerWithdrawKind({ ...base, status: 'active' }, { withdrawnAt: null }, false)).toBe(
      'active',
    );
  });

  it('viser ingenting for arrangøren i en aktiv runde: arrangør-seksjonen har knappen', () => {
    expect(playerWithdrawKind({ ...base, status: 'active' }, { withdrawnAt: null }, true)).toBeNull();
  });

  it('viser ingenting når spilleren alt er trukket, ikke er med, eller runden er ferdig', () => {
    expect(playerWithdrawKind(base, { withdrawnAt: '2026-10-18T10:00:00Z' }, false)).toBeNull();
    expect(playerWithdrawKind(base, undefined, false)).toBeNull();
    expect(playerWithdrawKind({ ...base, status: 'finished' }, { withdrawnAt: null }, false)).toBeNull();
  });

  it('viser ingenting før start i en cup-kamp: der trekker man seg på cup-siden', () => {
    expect(playerWithdrawKind({ ...base, tournamentId: 'cup-1' }, { withdrawnAt: null }, false)).toBeNull();
  });

  it('viser ingenting under runden i et format uten frafall', () => {
    expect(
      playerWithdrawKind(
        { ...base, status: 'active', gameMode: 'singles_matchplay' },
        { withdrawnAt: null },
        false,
      ),
    ).toBeNull();
  });
});
