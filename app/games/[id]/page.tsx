import { Suspense, cache } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';
import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { BackLink } from '@/components/ui/BackLink';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { LinkButton } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Kicker } from '@/components/ui/Kicker';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusChip, type StatusChipTone } from '@/components/ui/StatusChip';
import { MailEnvelope } from '@/components/icons/MailEnvelope';
import { firstName } from '@/lib/firstName';
import { formatTeeOffTime, formatTeeOffDate } from '@/lib/format/teeOff';
import { startScheduledGame } from '@/lib/games/startScheduledGame';
import { ScheduledWaitingRoom } from './ScheduledWaitingRoom';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  status?: string | string[];
}>;

type GameStatus = 'draft' | 'scheduled' | 'active' | 'finished';

const STATUS_LABELS: Record<GameStatus, string> = {
  draft: 'Utkast',
  scheduled: 'Planlagt',
  active: 'Pågående',
  finished: 'Avsluttet',
};

// Map player-facing game lifecycle onto StatusChip's admin tone palette —
// each tone's hue happens to fit the player meaning too:
//  · aktiv (sage)      → Pågående
//  · påmelding (amber) → Planlagt (waiting for tee-off)
//  · signert (muted)   → Avsluttet (round closed)
//  · utkast (brick)    → Utkast (admin only — players never see this state)
const STATUS_TONES: Record<GameStatus, StatusChipTone> = {
  draft: 'utkast',
  scheduled: 'påmelding',
  active: 'aktiv',
  finished: 'signert',
};

const STATUS_BANNERS: Record<string, string> = {
  submitted: '✓ Scorekortet er levert.',
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

type GameRow = {
  id: string;
  name: string;
  status: GameStatus;
  course_id: string;
  tee_box_id: string;
  scheduled_tee_off_at: string | null;
  require_peer_approval: boolean;
  courses: { name: string } | null;
  tee_boxes: {
    name: string;
    slope: number;
    course_rating: number;
    par_total: number;
    length_meters: number | null;
  } | null;
};

const GAME_SELECT =
  'id, name, status, course_id, tee_box_id, scheduled_tee_off_at, require_peer_approval, courses(name), tee_boxes(name, slope, course_rating, par_total, length_meters)';

type FlightRosterRow = {
  user_id: string;
  flight_number: number;
  users: {
    name: string;
    nickname: string | null;
    hcp_index: number | string | null;
  } | null;
};

/** Norwegian thousands-separator (non-breaking space). 6124 → "6 124". */
function formatLengthMeters(n: number): string {
  return n.toLocaleString('nb-NO');
}

/** First letter of the first whitespace-separated token. Defensive on empty. */
function firstInitial(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '') return '?';
  const first = trimmed.split(/\s+/)[0];
  return first.charAt(0).toUpperCase();
}

type MyPlayerRow = {
  user_id: string;
  team_number: number;
  flight_number: number;
  course_handicap: number | null;
  submitted_at: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
};

type FlightMatePlayerRow = {
  user_id: string;
  flight_number: number;
  submitted_at: string | null;
  approved_at: string | null;
};

type UiState =
  | 'not_started'
  | 'in_progress'
  | 'ready_to_submit'
  | 'submitted_pending_approval'
  | 'submitted_approved';

function computeState(opts: {
  strokesCount: number;
  submittedAt: string | null;
  approvedAt: string | null;
  requirePeerApproval: boolean;
}): UiState {
  const { strokesCount, submittedAt, approvedAt, requirePeerApproval } = opts;
  if (submittedAt) {
    if (requirePeerApproval && !approvedAt) {
      return 'submitted_pending_approval';
    }
    return 'submitted_approved';
  }
  if (strokesCount === 0) return 'not_started';
  if (strokesCount >= 18) return 'ready_to_submit';
  return 'in_progress';
}

// Request-scoped Supabase client + verified user id. Sharing the same client
// across suspended siblings means we don't pay the cookie-auth round-trip
// per section.
const getGameContext = cache(async () => {
  const supabase = await getServerClient();
  const userId = await getProxyVerifiedUserId();
  return { supabase, userId };
});

export default async function GameHomePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const statusBanner = STATUS_BANNERS[first(sp.status) ?? ''] ?? undefined;

  // Snapshot "now" once per request for the E1 auto-start guard below.
  // The react-hooks/purity lint rule flags Date.now() as impure regardless
  // of context, but this IS a server component that runs once per request —
  // the snapshot is semantically equivalent to a server-side "now()" call.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();

  const { supabase, userId } = await getGameContext();
  // Proxy redirects unauthenticated users, but be defensive.
  if (!userId) redirect('/login');

  const { data: gameInitial, error: gameError } = await supabase
    .from('games')
    .select(GAME_SELECT)
    .eq('id', id)
    .single<GameRow>();

  if (gameError || !gameInitial) notFound();

  let game: GameRow = gameInitial;

  // Find the current user's game_players row. If they aren't a participant,
  // 404 — RLS would block this query anyway, but treat both cases the same.
  const { data: me, error: meError } = await supabase
    .from('game_players')
    .select(
      'user_id, team_number, flight_number, course_handicap, submitted_at, approved_at, rejection_reason',
    )
    .eq('game_id', id)
    .eq('user_id', userId)
    .maybeSingle<MyPlayerRow>();

  if (meError) throw meError;
  if (!me) notFound();

  // Draft games are not for players to enter.
  if (game.status === 'draft') {
    redirect('/');
  }

  // E1: server-side auto-start fallback. When the admin scheduled a tee-off
  // time but didn't manually click "Start runden nå", any player loading
  // this page after tee-off has passed triggers the same freeze-handicaps
  // + flip-to-active transition the admin button would have done. The
  // helper is idempotent and optimistic-locked, so concurrent loads (or a
  // race with the admin button) converge on the same active state.
  if (
    game.status === 'scheduled' &&
    game.scheduled_tee_off_at &&
    new Date(game.scheduled_tee_off_at).getTime() <= nowMs
  ) {
    const result = await startScheduledGame(supabase, id);
    if (!result.ok) {
      // Log to Vercel server logs so a "stuck in scheduled" report has a
      // trail. Don't crash — fall through to the existing scheduled fallback.
      console.error(
        `[auto-start] game ${id} could not flip to active: ${result.reason}`,
      );
    }
    // Re-fetch so the rest of this render sees the post-flip state.
    const { data: refreshed, error: refreshError } = await supabase
      .from('games')
      .select(GAME_SELECT)
      .eq('id', id)
      .single<GameRow>();
    if (refreshError) {
      console.error(`[auto-start] game ${id} refetch failed`, refreshError);
    } else if (refreshed) {
      game = refreshed;
    }
  }

  // State #2 — Scorekort venter. Shell renders synchronously; the flight
  // roster query streams in behind Suspense.
  if (game.status === 'scheduled') {
    const teeBox = game.tee_boxes;
    const teeOffDate = game.scheduled_tee_off_at
      ? new Date(game.scheduled_tee_off_at)
      : null;

    return (
      <AppShell>
        <header className="mb-6 flex items-center justify-between gap-4">
          <BackLink href="/">← Hjem</BackLink>
          <Kicker tone="accent">{game.name.toUpperCase()}</Kicker>
          <span className="w-12" aria-hidden />
        </header>

        {/* Hero */}
        <section className="flex flex-col items-center text-center px-6 pt-6 pb-7">
          <MailEnvelope size={56} className="text-primary" />
          <Kicker tone="muted" className="mt-4">
            DU ER PÅMELDT
          </Kicker>
          <h1 className="mt-1.5 font-serif text-[26px] font-medium tracking-[-0.015em] leading-tight text-text">
            Scorekortet åpner ved tee-off.
          </h1>
        </section>

        {/* Course card */}
        <Card className="mx-4 p-[18px]">
          <div className="flex justify-between items-baseline gap-4">
            <div className="min-w-0">
              <Kicker tone="muted">BANE</Kicker>
              <p className="mt-1 font-serif text-[19px] font-medium tracking-[-0.01em] text-text truncate">
                {game.courses?.name ?? '(ukjent bane)'}
              </p>
              {teeBox && (
                <p className="mt-1 text-xs text-muted">
                  18 hull · Par {teeBox.par_total}
                  {teeBox.length_meters
                    ? ` · ${formatLengthMeters(teeBox.length_meters)} m`
                    : ''}
                </p>
              )}
            </div>
            <div className="text-right shrink-0">
              <Kicker tone="muted">TEE-OFF</Kicker>
              {teeOffDate ? (
                <>
                  <p className="mt-1 font-serif text-[22px] font-semibold tracking-[-0.02em] text-text tabular-nums">
                    {formatTeeOffTime(teeOffDate)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted">
                    {formatTeeOffDate(teeOffDate)}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-[11px] text-muted">Ikke satt</p>
              )}
            </div>
          </div>

          <div className="h-px bg-border my-3.5" />

          <Kicker tone="muted">DIN FLIGHT</Kicker>
          <Suspense fallback={<FlightRosterSkeleton />}>
            <FlightRoster
              gameId={id}
              flightNumber={me.flight_number}
              currentUserId={userId}
            />
          </Suspense>
        </Card>

        {/* Countdown banner */}
        {teeOffDate && (
          <div className="mx-4 mt-4">
            <ScheduledWaitingRoom
              gameId={id}
              teeOffAt={game.scheduled_tee_off_at!}
            />
          </div>
        )}

        {/* Footer caption */}
        <p className="mt-2 px-6 pt-4 pb-2 text-center font-serif italic text-[11.5px] text-muted">
          Vær på 1. tee 10 minutter før start.
        </p>
      </AppShell>
    );
  }

  const isActive = game.status === 'active';

  return (
    <AppShell>
      <PageHeader
        title={game.name}
        action={
          <BackLink href="/">← Hjem</BackLink>
        }
      />

      <div className="mb-4">
        <StatusChip
          tone={STATUS_TONES[game.status]}
          label={STATUS_LABELS[game.status]}
        />
      </div>

      {statusBanner && (
        <div className="mb-4">
          <Banner tone="success">{statusBanner}</Banner>
        </div>
      )}

      {me.rejection_reason && (
        <div className="mb-4">
          <Banner tone="info">
            Scorekortet ditt ble avvist: «{me.rejection_reason}». Rediger
            hullene og lever på nytt.
          </Banner>
        </div>
      )}

      <Suspense fallback={null}>
        <PendingApprovalsBanner
          gameId={id}
          flightNumber={me.flight_number}
          currentUserId={userId}
          requirePeerApproval={game.require_peer_approval}
          isActive={isActive}
        />
      </Suspense>

      <div className="space-y-4">
        <Card>
          <Kicker tone="muted" className="mb-2">
            BANE
          </Kicker>
          <p className="font-serif text-[19px] font-medium tracking-[-0.01em] text-text">
            {game.courses?.name ?? '(ukjent bane)'}
          </p>
          {game.tee_boxes && (
            <p className="text-xs text-muted mt-1.5 tabular-nums">
              Tee: {game.tee_boxes.name} · Slope {game.tee_boxes.slope} · CR{' '}
              {Number(game.tee_boxes.course_rating).toFixed(1)} · Par{' '}
              {game.tee_boxes.par_total}
            </p>
          )}
        </Card>

        <Card>
          <Kicker tone="muted" className="mb-2">
            DIN INFO
          </Kicker>
          <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-sm">
            <dt className="text-muted">Lag</dt>
            <dd className="text-text text-right">
              Lag <span className="score-num">{me.team_number}</span>
            </dd>
            <dt className="text-muted">Flight</dt>
            <dd className="text-text text-right">
              Flight <span className="score-num">{me.flight_number}</span>
            </dd>
            <dt className="text-muted">Course handicap</dt>
            <dd className="score-num text-text text-right">
              {me.course_handicap ?? '—'}
            </dd>
          </dl>
        </Card>

        {isActive ? (
          <Suspense fallback={<PrimaryCtaSkeleton />}>
            <PrimaryCtaSection
              gameId={id}
              currentUserId={userId}
              submittedAt={me.submitted_at}
              approvedAt={me.approved_at}
              requirePeerApproval={game.require_peer_approval}
            />
          </Suspense>
        ) : game.status === 'finished' ? (
          <LinkButton href={`/games/${id}/leaderboard`} full>
            🏆 Se leaderboard →
          </LinkButton>
        ) : (
          <div className="rounded-2xl border border-border px-4 py-3 text-sm text-muted text-center">
            Spillet er ikke startet ennå.
          </div>
        )}

        {game.status === 'finished' && (
          <SmartLink href={`/games/${id}/leaderboard/holes`} className="block">
            <Card className="min-h-[44px] flex items-center justify-between transition-colors hover:border-primary/30">
              <span className="text-base font-medium text-text">
                Hull for hull
              </span>
              <span aria-hidden className="text-muted">
                →
              </span>
            </Card>
          </SmartLink>
        )}

        <SmartLink href={`/games/${id}/scorecard`} className="block">
          <Card className="min-h-[44px] flex items-center justify-between transition-colors hover:border-primary/30">
            <span className="text-base font-medium text-text">
              Mitt scorekort
            </span>
            <span aria-hidden className="text-muted">
              →
            </span>
          </Card>
        </SmartLink>

        <div className="pt-2">
          <SmartLink
            href="/"
            className="block text-center text-sm text-muted hover:text-text transition-colors"
          >
            Tilbake til hjem
          </SmartLink>
        </div>
      </div>
    </AppShell>
  );
}

// ─── Scheduled-state flight roster ───────────────────────────────────────

async function FlightRoster({
  gameId,
  flightNumber,
  currentUserId,
}: {
  gameId: string;
  flightNumber: number;
  currentUserId: string;
}) {
  const { supabase } = await getGameContext();
  const { data: flightRows } = await supabase
    .from('game_players')
    .select(
      'user_id, flight_number, users!game_players_user_id_fkey(name, nickname, hcp_index)',
    )
    .eq('game_id', gameId)
    .eq('flight_number', flightNumber)
    .order('user_id')
    .returns<FlightRosterRow[]>();

  const flight = (flightRows ?? []).map((row) => ({
    userId: row.user_id,
    isCurrentUser: row.user_id === currentUserId,
    name: row.users?.name ?? '(ukjent)',
    hcpIndex:
      row.users?.hcp_index == null ? null : Number(row.users.hcp_index),
  }));

  return (
    <ul className="mt-2 flex flex-col gap-2">
      {flight.map((p) => (
        <li key={p.userId} className="flex items-center gap-3">
          {/*
            E5 dark-mode pass: inactive avatar uses bg-surface (not
            bg-bg). In dark mode bg-bg matches the page bg
            (--bg #0f1612), so the avatar would disappear into the
            layout with only the border visible — a hole punched in
            the page. bg-surface (--surface #1a2e1f in dark) sits as a
            slightly lighter forest disc against the page bg. Light
            mode is unchanged in feel: bg-surface (#ffffff) on the
            --bg linen still reads as a paper-on-paper subtle disc.
          */}
          <span
            className={`shrink-0 w-7 h-7 rounded-full grid place-items-center font-serif text-[12px] font-medium ${
              p.isCurrentUser
                ? 'bg-primary text-white dark:text-bg'
                : 'bg-surface text-text border border-border'
            }`}
          >
            {firstInitial(p.name)}
          </span>
          <span
            className={`flex-1 truncate text-[13.5px] ${p.isCurrentUser ? 'font-semibold' : ''}`}
          >
            {firstName(p.name) ?? p.name}
            {p.isCurrentUser && (
              <span className="font-sans text-[9.5px] font-semibold uppercase tracking-[0.18em] text-accent ml-2">
                DEG
              </span>
            )}
          </span>
          <span className="shrink-0 text-xs text-muted tabular-nums">
            HCP {p.hcpIndex != null ? p.hcpIndex.toFixed(1) : '—'}
          </span>
        </li>
      ))}
    </ul>
  );
}

function FlightRosterSkeleton() {
  return (
    <ul className="mt-2 flex flex-col gap-2">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="flex items-center gap-3">
          <Skeleton className="shrink-0 h-7 w-7 rounded-full" delay={i * 90} />
          <Skeleton className="flex-1 h-4" delay={i * 90 + 30} />
          <Skeleton className="shrink-0 h-3 w-14" delay={i * 90 + 60} />
        </li>
      ))}
    </ul>
  );
}

// ─── Pending-approvals info banner (active state) ────────────────────────

async function PendingApprovalsBanner({
  gameId,
  flightNumber,
  currentUserId,
  requirePeerApproval,
  isActive,
}: {
  gameId: string;
  flightNumber: number;
  currentUserId: string;
  requirePeerApproval: boolean;
  isActive: boolean;
}) {
  if (!requirePeerApproval || !isActive) return null;

  const { supabase } = await getGameContext();
  const { data: mates } = await supabase
    .from('game_players')
    .select('user_id, flight_number, submitted_at, approved_at')
    .eq('game_id', gameId)
    .eq('flight_number', flightNumber)
    .returns<FlightMatePlayerRow[]>();
  const pendingApprovalsForMe = (mates ?? []).filter(
    (m) =>
      m.user_id !== currentUserId &&
      m.submitted_at != null &&
      m.approved_at == null,
  ).length;

  if (pendingApprovalsForMe === 0) return null;

  return (
    <div className="mb-4">
      <Banner tone="info">
        <div className="flex items-center justify-between gap-3">
          <span>
            {pendingApprovalsForMe} spillere i flighten din venter på
            godkjenning
          </span>
          <SmartLink
            href={`/games/${gameId}/approve`}
            className="text-sm font-medium text-primary underline underline-offset-2 decoration-primary/30 hover:decoration-primary whitespace-nowrap"
          >
            Gjennomgå →
          </SmartLink>
        </div>
      </Banner>
    </div>
  );
}

// ─── Primary CTA (active state) ──────────────────────────────────────────

async function PrimaryCtaSection({
  gameId,
  currentUserId,
  submittedAt,
  approvedAt,
  requirePeerApproval,
}: {
  gameId: string;
  currentUserId: string;
  submittedAt: string | null;
  approvedAt: string | null;
  requirePeerApproval: boolean;
}) {
  const { supabase } = await getGameContext();

  const { count: strokesCountRaw } = await supabase
    .from('scores')
    .select('hole_number', { count: 'exact', head: true })
    .eq('game_id', gameId)
    .eq('user_id', currentUserId)
    .not('strokes', 'is', null);
  const strokesCount = strokesCountRaw ?? 0;

  const state = computeState({
    strokesCount,
    submittedAt,
    approvedAt,
    requirePeerApproval,
  });

  return <PrimaryCta gameId={gameId} state={state} strokesCount={strokesCount} />;
}

function PrimaryCtaSkeleton() {
  return <Skeleton className="h-12 w-full rounded-full" />;
}

function PrimaryCta({
  gameId,
  state,
  strokesCount,
}: {
  gameId: string;
  state: UiState;
  strokesCount: number;
}) {
  const subtext =
    state === 'in_progress' || state === 'ready_to_submit'
      ? `${strokesCount} av 18 hull tastet inn`
      : null;

  if (state === 'not_started') {
    return (
      <LinkButton href={`/games/${gameId}/holes/1`} full>
        Start runden →
      </LinkButton>
    );
  }

  if (state === 'in_progress') {
    return (
      <div className="space-y-1.5">
        <LinkButton href={`/games/${gameId}/holes/1`} full>
          Fortsett runden →
        </LinkButton>
        {subtext && (
          <p className="text-center text-xs text-muted tabular-nums">
            {subtext}
          </p>
        )}
      </div>
    );
  }

  if (state === 'ready_to_submit') {
    return (
      <div className="space-y-1.5">
        <LinkButton href={`/games/${gameId}/submit`} full>
          Gjennomgå og lever →
        </LinkButton>
        {subtext && (
          <p className="text-center text-xs text-muted tabular-nums">
            {subtext}
          </p>
        )}
      </div>
    );
  }

  if (state === 'submitted_pending_approval') {
    return (
      <div className="rounded-2xl border border-border px-4 py-3 text-sm text-muted text-center">
        Scorekort levert — venter på godkjenning fra en i flighten din.
      </div>
    );
  }

  // submitted_approved
  return (
    <div className="rounded-2xl border border-border px-4 py-3 text-sm text-muted text-center">
      Scorekort levert og godkjent. Venter på at admin avslutter spillet.
    </div>
  );
}
