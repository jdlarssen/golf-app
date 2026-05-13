import { Suspense, cache } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';
import { notFound } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { BackLink } from '@/components/ui/BackLink';
import { Banner } from '@/components/ui/Banner';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { MiniRibbon } from '@/components/ui/MiniRibbon';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusChip, type StatusChipTone } from '@/components/ui/StatusChip';
import type { GameStatus } from '@/lib/games/status';
import { StartGameButton } from './StartGameButton';
import { StartScheduledGameButton } from './StartScheduledGameButton';
import { EndGameButton } from './EndGameButton';
import { ApprovePlayerButton } from './ApprovePlayerButton';
import { ReopenScorecardButton } from './ReopenScorecardButton';
import { ReopenGameButton } from './ReopenGameButton';
import {
  startGame,
  startScheduledGameAction,
  adminApproveScorecard,
  endGame,
  reopenScorecard,
  reopenGame,
} from './actions';
import {
  ERROR_MESSAGES_EXISTING_GAME,
  buildErrorMessage as buildGameErrorMessage,
} from '@/lib/admin/gameErrorMessages';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  status?: string | string[];
  error?: string | string[];
  emails?: string | string[];
}>;

const STATUS_TO_TONE: Record<GameStatus, StatusChipTone> = {
  draft: 'utkast',
  scheduled: 'påmelding',
  active: 'aktiv',
  finished: 'signert',
};

const STATUS_BANNERS: Record<string, string> = {
  draft_created: '✓ Spillet ble lagret som utkast.',
  scheduled: '✓ Spillet er publisert. Spillerne ser det nå i Mine spill.',
  updated: '✓ Endringene er lagret.',
  started: '✓ Runden er i gang. Spillerne kan taste slag.',
  admin_approved: '✓ Scorekort godkjent på vegne av flighten.',
  finished: '✓ Spillet er avsluttet. Leaderboard er åpen for alle.',
  scorecard_reopened: '✓ Scorekortet er åpnet for redigering.',
  game_reopened: '✓ Spillet er aktivt igjen.',
};

const MONTHS_NB = [
  'jan',
  'feb',
  'mar',
  'apr',
  'mai',
  'jun',
  'jul',
  'aug',
  'sep',
  'okt',
  'nov',
  'des',
];

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function buildErrorMessage(
  errorCode: string | undefined,
  emails: string | undefined,
): string | undefined {
  return buildGameErrorMessage(ERROR_MESSAGES_EXISTING_GAME, errorCode, emails);
}

function shortNb(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return `${d.getDate()}. ${MONTHS_NB[d.getMonth()]}`;
  } catch {
    return null;
  }
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
  scheduled_tee_off_at: string | null;
  created_at: string;
  courses: { name: string } | null;
  tee_boxes: {
    name: string;
    slope: number;
    course_rating: number;
    par_total: number;
  } | null;
};

type GamePlayerRow = {
  user_id: string;
  team_number: number;
  flight_number: number;
  course_handicap: number | null;
  submitted_at: string | null;
  approved_at: string | null;
  users: {
    // name is null until the invitee completes their profile — see
    // migration 0014. Pre-created placeholder rows can still appear on a
    // draft roster, so consumers must fall back to email below.
    name: string | null;
    nickname: string | null;
    hcp_index: number | string;
    email: string;
  } | null;
};

// Request-scoped Supabase client. Each Suspense body that needs it pulls
// from this cached helper so we don't pay the cookie-auth cost per section.
const getAdminGameContext = cache(async () => {
  const supabase = await getServerClient();
  return { supabase };
});

// Memoised "Sak {YYYY}-{NNN}" computation. No DB column for the sak number;
// it's derived from the position of this game within its creation year.
// Both the title-bar pill and the footer footnote read this, so we cache
// to avoid two identical count queries per request.
const getSakNumber = cache(
  async (
    createdAt: string,
  ): Promise<{ year: number; positionInYear: number }> => {
    const { supabase } = await getAdminGameContext();
    const created = new Date(createdAt);
    const year = created.getFullYear();
    const yearStartIso = `${year}-01-01T00:00:00Z`;
    const yearEndIso = `${year + 1}-01-01T00:00:00Z`;
    const { count } = await supabase
      .from('games')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', yearStartIso)
      .lt('created_at', yearEndIso)
      .lte('created_at', createdAt);
    return { year, positionInYear: count ?? 1 };
  },
);

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
  const errorMessage = buildErrorMessage(first(sp.error), first(sp.emails));

  const { supabase } = await getAdminGameContext();
  // Gating: fetch the game row first so we can render the title bar
  // synchronously. The rest of the page (players, progress, sak-number,
  // cards, CTAs) streams behind Suspense boundaries below.
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select(
      'id, name, status, hcp_allowance_pct, require_peer_approval, course_id, tee_box_id, started_at, ended_at, scheduled_tee_off_at, created_at, courses(name), tee_boxes(name, slope, course_rating, par_total)',
    )
    .eq('id', id)
    .single<GameRow>();

  if (gameError || !game) {
    notFound();
  }

  // Date subtitle: best timestamp available for the lifecycle stage.
  const subtitleDate =
    shortNb(game.ended_at) ??
    shortNb(game.started_at) ??
    shortNb(game.scheduled_tee_off_at) ??
    shortNb(game.created_at);

  return (
    <AdminShell>
      <div className="-mt-3 mb-2 flex items-center justify-between">
        <BackLink href="/admin/games">Tilbake</BackLink>
        <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          Spill · protokoll
        </p>
        <span className="w-[80px]" aria-hidden />
      </div>

      <BrassRibbon kicker="Spill · protokoll" />

      {/* Title block */}
      <div className="px-1">
        <div className="mb-1.5 flex items-center gap-2">
          <StatusChip tone={STATUS_TO_TONE[game.status]} />
          <Suspense fallback={<Skeleton className="h-3 w-20" />}>
            <SakNumber createdAt={game.created_at} />
          </Suspense>
        </div>
        <h1 className="font-serif text-[26px] font-medium leading-snug tracking-[-0.015em] text-text">
          {game.name}
        </h1>
        <p className="mt-1 font-sans text-xs tabular-nums text-muted">
          {[
            game.courses?.name,
            'Best ball netto',
            subtitleDate,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      {(statusBanner || errorMessage) && (
        <div className="mt-4 space-y-2">
          {statusBanner && <Banner tone="success">{statusBanner}</Banner>}
          {errorMessage && <Banner tone="error">{errorMessage}</Banner>}
        </div>
      )}

      <Suspense fallback={<PlayersSectionsSkeleton />}>
        <PlayersSections gameId={id} game={game} />
      </Suspense>

      <p className="mt-6 text-center font-serif text-[11px] italic leading-relaxed text-muted">
        <Suspense fallback={<Skeleton className="inline-block h-3 w-32" />}>
          <CreatedAtFooter createdAt={game.created_at} />
        </Suspense>
      </p>

      {/* Faresone — permanent delete */}
      <section className="mt-6">
        <p className="mb-1.5 px-1 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          Faresone
        </p>
        <div
          className="rounded-xl border bg-surface px-4 py-3.5"
          style={{
            borderColor: 'rgba(180, 60, 60, 0.18)',
            boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)',
          }}
        >
          <div className="text-center">
            <SmartLink
              href={`/admin/games/${id}/slett`}
              className="font-sans text-[13px] font-medium"
              style={{ color: '#a04040' }}
            >
              Slett spillet helt
            </SmartLink>
          </div>
        </div>
      </section>
    </AdminShell>
  );
}

// ─── Suspense bodies ─────────────────────────────────────────────────────

async function SakNumber({ createdAt }: { createdAt: string }) {
  const { year, positionInYear } = await getSakNumber(createdAt);
  return (
    <span className="font-sans text-[11px] tabular-nums text-muted">
      Sak {year}-{String(positionInYear).padStart(3, '0')}
    </span>
  );
}

async function CreatedAtFooter({ createdAt }: { createdAt: string }) {
  const { year, positionInYear } = await getSakNumber(createdAt);
  return (
    <>
      Opprettet {shortNb(createdAt)} ·{' '}
      {String(positionInYear).padStart(3, '0')}. sak i {year}.
    </>
  );
}

async function PlayersSections({
  gameId,
  game,
}: {
  gameId: string;
  game: GameRow;
}) {
  const { supabase } = await getAdminGameContext();

  // game_players has two FKs to users (user_id and approved_by_user_id), so
  // we must disambiguate via the named constraint.
  const playersPromise = supabase
    .from('game_players')
    .select(
      'user_id, team_number, flight_number, course_handicap, submitted_at, approved_at, users!game_players_user_id_fkey(name, nickname, hcp_index, email)',
    )
    .eq('game_id', gameId)
    .returns<GamePlayerRow[]>();

  // Live progress: hole_number and user_id only (NO strokes — avoid spoilers).
  // Admin sees how far each flight has come without seeing the values. Only
  // queried for active games — for everything else, skip the round-trip.
  type ProgressRow = { user_id: string; hole_number: number };
  const progressPromise =
    game.status === 'active'
      ? supabase
          .from('scores')
          .select('user_id, hole_number')
          .eq('game_id', gameId)
          .not('strokes', 'is', null)
          .returns<ProgressRow[]>()
      : Promise.resolve({ data: [] as ProgressRow[], error: null });

  const [playersRes, progressRes] = await Promise.all([
    playersPromise,
    progressPromise,
  ]);

  if (playersRes.error) throw playersRes.error;
  if (progressRes.error) throw progressRes.error;

  const players = playersRes.data ?? [];

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

  const progressByFlight: Record<
    number,
    { maxHole: number; filledCells: number; totalCells: number }
  > = {};
  if (game.status === 'active') {
    const rows = progressRes.data ?? [];
    for (const f of [1, 2, 3, 4]) {
      const flightPlayers = byFlight[f];
      if (flightPlayers.length === 0) continue;
      const userIds = new Set(flightPlayers.map((p) => p.user_id));
      const flightRows = rows.filter((r) => userIds.has(r.user_id));
      const maxHole = flightRows.reduce(
        (m, r) => Math.max(m, r.hole_number),
        0,
      );
      progressByFlight[f] = {
        maxHole,
        filledCells: flightRows.length,
        totalCells: flightPlayers.length * 18,
      };
    }
  }

  function displayName(p: GamePlayerRow): string {
    if (!p.users) return '(ukjent spiller)';
    // Pending invitee — show email until they complete their profile.
    const name = p.users.name ?? p.users.email;
    return p.users.nickname ? `${name} «${p.users.nickname}»` : name;
  }

  const startAction = startGame.bind(null, gameId);
  const startScheduledAction = startScheduledGameAction.bind(null, gameId);
  const endAction = endGame.bind(null, gameId);
  const reopenGameAction = reopenGame.bind(null, gameId);

  // Readiness preview for the end-game button (only meaningful when active).
  const notSubmittedCount = players.filter((p) => !p.submitted_at).length;
  const pendingApprovalCount = game.require_peer_approval
    ? players.filter((p) => p.submitted_at != null && p.approved_at == null)
        .length
    : 0;
  const everyPlayerReady =
    players.length > 0 &&
    notSubmittedCount === 0 &&
    pendingApprovalCount === 0;

  const teamCount = [1, 2, 3, 4].filter((t) => byTeam[t].length > 0).length;
  const submittedCount = players.filter((p) => p.submitted_at != null).length;

  return (
    <>
      {/* Card 1 — Påmelding */}
      <SectionCard ribbon="Påmelding">
        <Row
          label="Spillere"
          value={`${players.length}`}
          tone={players.length > 0 ? 'full' : undefined}
        />
        <Row
          label="Levert scorekort"
          value={`${submittedCount} / ${players.length}`}
          sub={
            game.status === 'active' && notSubmittedCount > 0
              ? `${notSubmittedCount} venter`
              : undefined
          }
        />
        <Row label="Antall lag" value={`${teamCount} / 4`} />
      </SectionCard>

      {/* Card 2 — Format */}
      <SectionCard ribbon="Format">
        <Row label="Spillform" value="Best ball netto" />
        <Row
          label="Handicap-justering"
          value={`${game.hcp_allowance_pct} %`}
        />
        <Row
          label="Peer-godkjenning"
          value={game.require_peer_approval ? 'På' : 'Av'}
        />
        {game.scheduled_tee_off_at && (
          <Row
            label="Tee-off"
            value={
              new Intl.DateTimeFormat('no-NO', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              }).format(new Date(game.scheduled_tee_off_at))
            }
          />
        )}
      </SectionCard>

      {/* Card 3 — Banen */}
      <SectionCard ribbon="Banen">
        <Row
          label="Bane"
          value={game.courses?.name ?? '(ukjent)'}
        />
        {game.tee_boxes && (
          <>
            <Row label="Tee" value={game.tee_boxes.name} />
            <Row label="Par" value={`${game.tee_boxes.par_total}`} />
            <Row
              label="CR / SR"
              value={`${Number(game.tee_boxes.course_rating).toFixed(1)} / ${game.tee_boxes.slope}`}
            />
          </>
        )}
      </SectionCard>

      {/* Operational sections — kept full-fidelity ────────────────────── */}

      {game.status === 'active' && (
        <SectionCard ribbon="Fremgang">
          <div className="px-3.5 pt-3 pb-3.5">
            <p className="mb-3 text-xs text-muted">
              Hvor langt hver flight har kommet — uten å avsløre tall.
            </p>
            <ul className="space-y-3.5">
              {[1, 2, 3, 4]
                .filter((f) => byFlight[f].length > 0)
                .map((f) => {
                  const p = progressByFlight[f];
                  const pct = p
                    ? Math.round((p.filledCells / p.totalCells) * 100)
                    : 0;
                  return (
                    <li key={f}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium tracking-tight text-text">
                          Flight {f}
                        </span>
                        <span className="text-xs tabular-nums text-muted">
                          {p && p.maxHole > 0
                            ? `Hull ${p.maxHole}`
                            : 'Ikke startet'}
                          {' · '}
                          {p ? `${p.filledCells}/${p.totalCells}` : '0/0'}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
            </ul>
          </div>
        </SectionCard>
      )}

      <SectionCard ribbon="Lag">
        <div className="grid grid-cols-1 gap-2.5 px-3.5 pb-3.5 pt-3 sm:grid-cols-2">
          {[1, 2, 3, 4].map((team) => (
            <div
              key={team}
              className="rounded-xl border border-border px-3 py-2.5"
            >
              <p className="mb-1.5 font-sans text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                Lag {team}
              </p>
              {byTeam[team].length === 0 ? (
                <p className="text-sm text-muted">(tom)</p>
              ) : (
                <ul className="space-y-0.5">
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
      </SectionCard>

      {[1, 2, 3, 4].some((f) => byFlight[f].length > 0) && (
        <SectionCard ribbon="Flights">
          <ul className="space-y-2 px-3.5 pb-3.5 pt-3">
            {[1, 2, 3, 4]
              .filter((f) => byFlight[f].length > 0)
              .map((f) => (
                <li
                  key={f}
                  className="rounded-xl border border-border px-3 py-2.5"
                >
                  <p className="mb-0.5 font-sans text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                    Flight {f}
                  </p>
                  <p className="text-sm text-text">
                    {byFlight[f].map(displayName).join(', ')}
                  </p>
                </li>
              ))}
          </ul>
        </SectionCard>
      )}

      {players.length > 0 && (
        <SectionCard ribbon="Spillere">
          <div className="overflow-x-auto px-2 pb-3.5 pt-2">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-left text-[10px] font-semibold uppercase tracking-widest text-muted">
                  <th className="px-2 py-1.5 font-semibold">Navn</th>
                  <th className="px-2 py-1.5 font-semibold">Lag</th>
                  <th className="px-2 py-1.5 font-semibold">Flight</th>
                  <th className="px-2 py-1.5 text-right font-semibold">CH</th>
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
                    <tr
                      key={p.user_id}
                      className="border-t"
                      style={{ borderColor: 'var(--row-divider-warm)' }}
                    >
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
        </SectionCard>
      )}

      {game.status === 'active' && (() => {
        const submitted = players.filter((p) => p.submitted_at != null);
        if (submitted.length === 0) return null;
        return (
          <SectionCard ribbon="Leverte scorekort">
            <div className="px-3.5 pb-3.5 pt-3">
              <ul className="-mx-2 divide-y divide-border">
                {submitted.map((p) => {
                  const needsApproval =
                    game.require_peer_approval && !p.approved_at;
                  const approve = adminApproveScorecard.bind(
                    null,
                    gameId,
                    p.user_id,
                  );
                  const reopen = reopenScorecard.bind(
                    null,
                    gameId,
                    p.user_id,
                  );
                  return (
                    <li
                      key={p.user_id}
                      className="flex flex-col gap-2.5 px-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium tracking-tight text-text">
                          {displayName(p)}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          Flight {p.flight_number} · Lag {p.team_number}
                          {' · '}
                          {needsApproval
                            ? '⏳ Venter godkjenning'
                            : '✓ Godkjent'}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {needsApproval && (
                          <ApprovePlayerButton
                            approveAction={approve}
                            playerName={displayName(p)}
                          />
                        )}
                        <ReopenScorecardButton
                          reopenAction={reopen}
                          playerName={displayName(p)}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </SectionCard>
        );
      })()}

      {/* Status-specific CTA cards ─────────────────────────────────────── */}

      {game.status === 'draft' && (
        <>
          <SectionCard ribbon="Fortsett å planlegge">
            <div className="px-3.5 pb-3.5 pt-3">
              <p className="mb-3 text-sm text-muted">
                Spillet er fortsatt et utkast — bare du ser det. Fyll inn
                det som mangler og publiser når dere er klare.
              </p>
              <SmartLink
                href={`/admin/games/${gameId}/edit`}
                className="block min-h-[44px] rounded-full bg-primary px-4 py-3 text-center font-medium tracking-tight text-white transition-colors hover:bg-primary-hover"
              >
                Rediger utkast
              </SmartLink>
            </div>
          </SectionCard>

          <div className="mt-4">
            <StartGameButton startAction={startAction} gameName={game.name} />
          </div>
        </>
      )}

      {game.status === 'scheduled' && (
        <>
          <SectionCard ribbon="Start runden">
            <div className="px-3.5 pb-3.5 pt-3">
              <p className="mb-3 text-sm text-muted">
                Når du starter runden låses course handicap for hver spiller,
                redigering stenges, og spillerne kan begynne å taste slag.
              </p>
              <StartScheduledGameButton startAction={startScheduledAction} />
            </div>
          </SectionCard>

          <SectionCard ribbon="Rediger spillet">
            <div className="px-3.5 pb-3.5 pt-3">
              <p className="mb-3 text-sm text-muted">
                Spillet er i planlagt-fasen. Du kan fortsatt endre bane,
                tee-off, spillere, lag og innstillinger inntil runden startes.
              </p>
              <SmartLink
                href={`/admin/games/${gameId}/edit`}
                className="block min-h-[44px] rounded-full bg-primary px-4 py-3 text-center font-medium tracking-tight text-white transition-colors hover:bg-primary-hover"
              >
                Rediger spillet
              </SmartLink>
            </div>
          </SectionCard>
        </>
      )}

      {game.status === 'active' && (
        <SectionCard ribbon="Avslutt spillet">
          <div className="px-3.5 pb-3.5 pt-3">
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
          </div>
        </SectionCard>
      )}

      {game.status === 'finished' && (
        <SectionCard ribbon="Resultat">
          <div className="space-y-3 px-3.5 pb-3.5 pt-3">
            <SmartLink
              href={`/games/${gameId}/leaderboard`}
              className="block min-h-[44px] rounded-full bg-primary px-4 py-3 text-center font-medium tracking-tight text-white transition-colors hover:bg-primary-hover"
            >
              🏆 Se leaderboard →
            </SmartLink>
            <ReopenGameButton reopenAction={reopenGameAction} />
          </div>
        </SectionCard>
      )}
    </>
  );
}

function PlayersSectionsSkeleton() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <section key={i} className="mt-1.5">
          {/* MiniRibbon-shaped placeholder. MiniRibbon types its children
              as `string`, so we render the skeleton inline rather than as
              a ribbon child. */}
          <div className="flex items-center gap-2.5 px-1 pt-2.5 pb-1.5">
            <Skeleton className="h-2.5 w-20" delay={i * 90} />
            <span
              aria-hidden
              className="block h-px flex-1"
              style={{
                background:
                  'linear-gradient(90deg, var(--brass-line-top) 0%, transparent 90%)',
              }}
            />
          </div>
          <div
            className="overflow-hidden rounded-xl border border-border bg-surface"
            style={{ boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)' }}
          >
            {[0, 1, 2].map((j) => (
              <div
                key={j}
                className="grid items-baseline gap-3.5 px-3.5 py-2.5"
                style={{
                  gridTemplateColumns: '1fr auto',
                  borderTop:
                    j === 0 ? 'none' : '1px solid var(--row-divider-warm)',
                }}
              >
                <Skeleton className="h-3 w-24" delay={i * 90 + j * 30} />
                <Skeleton className="h-3 w-10" delay={i * 90 + j * 30 + 20} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

/**
 * "Section card" — a Card with a MiniRibbon header. Mini-ribbon sits outside
 * the card surface (per spec), the body owns the chrome.
 */
function SectionCard({
  ribbon,
  children,
}: {
  ribbon: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-1.5">
      <MiniRibbon>{ribbon}</MiniRibbon>
      <div
        className="overflow-hidden rounded-xl border border-border bg-surface"
        style={{
          boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)',
        }}
      >
        {children}
      </div>
    </section>
  );
}

/**
 * "Row" — ledger-style label/value pair with optional italic sub-line.
 * Used inside the spec's Påmelding/Format/Banen cards.
 */
function Row({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'full';
}) {
  return (
    <div
      className="grid items-baseline gap-3.5 px-3.5 py-2.5 first:border-t-0"
      style={{
        gridTemplateColumns: '1fr auto',
        borderTop: '1px solid var(--row-divider-warm)',
      }}
    >
      <div>
        <p className="font-sans text-[12.5px] font-medium text-text">{label}</p>
        {sub && (
          <p className="mt-0.5 font-serif text-[11px] italic text-muted">
            {sub}
          </p>
        )}
      </div>
      <p
        className="text-right font-serif text-[15px] font-medium tabular-nums tracking-[-0.005em]"
        style={{
          color: tone === 'full' ? '#2f5a3c' : 'var(--text)',
        }}
      >
        {value}
      </p>
    </div>
  );
}
