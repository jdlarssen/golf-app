'use client';

import { useEffect, useState, type JSX } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { Medallion } from '@/components/ui/Medallion';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type { SoloStrokeplayResult } from '@/lib/scoring/modes/types';
import { LeaderboardShell, LeaderboardHeader } from './LeaderboardChrome';
import { ConfettiBurst } from './ConfettiBurst';
import type { SoloStrokeplayPlayerInfo } from './SoloStrokeplayView';

// Distinkt sessionStorage-prefix fra solo-stableford-podiet — verifisert via
// dedikert test. Holdt som modul-konstant slik at test-en kan importere den
// implisitt via streng-matching uten å lekke implementasjons-detalj.
const STORAGE_PREFIX = 'torny-solo-strokeplay-podium-confetti-seen-';

export interface SoloStrokeplayPodiumProps {
  /** Spill-id — brukes til drilldown/analytics + sessionStorage-nøkkel. */
  gameId: string;
  /** Turneringsnavn — vises som kicker i header. */
  gameName: string;
  /**
   * Resultat fra `lib/scoring/modes/soloStrokeplay.compute()`.
   * Caller må narrowe på `kind === 'solo_strokeplay'` før propen sendes inn.
   */
  result: SoloStrokeplayResult;
  /** Spillerinfo per userId for å rendre navn + kallenavn. */
  playersById: Map<string, SoloStrokeplayPlayerInfo>;
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
 * Finished-state view for solo strokeplay — feirings-view ved
 * `game.status === 'finished'`. Speilar `SoloStablefordPodium` 1:1 med
 * disse forskjellene:
 *   - Rangering er allerede lavest-først i `result.players`-arrayet
 *     (compute() returnerer rank-sortert), så podium-trinnene blir naturlig
 *     riktige uten ekstra sortering.
 *   - Hoved-tallet er `totalNetStrokes` (slag, ikke poeng).
 *   - Label «slag» under tallet.
 *   - Sub-tittel: «Slagspill · Etter 18 hull».
 *   - Distinkt sessionStorage-key: `torny-solo-strokeplay-podium-confetti-seen-${gameId}`.
 *
 * Three coordinated visual moves, parallelt til SoloStablefordPodium:
 *   1. Champagne-tiered hierarchy — 1. plass i midten på et høyere trinn,
 *      2. til venstre, 3. til høyre.
 *   2. One-shot confetti burst på 1.-plass, auto-fyrer på første mount per
 *      browser-sesjon.
 *   3. Staggered fade-up entry på podium-trinnene (reveal-up animation).
 *
 * Resten av rangeringen (rank 4+) ligger i et collapsed `<details>`-element
 * under podiet — default closed. Skjules helt når det ikke finnes rader
 * (≤3 spillere totalt).
 */
export function SoloStrokeplayPodium({
  gameId,
  gameName,
  result,
  playersById,
  backHref = '/',
  chromeless = false,
}: SoloStrokeplayPodiumProps): JSX.Element {
  const t = useTranslations('leaderboard');
  const [replayKey, setReplayKey] = useState(0);

  // Auto-fyr konfetti på første besøk per browser-sesjon. Wrapped i try/catch
  // siden sessionStorage kan kaste i private-browsing eller når brukeren har
  // site-data disabled. Samme mønster som SoloStablefordPodium.
  useEffect(() => {
    const key = `${STORAGE_PREFIX}${gameId}`;
    try {
      if (window.sessionStorage.getItem(key) === '1') return;
      window.sessionStorage.setItem(key, '1');
    } catch {
      // Fall through — fyr konfettien uansett om storage er utilgjengelig.
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

  // Podium-trinnene er rank 1, 2 og 3 — men kun hvis vi faktisk har så mange
  // spillere. result.players er allerede sortert med rank 1 først.
  const first = result.players[0];
  const second = result.players[1] ?? null;
  const third = result.players[2] ?? null;
  const rest = result.players.slice(3);

  return (
    <LeaderboardShell chromeless={chromeless}>
      {!chromeless && <LeaderboardHeader gameName={gameName} backHref={backHref} />}

      <div className="px-6 pt-1.5 pb-3.5 text-center">
        <Kicker tone="accent">{t('common.podiumKicker')}</Kicker>
        <h1 className="mt-2 font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          {t('common.winnerAnnounced')}
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          {t('soloStrokeplay.podiumSubtitle')}
        </p>
      </div>

      {/* Podium-container — relative + isolate slik at confetti-burst-en
          kan posisjoneres absolutt mot 1.-plass-cardet uten å lekke ut
          over resten av siden. */}
      <div
        data-testid="strokeplay-podium"
        className="relative isolate px-3.5 pt-3 pb-2"
      >
        {/* Confetti — kun på 1.-plass. Inline med podium-container slik at
            pieces faller "ned" over hele podiet (og over på 2/3 ved siden). */}
        {replayKey > 0 && <ConfettiBurst key={replayKey} />}

        {/* 3-kolonne layout: 2. plass venstre, 1. plass midten (høyere),
            3. plass høyre. Når vi ikke har 3 spillere lar vi tom slot stå
            (visuelt sentrert via centered grid). */}
        <div className="grid grid-cols-3 items-end gap-2">
          {/* 2. plass — venstre */}
          <div className="col-start-1">
            {second && (
              <PodiumStep
                rank={2}
                player={second}
                playerInfo={playersById.get(second.userId)}
                tier="silver"
                staggerIndex={1}
                slagLabel={t('common.slagLabel')}
                hullChip={t('common.hullChip', { count: second.holesPlayed })}
                unknownPlayerLabel={t('common.unknownPlayerFull')}
              />
            )}
          </div>

          {/* 1. plass — midten (høyeste trinn) */}
          <div className="col-start-2">
            <PodiumStep
              rank={1}
              player={first}
              playerInfo={playersById.get(first.userId)}
              tier="champagne"
              staggerIndex={0}
              slagLabel={t('common.slagLabel')}
              hullChip={t('common.hullChip', { count: first.holesPlayed })}
              unknownPlayerLabel={t('common.unknownPlayerFull')}
            />
          </div>

          {/* 3. plass — høyre */}
          <div className="col-start-3">
            {third && (
              <PodiumStep
                rank={3}
                player={third}
                playerInfo={playersById.get(third.userId)}
                tier="bronze"
                staggerIndex={2}
                slagLabel={t('common.slagLabel')}
                hullChip={t('common.hullChip', { count: third.holesPlayed })}
                unknownPlayerLabel={t('common.unknownPlayerFull')}
              />
            )}
          </div>
        </div>
      </div>

      {/* Resten av rangeringen — kun hvis det er noen 4+. Collapsed by default. */}
      {rest.length > 0 && (
        <details
          data-testid="strokeplay-rest"
          className="mx-4 mt-4 rounded-2xl border border-border bg-surface px-4 py-3"
        >
          <summary className="cursor-pointer list-none font-serif text-[15px] font-medium tracking-[-0.005em] text-text marker:hidden">
            {t('common.showFullRankingPlayers', { count: result.players.length })}
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
                  <Card className="flex items-center gap-3.5 px-4 py-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface font-serif text-[18px] font-medium text-muted">
                      {player.rank}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-serif text-[16px] font-medium tracking-[-0.005em] text-text truncate">
                        {displayName}
                      </p>
                      <p className="mt-0.5 text-[12px] text-muted tabular-nums">
                        {t('soloStrokeplay.grossHolesRow', {
                          gross: player.totalGrossStrokes,
                          holes: player.holesPlayed,
                        })}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="score-num block text-[22px] leading-none tracking-[-0.02em] text-text tabular-nums">
                        {player.totalNetStrokes}
                      </span>
                      <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                        {t('common.slagLabel')}
                      </span>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      <PullQuote className="px-6 pt-4 pb-4">{t('common.congratulations')}</PullQuote>
    </LeaderboardShell>
  );
}



type PodiumTier = 'champagne' | 'silver' | 'bronze';

const TIER_HEIGHTS: Record<PodiumTier, string> = {
  champagne: 'min-h-[180px]',
  silver: 'min-h-[150px]',
  bronze: 'min-h-[130px]',
};

const TIER_ACCENT: Record<PodiumTier, string> = {
  // Champagne: forest-tinted bg + champagne border + champagne tekst-accent.
  champagne:
    'border-accent bg-accent/[0.08] shadow-[0_2px_14px_rgba(201,169,97,0.18)]',
  // Silver: en hårfin dempet ring. Mer dempet enn champagne for å la 1.-plassen
  // dominere visuelt.
  silver: 'border-muted/40 bg-surface',
  // Bronse: varmere brun-tone via warning-tokenen.
  bronze: 'border-warning/40 bg-surface',
};

function PodiumStep({
  rank,
  player,
  playerInfo,
  tier,
  staggerIndex,
  slagLabel,
  hullChip,
  unknownPlayerLabel,
}: {
  rank: 1 | 2 | 3;
  player: { userId: string; totalNetStrokes: number; totalGrossStrokes: number; holesPlayed: number };
  playerInfo: SoloStrokeplayPlayerInfo | undefined;
  tier: PodiumTier;
  staggerIndex: number;
  slagLabel: string;
  hullChip: string;
  unknownPlayerLabel: string;
}) {
  const displayName = playerInfo
    ? formatRevealName(playerInfo.name, playerInfo.nickname)
    : unknownPlayerLabel;

  const tierClass = TIER_ACCENT[tier];
  const heightClass = TIER_HEIGHTS[tier];
  // Medallion-størrelse: 1.-plass får større for å forsterke hierarkiet.
  const medallionSize = rank === 1 ? 48 : 36;

  return (
    <div
      data-testid={`podium-rank-${rank}`}
      className={`reveal-up flex flex-col items-center justify-end gap-2 rounded-2xl border ${tierClass} ${heightClass} px-2 py-3`}
      style={{ animationDelay: `${80 + staggerIndex * 90}ms` }}
    >
      <Medallion place={rank} size={medallionSize} />

      {/* Navn — sentrert og tillates å brytes på 2 linjer. Bruker break-words
          for å unngå at lange navn bryter podium-layouten. */}
      <p className="text-center font-serif text-[13px] font-medium leading-tight tracking-[-0.005em] text-text break-words">
        {displayName}
      </p>

      {/* Netto-slag-total — hoved-tallet. */}
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
          {player.totalNetStrokes}
        </span>
        <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.16em] text-muted">
          {slagLabel}
        </span>
      </div>

      {/* «X hull»-chip — bare hull-count på podiet for å holde det
          lett-skannbart. Brutto-totalen finnes på rest-listen og i live-view. */}
      <p className="text-[10px] tabular-nums text-muted">
        {hullChip}
      </p>
    </div>
  );
}
