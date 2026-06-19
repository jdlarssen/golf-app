import { useTranslations } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { SmartLink } from '@/components/ui/SmartLink';
import { ScoreShape } from '@/components/scoring/ScoreShape';
import { scoreShape } from '@/lib/scoring/scoreShape';
import { scoreTone } from '@/lib/scoring/scoreTone';
import {
  computeLeaderboard,
  type LbHole,
  type LbPlayer,
  type LbScore,
  type LeaderboardMode,
  type TeamLine,
} from '@/lib/leaderboard';
import { formatRevealName } from '@/lib/names/formatRevealName';
import { nameInitials } from '@/lib/names/initials';
import {
  hasParDifference,
  formatOtherGendersPar,
} from '@/lib/games/parDisplay';
import { getDrilldownContext, fetchHolesAndScores } from '../holesData';

export async function DrilldownBody({
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
  const tCommon = await getTranslations('leaderboard.common');

  // Players come from the tag-cached helper (cache hit — outer page already
  // warmed it). Holes + scores stay direct fetches.
  const { gwp, rawHoles, rawScores } = await fetchHolesAndScores(
    supabase,
    gameId,
    courseId,
  );

  const players: LbPlayer[] = gwp.players
    .filter((p) => p.users != null)
    .map((p) => ({
      userId: p.user_id,
      // Defensive: see comment on LbPlayer in the leaderboard page.
      name: p.users!.name ?? tCommon('unknownPlayer'),
      nickname: p.users!.nickname,
      teamNumber: p.team_number,
      courseHandicap: p.course_handicap ?? 0,
      teeGender: p.tee_gender,
    }));

  const allHoles: LbHole[] = rawHoles.map((h) => ({
    holeNumber: h.hole_number,
    par: h.par_mens,
    parByGender: {
      mens: h.par_mens,
      ladies: h.par_ladies,
      juniors: h.par_juniors,
    },
    strokeIndex: h.stroke_index,
  }));

  const allScores: LbScore[] = rawScores.map((s) => ({
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
    redirect({
      href: `/games/${gameId}/leaderboard?mode=${mode}` as string,
      locale: await getLocale(),
    });
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
  const t = useTranslations('leaderboard.holes');
  const tc = useTranslations('leaderboard.common');
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
            aria-label={t('backAriaLabel')}
            className="-ml-2 inline-flex h-8 w-8 items-center justify-center text-lg text-text"
          >
            ‹
          </SmartLink>
          <span className="flex-1 truncate text-center text-[10px] font-semibold uppercase tracking-[0.20em] text-muted">
            {t('teamHeader', { number: selected.teamNumber, rank: selected.rank })}
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
              {tc('teamLabel', { number: selected.teamNumber })}
            </h1>
            <p className="mt-0.5 truncate text-[11.5px] text-muted">
              {playerMeta || t('noPlayers')}
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
            <span>{t('legendNetLabel')}</span>
          </span>
          <span className="ml-auto font-serif text-[11px] italic">
            {t('legendFormat')}
          </span>
        </div>

        {/* Front nine */}
        <div className="px-5 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.20em] text-muted">
          {t('frontNineLabel')}
        </div>
        <HoleTable
          rows={frontRows}
          teamPlayers={selected.players}
          summaryLabel={t('summaryUt')}
          summaryPar={frontPar}
          summaryNet={frontNet}
        />

        {/* Back nine (finished only) */}
        {isActive ? (
          <div className="mx-4 mt-5 rounded-2xl border border-dashed border-border bg-surface px-5 py-6 text-center">
            <p className="font-serif text-[16px] font-medium text-text">
              {t('hiddenBackNineHeading')}
            </p>
            <p className="mt-2 text-xs text-muted">
              {t('hiddenBackNineSub')}
            </p>
          </div>
        ) : (
          <>
            <div className="px-5 pt-5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.20em] text-muted">
              {t('backNineLabel')}
            </div>
            <HoleTable
              rows={backRows}
              teamPlayers={selected.players}
              summaryLabel={t('summaryInn')}
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
                  {t('totalLabel')}
                </span>
                <span className="mt-0.5 block text-[11.5px] tabular-nums text-muted">
                  {t('holesWon', { count: holesWon })}
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
  summaryLabel: string;
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
  const t = useTranslations('leaderboard.holes');
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
          {row.parByGender && hasParDifference(row.parByGender) && (
            <sup
              data-testid="par-aside-marker"
              title={t('parAsideTitle', {
                genders: formatOtherGendersPar(row.parByGender, undefined, {
                  mens: t('parGenderMens', { par: row.parByGender.mens }),
                  ladies: t('parGenderLadies', { par: row.parByGender.ladies }),
                  juniors: t('parGenderJuniors', { par: row.parByGender.juniors }),
                }),
              })}
              aria-label={t('parAsideAriaLabel', {
                genders: formatOtherGendersPar(row.parByGender, undefined, {
                  mens: t('parGenderMens', { par: row.parByGender.mens }),
                  ladies: t('parGenderLadies', { par: row.parByGender.ladies }),
                  juniors: t('parGenderJuniors', { par: row.parByGender.juniors }),
                }),
              })}
              className="ml-0.5 cursor-help text-[0.65em] font-semibold text-muted"
            >
              *
            </sup>
          )}
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
          // Per-spiller-par (`pc.par`), ikke lagets representant-par
          // (`row.par`). På blandet-kjønn-lag på avvikshull får medspiller
          // av annet kjønn enn «kapteinen» riktig netto-vs-par og celle-tone. #252.
          const nettoVsPar = pc.net == null ? null : pc.net - pc.par;
          const nettoTone = vsParTone(nettoVsPar ?? 0);

          return (
            <div
              key={pc.userId}
              className="flex items-center gap-2 font-serif tabular-nums"
              aria-label={
                isBestNet
                  ? t('playerScoreAriaUsed', { initial, gross: grossText, extra: pc.extraStrokes, net: nettoText })
                  : t('playerScoreAria', { initial, gross: grossText, extra: pc.extraStrokes, net: nettoText })
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
                shape={scoreShape(pc.gross, pc.par)}
                tone={scoreTone(pc.gross, pc.par)}
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
  const t = useTranslations('leaderboard.holes');
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
        {isPrev
          ? t('prevTeam', { rank: target.rank, number: target.teamNumber })
          : t('nextTeam', { rank: target.rank, number: target.teamNumber })}
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
