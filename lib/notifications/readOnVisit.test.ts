import { describe, it, expect } from 'vitest';
import { notificationDestination } from './deeplink';
import { NOTIFICATION_KINDS, type NotificationKind } from './types';
import { testPayloads } from './testPayloads';
import { INBOX_ONLY_KINDS, READ_ON_VISIT, type VisitSurface } from './readOnVisit';

/**
 * #2201: what you have seen is read. Every kind is cleared either by the page
 * its notification links to, or (no page) in the inbox and by a push tap.
 * The routes live here because only this test needs them; `Record` forces one
 * per surface.
 */
const SURFACE_ROUTE: Record<VisitSurface, RegExp> = {
  gameHome: /^\/games\/[^/]+$/,
  gameApprove: /^\/games\/[^/]+\/approve$/,
  gameLeaderboard: /^\/games\/[^/]+\/leaderboard$/,
  gameSubmit: /^\/games\/[^/]+\/submit$/,
  gameHole: /^\/games\/[^/]+\/holes\/\d+$/,
  adminGame: /^\/admin\/games\/[^/]+$/,
  adminSignups: /^\/admin\/games\/[^/]+\/signups$/,
  teamSignup: /^\/signup\/[^/]+\/team$/,
  cup: /^\/cup\/[^/]+$/,
  cupResults: /^\/cup\/[^/]+\/resultater$/,
  cupParticipants: /^\/(klubber\/[^/]+\/cup|admin\/cup)\/[^/]+\/spillere$/,
  club: /^\/klubber\/[^/]+$/,
  friends: /^\/profile\/venner$/,
  history: /^\/profile\/historikk$/,
};

const surfaces = Object.keys(READ_ON_VISIT) as VisitSurface[];

function destinationOf(kind: NotificationKind): string | null {
  return notificationDestination({ kind, payload: testPayloads[kind] });
}

describe('READ_ON_VISIT', () => {
  it('together with the inbox-only kinds covers every kind', () => {
    const covered = new Set<NotificationKind>([
      ...surfaces.flatMap((s) => READ_ON_VISIT[s].kinds),
      ...INBOX_ONLY_KINDS,
    ]);
    const missing = NOTIFICATION_KINDS.filter((k) => !covered.has(k));
    expect(missing).toEqual([]);
    expect([...covered].sort()).toEqual([...NOTIFICATION_KINDS].sort());
  });

  it.each(NOTIFICATION_KINDS.filter((k) => destinationOf(k) !== null))(
    '%s is cleared on the page it links to',
    (kind) => {
      const destination = destinationOf(kind)!;
      const clearing = surfaces.filter(
        (s) => READ_ON_VISIT[s].kinds.includes(kind) && SURFACE_ROUTE[s].test(destination),
      );
      expect(clearing, `${kind} → ${destination}`).not.toEqual([]);
    },
  );

  // The write filters on `payload->><key>`, so a kind without that field
  // would never be cleared. team_invite links by short id but must carry
  // game_id too.
  it.each(
    surfaces.flatMap((s) => {
      const { key, kinds } = READ_ON_VISIT[s];
      return key === null ? [] : kinds.map((kind) => [s, kind, key] as const);
    }),
  )('%s: %s carries %s in its payload', (_surface, kind, key) => {
    const value = (testPayloads[kind] as Record<string, unknown>)[key];
    expect(typeof value).toBe('string');
    expect(value).not.toBe('');
  });
});
