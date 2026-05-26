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
import { firstName } from '@/lib/firstName';
import type { GameStatus } from '@/lib/games/status';
import type {
  FourballMatchplayResult,
  FourballHoleRow,
} from '@/lib/scoring/modes/types';
import { ConfettiBurst } from './ConfettiBurst';

// Distinkt nøkkel-prefiks slik at konfetti i fourball-podium ikke deler
// "seen"-state med singles-matchplay-podium eller stableford-podiene.
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
 * Match-view for fourball matchplay (issue #217). Hybrid av
 * `MatchplayMatchView` (status-banner, mat-em-feiring, konfetti) og
 * `TeamCard` (2+2-lag-gruppering). Speiler MatchplayMatchView tett for
 * konsistent UX mellom singles og fourball — eneste reelle forskjell er
 * at hver side har 2 spillere og at hull-grid-en har 6 kolonner.
 *
 * Layout:
 *  1. Status-banner — «{Side} leder X up» / «Lag 1 vant 3&2» / «AS»
 *  2. Lag-header — to lag-kort, hvert med 2 spillere + HCP, side1 til
 *     venstre når den leder.
 *  3. Per-hull-grid — 6 kolonner: Hull, Par, Side 1 best, Side 2 best, Vinner.
 *     Per side viser vi LAGSCORE (= lag-best netto) i hovedrad og
 *     contributor-spillerens initialer som muted underline.
 *  4. Match-meta — Spilt / Igjen / Status.
 */
export function FourballMatchplayView({
  gameId,
  gameName,
  result,
  playerInfo,
  side1Label = 'Lag 1',
  side2Label = 'Lag 2',
  gameStatus: _gameStatus,
  backHref = '/',
}: FourballMatchplayViewProps): JSX.Element {
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
          Fourball
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          2 mot 2 · Lag-best per hull
        </p>
      </div>

      {/* 1. Status-banner */}
      <div
        data-testid="fourball-status-banner"
        className="relative isolate px-3.5 pt-3 pb-2"
      >
        {replayKey > 0 && <ConfettiBurst key={replayKey} />}
        <StatusBanner
          result={result}
          side1Label={side1Label}
          side2Label={side2Label}
        />
      </div>

      {/* 2. Lag-header — 2 lag, 2 spillere hver */}
      <section
        data-testid="fourball-sides"
        className="px-3.5 pt-2 pb-1 flex flex-col gap-2"
      >
        <SideRow
          sideNumber={1}
          label={side1Label}
          players={side1.players.map((p) => ({
            userId: p.userId,
            info: playerInfo[p.userId],
            effectiveHandicap: p.effectiveHandicap,
          }))}
          isLeading={result.holesUp > 0}
        />
        <SideRow
          sideNumber={2}
          label={side2Label}
          players={side2.players.map((p) => ({
            userId: p.userId,
            info: playerInfo[p.userId],
            effectiveHandicap: p.effectiveHandicap,
          }))}
          isLeading={result.holesUp < 0}
        />
      </section>

      {/* 3. Per-hull-grid — viser lag-best netto per side + contributor-initialer */}
      <section className="px-3.5 pt-4 pb-2">
        <div className="px-2 pb-2 text-center">
          <Kicker tone="muted">PER HULL</Kicker>
        </div>
        <HoleGrid
          holes={result.holes}
          side1Label={side1Label}
          side2Label={side2Label}
          playerInfo={playerInfo}
        />
      </section>

      {/* 4. Match-meta */}
      <section
        data-testid="fourball-meta"
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

function displayNameFor(info: FourballPlayerInfo | undefined): string {
  if (!info) return '(ukjent spiller)';
  return formatRevealName(info.name, info.nickname);
}

function shortNameFor(info: FourballPlayerInfo | undefined): string {
  if (!info) return '?';
  const first = firstName(info.name);
  if (first) return first;
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
  result: FourballMatchplayResult;
  side1Label: string;
  side2Label: string;
}): JSX.Element {
  if (result.result !== null) {
    const r = result.result;
    if (r.winner === 'tied') {
      return (
        <div
          data-testid="fourball-banner-tied"
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
        data-testid="fourball-banner-decided"
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
        data-testid="fourball-banner-live"
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
        data-testid="fourball-banner-live"
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
      data-testid="fourball-banner-live"
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
  players,
  isLeading,
}: {
  sideNumber: 1 | 2;
  label: string;
  players: {
    userId: string;
    info: FourballPlayerInfo | undefined;
    effectiveHandicap: number;
  }[];
  isLeading: boolean;
}): JSX.Element {
  const cardClass = isLeading ? 'border-accent/60 bg-accent/[0.05]' : '';
  return (
    <div data-testid={`fourball-side-${sideNumber}`}>
      <Card className={`flex items-center gap-3.5 px-4 py-3 ${cardClass}`}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface font-serif text-[14px] font-medium uppercase tracking-[0.05em] text-muted">
          L{sideNumber}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-serif text-[16px] font-medium tracking-[-0.005em] text-text truncate">
            {label}
          </p>
          <ul className="mt-0.5 flex flex-col gap-0.5 text-[11.5px] text-muted tabular-nums">
            {players.map((p) => (
              <li key={p.userId} className="flex items-center gap-1.5">
                <span className="truncate">{displayNameFor(p.info)}</span>
                <span className="text-muted/70">·</span>
                <span>HCP {p.effectiveHandicap}</span>
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </div>
  );
}

function HoleGrid({
  holes,
  side1Label,
  side2Label,
  playerInfo,
}: {
  holes: FourballHoleRow[];
  side1Label: string;
  side2Label: string;
  playerInfo: Record<string, FourballPlayerInfo>;
}): JSX.Element {
  // Kompakt: vis kun lag-label i header (forkortet). Per-rad contributor-
  // initialer underline gross-cellen.
  const side1Short = side1Label.length > 6 ? `L1` : side1Label;
  const side2Short = side2Label.length > 6 ? `L2` : side2Label;
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
  isLast,
  playerInfo,
}: {
  hole: FourballHoleRow;
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
    </tr>
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
