import { describe, it, expect } from 'vitest';
import {
  classifyDeliveryStatus,
  isDeliveryReminderTarget,
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
