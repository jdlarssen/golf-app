import type { JSX } from 'react';
import { useTranslations } from 'next-intl';
import { SmartLink } from '@/components/ui/SmartLink';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { LeaderboardBackdrop } from '@/components/illustrations/LeaderboardBackdrop';
import { formatRevealName } from '@/lib/names/formatRevealName';
import { firstName } from '@/lib/firstName';
import type { GameStatus } from '@/lib/games/status';
import {
  runningMatchStatus,
  runningStatusLabel,
} from '@/lib/scoring/modes/matchplayRunningStatus';
import type {
  FourballMatchplayResult,
  FourballHoleRow,
} from '@/lib/scoring/modes/types';
import { MatchplayDuelCard } from './MatchplayDuelCard';

// Distinkt nøkkel-prefiks slik at konfetti i fourball-duellen ikke deler
// "seen"-state med singles-matchplay eller stableford-podiene.
const STORAGE_PREFIX = 'torny-fourball-result-confetti-seen-';

/**
 * Spillerinfo for fourball-view. Map fra userId → navn + kallenavn +
 * course-handicap. Strukturert som plain Record (samme som
 * MatchplayMatchView) — userId-oppslag er trivielt og to-sider × to spillere
 * gir 4 oppføringer, ingen Map-overhead nødvendig.
 */
export interface FourballPlayerInfo {
  name: string;
  nickname: string | null;
  courseHandicap: number;
}

export interface FourballMatchplayViewProps {
  gameId: string;
  gameName: string;
  /**
   * Resultat fra `lib/scoring/modes/fourballMatchplay.compute()`. Inneholder
   * begge siders 2 spillere, per-hull-rader med lag-best per side, løpende
   * `holesUp` og `result` som er `null` mens matchen er live.
   */
  result: FourballMatchplayResult;
  /** Spillerinfo per userId. */
  playerInfo: Record<string, FourballPlayerInfo>;
  /**
   * Side-labels — defaults til «Lag 1» / «Lag 2». Cup-koblede fourball-spill
   * kan sende tournament.team_1_name/team_2_name for å speile cup-lederboardet.
   */
  side1Label?: string;
  side2Label?: string;
  /**
   * Game-status fra DB. Brukes ikke til logikk — view-en bestemmer
   * "feiring vs live" basert på `result.result`.
   */
  gameStatus: GameStatus;
  /** Hvor pilen tilbake skal peke. Defaults til spillets hjem. */
  backHref?: string;
}

/**
 * Match-view for fourball matchplay (issue #217, redesignet i #546). Speiler
 * MatchplayMatchView tett for konsistent UX mellom singles og fourball —
 * eneste reelle forskjell er at hver side har 2 spillere og at hull-grid-en
 * viser lag-best netto med contributor-initialer.
 *
 * Layout:
 *  1. Duellkort (`MatchplayDuelCard`) — versus-header med hull vunnet per lag
 *     i side-farger, dragkamp-bar, momentum-strip og dom («Lag 1 vant 3&2» /
 *     «Lag 2 leder 2 up etter 13 hull» / «AS»). Konfetti ved avgjort vinner.
 *  2. Per-hull-grid — Hull, Par, lag-best netto per side (med contributor-
 *     spillerens initialer som muted underline), Vinner, løpende Stilling.
 */
export function FourballMatchplayView({
  gameId,
  gameName,
  result,
  playerInfo,
  side1Label: side1LabelProp,
  side2Label: side2LabelProp,
  gameStatus: _gameStatus,
  backHref = '/',
}: FourballMatchplayViewProps): JSX.Element {
  const t = useTranslations('leaderboard');
  const tc = useTranslations('leaderboard.common');
  const side1Label = side1LabelProp ?? tc('teamLabel', { number: 1 });
  const side2Label = side2LabelProp ?? tc('teamLabel', { number: 2 });

  if (result.holes.length === 0) {
    return (
      <Shell>
        <Header gameName={gameName} backHref={backHref} />
        <Card className="mx-4 mt-12 px-5 py-6 text-center">
          <p className="font-serif text-[16px] font-medium text-text">
            {t('matchplay.matchCannotShow')}
          </p>
          <p className="mt-2 font-sans text-xs text-muted">
            {t('matchplay.teamDistribution')}
          </p>
        </Card>
      </Shell>
    );
  }

  const [side1, side2] = result.sides;
  const hasDecidedWinner =
    result.result !== null && result.result.winner !== 'tied';

  return (
    <Shell>
      <Header gameName={gameName} backHref={backHref} />

      <div className="px-6 pt-1.5 pb-2 text-center">
        <h1 className="font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          Fourball
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          {t('matchplay.subtitle2v2bestball')}
        </p>
      </div>

      {/* 1. Duellkort — versus, dragkamp, momentum-strip, dom */}
      <div
        data-testid="fourball-status-banner"
        className="relative isolate px-3.5 pt-3 pb-2"
      >
        <MatchplayDuelCard
          gameId={gameId}
          storagePrefix={STORAGE_PREFIX}
          testIdPrefix="fourball"
          sideA={{
            label: side1Label,
            sublines: side1.players.map((p) =>
              playerSubline(playerInfo[p.userId], p.effectiveHandicap, tc('unknownPlayerFull')),
            ),
          }}
          sideB={{
            label: side2Label,
            sublines: side2.players.map((p) =>
              playerSubline(playerInfo[p.userId], p.effectiveHandicap, tc('unknownPlayerFull')),
            ),
          }}
          holeResults={result.holes.map((h) => h.result)}
          holesUp={result.holesUp}
          holesPlayed={result.holesPlayed}
          matchResult={result.result}
        />
      </div>

      {/* 2. Per-hull-grid — viser lag-best netto per side + contributor-initialer */}
      <section className="px-3.5 pt-4 pb-2">
        <div className="px-2 pb-2 text-center">
          <Kicker tone="muted">{tc('perHullKicker')}</Kicker>
        </div>
        <HoleGrid
          holes={result.holes}
          side1Label={side1Label}
          side2Label={side2Label}
          playerInfo={playerInfo}
          t={t}
        />
      </section>

      <PullQuote className="px-6 pt-4 pb-4">
        {hasDecidedWinner ? tc('congratulations') : tc('goodLuck')}
      </PullQuote>
    </Shell>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function displayNameFor(info: FourballPlayerInfo | undefined, fallback: string): string {
  if (!info) return fallback;
  return formatRevealName(info.name, info.nickname);
}

function shortNameFor(info: FourballPlayerInfo | undefined): string {
  if (!info) return '?';
  const first = firstName(info.name);
  if (first) return first;
  return formatRevealName(info.name, info.nickname);
}

/** Sub-linje i duellkortets versus-panel: «{navn} · HCP {effektiv}». */
function playerSubline(
  info: FourballPlayerInfo | undefined,
  effectiveHandicap: number,
  fallback: string,
): string {
  return `${displayNameFor(info, fallback)} · HCP ${effectiveHandicap}`;
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <div className="relative isolate pb-12">
        <LeaderboardBackdrop />
        <div className="relative">{children}</div>
      </div>
    </AppShell>
  );
}

function Header({
  gameName,
  backHref,
}: {
  gameName: string;
  backHref: string;
}) {
  const tc = useTranslations('leaderboard.common');
  return (
    <header className="mb-2 flex items-center justify-between gap-4">
      <SmartLink
        href={backHref}
        aria-label={tc('backAriaLabel')}
        className="-ml-2 inline-flex h-11 w-11 items-center justify-center text-lg text-text"
      >
        ‹
      </SmartLink>
      <Kicker tone="accent">{gameName.toUpperCase()}</Kicker>
      <span className="w-11" aria-hidden />
    </header>
  );
}

function HoleGrid({
  holes,
  side1Label,
  side2Label,
  playerInfo,
  t,
}: {
  holes: FourballHoleRow[];
  side1Label: string;
  side2Label: string;
  playerInfo: Record<string, FourballPlayerInfo>;
  t: ReturnType<typeof useTranslations<'leaderboard'>>;
}): JSX.Element {
  // Kompakt: vis kun lag-label i header (forkortet). Per-rad contributor-
  // initialer underline gross-cellen.
  const side1Short = side1Label.length > 6 ? `L1` : side1Label;
  const side2Short = side2Label.length > 6 ? `L2` : side2Label;
  // Løpende stilling etter hvert hull (#546). Uspilte hull gir null («—»).
  const running = runningMatchStatus(holes.map((h) => h.result));
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <table
        data-testid="fourball-hole-grid"
        className="w-full border-collapse text-[12.5px]"
      >
        <thead>
          <tr className="border-b border-border bg-primary-soft/30">
            <th
              scope="col"
              className="px-2 py-2 text-left font-semibold uppercase tracking-[0.08em] text-[10px] text-muted"
            >
              {t('matchplay.colHull')}
            </th>
            <th
              scope="col"
              className="px-1 py-2 text-center font-semibold uppercase tracking-[0.08em] text-[10px] text-muted"
            >
              {t('matchplay.colPar')}
            </th>
            <th
              scope="col"
              className="px-1 py-2 text-center font-semibold uppercase tracking-[0.08em] text-[10px] text-muted truncate"
            >
              {side1Short}
            </th>
            <th
              scope="col"
              className="px-1 py-2 text-center font-semibold uppercase tracking-[0.08em] text-[10px] text-muted truncate"
            >
              {side2Short}
            </th>
            <th
              scope="col"
              className="px-2 py-2 text-center font-semibold uppercase tracking-[0.08em] text-[10px] text-muted"
            >
              {t('matchplay.colVinner')}
            </th>
            <th
              scope="col"
              className="px-2 py-2 text-center font-semibold uppercase tracking-[0.08em] text-[10px] text-muted"
            >
              {t('matchplay.colStilling')}
            </th>
          </tr>
        </thead>
        <tbody>
          {holes.map((hole, i) => (
            <HoleRow
              key={hole.holeNumber}
              hole={hole}
              runningStatus={running[i]}
              isLast={i === holes.length - 1}
              playerInfo={playerInfo}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HoleRow({
  hole,
  runningStatus,
  isLast,
  playerInfo,
}: {
  hole: FourballHoleRow;
  runningStatus: number | null;
  isLast: boolean;
  playerInfo: Record<string, FourballPlayerInfo>;
}): JSX.Element {
  const side1Won = hole.result === 'side1_wins';
  const side2Won = hole.result === 'side2_wins';
  const tied = hole.result === 'tied';
  const unplayed = hole.result === 'unplayed';
  const borderClass = isLast ? '' : 'border-b border-border';

  return (
    <tr
      data-testid={`fourball-hole-${hole.holeNumber}`}
      data-result={hole.result}
      className={borderClass}
    >
      <td className="px-2 py-2 text-left tabular-nums text-text font-medium">
        {hole.holeNumber}
      </td>
      <td className="px-1 py-2 text-center tabular-nums text-muted">
        {hole.par}
      </td>
      <td className="px-1 py-2 text-center">
        <SideCell
          bestNet={hole.side1BestNet}
          contributorIds={hole.side1ContributorIds}
          playerInfo={playerInfo}
          wonHole={side1Won}
        />
      </td>
      <td className="px-1 py-2 text-center">
        <SideCell
          bestNet={hole.side2BestNet}
          contributorIds={hole.side2ContributorIds}
          playerInfo={playerInfo}
          wonHole={side2Won}
        />
      </td>
      <td className="px-2 py-2 text-center tabular-nums">
        {unplayed && <span className="text-muted">—</span>}
        {tied && <span className="text-muted">=</span>}
        {side1Won && (
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-score-under-fg">
            L1
          </span>
        )}
        {side2Won && (
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-score-under-fg">
            L2
          </span>
        )}
      </td>
      <StatusCell runningStatus={runningStatus} />
    </tr>
  );
}

/**
 * Stilling-celle: løpende match-status etter hullet, farget mot lederens
 * side-farge (lag 1 = petrol, lag 2 = terracotta). «AS» muted ved likt,
 * «—» for uspilte hull.
 */
function StatusCell({
  runningStatus,
}: {
  runningStatus: number | null;
}): JSX.Element {
  if (runningStatus === null) {
    return (
      <td className="px-2 py-2 text-center tabular-nums text-muted">—</td>
    );
  }
  const colorClass =
    runningStatus > 0
      ? 'text-player-a'
      : runningStatus < 0
        ? 'text-player-b'
        : 'text-muted';
  return (
    <td
      className={`px-2 py-2 text-center tabular-nums text-[11.5px] font-semibold ${colorClass}`}
    >
      {runningStatusLabel(runningStatus)}
    </td>
  );
}

function SideCell({
  bestNet,
  contributorIds,
  playerInfo,
  wonHole,
}: {
  bestNet: number | null;
  contributorIds: string[];
  playerInfo: Record<string, FourballPlayerInfo>;
  wonHole: boolean;
}): JSX.Element {
  if (bestNet === null) {
    return <span className="text-muted">—</span>;
  }
  const grossClass = wonHole
    ? 'font-semibold text-score-under-fg'
    : 'text-text';
  const initials = contributorIds
    .map((id) => shortNameFor(playerInfo[id]).charAt(0))
    .join('');
  return (
    <span className="inline-flex flex-col items-center leading-tight">
      <span className={`tabular-nums ${grossClass}`}>{bestNet}</span>
      {initials && (
        <span className="text-[9.5px] uppercase tracking-[0.06em] text-muted">
          {initials}
        </span>
      )}
    </span>
  );
}
