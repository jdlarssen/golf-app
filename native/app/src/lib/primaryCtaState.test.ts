// Native N3 (#1825): speilet av webbens computeState, gren for gren.
//
// Poenget med testen er ikke at fem if-er virker — det er at kopien ikke
// drifter fra kilden. Hver rad her er en gren i
// `app/[locale]/games/[id]/(home)/PrimaryCta.tsx`, og rekkefølgen mellom dem er
// selve regelen: levert slår «mangler hull».
import {
  computePrimaryCtaState,
  nextUnfilledHole,
  type PrimaryCtaState,
} from './primaryCtaState';

const SUBMITTED = '2026-08-30T12:00:00.000Z';
const APPROVED = '2026-08-30T12:30:00.000Z';

describe('computePrimaryCtaState', () => {
  it.each<[string, Parameters<typeof computePrimaryCtaState>[0], PrimaryCtaState]>([
    [
      'ingen slag tastet',
      {
        strokesCount: 0,
        totalHoles: 18,
        submittedAt: null,
        approvedAt: null,
        requirePeerApproval: false,
      },
      'not_started',
    ],
    [
      'runden er i gang',
      {
        strokesCount: 7,
        totalHoles: 18,
        submittedAt: null,
        approvedAt: null,
        requirePeerApproval: false,
      },
      'in_progress',
    ],
    [
      'alle hull fylt',
      {
        strokesCount: 18,
        totalHoles: 18,
        submittedAt: null,
        approvedAt: null,
        requirePeerApproval: false,
      },
      'ready_to_submit',
    ],
    [
      'flere rader enn hull teller fortsatt som ferdig',
      {
        strokesCount: 19,
        totalHoles: 18,
        submittedAt: null,
        approvedAt: null,
        requirePeerApproval: false,
      },
      'ready_to_submit',
    ],
    [
      'levert, venter på attestant',
      {
        strokesCount: 18,
        totalHoles: 18,
        submittedAt: SUBMITTED,
        approvedAt: null,
        requirePeerApproval: true,
      },
      'submitted_pending_approval',
    ],
    [
      'levert og godkjent',
      {
        strokesCount: 18,
        totalHoles: 18,
        submittedAt: SUBMITTED,
        approvedAt: APPROVED,
        requirePeerApproval: true,
      },
      'submitted_approved',
    ],
    [
      'levert i et spill uten attestant-krav',
      {
        strokesCount: 18,
        totalHoles: 18,
        submittedAt: SUBMITTED,
        approvedAt: null,
        requirePeerApproval: false,
      },
      'submitted_approved',
    ],
    [
      'levert slår manglende hull — ingen vei tilbake til «Fortsett»',
      {
        strokesCount: 3,
        totalHoles: 18,
        submittedAt: SUBMITTED,
        approvedAt: null,
        requirePeerApproval: false,
      },
      'submitted_approved',
    ],
  ])(
    '%s',
    (
      _label: string,
      input: Parameters<typeof computePrimaryCtaState>[0],
      expected: PrimaryCtaState,
    ) => {
      expect(computePrimaryCtaState(input)).toBe(expected);
    },
  );
});

describe('nextUnfilledHole', () => {
  it.each<[string, number[], number]>([
    ['tom runde starter på hull 1', [], 1],
    ['hopper over hullene som er ført', [1, 2, 3], 4],
    ['finner hullet som ble hoppet over', [1, 2, 4, 5], 3],
    ['full runde faller tilbake til hull 1', Array.from({ length: 18 }, (_, i) => i + 1), 1],
  ])('%s', (_label: string, filled: number[], expected: number) => {
    expect(nextUnfilledHole(filled)).toBe(expected);
  });
});
