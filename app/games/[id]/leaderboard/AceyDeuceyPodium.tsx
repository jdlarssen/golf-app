'use client';

import { useEffect, useState, type JSX } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';
import { AppShell } from '@/components/ui/AppShell';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { Medallion } from '@/components/ui/Medallion';
import { LeaderboardBackdrop } from '@/components/illustrations/LeaderboardBackdrop';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type { AceyDeuceyResult, AceyDeuceyPlayerLine } from '@/lib/scoring/modes/types';
import { ConfettiBurst } from './ConfettiBurst';
import type { AceyDeuceyPlayerInfo } from './AceyDeuceyView';

// Distinkt sessionStorage-prefiks fra andre podium-er.
const STORAGE_PREFIX = 'torny-acey-deucey-podium-confetti-seen-';

export interface AceyDeuceyPodiumProps {
  /** Spill-id — brukes til sessionStorage-nøkkel + drilldown. */
  gameId: string;
  /** Turneringsnavn — vises som kicker i header. */
  gameName: string;
  /**
   * Resultat fra `lib/scoring/modes/aceyDeucey.compute()`.
   * Caller må narrowe på `kind === 'acey_deucey'` før propen sendes inn.
   */
  result: AceyDeuceyResult;
  /** Spillerinfo per userId for å rendre navn + kallenavn. */
  playersById: Map<string, AceyDeuceyPlayerInfo>;
  /** Hvor pilen tilbake skal peke. Defaults til spillets hjem. */
  backHref?: string;
}

/** Formatterer et heltall med eksplisitt fortegn: +3, 0, −3 (ekte minustegn). */
function formatSigned(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`; // U+2212 MINUS SIGN
  return '0';
}

/**
 * Finished-state view for Acey Deucey — feirings-podium ved
 * `game.status === 'finished'`. Speiler BingoBangoBongoPodium tett med disse
 * forskjellene:
 *   - Hoved-tallet er `total` (poeng med fortegn, kan være negativt).
 *   - Sub-tittel: «Acey Deucey · Poeng».
 *   - Distinkt sessionStorage-key: `torny-acey-deucey-podium-confetti-seen-${gameId}`.
 */
export function AceyDeuceyPodium({
  gameId,
  gameName,
  result,
  playersById,
  backHref = '/',
}: AceyDeuceyPodiumProps): JSX.Element {
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

  if (result.players.length === 0) {
    return (
      <Shell>
        <Header gameName={gameName} backHref={backHref} />
        <p className="mt-12 text-center text-sm text-muted">
          Ingen spillere å vise.
        </p>
      </Shell>
    );
  }

  // result.players er allerede sortert på rank fra scoring-laget.
  const first = result.players[0];
  const second = result.players[1] ?? null;
  const third = result.players[2] ?? null;
  const rest = result.players.slice(3);

  return (
    <Shell>
      <Header gameName={gameName} backHref={backHref} />

      <div className="px-6 pt-1.5 pb-3.5 text-center">
        <Kicker tone="accent">PODIUM</Kicker>
        <h1 className="mt-2 font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          Vinner kåret
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          Acey Deucey · {result.scoring === 'net' ? 'Netto' : 'Brutto'}
        </p>
      </div>

      <div
        data-testid="acey-deucey-podium"
        className="relative isolate px-3.5 pt-3 pb-2"
      >
        {replayKey > 0 && <ConfettiBurst key={replayKey} />}

        <div className="grid grid-cols-3 items-end gap-2">
          <div className="col-start-1">
            {second && (
              <PodiumStep
                rank={2}
                player={second}
                playerInfo={playersById.get(second.userId)}
                tier="silver"
                staggerIndex={1}
              />
            )}
          </div>

          <div className="col-start-2">
            <PodiumStep
              rank={1}
              player={first}
              playerInfo={playersById.get(first.userId)}
              tier="champagne"
              staggerIndex={0}
            />
          </div>

          <div className="col-start-3">
            {third && (
              <PodiumStep
                rank={3}
                player={third}
                playerInfo={playersById.get(third.userId)}
                tier="bronze"
                staggerIndex={2}
              />
            )}
          </div>
        </div>
      </div>

      {rest.length > 0 && (
        <ul
          data-testid="acey-deucey-rest"
          className="mx-4 mt-4 flex flex-col gap-2 list-none"
        >
          {rest.map((player) => {
            const info = playersById.get(player.userId);
            const displayName = info
              ? formatRevealName(info.name, info.nickname)
              : '(ukjent spiller)';
            return (
              <li key={player.userId} className="list-none">
                <div className="flex items-center gap-3.5 rounded-2xl border border-border bg-surface px-4 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface font-serif text-[18px] font-medium text-muted">
                    {player.rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-serif text-[16px] font-medium tracking-[-0.005em] text-text truncate">
                      {displayName}
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted tabular-nums">
                      {player.aces} ace · {player.deuces} deuce
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="score-num block text-[22px] leading-none tracking-[-0.02em] text-text tabular-nums">
                      {formatSigned(player.total)}
                    </span>
                    <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                      poeng
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <PullQuote className="px-6 pt-4 pb-4">Gratulerer.</PullQuote>
    </Shell>
  );
}

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

type PodiumTier = 'champagne' | 'silver' | 'bronze';

const TIER_HEIGHTS: Record<PodiumTier, string> = {
  champagne: 'min-h-[180px]',
  silver: 'min-h-[150px]',
  bronze: 'min-h-[130px]',
};

const TIER_ACCENT: Record<PodiumTier, string> = {
  champagne:
    'border-accent bg-accent/[0.08] shadow-[0_2px_14px_rgba(201,169,97,0.18)]',
  silver: 'border-muted/40 bg-surface',
  bronze: 'border-warning/40 bg-surface',
};

function PodiumStep({
  rank,
  player,
  playerInfo,
  tier,
  staggerIndex,
}: {
  rank: 1 | 2 | 3;
  player: AceyDeuceyPlayerLine;
  playerInfo: AceyDeuceyPlayerInfo | undefined;
  tier: PodiumTier;
  staggerIndex: number;
}) {
  const displayName = playerInfo
    ? formatRevealName(playerInfo.name, playerInfo.nickname)
    : '(ukjent spiller)';

  const tierClass = TIER_ACCENT[tier];
  const heightClass = TIER_HEIGHTS[tier];
  const medallionSize = rank === 1 ? 48 : 36;

  return (
    <div
      data-testid={`podium-rank-${rank}`}
      className={`reveal-up flex flex-col items-center justify-end gap-2 rounded-2xl border ${tierClass} ${heightClass} px-2 py-3`}
      style={{ animationDelay: `${80 + staggerIndex * 90}ms` }}
    >
      <Medallion place={rank} size={medallionSize} />

      <p className="text-center font-serif text-[13px] font-medium leading-tight tracking-[-0.005em] text-text break-words">
        {displayName}
      </p>

      <div className="text-center">
        <span
          className={`score-num block leading-none tracking-[-0.02em] tabular-nums ${
            rank === 1
              ? 'text-[32px] text-accent'
              : rank === 2
                ? 'text-[24px] text-text'
                : 'text-[22px] text-text'
          }`}
        >
          {formatSigned(player.total)}
        </span>
        <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.16em] text-muted">
          poeng
        </span>
      </div>

      <p className="text-[10px] tabular-nums text-muted">
        {player.aces} ace · {player.deuces} deuce
      </p>
    </div>
  );
}
