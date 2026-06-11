import type { JSX } from 'react';
import { useTranslations } from 'next-intl';
import { SmartLink } from '@/components/ui/SmartLink';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Medallion } from '@/components/ui/Medallion';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { LeaderboardBackdrop } from '@/components/illustrations/LeaderboardBackdrop';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type {
  SkinsResult,
  SkinsHoleRow,
  SkinsPlayerLine,
} from '@/lib/scoring/modes/types';

/**
 * Spillerinfo for SkinsView. En map fra userId → navn + kallenavn.
 * Caller (leaderboard-page) bygger map-en fra game_players-joinen og
 * sender den inn slik at view-en kan rendre menneske-lesbare navn der
 * scoring-laget kun har userId-er.
 */
export interface SkinsPlayerInfo {
  name: string;
  nickname: string | null;
}

export interface SkinsViewProps {
  /** Spill-id — brukes til (fremtidig) drilldown og analytics. */
  gameId: string;
  /** Turneringsnavn — vises som kicker i header. */
  gameName: string;
  /**
   * Resultat fra `lib/scoring/modes/skins.compute()`.
   * Caller må narrowe på `kind === 'skins'` før propen sendes inn.
   */
  result: SkinsResult;
  /** Spillerinfo per userId for å rendre navn + kallenavn. */
  playersById: Map<string, SkinsPlayerInfo>;
  /**
   * Score-visibility-flagget fra `games.score_visibility`. Når `'reveal'`
   * og spillet ikke er ferdig, skjuler vi totaler og per-hull-skinsoversikt —
   * kun en venterom-melding vises. Når spillet er ferdig konvergerer begge
   * modus på full visning.
   */
  scoreVisibility: 'live' | 'reveal';
  /** `games.status` — styrer reveal-flow sammen med `scoreVisibility`. */
  gameStatus: 'draft' | 'scheduled' | 'active' | 'finished';
  /** Hvor pilen tilbake skal peke. Defaults til spillets hjem. */
  backHref?: string;
  /**
   * Når true, dropper outer Shell + Header — caller eier ytre page-chrome.
   * Brukes inne i LeaderboardTabs eller når en parent (podium) wrapper.
   */
  chromeless?: boolean;
}

/**
 * Live/post-finished leaderboard for Skins med carryover. To seksjoner:
 *
 *   - Spiller-totals øverst (primær storyline): hvem som vant hvor mange
 *     skins er den viktigste informasjonen — spillere gjør opp potten eksternt.
 *     Sortert på totalSkins DESC. Tydelig visning av skins-tall per spiller.
 *   - Per-hull-tabell (sekundær drilldown): hull, par, SI, på-spill (atStake),
 *     utfall. Vunne hull viser vinner + skins scoopet; delte hull viser
 *     carryover-indikator; pending-hull viser at scores mangler. Carryover-
 *     kjeden er synlig slik at det er åpenbart hvor potten samlet seg.
 *   - Henger-skins-linje: når spillet er ferdig og `carriedPot > 0`, vises
 *     en eksplisitt linje om at disse skinsene er uvunne (standard Skins-regel).
 *     Dekker også tidlig-avsluttede spill med gap etter et delt hull (#303).
 *
 * Reveal-modus (scoreVisibility='reveal' && status='active'): vi rendrer
 * en venterom-melding i stedet for tall — Skins er et penge-orientert spill
 * (potten gjøres opp eksternt), og det er hyggeligere å holde resultatene
 * under lokk til admin avslutter. Når spillet er ferdig (status='finished')
 * faller vi tilbake til full visning.
 */
export function SkinsView({
  gameId: _gameId,
  gameName,
  result,
  playersById,
  scoreVisibility,
  gameStatus,
  backHref = '/',
  chromeless = false,
}: SkinsViewProps): JSX.Element {
  const t = useTranslations('leaderboard');
  const tc = useTranslations('leaderboard.common');

  const isRevealHidden =
    scoreVisibility === 'reveal' && gameStatus !== 'finished';

  if (result.players.length === 0) {
    return (
      <Shell chromeless={chromeless}>
        {!chromeless && <Header gameName={gameName} backHref={backHref} />}
        <p className="mt-12 text-center text-sm text-muted">
          {tc('noPlayersToShow')}
        </p>
      </Shell>
    );
  }

  if (isRevealHidden) {
    return (
      <Shell chromeless={chromeless}>
        {!chromeless && <Header gameName={gameName} backHref={backHref} />}
        <div
          data-testid="skins-reveal-hidden"
          className="mx-4 mt-12 rounded-2xl border border-dashed border-border bg-surface px-5 py-8 text-center"
        >
          <p className="font-serif text-[18px] font-medium text-text">
            {tc('revealHiddenTitle')}
          </p>
          <p className="mt-2 font-sans text-xs text-muted">
            {t('skins.revealHiddenSub')}
          </p>
        </div>
        <PullQuote className="px-6 pt-4 pb-4">{tc('goodLuck')}</PullQuote>
      </Shell>
    );
  }

  const subtitleParts = [
    gameStatus === 'finished' ? tc('after18Holes') : tc('live'),
    'Skins',
    result.scoring === 'net' ? tc('netto') : tc('brutto'),
  ];

  // Henger-skins: scoring-modulen eksponerer den rå hengende potten (carriedPot)
  // uten å kjenne gameStatus. Når spillet er ferdig er en hengende pott uvunnet —
  // også når spillet ble avsluttet tidlig med et gap rett etter et delt hull
  // (issue #303). Under aktivt spill vises potten i pending-hullets carriedIn,
  // så vi holder banneret skjult til spillet er ferdig.
  const showUnwonSkins =
    gameStatus === 'finished' && result.carriedPot > 0;

  return (
    <Shell chromeless={chromeless}>
      {!chromeless && <Header gameName={gameName} backHref={backHref} />}

      <div className="px-6 pt-1.5 pb-3.5 text-center">
        <h1 className="font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          Leaderboard
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          {subtitleParts.join(' · ')}
        </p>
      </div>

      {/* Spiller-totals øverst — primær storyline: hvem vant hvor mange skins. */}
      <ul
        data-testid="skins-leaderboard"
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
              totalSkins={player.totalSkins}
              holesWon={player.holesWon}
              tiedWith={player.tiedWith}
              staggerIndex={i}
              t={t}
            />
          );
        })}
      </ul>

      {/* Uvunne skins — transparent om potten henger ved rundeslutt. */}
      {showUnwonSkins && (
        <div
          data-testid="skins-unwon"
          className="mx-3.5 mb-3 rounded-2xl border border-border bg-surface px-4 py-3 text-center"
        >
          <p className="font-sans text-[13px] text-muted">
            <span className="font-semibold tabular-nums text-text">
              {t('skins.skinCount', { count: result.carriedPot })}
            </span>{' '}
            {t('skins.unwonNote')}
          </p>
        </div>
      )}

      {/* Per-hull-tabell — sekundær drilldown for carryover-kjeden. */}
      <section className="px-3.5 pt-2 pb-3.5">
        <Kicker tone="muted" className="px-1 pb-2">
          {tc('perHullKicker')}
        </Kicker>
        <ul
          data-testid="skins-hole-list"
          className="flex flex-col gap-2 list-none"
        >
          {result.holes.map((hole) => (
            <HoleRow
              key={hole.holeNumber}
              hole={hole}
              playersById={playersById}
              t={t}
            />
          ))}
        </ul>
      </section>

      <PullQuote className="px-6 pt-1 pb-4">{tc('goodLuck')}</PullQuote>
    </Shell>
  );
}

function Shell({
  children,
  chromeless = false,
}: {
  children: React.ReactNode;
  chromeless?: boolean;
}) {
  if (chromeless) {
    return (
      <div className="relative isolate">
        <LeaderboardBackdrop />
        <div className="relative">{children}</div>
      </div>
    );
  }
  return (
    <AppShell>
      <div className="relative isolate pb-12">
        <LeaderboardBackdrop />
        <div className="relative">{children}</div>
      </div>
    </AppShell>
  );
}

function Header({
  gameName,
  backHref,
}: {
  gameName: string;
  backHref: string;
}) {
  const tc = useTranslations('leaderboard.common');
  return (
    <header className="mb-2 flex items-center justify-between gap-4">
      <SmartLink
        href={backHref}
        aria-label={tc('backAriaLabel')}
        className="-ml-2 inline-flex h-11 w-11 items-center justify-center text-lg text-text"
      >
        ‹
      </SmartLink>
      <Kicker tone="accent">{gameName.toUpperCase()}</Kicker>
      <span className="w-11" aria-hidden />
    </header>
  );
}

function PlayerRow({
  rank,
  displayName,
  totalSkins,
  holesWon,
  tiedWith,
  staggerIndex,
  t,
}: {
  rank: number;
  displayName: string;
  totalSkins: number;
  holesWon: number;
  tiedWith: string[];
  staggerIndex: number;
  t: ReturnType<typeof useTranslations<'leaderboard'>>;
}) {
  const isPodium = rank >= 1 && rank <= 3;
  const isTied = tiedWith.length > 0;
  const rankLabel = isTied ? `T${rank}` : `${rank}`;
  const cardClass =
    rank === 1 && !isTied
      ? 'border-accent bg-accent/[0.06] shadow-[0_2px_12px_rgba(201,169,97,0.15)]'
      : '';

  return (
    <li
      className="list-none reveal-up"
      style={{ animationDelay: `${60 + staggerIndex * 80}ms` }}
    >
      <Card className={`flex items-center gap-3.5 px-4 py-3.5 ${cardClass}`}>
        {isPodium && !isTied ? (
          <span className="shrink-0">
            <Medallion place={rank as 1 | 2 | 3} size={36} />
          </span>
        ) : (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface font-serif text-[15px] font-medium text-muted tabular-nums">
            {rankLabel}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="font-serif text-[17px] font-medium tracking-[-0.005em] text-text truncate">
            {displayName}
          </p>
          <p className="mt-0.5 text-[12px] text-muted tabular-nums">
            {t('skins.holesWonCount', { count: holesWon })}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <span className="score-num block text-[26px] leading-none tracking-[-0.02em] text-text tabular-nums">
            {totalSkins}
          </span>
          <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            {t('skins.skinLabel', { count: totalSkins })}
          </span>
        </div>
      </Card>
    </li>
  );
}

function outcomeClass(outcome: SkinsHoleRow['outcome']): string {
  switch (outcome) {
    case 'won':
      return 'text-accent';
    case 'carryover':
      return 'text-muted';
    default:
      return 'text-muted/70';
  }
}

function HoleRow({
  hole,
  playersById,
  t,
}: {
  hole: SkinsHoleRow;
  playersById: Map<string, SkinsPlayerInfo>;
  t: ReturnType<typeof useTranslations<'leaderboard'>>;
}) {
  const tc = useTranslations('leaderboard.common');
  const winnerInfo = hole.winnerUserId
    ? playersById.get(hole.winnerUserId)
    : null;
  const winnerName = winnerInfo
    ? formatRevealName(winnerInfo.name, winnerInfo.nickname)
    : null;

  const atStakeLabel = t('skins.atStakeLabel', { count: hole.atStake });

  return (
    <li
      className="list-none"
      data-testid={`skins-hole-row-${hole.holeNumber}`}
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
          {/* Skins på spill — fremhevet når potten er bygget opp */}
          <span
            className={`text-[10.5px] tabular-nums font-medium ${
              hole.atStake > 1 ? 'text-accent' : 'text-muted'
            }`}
          >
            {atStakeLabel}
          </span>
        </div>

        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px] text-muted">
          <span className={`font-medium ${outcomeClass(hole.outcome)}`}>
            {hole.outcome === 'won'
              ? t('skins.outcomeWon')
              : hole.outcome === 'carryover'
                ? t('skins.outcomeCarryover')
                : t('skins.outcomePending')}
          </span>

          {hole.outcome === 'won' && winnerName && (
            <>
              <span aria-hidden className="text-muted/40">
                ·
              </span>
              <span className="text-text">{winnerName}</span>
              <span aria-hidden className="text-muted/40">
                ·
              </span>
              <span className="tabular-nums text-accent font-medium">
                +{hole.skinsAwarded}{' '}
                {t('skins.skinLabel', { count: hole.skinsAwarded })}
              </span>
            </>
          )}

          {hole.outcome === 'carryover' && (
            <>
              <span aria-hidden className="text-muted/40">
                ·
              </span>
              <span className="text-muted">{t('skins.carriedForward')}</span>
            </>
          )}
        </div>

        {/* Carryover-kjede: vis carriedIn når det er en bygget pott (atStake > 1)
            slik at det er åpenbart hvor potten samlet seg opp til dette hullet. */}
        {hole.carriedIn > 0 && (
          <p className="mt-1 text-[11px] tabular-nums text-muted/70">
            {t('skins.carriedInLabel', { count: hole.carriedIn })}
          </p>
        )}
      </Card>
    </li>
  );
}

// Re-export for use in SkinsPodium (avoids separate import of the same type).
export type { SkinsPlayerLine };
