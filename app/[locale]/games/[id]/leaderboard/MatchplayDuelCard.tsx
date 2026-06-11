'use client';

import { useEffect, useState, type JSX } from 'react';
import { Card } from '@/components/ui/Card';
import { Kicker } from '@/components/ui/Kicker';
import { ConfettiBurst } from './ConfettiBurst';
import type {
  MatchplayHoleResult,
  MatchplayMatchResult,
} from '@/lib/scoring/modes/types';

/**
 * Én side i duellkortet. `label` er spillernavn (singles) eller lagnavn
 * (fourball/foursomes); `sublines` er detaljer under navnet — HCP for
 * singles, spillernavn + lag-HCP for lagformatene.
 */
export interface DuelSide {
  label: string;
  sublines?: string[];
}

export interface MatchplayDuelCardProps {
  /** Spill-id — del av sessionStorage-nøkkelen for konfetti. */
  gameId: string;
  /**
   * Konfetti-nøkkel-prefiks. Hver konsument beholder sitt historiske prefiks
   * (`torny-matchplay-result-confetti-seen-` osv.) så "seen"-state ikke
   * nullstilles av redesignet.
   */
  storagePrefix: string;
  /**
   * Prefiks for data-testid-er (`matchplay` | `fourball` | `foursomes`) —
   * bevarer eksisterende test-kontrakter per view.
   */
  testIdPrefix: string;
  sideA: DuelSide;
  sideB: DuelSide;
  /** Per-hull-utfall i hull-rekkefølge — driver momentum-strip + hull vunnet. */
  holeResults: MatchplayHoleResult[];
  /** Løpende match-status fra scoring-laget (positiv = side 1 leder). */
  holesUp: number;
  holesPlayed: number;
  /** `null` mens matchen er live; satt når avgjort (mat-em eller 18 hull). */
  matchResult: MatchplayMatchResult | null;
}

/**
 * Duellkort for matchplay-familien (#546) — samme visuelle språk som
 * skins-duellens `HeadToHeadResult` (versus-header i spillerfarger,
 * dragkamp-bar, momentum-strip, tegnforklaring, dom), men matchplay-nativt:
 * store tall er hull vunnet, dommen snakker «3&2»/«2up»/«AS», og kortet
 * vises både live og ferdig (match-statusen ER live-historien, i motsetning
 * til skins-duellen som kun rendres for ferdige spill).
 *
 * Konfetti fyrer én gang per browser-sesjon når matchen er avgjort med
 * vinner (aldri ved AS eller live) — samme regler som de gamle bannerne.
 */
export function MatchplayDuelCard({
  gameId,
  storagePrefix,
  testIdPrefix,
  sideA,
  sideB,
  holeResults,
  holesUp,
  holesPlayed,
  matchResult,
}: MatchplayDuelCardProps): JSX.Element {
  const [replayKey, setReplayKey] = useState(0);

  const hasDecidedWinner =
    matchResult !== null && matchResult.winner !== 'tied';

  useEffect(() => {
    if (!hasDecidedWinner) return;
    const key = `${storagePrefix}${gameId}`;
    try {
      if (window.sessionStorage.getItem(key) === '1') return;
      window.sessionStorage.setItem(key, '1');
    } catch {
      // Fall through — fyr konfettien uansett om storage er utilgjengelig.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReplayKey(1);
  }, [gameId, storagePrefix, hasDecidedWinner]);

  const holesWonA = holeResults.filter((r) => r === 'side1_wins').length;
  const holesWonB = holeResults.filter((r) => r === 'side2_wins').length;

  // Dragkamp: andel av vunne hull. 0–0 tegnes 50/50.
  const total = holesWonA + holesWonB;
  const pctA = total === 0 ? 50 : Math.round((holesWonA / total) * 100);
  const pctB = 100 - pctA;

  const winner: 'a' | 'b' | null =
    matchResult === null || matchResult.winner === 'tied'
      ? null
      : matchResult.winner === 'side1'
        ? 'a'
        : 'b';

  return (
    <div className="reveal-up" style={{ animationDelay: '60ms' }}>
      <Card className="relative isolate px-4 pt-5 pb-4 shadow-[0_2px_14px_rgba(26,46,31,0.06)]">
        {replayKey > 0 && <ConfettiBurst key={replayKey} />}

        {/* Versus-header */}
        <div className="grid grid-cols-2 gap-3">
          <SidePanel
            testId={`${testIdPrefix}-side-1`}
            side={sideA}
            holesWon={holesWonA}
            colorVar="--player-a"
            isWinner={winner === 'a'}
            align="left"
          />
          <SidePanel
            testId={`${testIdPrefix}-side-2`}
            side={sideB}
            holesWon={holesWonB}
            colorVar="--player-b"
            isWinner={winner === 'b'}
            align="right"
          />
        </div>

        {/* Dragkamp: vunne hull tegnet som forhold mellom sidene */}
        <div
          data-testid={`${testIdPrefix}-duel-bar`}
          className="mt-4 flex h-3 w-full overflow-hidden rounded-full border border-border"
          role="img"
          aria-label={`${sideA.label} ${holesWonA} hull mot ${sideB.label} ${holesWonB} hull`}
        >
          <span
            className="h-full"
            style={{ width: `${pctA}%`, background: 'var(--player-a)' }}
          />
          <span
            className="h-full"
            style={{ width: `${pctB}%`, background: 'var(--player-b)' }}
          />
        </div>

        {/* Momentum-strip: ett felt per hull, farget per side */}
        <div
          data-testid={`${testIdPrefix}-duel-strip`}
          className="mt-4 flex flex-wrap justify-center gap-1"
        >
          {holeResults.map((result, i) => (
            <span
              key={i}
              className={`reveal-up h-2.5 w-2.5 rounded-[3px] ${stripCellClass(result)}`}
              style={{ animationDelay: `${40 + i * 18}ms` }}
            />
          ))}
        </div>

        {/* Tegnforklaring */}
        <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10.5px] text-muted">
          <LegendDot colorVar="--player-a" label={sideA.label} />
          <LegendDot colorVar="--player-b" label={sideB.label} />
          <LegendDot muted label="delt" />
        </div>

        {/* Dom */}
        <Verdict
          testIdPrefix={testIdPrefix}
          sideA={sideA}
          sideB={sideB}
          holesUp={holesUp}
          holesPlayed={holesPlayed}
          matchResult={matchResult}
        />
      </Card>
    </div>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function stripCellClass(result: MatchplayHoleResult): string {
  switch (result) {
    case 'side1_wins':
      return 'bg-player-a';
    case 'side2_wins':
      return 'bg-player-b';
    case 'tied':
      return 'bg-muted/40';
    default:
      return 'border border-border bg-transparent';
  }
}

function SidePanel({
  testId,
  side,
  holesWon,
  colorVar,
  isWinner,
  align,
}: {
  testId: string;
  side: DuelSide;
  holesWon: number;
  colorVar: string;
  isWinner: boolean;
  align: 'left' | 'right';
}): JSX.Element {
  const alignClass =
    align === 'left' ? 'items-start text-left' : 'items-end text-right';
  return (
    <div data-testid={testId} className={`flex flex-col gap-1 ${alignClass}`}>
      <span className="flex items-center gap-1.5">
        {isWinner && (
          <span aria-hidden className="text-[13px] text-accent">
            ★
          </span>
        )}
        <span className="font-serif text-[15px] font-medium leading-tight tracking-[-0.005em] text-text break-words">
          {side.label}
        </span>
      </span>
      <span
        className="score-num text-[40px] leading-none tracking-[-0.02em] tabular-nums"
        style={{ color: `var(${colorVar})` }}
      >
        {holesWon}
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
        hull vunnet
      </span>
      {side.sublines?.map((line, i) => (
        <span key={i} className="text-[11px] tabular-nums text-muted">
          {line}
        </span>
      ))}
    </div>
  );
}

function LegendDot({
  colorVar,
  muted,
  label,
}: {
  colorVar?: string;
  muted?: boolean;
  label: string;
}): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`h-2 w-2 rounded-[2px] ${muted ? 'bg-muted/40' : ''}`}
        style={colorVar ? { background: `var(${colorVar})` } : undefined}
      />
      <span className="truncate max-w-[8rem]">{label}</span>
    </span>
  );
}

/**
 * Dom-regionen nederst i kortet. Fem tilstander med samme copy som de gamle
 * status-bannerne (testid-ene `*-banner-decided`/`*-banner-tied`/`*-banner-live`
 * bevares så eksisterende test-kontrakter overlever):
 *
 *  - avgjort vinner: «{navn} vant {3&2|2up}» + «Avgjort på hull N»
 *  - uavgjort etter 18: «Matchen endte AS»
 *  - live, 0 hull: «Matchen er ikke startet ennå»
 *  - live, AS: «Alt likt etter N hull»
 *  - live, leder: «{navn} leder N up» + «Etter M hull»
 */
function Verdict({
  testIdPrefix,
  sideA,
  sideB,
  holesUp,
  holesPlayed,
  matchResult,
}: {
  testIdPrefix: string;
  sideA: DuelSide;
  sideB: DuelSide;
  holesUp: number;
  holesPlayed: number;
  matchResult: MatchplayMatchResult | null;
}): JSX.Element {
  if (matchResult !== null) {
    if (matchResult.winner === 'tied') {
      return (
        <div
          data-testid={`${testIdPrefix}-banner-tied`}
          className="mt-4 flex flex-col items-center gap-1 text-center"
        >
          <Kicker tone="muted">UAVGJORT</Kicker>
          <p className="font-serif text-[18px] font-medium leading-tight tracking-[-0.01em] text-text">
            Matchen endte AS
          </p>
          <p className="text-[12px] text-muted">All square etter 18 hull</p>
        </div>
      );
    }
    const winnerLabel =
      matchResult.winner === 'side1' ? sideA.label : sideB.label;
    return (
      <div
        data-testid={`${testIdPrefix}-banner-decided`}
        className="mt-4 flex flex-col items-center gap-1 text-center"
      >
        <Kicker tone="accent">VINNER</Kicker>
        <p className="font-serif text-[18px] font-medium leading-tight tracking-[-0.01em] text-text">
          {winnerLabel} vant {matchResult.formatted}
        </p>
        <p className="text-[12px] text-muted tabular-nums">
          Avgjort på hull {matchResult.decidedAtHole}
        </p>
      </div>
    );
  }

  if (holesPlayed === 0) {
    return (
      <div
        data-testid={`${testIdPrefix}-banner-live`}
        className="mt-4 flex flex-col items-center gap-1 text-center"
      >
        <Kicker tone="muted">LIVE</Kicker>
        <p className="font-serif text-[18px] font-medium leading-tight tracking-[-0.01em] text-text">
          Matchen er ikke startet ennå
        </p>
        <p className="text-[12px] text-muted">
          Tabellen våkner når første hull er spilt.
        </p>
      </div>
    );
  }

  if (holesUp === 0) {
    return (
      <div
        data-testid={`${testIdPrefix}-banner-live`}
        className="mt-4 flex flex-col items-center gap-1 text-center"
      >
        <Kicker tone="muted">LIVE</Kicker>
        <p className="font-serif text-[18px] font-medium leading-tight tracking-[-0.01em] text-text tabular-nums">
          Alt likt etter {holesPlayed} hull
        </p>
        <p className="text-[12px] text-muted">Matchen står og vipper.</p>
      </div>
    );
  }

  const leaderLabel = holesUp > 0 ? sideA.label : sideB.label;
  const margin = Math.abs(holesUp);
  return (
    <div
      data-testid={`${testIdPrefix}-banner-live`}
      className="mt-4 flex flex-col items-center gap-1 text-center"
    >
      <Kicker tone="muted">LIVE</Kicker>
      <p className="font-serif text-[18px] font-medium leading-tight tracking-[-0.01em] text-text">
        {leaderLabel} leder <span className="tabular-nums">{margin} up</span>
      </p>
      <p className="text-[12px] text-muted tabular-nums">
        Etter {holesPlayed} hull
      </p>
    </div>
  );
}
