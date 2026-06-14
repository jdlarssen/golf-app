import type { JSX, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { formatRevealName } from '@/lib/names/formatRevealName';
import { firstName } from '@/lib/firstName';
import type { GameStatus } from '@/lib/games/status';
import {
  runningMatchStatus,
  runningStatusLabel,
} from '@/lib/scoring/modes/matchplayRunningStatus';
import type {
  SinglesMatchplayResult,
  MatchplayHoleRow,
} from '@/lib/scoring/modes/types';
import { LeaderboardShell, LeaderboardHeader } from './LeaderboardChrome';
import { MatchplayDuelCard } from './MatchplayDuelCard';

// Distinkt nøkkel-prefiks slik at konfetti i matchplay-duellen ikke deler
// "seen"-state med stableford-podiene (`torny-stableford-podium-...` og
// `torny-par-stableford-podium-...`). Brukeren skal kunne se konfetti i
// matchplay selv om hen har sett stableford-podium for samme gameId først
// (samme gameId kan ikke krysse moduser i praksis, men nøkkel-isolasjon
// koster ingenting og holder fremtidige modus-mikser trygge).
const STORAGE_PREFIX = 'torny-matchplay-result-confetti-seen-';

/**
 * Spillerinfo for matchplay-view. Map fra userId → navn + kallenavn +
 * course-handicap. Caller (leaderboard-page) bygger map fra game_players-
 * joinen — samme felter som stableford-view-ene leser, pluss `courseHandicap`
 * for å vise HCP under spiller-navnet i duellkortet.
 */
export interface MatchplayPlayerInfo {
  name: string;
  nickname: string | null;
  courseHandicap: number;
}

export interface MatchplayMatchViewProps {
  /** Spill-id — brukes til drilldown/analytics + sessionStorage-nøkkel. */
  gameId: string;
  /** Turneringsnavn — vises som kicker i header. */
  gameName: string;
  /**
   * Resultat fra `lib/scoring/modes/singlesMatchplay.compute()`. Inneholder
   * begge siders meta, per-hull-rader, løpende `holesUp` og `result` som er
   * `null` mens matchen er live og fylles inn når matchen er avgjort.
   */
  result: SinglesMatchplayResult;
  /** Spillerinfo per userId. */
  playerInfo: Record<string, MatchplayPlayerInfo>;
  /**
   * Game-status fra DB. Brukes ikke til logikk — matchplay-view-en bestemmer
   * "feiring vs live" basert på `result.result` (mat-em uavhengig av admin-
   * trykk), men status-en holdes som dokumentasjon for fremtidige tweaks.
   */
  gameStatus: GameStatus;
  /** Hvor pilen tilbake skal peke. Defaults til spillets hjem. */
  backHref?: string;
  /**
   * Sideturnering-seksjon (#585) — bygd server-side av render-funksjonen og
   * sendt inn som ferdig node, rendret kompakt under duell-resultatet. Settes
   * kun når spillet er `finished` og har sideturnering på; `undefined` ellers
   * → view-en er byte-identisk med før.
   */
  sideTournamentSection?: ReactNode;
}

/**
 * Match-view for singles matchplay (epic #45 Phase 3, redesignet i #546).
 * Erstatter leaderboard-grenene for `game_mode === 'singles_matchplay'`.
 *
 * Matchplay er fundamentalt ulikt poeng-baserte modi: ingen totaler å rangere
 * mot, men én løpende match-status og en per-hull-historie av W/L/T-utfall.
 *
 * To seksjoner stablet vertikalt:
 *   1. **Duellkort** (`MatchplayDuelCard`) — samme visuelle språk som
 *      skins-duellen: versus-header med hull vunnet per side i side-farger,
 *      dragkamp-bar, momentum-strip og dom («{Vinner} vant 3&2» / «X leder
 *      2 up etter 13 hull» / «Matchen endte AS»). Konfetti ved avgjort vinner.
 *   2. **Per-hull-grid** — tabell med en rad per hull-rad i `result.holes`.
 *      Kolonner: Hull, Par, Side 1 (gross + Nnet), Side 2 (gross + Nnet),
 *      Vinner-indikator, og løpende Stilling (1up/2up/AS) etter hvert hull.
 *      Vant side får accent på sin gross-celle; tied = "=", uplayed = "—".
 *
 * Data fetches server-side og passes som plain props; konfetti/sessionStorage
 * er innkapslet i det client-side duellkortet.
 */
export function MatchplayMatchView({
  gameId,
  gameName,
  result,
  playerInfo,
  gameStatus: _gameStatus,
  backHref = '/',
  sideTournamentSection,
}: MatchplayMatchViewProps): JSX.Element {
  const t = useTranslations('leaderboard');
  const tc = useTranslations('leaderboard.common');

  // Defensiv fallback: scoring-laget returnerer `holes.length === 0` når
  // matchen mangler nøyaktig to gyldige sider (validatoren i gamePayload.ts
  // håndhever 1+1, men draft-state eller halvferdig payload kan trigge dette).
  if (result.holes.length === 0) {
    return (
      <LeaderboardShell>
        <LeaderboardHeader gameName={gameName} backHref={backHref} />
        <Card className="mx-4 mt-12 px-5 py-6 text-center">
          <p className="font-serif text-[16px] font-medium text-text">
            {t('matchplay.matchCannotShow')}
          </p>
          <p className="mt-2 font-sans text-xs text-muted">
            {t('matchplay.singlesDistribution')}
          </p>
        </Card>
      </LeaderboardShell>
    );
  }

  const [side1, side2] = result.sides;
  const side1Info = playerInfo[side1.userId];
  const side2Info = playerInfo[side2.userId];

  const side1Name = displayNameFor(side1Info, tc('unknownPlayerFull'));
  const side2Name = displayNameFor(side2Info, tc('unknownPlayerFull'));

  const hasDecidedWinner =
    result.result !== null && result.result.winner !== 'tied';

  return (
    <LeaderboardShell>
      <LeaderboardHeader gameName={gameName} backHref={backHref} />

      <div className="px-6 pt-1.5 pb-2 text-center">
        <h1 className="font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          Matchplay
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          {t('matchplay.subtitle1v1')}
        </p>
      </div>

      {/* 1. Duellkort — versus, dragkamp, momentum-strip, dom */}
      <div
        data-testid="matchplay-status-banner"
        className="relative isolate px-3.5 pt-3 pb-2"
      >
        <MatchplayDuelCard
          gameId={gameId}
          storagePrefix={STORAGE_PREFIX}
          testIdPrefix="matchplay"
          sideA={{
            label: side1Name,
            sublines:
              side1Info !== undefined
                ? [`HCP ${side1Info.courseHandicap}`]
                : undefined,
          }}
          sideB={{
            label: side2Name,
            sublines:
              side2Info !== undefined
                ? [`HCP ${side2Info.courseHandicap}`]
                : undefined,
          }}
          holeResults={result.holes.map((h) => h.result)}
          holesUp={result.holesUp}
          holesPlayed={result.holesPlayed}
          matchResult={result.result}
        />
      </div>

      {/* Sideturnering (#585) — kompakt under duell-resultatet, kun når på */}
      {sideTournamentSection}

      {/* 2. Per-hull-grid */}
      <section className="px-3.5 pt-4 pb-2">
        <div className="px-2 pb-2 text-center">
          <Kicker tone="muted">{tc('perHullKicker')}</Kicker>
        </div>
        <HoleGrid
          holes={result.holes}
          side1ShortName={shortNameFor(side1Info)}
          side2ShortName={shortNameFor(side2Info)}
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

function displayNameFor(info: MatchplayPlayerInfo | undefined, fallback: string): string {
  if (!info) return fallback;
  return formatRevealName(info.name, info.nickname);
}

/**
 * Kompakt navn for per-hull-tabellens kolonne-headere. Fornavn fra
 * `info.name` er førstevalg (passer i en smal tabell-kolonne); faller
 * tilbake til full formatRevealName om vi ikke kan parse fornavnet
 * (typisk hvis spilleren bare har et kallenavn registrert).
 */
function shortNameFor(info: MatchplayPlayerInfo | undefined): string {
  if (!info) return '?';
  const first = firstName(info.name);
  if (first) return first;
  return formatRevealName(info.name, info.nickname);
}



function HoleGrid({
  holes,
  side1ShortName,
  side2ShortName,
  t,
}: {
  holes: MatchplayHoleRow[];
  side1ShortName: string;
  side2ShortName: string;
  t: ReturnType<typeof useTranslations<'leaderboard'>>;
}): JSX.Element {
  // Løpende stilling etter hvert hull — «1up, 2up, 3up, 2up, 1up, AS»-
  // historien (#546). Uspilte hull gir null (vises som «—»).
  const running = runningMatchStatus(holes.map((h) => h.result));
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <table
        data-testid="matchplay-hole-grid"
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
              {side1ShortName}
            </th>
            <th
              scope="col"
              className="px-1 py-2 text-center font-semibold uppercase tracking-[0.08em] text-[10px] text-muted truncate"
            >
              {side2ShortName}
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
}: {
  hole: MatchplayHoleRow;
  runningStatus: number | null;
  isLast: boolean;
}): JSX.Element {
  const side1Won = hole.result === 'side1_wins';
  const side2Won = hole.result === 'side2_wins';
  const tied = hole.result === 'tied';
  const unplayed = hole.result === 'unplayed';

  const borderClass = isLast ? '' : 'border-b border-border';

  return (
    <tr
      data-testid={`matchplay-hole-${hole.holeNumber}`}
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
          netStrokes={hole.side1Net}
          extra={hole.side1Extra}
          wonHole={side1Won}
        />
      </td>
      <td className="px-1 py-2 text-center">
        <ScoreCell
          gross={hole.side2Gross}
          netStrokes={hole.side2Net}
          extra={hole.side2Extra}
          wonHole={side2Won}
        />
      </td>
      <td className="px-2 py-2 text-center tabular-nums">
        {unplayed && <span className="text-muted">—</span>}
        {tied && <span className="text-muted">=</span>}
        {side1Won && (
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-score-under-fg">
            S1
          </span>
        )}
        {side2Won && (
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-score-under-fg">
            S2
          </span>
        )}
      </td>
      <StatusCell runningStatus={runningStatus} />
    </tr>
  );
}

/**
 * Stilling-celle: løpende match-status etter hullet, farget mot lederens
 * side-farge (side 1 = petrol, side 2 = terracotta). «AS» muted ved likt,
 * «—» for uspilte hull (stillingen endres ikke av hull uten resultat).
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

function ScoreCell({
  gross,
  netStrokes,
  extra,
  wonHole,
}: {
  gross: number | null;
  netStrokes: number | null;
  extra: number;
  wonHole: boolean;
}): JSX.Element {
  if (gross === null) {
    return <span className="text-muted">—</span>;
  }
  const grossClass = wonHole
    ? 'font-semibold text-score-under-fg'
    : 'text-text';
  return (
    <span className="inline-flex flex-col items-center leading-tight">
      <span className={`tabular-nums ${grossClass}`}>{gross}</span>
      {extra > 0 && netStrokes !== null ? (
        <span className="text-[10px] tabular-nums text-muted">
          ({netStrokes}N)
        </span>
      ) : null}
    </span>
  );
}
