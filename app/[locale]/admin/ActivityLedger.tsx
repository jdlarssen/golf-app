import { getTranslations } from 'next-intl/server';
import { formatHHMMOslo } from '@/lib/i18n/format';
import { displayName, type DisplayNameUser } from '@/lib/format/displayName';
import { getAdminContext } from './_dashboardContext';
import { Skeleton } from '@/components/ui/Skeleton';
import { SmartLink } from '@/components/ui/SmartLink';

// ─── Activity ledger ─────────────────────────────────────────────────────

type Activity = {
  ts: string;
  who: string;
  action: string;
  ref: string;
  /** #864: deep-link target. Non-interactive rows (klubbinvitasjon uten
   *  game) lar dette stå undefined og rendres som en vanlig `<div>`. */
  href?: string;
};

function shortName(full: string | undefined | null, fallback: string): string {
  if (!full) return fallback;
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export async function ActivityLedger() {
  const { supabase } = await getAdminContext();
  const t = await getTranslations('admin.dashboard');
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const sinceIso = new Date(nowMs - 14 * 24 * 60 * 60 * 1000).toISOString();

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
  type GameLifecycleRow = {
    id: string;
    name: string;
    started_at: string | null;
    ended_at: string | null;
  };
  type CourseRow = {
    name: string;
    created_at: string;
    created_by_user: DisplayNameUser;
  };
  type InvitationRow = {
    accepted_at: string;
    email: string;
    games: { id: string; name: string } | null;
  };

  const [subsRes, apprsRes, gamesRes, coursesEvRes, invitesRes] =
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
      supabase
        .from('games')
        .select('id, name, started_at, ended_at')
        .or(`started_at.gte.${sinceIso},ended_at.gte.${sinceIso}`)
        .limit(12)
        .returns<GameLifecycleRow[]>(),
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

  const activity: Activity[] = [];
  for (const r of subsRes.data ?? []) {
    activity.push({
      ts: r.submitted_at,
      who: shortName(r.users?.name, t('ledgerUnknown')),
      action: t('actionsSubmitted'),
      ref: r.games?.name ?? t('ledgerGameFallback'),
      href: r.games ? `/admin/games/${r.games.id}/status` : undefined,
    });
  }
  for (const r of apprsRes.data ?? []) {
    activity.push({
      ts: r.approved_at,
      who: shortName(r.users?.name, t('ledgerUnknown')),
      action: t('actionsApproved'),
      ref: r.games?.name ?? t('ledgerGameFallback'),
      href: r.games ? `/admin/games/${r.games.id}/status` : undefined,
    });
  }
  for (const g of gamesRes.data ?? []) {
    if (g.started_at && g.started_at >= sinceIso) {
      activity.push({
        ts: g.started_at,
        who: t('actionsSecretary'),
        action: t('actionsStarted'),
        ref: g.name,
        href: `/admin/games/${g.id}`,
      });
    }
    if (g.ended_at && g.ended_at >= sinceIso) {
      activity.push({
        ts: g.ended_at,
        who: t('actionsSecretary'),
        action: t('actionsSigned'),
        ref: g.name,
        href: `/admin/games/${g.id}`,
      });
    }
  }
  for (const c of coursesEvRes.data ?? []) {
    activity.push({
      ts: c.created_at,
      who: displayName(c.created_by_user) ?? t('actionsSecretary'),
      action: t('actionsNewCourse'),
      ref: c.name,
      href: '/admin/courses',
    });
  }
  for (const inv of invitesRes.data ?? []) {
    activity.push({
      ts: inv.accepted_at,
      who: shortName(inv.email.split('@')[0], t('ledgerUnknown')),
      action: t('actionsAcceptedInvite'),
      ref: inv.games?.name ?? t('ledgerClubInvite'),
      href: inv.games ? `/admin/games/${inv.games.id}` : undefined,
    });
  }
  activity.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  const ledger = activity.slice(0, 8);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      {ledger.length === 0 ? (
        <p className="px-4 py-5 text-center text-sm text-muted">
          {t('noActivity')}
        </p>
      ) : (
        ledger.map((row, i) => {
          const style = {
            animationDelay: `${60 + i * 60}ms`,
            borderTop: i === 0 ? 'none' : '1px solid var(--row-divider-warm)',
          };
          const baseClass =
            'reveal-up grid grid-cols-[42px_1fr] items-baseline gap-2.5 px-3.5 py-2.5';
          const inner = (
            <>
              <span className="font-serif text-xs font-medium tabular-nums text-muted">
                {formatHHMMOslo(row.ts)}
              </span>
              <div>
                <p className="text-[13px] text-text">
                  <b className="font-semibold">{row.who}</b> {row.action}
                </p>
                <p className="mt-0.5 font-serif text-[11px] italic text-muted">
                  {row.ref}
                </p>
              </div>
            </>
          );
          // #864: rader med en href blir trykkbare SmartLink-er (submitted/
          // approved → spillets status-side, lifecycle → spill-detalj, ny bane
          // → /admin/courses). Klubbinvitasjon uten game forblir en `<div>`.
          return row.href ? (
            <SmartLink
              key={`${row.ts}-${i}`}
              href={row.href}
              className={`${baseClass} transition-colors hover:bg-bg/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40`}
              style={style}
            >
              {inner}
            </SmartLink>
          ) : (
            <div key={`${row.ts}-${i}`} className={baseClass} style={style}>
              {inner}
            </div>
          );
        })
      )}
    </div>
  );
}

export function LedgerSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="grid grid-cols-[42px_1fr] items-baseline gap-2.5 px-3.5 py-2.5"
          style={{
            borderTop: i === 0 ? 'none' : '1px solid var(--row-divider-warm)',
          }}
        >
          <Skeleton className="h-3 w-9" delay={i * 90} />
          <div>
            <Skeleton className="h-3.5 w-4/5" delay={i * 90 + 30} />
            <Skeleton className="mt-1.5 h-2.5 w-2/5" delay={i * 90 + 60} />
          </div>
        </div>
      ))}
    </div>
  );
}
