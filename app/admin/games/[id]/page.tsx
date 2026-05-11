import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { PageHeader } from '@/components/ui/PageHeader';
import { StartGameButton } from './StartGameButton';
import { EndGameButton } from './EndGameButton';
import { ApprovePlayerButton } from './ApprovePlayerButton';
import { startGame, adminApproveScorecard, endGame } from './actions';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  status?: string | string[];
  error?: string | string[];
}>;

type GameStatus = 'draft' | 'active' | 'finished';

const STATUS_LABELS: Record<GameStatus, string> = {
  draft: 'Utkast',
  active: 'Pågående',
  finished: 'Avsluttet',
};

const STATUS_BADGE_CLASSES: Record<GameStatus, string> = {
  draft:
    'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700',
  active:
    'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300 border border-green-200 dark:border-green-900',
  finished:
    'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-900',
};

const STATUS_BANNERS: Record<string, string> = {
  draft_created: '✓ Spillet ble lagret som utkast.',
  started: '✓ Spillet er startet. Course handicap er låst for hver spiller.',
  admin_approved: '✓ Scorekort godkjent på vegne av flighten.',
  finished: '✓ Spillet er avsluttet. Leaderboard er åpen for alle.',
};

const ERROR_MESSAGES: Record<string, string> = {
  not_found: 'Spillet ble ikke funnet.',
  not_draft: 'Bare utkast kan startes.',
  not_active: 'Spillet er ikke aktivt — kan ikke avsluttes.',
  no_players: 'Ingen spillere på dette spillet.',
  not_all_submitted:
    'Alle spillere må ha levert scorekort før spillet kan avsluttes.',
  not_all_approved:
    'Alle scorekort må være godkjent før spillet kan avsluttes.',
  db_finish: 'Klarte ikke å avslutte spillet. Prøv igjen.',
  db_tee: 'Klarte ikke å lese tee-boksen fra databasen. Prøv igjen.',
  db_players: 'Klarte ikke å oppdatere spillerne. Prøv igjen.',
  db_game: 'Klarte ikke å oppdatere spillet. Prøv igjen.',
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

type GameRow = {
  id: string;
  name: string;
  status: GameStatus;
  hcp_allowance_pct: number;
  require_peer_approval: boolean;
  course_id: string;
  tee_box_id: string;
  started_at: string | null;
  ended_at: string | null;
  courses: { name: string } | null;
  tee_boxes: { name: string; slope: number; course_rating: number; par_total: number } | null;
};

type GamePlayerRow = {
  user_id: string;
  team_number: number;
  flight_number: number;
  course_handicap: number | null;
  submitted_at: string | null;
  approved_at: string | null;
  users: { name: string; nickname: string | null; hcp_index: number | string } | null;
};

export default async function GameDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const statusBanner = STATUS_BANNERS[first(sp.status) ?? ''] ?? undefined;
  const errorMessage = ERROR_MESSAGES[first(sp.error) ?? ''] ?? undefined;

  const supabase = await getServerClient();
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select(
      'id, name, status, hcp_allowance_pct, require_peer_approval, course_id, tee_box_id, started_at, ended_at, courses(name), tee_boxes(name, slope, course_rating, par_total)',
    )
    .eq('id', id)
    .single<GameRow>();

  if (gameError || !game) {
    notFound();
  }

  // game_players has two FKs to users (user_id and approved_by_user_id), so
  // we must disambiguate via the named constraint.
  const { data: rawPlayers, error: playersError } = await supabase
    .from('game_players')
    .select(
      'user_id, team_number, flight_number, course_handicap, submitted_at, approved_at, users!game_players_user_id_fkey(name, nickname, hcp_index)',
    )
    .eq('game_id', id)
    .returns<GamePlayerRow[]>();

  if (playersError) throw playersError;

  const players = rawPlayers ?? [];

  // Group by team (1..4). Each team has up to 2 players.
  const byTeam: Record<number, GamePlayerRow[]> = { 1: [], 2: [], 3: [], 4: [] };
  for (const p of players) {
    if (byTeam[p.team_number]) byTeam[p.team_number].push(p);
  }

  // Group by flight (1..4) for the flight overview.
  const byFlight: Record<number, GamePlayerRow[]> = { 1: [], 2: [], 3: [], 4: [] };
  for (const p of players) {
    if (byFlight[p.flight_number]) byFlight[p.flight_number].push(p);
  }

  // Live progress: hole_number and user_id only (NO strokes — avoid spoilers).
  // Admin sees how far each flight has come without seeing the values.
  type ProgressRow = { user_id: string; hole_number: number };
  let progressByFlight: Record<number, { maxHole: number; filledCells: number; totalCells: number }> = {};
  if (game.status === 'active') {
    const { data: progressRows } = await supabase
      .from('scores')
      .select('user_id, hole_number')
      .eq('game_id', id)
      .not('strokes', 'is', null)
      .returns<ProgressRow[]>();
    const rows = progressRows ?? [];
    for (const f of [1, 2, 3, 4]) {
      const flightPlayers = byFlight[f];
      if (flightPlayers.length === 0) continue;
      const userIds = new Set(flightPlayers.map((p) => p.user_id));
      const flightRows = rows.filter((r) => userIds.has(r.user_id));
      const maxHole = flightRows.reduce((m, r) => Math.max(m, r.hole_number), 0);
      progressByFlight[f] = {
        maxHole,
        filledCells: flightRows.length,
        totalCells: flightPlayers.length * 18,
      };
    }
  }

  function displayName(p: GamePlayerRow): string {
    if (!p.users) return '(ukjent spiller)';
    return p.users.nickname
      ? `${p.users.name} «${p.users.nickname}»`
      : p.users.name;
  }

  const startAction = startGame.bind(null, id);
  const endAction = endGame.bind(null, id);

  // Readiness preview for the end-game button (only meaningful when active).
  const notSubmittedCount = players.filter((p) => !p.submitted_at).length;
  const pendingApprovalCount = game.require_peer_approval
    ? players.filter(
        (p) => p.submitted_at != null && p.approved_at == null,
      ).length
    : 0;
  const everyPlayerReady =
    players.length > 0 &&
    notSubmittedCount === 0 &&
    pendingApprovalCount === 0;

  return (
    <AppShell>
      <PageHeader
        title={game.name}
        action={
          <Link
            href="/admin/games"
            className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Tilbake
          </Link>
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

      {errorMessage && (
        <div className="mb-4">
          <Banner tone="error">{errorMessage}</Banner>
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

        {game.status === 'active' && (
          <Card>
            <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
              Fremgang per flight
            </h2>
            <p className="text-xs text-zinc-500 mb-3">
              Hvor langt hver flight har kommet — uten å avsløre tall.
            </p>
            <ul className="space-y-3">
              {[1, 2, 3, 4]
                .filter((f) => byFlight[f].length > 0)
                .map((f) => {
                  const p = progressByFlight[f];
                  const pct = p ? Math.round((p.filledCells / p.totalCells) * 100) : 0;
                  return (
                    <li key={f}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">
                          Flight {f}
                        </span>
                        <span className="text-zinc-500 text-xs">
                          {p && p.maxHole > 0 ? `Hull ${p.maxHole}` : 'Ikke startet'}
                          {' · '}
                          {p ? `${p.filledCells}/${p.totalCells} tastet` : '0/0'}
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                        <div
                          className="h-full bg-green-600 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
            </ul>
          </Card>
        )}

        <Card>
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
            Lag
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((team) => (
              <div
                key={team}
                className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-3"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 mb-2">
                  Lag {team}
                </p>
                {byTeam[team].length === 0 ? (
                  <p className="text-sm text-zinc-500">(tom)</p>
                ) : (
                  <ul className="space-y-1">
                    {byTeam[team].map((p) => (
                      <li
                        key={p.user_id}
                        className="text-sm text-zinc-900 dark:text-zinc-100"
                      >
                        {displayName(p)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
            Flights
          </h2>
          <ul className="space-y-2">
            {[1, 2, 3, 4]
              .filter((f) => byFlight[f].length > 0)
              .map((f) => (
                <li
                  key={f}
                  className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-3"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1">
                    Flight {f}
                  </p>
                  <p className="text-sm text-zinc-900 dark:text-zinc-100">
                    {byFlight[f].map(displayName).join(', ')}
                  </p>
                </li>
              ))}
          </ul>
        </Card>

        <Card>
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
            Innstillinger
          </h2>
          <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-sm">
            <dt className="text-zinc-500">HCP-allowance</dt>
            <dd className="text-zinc-900 dark:text-zinc-100 text-right">
              {game.hcp_allowance_pct} %
            </dd>
            <dt className="text-zinc-500">Peer-godkjenning</dt>
            <dd className="text-zinc-900 dark:text-zinc-100 text-right">
              {game.require_peer_approval ? 'På' : 'Av'}
            </dd>
          </dl>
        </Card>

        <Card>
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
            Spillere
          </h2>
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-500">
                  <th className="px-2 py-1.5 font-medium">Navn</th>
                  <th className="px-2 py-1.5 font-medium">Lag</th>
                  <th className="px-2 py-1.5 font-medium">Flight</th>
                  <th className="px-2 py-1.5 font-medium text-right">CH</th>
                  {game.status !== 'draft' && (
                    <th className="px-2 py-1.5 font-medium">Status</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {players.map((p) => {
                  let statusLabel: string;
                  let statusClass: string;
                  if (!p.submitted_at) {
                    statusLabel = '⏳ Spiller';
                    statusClass = 'text-zinc-500';
                  } else if (game.require_peer_approval && !p.approved_at) {
                    statusLabel = '⏳ Venter godkjenning';
                    statusClass = 'text-amber-600 dark:text-amber-400';
                  } else {
                    statusLabel = '✓ Levert';
                    statusClass = 'text-green-700 dark:text-green-400';
                  }
                  return (
                    <tr
                      key={p.user_id}
                      className="border-t border-zinc-200 dark:border-zinc-800"
                    >
                      <td className="px-2 py-1.5 text-zinc-900 dark:text-zinc-100">
                        {displayName(p)}
                      </td>
                      <td className="px-2 py-1.5 text-zinc-700 dark:text-zinc-300">
                        {p.team_number}
                      </td>
                      <td className="px-2 py-1.5 text-zinc-700 dark:text-zinc-300">
                        {p.flight_number}
                      </td>
                      <td className="px-2 py-1.5 text-right text-zinc-700 dark:text-zinc-300">
                        {p.course_handicap ?? '—'}
                      </td>
                      {game.status !== 'draft' && (
                        <td className={`px-2 py-1.5 text-xs ${statusClass}`}>
                          {statusLabel}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {game.status === 'active' && game.require_peer_approval && (() => {
          const pending = players.filter(
            (p) => p.submitted_at != null && p.approved_at == null,
          );
          return (
            <Card>
              <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                Innleverte scorekort
              </h2>
              {pending.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  Ingen scorekort venter på godkjenning akkurat nå.
                </p>
              ) : (
                <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 -mx-2">
                  {pending.map((p) => {
                    const approve = adminApproveScorecard.bind(
                      null,
                      id,
                      p.user_id,
                    );
                    return (
                      <li
                        key={p.user_id}
                        className="px-2 py-3 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                            {displayName(p)}
                          </p>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            Flight {p.flight_number} · Lag {p.team_number}
                          </p>
                        </div>
                        <ApprovePlayerButton
                          approveAction={approve}
                          playerName={displayName(p)}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          );
        })()}

        {game.status === 'draft' && (
          <StartGameButton startAction={startAction} gameName={game.name} />
        )}

        {game.status === 'active' && (
          <Card>
            <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
              Avslutt spillet
            </h2>
            {everyPlayerReady ? (
              <div className="space-y-2">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Alle spillere har levert{game.require_peer_approval && ' og godkjent'} scorekort. Spillet kan avsluttes — leaderboard blir
                  åpen for alle deltakere.
                </p>
                <EndGameButton endAction={endAction} />
              </div>
            ) : (
              <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-200">
                {notSubmittedCount > 0 && (
                  <p>
                    {notSubmittedCount} av {players.length} spillere har ikke
                    levert.
                  </p>
                )}
                {pendingApprovalCount > 0 && (
                  <p>
                    {pendingApprovalCount} scorekort venter på godkjenning.
                  </p>
                )}
              </div>
            )}
          </Card>
        )}

        {game.status === 'finished' && (
          <Card>
            <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
              Resultat
            </h2>
            <Link href={`/games/${id}/leaderboard`} className="block">
              <div className="w-full min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg font-medium transition-colors text-center text-base">
                🏆 Se leaderboard →
              </div>
            </Link>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
