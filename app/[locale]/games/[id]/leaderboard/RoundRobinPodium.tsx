'use client';

import { useEffect, useState, type JSX } from 'react';
import { useTranslations } from 'next-intl';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { Medallion } from '@/components/ui/Medallion';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type { RoundRobinResult, RoundRobinPlayerLine } from '@/lib/scoring/modes/types';
import { LeaderboardShell, LeaderboardHeader } from './LeaderboardChrome';
import {
  PLACE_TIER,
  SLOT_HEIGHTS,
  TIER_ACCENT,
  podiumPlace,
  type PodiumSlot,
} from './podiumPresentation';
import { ConfettiBurst } from './ConfettiBurst';
import type { RoundRobinPlayerInfo } from './RoundRobinView';
import { RowReactionsForPlayer } from './RowReactionsForPlayer';

// Distinkt sessionStorage-prefiks fra andre podium-er.
const STORAGE_PREFIX = 'torny-round-robin-podium-confetti-seen-';

export interface RoundRobinPodiumProps {
  /** Spill-id — brukes til sessionStorage-nøkkel + drilldown. */
  gameId: string;
  /** Turneringsnavn — vises som kicker i header. */
  gameName: string;
  /**
   * Resultat fra `lib/scoring/modes/roundRobin.compute()`.
   * Caller må narrowe på `kind === 'round_robin'` før propen sendes inn.
   */
  result: RoundRobinResult;
  /** Spillerinfo per userId for å rendre navn + kallenavn. */
  playersById: Map<string, RoundRobinPlayerInfo>;
  /** Hvor pilen tilbake skal peke. Defaults til spillets hjem. */
  backHref?: string;
  /**
   * Når true, hoppes Shell + Header (back-pil + kicker) over slik at podiet
   * kan rendres inni `LeaderboardTabs`. Outer-callern eier `AppShell + TopBar`
   * og er ansvarlig for chrome. Speiler `SoloStablefordPodium`-mønsteret.
   */
  chromeless?: boolean;
}

/**
 * Finished-state view for Round Robin — feirings-podium ved
 * `game.status === 'finished'`. Speiler WolfPodium/BingoBangoBongoPodium med
 * disse forskjellene:
 *   - Hoved-tall: `totalHoleWins` (hull-seire, ikke slag/poeng).
 *   - Sub-tittel: «Round Robin · Hull-seire».
 *   - Topp 3 vises som podium-trinn + resten i flat liste under.
 *   - Distinkt sessionStorage-key.
 */
export function RoundRobinPodium({
  gameId,
  gameName,
  result,
  playersById,
  backHref = '/',
  chromeless = false,
}: RoundRobinPodiumProps): JSX.Element {
  const t = useTranslations('leaderboard');
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
      <LeaderboardShell chromeless={chromeless}>
        {!chromeless && <LeaderboardHeader gameName={gameName} backHref={backHref} />}
        <p className="mt-12 text-center text-sm text-muted">
          {t('common.noPlayersToShow')}
        </p>
      </LeaderboardShell>
    );
  }

  // Podium-slottene fylles i sortert rekkefølge (rank 1 først) — men
  // presentasjonen per trinn følger spillerens FAKTISKE rank (#1573).
  const first = result.players[0];
  const second = result.players[1] ?? null;
  const third = result.players[2] ?? null;
  const rest = result.players.slice(3);
  const tiedBadge = (player: RoundRobinPlayerLine): string | null =>
    player.tiedWith.length > 0
      ? t('common.tiedRank', { rank: player.rank })
      : null;

  return (
    <LeaderboardShell chromeless={chromeless}>
      {!chromeless && <LeaderboardHeader gameName={gameName} backHref={backHref} />}

      <div className="px-6 pt-1.5 pb-3.5 text-center">
        <Kicker tone="accent">{t('common.podiumKicker')}</Kicker>
        <h1 className="mt-2 font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          {t('common.winnerAnnounced')}
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          {t('roundRobin.podiumSubtitle')}
        </p>
      </div>

      <div
        data-testid="round-robin-podium"
        className="relative isolate px-3.5 pt-3 pb-2"
      >
        {replayKey > 0 && <ConfettiBurst key={replayKey} />}

        <div className="grid grid-cols-3 items-end gap-2">
          <div className="col-start-1">
            {second && (
              <>
                <PodiumStep
                  slot={2}
                  player={second}
                  playerInfo={playersById.get(second.userId)}
                  staggerIndex={1}
                  tiedBadge={tiedBadge(second)}
                />
                <RowReactionsForPlayer targetUserId={second.userId} />
              </>
            )}
          </div>

          <div className="col-start-2">
            <PodiumStep
              slot={1}
              player={first}
              playerInfo={playersById.get(first.userId)}
              staggerIndex={0}
              tiedBadge={tiedBadge(first)}
            />
            <RowReactionsForPlayer targetUserId={first.userId} />
          </div>

          <div className="col-start-3">
            {third && (
              <>
                <PodiumStep
                  slot={3}
                  player={third}
                  playerInfo={playersById.get(third.userId)}
                  staggerIndex={2}
                  tiedBadge={tiedBadge(third)}
                />
                <RowReactionsForPlayer targetUserId={third.userId} />
              </>
            )}
          </div>
        </div>
      </div>

      {rest.length > 0 && (
        <ul
          data-testid="round-robin-rest"
          className="mx-4 mt-4 flex flex-col gap-2 list-none"
        >
          {rest.map((player) => {
            const info = playersById.get(player.userId);
            const displayName = info
              ? formatRevealName(info.name, info.nickname)
              : t('common.unknownPlayerFull');
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
                      {t('roundRobin.hullSeireLabel', { count: player.totalHoleWins })}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="score-num block text-[22px] leading-none tracking-[-0.02em] text-text tabular-nums">
                      {player.totalHoleWins}
                    </span>
                    <span className="mt-0.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                      {t('roundRobin.hullLabel')}
                    </span>
                  </div>
                </div>
                <RowReactionsForPlayer targetUserId={player.userId} />
              </li>
            );
          })}
        </ul>
      )}

      <PullQuote className="px-6 pt-4 pb-4">{t('common.congratulations')}</PullQuote>
    </LeaderboardShell>
  );
}


function PodiumStep({
  slot,
  player,
  playerInfo,
  staggerIndex,
  tiedBadge,
}: {
  /** Grid-posisjon: 1 = midten (høyest trinn), 2 = venstre, 3 = høyre. */
  slot: PodiumSlot;
  player: RoundRobinPlayerLine;
  playerInfo: RoundRobinPlayerInfo | undefined;
  staggerIndex: number;
  /** «Delt N. plass»-merke, eller null når spilleren ikke er delt-rangert. */
  tiedBadge: string | null;
}) {
  const t = useTranslations('leaderboard');
  const displayName = playerInfo
    ? formatRevealName(playerInfo.name, playerInfo.nickname)
    : t('common.unknownPlayerFull');

  // Akse-splitt (#1573): layout (høyde, testid, stagger) følger slotten;
  // presentasjon (farge, medaljong, tall-styling) følger faktisk rank.
  const place = podiumPlace(player.rank);
  const tierClass = TIER_ACCENT[PLACE_TIER[place]];
  const heightClass = SLOT_HEIGHTS[slot];
  const medallionSize = place === 1 ? 48 : 36;

  return (
    <div
      data-testid={`podium-rank-${slot}`}
      data-rank={player.rank}
      className={`reveal-up flex flex-col items-center justify-end gap-2 rounded-2xl border ${tierClass} ${heightClass} px-2 py-3`}
      style={{ animationDelay: `${80 + staggerIndex * 90}ms` }}
    >
      <Medallion place={place} size={medallionSize} />

      {tiedBadge && (
        <p
          className={`text-center text-[11px] font-semibold uppercase tracking-[0.14em] ${
            place === 1 ? 'text-accent-text' : 'text-muted'
          }`}
        >
          {tiedBadge}
        </p>
      )}

      <p className="text-center font-serif text-[13px] font-medium leading-tight tracking-[-0.005em] text-text break-words">
        {displayName}
      </p>

      <div className="text-center">
        <span
          className={`score-num block leading-none tracking-[-0.02em] tabular-nums ${
            place === 1
              ? 'text-[32px] text-accent-text'
              : place === 2
                ? 'text-[24px] text-text'
                : 'text-[22px] text-text'
          }`}
        >
          {player.totalHoleWins}
        </span>
        <span className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
          {t('roundRobin.hullLabel')}
        </span>
      </div>

      <p className="text-[11px] tabular-nums text-muted">
        {t('roundRobin.tapetLabel', { count: player.totalHolesLost })}
      </p>
    </div>
  );
}
