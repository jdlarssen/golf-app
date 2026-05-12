import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import {
  computeLeaderboard,
  parseMode,
  type LbHole,
  type LbPlayer,
  type LbScore,
  type LeaderboardMode,
  type TeamLine,
} from '@/lib/leaderboard';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  mode?: string | string[];
  team?: string | string[];
}>;

type GameStatus = 'draft' | 'scheduled' | 'active' | 'finished';

type GameRow = {
  id: string;
  name: string;
  status: GameStatus;
  course_id: string;
  courses: { name: string } | null;
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

export default async function LeaderboardHolesPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const mode: LeaderboardMode = parseMode(sp.mode);
  const teamParam = Array.isArray(sp.team) ? sp.team[0] : sp.team;
  const requestedTeam = teamParam ? Number.parseInt(teamParam, 10) : null;

  const supabase = await getServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('id, name, status, course_id, courses(name)')
    .eq('id', id)
    .single<GameRow>();
  if (gameError || !game) notFound();

  if (game.status === 'draft' || game.status === 'scheduled') {
    redirect(`/games/${id}`);
  }
  const isActive = game.status === 'active';

  const { data: profile } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single<{ is_admin: boolean }>();
  const isAdmin = profile?.is_admin === true;
  if (!isAdmin) {
    const { data: me } = await supabase
      .from('game_players')
      .select('user_id')
      .eq('game_id', id)
      .eq('user_id', user.id)
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

  const allHoles: LbHole[] = (rawHoles ?? []).map((h) => ({
    holeNumber: h.hole_number,
    par: h.par,
    strokeIndex: h.stroke_index,
  }));

  const allScores: LbScore[] = (rawScores ?? []).map((s) => ({
    userId: s.user_id,
    holeNumber: s.hole_number,
    strokes: s.strokes,
  }));

  // Active rounds: clip to front 9 so back-9 suspense stays intact. Matches
  // state #3.5 on the leaderboard view.
  const holes = isActive
    ? allHoles.filter((h) => h.holeNumber >= 1 && h.holeNumber <= 9)
    : allHoles;
  const scores = isActive
    ? allScores.filter((s) => s.holeNumber >= 1 && s.holeNumber <= 9)
    : allScores;

  const lines = computeLeaderboard({ mode, players, holes, scores });
  const orderedLines = [...lines].sort((a, b) => a.rank - b.rank);

  if (orderedLines.length === 0) {
    // Nothing to drill into — bounce back to the parent leaderboard, which
    // will render its own empty state.
    redirect(`/games/${id}/leaderboard?mode=${mode}`);
  }

  // Resolve which team's drilldown to render. Default = the leader (rank 1).
  // Invalid `?team=` falls back to the leader rather than erroring, so a
  // stale link from a deleted team still lands somewhere useful.
  const fallback = orderedLines[0]!;
  const selected =
    (requestedTeam != null
      ? orderedLines.find((l) => l.teamNumber === requestedTeam)
      : null) ?? fallback;

  // HOLE_WINNERS: per hole, which team won outright. Null on ties. Computed
  // once across all teams so each row in the table knows whether to show the
  // champagne dot.
  const holeWinners: Array<number | null> = selected.holes.map((h) => {
    const eligible = orderedLines
      .map((l) => {
        const row = l.holes.find((r) => r.holeNumber === h.holeNumber);
        return row?.teamNet == null
          ? null
          : { teamNumber: l.teamNumber, net: row.teamNet };
      })
      .filter((x): x is { teamNumber: number; net: number } => x !== null);
    if (eligible.length === 0) return null;
    const min = Math.min(...eligible.map((e) => e.net));
    const winners = eligible.filter((e) => e.net === min);
    return winners.length === 1 ? winners[0]!.teamNumber : null;
  });

  return (
    <DrilldownView
      gameId={id}
      mode={mode}
      isActive={isActive}
      orderedLines={orderedLines}
      selected={selected}
      holeWinners={holeWinners}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// View — drilldown for a single team (UT + INN + total bar)
// ─────────────────────────────────────────────────────────────────────────────

function DrilldownView({
  gameId,
  mode,
  isActive,
  orderedLines,
  selected,
  holeWinners,
}: {
  gameId: string;
  mode: LeaderboardMode;
  isActive: boolean;
  orderedLines: TeamLine[];
  selected: TeamLine;
  holeWinners: Array<number | null>;
}) {
  const frontRows = selected.holes.filter((h) => h.holeNumber <= 9);
  const backRows = selected.holes.filter((h) => h.holeNumber >= 10);
  const frontWinners = holeWinners.slice(0, frontRows.length);
  const backWinners = holeWinners.slice(frontRows.length);

  const frontPar = frontRows.reduce((sum, h) => sum + h.par, 0);
  const backPar = backRows.reduce((sum, h) => sum + h.par, 0);
  const frontNet = frontRows.reduce((sum, h) => sum + (h.teamNet ?? 0), 0);
  const backNet = backRows.reduce((sum, h) => sum + (h.teamNet ?? 0), 0);
  const totalPar = frontPar + backPar;
  const totalVsPar = selected.total - totalPar;
  const holesWon = holeWinners.filter((w) => w === selected.teamNumber).length;

  const isLeader = selected.rank === 1;
  const playerMeta = selected.players
    .map((p) => `${firstNameOf(p.name)} (HCP ${p.courseHandicap})`)
    .join(' · ');

  // Find sibling teams for prev/next within the ordered list — lets the user
  // tab through teams without going back to the leaderboard. Index by rank
  // ascending; if multiple teams tied, sort stably by teamNumber.
  const stableOrder = orderedLines;
  const myIdx = stableOrder.findIndex(
    (l) => l.teamNumber === selected.teamNumber,
  );

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="mx-auto max-w-md pb-12">
        <header className="flex items-center justify-between gap-2 px-4 pb-2 pt-3.5">
          <Link
            href={`/games/${gameId}/leaderboard?mode=${mode}`}
            aria-label="Tilbake til leaderboard"
            className="-ml-2 inline-flex h-8 w-8 items-center justify-center text-lg text-text"
          >
            ‹
          </Link>
          <span className="flex-1 truncate text-center text-[10px] font-semibold uppercase tracking-[0.20em] text-muted">
            Lag {selected.teamNumber} · {selected.rank}. plass
          </span>
          <span className="w-8" aria-hidden />
        </header>

        {/* Team hero */}
        <div className="flex items-center gap-3.5 px-4 pt-1.5 pb-3.5">
          <div
            className={`min-w-[50px] text-center font-serif text-[48px] font-semibold leading-none tracking-[-0.04em] tabular-nums ${
              isLeader ? 'text-accent' : 'text-muted'
            }`}
          >
            {selected.rank}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="m-0 font-serif text-[22px] font-medium tracking-[-0.015em] text-text">
              Lag {selected.teamNumber}
            </h1>
            <p className="mt-0.5 truncate text-[11.5px] text-muted">
              {playerMeta || '(uten spillere)'}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <span className="block font-serif text-[24px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-text">
              {selected.total}
            </span>
            <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.12em] tabular-nums text-muted">
              {formatVsPar(selected.total - totalPar)} PAR
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3.5 px-5 pb-2 text-[10.5px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-[7px] w-[7px] rounded-full bg-accent"
            />
            vinner av hullet
          </span>
          <span className="inline-flex items-center gap-1">
            <sup className="text-[8px] font-semibold text-accent">•</sup>+slag
          </span>
          <span className="ml-auto font-serif text-[11px] italic">
            fet = brukt netto
          </span>
        </div>

        {/* Front nine */}
        <div className="px-5 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.20em] text-muted">
          Ut · hull 1–9
        </div>
        <HoleTable
          rows={frontRows}
          winners={frontWinners}
          selectedTeamNumber={selected.teamNumber}
          summaryLabel="UT"
          summaryPar={frontPar}
          summaryNet={frontNet}
        />

        {/* Back nine (finished only) */}
        {isActive ? (
          <div className="mx-4 mt-5 rounded-2xl border border-dashed border-border bg-surface px-5 py-6 text-center">
            <p className="font-serif text-[16px] font-medium text-text">
              🤫 Vi sees ved hull 18.
            </p>
            <p className="mt-2 text-xs text-muted">
              Hull 10–18 vises når alle scorekort er levert og godkjent.
            </p>
          </div>
        ) : (
          <>
            <div className="px-5 pt-5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.20em] text-muted">
              Inn · hull 10–18
            </div>
            <HoleTable
              rows={backRows}
              winners={backWinners}
              selectedTeamNumber={selected.teamNumber}
              summaryLabel="INN"
              summaryPar={backPar}
              summaryNet={backNet}
            />

            {/* Total bar */}
            <div className="mx-4 mt-5 mb-2 flex items-center justify-between rounded-[14px] bg-primary px-5 py-3.5 text-bg-tint">
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.20em] text-accent">
                  Totalt
                </span>
                <span className="mt-0.5 block text-[11.5px] opacity-75 tabular-nums">
                  {holesWon} hull vunnet
                </span>
              </div>
              <span className="font-serif text-[32px] font-semibold leading-none tracking-[-0.02em] tabular-nums">
                {selected.total}
              </span>
            </div>
            <p className="px-6 pt-1 pb-5 text-center text-[11px] text-muted tabular-nums">
              Mot par: {formatVsPar(totalVsPar)}
            </p>
          </>
        )}

        {/* Team prev/next inside the drilldown so the user can scrub through
            the field without going back to the leaderboard first. Hidden if
            there's only one team. */}
        {stableOrder.length > 1 && (
          <div className="mt-2 flex items-center justify-between px-4">
            <TeamNavLink
              gameId={gameId}
              mode={mode}
              target={stableOrder[myIdx - 1] ?? null}
              direction="prev"
            />
            <TeamNavLink
              gameId={gameId}
              mode={mode}
              target={stableOrder[myIdx + 1] ?? null}
              direction="next"
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hole table — 6-column grid: hole · par · player-grosses · team-net · pill · win-dot
// ─────────────────────────────────────────────────────────────────────────────

function HoleTable({
  rows,
  winners,
  selectedTeamNumber,
  summaryLabel,
  summaryPar,
  summaryNet,
}: {
  rows: TeamLine['holes'];
  winners: Array<number | null>;
  selectedTeamNumber: number;
  summaryLabel: 'UT' | 'INN';
  summaryPar: number;
  summaryNet: number;
}) {
  return (
    <div className="mx-4 mt-1.5 overflow-hidden rounded-[14px] border border-border bg-surface shadow-[0_1px_2px_rgba(26,46,31,0.03)]">
      {rows.map((row, ii) => (
        <HoleRow
          key={row.holeNumber}
          row={row}
          isWinner={winners[ii] === selectedTeamNumber}
          staggerIndex={ii}
        />
      ))}
      {/* Summary row */}
      <div
        className="grid items-center gap-2.5 bg-surface-2 px-3.5 py-2.5"
        style={{
          gridTemplateColumns: '28px 30px 1fr auto 32px 14px',
          borderTop: '1.5px solid var(--border)',
        }}
      >
        <span className="text-center font-serif text-[13px] font-semibold tracking-[0.04em] text-muted">
          {summaryLabel}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] tabular-nums text-muted">
          P{summaryPar}
        </span>
        <span />
        <span className="text-right font-serif text-[18px] font-semibold leading-none tracking-[-0.015em] tabular-nums text-text">
          {summaryNet}
        </span>
        <span className="text-center text-[10px] font-semibold tabular-nums text-muted">
          {formatVsPar(summaryNet - summaryPar)}
        </span>
        <span />
      </div>
    </div>
  );
}

function HoleRow({
  row,
  isWinner,
  staggerIndex,
}: {
  row: TeamLine['holes'][number];
  isWinner: boolean;
  staggerIndex: number;
}) {
  const vs = row.teamNet == null ? 0 : row.teamNet - row.par;
  const tone = vsParTone(vs);

  return (
    <div
      className="reveal-up relative grid items-center gap-2.5 border-t border-border bg-surface px-3.5 py-2.5 first:border-t-0"
      style={{
        gridTemplateColumns: '28px 30px 1fr auto 32px 14px',
        animationDelay: `${40 + staggerIndex * 22}ms`,
      }}
    >
      <span className="text-center font-serif text-[15px] font-medium tabular-nums text-text">
        {row.holeNumber}
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] tabular-nums text-muted">
        P{row.par}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {row.players.map((pc, pi) => {
          const isBestNet =
            pc.net !== null && row.teamNet !== null && pc.net === row.teamNet;
          const grossText = pc.gross == null ? '–' : String(pc.gross);
          return (
            <span
              key={pc.userId}
              className={`inline-flex items-center gap-0.5 font-serif text-[13px] tabular-nums ${
                isBestNet ? 'font-semibold text-text' : 'font-normal'
              }`}
              style={isBestNet ? undefined : { color: '#9A8F7C' }}
            >
              {grossText}
              {pc.extraStrokes > 0 && (
                <sup className="text-[8px] font-semibold text-accent">•</sup>
              )}
              {pi < row.players.length - 1 && (
                <span className="mx-0.5" style={{ color: '#D9D2C0' }}>
                  /
                </span>
              )}
            </span>
          );
        })}
      </div>
      <span
        className="min-w-[24px] text-right font-serif text-[18px] font-semibold leading-none tracking-[-0.015em] tabular-nums"
        style={{ color: `var(${tone.fg})` }}
      >
        {row.teamNet ?? '–'}
      </span>
      <span
        className="rounded-full px-0 py-0.5 text-center text-[10px] font-semibold tabular-nums"
        style={{ background: `var(${tone.bg})`, color: `var(${tone.fg})` }}
      >
        {row.teamNet == null ? '—' : formatVsPar(vs)}
      </span>
      <span className="flex items-center justify-center">
        {isWinner ? (
          <span
            aria-label="Vinner av hullet"
            className="block h-2 w-2 rounded-full bg-accent"
            style={{ boxShadow: '0 0 0 2px rgba(201,169,97,0.18)' }}
          />
        ) : null}
      </span>
    </div>
  );
}

function TeamNavLink({
  gameId,
  mode,
  target,
  direction,
}: {
  gameId: string;
  mode: LeaderboardMode;
  target: TeamLine | null;
  direction: 'prev' | 'next';
}) {
  if (!target) {
    return <span className="w-1/2" aria-hidden />;
  }
  const isPrev = direction === 'prev';
  return (
    <Link
      href={`/games/${gameId}/leaderboard/holes?team=${target.teamNumber}&mode=${mode}`}
      className={`inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-text ${
        isPrev ? '' : 'ml-auto'
      }`}
    >
      {isPrev && <span aria-hidden>‹</span>}
      <span>
        {isPrev ? 'Forrige' : 'Neste'} · {target.rank}. Lag {target.teamNumber}
      </span>
      {!isPrev && <span aria-hidden>›</span>}
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type ScoreTone = {
  fg: '--score-under-fg' | '--score-par-fg' | '--score-over1-fg' | '--score-over2-fg';
  bg: '--score-under-bg' | '--score-par-bg' | '--score-over1-bg' | '--score-over2-bg';
};

function vsParTone(vs: number): ScoreTone {
  if (vs < 0) return { fg: '--score-under-fg', bg: '--score-under-bg' };
  if (vs === 0) return { fg: '--score-par-fg', bg: '--score-par-bg' };
  if (vs === 1) return { fg: '--score-over1-fg', bg: '--score-over1-bg' };
  return { fg: '--score-over2-fg', bg: '--score-over2-bg' };
}

function formatVsPar(v: number): string {
  if (v === 0) return 'E';
  if (v > 0) return `+${v}`;
  return String(v);
}

function firstNameOf(fullName: string): string {
  const t = fullName.trim();
  if (t === '') return '';
  return t.split(/\s+/)[0]!;
}
