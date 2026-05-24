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
  SinglesMatchplayResult,
  MatchplayHoleRow,
  MatchplaySide,
} from '@/lib/scoring/modes/types';
import { ConfettiBurst } from './ConfettiBurst';

// Distinkt nøkkel-prefiks slik at konfetti i matchplay-podium ikke deler
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
 * for å vise HCP under spiller-navnet i sider-headeren.
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
}

/**
 * Match-view for singles matchplay (epic #45 Phase 3). Erstatter leaderboard-
 * grenene for `game_mode === 'singles_matchplay'`.
 *
 * Matchplay er fundamentalt ulikt poeng-baserte modi: ingen totaler å rangere
 * mot, men én løpende match-status og en per-hull-historie av W/L/T-utfall.
 * View-en speilet ikke 1:1 stableford-podiet (som er rangeringsfokusert) —
 * den kombinerer "live status" + "finished feiring" i én komponent siden
 * matchen er den samme historien som gradvis avgjøres.
 *
 * Tre seksjoner stablet vertikalt:
 *   1. **Status-banner** — løpende "X up etter Y hull" mens matchen er live,
 *      eller "{Vinner} vant {formatted}" når mat-em / spilt ferdig 18 hull.
 *      Avgjorte matcher (`result.result !== null`) får champagne-tinted card
 *      + Medallion. Tied-matcher får en saklig "AS"-card uten konfetti.
 *   2. **Sider-header** — to rader med "Side 1" / "Side 2"-kicker, navn (via
 *      formatRevealName) og course-handicap.
 *   3. **Per-hull-grid** — tabell med en rad per hull-rad i `result.holes`.
 *      Kolonner: Hull, Par, Side 1 (gross + Nnet), Side 2 (gross + Nnet),
 *      Vinner-indikator. Vant side får champagne-accent på sin gross-celle;
 *      tied = "=", uplayed = "—".
 *   4. **Match-meta** — kompakt rad "Spilt N · Igjen M · Status: X up".
 *
 * Konfetti fyrer en gang per browser-sesjon når matchen er avgjort med en
 * vinner. Sessionstorage-key er distinkt fra stableford-podiene.
 *
 * Hele view-en er client-only på grunn av konfetti-burst + sessionStorage.
 * Data fetches server-side og pasres som plain props.
 */
export function MatchplayMatchView({
  gameId,
  gameName,
  result,
  playerInfo,
  gameStatus: _gameStatus,
  backHref = '/',
}: MatchplayMatchViewProps): JSX.Element {
  const [replayKey, setReplayKey] = useState(0);

  // Konfetti kun ved avgjorte matcher med en vinner (ikke ved AS). Wrapped i
  // try/catch siden sessionStorage kan kaste i private-browsing.
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

  // Defensiv fallback: scoring-laget returnerer `holes.length === 0` når
  // matchen mangler nøyaktig to gyldige sider (validatoren i gamePayload.ts
  // håndhever 1+1, men draft-state eller halvferdig payload kan trigge dette).
  if (result.holes.length === 0) {
    return (
      <Shell>
        <Header gameName={gameName} backHref={backHref} />
        <Card className="mx-4 mt-12 px-5 py-6 text-center">
          <p className="font-serif text-[16px] font-medium text-text">
            Matchen kan ikke vises
          </p>
          <p className="mt-2 font-sans text-xs text-muted">
            Spillere er ikke korrekt fordelt på to sider. Sjekk admin-flyten
            og at hver side har én spiller.
          </p>
        </Card>
      </Shell>
    );
  }

  const [side1, side2] = result.sides;
  const side1Info = playerInfo[side1.userId];
  const side2Info = playerInfo[side2.userId];

  const side1Name = displayNameFor(side1Info);
  const side2Name = displayNameFor(side2Info);

  return (
    <Shell>
      <Header gameName={gameName} backHref={backHref} />

      <div className="px-6 pt-1.5 pb-2 text-center">
        <h1 className="font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          Matchplay
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          1 mot 1 · Hull-for-hull
        </p>
      </div>

      {/* 1. Status-banner */}
      <div
        data-testid="matchplay-status-banner"
        className="relative isolate px-3.5 pt-3 pb-2"
      >
        {replayKey > 0 && <ConfettiBurst key={replayKey} />}
        <StatusBanner
          result={result}
          side1Name={side1Name}
          side2Name={side2Name}
        />
      </div>

      {/* 2. Sider-header */}
      <section
        data-testid="matchplay-sides"
        className="px-3.5 pt-2 pb-1 flex flex-col gap-2"
      >
        <SideRow
          sideNumber={1}
          name={side1Name}
          courseHandicap={side1Info?.courseHandicap}
          isLeading={result.holesUp > 0}
        />
        <SideRow
          sideNumber={2}
          name={side2Name}
          courseHandicap={side2Info?.courseHandicap}
          isLeading={result.holesUp < 0}
        />
      </section>

      {/* 3. Per-hull-grid */}
      <section className="px-3.5 pt-4 pb-2">
        <div className="px-2 pb-2 text-center">
          <Kicker tone="muted">PER HULL</Kicker>
        </div>
        <HoleGrid
          holes={result.holes}
          side1ShortName={shortNameFor(side1Info)}
          side2ShortName={shortNameFor(side2Info)}
        />
      </section>

      {/* 4. Match-meta */}
      <section
        data-testid="matchplay-meta"
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

function displayNameFor(info: MatchplayPlayerInfo | undefined): string {
  if (!info) return '(ukjent spiller)';
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

/**
 * "X up etter Y hull"-tekst for live-status. 0 = "Alt likt"; positiv = side 1
 * leder; negativ = side 2 leder. Bruker `Math.abs` for å unngå "-N up"-tekst.
 */
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
  side1Name,
  side2Name,
}: {
  result: SinglesMatchplayResult;
  side1Name: string;
  side2Name: string;
}): JSX.Element {
  // Avgjort match (mat-em eller spilt 18 hull).
  if (result.result !== null) {
    const r = result.result;
    if (r.winner === 'tied') {
      return (
        <div
          data-testid="matchplay-banner-tied"
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
    const winnerName = r.winner === 'side1' ? side1Name : side2Name;
    const winnerSide = r.winner === 'side1' ? 1 : 2;
    return (
      <div
        data-testid="matchplay-banner-decided"
        className="reveal-up"
        style={{ animationDelay: '60ms' }}
      >
        <Card className="flex flex-col items-center gap-2 border-accent bg-accent/[0.08] px-5 py-5 text-center shadow-[0_2px_14px_rgba(201,169,97,0.18)]">
          <Medallion place={1} size={48} title={`${winnerName} vant`} />
          <Kicker tone="accent">VINNER</Kicker>
          <p className="font-serif text-[22px] font-medium leading-tight tracking-[-0.01em] text-text">
            {winnerName} vant {r.formatted}
          </p>
          <p className="text-[12px] text-muted tabular-nums">
            Side {winnerSide} · Avgjort på hull {r.decidedAtHole}
          </p>
        </Card>
      </div>
    );
  }

  // Live: matchen er ikke avgjort ennå.
  // Skille mellom "ikke startet" (0 hull spilt) og "live midt i runden".
  if (result.holesPlayed === 0) {
    return (
      <div
        data-testid="matchplay-banner-live"
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
        data-testid="matchplay-banner-live"
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

  const leaderName = result.holesUp > 0 ? side1Name : side2Name;
  const leadingSide = result.holesUp > 0 ? 1 : 2;
  const margin = Math.abs(result.holesUp);
  return (
    <div
      data-testid="matchplay-banner-live"
      className="reveal-up"
      style={{ animationDelay: '60ms' }}
    >
      <Card className="flex flex-col items-center gap-2 border-border bg-surface px-5 py-5 text-center">
        <Kicker tone="muted">LIVE</Kicker>
        <p className="font-serif text-[22px] font-medium leading-tight tracking-[-0.01em] text-text">
          {leaderName} leder{' '}
          <span className="tabular-nums">{margin} up</span>
        </p>
        <p className="text-[12px] text-muted tabular-nums">
          Side {leadingSide} · Etter {result.holesPlayed} hull
        </p>
      </Card>
    </div>
  );
}

function SideRow({
  sideNumber,
  name,
  courseHandicap,
  isLeading,
}: {
  sideNumber: 1 | 2;
  name: string;
  courseHandicap: number | undefined;
  isLeading: boolean;
}): JSX.Element {
  const cardClass = isLeading
    ? 'border-accent/60 bg-accent/[0.05]'
    : '';
  return (
    <div data-testid={`matchplay-side-${sideNumber}`}>
      <Card className={`flex items-center gap-3.5 px-4 py-3 ${cardClass}`}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface font-serif text-[14px] font-medium uppercase tracking-[0.05em] text-muted">
          S{sideNumber}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-serif text-[16px] font-medium tracking-[-0.005em] text-text truncate">
            {name}
          </p>
          <p className="mt-0.5 text-[11.5px] text-muted tabular-nums">
            Side {sideNumber}
            {courseHandicap !== undefined && ` · HCP ${courseHandicap}`}
          </p>
        </div>
      </Card>
    </div>
  );
}

function HoleGrid({
  holes,
  side1ShortName,
  side2ShortName,
}: {
  holes: MatchplayHoleRow[];
  side1ShortName: string;
  side2ShortName: string;
}): JSX.Element {
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
              Vinner
            </th>
          </tr>
        </thead>
        <tbody>
          {holes.map((hole, i) => (
            <HoleRow key={hole.holeNumber} hole={hole} isLast={i === holes.length - 1} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HoleRow({ hole, isLast }: { hole: MatchplayHoleRow; isLast: boolean }): JSX.Element {
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
    </tr>
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

function MetaCell({ label, value }: { label: string; value: string }): JSX.Element {
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
