import { describe, it, expect } from 'vitest';
import {
  classifyDeliveryStatus,
  isDeliveryReminderTarget,
  selectDeliveryReminderTargets,
  type DeliveryStatus,
} from './deliveryStatus';

const T = '2026-06-03T10:00:00.000Z';

describe('classifyDeliveryStatus', () => {
  it.each<{
    name: string;
    opts: Parameters<typeof classifyDeliveryStatus>[0];
    expected: DeliveryStatus;
  }>([
    {
      name: 'trukket spiller → withdrawn (forrang over alt)',
      opts: {
        holesFilled: 18,
        submittedAt: T,
        approvedAt: T,
        withdrawnAt: T,
        requirePeerApproval: true,
      },
      expected: 'withdrawn',
    },
    {
      name: 'levert uten peer-godkjenning → delivered',
      opts: {
        holesFilled: 18,
        submittedAt: T,
        approvedAt: null,
        withdrawnAt: null,
        requirePeerApproval: false,
      },
      expected: 'delivered',
    },
    {
      name: 'levert + godkjent (peer på) → delivered',
      opts: {
        holesFilled: 18,
        submittedAt: T,
        approvedAt: T,
        withdrawnAt: null,
        requirePeerApproval: true,
      },
      expected: 'delivered',
    },
    {
      name: 'levert men ikke godkjent (peer på) → pending_approval',
      opts: {
        holesFilled: 18,
        submittedAt: T,
        approvedAt: null,
        withdrawnAt: null,
        requirePeerApproval: true,
      },
      expected: 'pending_approval',
    },
    {
      name: '18/18 registrert men ikke levert → ready_not_delivered',
      opts: {
        holesFilled: 18,
        submittedAt: null,
        approvedAt: null,
        withdrawnAt: null,
        requirePeerApproval: false,
      },
      expected: 'ready_not_delivered',
    },
    {
      name: 'midt i runden (1–17 hull) → playing',
      opts: {
        holesFilled: 9,
        submittedAt: null,
        approvedAt: null,
        withdrawnAt: null,
        requirePeerApproval: false,
      },
      expected: 'playing',
    },
    {
      name: 'ingen registreringer → not_started',
      opts: {
        holesFilled: 0,
        submittedAt: null,
        approvedAt: null,
        withdrawnAt: null,
        requirePeerApproval: false,
      },
      expected: 'not_started',
    },
  ])('$name', ({ opts, expected }) => {
    expect(classifyDeliveryStatus(opts)).toBe(expected);
  });

  it.each<{
    name: string;
    opts: Parameters<typeof classifyDeliveryStatus>[0];
    expected: DeliveryStatus;
  }>([
    {
      name: '#1441: 9/9 hull på et front9/back9-segment → ready_not_delivered',
      opts: {
        holesFilled: 9,
        submittedAt: null,
        approvedAt: null,
        withdrawnAt: null,
        requirePeerApproval: false,
        expectedHoles: 9,
      },
      expected: 'ready_not_delivered',
    },
    {
      name: '#1441: 8/9 hull på et segment-spill → playing (ikke prematurt ferdig)',
      opts: {
        holesFilled: 8,
        submittedAt: null,
        approvedAt: null,
        withdrawnAt: null,
        requirePeerApproval: false,
        expectedHoles: 9,
      },
      expected: 'playing',
    },
  ])('$name', ({ opts, expected }) => {
    expect(classifyDeliveryStatus(opts)).toBe(expected);
  });

  it('teller kun ready_not_delivered som purre-mål', () => {
    const all: DeliveryStatus[] = [
      'withdrawn',
      'delivered',
      'pending_approval',
      'ready_not_delivered',
      'playing',
      'not_started',
    ];
    const targets = all.filter(isDeliveryReminderTarget);
    expect(targets).toEqual(['ready_not_delivered']);
  });
});

// #1466: purre-mål-utvelgelse — ferdige, uleverte, ikke-trukne, ikke-gjester
// UTEN et ulevert back9-søsken.
describe('selectDeliveryReminderTargets', () => {
  const player = (
    user_id: string,
    over: Partial<{
      submitted_at: string | null;
      withdrawn_at: string | null;
      is_guest: boolean;
    }> = {},
  ) => ({
    user_id,
    submitted_at: over.submitted_at ?? null,
    withdrawn_at: over.withdrawn_at ?? null,
    users: { is_guest: over.is_guest ?? false },
  });

  it('velger ferdige, uleverte, ikke-trukne, ikke-gjester', () => {
    const players = [
      player('done'), // 9 hull, ikke levert → mål
      player('submitted', { submitted_at: '2026-08-07T10:00:00Z' }),
      player('withdrawn', { withdrawn_at: '2026-08-07T09:00:00Z' }),
      player('guest', { is_guest: true }),
      player('playing'), // kun 3 hull
    ];
    const filledByUser = new Map([
      ['done', 9],
      ['submitted', 9],
      ['withdrawn', 9],
      ['guest', 9],
      ['playing', 3],
    ]);
    const targets = selectDeliveryReminderTargets({
      players,
      filledByUser,
      expectedHoles: 9,
    });
    expect(targets.map((t) => t.user_id)).toEqual(['done']);
  });

  it('#1466: ekskluderer en front9-spiller med ulevert back9-søsken', () => {
    const players = [player('a'), player('b')];
    const filledByUser = new Map([
      ['a', 9],
      ['b', 9],
    ]);
    const targets = selectDeliveryReminderTargets({
      players,
      filledByUser,
      expectedHoles: 9,
      // «b» har et ulevert back9-søsken → purres via back9, ikke her.
      undeliveredSiblingUserIds: new Set(['b']),
    });
    expect(targets.map((t) => t.user_id)).toEqual(['a']);
  });

  it('#1466: tom eksklusjonsmengde endrer ingenting (vanlige spill)', () => {
    const players = [player('a'), player('b')];
    const filledByUser = new Map([
      ['a', 18],
      ['b', 18],
    ]);
    const targets = selectDeliveryReminderTargets({
      players,
      filledByUser,
      expectedHoles: 18,
      undeliveredSiblingUserIds: new Set(),
    });
    expect(targets.map((t) => t.user_id)).toEqual(['a', 'b']);
  });
});
