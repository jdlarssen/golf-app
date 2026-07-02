import type { JSX, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Medallion } from '@/components/ui/Medallion';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { LeaderboardShell, LeaderboardHeader } from './LeaderboardChrome';
import { LeaderboardFooter } from './LeaderboardFooter';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type {
  RoundRobinResult,
  RoundRobinPlayerLine,
  RoundRobinSegmentLine,
} from '@/lib/scoring/modes/types';
import { RowReactionsForPlayer } from './RowReactionsForPlayer';

/**
 * Spillerinfo for RoundRobinView. En map fra userId → navn + kallenavn.
 * Caller (leaderboard-page) bygger map-en fra game_players-joinen og
 * sender den inn slik at view-en kan rendre menneske-lesbare navn der
 * scoring-laget kun har userId-er.
 */
export interface RoundRobinPlayerInfo {
  name: string;
  nickname: string | null;
}

export interface RoundRobinViewProps {
  /** Spill-id — brukes til (fremtidig) drilldown og analytics. */
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
  /**
   * Score-visibility-flagget fra `games.score_visibility`. Når `'reveal'`
   * og spillet ikke er ferdig, skjuler vi totaler — kun en venterom-melding
   * vises. Speiler WolfView/BingoBangoBongoView-mønstret.
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
  /**
   * Valgfri hale-seksjon rendret ETTER hovedinnholdet, men INNI shell-en
   * (#386/#1008-mønster). Kun rendret i hoved-visningen (finished + fylte
   * data) — tomme/reveal-hidden-grenene har ingen leaderboard å knytte
   * referatet til.
   */
  footerSlot?: ReactNode;
}

const SLOT_LABEL: Record<number, string> = { 1: 'A', 2: 'B', 3: 'C', 4: 'D' };

function playerLabel(
  userId: string,
  playersById: Map<string, RoundRobinPlayerInfo>,
  fallback: string,
): string {
  const info = playersById.get(userId);
  return info ? formatRevealName(info.name, info.nickname) : fallback;
}

/**
 * Live/post-finished leaderboard for Round Robin. To seksjoner:
 *
 *   - Per-spiller-tabell: rangert på totalHoleWins DESC. Topp 3 får Medallion,
 *     4+ får ren rank-disc. Hoved-tall: hull-seire. Leader-rad får champagne-
 *     accent.
 *   - Segment-sammendrag: for hver spiller de 3 roterende konstellasjonene
 *     (hvem spilleren var partner med + hull-seire/tap/delt i det segmentet).
 *     Forteller Round Robin-historien om hvem som var sterk i hvilken
 *     konstellasjon.
 *
 * Reveal-modus (scoreVisibility='reveal' && status='active'): venterom-melding
 * i stedet for tall. Speiler WolfView-mønstret.
 */
export function RoundRobinView({
  gameId: _gameId,
  gameName,
  result,
  playersById,
  scoreVisibility,
  gameStatus,
  holesPlayed,
  backHref = '/',
  chromeless = false,
  footerSlot,
}: RoundRobinViewProps): JSX.Element {
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
          data-testid="round-robin-reveal-hidden"
          className="mx-4 mt-12 rounded-2xl border border-dashed border-border bg-surface px-5 py-8 text-center"
        >
          <p className="font-serif text-[18px] font-medium text-text">
            {t('common.revealHiddenTitle')}
          </p>
          <p className="mt-2 font-sans text-xs text-muted">
            {t('roundRobin.revealHiddenSub')}
          </p>
        </div>
        <PullQuote className="px-6 pt-4 pb-4">{t('common.goodLuck')}</PullQuote>
      </LeaderboardShell>
    );
  }

  const statusLabel = gameStatus === 'finished' ? t('common.afterNHoles', { holes: holesPlayed }) : t('common.live');

  return (
    <LeaderboardShell chromeless={chromeless} footerSlot={footerSlot}>
      {!chromeless && <LeaderboardHeader gameName={gameName} backHref={backHref} />}

      <div className="px-6 pt-1.5 pb-3.5 text-center">
        <h1 className="font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          {t('common.leaderboardHeading')}
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          {statusLabel} · {t('roundRobin.subtitle', { allowancePct: result.allowancePct })}
        </p>
      </div>

      {/* Per-spiller-tabell: primær rangering på hull-seire. */}
      <ul
        data-testid="round-robin-leaderboard"
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
              player={player}
              displayName={displayName}
              staggerIndex={i}
            />
          );
        })}
      </ul>

      {/* Segment-sammendrag: de 3 roterende konstellasjonene per spiller. */}
      <section className="px-3.5 pt-2 pb-3.5">
        <Kicker tone="muted" className="px-1 pb-2">
          {t('roundRobin.segmentSummaryKicker')}
        </Kicker>
        <ul
          data-testid="round-robin-segment-summary"
          className="flex flex-col gap-3 list-none"
        >
          {result.players.map((player) => {
            const info = playersById.get(player.userId);
            const displayName = info
              ? formatRevealName(info.name, info.nickname)
              : t('common.unknownPlayerFull');
            return (
              <SegmentCard
                key={player.userId}
                player={player}
                displayName={displayName}
                playersById={playersById}
              />
            );
          })}
        </ul>
      </section>

      <LeaderboardFooter gameStatus={gameStatus} className="px-6 pt-1 pb-4" />
    </LeaderboardShell>
  );
}

function PlayerRow({
  player,
  displayName,
  staggerIndex,
}: {
  player: RoundRobinPlayerLine;
  displayName: string;
  staggerIndex: number;
}) {
  const t = useTranslations('leaderboard');
  const isPodium = player.rank >= 1 && player.rank <= 3;
  const isLeader = player.rank === 1;
  const cardClass = isLeader
    ? 'border-accent bg-accent/[0.06] shadow-[0_2px_12px_rgba(201,169,97,0.15)]'
    : '';

  const slotLabel = SLOT_LABEL[player.teamNumber] ?? String(player.teamNumber);

  return (
    <li
      className="list-none reveal-up"
      style={{ animationDelay: `${60 + staggerIndex * 80}ms` }}
    >
      <Card className={`flex items-center gap-3.5 px-4 py-3.5 ${cardClass}`}>
        {isPodium ? (
          <span className="shrink-0">
            <Medallion place={player.rank as 1 | 2 | 3} size={36} />
          </span>
        ) : (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface font-serif text-[18px] font-medium text-muted">
            {player.rank}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="font-serif text-[17px] font-medium tracking-[-0.005em] text-text truncate">
            {displayName}
          </p>
          <p className="mt-0.5 text-[12px] text-muted tabular-nums">
            {t('roundRobin.slotLabel', { slot: slotLabel })}
            {player.tiedWith.length > 0 && (
              <span className="ml-1 text-muted/80">{t('roundRobin.tiedInline', { rank: player.rank })}</span>
            )}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <span
            className={`score-num block leading-none tracking-[-0.02em] tabular-nums ${
              isLeader ? 'text-[28px] text-accent' : 'text-[26px] text-text'
            }`}
          >
            {player.totalHoleWins}
          </span>
          <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            {t('roundRobin.hullLabel')}
          </span>
        </div>
      </Card>
      <RowReactionsForPlayer targetUserId={player.userId} />
    </li>
  );
}

function SegmentCard({
  player,
  displayName,
  playersById,
}: {
  player: RoundRobinPlayerLine;
  displayName: string;
  playersById: Map<string, RoundRobinPlayerInfo>;
}) {
  return (
    <li className="list-none" data-testid={`round-robin-segment-card-${player.userId}`}>
      <Card className="px-3.5 py-3">
        <p className="font-serif text-[14px] font-medium tracking-[-0.005em] text-text mb-2">
          {displayName}
        </p>
        <ul className="flex flex-col gap-1.5 list-none">
          {player.segments.map((seg) => (
            <SegmentRow
              key={seg.segment}
              seg={seg}
              playersById={playersById}
            />
          ))}
        </ul>
      </Card>
    </li>
  );
}

function SegmentRow({
  seg,
  playersById,
}: {
  seg: RoundRobinSegmentLine;
  playersById: Map<string, RoundRobinPlayerInfo>;
}) {
  const t = useTranslations('leaderboard');
  const tc = useTranslations('leaderboard.common');

  const SEGMENT_HOLES: Record<1 | 2 | 3, string> = {
    1: t('roundRobin.segmentHoles1'),
    2: t('roundRobin.segmentHoles2'),
    3: t('roundRobin.segmentHoles3'),
  };

  const partnerName = playerLabel(seg.partnerUserId, playersById, tc('unknownPlayer'));
  const oppNames = seg.opponentUserIds
    .map((id) => playerLabel(id, playersById, tc('unknownPlayer')))
    .join(' + ');
  const holeLabel = SEGMENT_HOLES[seg.segment as 1 | 2 | 3] ?? `Seg ${seg.segment}`;

  const resultClass =
    seg.holesWon > seg.holesLost
      ? 'text-accent font-semibold'
      : seg.holesWon < seg.holesLost
        ? 'text-muted'
        : 'text-text';

  return (
    <li className="list-none">
      <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
        <div className="min-w-0">
          <span className="text-muted">{holeLabel}:</span>{' '}
          <span className="text-text">
            {t('roundRobin.medLabel', { partner: partnerName })}
          </span>
          <span className="mx-1 text-muted/40" aria-hidden>
            {t('roundRobin.vsLabel')}
          </span>
          <span className="text-muted">{oppNames}</span>
        </div>
        <div
          className={`shrink-0 tabular-nums ${resultClass}`}
          title={t('roundRobin.hullWinTitle', { won: seg.holesWon, lost: seg.holesLost, halved: seg.holesHalved })}
        >
          {seg.holesWon}–{seg.holesLost}
          {seg.holesHalved > 0 && (
            <span className="text-muted/70"> ({seg.holesHalved})</span>
          )}
        </div>
      </div>
    </li>
  );
}

