import { playerName, type PlayerNameParts } from '@/lib/names/playerName';

// ─── Activity ledger (data) ───────────────────────────────────────────────
//
// The Sekretariat's event log, read once per request: the morning report's
// «Siste døgn» lines and the «Siste 14 dager» list below them both render
// these entries (#2345). Moved out of ActivityLedger.tsx; the queries are
// unchanged. The entries carry no copy, so the view picks the words.

export type ActivityKind =
  | 'submitted'
  | 'approved'
  | 'started'
  | 'signed'
  | 'newCourse'
  | 'acceptedInvite';

export type ActivityEntry = {
  ts: string;
  kind: ActivityKind;
  /**
   * Who did it, as a short name. Null when unknown; the view then names the
   * Sekretariat (starts, ends, a course without a creator) or «(ukjent)».
   */
  who: string | null;
  /**
   * The game or course. Null when the game is gone; on an accepted invite,
   * null means a club invite.
   */
  ref: string | null;
  /** #864: deep-link target; club invites without a game have none. */
  href?: string;
};

const LEDGER_SIZE = 8;

function shortName(full: string | undefined | null): string | null {
  if (!full) return null;
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

/**
 * The eight newest events of the last 14 days, newest first. Null when any
 * read fails (#2490): half an event log looks complete, and an empty one says
 * «nothing happened».
 *
 * Requires server context (RLS-enforced server client); do not call from
 * client components.
 */
export async function getActivityEntries(): Promise<ActivityEntry[] | null> {
  // Import here to keep this file importable in tests without server-only.
  const { getAdminContext } = await import('@/app/[locale]/admin/_dashboardContext');
  const { supabase } = await getAdminContext();
  const sinceIso = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  type SubmissionRow = {
    submitted_at: string;
    users: { name: string | null } | null;
    games: { id: string; name: string } | null;
  };
  type ApprovalRow = {
    approved_at: string;
    users: { name: string | null } | null;
    games: { id: string; name: string } | null;
  };
  type GameStartRow = { id: string; name: string; started_at: string };
  type GameEndRow = { id: string; name: string; ended_at: string };
  type CourseRow = {
    name: string;
    created_at: string;
    created_by_user: PlayerNameParts | null;
  };
  type InvitationRow = {
    accepted_at: string;
    email: string;
    games: { id: string; name: string } | null;
  };

  const [subsRes, apprsRes, startsRes, endsRes, coursesEvRes, invitesRes] =
    await Promise.all([
      supabase
        .from('game_players')
        .select(
          'submitted_at, users!game_players_user_id_fkey(name), games(id, name)',
        )
        .not('submitted_at', 'is', null)
        .gte('submitted_at', sinceIso)
        .order('submitted_at', { ascending: false })
        .limit(8)
        .returns<SubmissionRow[]>(),
      supabase
        .from('game_players')
        .select(
          'approved_at, users!game_players_user_id_fkey(name), games(id, name)',
        )
        .not('approved_at', 'is', null)
        .gte('approved_at', sinceIso)
        .order('approved_at', { ascending: false })
        .limit(8)
        .returns<ApprovalRow[]>(),
      // #2340: starts and ends are read apart, each newest first, so the
      // database never picks which games make the ledger.
      supabase
        .from('games')
        .select('id, name, started_at')
        .gte('started_at', sinceIso)
        .order('started_at', { ascending: false })
        .limit(8)
        .returns<GameStartRow[]>(),
      supabase
        .from('games')
        .select('id, name, ended_at')
        .gte('ended_at', sinceIso)
        .order('ended_at', { ascending: false })
        .limit(8)
        .returns<GameEndRow[]>(),
      supabase
        .from('courses')
        .select(
          'name, created_at, created_by_user:users!courses_created_by_fkey(name, nickname)',
        )
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(4)
        .returns<CourseRow[]>(),
      supabase
        .from('invitations')
        .select('accepted_at, email, games(id, name)')
        .not('accepted_at', 'is', null)
        .gte('accepted_at', sinceIso)
        .order('accepted_at', { ascending: false })
        .limit(8)
        .returns<InvitationRow[]>(),
    ]);

  const failed = [
    subsRes,
    apprsRes,
    startsRes,
    endsRes,
    coursesEvRes,
    invitesRes,
  ].find((res) => res.error);
  if (failed) {
    console.error('[admin/ledger]', failed.error);
    return null;
  }

  const activity: ActivityEntry[] = [];
  for (const r of subsRes.data ?? []) {
    activity.push({
      ts: r.submitted_at,
      kind: 'submitted',
      who: shortName(r.users?.name),
      ref: r.games?.name ?? null,
      href: r.games ? `/admin/games/${r.games.id}/status` : undefined,
    });
  }
  for (const r of apprsRes.data ?? []) {
    activity.push({
      ts: r.approved_at,
      kind: 'approved',
      who: shortName(r.users?.name),
      ref: r.games?.name ?? null,
      href: r.games ? `/admin/games/${r.games.id}/status` : undefined,
    });
  }
  for (const g of startsRes.data ?? []) {
    activity.push({
      ts: g.started_at,
      kind: 'started',
      who: null,
      ref: g.name,
      href: `/admin/games/${g.id}`,
    });
  }
  for (const g of endsRes.data ?? []) {
    activity.push({
      ts: g.ended_at,
      kind: 'signed',
      who: null,
      ref: g.name,
      href: `/admin/games/${g.id}`,
    });
  }
  for (const c of coursesEvRes.data ?? []) {
    activity.push({
      ts: c.created_at,
      kind: 'newCourse',
      who: playerName(c.created_by_user),
      ref: c.name,
      href: '/admin/courses',
    });
  }
  for (const inv of invitesRes.data ?? []) {
    activity.push({
      ts: inv.accepted_at,
      kind: 'acceptedInvite',
      who: shortName(inv.email.split('@')[0]),
      ref: inv.games?.name ?? null,
      href: inv.games ? `/admin/games/${inv.games.id}` : undefined,
    });
  }
  activity.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return activity.slice(0, LEDGER_SIZE);
}
