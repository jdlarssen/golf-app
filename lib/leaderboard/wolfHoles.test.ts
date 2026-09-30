import { describe, expect, it } from 'vitest';
import type { WolfHoleRow, WolfResult } from '@/lib/scoring/modes/types';
import { wolfHoleCards } from './wolfHoles';

// #2255 PR 3b: «Hull for hull» for Wolf. Regnestykket bor her, så webbens
// visning og appens skjerm tegner de samme kortene.

function hole(overrides: Partial<WolfHoleRow> & { holeNumber: number }): WolfHoleRow {
  return {
    par: 4,
    strokeIndex: overrides.holeNumber,
    wolfUserId: 'ola',
    choice: 'partner',
    partnerUserId: 'kari',
    stake: 1,
    outcome: 'wolf_side_wins',
    players: [],
    pointsByPlayer: {},
    ...overrides,
  };
}

function result(holes: WolfHoleRow[], scoring: 'gross' | 'net' = 'net'): WolfResult {
  return {
    kind: 'wolf',
    scoring,
    rotation: 'random_with_trailing',
    holes,
    // Stillingen: Kari 1., Per og Ola delt 2. (fast rekkefølge: ola før per), Anne 4.
    players: [
      { userId: 'per', teamNumber: 3, totalPoints: 4, wolfHolesPlayed: 1, blindWolfWins: 0, rank: 2, tiedWith: ['ola'] },
      { userId: 'anne', teamNumber: 4, totalPoints: 1, wolfHolesPlayed: 1, blindWolfWins: 0, rank: 4, tiedWith: [] },
      { userId: 'kari', teamNumber: 2, totalPoints: 6, wolfHolesPlayed: 1, blindWolfWins: 0, rank: 1, tiedWith: [] },
      { userId: 'ola', teamNumber: 1, totalPoints: 4, wolfHolesPlayed: 1, blindWolfWins: 0, rank: 2, tiedWith: ['per'] },
    ],
  };
}

const cell = (userId: string, side: 'wolf' | 'opp' | null, gross: number | null, effectiveScore = gross) => ({
  userId,
  gross,
  effectiveScore,
  side,
  isContributor: false,
});

describe('wolfHoleCards', () => {
  it('ulvens side først (ulven selv først), så Andre, så uplasserte; ellers etter stillingen', () => {
    const cards = wolfHoleCards(
      result([
        hole({
          holeNumber: 1,
          players: [cell('anne', null, null), cell('per', 'opp', 5), cell('ola', 'wolf', 4), cell('kari', 'wolf', 4)],
        }),
      ]),
    );
    // Ola er ulv (standard i `hole`): først på sin side, selv om Kari leder stillingen.
    expect(cards.holes[0]!.rows.map((r) => r.userId)).toEqual(['ola', 'kari', 'per', 'anne']);

    const reversed = wolfHoleCards(
      result([
        hole({
          holeNumber: 1,
          players: [cell('kari', 'wolf', 4), cell('ola', 'wolf', 4), cell('per', 'opp', 5), cell('anne', null, null)].reverse(),
        }),
      ]),
    );
    expect(reversed.holes[0]!.rows.map((r) => r.userId)).toEqual(['ola', 'kari', 'per', 'anne']);
  });

  it('på ulvens side står ulven først, så partneren, selv om partneren ligger bedre an', () => {
    // Kari (1. i stillingen) er partner; Per (delt 2.) er ulv.
    const cards = wolfHoleCards(
      result([
        hole({
          holeNumber: 1,
          wolfUserId: 'per',
          partnerUserId: 'kari',
          players: [cell('kari', 'wolf', 4), cell('per', 'wolf', 5), cell('ola', 'opp', 5), cell('anne', 'opp', 6)],
        }),
      ]),
    );
    expect(cards.holes[0]!.rows.map((r) => r.userId)).toEqual(['per', 'kari', 'ola', 'anne']);
  });

  it('lone wolf: de tre andre står etter stillingen, uansett rekkefølgen inn', () => {
    // Ola er ulv alene. Andre: Kari (1.), Per (delt 2., lag 3), Anne (4.).
    const run = (order: string[]) =>
      wolfHoleCards(
        result([
          hole({
            holeNumber: 1,
            choice: 'lone',
            partnerUserId: null,
            players: [cell('ola', 'wolf', 4), ...order.map((id) => cell(id, 'opp', 5))],
          }),
        ]),
      ).holes[0]!.rows.map((r) => r.userId);
    expect(run(['anne', 'per', 'kari'])).toEqual(['ola', 'kari', 'per', 'anne']);
    expect(run(['per', 'kari', 'anne'])).toEqual(['ola', 'kari', 'per', 'anne']);
  });

  it('utfallets tone: ulvens seier i gull, de andres i tekst, ellers dempet', () => {
    const cards = wolfHoleCards(
      result([
        hole({ holeNumber: 1, outcome: 'wolf_side_wins' }),
        hole({ holeNumber: 2, outcome: 'opp_side_wins' }),
        hole({ holeNumber: 3, outcome: 'tied' }),
        hole({ holeNumber: 4, outcome: 'pending' }),
      ]),
    );
    expect(cards.holes.map((h) => h.outcomeTone)).toEqual(['accent', 'text', 'muted', 'muted']);
  });

  it('delt plass i stillingen ordnes likt på hullet uansett rekkefølgen inn', () => {
    const run = (order: string[]) =>
      wolfHoleCards(
        result([hole({ holeNumber: 1, players: order.map((id) => cell(id, 'opp', 5)) })]),
      ).holes[0]!.rows.map((r) => r.userId);
    expect(run(['per', 'ola'])).toEqual(['ola', 'per']);
    expect(run(['ola', 'per'])).toEqual(['ola', 'per']);
  });

  it('poengene kommer fra hullet og vises bare over 0', () => {
    const cards = wolfHoleCards(
      result([
        hole({
          holeNumber: 1,
          players: [cell('ola', 'wolf', 4), cell('per', 'opp', 5)],
          pointsByPlayer: { ola: 2 },
        }),
      ]),
    );
    expect(cards.holes[0]!.rows.map((r) => [r.userId, r.pointsShown])).toEqual([
      ['ola', 2],
      ['per', null],
    ]);
  });

  it('brutto står ved siden av bare i netto, og bare når den er annerledes', () => {
    const net = wolfHoleCards(
      result([hole({ holeNumber: 1, players: [cell('ola', 'wolf', 5, 4), cell('per', 'opp', 5, 5)] })]),
    );
    expect(net.holes[0]!.rows.map((r) => r.grossShown)).toEqual([5, null]);
    const gross = wolfHoleCards(
      result([hole({ holeNumber: 1, players: [cell('ola', 'wolf', 5, 4)] })], 'gross'),
    );
    expect(gross.holes[0]!.rows[0]!.grossShown).toBeNull();
    expect(gross.scoring).toBe('gross');
  });

  it('innsatsen står bare når den er mer enn 1; valg og utfall som katalognøkler', () => {
    const cards = wolfHoleCards(
      result([
        hole({ holeNumber: 1, stake: 1 }),
        hole({ holeNumber: 2, stake: 3, choice: 'lone', partnerUserId: null, outcome: 'tied' }),
        hole({ holeNumber: 3, choice: null, partnerUserId: null, outcome: 'pending' }),
      ]),
    );
    expect(cards.holes.map((h) => h.stake)).toEqual([null, 3, null]);
    expect(cards.holes.map((h) => [h.choiceKey, h.outcomeKey])).toEqual([
      ['choicePartner', 'outcomeWolfVant'],
      ['choiceLone', 'outcomeLik'],
      ['choiceWaiting', 'outcomeVenter'],
    ]);
    expect(cards.holes[0]!.partnerUserId).toBe('kari');
    expect(cards.holes[1]!.partnerUserId).toBeNull();
  });
});
