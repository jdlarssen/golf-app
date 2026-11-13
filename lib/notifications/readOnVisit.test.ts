import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { notificationDestination } from './deeplink';
import { NOTIFICATION_KINDS, type NotificationKind } from './types';
import { testPayloads } from './testPayloads';
import {
  INBOX_ONLY_KINDS,
  KNOWN_KINDS,
  NOT_WAITING_FILTER,
  READ_ON_VISIT,
  isKnownKind,
  isWaitingRow,
  visitCanMarkRead,
  type VisitSurface,
} from './readOnVisit';

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
  clubManage: /^\/klubber\/[^/]+\/administrer$/,
  friends: /^\/profile\/venner$/,
  history: /^\/profile\/historikk$/,
  league: /^\/liga\/[^/]+$/,
  leagueRoundStart: /^\/liga\/[^/]+\/runde\/[^/]+\/spill$/,
  leagueMarker: /^\/liga\/[^/]+\/godkjenn\/[^/]+\/[^/]+$/,
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

  // #2480: the pure list of kinds this code knows (no zod), for the inbox and
  // the unread dot to skip a kind from a newer build.
  it('#2480: KNOWN_KINDS is exactly the TypeScript kinds, and nothing else is known', () => {
    expect([...KNOWN_KINDS].sort()).toEqual([...NOTIFICATION_KINDS].sort());
    expect(isKnownKind('game_moved')).toBe(true);
    expect(isKnownKind('game_cancelled_in_a_newer_build')).toBe(false);
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

  // #2666: a simulator league's messages link to the round start page, and the
  // surface there clears them by the same league_id.
  it.each(['league_round_open', 'league_round_closing'] as const)(
    '%s of a simulator league is cleared by the round start page',
    (kind) => {
      const payload = { ...testPayloads[kind], is_simulator: true };
      const destination = notificationDestination({ kind, payload })!;
      const clearing = surfaces.filter(
        (s) => READ_ON_VISIT[s].kinds.includes(kind) && SURFACE_ROUTE[s].test(destination),
      );
      expect(clearing).toEqual(['leagueRoundStart']);
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
  clubManage: { file: 'app/[locale]/klubber/[id]/administrer/page.tsx', entity: 'id' },
  friends: { file: 'app/[locale]/profile/venner/page.tsx', entity: null },
  history: { file: 'app/[locale]/profile/historikk/page.tsx', entity: null },
  league: { file: 'app/[locale]/liga/[id]/page.tsx', entity: 'leagueId' },
  leagueRoundStart: { file: 'app/[locale]/liga/[id]/runde/[roundId]/spill/page.tsx', entity: 'leagueId' },
  leagueMarker: { file: 'app/[locale]/liga/[id]/godkjenn/[gameId]/[userId]/page.tsx', entity: 'gameId' },
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

/**
 * #2759: the rule for what waits lives in `isWaitingRow` and, for a write, in
 * the PostgREST filter. This reads the filter the way PostgREST does and holds
 * the two equal over every kind and the shapes that decide (AGENTS trap 4).
 */
describe('NOT_WAITING_FILTER agrees with isWaitingRow', () => {
  type TestRow = { kind: string; payload: Record<string, unknown> };

  function condition(cond: string, row: TestRow): boolean {
    const inList = /^kind\.not\.in\.\((.*)\)$/.exec(cond);
    if (inList) return !inList[1]!.split(',').includes(row.kind);
    const eq = /^kind\.eq\.(.+)$/.exec(cond);
    if (eq) return row.kind === eq[1];
    const field = /^payload->>(\w+)\.(not\.)?is\.null$/.exec(cond);
    if (!field) throw new Error(`Unknown condition: ${cond}`);
    const isNull = row.payload[field[1]!] == null;
    return field[2] ? !isNull : isNull;
  }

  /** Top-level commas only: `and(a,b)` and `in.(a,b)` hold commas of their own. */
  function splitTop(filter: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let part = '';
    for (const ch of filter) {
      if (ch === '(') depth += 1;
      if (ch === ')') depth -= 1;
      if (ch === ',' && depth === 0) {
        parts.push(part);
        part = '';
      } else part += ch;
    }
    parts.push(part);
    return parts;
  }

  function matchesFilter(row: TestRow): boolean {
    return splitTop(NOT_WAITING_FILTER).some((group) => {
      const and = /^and\((.*)\)$/.exec(group);
      return and ? splitTop(and[1]!).every((c) => condition(c, row)) : condition(group, row);
    });
  }

  const rows: TestRow[] = [
    ...NOTIFICATION_KINDS.map((kind) => ({ kind, payload: testPayloads[kind] as Record<string, unknown> })),
    { kind: 'registration_request', payload: { game_id: 'g', request_id: 'r' } },
    { kind: 'registration_request', payload: { game_id: 'g' } },
    { kind: 'scorecard_rejected', payload: { game_id: 'g' } },
    { kind: 'scorecard_rejected', payload: { game_id: 'g', player_name: null } },
    { kind: 'scorecard_rejected', payload: { game_id: 'g', player_name: 'Marte' } },
    { kind: 'scorecard_rejected', payload: { game_id: 'g', player_name: 'Marte', player_id: 'p' } },
    { kind: 'scorecard_rejected', payload: { game_id: 'g', player_name: null, player_id: 'p' } },
    { kind: 'deliver_reminder', payload: { game_id: 'g' } },
    { kind: 'deliver_reminder', payload: { game_id: 'g', others_count: 2 } },
    { kind: 'deliver_reminder', payload: { game_id: 'g', others_count: 2, card_user_ids: ['a', 'b'] } },
  ];

  it.each(rows.map((row) => [row.kind, JSON.stringify(row.payload), row] as const))(
    '%s %s',
    (_kind, _payload, row) => {
      expect(matchesFilter(row)).toBe(!isWaitingRow(row));
    },
  );
});

describe('visitCanMarkRead', () => {
  it('the pages whose every kind waits send no UPDATE, the hole page among them', () => {
    const silent = surfaces.filter((s) => !visitCanMarkRead(s));
    // #2326: /administrer clears only `club_join_request`, which waits until
    // decided (the inbox reads that from the request itself).
    expect(silent.sort()).toEqual([
      'clubManage',
      'gameApprove',
      'gameFinish',
      'gameHole',
      'league',
      'leagueMarker',
      'leagueRoundStart',
    ]);
  });
});
