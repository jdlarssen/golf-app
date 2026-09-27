import { describe, it, expect } from 'vitest';
import { interpretUpsertReply } from './upsertReply';
import { REFUSED_REPLY_FIXTURE } from './testing/refusedReplyFixture';

const LOCAL = '2026-09-25T10:00:00.123Z';

describe('interpretUpsertReply', () => {
  it.each([
    ['no row at all', null, LOCAL, 'refused'],
    ['the staging NULL row', REFUSED_REPLY_FIXTURE[0], LOCAL, 'refused'],
    [
      'applied',
      { was_applied: true, client_updated_at: '2026-09-25T10:00:00.123+00:00' },
      LOCAL,
      'applied',
    ],
    [
      'server strictly newer',
      { was_applied: false, client_updated_at: '2026-09-25T10:00:01.000+00:00' },
      LOCAL,
      'server-wins',
    ],
    [
      'same instant, same string',
      { was_applied: false, client_updated_at: LOCAL },
      LOCAL,
      'kept-local',
    ],
    [
      'same instant, server format',
      { was_applied: false, client_updated_at: '2026-09-25T10:00:00.123+00:00' },
      LOCAL,
      'kept-local',
    ],
    [
      'same instant, whole seconds',
      { was_applied: false, client_updated_at: '2026-09-25T10:00:00+00:00' },
      '2026-09-25T10:00:00.000Z',
      'kept-local',
    ],
    [
      'local 1 ms newer',
      { was_applied: false, client_updated_at: '2026-09-25T10:00:00.122+00:00' },
      LOCAL,
      'refused',
    ],
    [
      'unparseable stamp',
      { was_applied: false, client_updated_at: 'not-a-date' },
      LOCAL,
      'kept-local',
    ],
  ] as const)('%s → %s', (_label, row, local, expected) => {
    expect(interpretUpsertReply(row, local)).toBe(expected);
  });
});
