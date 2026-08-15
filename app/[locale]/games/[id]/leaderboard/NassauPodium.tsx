'use client';

import { useEffect, useState, type JSX } from 'react';
import { useTranslations } from 'next-intl';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { Medallion } from '@/components/ui/Medallion';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type { NassauResult, NassauUnitLine } from '@/lib/scoring/modes/types';
import { LeaderboardShell, LeaderboardHeader } from './LeaderboardChrome';
import {
  PLACE_TIER,
  SLOT_HEIGHTS_TALL,
  TIER_ACCENT,
  podiumPlace,
  type PodiumSlot,
} from './podiumPresentation';
import { ConfettiBurst } from './ConfettiBurst';
import type { NassauPlayerInfo } from './NassauView';
import { RowReactionsForPlayer } from './RowReactionsForPlayer';

// Distinkt sessionStorage-prefiks fra andre podium-er — inneholder ordet
// 'nassau' så vi ikke kolliderer med solo-stableford/solo-strokeplay/wolf.
const STORAGE_PREFIX = 'torny-nassau-podium-confetti-seen-';

// SWEEP_LABEL and SWEEP_SUBTITLE are now in the i18n catalog under
// leaderboard.nassau.sweepLabel / leaderboard.nassau.sweepSubtitle.
// Tests asserting on these strings use the Norwegian catalog values.

export interface NassauPodiumProps {
  /** Spill-id — brukes til sessionStorage-nøkkel + drilldown. */
  gameId: string;
  /** Turneringsnavn — vises som kicker i header. */
  gameName: string;
  /**
   * Resultat fra `lib/scoring/modes/nassau.compute()`.
   * Caller må narrowe på `kind === 'nassau'` før propen sendes inn.
   */
  result: NassauResult;
  /** Spillerinfo per userId for å rendre navn + kallenavn. */
  playersById: Map<string, NassauPlayerInfo>;
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
 * Finished-state view for Nassau — feirings-view ved
 * `game.status === 'finished'`. Speilar `SoloStrokeplayPodium` tett med
 * disse forskjellene:
 *   - Rangering er på `units` (0-3) med total18-effective-strokes som
 *     tiebreak — scoring-laget har allerede sortert `result.players`.
 *   - Hoved-tallet på hvert trinn er units (med max-of-3-indikator).
 *   - Per spiller: tre unit-badges (F9 / B9 / T18) som fylles inn når
 *     `unitBreakdown.front9/back9/total18` er true.
 *   - Sweep-celebration ved units === 3 hos vinneren («Hele tavla!»).
 *   - Distinkt sessionStorage-key: `torny-nassau-podium-confetti-seen-${gameId}`.
 *
 * Resten av rangeringen (rank 4+) ligger i et collapsed `<details>` under
 * podiet — skjules helt når det ikke finnes rader (≤3 spillere totalt).
 */
export function NassauPodium({
  gameId,
  gameName,
  result,
  playersById,
  backHref = '/',
  chromeless = false,
}: NassauPodiumProps): JSX.Element {
  const t = useTranslations('leaderboard');
  const tc = useTranslations('leaderboard.common');

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
          {tc('noPlayersToShow')}
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
  const tiedBadge = (player: NassauUnitLine): string | null =>
    player.tiedWith.length > 0 ? tc('tiedRank', { rank: player.rank }) : null;

  const sweeper = first.units === 3 ? first : null;

  return (
    <LeaderboardShell chromeless={chromeless}>
      {!chromeless && <LeaderboardHeader gameName={gameName} backHref={backHref} />}

      <div className="px-6 pt-1.5 pb-3.5 text-center">
        <Kicker tone="accent">{t('common.podiumKicker')}</Kicker>
        <h1 className="mt-2 font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          {tc('winnerAnnounced')}
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          Nassau · {result.scoring === 'net' ? tc('netto') : tc('brutto')}
        </p>
      </div>

      {sweeper && (
        <div
          data-testid="nassau-sweep"
          className="mx-4 mb-3 rounded-2xl border border-accent bg-accent/[0.08] px-4 py-3 text-center shadow-[0_2px_12px_rgba(201,169,97,0.18)]"
        >
          <p className="font-serif text-[18px] font-medium leading-tight text-accent-text">
            {t('nassau.sweepLabel')}
          </p>
          <p className="mt-1 text-[12px] tabular-nums text-muted">
            {playerLabel(sweeper.userId, playersById, tc('unknownPlayer'))} · {t('nassau.sweepSubtitle')}
          </p>
        </div>
      )}

      <div
        data-testid="nassau-podium"
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
                  t={t}
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
              t={t}
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
                  t={t}
                  tiedBadge={tiedBadge(third)}
                />
                <RowReactionsForPlayer targetUserId={third.userId} />
              </>
            )}
          </div>
        </div>
      </div>

      {rest.length > 0 && (
        <details
          data-testid="nassau-rest"
          className="mx-4 mt-4 rounded-2xl border border-border bg-surface px-4 py-3"
        >
          <summary className="cursor-pointer list-none font-serif text-[15px] font-medium tracking-[-0.005em] text-text marker:hidden">
            {tc('showFullRankingPlayers', { count: result.players.length })}
            <span aria-hidden className="ml-1 text-muted">
              ›
            </span>
          </summary>
          <ul className="mt-3 flex flex-col gap-2 list-none">
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
                      <UnitBadges
                        unitBreakdown={player.unitBreakdown}
                        size="sm"
                      />
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="score-num block text-[22px] leading-none tracking-[-0.02em] text-text tabular-nums">
                        {player.units}
                      </span>
                      <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                        {player.units === 1 ? t('nassau.seier') : t('nassau.seire')}
                      </span>
                    </div>
                  </div>
                  <RowReactionsForPlayer targetUserId={player.userId} />
                </li>
              );
            })}
          </ul>
        </details>
      )}

      <PullQuote className="px-6 pt-4 pb-4">{tc('congratulations')}</PullQuote>
    </LeaderboardShell>
  );
}

function playerLabel(
  userId: string,
  playersById: Map<string, NassauPlayerInfo>,
  fallback: string,
): string {
  const info = playersById.get(userId);
  return info ? formatRevealName(info.name, info.nickname) : fallback;
}


function PodiumStep({
  slot,
  player,
  playerInfo,
  staggerIndex,
  t,
  tiedBadge,
}: {
  /** Grid-posisjon: 1 = midten (høyest trinn), 2 = venstre, 3 = høyre. */
  slot: PodiumSlot;
  player: NassauUnitLine;
  playerInfo: NassauPlayerInfo | undefined;
  staggerIndex: number;
  t: ReturnType<typeof useTranslations<'leaderboard'>>;
  /** «Delt N. plass»-merke, eller null når spilleren ikke er delt-rangert. */
  tiedBadge: string | null;
}) {
  const displayName = playerInfo
    ? formatRevealName(playerInfo.name, playerInfo.nickname)
    : t('common.unknownPlayerFull');

  // Akse-splitt (#1573): layout (høyde, testid, stagger) følger slotten;
  // presentasjon (farge, medaljong, tall-styling) følger faktisk rank.
  const place = podiumPlace(player.rank);
  const tierClass = TIER_ACCENT[PLACE_TIER[place]];
  const heightClass = SLOT_HEIGHTS_TALL[slot];
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
          className={`text-center text-[9px] font-semibold uppercase tracking-[0.14em] ${
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
          {player.units}
        </span>
        <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.16em] text-muted">
          {player.units === 1 ? t('nassau.seier') : t('nassau.seire')}
        </span>
      </div>

      <UnitBadges unitBreakdown={player.unitBreakdown} size="md" />
    </div>
  );
}

/**
 * Tre små chips som viser hvilke seksjoner spilleren vant alene. Fylt
 * champagne-tint når vunnet, dempet muted-border når ikke. Visuell ekko
 * av Wolf-podiets Blind-strip, men på spiller-nivå istedenfor strip-nivå.
 */
function UnitBadges({
  unitBreakdown,
  size,
}: {
  unitBreakdown: { front9: boolean; back9: boolean; total18: boolean };
  size: 'sm' | 'md';
}) {
  const pxClass = size === 'sm' ? 'px-1.5 py-0.5 text-[9px]' : 'px-1.5 py-0.5 text-[10px]';
  const items: Array<{ key: 'front9' | 'back9' | 'total18'; label: string }> = [
    { key: 'front9', label: 'F9' },
    { key: 'back9', label: 'B9' },
    { key: 'total18', label: 'T18' },
  ];

  return (
    <div
      data-testid="nassau-unit-badges"
      className="mt-1 flex flex-wrap items-center justify-center gap-1"
    >
      {items.map((item) => {
        const won = unitBreakdown[item.key];
        return (
          <span
            key={item.key}
            data-testid={`unit-badge-${item.key}`}
            data-won={won ? 'true' : 'false'}
            className={`inline-flex items-center rounded-full font-semibold uppercase tracking-[0.12em] tabular-nums ${pxClass} ${
              won
                ? 'border border-accent bg-accent/[0.12] text-accent-text'
                : 'border border-border bg-surface text-muted/60'
            }`}
          >
            {item.label}
          </span>
        );
      })}
    </div>
  );
}
