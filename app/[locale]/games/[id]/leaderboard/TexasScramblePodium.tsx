'use client';

import { useEffect, useState, type JSX } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { Medallion } from '@/components/ui/Medallion';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type {
  TexasScrambleResult,
  TexasScrambleTeamLine,
} from '@/lib/scoring/modes/types';
import { LeaderboardShell, LeaderboardHeader } from './LeaderboardChrome';
import { ConfettiBurst } from './ConfettiBurst';
import type { TexasScramblePlayerInfo } from './TexasScrambleView';

// Distinkt sessionStorage-prefix fra andre podium-er — verifiseres via
// dedikert test slik at konfetti ikke trigges på feil mode.
const STORAGE_PREFIX = 'torny-texas-scramble-podium-confetti-seen-';

export interface TexasScramblePodiumProps {
  gameId: string;
  gameName: string;
  /**
   * Resultat fra `lib/scoring/modes/texasScramble.compute()`.
   * Caller må narrowe på `kind === 'texas_scramble'` før propen sendes inn.
   */
  result: TexasScrambleResult;
  /** Spillerinfo per userId for å rendre lag-medlemmenes navn. */
  playersById: Map<string, TexasScramblePlayerInfo>;
  backHref?: string;
  /**
   * Format-navn som vises i sub-tittel under podiet. Default «Texas scramble».
   * Settes av caller basert på `game.game_mode` slik at Ambrose-spill viser
   * «Ambrose» i stedet for det hardkodede Texas-navnet.
   */
  formatLabel?: string;
  /**
   * Når true, hoppes Shell + Header (back-pil + kicker) over slik at podiet
   * kan rendres inni `LeaderboardTabs`. Outer-callern eier `AppShell + TopBar`
   * og er ansvarlig for chrome. Speiler `SoloStablefordPodium`-mønsteret.
   */
  chromeless?: boolean;
}

/**
 * Finished-state view for Texas scramble — feirings-view ved
 * `game.status === 'finished'`. Speilar `SoloStrokeplayPodium` med disse
 * forskjellene:
 *   - Topp 3 LAG (ikke spillere) på podiet
 *   - Hoved-tallet er `totalNet` (laveste vinner)
 *   - Sub-tittel: «Texas scramble · Etter 18 hull»
 *   - Label «slag» under tallet
 *   - Lag-navnet «Lag N» med medlemsnavn under på podium-trinnet
 *   - Distinkt sessionStorage-key
 */
export function TexasScramblePodium({
  gameId,
  gameName,
  result,
  playersById,
  backHref = '/',
  formatLabel = 'Texas scramble',
  chromeless = false,
}: TexasScramblePodiumProps): JSX.Element {
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

  if (result.teams.length === 0) {
    return (
      <LeaderboardShell chromeless={chromeless}>
        {!chromeless && <LeaderboardHeader gameName={gameName} backHref={backHref} />}
        <p className="mt-12 text-center text-sm text-muted">
          {t('common.noTeams')}
        </p>
      </LeaderboardShell>
    );
  }

  // teams-arrayen er sortert på teamNumber — sorter på rank her så
  // podium-trinnene rendres med vinneren i midten.
  const sortedTeams = [...result.teams].sort((a, b) => a.rank - b.rank);
  const first = sortedTeams[0];
  const second = sortedTeams[1] ?? null;
  const third = sortedTeams[2] ?? null;
  const rest = sortedTeams.slice(3);

  return (
    <LeaderboardShell chromeless={chromeless}>
      {!chromeless && <LeaderboardHeader gameName={gameName} backHref={backHref} />}

      <div className="px-6 pt-1.5 pb-3.5 text-center">
        <Kicker tone="accent">{t('common.podiumKicker')}</Kicker>
        <h1 className="mt-2 font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          {t('common.winnerTeamAnnounced2')}
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          {t('texasScramble.podiumSubtitle', { format: formatLabel })}
        </p>
      </div>

      <div
        data-testid="texas-podium"
        className="relative isolate px-3.5 pt-3 pb-2"
      >
        {replayKey > 0 && <ConfettiBurst key={replayKey} />}

        <div className="grid grid-cols-3 items-end gap-2">
          <div className="col-start-1">
            {second && (
              <PodiumStep
                rank={2}
                team={second}
                playersById={playersById}
                tier="silver"
                staggerIndex={1}
              />
            )}
          </div>

          <div className="col-start-2">
            <PodiumStep
              rank={1}
              team={first}
              playersById={playersById}
              tier="champagne"
              staggerIndex={0}
            />
          </div>

          <div className="col-start-3">
            {third && (
              <PodiumStep
                rank={3}
                team={third}
                playersById={playersById}
                tier="bronze"
                staggerIndex={2}
              />
            )}
          </div>
        </div>
      </div>

      {rest.length > 0 && (
        <details
          data-testid="texas-rest"
          className="mx-4 mt-4 rounded-2xl border border-border bg-surface px-4 py-3"
        >
          <summary className="cursor-pointer list-none font-serif text-[15px] font-medium tracking-[-0.005em] text-text marker:hidden">
            {t('common.showFullRankingTeams', { count: result.teams.length })}
            <span aria-hidden className="ml-1 text-muted">
              ›
            </span>
          </summary>
          <ul className="mt-3 flex flex-col gap-2 list-none">
            {rest.map((team) => {
              const memberNames = team.members
                .map((m) => {
                  const info = playersById.get(m.userId);
                  return info
                    ? formatRevealName(info.name, info.nickname)
                    : t('common.unknownPlayer');
                })
                .join(', ');
              return (
                <li key={team.teamNumber} className="list-none">
                  <Card className="flex items-center gap-3.5 px-4 py-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface font-serif text-[18px] font-medium text-muted">
                      {team.rank}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-serif text-[16px] font-medium tracking-[-0.005em] text-text truncate">
                        {t('common.teamLabel', { number: team.teamNumber })}
                      </p>
                      <p className="mt-0.5 text-[12px] text-muted truncate">
                        {memberNames}
                      </p>
                      <p className="mt-0.5 text-[12px] text-muted tabular-nums">
                        {t('common.grossBrutto', { count: team.totalGross })}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="score-num block text-[22px] leading-none tracking-[-0.02em] text-text tabular-nums">
                        {team.totalNet}
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
  champagne: 'min-h-[200px]',
  silver: 'min-h-[170px]',
  bronze: 'min-h-[150px]',
};

const TIER_ACCENT: Record<PodiumTier, string> = {
  champagne:
    'border-accent bg-accent/[0.08] shadow-[0_2px_14px_rgba(201,169,97,0.18)]',
  silver: 'border-muted/40 bg-surface',
  bronze: 'border-warning/40 bg-surface',
};

function PodiumStep({
  rank,
  team,
  playersById,
  tier,
  staggerIndex,
}: {
  rank: 1 | 2 | 3;
  team: TexasScrambleTeamLine;
  playersById: Map<string, TexasScramblePlayerInfo>;
  tier: PodiumTier;
  staggerIndex: number;
}) {
  const t = useTranslations('leaderboard');
  const memberNames = team.members
    .map((m) => {
      const info = playersById.get(m.userId);
      return info ? formatRevealName(info.name, info.nickname) : t('common.unknownPlayer');
    })
    .join(', ');

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

      <p className="text-center font-serif text-[14px] font-medium leading-tight tracking-[-0.005em] text-text">
        {t('common.teamLabel', { number: team.teamNumber })}
      </p>
      <p className="text-center text-[10.5px] leading-tight text-muted break-words">
        {memberNames}
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
          {team.totalNet}
        </span>
        <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.16em] text-muted">
          {t('common.slagLabel')}
        </span>
      </div>
    </div>
  );
}
