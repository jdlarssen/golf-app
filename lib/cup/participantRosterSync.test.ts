import { describe, it, expect } from 'vitest';
import {
  planParticipantRosterSync,
  type ParticipantRosterSyncInput,
  type ParticipantRosterSyncPlan,
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
