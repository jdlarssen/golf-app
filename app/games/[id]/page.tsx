import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui/AppShell';
import { BackLink } from '@/components/ui/BackLink';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { PageHeader } from '@/components/ui/PageHeader';

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

const STATUS_BADGE_CLASSES: Record<GameStatus, string> = {
  draft:
    'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700',
  scheduled:
    'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900',
  active:
    'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300 border border-green-200 dark:border-green-900',
  finished:
    'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-900',
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
  require_peer_approval: boolean;
  courses: { name: string } | null;
  tee_boxes: { name: string; slope: number; course_rating: number; par_total: number } | null;
};

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

  const supabase = await getServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Proxy redirects unauthenticated users, but be defensive.
  if (!user) redirect('/login');

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select(
      'id, name, status, course_id, tee_box_id, require_peer_approval, courses(name), tee_boxes(name, slope, course_rating, par_total)',
    )
    .eq('id', id)
    .single<GameRow>();

  if (gameError || !game) notFound();

  // Find the current user's game_players row. If they aren't a participant,
  // 404 — RLS would block this query anyway, but treat both cases the same.
  const { data: me, error: meError } = await supabase
    .from('game_players')
    .select(
      'user_id, team_number, flight_number, course_handicap, submitted_at, approved_at, rejection_reason',
    )
    .eq('game_id', id)
    .eq('user_id', user.id)
    .maybeSingle<MyPlayerRow>();

  if (meError) throw meError;
  if (!me) notFound();

  // Draft games are not for players to enter.
  // TODO(scheduled): scheduled games may want a dedicated "Planlagt"-view
  // (countdown, tee time, opponents) instead of falling through to the
  // generic "Spillet er ikke startet ennå" placeholder. Handled in phase E1/E2.
  if (game.status === 'draft') {
    redirect('/');
  }

  // How many holes have a strokes value? Used to decide CTA copy.
  const { count: strokesCountRaw } = await supabase
    .from('scores')
    .select('hole_number', { count: 'exact', head: true })
    .eq('game_id', id)
    .eq('user_id', user.id)
    .not('strokes', 'is', null);
  const strokesCount = strokesCountRaw ?? 0;

  // Flight-mates needing approval (only relevant when peer approval is on).
  let pendingApprovalsForMe = 0;
  if (game.require_peer_approval && game.status === 'active') {
    const { data: mates } = await supabase
      .from('game_players')
      .select('user_id, flight_number, submitted_at, approved_at')
      .eq('game_id', id)
      .eq('flight_number', me.flight_number)
      .returns<FlightMatePlayerRow[]>();
    pendingApprovalsForMe = (mates ?? []).filter(
      (m) =>
        m.user_id !== user.id && m.submitted_at != null && m.approved_at == null,
    ).length;
  }

  const state = computeState({
    strokesCount,
    submittedAt: me.submitted_at,
    approvedAt: me.approved_at,
    requirePeerApproval: game.require_peer_approval,
  });

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
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[game.status]}`}
        >
          {STATUS_LABELS[game.status]}
        </span>
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

      {pendingApprovalsForMe > 0 && (
        <div className="mb-4">
          <Banner tone="info">
            <div className="flex items-center justify-between gap-3">
              <span>
                {pendingApprovalsForMe} spillere i flighten din venter på
                godkjenning
              </span>
              <Link
                href={`/games/${id}/approve`}
                className="text-sm font-medium text-blue-700 underline whitespace-nowrap"
              >
                Gjennomgå →
              </Link>
            </div>
          </Banner>
        </div>
      )}

      <div className="space-y-4">
        <Card>
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
            Bane
          </h2>
          <p className="text-base text-zinc-900 dark:text-zinc-100">
            {game.courses?.name ?? '(ukjent bane)'}
          </p>
          {game.tee_boxes && (
            <p className="text-xs text-zinc-500 mt-1">
              Tee: {game.tee_boxes.name} · Slope {game.tee_boxes.slope} · CR{' '}
              {Number(game.tee_boxes.course_rating).toFixed(1)} · Par{' '}
              {game.tee_boxes.par_total}
            </p>
          )}
        </Card>

        <Card>
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
            Din info
          </h2>
          <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-sm">
            <dt className="text-zinc-500">Lag</dt>
            <dd className="text-zinc-900 dark:text-zinc-100 text-right">
              Lag {me.team_number}
            </dd>
            <dt className="text-zinc-500">Flight</dt>
            <dd className="text-zinc-900 dark:text-zinc-100 text-right">
              Flight {me.flight_number}
            </dd>
            <dt className="text-zinc-500">Course handicap</dt>
            <dd className="text-zinc-900 dark:text-zinc-100 text-right">
              {me.course_handicap ?? '—'}
            </dd>
          </dl>
        </Card>

        {isActive ? (
          <PrimaryCta gameId={id} state={state} strokesCount={strokesCount} />
        ) : game.status === 'finished' ? (
          <Link href={`/games/${id}/leaderboard`} className="block">
            <div className="w-full min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg font-medium transition-colors text-center text-base">
              🏆 Se leaderboard →
            </div>
          </Link>
        ) : (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-3 text-sm text-zinc-500 text-center">
            Spillet er ikke startet ennå.
          </div>
        )}

        {game.status === 'finished' && (
          <Link
            href={`/games/${id}/leaderboard/holes`}
            className="block"
          >
            <Card className="min-h-[44px] flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
              <span className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                Hull for hull
              </span>
              <span aria-hidden className="text-zinc-400">
                →
              </span>
            </Card>
          </Link>
        )}

        <Link href={`/games/${id}/scorecard`} className="block">
          <Card className="min-h-[44px] flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
            <span className="text-base font-medium text-zinc-900 dark:text-zinc-100">
              Mitt scorekort
            </span>
            <span aria-hidden className="text-zinc-400">
              →
            </span>
          </Card>
        </Link>

        <div className="pt-2">
          <Link
            href="/"
            className="block text-center text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Tilbake til hjem
          </Link>
        </div>
      </div>
    </AppShell>
  );
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
      <div className="space-y-1.5">
        <Link href={`/games/${gameId}/holes/1`} className="block">
          <div className="w-full min-h-[44px] bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg font-medium transition-colors text-center text-base">
            Start runden →
          </div>
        </Link>
      </div>
    );
  }

  if (state === 'in_progress') {
    return (
      <div className="space-y-1.5">
        <Link href={`/games/${gameId}/holes/1`} className="block">
          <div className="w-full min-h-[44px] bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg font-medium transition-colors text-center text-base">
            Fortsett runden →
          </div>
        </Link>
        {subtext && (
          <p className="text-center text-xs text-zinc-500">{subtext}</p>
        )}
      </div>
    );
  }

  if (state === 'ready_to_submit') {
    return (
      <div className="space-y-1.5">
        <Link href={`/games/${gameId}/submit`} className="block">
          <div className="w-full min-h-[44px] bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg font-medium transition-colors text-center text-base">
            Gjennomgå og lever →
          </div>
        </Link>
        {subtext && (
          <p className="text-center text-xs text-zinc-500">{subtext}</p>
        )}
      </div>
    );
  }

  if (state === 'submitted_pending_approval') {
    return (
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300 text-center">
        Scorekort levert — venter på godkjenning fra en i flighten din.
      </div>
    );
  }

  // submitted_approved
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300 text-center">
      Scorekort levert og godkjent. Venter på at admin avslutter spillet.
    </div>
  );
}
