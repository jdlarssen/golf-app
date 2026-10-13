// #2228: the primary CTA state has one home, shared by the web's PrimaryCta
// and the native app. Each row is a branch, and the order between them is the
// rule itself: submitted beats "holes missing".
import { describe, it, expect } from 'vitest';
import { computePrimaryCtaState, type PrimaryCtaState } from './primaryCtaState';

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
