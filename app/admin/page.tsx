import { Suspense, cache } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';
import { getServerClient } from '@/lib/supabase/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { ClubStamp } from '@/components/ui/ClubStamp';
import { PullQuote } from '@/components/ui/PullQuote';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  BaneIcon,
  FlaggIcon,
  FormatsIcon,
  KonvoluttIcon,
  LaurbaerIcon,
  PokalIcon,
  SparkleIcon,
} from '@/components/icons';
import { firstName } from '@/lib/firstName';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { formatShortDateNb } from '@/lib/format/date';
import { displayName, type DisplayNameUser } from '@/lib/format/displayName';
import { getRoleContext, type AdminRoleContext } from '@/lib/admin/auth';

// Request-scoped Supabase client + verified user id. The id is forwarded by
// proxy.ts (which already verified the session) so the three Suspense bodies
// below don't each pay another Supabase Auth round-trip.
const getAdminContext = cache(async () => {
  const supabase = await getServerClient();
  const userId = await getProxyVerifiedUserId();
  return { supabase, userId };
});

// Role context cached for the whole request. Non-redirecting (#392): /admin is
// the universal Klubbhuset room, so a non-admin is NOT bounced — the page
// branches on role and renders a minimal player view instead.
const getRole = cache(async () => {
  const { supabase } = await getAdminContext();
  return getRoleContext(supabase);
});

function greeting(d: Date): string {
  const h = d.getHours();
  if (h < 10) return 'morgen';
  if (h < 12) return 'formiddag';
  if (h < 18) return 'ettermiddag';
  return 'kveld';
}

function isoWeek(d: Date): number {
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
}

function formatDateNb(d: Date): string {
  return `${formatShortDateNb(d)} · uke ${isoWeek(d)}`;
}

function formatHHMM(iso: string): string {
  const d = new Date(iso);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

type Activity = {
  ts: string;
  who: string;
  action: string;
  ref: string;
};

// Page — shell. Each data-bearing section sits behind a Suspense boundary
// so the shell paints immediately and each section streams in as its query
// wave resolves. Top-level er async kun for å hente userId til
// NotificationBell-mountingen i TopBar — vi går via getAdminContext() så
// header-lookup-en cachet og deles med Suspense-bodies under.
export default async function KlubbhusetPage() {
  // Klubbhuset (#392): the universal room. We branch on role BEFORE touching any
  // admin-scoped query, so a regular player (or trusted creator) never loads the
  // tile counts or activity ledger — they get a minimal player view instead.
  // Admins fall through to the full Sekretariat dashboard below, unchanged.
  const role = await getRole();
  if (!role.isAdmin) return <PlayerKlubbhus role={role} />;

  const now = new Date();
  const dateLine = formatDateNb(now);
  const timeOfDay = greeting(now);

  return (
    <AdminShell>
      {/* Bell dropped: the persistent bottom-nav «Innboks»-tab now covers
          notifications inside the room (#392). */}
      <TopBar backHref="/" kicker="Klubbhuset" />

      <Suspense fallback={<GreetingSkeleton dateLine={dateLine} />}>
        <GreetingCard dateLine={dateLine} timeOfDay={timeOfDay} />
      </Suspense>

      <Suspense fallback={<TilesSkeleton />}>
        <TilesGrid />
      </Suspense>

      <p className="mt-6 mb-1.5 px-1 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
        Siste hendelser
      </p>
      <Suspense fallback={<LedgerSkeleton />}>
        <ActivityLedger />
      </Suspense>

      <PullQuote className="mt-6">Orden i protokollen.</PullQuote>
    </AdminShell>
  );
}

// ─── Greeting card ───────────────────────────────────────────────────────

async function GreetingCard({
  dateLine,
  timeOfDay,
}: {
  dateLine: string;
  timeOfDay: string;
}) {
  const { supabase, userId } = await getAdminContext();
  const { data: profile } = await supabase
    .from('users')
    .select('name')
    .eq('id', userId!)
    .single();
  const firstNameValue = firstName(profile?.name) ?? 'saksbehandler';

  return (
    <section
      className="relative mb-4 overflow-hidden rounded-2xl border px-5 py-[18px]"
      style={{
        background:
          'linear-gradient(180deg, var(--admin-salutation-top) 0%, var(--admin-salutation-bottom) 100%)',
        borderColor: 'var(--admin-salutation-border)',
      }}
    >
      <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
        Saksbehandler
      </p>
      <h1 className="mt-1 font-serif text-[22px] font-medium leading-snug tracking-[-0.015em] text-text">
        God {timeOfDay}, {firstNameValue}.
      </h1>
      <p className="mt-1.5 font-sans text-xs tabular-nums text-muted">
        {dateLine}
      </p>
      <ClubStamp className="absolute right-[14px] top-[14px]" />
    </section>
  );
}

function GreetingSkeleton({ dateLine }: { dateLine: string }) {
  return (
    <section
      className="relative mb-4 overflow-hidden rounded-2xl border px-5 py-[18px]"
      style={{
        background:
          'linear-gradient(180deg, var(--admin-salutation-top) 0%, var(--admin-salutation-bottom) 100%)',
        borderColor: 'var(--admin-salutation-border)',
      }}
    >
      <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
        Saksbehandler
      </p>
      <Skeleton className="mt-1 h-7 w-3/5" />
      <p className="mt-1.5 font-sans text-xs tabular-nums text-muted">
        {dateLine}
      </p>
      <ClubStamp className="absolute right-[14px] top-[14px]" />
    </section>
  );
}

// ─── Tile grid ───────────────────────────────────────────────────────────

type TileIconKind = 'flagg' | 'konvolutt' | 'bane' | 'pokal' | 'sparkle' | 'formats' | 'laurbaer';
type Tile = {
  label: string;
  href: string;
  meta: string;
  icon: TileIconKind;
  accent?: boolean;
};

async function TilesGrid() {
  // Admin-only: the page branches non-admins to PlayerKlubbhus before reaching
  // here, so these counts (all games / all users / all courses) only ever run
  // for an admin.
  const { supabase } = await getAdminContext();
  const now = new Date();

  const [
    activeGamesRes,
    plannedGamesRes,
    pendingInvitesRes,
    usersRes,
    coursesRes,
    lastFinishedRes,
    lastPublishedRes,
    activeCupsRes,
    activeLeaguesRes,
  ] = await Promise.all([
    supabase
      .from('games')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active'),
    supabase
      .from('games')
      .select('id', { count: 'exact', head: true })
      .in('status', ['draft', 'scheduled']),
    supabase
      .from('invitations')
      .select('id', { count: 'exact', head: true })
      .is('accepted_at', null)
      .gt('expires_at', now.toISOString()),
    supabase.from('users').select('id', { count: 'exact', head: true }),
    supabase.from('courses').select('id', { count: 'exact', head: true }),
    supabase
      .from('games')
      .select('ended_at')
      .eq('status', 'finished')
      .order('ended_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('product_updates')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('tournaments')
      .select('id', { count: 'exact', head: true })
      .in('status', ['draft', 'active']),
    supabase
      .from('leagues')
      .select('id', { count: 'exact', head: true })
      .in('status', ['draft', 'active']),
  ]);

  const activeCount = activeGamesRes.count ?? 0;
  const plannedCount = plannedGamesRes.count ?? 0;
  const pendingInvites = pendingInvitesRes.count ?? 0;
  const userCount = usersRes.count ?? 0;
  const courseCount = coursesRes.count ?? 0;
  const lastFinishedAt = (lastFinishedRes.data as { ended_at: string | null } | null)
    ?.ended_at;
  const lastPublishedAt = (
    lastPublishedRes.data as { created_at: string | null } | null
  )?.created_at;
  const activeCupCount = activeCupsRes.count ?? 0;
  const activeLeagueCount = activeLeaguesRes.count ?? 0;

  const tiles: Tile[] = [
    {
      label: 'Spill',
      href: '/admin/games',
      meta: `${activeCount} aktive · ${plannedCount} planlagte`,
      icon: 'flagg',
      accent: true,
    },
    {
      label: 'Spillere',
      href: '/admin/spillere',
      meta:
        userCount === 0
          ? 'Ingen registrerte ennå'
          : `${userCount} registrert${pendingInvites > 0 ? ` · ${pendingInvites} venter` : ''}`,
      icon: 'konvolutt',
    },
    {
      label: 'Baner',
      href: '/admin/courses',
      meta:
        courseCount === 0
          ? 'Ingen registrerte ennå'
          : `${courseCount} registrert${courseCount === 1 ? '' : 'e'}`,
      icon: 'bane',
    },
    {
      label: 'Resultatprotokoll',
      href: '/admin/games?status=finished',
      meta: lastFinishedAt
        ? `Sist signert ${formatShortDateNb(lastFinishedAt)}`
        : 'Ingen signerte runder',
      icon: 'pokal',
    },
    {
      label: 'Lanseringer',
      href: '/admin/lanseringer',
      meta: lastPublishedAt
        ? `Sist publisert ${formatShortDateNb(lastPublishedAt)}`
        : 'Ingen publisert ennå',
      icon: 'sparkle',
    },
    {
      label: 'Cuper',
      href: '/admin/cup',
      meta:
        activeCupCount === 0
          ? 'Ingen aktive'
          : `${activeCupCount} aktiv${activeCupCount === 1 ? '' : 'e'}`,
      icon: 'pokal',
    },
    {
      label: 'Ligaer',
      href: '/admin/liga',
      meta:
        activeLeagueCount === 0
          ? 'Ingen aktive'
          : `${activeLeagueCount} aktiv${activeLeagueCount === 1 ? '' : 'e'}`,
      icon: 'pokal',
    },
    // F3 (#273): admin format-mapping. Mappings + cup-eligibility +
    // active-flagg styres herfra. Meta er statisk (vi har ingen tellbar
    // KPI per d.d. — kan utvides hvis vi vil vise antall aktive formats).
    {
      label: 'Formats',
      href: '/admin/formats',
      meta: 'Styr spillformene i wizarden',
      icon: 'formats',
    },
    // #50: klubber — admin governance (opprett og styr klubber).
    {
      label: 'Klubber',
      href: '/admin/klubber',
      meta: 'Opprett og styr klubber',
      icon: 'laurbaer',
    },
  ];

  return <TileGridView tiles={tiles} />;
}

/**
 * Presentational tile grid — shared by the admin dashboard (TilesGrid) and the
 * regular-player Klubbhuset view (PlayerKlubbhus) so both render identical
 * card chrome. The `accent` tile gets the champagne-on-forest treatment.
 */
function TileGridView({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="mb-2 grid grid-cols-2 gap-2.5">
      {tiles.map((tile, i) => (
        <SmartLink
          key={tile.label}
          href={tile.href}
          className="reveal-up min-h-[108px] rounded-2xl px-3.5 pt-3.5 pb-3 text-left"
          style={{
            animationDelay: `${60 + i * 70}ms`,
            background: tile.accent ? 'var(--surface-strong)' : 'var(--surface)',
            color: tile.accent ? 'var(--bg-tint)' : 'var(--text)',
            border: tile.accent ? 'none' : '1px solid var(--border)',
            boxShadow: tile.accent
              ? '0 4px 14px rgba(26, 46, 31, 0.15)'
              : '0 1px 2px rgba(26, 46, 31, 0.03)',
          }}
        >
          <div
            className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-[9px]"
            style={{
              background: tile.accent
                ? 'rgba(201, 169, 97, 0.20)'
                : 'var(--admin-bg)',
              color: tile.accent ? 'var(--accent)' : 'var(--primary)',
            }}
          >
            <TileIcon kind={tile.icon} />
          </div>
          <p className="font-serif text-base font-medium tracking-[-0.005em]">
            {tile.label}
          </p>
          <p
            className="mt-0.5 font-sans text-[11px] tabular-nums"
            style={{
              color: tile.accent
                ? 'rgba(240, 237, 229, 0.75)'
                : 'var(--text-muted)',
            }}
          >
            {tile.meta}
          </p>
        </SmartLink>
      ))}
    </div>
  );
}

/**
 * Regular-player (and trusted-creator) view of the universal Klubbhuset room
 * (#392). No admin counts, no activity ledger — just the two surfaces a
 * non-admin owns: the games they arrange (Spill → /klubbhuset) and adding a
 * course (Baner). Trusted creators reach the full course catalog; regular
 * players get the create-only door (#366 gave them create, not edit).
 */
async function PlayerKlubbhus({ role }: { role: AdminRoleContext }) {
  const { supabase } = await getAdminContext();
  const { data: profile } = await supabase
    .from('users')
    .select('name')
    .eq('id', role.userId)
    .single();
  const firstNameValue = firstName(profile?.name) ?? 'spiller';

  const banerTile: Tile = role.isTrusted
    ? {
        label: 'Baner',
        href: '/admin/courses',
        meta: 'Se og legg til baner',
        icon: 'bane',
      }
    : {
        label: 'Baner',
        href: '/opprett-bane',
        meta: 'Legg til en bane',
        icon: 'bane',
      };

  const tiles: Tile[] = [
    {
      label: 'Spill',
      href: '/klubbhuset',
      meta: 'Spillene du arrangerer',
      icon: 'flagg',
      accent: true,
    },
    banerTile,
    // #442: klubber — opprett og styr klubber.
    {
      label: 'Klubber',
      href: '/klubber',
      meta: 'Klubbene dine',
      icon: 'laurbaer',
    },
  ];

  return (
    <AdminShell>
      <TopBar backHref="/" kicker="Klubbhuset" />

      <section
        className="relative mb-4 overflow-hidden rounded-2xl border px-5 py-[18px]"
        style={{
          background:
            'linear-gradient(180deg, var(--admin-salutation-top) 0%, var(--admin-salutation-bottom) 100%)',
          borderColor: 'var(--admin-salutation-border)',
        }}
      >
        <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          Klubbhuset
        </p>
        <h1 className="mt-1 font-serif text-[22px] font-medium leading-snug tracking-[-0.015em] text-text">
          Hei, {firstNameValue}.
        </h1>
        <p className="mt-1.5 font-sans text-xs text-muted">
          Sett opp en runde eller legg til en bane.
        </p>
        <ClubStamp className="absolute right-[14px] top-[14px]" />
      </section>

      <TileGridView tiles={tiles} />

      <PullQuote className="mt-6">
        En god runde begynner med god planlegging.
      </PullQuote>
    </AdminShell>
  );
}

function TilesSkeleton() {
  return (
    <div className="mb-2 grid grid-cols-2 gap-2.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="min-h-[108px] rounded-2xl border border-border bg-surface px-3.5 pt-3.5 pb-3"
        >
          <Skeleton className="mb-2.5 h-9 w-9 rounded-[9px]" delay={i * 90} />
          <Skeleton className="h-4 w-16" delay={i * 90 + 30} />
          <Skeleton className="mt-1.5 h-3 w-24" delay={i * 90 + 60} />
        </div>
      ))}
    </div>
  );
}

// ─── Activity ledger ─────────────────────────────────────────────────────

async function ActivityLedger() {
  const { supabase } = await getAdminContext();
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const sinceIso = new Date(nowMs - 14 * 24 * 60 * 60 * 1000).toISOString();

  type SubmissionRow = {
    submitted_at: string;
    users: { name: string | null } | null;
    games: { name: string } | null;
  };
  type ApprovalRow = {
    approved_at: string;
    users: { name: string | null } | null;
    games: { name: string } | null;
  };
  type GameLifecycleRow = {
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
    games: { name: string } | null;
  };

  const [subsRes, apprsRes, gamesRes, coursesEvRes, invitesRes] =
    await Promise.all([
      supabase
        .from('game_players')
        .select(
          'submitted_at, users!game_players_user_id_fkey(name), games(name)',
        )
        .not('submitted_at', 'is', null)
        .gte('submitted_at', sinceIso)
        .order('submitted_at', { ascending: false })
        .limit(8)
        .returns<SubmissionRow[]>(),
      supabase
        .from('game_players')
        .select(
          'approved_at, users!game_players_user_id_fkey(name), games(name)',
        )
        .not('approved_at', 'is', null)
        .gte('approved_at', sinceIso)
        .order('approved_at', { ascending: false })
        .limit(8)
        .returns<ApprovalRow[]>(),
      supabase
        .from('games')
        .select('name, started_at, ended_at')
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
        .select('accepted_at, email, games(name)')
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
      who: shortName(r.users?.name),
      action: 'leverte scorekort',
      ref: r.games?.name ?? '(spill)',
    });
  }
  for (const r of apprsRes.data ?? []) {
    activity.push({
      ts: r.approved_at,
      who: shortName(r.users?.name),
      action: 'fikk scorekort signert',
      ref: r.games?.name ?? '(spill)',
    });
  }
  for (const g of gamesRes.data ?? []) {
    if (g.started_at && g.started_at >= sinceIso) {
      activity.push({
        ts: g.started_at,
        who: 'Sekretariatet',
        action: 'startet runden',
        ref: g.name,
      });
    }
    if (g.ended_at && g.ended_at >= sinceIso) {
      activity.push({
        ts: g.ended_at,
        who: 'Sekretariatet',
        action: 'signerte protokollen',
        ref: g.name,
      });
    }
  }
  for (const c of coursesEvRes.data ?? []) {
    activity.push({
      ts: c.created_at,
      who: displayName(c.created_by_user) ?? 'Sekretariatet',
      action: 'registrerte ny bane',
      ref: c.name,
    });
  }
  for (const inv of invitesRes.data ?? []) {
    activity.push({
      ts: inv.accepted_at,
      who: shortName(inv.email.split('@')[0]),
      action: 'tok imot invitasjon',
      ref: inv.games?.name ?? 'klubbinvitasjon',
    });
  }
  activity.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  const ledger = activity.slice(0, 8);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      {ledger.length === 0 ? (
        <p className="px-4 py-5 text-center text-sm text-muted">
          Ingen aktivitet siste 14 dager.
        </p>
      ) : (
        ledger.map((row, i) => (
          <div
            key={`${row.ts}-${i}`}
            className="reveal-up grid grid-cols-[42px_1fr] items-baseline gap-2.5 px-3.5 py-2.5"
            style={{
              animationDelay: `${60 + i * 60}ms`,
              borderTop:
                i === 0 ? 'none' : '1px solid var(--row-divider-warm)',
            }}
          >
            <span className="font-serif text-xs font-medium tabular-nums text-muted">
              {formatHHMM(row.ts)}
            </span>
            <div>
              <p className="text-[13px] text-text">
                <b className="font-semibold">{row.who}</b> {row.action}
              </p>
              <p className="mt-0.5 font-serif text-[11px] italic text-muted">
                {row.ref}
              </p>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function LedgerSkeleton() {
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

// ─── Helpers ─────────────────────────────────────────────────────────────

function shortName(full: string | undefined | null): string {
  if (!full) return '(ukjent)';
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function TileIcon({ kind }: { kind: TileIconKind }) {
  if (kind === 'flagg') return <FlaggIcon width={22} height={22} />;
  if (kind === 'konvolutt') return <KonvoluttIcon width={22} height={22} />;
  if (kind === 'bane') return <BaneIcon width={22} height={22} />;
  if (kind === 'sparkle') return <SparkleIcon width={22} height={22} />;
  if (kind === 'formats') return <FormatsIcon width={22} height={22} />;
  if (kind === 'laurbaer') return <LaurbaerIcon width={22} height={22} />;
  return <PokalIcon width={22} height={22} />;
}
