import type { JSX } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Medallion } from '@/components/ui/Medallion';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { LeaderboardShell, LeaderboardHeader } from './LeaderboardChrome';
import { LeaderboardFooter } from './LeaderboardFooter';
import { formatRevealName } from '@/lib/names/formatRevealName';
import {
  wolfChoiceKey,
  wolfOutcomeKey,
  wolfOutcomeClass,
} from '@/lib/wolf/holeLabels';
import { SettlementTable } from './SettlementTable';
import type { Settlement } from '@/lib/scoring/settlement';
import type { WolfResult, WolfHoleRow } from '@/lib/scoring/modes/types';

/**
 * Spillerinfo for WolfView. En map fra userId → navn + kallenavn.
 * Caller (leaderboard-page) bygger map-en fra game_players-joinen og
 * sender den inn slik at view-en kan rendre menneske-lesbare navn der
 * scoring-laget kun har userId-er.
 */
export interface WolfPlayerInfo {
  name: string;
  nickname: string | null;
}

export interface WolfViewProps {
  /** Spill-id — brukes til (fremtidig) drilldown og analytics. */
  gameId: string;
  /** Turneringsnavn — vises som kicker i header. */
  gameName: string;
  /**
   * Resultat fra `lib/scoring/modes/wolf.compute()`.
   * Caller må narrowe på `kind === 'wolf'` før propen sendes inn.
   */
  result: WolfResult;
  /** Spillerinfo per userId for å rendre navn + kallenavn. */
  playersById: Map<string, WolfPlayerInfo>;
  /**
   * Score-visibility-flagget fra `games.score_visibility`. Når `'reveal'`
   * og spillet ikke er ferdig, skjuler vi totaler og per-hull-poeng — kun
   * en venterom-melding vises. Når spillet er ferdig konvergerer begge
   * modus på full visning.
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
   * Brukes inne i LeaderboardTabs eller når en parent (podium) wrapper.
   */
  chromeless?: boolean;
  /** Pengeoppgjør (#937) — null hvis kr_per_unit ikke er satt eller ≤ 0. */
  settlement?: Settlement | null;
}

/**
 * Live/post-finished leaderboard for Wolf. To seksjoner:
 *
 *   - Per-hull-liste: hver Wolf-rad viser hull-nummer/par/SI, Wolf, choice-
 *     badge (Partner: X / Lone Wolf / Blind Wolf / Venter…), stake-multiplier
 *     når > 1, outcome (Wolf vant / Andre vant / Lik / Venter), og per-spiller
 *     +poeng-chips (kun for spillere som faktisk tjente poeng på hullet).
 *   - Spiller-totals: én rad per spiller, sortert på `rank` (= totalPoints
 *     DESC fra scoring-laget). Topp 3 får Medallion, 4+ får ren rank-disc.
 *     Hver rad viser totalPoints, antall Wolf-hull spilt, og blindWolfWins.
 *
 * Reveal-modus (scoreVisibility='reveal' && status='active'): vi rendrer
 * en venterom-melding i stedet for tall — Wolf er per definisjon et
 * point-game, så å skjule poeng-totalene midt-runde er drama-lisens. Når
 * spillet er ferdig (status='finished') faller vi tilbake til full visning.
 */
export function WolfView({
  gameId: _gameId,
  gameName,
  result,
  playersById,
  scoreVisibility,
  gameStatus,
  holesPlayed,
  backHref = '/',
  chromeless = false,
  settlement,
}: WolfViewProps): JSX.Element {
  const t = useTranslations('leaderboard');
  const tc = useTranslations('leaderboard.common');

  const isRevealHidden =
    scoreVisibility === 'reveal' && gameStatus !== 'finished';

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

  if (isRevealHidden) {
    return (
      <LeaderboardShell chromeless={chromeless}>
        {!chromeless && <LeaderboardHeader gameName={gameName} backHref={backHref} />}
        <div
          data-testid="wolf-reveal-hidden"
          className="mx-4 mt-12 rounded-2xl border border-dashed border-border bg-surface px-5 py-8 text-center"
        >
          <p className="font-serif text-[18px] font-medium text-text">
            {tc('revealHiddenTitle')}
          </p>
          <p className="mt-2 font-sans text-xs text-muted">
            {t('wolf.revealHiddenSub')}
          </p>
        </div>
        <PullQuote className="px-6 pt-4 pb-4">{tc('goodLuck')}</PullQuote>
      </LeaderboardShell>
    );
  }

  const subtitleParts = [
    gameStatus === 'finished' ? tc('afterNHoles', { holes: holesPlayed }) : tc('live'),
    'Wolf',
    result.scoring === 'net' ? tc('netto') : tc('brutto'),
  ];

  return (
    <LeaderboardShell chromeless={chromeless}>
      {!chromeless && <LeaderboardHeader gameName={gameName} backHref={backHref} />}

      <div className="px-6 pt-1.5 pb-3.5 text-center">
        <h1 className="font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          {tc('leaderboardHeading')}
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          {subtitleParts.join(' · ')}
        </p>
      </div>

      {/* Spiller-totals øverst — primær storyline er hvem som leder Wolf-pakken. */}
      <ul
        data-testid="wolf-leaderboard"
        className="flex flex-col gap-2 px-3.5 pt-3 pb-3.5"
      >
        {result.players.map((player, i) => {
          const info = playersById.get(player.userId);
          const displayName = info
            ? formatRevealName(info.name, info.nickname)
            : tc('unknownPlayerFull');
          return (
            <PlayerRow
              key={player.userId}
              rank={player.rank}
              displayName={displayName}
              totalPoints={player.totalPoints}
              wolfHolesPlayed={player.wolfHolesPlayed}
              blindWolfWins={player.blindWolfWins}
              staggerIndex={i}
              tWolf={t}
            />
          );
        })}
      </ul>

      {/* Pengeoppgjør (#937) — vises kun når kr_per_unit er satt (settlement != null). */}
      {settlement && (
        <div className="px-3.5 pb-3.5">
          <SettlementTable settlement={settlement} playersById={playersById} />
        </div>
      )}

      {/* Per-hull-liste — sekundær drilldown for hvordan poengene ble fordelt. */}
      <section className="px-3.5 pt-2 pb-3.5">
        <Kicker tone="muted" className="px-1 pb-2">
          {tc('perHullKicker')}
        </Kicker>
        <ul
          data-testid="wolf-hole-list"
          className="flex flex-col gap-2 list-none"
        >
          {result.holes.map((hole) => (
            <HoleRow
              key={hole.holeNumber}
              hole={hole}
              playersById={playersById}
              t={t}
              tc={tc}
            />
          ))}
        </ul>
      </section>

      <LeaderboardFooter gameStatus={gameStatus} className="px-6 pt-1 pb-4" />
    </LeaderboardShell>
  );
}

function PlayerRow({
  rank,
  displayName,
  totalPoints,
  wolfHolesPlayed,
  blindWolfWins,
  staggerIndex,
  tWolf,
}: {
  rank: number;
  displayName: string;
  totalPoints: number;
  wolfHolesPlayed: number;
  blindWolfWins: number;
  staggerIndex: number;
  tWolf: ReturnType<typeof useTranslations<'leaderboard'>>;
}) {
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
            {displayName}
          </p>
          <p className="mt-0.5 text-[12px] text-muted tabular-nums">
            {tWolf('wolf.wolfHullPlayed', { count: wolfHolesPlayed })}
            {blindWolfWins > 0 && (
              <span className="ml-1 text-muted/80">
                · {tWolf('wolf.blindWolfPott', { count: blindWolfWins })}
              </span>
            )}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <span className="score-num block text-[26px] leading-none tracking-[-0.02em] text-text tabular-nums">
            {totalPoints}
          </span>
          <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            {tWolf('wolf.poengLabel')}
          </span>
        </div>
      </Card>
    </li>
  );
}

function HoleRow({
  hole,
  playersById,
  t,
  tc,
}: {
  hole: WolfHoleRow;
  playersById: Map<string, WolfPlayerInfo>;
  t: ReturnType<typeof useTranslations<'leaderboard'>>;
  tc: ReturnType<typeof useTranslations<'leaderboard.common'>>;
}) {
  const wolfInfo = playersById.get(hole.wolfUserId);
  const wolfName = wolfInfo
    ? formatRevealName(wolfInfo.name, wolfInfo.nickname)
    : tc('unknownPlayer');
  const partnerInfo = hole.partnerUserId
    ? playersById.get(hole.partnerUserId)
    : null;
  const partnerName = partnerInfo
    ? formatRevealName(partnerInfo.name, partnerInfo.nickname)
    : hole.partnerUserId
      ? '?'
      : null;

  const choiceKey = wolfChoiceKey(hole.choice);
  const choiceLabel =
    choiceKey === 'choicePartner'
      ? t(`wolf.${choiceKey}`, { partnerName: partnerName ?? '?' })
      : t(`wolf.${choiceKey}`);

  const outcomeKey = wolfOutcomeKey(hole.outcome);
  const outcomeLabel = t(`wolf.${outcomeKey}`);

  const points = Object.entries(hole.pointsByPlayer).filter(
    ([, pts]) => pts > 0,
  );

  return (
    <li
      className="list-none"
      data-testid={`wolf-hole-row-${hole.holeNumber}`}
    >
      <Card className="px-3.5 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-[15px] font-medium tabular-nums text-text">
              {tc('hullNumber', { number: hole.holeNumber })}
            </span>
            <span className="text-[10.5px] tabular-nums text-muted">
              {tc('parSiChip', { par: hole.par, si: hole.strokeIndex })}
            </span>
          </div>
          {hole.stake > 1 && (
            <span className="rounded-full border border-accent/40 bg-accent/[0.08] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-accent tabular-nums">
              {hole.stake}x
            </span>
          )}
        </div>

        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px] text-muted">
          <span>
            <span className="text-muted/80">{t('wolf.wolfLabel')}</span>{' '}
            <span className="text-text">{wolfName}</span>
          </span>
          <span aria-hidden className="text-muted/40">
            ·
          </span>
          <span className="text-text">{choiceLabel}</span>
          <span aria-hidden className="text-muted/40">
            ·
          </span>
          <span className={`font-medium ${wolfOutcomeClass(hole.outcome)}`}>
            {outcomeLabel}
          </span>
        </div>

        {points.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5 list-none">
            {points.map(([userId, pts]) => {
              const info = playersById.get(userId);
              const name = info
                ? formatRevealName(info.name, info.nickname)
                : '?';
              return (
                <li key={userId} className="list-none">
                  <span className="inline-flex items-baseline gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] tabular-nums text-text">
                    <span className="text-muted">{name}</span>
                    <span className="font-semibold text-accent">+{pts}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </li>
  );
}
