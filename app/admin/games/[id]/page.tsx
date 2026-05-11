import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { PageHeader } from '@/components/ui/PageHeader';
import { StartGameButton } from './StartGameButton';
import { startGame } from './actions';

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
};

const ERROR_MESSAGES: Record<string, string> = {
  not_found: 'Spillet ble ikke funnet.',
  not_draft: 'Bare utkast kan startes.',
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

  const { data: rawPlayers, error: playersError } = await supabase
    .from('game_players')
    .select(
      'user_id, team_number, flight_number, course_handicap, users(name, nickname, hcp_index)',
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

  function displayName(p: GamePlayerRow): string {
    if (!p.users) return '(ukjent spiller)';
    return p.users.nickname
      ? `${p.users.name} «${p.users.nickname}»`
      : p.users.name;
  }

  const startAction = startGame.bind(null, id);

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
                </tr>
              </thead>
              <tbody>
                {players.map((p) => (
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {game.status === 'draft' && (
          <StartGameButton startAction={startAction} gameName={game.name} />
        )}

        {game.status === 'active' && (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-3 text-sm text-zinc-500">
            Til hull 1 (kommer i neste fase)
          </div>
        )}

        {game.status === 'finished' && (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-3 text-sm text-zinc-500">
            Se resultat (kommer i neste fase)
          </div>
        )}
      </div>
    </AppShell>
  );
}
