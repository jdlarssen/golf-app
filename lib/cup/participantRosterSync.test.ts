import { describe, it, expect } from 'vitest';
import {
  planParticipantRosterSync,
  swapExceedsPersonalPlayerCap,
  type ParticipantRosterSyncInput,
  type ParticipantRosterSyncPlan,
  type SwapParticipantCapInput,
} from './participantRosterSync';
import { MAX_PERSONAL_CUP_PLAYERS } from './limits';

/**
 * Type A (pure logic) for deltakerlista etter et spillerbytte (#1735).
 * Én `it.each` over hele beslutningstabellen — hver rad er en observerbar
 * beslutning (meld på reserven / fjern frafallet), ikke en
 * implementasjonsdetalj. I/O-en (upsert + delete) bor i `swapCupMatchPlayer`
 * og dekkes av action-suiten.
 */

function input(
  overrides: Partial<ParticipantRosterSyncInput> = {},
): ParticipantRosterSyncInput {
  return {
    outUserId: 'out',
    inUserId: 'reserve',
    rosterUserIds: ['reserve', 'mate', 'opp1', 'opp2'],
    ...overrides,
  };
}

describe('planParticipantRosterSync — beslutningstabellen (#1735)', () => {
  const cases: Array<
    [string, Partial<ParticipantRosterSyncInput>, ParticipantRosterSyncPlan]
  > = [
    [
      'ut-spilleren står i 0 gjenværende matcher: reserven meldes på, frafallet fjernes',
      {},
      { addParticipantId: 'reserve', removeParticipantId: 'out' },
    ],
    [
      'ut-spilleren står fortsatt i en annen bunt: raden hennes beholdes',
      { rosterUserIds: ['reserve', 'mate', 'out', 'opp1'] },
      { addParticipantId: 'reserve', removeParticipantId: null },
    ],
    [
      'reserven står i flere matcher: fortsatt én påmelding (upserten er idempotent)',
      { rosterUserIds: ['reserve', 'reserve', 'mate'] },
      { addParticipantId: 'reserve', removeParticipantId: 'out' },
    ],
    [
      'ukjent roster (lese-feil): reserven meldes på, men ingen slettes uten bevis',
      { rosterUserIds: null },
      { addParticipantId: 'reserve', removeParticipantId: null },
    ],
    [
      'reserven står ikke i rosteret likevel: ingen påmelding å utlede',
      { rosterUserIds: ['mate', 'opp1'] },
      { addParticipantId: null, removeParticipantId: 'out' },
    ],
    [
      'tomt roster (cupen har ingen matcher igjen): ingen påmelding, frafallet fjernes',
      { rosterUserIds: [] },
      { addParticipantId: null, removeParticipantId: 'out' },
    ],
    // #1884: varig lag-/kapteinsrolle er arrangørens, ikke match-derivasjonens.
    [
      'benket spiller med varig lag: ute av alle matcher, men raden står',
      { rosterUserIds: [], outHasPersistentRole: true },
      { addParticipantId: null, removeParticipantId: null },
    ],
    [
      'ikke-spillende kaptein: står i 0 matcher og skal aldri fjernes',
      { rosterUserIds: ['reserve', 'mate'], outHasPersistentRole: true },
      { addParticipantId: 'reserve', removeParticipantId: null },
    ],
    [
      'uten rolle er regelen som før: eksplisitt false fjerner frafallet',
      { outHasPersistentRole: false },
      { addParticipantId: 'reserve', removeParticipantId: 'out' },
    ],
  ];

  it.each(cases)('%s', (_name, overrides, expected) => {
    expect(planParticipantRosterSync(input(overrides))).toEqual(expected);
  });
});

/**
 * Type A for tak-vakta i planfasen av et spillerbytte (#1804). Samme
 * beslutningstabell-stil som over: hver rad er «ville byttet sprengt taket?»
 * for én input-klasse. Cap-tallet og sammenligningen bor i lib/cup/limits
 * (exceedsPersonalPlayerCap) — her testes sett-matematikken rundt.
 */

/**
 * Nøyaktig på deltaker-taket. Utledet fra konstanten, ALDRI en litteral: taket
 * har flyttet seg (#1883, 24 → 40), og en hardkodet fixture går rødt hver gang
 * det skjer i stedet for å følge regelens ene hjem (lib/cup/limits.ts).
 */
const AT_CAP = Array.from(
  { length: MAX_PERSONAL_CUP_PLAYERS },
  (_, i) => `p${i}`,
);

function capInput(
  overrides: Partial<SwapParticipantCapInput> = {},
): SwapParticipantCapInput {
  return {
    // 'out' står på lista (p0 byttes ut som default-navn under), 'reserve' ikke.
    participantIds: AT_CAP,
    outUserId: 'p0',
    inUserId: 'reserve',
    outRemainsInCup: false,
    actorIsAdmin: false,
    ...overrides,
  };
}

describe('swapExceedsPersonalPlayerCap — tak-vakta i planfasen (#1804)', () => {
  const cases: Array<[string, Partial<SwapParticipantCapInput>, boolean]> = [
    [
      'på taket, ny reserve inn, ut-spilleren BLIR i en annen bunt: taket + 1 → avvis',
      { outRemainsInCup: true },
      true,
    ],
    [
      'på taket, ny reserve inn, ut-spilleren forlater cupen helt: blir stående på taket → ok',
      {},
      false,
    ],
    [
      'under taket (taket − 1), ny reserve inn, ut-spilleren blir: taket → ok (taket er >, ikke >=)',
      {
        participantIds: AT_CAP.slice(0, MAX_PERSONAL_CUP_PLAYERS - 1),
        outRemainsInCup: true,
      },
      false,
    ],
    [
      'på taket, reserven er ALLEREDE deltaker, ut-spilleren blir: settet uendret → ok',
      { inUserId: 'p5', outRemainsInCup: true },
      false,
    ],
    // #1884: raden blir stående, så fjerningen kan ikke godskrives i taket.
    [
      'på taket, ut-spilleren har varig rolle og forlater matchene: raden står → avvis',
      { outHasPersistentRole: true },
      true,
    ],
    [
      'ut-spilleren står ikke på deltakerlista (divergerte sett): ingen rad å godskrive → avvis',
      { participantIds: AT_CAP.map((p) => `andre-${p}`) },
      true,
    ],
    [
      'admin-aktør er uncapped: samme «taket + 1»-input som rad 1 → ok',
      { outRemainsInCup: true, actorIsAdmin: true },
      false,
    ],
    ['tom deltakerliste: 1 etter byttet → ok', { participantIds: [] }, false],
    [
      'én deltaker (ut-spilleren), ny reserve inn, ut forlater: 1 → ok',
      { participantIds: ['p0'] },
      false,
    ],
  ];

  it.each(cases)('%s', (_name, overrides, expected) => {
    expect(swapExceedsPersonalPlayerCap(capInput(overrides))).toBe(expected);
  });
});
