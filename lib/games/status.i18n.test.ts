/**
 * Drift-guard: asserts that STATUS_LABELS matches the gameStatus namespace in
 * messages/no.json byte-for-byte. If someone updates STATUS_LABELS without
 * updating the catalog (or vice versa), this test fails immediately.
 *
 * The web reads every status word from the gameStatus namespace (#2491); the
 * constant exists for the native app, which has no i18n.
 */
import { describe, it, expect } from 'vitest';
import { STATUS_LABELS, type GameStatus } from './status';
import noMessages from '@/messages/no.json';
import enMessages from '@/messages/en.json';

const STATUSES: GameStatus[] = ['draft', 'scheduled', 'active', 'finished'];

describe('gameStatus catalog drift-guard', () => {
  it.each(STATUSES)(
    'STATUS_LABELS[%s] === no.json gameStatus.%s',
    (status) => {
      expect(STATUS_LABELS[status]).toBe(noMessages.gameStatus[status]);
    },
  );

  // One home per status text (#2491): the per-surface duplicate sets that
  // used to give the same status different words must not come back.
  const RETIRED_PATHS: string[][] = [
    ['cup', 'status'],
    ['liga', 'status'],
    ['liga', 'player', 'statusLabel'],
    ['klubb', 'leagues', 'status'],
    ['admin', 'games', 'draftWord'],
  ];

  function lookup(catalog: unknown, path: string[]): unknown {
    return path.reduce<unknown>(
      (node, key) =>
        node && typeof node === 'object'
          ? (node as Record<string, unknown>)[key]
          : undefined,
      catalog,
    );
  }

  it.each(RETIRED_PATHS.map((p) => [p.join('.'), p] as const))(
    '%s is gone from no.json and en.json',
    (_label, path) => {
      expect(lookup(noMessages, path)).toBeUndefined();
      expect(lookup(enMessages, path)).toBeUndefined();
    },
  );
});
