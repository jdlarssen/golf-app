import { Suspense, cache } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';
import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { Skeleton } from '@/components/ui/Skeleton';
import { ScoreShape } from '@/components/scoring/ScoreShape';
import { scoreShape } from '@/lib/scoring/scoreShape';
import { scoreTone } from '@/lib/scoring/scoreTone';
import {
  computeLeaderboard,
  parseMode,
  type LbHole,
  type LbPlayer,
  type LbScore,
  type LeaderboardMode,
  type TeamLine,
} from '@/lib/leaderboard';
import { revealState, shouldHideNetto } from '@/lib/games/visibility';
import { formatRevealName } from '@/lib/names/formatRevealName';
import { nameInitials } from '@/lib/names/initials';
import { getGameWithPlayers } from '@/lib/games/getGameWithPlayers';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  mode?: string | string[];
  team?: string | string[];
}>;

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

const getDrilldownContext = cache(async () => {
  const supabase = await getServerClient();
  const userId = await getProxyVerifiedUserId();
  return { supabase, userId };
});

export default async function LeaderboardHolesPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const requestedMode: LeaderboardMode = parseMode(sp.mode);
  const teamParam = Array.isArray(sp.team) ? sp.team[0] : sp.team;
  const requestedTeam = teamParam ? Number.parseInt(teamParam, 10) : null;

  const { supabase, userId } = await getDrilldownContext();
  if (!userId) redirect('/login');

  // Game + players come from the tag-cached helper. Admin check stays
  // direct since it isn't game-scoped.
  const [gwp, profileRes] = await Promise.all([
    getGameWithPlayers(id),
    supabase
      .from('users')
      .select('is_admin')
      .eq('id', userId)
      .single<{ is_admin: boolean }>(),
  ]);

  if (!gwp) notFound();
  const game = gwp.game;

  if (game.status === 'draft' || game.status === 'scheduled') {
    redirect(`/games/${id}`);
  }
  const isActive = game.status === 'active';

  // Reveal-modus override: in reveal-active state, force brutto. Netto-mode
  // would expose the very ordering the admin has chosen to hide until the
  // game finishes. Stale `?mode=netto` query params from bookmarks or
  // before-the-toggle-flip links also fall through to brutto.
  const state = revealState(game.score_visibility, game.status);
  const forceBrutto = shouldHideNetto(state);
  const mode: LeaderboardMode = forceBrutto ? 'brutto' : requestedMode;

  const isAdmin = profileRes.data?.is_admin === true;
  // Non-admin players must be a participant. Reads from cached players list.
  if (!isAdmin && !gwp.players.some((p) => p.user_id === userId)) {
    notFound();
  }

  return (
    <Suspense fallback={<DrilldownSkeleton />}>
      <DrilldownBody
        gameId={id}
        courseId={game.course_id}
        mode={mode}
        isActive={isActive}
        requestedTeam={requestedTeam}
      />
    </Suspense>
  );
}

async function DrilldownBody({
  gameId,
  courseId,
  mode,
  isActive,
  requestedTeam,
}: {
  gameId: string;
  courseId: string;
  mode: LeaderboardMode;
  isActive: boolean;
  requestedTeam: number | null;
}) {
  const { supabase } = await getDrilldownContext();

  // Players come from the tag-cached helper (cache hit — outer page already
  // warmed it). Holes + scores stay direct fetches.
  const [gwp, rawHolesRes, rawScoresRes] = await Promise.all([
    getGameWithPlayers(gameId),
    supabase
      .from('course_holes')
      .select('hole_number, par, stroke_index')
      .eq('course_id', courseId)
      .order('hole_number', { ascending: true })
      .returns<CourseHoleRow[]>(),
    supabase
      .from('scores')
      .select('user_id, hole_number, strokes')
      .eq('game_id', gameId)
      .returns<ScoreRow[]>(),
  ]);

  if (!gwp) notFound();
  if (rawHolesRes.error) throw rawHolesRes.error;
  if (rawScoresRes.error) throw rawScoresRes.error;

  const players: LbPlayer[] = gwp.players
    .filter((p) => p.users != null)
    .map((p) => ({
      userId: p.user_id,
      // Defensive: see comment on LbPlayer in the leaderboard page.
      name: p.users!.name ?? '(ukjent)',
      nickname: p.users!.nickname,
      teamNumber: p.team_number,
      courseHandicap: p.course_handicap ?? 0,
    }));

  const allHoles: LbHole[] = (rawHolesRes.data ?? []).map((h) => ({
    holeNumber: h.hole_number,
    par: h.par,
    strokeIndex: h.stroke_index,
  }));

  const allScores: LbScore[] = (rawScoresRes.data ?? []).map((s) => ({
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
    redirect(`/games/${gameId}/leaderboard?mode=${mode}`);
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
      gameId={gameId}
      mode={mode}
      isActive={isActive}
      orderedLines={orderedLines}
      selected={selected}
      holeWinners={holeWinners}
    />
  );
}

function DrilldownSkeleton() {
  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="mx-auto max-w-md pb-12">
        <header className="flex items-center justify-between gap-2 px-4 pb-2 pt-3.5">
          <span className="-ml-2 inline-flex h-8 w-8 items-center justify-center text-lg text-text">
            ‹
          </span>
          <Skeleton className="h-3 w-32" />
          <span className="w-8" aria-hidden />
        </header>
        <div className="flex items-center gap-3.5 px-4 pt-1.5 pb-3.5">
          <Skeleton className="h-12 w-12 rounded-md" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-5 w-2/5" delay={30} />
            <Skeleton className="mt-1 h-3 w-3/5" delay={60} />
          </div>
          <div className="shrink-0 text-right">
            <Skeleton className="ml-auto h-6 w-12" delay={90} />
            <Skeleton className="ml-auto mt-1 h-2.5 w-10" delay={120} />
          </div>
        </div>
        <div className="mx-4 mt-2 overflow-hidden rounded-[14px] border border-border bg-surface">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div
              key={i}
              className="grid items-center gap-2.5 px-3.5 py-2.5"
              style={{
                gridTemplateColumns: '28px 30px 1fr auto 32px 14px',
                borderTop:
                  i === 0 ? 'none' : '1px solid var(--border)',
              }}
            >
              <Skeleton className="h-3 w-4" delay={i * 40} />
              <Skeleton className="h-3 w-6" delay={i * 40 + 20} />
              <Skeleton className="h-3 w-16" delay={i * 40 + 40} />
              <Skeleton className="ml-auto h-4 w-6" delay={i * 40 + 60} />
              <Skeleton className="h-3 w-8" delay={i * 40 + 80} />
              <span />
            </div>
          ))}
        </div>
      </div>
    </div>
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

  const frontPar = frontRows.reduce((sum, h) => sum + h.par, 0);
  const backPar = backRows.reduce((sum, h) => sum + h.par, 0);
  const frontNet = frontRows.reduce((sum, h) => sum + (h.teamNet ?? 0), 0);
  const backNet = backRows.reduce((sum, h) => sum + (h.teamNet ?? 0), 0);
  const totalPar = frontPar + backPar;
  const totalVsPar = selected.total - totalPar;
  const holesWon = holeWinners.filter((w) => w === selected.teamNumber).length;

  const isLeader = selected.rank === 1;
  // Finished games surface the dramatic reveal-name; mid-round we keep the
  // compact first-name + HCP label so the drilldown stays readable on
  // narrow tiles.
  const isFinished = !isActive;
  const playerMeta = isFinished
    ? selected.players
        .map((p) => formatRevealName(p.name, p.nickname))
        .join(' · ')
    : selected.players
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
          <SmartLink
            href={`/games/${gameId}/leaderboard?mode=${mode}`}
            aria-label="Tilbake til leaderboard"
            className="-ml-2 inline-flex h-8 w-8 items-center justify-center text-lg text-text"
          >
            ‹
          </SmartLink>
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
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 px-5 pb-2 text-[10.5px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <strong className="font-serif font-bold text-text">B</strong>
            <span>= brukt netto</span>
          </span>
          <span className="ml-auto font-serif text-[11px] italic">
            initial · brutto · netto · vs par   →   lag
          </span>
        </div>

        {/* Front nine */}
        <div className="px-5 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.20em] text-muted">
          Ut · hull 1–9
        </div>
        <HoleTable
          rows={frontRows}
teamPlayers={selected.players}
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
teamPlayers={selected.players}
              summaryLabel="INN"
              summaryPar={backPar}
              summaryNet={backNet}
            />

            {/* Total bar — read-only summary, ikke en CTA. Toner ned fra
                tidligere bg-primary-fyll (skrek til leseren) til en stille
                surface med subtil topp-border. Tall + accent-kicker bærer
                hierarkiet uten å trenge høy-kontrast fyll. */}
            <div className="mx-4 mt-5 mb-5 flex items-center justify-between rounded-[14px] border border-border bg-surface px-5 py-3.5 text-text">
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.20em] text-accent">
                  Totalt
                </span>
                <span className="mt-0.5 block text-[11.5px] tabular-nums text-muted">
                  {holesWon} hull vunnet
                </span>
              </div>
              <div className="flex items-baseline gap-3">
                <span className="font-serif text-[32px] font-semibold leading-none tracking-[-0.02em] tabular-nums">
                  {selected.total}
                </span>
                <span className="font-sans text-[14px] font-semibold tabular-nums text-muted">
                  {formatVsPar(totalVsPar)}
                </span>
              </div>
            </div>
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
// Hole table — one card per hole. Hull-info on the left, per-player rows
// (initial · brutto-shape · netto · netto-vs-par) stacked on the right.
// ─────────────────────────────────────────────────────────────────────────────

function HoleTable({
  rows,
  teamPlayers,
  summaryLabel,
  summaryPar,
  summaryNet,
}: {
  rows: TeamLine['holes'];
  teamPlayers: LbPlayer[];
  summaryLabel: 'UT' | 'INN';
  summaryPar: number;
  summaryNet: number;
}) {
  const summaryTone = vsParTone(summaryNet - summaryPar);
  return (
    <div className="mx-4 mt-1.5 overflow-hidden rounded-[14px] border border-border bg-surface shadow-[0_1px_2px_rgba(26,46,31,0.03)]">
      {rows.map((row, ii) => (
        <HoleRow
          key={row.holeNumber}
          row={row}
          teamPlayers={teamPlayers}
          staggerIndex={ii}
        />
      ))}
      {/* Summary row — same flex shape as HoleRow but with totals on the right. */}
      <div
        className="flex items-center gap-2 bg-surface-2 px-3 py-2.5"
        style={{ borderTop: '1.5px solid var(--border)' }}
      >
        <div className="flex w-[40px] shrink-0 flex-col items-center justify-center">
          <span className="font-serif text-[13px] font-semibold tracking-[0.04em] text-muted">
            {summaryLabel}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] tabular-nums text-muted">
            P{summaryPar}
          </span>
        </div>
        <div className="flex-1" />
        <span className="text-right font-serif text-[18px] font-semibold leading-none tracking-[-0.015em] tabular-nums text-text">
          {summaryNet}
        </span>
        <span
          className="ml-2 w-[40px] shrink-0 rounded-full px-2 py-0.5 text-center text-[10px] font-semibold tabular-nums"
          style={{
            background: `var(${summaryTone.bg})`,
            color: `var(${summaryTone.fg})`,
          }}
        >
          {formatVsPar(summaryNet - summaryPar)}
        </span>
      </div>
    </div>
  );
}

function HoleRow({
  row,
  teamPlayers,
  staggerIndex,
}: {
  row: TeamLine['holes'][number];
  teamPlayers: LbPlayer[];
  staggerIndex: number;
}) {
  // Map userId → first + last name initial (e.g. "Karl Hansen" → "KH").
  const initialFor = new Map<string, string>();
  for (const p of teamPlayers) {
    initialFor.set(p.userId, nameInitials(p.name));
  }

  const teamVsPar = row.teamNet == null ? null : row.teamNet - row.par;
  const teamTone = vsParTone(teamVsPar ?? 0);

  return (
    <div
      className="reveal-up flex items-stretch gap-2 border-t border-border bg-surface px-3 py-2 first:border-t-0"
      style={{ animationDelay: `${40 + staggerIndex * 22}ms` }}
    >
      {/* Hull # + Par on the left, spanning both player rows. */}
      <div className="flex w-[40px] shrink-0 flex-col items-center justify-center">
        <span className="font-serif text-[15px] font-medium leading-none tabular-nums text-text">
          {row.holeNumber}
        </span>
        <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] tabular-nums text-muted">
          P{row.par}
        </span>
      </div>

      {/* Per-player rows stacked vertically — initial · brutto · netto · vs-par. */}
      <div className="flex flex-1 flex-col justify-center gap-1.5">
        {row.players.map((pc) => {
          const isBestNet =
            pc.net !== null && row.teamNet !== null && pc.net === row.teamNet;
          const grossText = pc.gross == null ? '–' : String(pc.gross);
          const nettoText = pc.net == null ? '–' : String(pc.net);
          const initial = initialFor.get(pc.userId) ?? '?';
          const nettoVsPar = pc.net == null ? null : pc.net - row.par;
          const nettoTone = vsParTone(nettoVsPar ?? 0);

          return (
            <div
              key={pc.userId}
              className="flex items-center gap-2 font-serif tabular-nums"
              aria-label={
                isBestNet
                  ? `Brukt netto for laget: ${initial}, brutto ${grossText}, +${pc.extraStrokes} slag, netto ${nettoText}`
                  : `${initial}, brutto ${grossText}, +${pc.extraStrokes} slag, netto ${nettoText}`
              }
            >
              <span
                className={`w-6 text-center text-[12px] ${
                  isBestNet ? 'font-bold text-text' : 'font-normal text-muted'
                }`}
              >
                {initial}
              </span>
              <ScoreShape
                shape={scoreShape(pc.gross, row.par)}
                tone={scoreTone(pc.gross, row.par)}
                size="sm"
              >
                {grossText}
              </ScoreShape>
              <span
                className={`min-w-[18px] text-right text-[14px] ${
                  isBestNet ? 'font-semibold text-text' : 'font-normal text-muted'
                }`}
              >
                {nettoText}
              </span>
              <span
                className="w-[32px] rounded-full py-0.5 text-center text-[10px] font-semibold tabular-nums"
                style={
                  nettoVsPar !== null
                    ? {
                        background: `var(${nettoTone.bg})`,
                        color: `var(${nettoTone.fg})`,
                      }
                    : { color: 'var(--text-muted)' }
                }
              >
                {nettoVsPar === null ? '—' : formatVsPar(nettoVsPar)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Lagets score på hullet — spans both player rows on the far right. */}
      <div className="flex shrink-0 items-center justify-end gap-2">
        <span className="font-serif text-[18px] font-semibold leading-none tracking-[-0.015em] tabular-nums text-text">
          {row.teamNet ?? '–'}
        </span>
        <span
          className="w-[40px] rounded-full py-0.5 text-center text-[10px] font-semibold tabular-nums"
          style={
            teamVsPar !== null
              ? {
                  background: `var(${teamTone.bg})`,
                  color: `var(${teamTone.fg})`,
                }
              : { color: 'var(--text-muted)' }
          }
        >
          {teamVsPar === null ? '—' : formatVsPar(teamVsPar)}
        </span>
      </div>
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
    <SmartLink
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
    </SmartLink>
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
