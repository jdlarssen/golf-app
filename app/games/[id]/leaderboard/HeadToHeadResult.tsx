'use client';

import { useEffect, useState, type JSX } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';
import { AppShell } from '@/components/ui/AppShell';
import { Kicker } from '@/components/ui/Kicker';
import { LeaderboardBackdrop } from '@/components/illustrations/LeaderboardBackdrop';
import { formatRevealName } from '@/lib/names/formatRevealName';
import { ConfettiBurst } from './ConfettiBurst';

// Distinkt sessionStorage-prefiks så duell-konfettien ikke kolliderer med
// podium-konfettien (skins/wolf/nassau-podiene har egne nøkler).
const STORAGE_PREFIX = 'torny-h2h-confetti-seen-';

/** Ett momentum-felt per hull: hvem vant/ledet hullet head-to-head. */
export type StripCell = 'a' | 'b' | 'halved' | 'unplayed';

export interface HeadToHeadSide {
  userId: string;
  name: string;
  nickname: string | null;
  /** Format-metrikken (skins/poeng/units) — vinner = høyest. */
  score: number;
  /** Valgfri sekundær-stat under tallet, f.eks. «5 hull vunnet». */
  subLabel?: string;
}

export interface HeadToHeadResultProps {
  /** Spill-id — sessionStorage-nøkkel + back-lenke. */
  gameId: string;
  /** Turneringsnavn — vises som kicker i header. */
  gameName: string;
  /** Liten label over scoren, f.eks. «Skins · Netto». */
  formatLabel: string;
  /** Enhetsord under tallene, f.eks. «skins». */
  unitLabel: string;
  sideA: HeadToHeadSide;
  sideB: HeadToHeadSide;
  /**
   * Vinnerens userId, eller `null` ved uavgjort. Sendes inn fra caller fordi
   * vinneren kan avgjøres på en tiebreak scoren alene ikke fanger (Skins:
   * lik `totalSkins`, men flere `holesWon`). Når utelatt: avled fra scoren.
   */
  winnerUserId?: string | null;
  /** Ett element per hull i rekkefølge (momentum-strip). */
  strip: StripCell[];
  /** Valgfri linje om uvunne/hengende poeng (Skins: carriedPot). */
  hangingNote?: string | null;
  /** Hvor pilen tilbake skal peke. Defaults til spillets hjem. */
  backHref?: string;
}

/**
 * Head-to-head resultat-kort for 1-mot-1 solo-spill (epic #496). Erstatter
 * podiet ved nøyaktig 2 spillere — et podium er bygget for en folkemengde, en
 * duell fortjener et scoreboard. Tre elementer: versus-header, tug-of-war-bar
 * (scoren tegnet som forhold), og en momentum-strip (ett felt per hull, farget
 * per spiller). Gjenbrukbart skall — Skins er første konsument; andre solo-
 * format mater inn sin egen metrikk senere.
 */
export function HeadToHeadResult({
  gameId,
  gameName,
  formatLabel,
  unitLabel,
  sideA,
  sideB,
  winnerUserId,
  strip,
  hangingNote,
  backHref = '/',
}: HeadToHeadResultProps): JSX.Element {
  const [replayKey, setReplayKey] = useState(0);

  useEffect(() => {
    const key = `${STORAGE_PREFIX}${gameId}`;
    try {
      if (window.sessionStorage.getItem(key) === '1') return;
      window.sessionStorage.setItem(key, '1');
    } catch {
      // Storage utilgjengelig — fyr konfettien uansett.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReplayKey(1);
  }, [gameId]);

  // Vinner: bruk eksplisitt winnerUserId når den er gitt (fanger tiebreaks),
  // ellers avled fra scoren.
  const winner: 'a' | 'b' | 'tie' =
    winnerUserId === undefined
      ? sideA.score > sideB.score
        ? 'a'
        : sideB.score > sideA.score
          ? 'b'
          : 'tie'
      : winnerUserId === sideA.userId
        ? 'a'
        : winnerUserId === sideB.userId
          ? 'b'
          : 'tie';

  const total = sideA.score + sideB.score;
  const pctA = total === 0 ? 50 : Math.round((sideA.score / total) * 100);
  const pctB = 100 - pctA;

  const nameA = formatRevealName(sideA.name, sideA.nickname);
  const nameB = formatRevealName(sideB.name, sideB.nickname);

  const high = Math.max(sideA.score, sideB.score);
  const low = Math.min(sideA.score, sideB.score);
  const winnerName = winner === 'a' ? nameA : nameB;
  const verdict =
    winner === 'tie'
      ? `Uavgjort ${sideA.score}–${sideB.score}.`
      : sideA.score === sideB.score
        ? // Lik score, men avgjort på tiebreak (f.eks. flest vunne hull).
          `${winnerName} vant.`
        : `${winnerName} vant duellen ${high}–${low}.`;

  return (
    <AppShell>
      <div className="relative isolate pb-12">
        <LeaderboardBackdrop />
        <div className="relative">
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

          <div className="px-6 pt-1.5 pb-2 text-center">
            <Kicker tone="accent">DUELL</Kicker>
            <p className="mt-2 text-[11.5px] tabular-nums text-muted">
              {formatLabel}
            </p>
          </div>

          <div
            data-testid="head-to-head"
            className="relative isolate mx-3.5 mt-1 rounded-2xl border border-border bg-surface px-4 pt-5 pb-4 shadow-[0_2px_14px_rgba(26,46,31,0.06)]"
          >
            {replayKey > 0 && <ConfettiBurst key={replayKey} />}

            {/* Versus-header */}
            <div className="grid grid-cols-2 gap-3">
              <SidePanel
                name={nameA}
                score={sideA.score}
                subLabel={sideA.subLabel}
                unitLabel={unitLabel}
                colorVar="--player-a"
                isWinner={winner === 'a'}
                align="left"
              />
              <SidePanel
                name={nameB}
                score={sideB.score}
                subLabel={sideB.subLabel}
                unitLabel={unitLabel}
                colorVar="--player-b"
                isWinner={winner === 'b'}
                align="right"
              />
            </div>

            {/* Tug-of-war: scoren tegnet som forhold mellom de to */}
            <div
              data-testid="h2h-bar"
              className="mt-4 flex h-3 w-full overflow-hidden rounded-full border border-border"
              role="img"
              aria-label={`${nameA} ${sideA.score} mot ${nameB} ${sideB.score}`}
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

            {/* Momentum-strip: ett felt per hull, farget per spiller */}
            <div
              data-testid="h2h-strip"
              className="mt-4 flex flex-wrap justify-center gap-1"
            >
              {strip.map((cell, i) => (
                <span
                  key={i}
                  className={`reveal-up h-2.5 w-2.5 rounded-[3px] ${cellClass(cell)}`}
                  style={{ animationDelay: `${40 + i * 18}ms` }}
                />
              ))}
            </div>

            {/* Tegnforklaring */}
            <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10.5px] text-muted">
              <LegendDot colorVar="--player-a" label={nameA} />
              <LegendDot colorVar="--player-b" label={nameB} />
              <LegendDot muted label="delt" />
            </div>

            {/* Dom */}
            <p
              data-testid="h2h-verdict"
              className="mt-4 text-center font-serif text-[15px] font-medium tracking-[-0.005em] text-text"
            >
              {verdict}
            </p>
            {hangingNote && (
              <p className="mt-1 text-center text-[12px] text-muted">
                {hangingNote}
              </p>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function cellClass(cell: StripCell): string {
  switch (cell) {
    case 'a':
      return 'bg-player-a';
    case 'b':
      return 'bg-player-b';
    case 'halved':
      return 'bg-muted/40';
    default:
      return 'border border-border bg-transparent';
  }
}

function SidePanel({
  name,
  score,
  subLabel,
  unitLabel,
  colorVar,
  isWinner,
  align,
}: {
  name: string;
  score: number;
  subLabel?: string;
  unitLabel: string;
  colorVar: string;
  isWinner: boolean;
  align: 'left' | 'right';
}) {
  const alignClass = align === 'left' ? 'items-start text-left' : 'items-end text-right';
  return (
    <div className={`flex flex-col gap-1 ${alignClass}`}>
      <span className="flex items-center gap-1.5">
        {isWinner && (
          <span aria-hidden className="text-[13px] text-accent">
            ★
          </span>
        )}
        <span className="font-serif text-[15px] font-medium leading-tight tracking-[-0.005em] text-text break-words">
          {name}
        </span>
      </span>
      <span
        className="score-num text-[40px] leading-none tracking-[-0.02em] tabular-nums"
        style={{ color: `var(${colorVar})` }}
      >
        {score}
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
        {unitLabel}
      </span>
      {subLabel && (
        <span className="text-[11px] tabular-nums text-muted">{subLabel}</span>
      )}
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
}) {
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
