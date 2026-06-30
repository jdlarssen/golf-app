import type { JSX, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Medallion } from '@/components/ui/Medallion';
import { PullQuote } from '@/components/ui/PullQuote';
import { LeaderboardShell, LeaderboardHeader } from './LeaderboardChrome';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type { StablefordSoloResult } from '@/lib/scoring/modes/types';
import { RowReactionsForPlayer } from './RowReactionsForPlayer';

/**
 * Spillerinfo for SoloStablefordView. En map fra userId → navn + kallenavn.
 * Caller (leaderboard-page) bygger map-en fra game_players-joinen.
 *
 * `teeGender` brukes av «Hull for hull» til å vise riktig par-chip
 * (parByGender[teeGender]) for dame-/junior-tee. #734.
 */
export interface SoloStablefordPlayerInfo {
  name: string;
  nickname: string | null;
  /** Spillerens tee-gender — brukes til å hente riktig par-verdi. #734. */
  teeGender?: 'mens' | 'ladies' | 'juniors';
}

export interface SoloStablefordViewProps {
  /** Spill-id — brukes til (fremtidig) drilldown og analytics. */
  gameId: string;
  /** Turneringsnavn — vises som kicker i header. */
  gameName: string;
  /**
   * Resultat fra `lib/scoring/modes/stableford.compute()` for solo-varianten.
   * Caller må narrowe på `variant === 'solo'` før propen sendes inn.
   */
  result: StablefordSoloResult;
  /** Spillerinfo per userId for å rendre navn + kallenavn. */
  playersById: Map<string, SoloStablefordPlayerInfo>;
  /** Antall hull fullført av den ledende spilleren (#638). Brukes i sub-tittel. */
  holesPlayed: number;
  /** Hvor pilen tilbake skal peke. Defaults til spillets hjem. */
  backHref?: string;
  /**
   * Når true, dropper outer Shell + Header — caller eier ytre page-chrome.
   * Brukes (fremtidig) inne i LeaderboardTabs ved side-tournament-fane.
   */
  chromeless?: boolean;
  /** Hale-seksjon rendret inni shell-en, etter hovedinnholdet (#386). */
  footerSlot?: ReactNode;
}

/**
 * State #4 for solo stableford — flat liste sortert på totalPoints (høyest
 * øverst). Speilar State4View visuelt: samme fairway-backdrop, samme
 * Fraunces-for-tall typografi-token, samme champagne-tinted Card-padding.
 * Forskjeller fra best-ball-state-#4:
 *   - ingen lag-gruppering, ingen «Mot par», ingen ModeChip
 *   - top-3 får Medallion (gull/sølv/bronse), 4+ får ren rank-disc
 *   - hver rad har «X hull spilt»-chip ved siden av poeng-totalen
 *
 * Reveal-flow (confetti + podium) er bevisst lagt til fase 6 — denne view-en
 * holder seg saklig så midt-runde-bruk leser som live-leaderboard ikke som
 * cermoni.
 */
export function SoloStablefordView({
  gameId: _gameId,
  gameName,
  result,
  playersById,
  holesPlayed,
  backHref = '/',
  chromeless = false,
  footerSlot,
}: SoloStablefordViewProps): JSX.Element {
  const t = useTranslations('leaderboard');

  const subtitle = t('soloStableford.subtitle', { holes: holesPlayed });

  if (result.players.length === 0) {
    return (
      <LeaderboardShell chromeless={chromeless} footerSlot={footerSlot}>
        {!chromeless && <LeaderboardHeader gameName={gameName} backHref={backHref} />}
        <p className="mt-12 text-center text-sm text-muted">
          {t('common.noPlayersToShow')}
        </p>
      </LeaderboardShell>
    );
  }

  return (
    <LeaderboardShell chromeless={chromeless} footerSlot={footerSlot}>
      {!chromeless && <LeaderboardHeader gameName={gameName} backHref={backHref} />}

      <div className="px-6 pt-1.5 pb-3.5 text-center">
        <h1 className="font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          {t('common.leaderboardHeading')}
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          {subtitle}
        </p>
      </div>

      <ul
        data-testid="stableford-leaderboard"
        className="flex flex-col gap-2 px-3.5 pt-3 pb-3.5"
      >
        {result.players.map((player, i) => {
          const info = playersById.get(player.userId);
          const displayName = info
            ? formatRevealName(info.name, info.nickname)
            : t('common.unknownPlayerFull');
          return (
            <PlayerRow
              key={player.userId}
              userId={player.userId}
              rank={player.rank}
              displayName={displayName}
              totalPoints={player.totalPoints}
              holesPlayed={player.holesPlayed}
              staggerIndex={i}
              holesPlayedLabel={t('common.holesPlayedCount', { count: player.holesPlayed })}
              poengLabel={t('common.poengLabel')}
            />
          );
        })}
      </ul>

      <PullQuote className="px-6 pt-1 pb-4">{t('common.goodLuck')}</PullQuote>
    </LeaderboardShell>
  );
}

function PlayerRow({
  userId,
  rank,
  displayName,
  totalPoints,
  staggerIndex,
  holesPlayedLabel,
  poengLabel,
}: {
  userId: string;
  rank: number;
  displayName: string;
  totalPoints: number;
  holesPlayed: number;
  staggerIndex: number;
  holesPlayedLabel: string;
  poengLabel: string;
}) {
  const isPodium = rank >= 1 && rank <= 3;
  // Champagne-tinted Card for vinneren, helt diskret accent for 2-3, og
  // helt nøytral for 4+. Mer subtilt enn State4View sin LeaderCard-hero
  // siden denne view-en brukes både midt-runde og post-finished.
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
            {displayName}
          </p>
          <p className="mt-0.5 text-[12px] text-muted tabular-nums">
            {holesPlayedLabel}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <span className="score-num block text-[26px] leading-none tracking-[-0.02em] text-text">
            {totalPoints}
          </span>
          <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            {poengLabel}
          </span>
        </div>
      </Card>
      <RowReactionsForPlayer targetUserId={userId} />
    </li>
  );
}
