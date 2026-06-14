import type { JSX } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Medallion } from '@/components/ui/Medallion';
import { PullQuote } from '@/components/ui/PullQuote';
import { LeaderboardShell, LeaderboardHeader } from './LeaderboardChrome';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type { SoloStrokeplayResult } from '@/lib/scoring/modes/types';

/**
 * Spillerinfo for SoloStrokeplayView. En map fra userId → navn + kallenavn.
 * Caller (leaderboard-page) bygger map-en fra game_players-joinen. Speilet
 * `SoloStablefordPlayerInfo` 1:1 — slagspill og solo-stableford bruker samme
 * info-shape siden ranking-skjermen bare trenger navn + kallenavn for visning.
 */
export interface SoloStrokeplayPlayerInfo {
  name: string;
  nickname: string | null;
}

export interface SoloStrokeplayViewProps {
  /** Spill-id — brukes til (fremtidig) drilldown og analytics. */
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
   * Når true, dropper outer Shell + Header — caller eier ytre page-chrome.
   * Brukes (fremtidig) inne i LeaderboardTabs ved side-tournament-fane.
   */
  chromeless?: boolean;
}

/**
 * Live/post-finished leaderboard for solo strokeplay — flat liste sortert
 * på `totalNetStrokes` (lavest øverst, klassisk slagspill-format). Speilar
 * `SoloStablefordView` visuelt: samme fairway-backdrop, samme Fraunces-for-tall
 * typografi-token, samme champagne-tinted Card-padding for vinneren.
 *
 * Forskjeller fra solo-stableford:
 *   - Sortering: lavest netto-total øverst (vs høyest poeng)
 *   - Hoved-tallet: «slag» (netto-slag) i stedet for «poeng»
 *   - Sekundær-info per rad: brutto-total ved siden av hull-spilt-chip
 *   - Sub-tittel: «Slagspill · Sortert på laveste netto-total»
 *
 * Reveal-flow (separate podium-view) ligger i `SoloStrokeplayPodium` — denne
 * view-en holder seg saklig så midt-runde-bruk leser som live-leaderboard og
 * ikke som seremoni. Status-router i `page.tsx` velger view per `game.status`.
 */
export function SoloStrokeplayView({
  gameId: _gameId,
  gameName,
  result,
  playersById,
  backHref = '/',
  chromeless = false,
}: SoloStrokeplayViewProps): JSX.Element {
  const t = useTranslations('leaderboard');

  const subtitle = t('soloStrokeplay.subtitle');

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

  return (
    <LeaderboardShell chromeless={chromeless}>
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
        data-testid="strokeplay-leaderboard"
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
              totalNetStrokes={player.totalNetStrokes}
              totalGrossStrokes={player.totalGrossStrokes}
              holesPlayed={player.holesPlayed}
              staggerIndex={i}
              grossHolesRow={t('soloStrokeplay.grossHolesRow', { gross: player.totalGrossStrokes, holes: player.holesPlayed })}
              slagLabel={t('common.slagLabel')}
            />
          );
        })}
      </ul>

      <PullQuote className="px-6 pt-1 pb-4">{t('common.goodLuck')}</PullQuote>
    </LeaderboardShell>
  );
}

function PlayerRow({
  rank,
  displayName,
  totalNetStrokes,
  staggerIndex,
  grossHolesRow,
  slagLabel,
}: {
  rank: number;
  displayName: string;
  totalNetStrokes: number;
  totalGrossStrokes: number;
  holesPlayed: number;
  staggerIndex: number;
  grossHolesRow: string;
  slagLabel: string;
}) {
  const isPodium = rank >= 1 && rank <= 3;
  // Champagne-tinted Card for vinneren, ingen accent for 2-3, og helt
  // nøytral for 4+. Mer subtilt enn State4View sin LeaderCard-hero siden
  // denne view-en brukes både midt-runde og post-finished. Speiler
  // SoloStablefordView.PlayerRow for visuell konsistens.
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
          {/* Sekundær-linje: brutto-total + hull-spilt. Klassisk slagspill
              viser «brutto / netto» som standard, men her separerer vi dem
              for lesbarhet: brutto venstre («N brutto»), hull-spilt høyre.
              `tabular-nums` for konsistent tall-skanning. */}
          <p className="mt-0.5 text-[12px] text-muted tabular-nums">
            {grossHolesRow}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <span className="score-num block text-[26px] leading-none tracking-[-0.02em] text-text tabular-nums">
            {totalNetStrokes}
          </span>
          <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            {slagLabel}
          </span>
        </div>
      </Card>
    </li>
  );
}
