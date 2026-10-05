import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
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
  gameFinish: /^\/games\/[^/]+\/avslutt$/,
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

/**
 * Each page calls `markReadOnVisit` with its own surface and the right entity
 * id. The map above proves which kinds a surface clears; this proves the page
 * that renders the route asks for that surface. `Record` forces one caller per
 * surface; `routes` is only for a component shared by several pages.
 */
const CALLERS: Record<
  VisitSurface,
  { file: string; entity: string | null; routes?: string[] }
> = {
  gameHome: { file: 'app/[locale]/games/[id]/(home)/page.tsx', entity: 'id' },
  gameApprove: { file: 'app/[locale]/games/[id]/approve/page.tsx', entity: 'id' },
  gameLeaderboard: { file: 'app/[locale]/games/[id]/leaderboard/page.tsx', entity: 'id' },
  gameSubmit: { file: 'app/[locale]/games/[id]/submit/page.tsx', entity: 'id' },
  gameHole: { file: 'app/[locale]/games/[id]/holes/[holeNumber]/page.tsx', entity: 'id' },
  gameFinish: { file: 'app/[locale]/games/[id]/avslutt/page.tsx', entity: 'gameId' },
  adminGame: { file: 'app/[locale]/admin/games/[id]/page.tsx', entity: 'id' },
  adminSignups: { file: 'app/[locale]/admin/games/[id]/signups/page.tsx', entity: 'id' },
  teamSignup: { file: 'app/[locale]/signup/[shortId]/team/page.tsx', entity: 'game.id' },
  cup: { file: 'app/[locale]/cup/[id]/page.tsx', entity: 'id' },
  cupResults: { file: 'app/[locale]/cup/[id]/resultater/page.tsx', entity: 'id' },
  cupParticipants: {
    file: 'app/[locale]/admin/cup/[id]/spillere/CupParticipants.tsx',
    entity: 'tournamentId',
    routes: ['/admin/cup/t1/spillere', '/klubber/g1/cup/t1/spillere'],
  },
  club: { file: 'app/[locale]/klubber/[id]/page.tsx', entity: 'id' },
  friends: { file: 'app/[locale]/profile/venner/page.tsx', entity: null },
  history: { file: 'app/[locale]/profile/historikk/page.tsx', entity: null },
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    if (d.isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(d.name) && !/\.test\.tsx?$/.test(d.name) ? [p] : [];
  });
}

/** `app/[locale]/games/[id]/(home)/page.tsx` → `/games/x`. */
function routeOf(file: string): string {
  return (
    file
      .replace(/^app\/\[locale\]/, '')
      .replace(/\/\([^)]+\)/g, '')
      .replace(/\/page\.tsx$/, '')
      .replace(/\[holeNumber\]/g, '7')
      .replace(/\[[^\]]+\]/g, 'x') || '/'
  );
}

describe('markReadOnVisit callers', () => {
  const root = process.cwd();
  const found = sourceFiles(join(root, 'app')).flatMap((abs) => {
    const src = readFileSync(abs, 'utf8');
    return [...src.matchAll(/markReadOnVisit\(\{([^}]*)\}\)/g)].map((m) => ({
      file: relative(root, abs),
      surface: /surface: '(\w+)'/.exec(m[1])?.[1] ?? null,
      entity: /entityId: ([\w.]+)/.exec(m[1])?.[1] ?? null,
    }));
  });

  it('exactly one call per surface, from the page that owns it, with its entity id', () => {
    const expected = surfaces.map((s) => ({ file: CALLERS[s].file, surface: s, entity: CALLERS[s].entity }));
    const byKey = (a: { surface: string | null }, b: { surface: string | null }) =>
      String(a.surface).localeCompare(String(b.surface));
    expect([...found].sort(byKey)).toEqual([...expected].sort(byKey));
  });

  it.each(surfaces)('%s: the caller renders a route of that surface, keyed as the map says', (s) => {
    const { file, entity, routes } = CALLERS[s];
    for (const route of routes ?? [routeOf(file)]) {
      expect(route, file).toMatch(SURFACE_ROUTE[s]);
    }
    expect(entity === null, s).toBe(READ_ON_VISIT[s].key === null);
  });
});
