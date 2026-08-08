import type { JSX, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type { GameStatus } from '@/lib/games/status';
import {
  runningMatchStatus,
  runningStatusLabel,
} from '@/lib/scoring/modes/matchplayRunningStatus';
import type {
  FoursomesMatchplayResult,
  FoursomesHoleRow,
} from '@/lib/scoring/modes/types';
import {
  strokesReceived,
  type StrokesReceived,
} from '@/lib/scoring/strokesReceived';
import { LeaderboardShell, LeaderboardHeader } from './LeaderboardChrome';
import { MatchplayDuelCard } from './MatchplayDuelCard';

// Distinkt nøkkel-prefiks slik at konfetti i foursomes-duellen ikke deler
// "seen"-state med fourball-matchplay, singles-matchplay eller stableford.
const STORAGE_PREFIX = 'torny-foursomes-result-confetti-seen-';

/**
 * Spillerinfo for foursomes-view. Map fra userId → navn + kallenavn +
 * course-handicap. Strukturert som plain Record (samme mønster som
 * FourballMatchplayView og MatchplayMatchView).
 */
export interface FoursomesPlayerInfo {
  name: string;
  nickname: string | null;
  courseHandicap: number;
}

export interface FoursomesMatchplayViewProps {
  gameId: string;
  gameName: string;
  /**
   * Resultat fra foursomesMatchplay.compute() (eller greensome/chapman/gruesome
   * — alle returnerer kind:'foursomes_matchplay'). Inneholder begge siders 2
   * spillere, per-hull-rader med lag-gross og lag-netto per side, løpende
   * holesUp og result som er null mens matchen er live.
   */
  result: FoursomesMatchplayResult;
  /** Spillerinfo per userId. */
  playerInfo: Record<string, FoursomesPlayerInfo>;
  /**
   * Side-labels — defaults til «Lag 1» / «Lag 2». Cup-koblede foursomes-spill
   * kan sende tournament.team_1_name/team_2_name for å speile cup-lederboardet.
   */
  side1Label?: string;
  side2Label?: string;
  /**
   * Format-label for sub-tittel i view-en — «Foursomes», «Greensome»,
   * «Chapman» eller «Gruesome» (hentet fra MODE_LABELS[game.game_mode]).
   */
  formatLabel: string;
  /**
   * Game-status fra DB. Brukes ikke til logikk — view-en bestemmer
   * "feiring vs live" basert på result.result.
   */
  gameStatus: GameStatus;
  /** Hvor pilen tilbake skal peke. Defaults til spillets hjem. */
  backHref?: string;
  /**
   * Sideturnering-seksjon (#585) — ferdig node bygd server-side, rendret
   * kompakt under duell-resultatet. `undefined` når ikke `finished` + på.
   */
  sideTournamentSection?: ReactNode;
  /**
   * AI-rundereferat (#1008) — bygd server-side, rendret rett under duellkortet
   * og FØR sideturnerings-seksjonen. `undefined` når ikke `finished` eller
   * ingen report finnes.
   */
  roundReportSection?: ReactNode;
}

/**
 * Match-view for foursomes-familien (foursomes_matchplay, greensome_matchplay,
 * chapman_matchplay, gruesome_matchplay — issue #291, redesignet i #546).
 * Speiler MatchplayMatchView/FourballMatchplayView tett, men tilpasset
 * FoursomesMatchplayResult:
 *
 * Forskjeller fra fourball:
 * - Én ball per side (alternate shot / greensome / chapman / gruesome-valg),
 *   ikke best-of-2. Ingen contributor-initialer.
 * - side1Net/side2Net brukes direkte (ikke side1BestNet/side2BestNet).
 * - HCP vises som lag-nivå combinedCourseHandicap + effectiveExtraHandicap.
 * - formatLabel-prop bestemmer format-navn i sub-tittelen.
 *
 * Layout:
 *  1. Duellkort (`MatchplayDuelCard`) — versus-header med hull vunnet per lag,
 *     dragkamp-bar, momentum-strip og dom. Konfetti ved avgjort vinner.
 *  2. Per-hull-grid — Hull, Par, lag-netto per side, Vinner, løpende Stilling.
 */
export function FoursomesMatchplayView({
  gameId,
  gameName,
  result,
  playerInfo,
  side1Label = 'Lag 1',
  side2Label = 'Lag 2',
  formatLabel,
  gameStatus: _gameStatus,
  backHref = '/',
  sideTournamentSection,
  roundReportSection,
}: FoursomesMatchplayViewProps): JSX.Element {
  const t = useTranslations('leaderboard');
  const tc = useTranslations('leaderboard.common');

  if (result.holes.length === 0) {
    return (
      <LeaderboardShell>
        <LeaderboardHeader gameName={gameName} backHref={backHref} />
        <Card className="mx-4 mt-12 px-5 py-6 text-center">
          <p className="font-serif text-[16px] font-medium text-text">
            {t('matchplay.matchCannotShow')}
          </p>
          <p className="mt-2 font-sans text-xs text-muted">
            {t('matchplay.teamDistribution')}
          </p>
        </Card>
      </LeaderboardShell>
    );
  }

  const [side1, side2] = result.sides;
  const hasDecidedWinner =
    result.result !== null && result.result.winner !== 'tied';

  // #1545: slag laget faktisk mottar i DENNE matchen. Tidligere viste linja
  // 18-hulls-differansen («+5 slag») ved siden av en nihulls-tabell som bare
  // deler ut tre — de to som manglet var slag på hull laget aldri spilte.
  const side1Strokes = strokesReceived(
    result.holes.map((h) => ({ holeNumber: h.holeNumber, extra: h.side1Extra })),
  );
  const side2Strokes = strokesReceived(
    result.holes.map((h) => ({ holeNumber: h.holeNumber, extra: h.side2Extra })),
  );

  return (
    <LeaderboardShell>
      <LeaderboardHeader gameName={gameName} backHref={backHref} />

      <div className="px-6 pt-1.5 pb-2 text-center">
        <h1 className="font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          {formatLabel}
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          {t('matchplay.subtitle2v2alternate')}
        </p>
      </div>

      {/* 1. Duellkort — versus, dragkamp, momentum-strip, dom */}
      <div
        data-testid="foursomes-status-banner"
        className="relative isolate px-3.5 pt-3 pb-2"
      >
        <MatchplayDuelCard
          gameId={gameId}
          storagePrefix={STORAGE_PREFIX}
          testIdPrefix="foursomes"
          sideA={{
            label: side1Label,
            sublines: sideSublines(
              side1,
              side1Strokes,
              playerInfo,
              t,
              tc('unknownPlayerFull'),
            ),
          }}
          sideB={{
            label: side2Label,
            sublines: sideSublines(
              side2,
              side2Strokes,
              playerInfo,
              t,
              tc('unknownPlayerFull'),
            ),
          }}
          holeResults={result.holes.map((h) => h.result)}
          holesUp={result.holesUp}
          holesPlayed={result.holesPlayed}
          matchResult={result.result}
        />
      </div>

      {/* AI-rundereferat (#1008) — rett under duellkortet, kun på finished */}
      {roundReportSection}

      {/* Sideturnering (#585) — kompakt under duell-resultatet, kun når på */}
      {sideTournamentSection}

      {/* 2. Per-hull-grid — viser lag-netto per side */}
      <section className="px-3.5 pt-4 pb-2">
        <div className="px-2 pb-2 text-center">
          <Kicker tone="muted">{tc('perHullKicker')}</Kicker>
        </div>
        <HoleGrid
          holes={result.holes}
          side1Label={side1Label}
          side2Label={side2Label}
          t={t}
        />
      </section>

      <PullQuote className="px-6 pt-4 pb-4">
        {hasDecidedWinner ? tc('congratulations') : tc('goodLuck')}
      </PullQuote>
    </LeaderboardShell>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function displayNameFor(info: FoursomesPlayerInfo | undefined, fallback: string): string {
  if (!info) return fallback;
  return formatRevealName(info.name, info.nickname);
}

/**
 * Sub-linjer i duellkortets versus-panel: lagets to spillere + lag-handicap.
 *
 * #1545: får laget slag, navngir linja hvor mange og på hvilke hull — talt fra
 * hullradene i matchen, ikke fra 18-hulls-differansen. Da kan spilleren telle
 * etter i tabellen under og finne igjen nøyaktig de samme hullene.
 */
function sideSublines(
  side: FoursomesMatchplayResult['sides'][0],
  strokes: StrokesReceived,
  playerInfo: Record<string, FoursomesPlayerInfo>,
  t: ReturnType<typeof useTranslations<'leaderboard'>>,
  fallback: string,
): string[] {
  const hcpLine =
    strokes.count > 0
      ? t('matchplay.lagHCPStrokes', {
          hcp: side.combinedCourseHandicap,
          count: strokes.count,
          holes: strokes.holes.join(', '),
        })
      : t('matchplay.lagHCP', { hcp: side.combinedCourseHandicap });
  return [
    ...side.players.map((p) => displayNameFor(playerInfo[p.userId], fallback)),
    hcpLine,
  ];
}

function HoleGrid({
  holes,
  side1Label,
  side2Label,
  t,
}: {
  holes: FoursomesHoleRow[];
  side1Label: string;
  side2Label: string;
  t: ReturnType<typeof useTranslations<'leaderboard'>>;
}): JSX.Element {
  // Kompakt: vis kun lag-label i header (forkortet).
  const side1Short = side1Label.length > 6 ? `L1` : side1Label;
  const side2Short = side2Label.length > 6 ? `L2` : side2Label;
  // Løpende stilling etter hvert hull (#546). Uspilte hull gir null («—»).
  const running = runningMatchStatus(holes.map((h) => h.result));
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <table
        data-testid="foursomes-hole-grid"
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
            {/* #1545: kolonnen sa bare «L1»/«L2» og viste netto — spilleren
                sammenlignet med papirkortet og trodde appen regnet feil.
                Nå står brutto her, og under-labelen sier det. */}
            <SideColHeader label={side1Short} t={t} />
            <SideColHeader label={side2Short} t={t} />
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
              t={t}
            />
          ))}
        </tbody>
      </table>
      <p
        data-testid="foursomes-hole-grid-note"
        className="border-t border-border px-3 py-2 text-[10.5px] leading-snug text-muted"
      >
        {t('matchplay.tableNote')}
      </p>
    </div>
  );
}

/**
 * Side-kolonnens header: lag-label over en «brutto»-underlabel (#1545), slik
 * at det ikke er tvil om hvilket tall som står i kolonnen.
 */
function SideColHeader({
  label,
  t,
}: {
  label: string;
  t: ReturnType<typeof useTranslations<'leaderboard'>>;
}): JSX.Element {
  return (
    <th
      scope="col"
      className="px-1 py-2 text-center font-semibold uppercase tracking-[0.08em] text-[10px] text-muted"
    >
      <span className="block truncate">{label}</span>
      <span className="block text-[8.5px] font-normal normal-case tracking-normal opacity-80">
        {t('matchplay.colSubBrutto')}
      </span>
    </th>
  );
}

function HoleRow({
  hole,
  runningStatus,
  isLast,
  t,
}: {
  hole: FoursomesHoleRow;
  runningStatus: number | null;
  isLast: boolean;
  t: ReturnType<typeof useTranslations<'leaderboard'>>;
}): JSX.Element {
  const side1Won = hole.result === 'side1_wins';
  const side2Won = hole.result === 'side2_wins';
  const tied = hole.result === 'tied';
  const unplayed = hole.result === 'unplayed';
  const borderClass = isLast ? '' : 'border-b border-border';

  return (
    <tr
      data-testid={`foursomes-hole-${hole.holeNumber}`}
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
        <ScoreCell
          gross={hole.side1Gross}
          net={hole.side1Net}
          extra={hole.side1Extra}
          wonHole={side1Won}
          t={t}
        />
      </td>
      <td className="px-1 py-2 text-center">
        <ScoreCell
          gross={hole.side2Gross}
          net={hole.side2Net}
          extra={hole.side2Extra}
          wonHole={side2Won}
          t={t}
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

/**
 * Score-celle (#1545): lagets BRUTTO som hovedtall — det er tallet som står på
 * papirkortet — med prikk for slag på hullet og netto som lite tall under når
 * de to er forskjellige. Samme oppbygning som singel-tabellen, slik at de to
 * matchplay-tabellene i én cup ikke lenger viser ulike tall uten å si det.
 */
function ScoreCell({
  gross,
  net,
  extra,
  wonHole,
  t,
}: {
  gross: number | null;
  net: number | null;
  extra: number;
  wonHole: boolean;
  t: ReturnType<typeof useTranslations<'leaderboard'>>;
}): JSX.Element {
  if (gross === null) {
    return <span className="text-muted">—</span>;
  }
  const grossClass = wonHole
    ? 'font-semibold text-score-under-fg tabular-nums'
    : 'text-text tabular-nums';
  return (
    <span className="inline-flex flex-col items-center leading-tight">
      <span className={grossClass}>
        {gross}
        {extra > 0 && (
          <span
            aria-label={t('matchplay.strokeDotAria', { count: extra })}
            title={t('matchplay.strokeDotAria', { count: extra })}
            className="ml-0.5 align-super text-[10px] font-semibold leading-none text-text"
          >
            {'•'.repeat(extra)}
          </span>
        )}
      </span>
      {extra > 0 && net !== null && (
        <span className="text-[10px] tabular-nums text-muted">{net}</span>
      )}
    </span>
  );
}
