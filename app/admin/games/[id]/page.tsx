import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui/AppShell';
import { BackLink } from '@/components/ui/BackLink';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { PageHeader } from '@/components/ui/PageHeader';
import { StartGameButton } from './StartGameButton';
import { StartScheduledGameButton } from './StartScheduledGameButton';
import { EndGameButton } from './EndGameButton';
import { ApprovePlayerButton } from './ApprovePlayerButton';
import {
  startGame,
  startScheduledGameAction,
  adminApproveScorecard,
  endGame,
} from './actions';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  status?: string | string[];
  error?: string | string[];
}>;

type GameStatus = 'draft' | 'scheduled' | 'active' | 'finished';

const STATUS_LABELS: Record<GameStatus, string> = {
  draft: 'Utkast',
  scheduled: 'Planlagt',
  active: 'Pågående',
  finished: 'Avsluttet',
};

const STATUS_BADGE_CLASSES: Record<GameStatus, string> = {
  draft: 'bg-warning/10 text-warning border-warning/30',
  scheduled: 'bg-accent/10 text-accent border-accent/30',
  active: 'bg-primary-soft text-primary border-primary/20',
  finished: 'bg-accent/[0.10] text-accent border-accent/30',
};

const STATUS_BANNERS: Record<string, string> = {
  draft_created: '✓ Spillet ble lagret som utkast.',
  scheduled: '✓ Spillet er publisert. Spillerne ser det nå i Mine spill.',
  updated: '✓ Endringene er lagret.',
  started: '✓ Runden er i gang. Spillerne kan taste slag.',
  admin_approved: '✓ Scorekort godkjent på vegne av flighten.',
  finished: '✓ Spillet er avsluttet. Leaderboard er åpen for alle.',
};

const ERROR_MESSAGES: Record<string, string> = {
  not_found: 'Spillet ble ikke funnet.',
  not_draft: 'Bare utkast kan startes.',
  not_scheduled: 'Spillet kan ikke startes (det er ikke planlagt).',
  not_active: 'Spillet er ikke aktivt — kan ikke avsluttes.',
  not_editable:
    'Spillet kan ikke redigeres lenger — det er allerede startet eller avsluttet.',
  no_players: 'Ingen spillere på dette spillet.',
  not_all_submitted:
    'Alle spillere må ha levert scorekort før spillet kan avsluttes.',
  not_all_approved:
    'Alle scorekort må være godkjent før spillet kan avsluttes.',
  db_finish: 'Klarte ikke å avslutte spillet. Prøv igjen.',
  db_tee: 'Klarte ikke å lese tee-boksen fra databasen. Prøv igjen.',
  tee_missing: 'Tee-box mangler — kan ikke beregne handicap.',
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

/** Small uppercase champagne label used to title each Card section. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent mb-3">
      {children}
    </p>
  );
}

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
  const progressByFlight: Record<
    number,
    { maxHole: number; filledCells: number; totalCells: number }
  > = {};
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
  const startScheduledAction = startScheduledGameAction.bind(null, id);
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
          <BackLink href="/admin/games">Tilbake</BackLink>
        }
      />

      <div className="mb-5">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest border ${STATUS_BADGE_CLASSES[game.status]}`}
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
          <SectionLabel>Bane</SectionLabel>
          <p className="font-serif text-xl font-medium tracking-tight text-text">
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

        {game.status === 'active' && (
          <Card>
            <SectionLabel>Fremgang per flight</SectionLabel>
            <p className="text-xs text-muted mb-4">
              Hvor langt hver flight har kommet — uten å avsløre tall.
            </p>
            <ul className="space-y-4">
              {[1, 2, 3, 4]
                .filter((f) => byFlight[f].length > 0)
                .map((f) => {
                  const p = progressByFlight[f];
                  const pct = p ? Math.round((p.filledCells / p.totalCells) * 100) : 0;
                  return (
                    <li key={f}>
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <span className="font-medium tracking-tight text-text">
                          Flight {f}
                        </span>
                        <span className="text-muted text-xs tabular-nums">
                          {p && p.maxHole > 0 ? `Hull ${p.maxHole}` : 'Ikke startet'}
                          {' · '}
                          {p ? `${p.filledCells}/${p.totalCells}` : '0/0'}
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-border overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-300"
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
          <SectionLabel>Lag</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((team) => (
              <div
                key={team}
                className="border border-border rounded-xl p-3"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted mb-2">
                  Lag {team}
                </p>
                {byTeam[team].length === 0 ? (
                  <p className="text-sm text-muted">(tom)</p>
                ) : (
                  <ul className="space-y-1">
                    {byTeam[team].map((p) => (
                      <li key={p.user_id} className="text-sm text-text">
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
          <SectionLabel>Flights</SectionLabel>
          <ul className="space-y-2">
            {[1, 2, 3, 4]
              .filter((f) => byFlight[f].length > 0)
              .map((f) => (
                <li
                  key={f}
                  className="border border-border rounded-xl p-3"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted mb-1">
                    Flight {f}
                  </p>
                  <p className="text-sm text-text">
                    {byFlight[f].map(displayName).join(', ')}
                  </p>
                </li>
              ))}
          </ul>
        </Card>

        <Card>
          <SectionLabel>Innstillinger</SectionLabel>
          <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-sm">
            <dt className="text-muted">HCP-allowance</dt>
            <dd className="text-text text-right tabular-nums">
              {game.hcp_allowance_pct} %
            </dd>
            <dt className="text-muted">Peer-godkjenning</dt>
            <dd className="text-text text-right">
              {game.require_peer_approval ? 'På' : 'Av'}
            </dd>
          </dl>
        </Card>

        <Card>
          <SectionLabel>Spillere</SectionLabel>
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-left text-[10px] font-semibold uppercase tracking-widest text-muted">
                  <th className="px-2 py-1.5 font-semibold">Navn</th>
                  <th className="px-2 py-1.5 font-semibold">Lag</th>
                  <th className="px-2 py-1.5 font-semibold">Flight</th>
                  <th className="px-2 py-1.5 font-semibold text-right">CH</th>
                  {game.status !== 'draft' && (
                    <th className="px-2 py-1.5 font-semibold">Status</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {players.map((p) => {
                  let statusLabel: string;
                  let statusClass: string;
                  if (!p.submitted_at) {
                    statusLabel = '⏳ Spiller';
                    statusClass = 'text-muted';
                  } else if (game.require_peer_approval && !p.approved_at) {
                    statusLabel = '⏳ Venter';
                    statusClass = 'text-warning';
                  } else {
                    statusLabel = '✓ Levert';
                    statusClass = 'text-success';
                  }
                  return (
                    <tr key={p.user_id} className="border-t border-border">
                      <td className="px-2 py-2 text-text">{displayName(p)}</td>
                      <td className="px-2 py-2 text-text">{p.team_number}</td>
                      <td className="px-2 py-2 text-text">{p.flight_number}</td>
                      <td className="px-2 py-2 text-right text-text">
                        {p.course_handicap ?? '—'}
                      </td>
                      {game.status !== 'draft' && (
                        <td className={`px-2 py-2 text-xs ${statusClass}`}>
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
              <SectionLabel>Innleverte scorekort</SectionLabel>
              {pending.length === 0 ? (
                <p className="text-sm text-muted">
                  Ingen scorekort venter på godkjenning akkurat nå.
                </p>
              ) : (
                <ul className="divide-y divide-border -mx-2">
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
                          <p className="text-sm font-medium tracking-tight text-text truncate">
                            {displayName(p)}
                          </p>
                          <p className="text-xs text-muted mt-0.5">
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

        {game.status === 'scheduled' && (
          <>
            <Card>
              <SectionLabel>Start runden</SectionLabel>
              <p className="text-sm text-muted mb-3">
                Når du starter runden låses course handicap for hver spiller,
                redigering stenges, og spillerne kan begynne å taste slag.
              </p>
              <StartScheduledGameButton startAction={startScheduledAction} />
            </Card>

            <Card>
              <SectionLabel>Rediger spillet</SectionLabel>
              <p className="text-sm text-muted mb-3">
                Spillet er i planlagt-fasen. Du kan fortsatt endre bane,
                tee-off, spillere, lag og innstillinger inntil runden startes.
              </p>
              <Link
                href={`/admin/games/${id}/edit`}
                className="block w-full min-h-[44px] bg-primary hover:bg-primary-hover text-white px-4 py-3 rounded-full font-medium tracking-tight text-center transition-colors"
              >
                Rediger spillet
              </Link>
            </Card>
          </>
        )}

        {game.status === 'active' && (
          <Card>
            <SectionLabel>Avslutt spillet</SectionLabel>
            {everyPlayerReady ? (
              <div className="space-y-3">
                <p className="text-sm text-muted">
                  Alle spillere har levert
                  {game.require_peer_approval && ' og godkjent'} scorekort.
                  Spillet kan avsluttes — leaderboard blir åpen for alle
                  deltakere.
                </p>
                <EndGameButton endAction={endAction} />
              </div>
            ) : (
              <div className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm text-warning">
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
            <SectionLabel>Resultat</SectionLabel>
            <Link href={`/games/${id}/leaderboard`} className="block">
              <div className="w-full min-h-[44px] bg-primary hover:bg-primary-hover text-white px-4 py-3 rounded-full font-medium tracking-tight text-center transition-colors">
                🏆 Se leaderboard →
              </div>
            </Link>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
