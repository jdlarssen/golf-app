import { Suspense, cache } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';
import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { BackLink } from '@/components/ui/BackLink';
import { Card } from '@/components/ui/Card';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { Skeleton } from '@/components/ui/Skeleton';
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
import { RevealBruttoView } from './RevealBruttoView';
import { LeaderboardTabs } from './LeaderboardTabs';
import {
  SideTournamentView,
  type SideTournamentTeam,
} from './SideTournamentView';
import {
  calculateSideTournament,
  type SideTournamentInput,
  type SideWinner,
} from '@/lib/scoring/sideTournament';
import type { GameStatus } from '@/lib/games/status';
import { revealState, type ScoreVisibility } from '@/lib/games/visibility';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  mode?: string | string[];
  return?: string | string[];
  n?: string | string[];
}>;

type GameRow = {
  id: string;
  name: string;
  status: GameStatus;
  course_id: string;
  tee_box_id: string;
  scheduled_tee_off_at: string | null;
  score_visibility: ScoreVisibility;
  side_tournament_enabled: boolean;
  side_ld_count: number;
  side_ctp_count: number;
  courses: { name: string } | null;
  tee_boxes: { name: string } | null;
};

type SideWinnerRow = {
  category: 'longest_drive' | 'closest_to_pin';
  position: number;
  winner_user_id: string | null;
};

type GamePlayerRow = {
  user_id: string;
  team_number: number;
  course_handicap: number | null;
  // Leaderboard is only rendered for non-draft games, and Task 7's publish-gate
  // prevents a game from leaving 'draft' with pending players on the roster —
  // so `name` is always set in practice. Typed nullable to match the DB column.
  users: { name: string | null; nickname: string | null } | null;
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

// Request-scoped Supabase client + verified user id. Shared by every
// Suspense body in this route so we don't pay a cookie-auth round-trip
// per section.
const getLeaderboardContext = cache(async () => {
  const supabase = await getServerClient();
  const userId = await getProxyVerifiedUserId();
  return { supabase, userId };
});

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

  // Return-to-hole support: ?return=hole&n=N points the back-arrow at a
  // specific hole on the round screen (used by the leaderboard icon in
  // the hole-skjerm header). Validate strictly — out-of-range or
  // non-integer falls back to the game-home back target.
  const returnParam = Array.isArray(sp.return) ? sp.return[0] : sp.return;
  const nParam = Array.isArray(sp.n) ? sp.n[0] : sp.n;
  const nNum = nParam != null ? Number(nParam) : null;
  const backHref =
    returnParam === 'hole' &&
    nNum !== null &&
    Number.isInteger(nNum) &&
    nNum >= 1 &&
    nNum <= 18
      ? `/games/${id}/holes/${nNum}`
      : `/games/${id}`;
  // For the holes-drilldown — preserve the same return-to-hole context.
  const returnQuery =
    returnParam === 'hole' &&
    nNum !== null &&
    Number.isInteger(nNum) &&
    nNum >= 1 &&
    nNum <= 18
      ? `&return=hole&n=${nNum}`
      : '';

  const { supabase, userId } = await getLeaderboardContext();
  if (!userId) redirect('/login');

  // Gating queries run in parallel: game row + profile (for is_admin) +
  // optional participant check. Branch-determining; must run before we
  // can pick which view to render.
  const [gameRes, profileRes] = await Promise.all([
    supabase
      .from('games')
      .select(
        'id, name, status, course_id, tee_box_id, scheduled_tee_off_at, score_visibility, side_tournament_enabled, side_ld_count, side_ctp_count, courses(name), tee_boxes(name)',
      )
      .eq('id', id)
      .single<GameRow>(),
    supabase
      .from('users')
      .select('is_admin')
      .eq('id', userId)
      .single<{ is_admin: boolean }>(),
  ]);

  if (gameRes.error || !gameRes.data) notFound();
  const game = gameRes.data;

  // Draft games have no leaderboard view — bounce to game home.
  if (game.status === 'draft') {
    redirect(`/games/${id}`);
  }

  const isAdmin = profileRes.data?.is_admin === true;

  if (!isAdmin) {
    const { data: me } = await supabase
      .from('game_players')
      .select('user_id')
      .eq('game_id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (!me) notFound();
  }

  // Body data fetch (players + holes + scores) is heavy and dictates the
  // final view branch. Stream it behind Suspense so the user sees the shell
  // immediately during navigation.
  return (
    <Suspense fallback={<LeaderboardBodySkeleton />}>
      <LeaderboardBody
        gameId={id}
        game={game}
        mode={mode}
        backHref={backHref}
        returnQuery={returnQuery}
      />
    </Suspense>
  );
}

// ─── Body ────────────────────────────────────────────────────────────────

async function LeaderboardBody({
  gameId,
  game,
  mode,
  backHref,
  returnQuery,
}: {
  gameId: string;
  game: GameRow;
  mode: LeaderboardMode;
  backHref: string;
  returnQuery: string;
}) {
  const { supabase } = await getLeaderboardContext();

  const [rawPlayersRes, rawHolesRes, rawScoresRes] = await Promise.all([
    supabase
      .from('game_players')
      .select(
        'user_id, team_number, course_handicap, users!game_players_user_id_fkey(name, nickname)',
      )
      .eq('game_id', gameId)
      .returns<GamePlayerRow[]>(),
    supabase
      .from('course_holes')
      .select('hole_number, par, stroke_index')
      .eq('course_id', game.course_id)
      .order('hole_number', { ascending: true })
      .returns<CourseHoleRow[]>(),
    supabase
      .from('scores')
      .select('user_id, hole_number, strokes')
      .eq('game_id', gameId)
      .returns<ScoreRow[]>(),
  ]);

  if (rawPlayersRes.error) throw rawPlayersRes.error;
  if (rawHolesRes.error) throw rawHolesRes.error;
  if (rawScoresRes.error) throw rawScoresRes.error;

  const players: LbPlayer[] = (rawPlayersRes.data ?? [])
    .filter((p) => p.users != null)
    .map((p) => ({
      userId: p.user_id,
      // Defensive fallback: pending invitees can't reach an active/finished
      // leaderboard per Task 7's publish-gate, but the DB column is nullable
      // so we coalesce to keep TS honest.
      name: p.users!.name ?? '(ukjent)',
      nickname: p.users!.nickname,
      teamNumber: p.team_number,
      courseHandicap: p.course_handicap ?? 0,
    }));

  const holes: LbHole[] = (rawHolesRes.data ?? []).map((h) => ({
    holeNumber: h.hole_number,
    par: h.par,
    strokeIndex: h.stroke_index,
  }));

  const scores: LbScore[] = (rawScoresRes.data ?? []).map((s) => ({
    userId: s.user_id,
    holeNumber: s.hole_number,
    strokes: s.strokes,
  }));

  // F1: view branching. State #3 (timeglass) when game hasn't progressed far
  // enough to show anything meaningful — either still scheduled, or active
  // but no team has finished front 9 yet. State #3.5 (front 9 visible, back
  // 9 locked) when at least one team has completed front 9 but game isn't
  // finished. Full leaderboard once status flips to finished.
  const frontNineOpen = isFrontNineOpen({
    players: (rawPlayersRes.data ?? []).map((p) => ({
      user_id: p.user_id,
      team_number: p.team_number,
    })),
    scores: (rawScoresRes.data ?? []).map((s) => ({
      user_id: s.user_id,
      hole_number: s.hole_number,
      strokes: s.strokes,
    })),
  });

  type View =
    | 'state3'
    | 'state3.5'
    | 'full'
    | 'reveal-active'
    | 'reveal-finished';

  // Reveal-modus changes the leaderboard storytelling: while the game is
  // still active, no netto rankings (the climax stays hidden until admin
  // avslutter). Once finished, both modes converge on the State4View — but
  // reveal-finished surfaces players via formatRevealName for the dramatic
  // nickname reveal.
  const state = revealState(game.score_visibility, game.status);
  let view: View;
  if (state === 'live-always') {
    view =
      game.status === 'finished'
        ? 'full'
        : !frontNineOpen
          ? 'state3'
          : 'state3.5';
  } else if (state === 'reveal-active') {
    view = 'reveal-active';
  } else {
    view = 'reveal-finished';
  }

  if (view === 'state3') {
    return renderState3({
      gameId,
      teeOffAt: game.scheduled_tee_off_at,
      players,
      backHref,
    });
  }

  if (view === 'state3.5') {
    return renderState35({
      gameId,
      mode,
      players,
      holes,
      scores,
      backHref,
    });
  }

  if (view === 'reveal-active') {
    // Brutto best-ball, no medals, no champagne — the netto ranking stays
    // hidden until admin avslutter (which flips us into 'reveal-finished').
    const bruttoLines = computeLeaderboard({
      mode: 'brutto',
      players,
      holes,
      scores,
    });
    const orderedBrutto = [...bruttoLines].sort((a, b) => a.rank - b.rank);
    const holesPlayed = new Set(scores.map((s) => s.holeNumber)).size;
    return (
      <RevealBruttoView
        gameId={gameId}
        gameName={game.name}
        teams={orderedBrutto}
        holesPlayed={holesPlayed}
        backHref={backHref}
      />
    );
  }

  const lines = computeLeaderboard({ mode, players, holes, scores });
  const orderedLines = [...lines].sort((a, b) => a.rank - b.rank);
  const coursePar = holes.reduce((sum, h) => sum + h.par, 0);

  // State #4 — full reveal. Designed in quick-win-5; lives in its own client
  // view so the Replay pill and confetti can share state. Used for both
  // live-mode-finished ('full') and reveal-mode-finished ('reveal-finished')
  // — both paths render the same celebratory layout with formatRevealName
  // applied to player surfaces.
  void returnQuery; // reserved for future drilldown forwarding (no-op today)
  const mainContent = (
    <State4View
      gameId={gameId}
      gameName={game.name}
      teams={orderedLines}
      mode={mode}
      coursePar={coursePar}
      backHref={backHref}
    />
  );

  // Sideturnering: kun synlig når status=finished AND side_tournament_enabled.
  // Vi er allerede inne i finished-grenen her ('full' eller 'reveal-finished'),
  // så det eneste ekstra-sjekket er enable-flagget.
  const showSideTournament = game.side_tournament_enabled;
  if (!showSideTournament) {
    return mainContent;
  }

  // Hent LD/CTP-vinnere. RLS slipper kun spillere gjennom når status=finished,
  // som vi allerede har bekreftet via view-branching ovenfor.
  const sideWinnersRes = await supabase
    .from('game_side_winners')
    .select('category, position, winner_user_id')
    .eq('game_id', gameId)
    .order('category')
    .order('position')
    .returns<SideWinnerRow[]>();

  if (sideWinnersRes.error) throw sideWinnersRes.error;
  const sideWinnerRows: SideWinnerRow[] = sideWinnersRes.data ?? [];

  // Bygg SideTournamentInput. Vi gjenbruker `orderedLines` (allerede beregnet
  // i netto-mode via computeLeaderboard ovenfor) — hver TeamLine.holes[i].teamNet
  // er nøyaktig den best-ball-netto-en sideTournament-scoring trenger.
  //
  // Viktig: `mode` kan være 'brutto' (om brukeren har bytta til brutto i hovedfanen
  // før hen åpnet leaderboarden), men sideturneringen skal alltid skåres på netto.
  // Vi beregner derfor et eget netto-pass spesifikt for sidescoringen.
  const nettoLines =
    mode === 'netto'
      ? orderedLines
      : computeLeaderboard({ mode: 'netto', players, holes, scores });

  // Sortér teams etter teamNumber for stabilt UI (matcher Lag-labels).
  const sortedNettoLines = [...nettoLines].sort(
    (a, b) => a.teamNumber - b.teamNumber,
  );

  const sideTeams: SideTournamentTeam[] = sortedNettoLines.map((line) => ({
    teamId: line.teamNumber,
    label: `Lag ${line.teamNumber}`,
    members: line.players.map((p) => ({
      userId: p.userId,
      displayName: p.name,
    })),
  }));

  const sideWinnersForInput: SideWinner[] = sideWinnerRows
    .filter(
      (w): w is SideWinnerRow & { position: 1 | 2 } =>
        w.position === 1 || w.position === 2,
    )
    .map((w) => ({
      category: w.category,
      position: w.position,
      winnerUserId: w.winner_user_id,
    }));

  const ldCount = game.side_ld_count as 0 | 1 | 2;
  const ctpCount = game.side_ctp_count as 0 | 1 | 2;

  const sideInput: SideTournamentInput = {
    config: {
      enabled: true,
      ldCount,
      ctpCount,
    },
    teams: sortedNettoLines.map((line) => ({
      teamId: line.teamNumber,
      userIds: line.players.map((p) => p.userId),
    })),
    nettoBestBallPerHole: sortedNettoLines.map((line) => {
      // computeLeaderboard returns holes sorted 1..18 already.
      const perHoleNetto: Array<number | null> = [];
      for (let h = 1; h <= 18; h++) {
        const row = line.holes.find((rh) => rh.holeNumber === h);
        perHoleNetto.push(row?.teamNet ?? null);
      }
      return { teamId: line.teamNumber, perHoleNetto };
    }),
    sideWinners: sideWinnersForInput,
  };

  const sideResult = calculateSideTournament(sideInput);

  return (
    <LeaderboardTabs
      mainContent={mainContent}
      sideContent={
        <SideTournamentView
          teams={sideTeams}
          result={sideResult}
          ldCount={ldCount}
          ctpCount={ctpCount}
          sideWinners={sideWinnerRows.map((w) => ({
            category: w.category,
            position: w.position,
            winnerUserId: w.winner_user_id,
          }))}
        />
      }
    />
  );
}

function LeaderboardBodySkeleton() {
  // Three skeleton cards inside an AppShell — close enough to state3.5
  // chrome that no obvious shell-jump happens when the body commits.
  return (
    <AppShell>
      <header className="mb-4 flex items-center justify-between gap-4">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-3 w-24" />
        <span className="w-12" aria-hidden />
      </header>

      <div className="flex justify-center mb-5">
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>

      <div className="space-y-3 px-4">
        {[0, 1, 2].map((i) => (
          <Skeleton
            key={i}
            className="h-[88px] rounded-2xl"
            delay={i * 90}
          />
        ))}
      </div>
    </AppShell>
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
  backHref: string;
}) {
  const { gameId, teeOffAt, players, backHref } = opts;
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
        <BackLink href={backHref}>Tilbake</BackLink>
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
  backHref: string;
}) {
  const { gameId, mode, players, holes, scores, backHref } = opts;

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
        <BackLink href={backHref}>Tilbake</BackLink>
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
