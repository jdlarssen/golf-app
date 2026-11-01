import { describe, it, expect } from 'vitest';
import { buildAppCupWithdrawalView } from './buildAppCupWithdrawalView';
import type { CupWithdrawalContext, CupWithdrawalMatchView } from './cupWithdrawalContext';

/** Type A (#2752): konsekvenslista, slik `loadCupWithdrawalContext` regner den. */

const match = (gameId: string, overrides: Partial<CupWithdrawalMatchView> = {}): CupWithdrawalMatchView => ({
  gameId,
  matchLabel: gameId,
  gameMode: 'singles_matchplay',
  status: 'scheduled',
  scheduledTeeOffAt: null,
  canPlayOn: false,
  playOn: false,
  partnerName: null,
  opponentLabel: 'Kari',
  side: 1,
  alreadyWithdrawn: false,
  outcome: { outcome: 'halved' } as CupWithdrawalMatchView['outcome'],
  ...overrides,
});

const context = (pending: CupWithdrawalMatchView[], untouched: CupWithdrawalMatchView[] = []): CupWithdrawalContext => ({
  tournament: {
    id: 'cup',
    name: 'Klubbmesterskapet',
    status: 'active',
    group_id: null,
    team_1_name: 'Team Nord',
    team_2_name: 'Team Sør',
  },
  player: { userId: 'ola', name: 'Ola Kompis' },
  pending,
  untouched,
});

describe('utfallene', () => {
  it('halvert, walkover med lagnavnet, og makkeren som spiller alene', () => {
    const body = buildAppCupWithdrawalView(
      context([
        match('a'),
        match('b', { outcome: { outcome: 'walkover', winnerSide: 2 } as CupWithdrawalMatchView['outcome'] }),
        match('c', { outcome: null, partnerName: 'Tapp', canPlayOn: true, playOn: true }),
      ]),
      { isSelf: true },
    );
    expect(body.matches.map((m) => m.outcome)).toEqual([
      { kind: 'halved' },
      { kind: 'walkover', teamName: 'Team Sør' },
      { kind: 'playOn', partnerName: 'Tapp' },
    ]);
    expect(body.matches[2]).toMatchObject({ canPlayOn: true, playOn: true, partnerName: 'Tapp' });
  });

  it('datoen formateres på serveren, som på nettsiden. Uten tid: null', () => {
    const body = buildAppCupWithdrawalView(
      context([match('a', { scheduledTeeOffAt: '2026-11-02T09:30:00Z' }), match('b')]),
      { isSelf: true },
    );
    expect(body.matches[0].when).toBe('man. 2. nov');
    expect(body.matches[1].when).toBeNull();
  });
});

describe('hva skjermen er', () => {
  it('allerede trukket: ingen kamper å skrive, og skjermen snur til angring', () => {
    const body = buildAppCupWithdrawalView(context([match('a', { alreadyWithdrawn: true })]), { isSelf: false });
    expect(body.alreadyWithdrawn).toBe(true);
    expect(body.matches).toEqual([]);
    expect(body.player).toEqual({ userId: 'ola', name: 'Ola Kompis', isSelf: false });
  });

  it('kamper i gang står som urørte', () => {
    const body = buildAppCupWithdrawalView(context([], [match('i-gang', { status: 'active' })]), { isSelf: true });
    expect(body.alreadyWithdrawn).toBe(false);
    expect(body.untouched).toEqual([{ gameId: 'i-gang', label: 'i-gang' }]);
  });
});
