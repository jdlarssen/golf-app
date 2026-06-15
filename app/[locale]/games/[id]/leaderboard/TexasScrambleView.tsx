import type { JSX } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Medallion } from '@/components/ui/Medallion';
import { PullQuote } from '@/components/ui/PullQuote';
import { LeaderboardShell, LeaderboardHeader } from './LeaderboardChrome';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type { TexasScrambleResult } from '@/lib/scoring/modes/types';

/**
 * Spillerinfo for TexasScrambleView. En map fra userId → navn + kallenavn.
 * Caller (leaderboard-page) bygger map-en fra game_players-joinen og
 * sender den inn slik at view-en kan rendre menneske-lesbare navn der
 * scoring-laget kun har userId-er.
 */
export interface TexasScramblePlayerInfo {
  name: string;
  nickname: string | null;
}

export interface TexasScrambleViewProps {
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
   * Når true, dropper outer Shell + Header — caller eier ytre page-chrome.
   * Brukes (fremtidig) inne i LeaderboardTabs ved side-tournament-fane.
   */
  chromeless?: boolean;
  /** Antall hull fullført av den ledende spilleren (#638). Brukes i sub-tittel. */
  holesPlayed: number;
  /**
   * Format-navn som vises i sub-tittel. Default «Texas scramble». Settes av
   * caller basert på `game.game_mode` slik at Ambrose-spill viser «Ambrose»
   * i stedet for det hardkodede Texas-navnet.
   */
  formatLabel?: string;
}

/**
 * Live/post-finished leaderboard for Texas scramble — flat liste over lag,
 * sortert på `totalNet` (lavest øverst). Speilar `SoloStrokeplayView` visuelt:
 * fairway-backdrop, Fraunces-for-tall typografi-token, champagne-tint på
 * vinneren.
 *
 * Forskjeller fra solo strokeplay:
 *   - Én rad per lag (ikke per spiller)
 *   - Lag-navn = «Lag N» med medlemsnavn på sekundærlinjen
 *   - Sekundær-linje: medlemmer + brutto-total
 *   - Sub-tittel: «Texas scramble · Sortert på laveste lag-netto»
 *
 * Reveal-flow (separate podium-view) ligger i `TexasScramblePodium` — denne
 * view-en holder seg saklig så midt-runde-bruk leser som live-leaderboard og
 * ikke som seremoni. Status-router i `page.tsx` velger view per `game.status`.
 */
export function TexasScrambleView({
  gameId: _gameId,
  gameName,
  result,
  playersById,
  holesPlayed,
  backHref = '/',
  chromeless = false,
  formatLabel = 'Texas scramble',
}: TexasScrambleViewProps): JSX.Element {
  const t = useTranslations('leaderboard');

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

  // Sorter på rank — scoring-laget setter rank, men teams-arrayen kommer
  // sortert på teamNumber, ikke rank. Vi sorterer for å vise vinner-laget
  // øverst på leaderboarden.
  const sortedTeams = [...result.teams].sort((a, b) => a.rank - b.rank);

  return (
    <LeaderboardShell chromeless={chromeless}>
      {!chromeless && <LeaderboardHeader gameName={gameName} backHref={backHref} />}

      <div className="px-6 pt-1.5 pb-3.5 text-center">
        <h1 className="font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          {t('common.leaderboardHeading')}
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          {t('texasScramble.subtitle', { holes: holesPlayed, format: formatLabel })}
        </p>
      </div>

      <ul
        data-testid="texas-leaderboard"
        className="flex flex-col gap-2 px-3.5 pt-3 pb-3.5"
      >
        {sortedTeams.map((team, i) => {
          const memberNames = team.members
            .map((m) => {
              const info = playersById.get(m.userId);
              return info ? formatRevealName(info.name, info.nickname) : t('common.unknownPlayer');
            })
            .join(', ');
          return (
            <TeamRow
              key={team.teamNumber}
              rank={team.rank}
              teamNumber={team.teamNumber}
              memberNames={memberNames}
              totalNet={team.totalNet}
              totalGross={team.totalGross}
              missingHoles={team.missingHoles.length}
              staggerIndex={i}
            />
          );
        })}
      </ul>

      <PullQuote className="px-6 pt-1 pb-4">{t('common.goodLuck')}</PullQuote>
    </LeaderboardShell>
  );
}

function TeamRow({
  rank,
  teamNumber,
  memberNames,
  totalNet,
  totalGross,
  missingHoles,
  staggerIndex,
}: {
  rank: number;
  teamNumber: number;
  memberNames: string;
  totalNet: number;
  totalGross: number;
  missingHoles: number;
  staggerIndex: number;
}) {
  const t = useTranslations('leaderboard');
  const isPodium = rank >= 1 && rank <= 3;
  const cardClass =
    rank === 1
      ? 'border-accent bg-accent/[0.06] shadow-[0_2px_12px_rgba(201,169,97,0.15)]'
      : '';

  return (
    <li
      className="list-none reveal-up"
      style={{ animationDelay: `${60 + staggerIndex * 80}ms` }}
    >
      <Card className={`flex items-center gap-3.5 px-4 py-3.5 ${cardClass}`}>
        {isPodium ? (
          <span className="shrink-0">
            <Medallion place={rank as 1 | 2 | 3} size={36} />
          </span>
        ) : (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface font-serif text-[18px] font-medium text-muted">
            {rank}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="font-serif text-[17px] font-medium tracking-[-0.005em] text-text truncate">
            {t('common.teamLabel', { number: teamNumber })}
          </p>
          <p className="mt-0.5 text-[12px] text-muted truncate">
            {memberNames}
          </p>
          <p className="mt-0.5 text-[12px] text-muted tabular-nums">
            {t('common.grossBrutto', { count: totalGross })}
            {missingHoles > 0 && (
              <span className="ml-1 text-muted/80">
                · {t('common.missingHoles', { count: missingHoles })}
              </span>
            )}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <span className="score-num block text-[26px] leading-none tracking-[-0.02em] text-text tabular-nums">
            {totalNet}
          </span>
          <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            {t('common.slagLabel')}
          </span>
        </div>
      </Card>
    </li>
  );
}
