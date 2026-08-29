import { describe, it, expect } from 'vitest';
import {
  planParticipantRosterSync,
  swapExceedsPersonalPlayerCap,
  type ParticipantRosterSyncInput,
  type ParticipantRosterSyncPlan,
  type SwapParticipantCapInput,
} from './participantRosterSync';

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

/** 24 deltakere — nøyaktig på taket (MAX_PERSONAL_CUP_PLAYERS). */
const AT_CAP = Array.from({ length: 24 }, (_, i) => `p${i}`);

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
      'på taket, ny reserve inn, ut-spilleren BLIR i en annen bunt: 25 → avvis',
      { outRemainsInCup: true },
      true,
    ],
    [
      'på taket, ny reserve inn, ut-spilleren forlater cupen helt: 24 → ok',
      {},
      false,
    ],
    [
      'under taket (23), ny reserve inn, ut-spilleren blir: 24 → ok (taket er >, ikke >=)',
      { participantIds: AT_CAP.slice(0, 23), outRemainsInCup: true },
      false,
    ],
    [
      'på taket, reserven er ALLEREDE deltaker, ut-spilleren blir: settet uendret → ok',
      { inUserId: 'p5', outRemainsInCup: true },
      false,
    ],
    [
      'ut-spilleren står ikke på deltakerlista (divergerte sett): ingen rad å godskrive → avvis',
      { participantIds: AT_CAP.map((p) => `andre-${p}`) },
      true,
    ],
    [
      'admin-aktør er uncapped: samme 25-input som rad 1 → ok',
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
