import { SmartLink } from '@/components/ui/SmartLink';
import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { BackLink } from '@/components/ui/BackLink';
import { Card } from '@/components/ui/Card';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { HourGlass } from '@/components/icons/HourGlass';
import { firstName } from '@/lib/firstName';
import {
  expectedFirstScoreTime,
  formatTeeOffTime,
} from '@/lib/format/teeOff';
import { isFrontNineOpen } from '@/lib/leaderboard/frontNineGate';
import {
  computeLeaderboard,
  parseMode,
  teamMembersLabel,
  type LbHole,
  type LbPlayer,
  type LbScore,
  type LeaderboardMode,
  type TeamLine,
} from '@/lib/leaderboard';
import { PreRoundLeaderboardRealtime } from './PreRoundLeaderboard';
import { State4View } from './State4View';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ mode?: string | string[] }>;

type GameStatus = 'draft' | 'scheduled' | 'active' | 'finished';

type GameRow = {
  id: string;
  name: string;
  status: GameStatus;
  course_id: string;
  tee_box_id: string;
  scheduled_tee_off_at: string | null;
  courses: { name: string } | null;
  tee_boxes: { name: string } | null;
};

type GamePlayerRow = {
  user_id: string;
  team_number: number;
  course_handicap: number | null;
  users: { name: string; nickname: string | null } | null;
};

type CourseHoleRow = {
  hole_number: number;
  par: number;
  stroke_index: number;
};

type ScoreRow = {
  user_id: string;
  hole_number: number;
  strokes: number | null;
};

export default async function LeaderboardPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const mode: LeaderboardMode = parseMode(sp.mode);

  const userId = await getProxyVerifiedUserId();
  if (!userId) redirect('/login');
  const supabase = await getServerClient();

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select(
      'id, name, status, course_id, tee_box_id, scheduled_tee_off_at, courses(name), tee_boxes(name)',
    )
    .eq('id', id)
    .single<GameRow>();
  if (gameError || !game) notFound();

  // Draft games have no leaderboard view — bounce to game home.
  if (game.status === 'draft') {
    redirect(`/games/${id}`);
  }

  // Participant OR admin guard.
  const { data: profile } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', userId)
    .single<{ is_admin: boolean }>();
  const isAdmin = profile?.is_admin === true;

  if (!isAdmin) {
    const { data: me } = await supabase
      .from('game_players')
      .select('user_id')
      .eq('game_id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (!me) notFound();
  }

  const { data: rawPlayers, error: playersError } = await supabase
    .from('game_players')
    .select(
      'user_id, team_number, course_handicap, users!game_players_user_id_fkey(name, nickname)',
    )
    .eq('game_id', id)
    .returns<GamePlayerRow[]>();
  if (playersError) throw playersError;

  const { data: rawHoles, error: holesError } = await supabase
    .from('course_holes')
    .select('hole_number, par, stroke_index')
    .eq('course_id', game.course_id)
    .order('hole_number', { ascending: true })
    .returns<CourseHoleRow[]>();
  if (holesError) throw holesError;

  const { data: rawScores, error: scoresError } = await supabase
    .from('scores')
    .select('user_id, hole_number, strokes')
    .eq('game_id', id)
    .returns<ScoreRow[]>();
  if (scoresError) throw scoresError;

  const players: LbPlayer[] = (rawPlayers ?? [])
    .filter((p) => p.users != null)
    .map((p) => ({
      userId: p.user_id,
      name: p.users!.name,
      nickname: p.users!.nickname,
      teamNumber: p.team_number,
      courseHandicap: p.course_handicap ?? 0,
    }));

  const holes: LbHole[] = (rawHoles ?? []).map((h) => ({
    holeNumber: h.hole_number,
    par: h.par,
    strokeIndex: h.stroke_index,
  }));

  const scores: LbScore[] = (rawScores ?? []).map((s) => ({
    userId: s.user_id,
    holeNumber: s.hole_number,
    strokes: s.strokes,
  }));

  // F1: view branching. State #3 (timeglass) when game hasn't progressed far
  // enough to show anything meaningful — either still scheduled, or active
  // but no team has finished front 9 yet. State #3.5 (front 9 visible, back
  // 9 locked) when at least one team has completed front 9 but game isn't
  // finished. Full leaderboard once status flips to finished.
  //
  // Currently state #3.5 falls through to the full leaderboard render below
  // as a placeholder; F3 will replace it with the half-view layout.
  const frontNineOpen = isFrontNineOpen({
    players: (rawPlayers ?? []).map((p) => ({
      user_id: p.user_id,
      team_number: p.team_number,
    })),
    scores: (rawScores ?? []).map((s) => ({
      user_id: s.user_id,
      hole_number: s.hole_number,
      strokes: s.strokes,
    })),
  });

  type View = 'state3' | 'state3.5' | 'full';
  const view: View =
    game.status === 'finished' ? 'full' : !frontNineOpen ? 'state3' : 'state3.5';

  if (view === 'state3') {
    return renderState3({
      gameId: id,
      teeOffAt: game.scheduled_tee_off_at,
      players,
    });
  }

  if (view === 'state3.5') {
    return renderState35({
      gameId: id,
      mode,
      players,
      holes,
      scores,
    });
  }

  const lines = computeLeaderboard({ mode, players, holes, scores });
  const orderedLines = [...lines].sort((a, b) => a.rank - b.rank);
  const coursePar = holes.reduce((sum, h) => sum + h.par, 0);

  // State #4 — full reveal. Designed in quick-win-5; lives in its own client
  // view so the Replay pill and confetti can share state.
  return (
    <State4View
      gameId={id}
      gameName={game.name}
      teams={orderedLines}
      mode={mode}
      coursePar={coursePar}
    />
  );
}

/**
 * Position badge — rank-aware label + accent colour.
 *
 * Inlined into TeamCard because the visual treatment (gold for 1st, silver
 * for 2nd, bronze for 3rd) is tied to surrounding card styling.
 */
function rankAccent(rank: number): {
  cardClass: string;
  badge: string;
  badgeClass: string;
} {
  if (rank === 1) {
    return {
      cardClass:
        'border-accent bg-accent/[0.06] shadow-[0_2px_12px_rgba(201,169,97,0.15)]',
      badge: '🥇',
      badgeClass: 'text-accent',
    };
  }
  if (rank === 2) {
    return {
      cardClass: 'border-muted/40',
      badge: '🥈',
      badgeClass: 'text-muted',
    };
  }
  if (rank === 3) {
    return {
      cardClass: 'border-warning/40',
      badge: '🥉',
      badgeClass: 'text-warning',
    };
  }
  return { cardClass: '', badge: `${rank}.`, badgeClass: 'text-muted' };
}

function TeamCard({
  line,
  leaderTotal,
}: {
  line: TeamLine;
  leaderTotal: number;
}) {
  const accent = rankAccent(line.rank);
  const members = teamMembersLabel(line.players);
  const missing = line.missingHoles.length;
  const isLeader = line.rank === 1;
  const delta = line.total - leaderTotal;

  return (
    <div className={`lb-row ${isLeader ? '' : ''}`}>
      <Card className={accent.cardClass}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className={`text-lg ${accent.badgeClass}`}>
                {accent.badge}
              </span>
              <p className="font-serif text-xl font-medium tracking-tight text-text">
                Lag {line.teamNumber}
              </p>
            </div>
            <p className="text-sm text-muted truncate mt-1">
              {members || '(uten spillere)'}
            </p>
            {line.tiedWith.length > 0 && (
              <p className="text-xs text-muted mt-1">
                Delt {line.rank}. plass med{' '}
                {line.tiedWith.map((id) => `Lag ${id}`).join(', ')}
              </p>
            )}
            {missing > 0 && (
              <p className="text-xs text-warning mt-1">
                ⚠️ {missing} hull mangler
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p
              className={`score-num text-text leading-none ${
                isLeader ? 'text-4xl' : 'text-3xl'
              }`}
            >
              {line.total}
            </p>
            {!isLeader && delta > 0 && (
              <p className="inline-num text-xs text-muted mt-1.5">
                +{delta}
              </p>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

export function ModeToggle({
  gameId,
  mode,
  basePath,
}: {
  gameId: string;
  mode: LeaderboardMode;
  // e.g. "/leaderboard" or "/leaderboard/holes"
  basePath: string;
}) {
  const base = `/games/${gameId}${basePath}`;
  return (
    <div
      role="tablist"
      aria-label="Modus"
      className="inline-flex rounded-full bg-primary-soft p-1"
    >
      <SmartLink
        role="tab"
        aria-selected={mode === 'netto'}
        href={`${base}?mode=netto`}
        className={`min-h-[36px] px-4 py-1.5 rounded-full text-sm font-medium tracking-tight transition-all ${
          mode === 'netto'
            ? 'bg-surface text-text shadow-sm'
            : 'text-muted hover:text-text'
        }`}
      >
        Netto
      </SmartLink>
      <SmartLink
        role="tab"
        aria-selected={mode === 'brutto'}
        href={`${base}?mode=brutto`}
        className={`min-h-[36px] px-4 py-1.5 rounded-full text-sm font-medium tracking-tight transition-all ${
          mode === 'brutto'
            ? 'bg-surface text-text shadow-sm'
            : 'text-muted hover:text-text'
        }`}
      >
        Brutto
      </SmartLink>
    </div>
  );
}

/**
 * State #3 — "Stille før stormen". Rendered when the game hasn't progressed
 * far enough for a leaderboard to be meaningful: status=scheduled, or
 * status=active with no team yet through front 9. The PreRoundLeaderboardRealtime
 * client component subscribes to scores INSERTs and refreshes the route on
 * the first score so the server re-evaluates the gate and can flip to #3.5.
 *
 * The startliste shows one row per team (sorted by team_number). Tee-off is
 * the same per row for now — per-flight staggered tee times are a future
 * feature. When `teeOffAt` is null (legacy game from before D2 migration),
 * the heading falls back to "Stille før stormen." and the tee column shows
 * an em-dash.
 */
function renderState3(opts: {
  gameId: string;
  teeOffAt: string | null;
  players: LbPlayer[];
}) {
  const { gameId, teeOffAt, players } = opts;
  const teeOffDate = teeOffAt ? new Date(teeOffAt) : null;
  const teeOffLabel = teeOffDate ? formatTeeOffTime(teeOffDate) : '—';

  // Group players by team, sorted by team_number ascending.
  const teamNumbers = Array.from(
    new Set(players.map((p) => p.teamNumber)),
  ).sort((a, b) => a - b);
  const teams = teamNumbers.map((teamNumber) => ({
    teamNumber,
    members: players.filter((p) => p.teamNumber === teamNumber),
  }));
  const teamCount = teams.length;

  return (
    <AppShell>
      <PreRoundLeaderboardRealtime gameId={gameId} />

      <header className="mb-6 flex items-center justify-between gap-4">
        <BackLink href="/">← Hjem</BackLink>
        {/* Per design spec § state 3: kicker is the literal "LEADERBOARD"
            section label (not the game name like state #2 uses). */}
        <Kicker tone="accent">LEADERBOARD</Kicker>
        <span className="w-12" aria-hidden />
      </header>

      {/* Hero */}
      <section className="flex flex-col items-center text-center px-5 pt-6 pb-2">
        <HourGlass size={48} className="text-primary" />
        <Kicker tone="muted" className="mt-14">
          STILLE FØR STORMEN
        </Kicker>
        <h1 className="mt-6 font-serif text-[24px] font-medium tracking-[-0.015em] leading-tight text-text">
          {teeOffDate
            ? `Første score forventet kl ${expectedFirstScoreTime(teeOffDate)}.`
            : 'Stille før stormen.'}
        </h1>
        <p className="mt-10 max-w-[280px] font-sans text-[13px] leading-[1.5] text-muted">
          {teamCount} lag er på vei ut. Tabellen våkner når første kort kommer
          inn.
        </p>
      </section>

      {/* Startliste header */}
      <section className="px-6 pt-[22px] pb-2 text-center">
        <Kicker tone="muted">STARTLISTE</Kicker>
      </section>

      {/* Team list */}
      <ul className="px-4 pb-4 flex flex-col gap-2">
        {teams.map((team, idx) => (
          <li
            key={team.teamNumber}
            className="px-3.5 py-3 bg-surface border border-border rounded-xl shadow-sm flex items-center gap-3"
          >
            <span className="w-6 shrink-0 text-center font-serif tabular-nums text-[13px] text-muted">
              {idx + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-serif text-[15px] font-medium tracking-[-0.005em] text-text">
                Lag {team.teamNumber}
              </p>
              <p className="mt-0.5 truncate font-sans text-[11.5px] text-muted">
                {team.members
                  .map((m) => firstName(m.name) ?? m.name)
                  .join(' · ') || '(uten spillere)'}
              </p>
            </div>
            <div className="text-right shrink-0">
              <Kicker tone="muted">TEE</Kicker>
              <p className="mt-0.5 font-serif text-[15px] font-medium tracking-[-0.01em] tabular-nums text-text">
                {teeOffLabel}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <PullQuote className="px-6 pt-1 pb-4">Lykke til.</PullQuote>
    </AppShell>
  );
}

/**
 * State #3.5 — "Front 9 åpen, back 9 låst". Rendered when status='active' and
 * at least one team has fully completed front 9 (both players × all 9 holes).
 *
 * The leaderboard is computed against scores+holes clipped to the front 9,
 * so partial teams naturally get `missingHoles.length > 0` and the existing
 * TeamCard renders "⚠️ N hull mangler" — which reads correctly on a 9-hole
 * view ("3 hull mangler" of the 9). Back 9 stays hidden behind the locked
 * block until status flips to 'finished'.
 */
function renderState35(opts: {
  gameId: string;
  mode: LeaderboardMode;
  players: LbPlayer[];
  holes: LbHole[];
  scores: LbScore[];
}) {
  const { gameId, mode, players, holes, scores } = opts;

  const frontNineHoles = holes.filter(
    (h) => h.holeNumber >= 1 && h.holeNumber <= 9,
  );
  const frontNineScores = scores.filter(
    (s) => s.holeNumber >= 1 && s.holeNumber <= 9,
  );

  const lines = computeLeaderboard({
    mode,
    players,
    holes: frontNineHoles,
    scores: frontNineScores,
  });
  const orderedLines = [...lines].sort((a, b) => a.rank - b.rank);
  const leaderTotal = orderedLines.find((l) => l.rank === 1)?.total ?? 0;

  return (
    <AppShell>
      {/* Reuse the pre-round realtime — same scores-INSERT subscription
          works here too. When a new score lands the page refreshes; the
          server re-evaluates view (may stay #3.5 or eventually flip to
          'full' when admin ends the game). */}
      <PreRoundLeaderboardRealtime gameId={gameId} />

      <header className="mb-4 flex items-center justify-between gap-4">
        <BackLink href="/">← Hjem</BackLink>
        <Kicker tone="accent">LEADERBOARD</Kicker>
        <span className="w-12" aria-hidden />
      </header>

      {/* FRONT 9 champagne pill — signals this isn't the final standing. */}
      <div className="flex justify-center mb-5">
        <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-[0.18em] px-3 py-1 rounded-full bg-accent/10 text-accent border border-accent/30">
          FRONT 9
        </span>
      </div>

      <div className="flex justify-center mb-5">
        <ModeToggle gameId={gameId} mode={mode} basePath="/leaderboard" />
      </div>

      <div className="space-y-3 px-4">
        {orderedLines.length === 0 && (
          <Card>
            <p className="text-sm text-muted">Ingen lag å vise.</p>
          </Card>
        )}
        {orderedLines.map((line) => (
          <TeamCard
            key={line.teamNumber}
            line={line}
            leaderTotal={leaderTotal}
          />
        ))}
      </div>

      {/* Locked back 9 block — back-9 scores stay hidden until the game is
          finished so the climax doesn't get spoiled mid-round.
          bg-surface (no opacity) lifts off the page bg in both modes:
          white on linen in light, forest-on-darker-forest in dark. The
          /50 we tried first read too subtle in dark mode. */}
      <div className="mx-4 mt-6 rounded-2xl border border-dashed border-border bg-surface px-5 py-6 text-center">
        <p className="font-serif text-[16px] font-medium text-text">
          🤫 Vi sees ved hull 18.
        </p>
        <p className="mt-2 font-sans text-xs text-muted">
          Alle scorekort må være levert og godkjent før resten av tabellen
          vises.
        </p>
      </div>

      <PullQuote className="px-6 pt-4 pb-4">Lykke til.</PullQuote>
    </AppShell>
  );
}
