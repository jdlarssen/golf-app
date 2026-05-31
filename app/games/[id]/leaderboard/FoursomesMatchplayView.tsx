'use client';

import { useEffect, useState, type JSX } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { Medallion } from '@/components/ui/Medallion';
import { LeaderboardBackdrop } from '@/components/illustrations/LeaderboardBackdrop';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type { GameStatus } from '@/lib/games/status';
import type {
  FoursomesMatchplayResult,
  FoursomesHoleRow,
} from '@/lib/scoring/modes/types';
import { ConfettiBurst } from './ConfettiBurst';

// Distinkt nøkkel-prefiks slik at konfetti i foursomes-podium ikke deler
// "seen"-state med fourball-matchplay-podium, singles-matchplay eller stableford.
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
}

/**
 * Match-view for foursomes-familien (foursomes_matchplay, greensome_matchplay,
 * chapman_matchplay, gruesome_matchplay — issue #291). Speiler
 * FourballMatchplayView tett, men tilpasset FoursomesMatchplayResult:
 *
 * Forskjeller fra fourball:
 * - Én ball per side (alternate shot / greensome / chapman / gruesome-valg),
 *   ikke best-of-2. Ingen contributor-initialer.
 * - side1Net/side2Net brukes direkte (ikke side1BestNet/side2BestNet).
 * - HCP vises som lag-nivå combinedCourseHandicap + effectiveExtraHandicap,
 *   ikke per-spiller effectiveHandicap.
 * - formatLabel-prop bestemmer format-navn i sub-tittelen.
 *
 * Layout:
 *  1. Status-banner — «{Side} leder X up» / «Lag 1 vant 3&2» / «AS»
 *  2. Lag-header — to lag-kort, hvert med 2 spillere + lag-HCP, side1 til
 *     venstre når den leder.
 *  3. Per-hull-grid — 5 kolonner: Hull, Par, Side 1 netto, Side 2 netto, Vinner.
 *  4. Match-meta — Spilt / Igjen / Status.
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
}: FoursomesMatchplayViewProps): JSX.Element {
  const [replayKey, setReplayKey] = useState(0);

  const hasDecidedWinner =
    result.result !== null && result.result.winner !== 'tied';

  useEffect(() => {
    if (!hasDecidedWinner) return;
    const key = `${STORAGE_PREFIX}${gameId}`;
    try {
      if (window.sessionStorage.getItem(key) === '1') return;
      window.sessionStorage.setItem(key, '1');
    } catch {
      // Fall through — fyr konfettien uansett om storage er utilgjengelig.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReplayKey(1);
  }, [gameId, hasDecidedWinner]);

  if (result.holes.length === 0) {
    return (
      <Shell>
        <Header gameName={gameName} backHref={backHref} />
        <Card className="mx-4 mt-12 px-5 py-6 text-center">
          <p className="font-serif text-[16px] font-medium text-text">
            Matchen kan ikke vises
          </p>
          <p className="mt-2 font-sans text-xs text-muted">
            Spillere er ikke korrekt fordelt på to lag med to spillere hver.
            Sjekk admin-flyten.
          </p>
        </Card>
      </Shell>
    );
  }

  const [side1, side2] = result.sides;

  return (
    <Shell>
      <Header gameName={gameName} backHref={backHref} />

      <div className="px-6 pt-1.5 pb-2 text-center">
        <h1 className="font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          {formatLabel}
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          2 mot 2 · Vekselslag
        </p>
      </div>

      {/* 1. Status-banner */}
      <div
        data-testid="foursomes-status-banner"
        className="relative isolate px-3.5 pt-3 pb-2"
      >
        {replayKey > 0 && <ConfettiBurst key={replayKey} />}
        <StatusBanner
          result={result}
          side1Label={side1Label}
          side2Label={side2Label}
        />
      </div>

      {/* 2. Lag-header — 2 lag, 2 spillere + lag-HCP */}
      <section
        data-testid="foursomes-sides"
        className="px-3.5 pt-2 pb-1 flex flex-col gap-2"
      >
        <SideRow
          sideNumber={1}
          label={side1Label}
          side={side1}
          playerInfo={playerInfo}
          isLeading={result.holesUp > 0}
        />
        <SideRow
          sideNumber={2}
          label={side2Label}
          side={side2}
          playerInfo={playerInfo}
          isLeading={result.holesUp < 0}
        />
      </section>

      {/* 3. Per-hull-grid — viser lag-netto per side */}
      <section className="px-3.5 pt-4 pb-2">
        <div className="px-2 pb-2 text-center">
          <Kicker tone="muted">PER HULL</Kicker>
        </div>
        <HoleGrid
          holes={result.holes}
          side1Label={side1Label}
          side2Label={side2Label}
        />
      </section>

      {/* 4. Match-meta */}
      <section
        data-testid="foursomes-meta"
        className="mx-4 mt-4 rounded-2xl border border-border bg-surface px-4 py-3"
      >
        <dl className="grid grid-cols-3 gap-2 text-center">
          <MetaCell label="Spilt" value={result.holesPlayed.toString()} />
          <MetaCell label="Igjen" value={result.holesRemaining.toString()} />
          <MetaCell label="Status" value={statusLabel(result.holesUp)} />
        </dl>
      </section>

      <PullQuote className="px-6 pt-4 pb-4">
        {hasDecidedWinner ? 'Gratulerer.' : 'Lykke til.'}
      </PullQuote>
    </Shell>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function displayNameFor(info: FoursomesPlayerInfo | undefined): string {
  if (!info) return '(ukjent spiller)';
  return formatRevealName(info.name, info.nickname);
}

function statusLabel(holesUp: number): string {
  if (holesUp === 0) return 'AS';
  return `${Math.abs(holesUp)} up`;
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
  return (
    <header className="mb-2 flex items-center justify-between gap-4">
      <SmartLink
        href={backHref}
        aria-label="Tilbake"
        className="-ml-2 inline-flex h-11 w-11 items-center justify-center text-lg text-text"
      >
        ‹
      </SmartLink>
      <Kicker tone="accent">{gameName.toUpperCase()}</Kicker>
      <span className="w-11" aria-hidden />
    </header>
  );
}

function StatusBanner({
  result,
  side1Label,
  side2Label,
}: {
  result: FoursomesMatchplayResult;
  side1Label: string;
  side2Label: string;
}): JSX.Element {
  if (result.result !== null) {
    const r = result.result;
    if (r.winner === 'tied') {
      return (
        <div
          data-testid="foursomes-banner-tied"
          className="reveal-up"
          style={{ animationDelay: '60ms' }}
        >
          <Card className="flex flex-col items-center gap-2 border-border bg-surface px-5 py-5 text-center">
            <Kicker tone="muted">UAVGJORT</Kicker>
            <p className="font-serif text-[22px] font-medium leading-tight tracking-[-0.01em] text-text">
              Matchen endte AS
            </p>
            <p className="text-[12px] text-muted">All square etter 18 hull</p>
          </Card>
        </div>
      );
    }
    const winnerLabel = r.winner === 'side1' ? side1Label : side2Label;
    return (
      <div
        data-testid="foursomes-banner-decided"
        className="reveal-up"
        style={{ animationDelay: '60ms' }}
      >
        <Card className="flex flex-col items-center gap-2 border-accent bg-accent/[0.08] px-5 py-5 text-center shadow-[0_2px_14px_rgba(201,169,97,0.18)]">
          <Medallion place={1} size={48} title={`${winnerLabel} vant`} />
          <Kicker tone="accent">VINNER</Kicker>
          <p className="font-serif text-[22px] font-medium leading-tight tracking-[-0.01em] text-text">
            {winnerLabel} vant {r.formatted}
          </p>
          <p className="text-[12px] text-muted tabular-nums">
            Avgjort på hull {r.decidedAtHole}
          </p>
        </Card>
      </div>
    );
  }

  // Live: matchen er ikke avgjort ennå.
  if (result.holesPlayed === 0) {
    return (
      <div
        data-testid="foursomes-banner-live"
        className="reveal-up"
        style={{ animationDelay: '60ms' }}
      >
        <Card className="flex flex-col items-center gap-2 border-border bg-surface px-5 py-5 text-center">
          <Kicker tone="muted">LIVE</Kicker>
          <p className="font-serif text-[20px] font-medium leading-tight tracking-[-0.01em] text-text">
            Matchen er ikke startet ennå
          </p>
          <p className="text-[12px] text-muted">
            Tabellen våkner når første hull er spilt.
          </p>
        </Card>
      </div>
    );
  }

  if (result.holesUp === 0) {
    return (
      <div
        data-testid="foursomes-banner-live"
        className="reveal-up"
        style={{ animationDelay: '60ms' }}
      >
        <Card className="flex flex-col items-center gap-2 border-border bg-surface px-5 py-5 text-center">
          <Kicker tone="muted">LIVE</Kicker>
          <p className="font-serif text-[22px] font-medium leading-tight tracking-[-0.01em] text-text tabular-nums">
            Alt likt etter {result.holesPlayed} hull
          </p>
          <p className="text-[12px] text-muted">Matchen står og vipper.</p>
        </Card>
      </div>
    );
  }

  const leaderLabel = result.holesUp > 0 ? side1Label : side2Label;
  const margin = Math.abs(result.holesUp);
  return (
    <div
      data-testid="foursomes-banner-live"
      className="reveal-up"
      style={{ animationDelay: '60ms' }}
    >
      <Card className="flex flex-col items-center gap-2 border-border bg-surface px-5 py-5 text-center">
        <Kicker tone="muted">LIVE</Kicker>
        <p className="font-serif text-[22px] font-medium leading-tight tracking-[-0.01em] text-text">
          {leaderLabel} leder <span className="tabular-nums">{margin} up</span>
        </p>
        <p className="text-[12px] text-muted tabular-nums">
          Etter {result.holesPlayed} hull
        </p>
      </Card>
    </div>
  );
}

function SideRow({
  sideNumber,
  label,
  side,
  playerInfo,
  isLeading,
}: {
  sideNumber: 1 | 2;
  label: string;
  side: FoursomesMatchplayResult['sides'][0];
  playerInfo: Record<string, FoursomesPlayerInfo>;
  isLeading: boolean;
}): JSX.Element {
  const cardClass = isLeading ? 'border-accent/60 bg-accent/[0.05]' : '';
  return (
    <div data-testid={`foursomes-side-${sideNumber}`}>
      <Card className={`flex items-center gap-3.5 px-4 py-3 ${cardClass}`}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface font-serif text-[14px] font-medium uppercase tracking-[0.05em] text-muted">
          L{sideNumber}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-serif text-[16px] font-medium tracking-[-0.005em] text-text truncate">
            {label}
          </p>
          <ul className="mt-0.5 flex flex-col gap-0.5 text-[11.5px] text-muted tabular-nums">
            {side.players.map((p) => (
              <li key={p.userId} className="flex items-center gap-1.5">
                <span className="truncate">{displayNameFor(playerInfo[p.userId])}</span>
              </li>
            ))}
          </ul>
          {/* Lag-nivå HCP: kombinert CH + eventuell extra-handicap */}
          <p className="mt-1 text-[11px] text-muted tabular-nums">
            Lag-HCP: {side.combinedCourseHandicap}
            {side.effectiveExtraHandicap > 0 && (
              <span className="ml-1 text-muted/80">
                (+{side.effectiveExtraHandicap} slag)
              </span>
            )}
          </p>
        </div>
      </Card>
    </div>
  );
}

function HoleGrid({
  holes,
  side1Label,
  side2Label,
}: {
  holes: FoursomesHoleRow[];
  side1Label: string;
  side2Label: string;
}): JSX.Element {
  // Kompakt: vis kun lag-label i header (forkortet).
  const side1Short = side1Label.length > 6 ? `L1` : side1Label;
  const side2Short = side2Label.length > 6 ? `L2` : side2Label;
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
              Hull
            </th>
            <th
              scope="col"
              className="px-1 py-2 text-center font-semibold uppercase tracking-[0.08em] text-[10px] text-muted"
            >
              Par
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
              Vinner
            </th>
          </tr>
        </thead>
        <tbody>
          {holes.map((hole, i) => (
            <HoleRow
              key={hole.holeNumber}
              hole={hole}
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
  isLast,
}: {
  hole: FoursomesHoleRow;
  isLast: boolean;
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
        <NetCell net={hole.side1Net} wonHole={side1Won} />
      </td>
      <td className="px-1 py-2 text-center">
        <NetCell net={hole.side2Net} wonHole={side2Won} />
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
    </tr>
  );
}

function NetCell({
  net,
  wonHole,
}: {
  net: number | null;
  wonHole: boolean;
}): JSX.Element {
  if (net === null) {
    return <span className="text-muted">—</span>;
  }
  const netClass = wonHole
    ? 'font-semibold text-score-under-fg tabular-nums'
    : 'text-text tabular-nums';
  return <span className={netClass}>{net}</span>;
}

function MetaCell({
  label,
  value,
}: {
  label: string;
  value: string;
}): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
        {label}
      </dt>
      <dd className="font-serif text-[18px] font-medium tabular-nums text-text">
        {value}
      </dd>
    </div>
  );
}
