import type { JSX } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Medallion } from '@/components/ui/Medallion';
import { PullQuote } from '@/components/ui/PullQuote';
import { LeaderboardShell, LeaderboardHeader } from './LeaderboardChrome';
import { LeaderboardFooter } from './LeaderboardFooter';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type { BingoBangoBongoResult } from '@/lib/scoring/modes/types';

/**
 * Spillerinfo for BingoBangoBongoView. En map fra userId → navn + kallenavn.
 * Caller (leaderboard-page) bygger map-en fra game_players-joinen og
 * sender den inn slik at view-en kan rendre menneske-lesbare navn.
 */
export interface BingoBangoBongoPlayerInfo {
  name: string;
  nickname: string | null;
}

export interface BingoBangoBongoViewProps {
  /** Spill-id — brukes til (fremtidig) drilldown og analytics. */
  gameId: string;
  /** Turneringsnavn — vises som kicker i header. */
  gameName: string;
  /**
   * Resultat fra `lib/scoring/modes/bingoBangoBongo.compute()`.
   * Caller må narrowe på `kind === 'bingo_bango_bongo'` før propen sendes inn.
   */
  result: BingoBangoBongoResult;
  /** Spillerinfo per userId for å rendre navn + kallenavn. */
  playersById: Map<string, BingoBangoBongoPlayerInfo>;
  /**
   * Score-visibility-flagget fra `games.score_visibility`. Når `'reveal'`
   * og spillet ikke er ferdig, skjuler vi totaler — kun en venterom-melding
   * vises. Når spillet er ferdig konvergerer begge modus på full visning.
   * Speiler WolfView-mønstret.
   */
  scoreVisibility: 'live' | 'reveal';
  /** `games.status` — styrer reveal-flow sammen med `scoreVisibility`. */
  gameStatus: 'draft' | 'scheduled' | 'active' | 'finished';
  /** Antall hull fullført av den ledende spilleren (#638). Brukes i sub-tittel. */
  holesPlayed: number;
  /** Hvor pilen tilbake skal peke. Defaults til spillets hjem. */
  backHref?: string;
  /**
   * Når true, dropper outer Shell + Header — caller eier ytre page-chrome.
   * Brukes inne i en parent (podium) wrapper.
   */
  chromeless?: boolean;
}

/**
 * Live/post-finished leaderboard for Bingo Bango Bongo. Per-spiller-tabell
 * sortert på totalPoints DESC med kolonner Bingo / Bango / Bongo / Sum.
 *
 * Reveal-modus (scoreVisibility='reveal' && status='active'): venterom-melding
 * i stedet for tall. Speiler WolfView-mønstret.
 */
export function BingoBangoBongoView({
  gameId: _gameId,
  gameName,
  result,
  playersById,
  scoreVisibility,
  gameStatus,
  holesPlayed,
  backHref = '/',
  chromeless = false,
}: BingoBangoBongoViewProps): JSX.Element {
  const t = useTranslations('leaderboard');
  const isRevealHidden =
    scoreVisibility === 'reveal' && gameStatus !== 'finished';

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

  if (isRevealHidden) {
    return (
      <LeaderboardShell chromeless={chromeless}>
        {!chromeless && <LeaderboardHeader gameName={gameName} backHref={backHref} />}
        <div
          data-testid="bbb-reveal-hidden"
          className="mx-4 mt-12 rounded-2xl border border-dashed border-border bg-surface px-5 py-8 text-center"
        >
          <p className="font-serif text-[18px] font-medium text-text">
            {t('common.revealHiddenTitle')}
          </p>
          <p className="mt-2 font-sans text-xs text-muted">
            {t('bingoBangoBongo.revealHiddenSub')}
          </p>
        </div>
        <PullQuote className="px-6 pt-4 pb-4">{t('common.goodLuck')}</PullQuote>
      </LeaderboardShell>
    );
  }

  const statusLabel = gameStatus === 'finished' ? t('common.afterNHoles', { holes: holesPlayed }) : t('common.live');

  return (
    <LeaderboardShell chromeless={chromeless}>
      {!chromeless && <LeaderboardHeader gameName={gameName} backHref={backHref} />}

      <div className="px-6 pt-1.5 pb-3.5 text-center">
        <h1 className="font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          {t('common.leaderboardHeading')}
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          {statusLabel} · {t('bingoBangoBongo.subtitle')}
        </p>
      </div>

      {/* Per-spiller-tabell med kolonner Bingo / Bango / Bongo / Sum */}
      <ul
        data-testid="bbb-leaderboard"
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
              rank={player.rank}
              displayName={displayName}
              bingos={player.bingos}
              bangos={player.bangos}
              bongos={player.bongos}
              totalPoints={player.totalPoints}
              tiedWith={player.tiedWith}
              staggerIndex={i}
            />
          );
        })}
      </ul>

      <LeaderboardFooter gameStatus={gameStatus} className="px-6 pt-1 pb-4" />
    </LeaderboardShell>
  );
}

function PlayerRow({
  rank,
  displayName,
  bingos,
  bangos,
  bongos,
  totalPoints,
  tiedWith,
  staggerIndex,
}: {
  rank: number;
  displayName: string;
  bingos: number;
  bangos: number;
  bongos: number;
  totalPoints: number;
  tiedWith: string[];
  staggerIndex: number;
}) {
  const t = useTranslations('leaderboard');
  const isPodium = rank >= 1 && rank <= 3;
  const isLeader = rank === 1;
  const cardClass = isLeader
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
          {/* Bingo / Bango / Bongo breakdown — hele ord, samme vokabular som
              duellkortet (page.tsx). `title` forklarer hva hver står for. */}
          <p className="mt-0.5 text-[12px] text-muted tabular-nums">
            <span title={`Bingo — ${t('bingoBangoBongo.firstOnGreen')}`}>{bingos} bingo</span>
            <span className="mx-1 text-muted/40" aria-hidden>·</span>
            <span title={`Bango — ${t('bingoBangoBongo.nearestPin')}`}>{bangos} bango</span>
            <span className="mx-1 text-muted/40" aria-hidden>·</span>
            <span title={`Bongo — ${t('bingoBangoBongo.firstInHole')}`}>{bongos} bongo</span>
          </p>
          {tiedWith.length > 0 && (
            <p className="text-[11px] text-muted mt-0.5">
              {t('common.tiedRank', { rank })}
            </p>
          )}
        </div>

        <div className="shrink-0 text-right">
          <span
            className={`score-num block leading-none tracking-[-0.02em] tabular-nums ${
              isLeader ? 'text-[28px] text-accent' : 'text-[26px] text-text'
            }`}
          >
            {totalPoints}
          </span>
          <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            {t('common.poengLabel')}
          </span>
        </div>
      </Card>
    </li>
  );
}
