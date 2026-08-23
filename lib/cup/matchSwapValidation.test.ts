import { describe, it, expect } from 'vitest';
import {
  validateMatchSwap,
  type SwapBundleGame,
  type SwapValidationInput,
  type SwapValidationResult,
} from './matchSwapValidation';

/**
 * Type A (pure logic) for guard-tabellen bak «bytt spiller» (#1473).
 * Én `it.each` over hele tabellen — hver rad er en observerbar
 * beslutning, ikke en implementasjonsdetalj. Sti-utvelgelsen (hvilke
 * matcher i bunten som skal skrives) får egne cases under, siden den er
 * det eneste guarden returnerer utover ok/feil.
 */

/** Host + avledet singel, begge scheduled — normal splittet cup-dag. */
const SPLIT_BUNDLE: SwapBundleGame[] = [
  { gameId: 'host', status: 'scheduled', playerIds: ['a1', 'a2', 'b1', 'b2'] },
  { gameId: 'derived', status: 'scheduled', playerIds: ['a1', 'b1'] },
];

function input(overrides: Partial<SwapValidationInput> = {}): SwapValidationInput {
  return {
    bundle: SPLIT_BUNDLE,
    outUserId: 'a1',
    inUserId: 'r1',
    candidateIds: ['a1', 'a2', 'b1', 'b2', 'r1'],
    inProfileCompleted: true,
    clubMemberIds: null,
    ...overrides,
  };
}

describe('validateMatchSwap — guard-tabellen', () => {
  const cases: Array<[string, Partial<SwapValidationInput>, SwapValidationResult]> = [
    [
      'personlig cup, alt på plass: byttet går, begge matchene skrives',
      {},
      { ok: true, gameIds: ['host', 'derived'] },
    ],
    [
      'tom bunt (matchen hører ikke til cupen)',
      { bundle: [] },
      { ok: false, error: 'not_found' },
    ],
    [
      'host er startet',
      {
        bundle: [
          { gameId: 'host', status: 'active', playerIds: ['a1', 'b1'] },
          { gameId: 'derived', status: 'scheduled', playerIds: ['a1', 'b1'] },
        ],
      },
      { ok: false, error: 'already_started' },
    ],
    [
      'kun den avledede er startet — bunten er fortsatt låst',
      {
        bundle: [
          { gameId: 'host', status: 'scheduled', playerIds: ['a1', 'b1'] },
          { gameId: 'derived', status: 'active', playerIds: ['a1', 'b1'] },
        ],
      },
      { ok: false, error: 'already_started' },
    ],
    [
      'ferdigspilt bunt',
      {
        bundle: [{ gameId: 'host', status: 'finished', playerIds: ['a1', 'b1'] }],
      },
      { ok: false, error: 'already_started' },
    ],
    [
      'ut-spilleren står ikke i bunten',
      { outUserId: 'ukjent' },
      { ok: false, error: 'player_not_in_match' },
    ],
    [
      'inn-spilleren står allerede på samme lag i bunten',
      { inUserId: 'a2' },
      { ok: false, error: 'already_in_match' },
    ],
    [
      'inn-spilleren står på MOTSATT lag i bunten',
      { inUserId: 'b1' },
      { ok: false, error: 'already_in_match' },
    ],
    [
      'inn-spilleren står kun i den avledede matchen',
      {
        bundle: [
          { gameId: 'host', status: 'scheduled', playerIds: ['a1', 'a2'] },
          { gameId: 'derived', status: 'scheduled', playerIds: ['r1'] },
        ],
      },
      { ok: false, error: 'already_in_match' },
    ],
    [
      'bytte til seg selv',
      { inUserId: 'a1' },
      { ok: false, error: 'already_in_match' },
    ],
    [
      'reserven er ikke kandidat for cupen (ikke venn / ikke klubbmedlem)',
      { candidateIds: ['a1', 'a2', 'b1', 'b2'] },
      { ok: false, error: 'not_candidate' },
    ],
    [
      'reserven er kandidat uten å være påmeldt cupen fra før',
      { candidateIds: ['a1', 'r1'] },
      { ok: true, gameIds: ['host', 'derived'] },
    ],
    [
      'klubb-cup: inn-spilleren er medlem',
      { clubMemberIds: ['a1', 'a2', 'b1', 'b2', 'r1'] },
      { ok: true, gameIds: ['host', 'derived'] },
    ],
    [
      'klubb-cup: medlemskapet er trukket',
      { clubMemberIds: ['a1', 'a2', 'b1', 'b2'] },
      { ok: false, error: 'not_member' },
    ],
    [
      'reserven har ikke fullført profilen',
      { inProfileCompleted: false },
      { ok: false, error: 'profile_incomplete' },
    ],
    [
      'ikke kandidat slår ut før medlemskap',
      { candidateIds: ['a1'], clubMemberIds: [] },
      { ok: false, error: 'not_candidate' },
    ],
    [
      'medlemskap slår ut før profil',
      { clubMemberIds: [], inProfileCompleted: false },
      { ok: false, error: 'not_member' },
    ],
    [
      'startet bunt slår ut før alt annet',
      {
        bundle: [{ gameId: 'host', status: 'active', playerIds: [] }],
        outUserId: 'ukjent',
        candidateIds: [],
        inProfileCompleted: false,
      },
      { ok: false, error: 'already_started' },
    ],
  ];

  it.each(cases)('%s', (_label, overrides, expected) => {
    expect(validateMatchSwap(input(overrides))).toEqual(expected);
  });
});

describe('validateMatchSwap — hvilke matcher skrives', () => {
  it('kun matchene der ut-spilleren faktisk står', () => {
    const result = validateMatchSwap(
      input({
        bundle: [
          { gameId: 'host', status: 'scheduled', playerIds: ['a1', 'a2', 'b1', 'b2'] },
          { gameId: 'derived', status: 'scheduled', playerIds: ['a2', 'b2'] },
        ],
      }),
    );
    expect(result).toEqual({ ok: true, gameIds: ['host'] });
  });

  it('beholder buntens rekkefølge (host først)', () => {
    const result = validateMatchSwap(
      input({
        bundle: [
          { gameId: 'host', status: 'scheduled', playerIds: ['a1'] },
          { gameId: 'derived-1', status: 'scheduled', playerIds: ['a1'] },
          { gameId: 'derived-2', status: 'scheduled', playerIds: ['a1'] },
        ],
      }),
    );
    expect(result).toEqual({
      ok: true,
      gameIds: ['host', 'derived-1', 'derived-2'],
    });
  });
});
