import type { JSX } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { PullQuote } from '@/components/ui/PullQuote';
import { LeaderboardShell, LeaderboardHeader } from '../LeaderboardChrome';
import type { LeaderboardNavContext } from '@/lib/leaderboard/navContext';
import { LeaderboardFooter } from '../LeaderboardFooter';
import { formatRevealName } from '@/lib/names/formatRevealName';
import { wolfOutcomeClass } from '@/lib/wolf/holeLabels';
import { wolfHoleCards, type WolfHoleCard } from '@/lib/leaderboard/wolfHoles';
import type { WolfResult } from '@/lib/scoring/modes/types';
import type { WolfPlayerInfo } from '../WolfView';

export interface WolfHolesViewProps {
  /** Spill-id — brukes til back-lenke. */
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
  /** `games.score_visibility` normalisert. Styrer reveal-flow. */
  scoreVisibility: 'live' | 'reveal';
  /** `games.status` — styrer reveal-flow sammen med `scoreVisibility`. */
  gameStatus: 'active' | 'finished';
  /**
   * Tilbake-kontekst fra `?from=` (#1517). Uten kontekst peker back-lenken
   * til spill-siden, som før (#1525).
   */
  navContext?: LeaderboardNavContext;
}

/**
 * Format-bevisst «Hull for hull» for Wolf (epic #496, PR 2). Erstatter det
 * generiske best-ball lag-scorekortet med en Wolf-riktig per-hull-visning:
 * hvem som var Wolf, valget (Lone/Blind/Partner), utfallet, innsatsen, og —
 * det WolfView sin kompakte PER HULL mangler — hver spillers score, hvilken
 * side de spilte på (Wolf-side/Andre), og poengene de fikk.
 *
 * Regnestykket (rekkefølgen, poengene, brutto ved siden av, innsatsen) bor i
 * `lib/leaderboard/wolfHoles.ts`, delt med appen (#2255 PR 3b). Her tegnes det.
 */
export function WolfHolesView({
  gameId,
  gameName,
  result,
  playersById,
  scoreVisibility,
  gameStatus,
  navContext,
}: WolfHolesViewProps): JSX.Element {
  const t = useTranslations('leaderboard');
  const tc = useTranslations('leaderboard.common');

  const isRevealHidden =
    scoreVisibility === 'reveal' && gameStatus !== 'finished';

  if (isRevealHidden) {
    return (
      <LeaderboardShell>
        <LeaderboardHeader
          gameName={gameName}
          backHref={navContext?.from ?? `/games/${gameId}`}
        />
        <div
          data-testid="wolf-holes-reveal-hidden"
          className="mx-4 mt-12 rounded-2xl border border-dashed border-border bg-surface px-5 py-8 text-center"
        >
          <p className="font-serif text-[18px] font-medium text-text">
            {tc('revealHiddenTitle')}
          </p>
          <p className="mt-2 font-sans text-xs text-muted">
            {t('wolf.hullForHullRevealSub')}
          </p>
        </div>
        <PullQuote className="px-6 pt-4 pb-4">{tc('goodLuck')}</PullQuote>
      </LeaderboardShell>
    );
  }

  return (
    <LeaderboardShell>
      <LeaderboardHeader
        gameName={gameName}
        backHref={navContext?.from ?? `/games/${gameId}`}
      />

      <div className="px-6 pt-1.5 pb-3.5 text-center">
        <h1 className="font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          {tc('hullForHullHeading')}
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          Wolf · {result.scoring === 'net' ? tc('netto') : tc('brutto')}
        </p>
      </div>

      <ul
        data-testid="wolf-holes-list"
        className="flex flex-col gap-2.5 px-3.5 pt-1 pb-3.5 list-none"
      >
        {wolfHoleCards(result).holes.map((hole) => (
          <HoleCard key={hole.holeNumber} hole={hole} playersById={playersById} t={t} tc={tc} />
        ))}
      </ul>

      <LeaderboardFooter gameStatus={gameStatus} className="px-6 pt-1 pb-4" />
    </LeaderboardShell>
  );
}

function HoleCard({
  hole,
  playersById,
  t,
  tc,
}: {
  hole: WolfHoleCard;
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

  return (
    <li className="list-none" data-testid={`wolf-holes-card-${hole.holeNumber}`}>
      <Card className="px-3.5 py-3">
        {/* Hode: hull + par/SI venstre, innsats høyre */}
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-[15px] font-medium tabular-nums text-text">
              {tc('hullNumber', { number: hole.holeNumber })}
            </span>
            <span className="text-[10.5px] tabular-nums text-muted">
              {tc('parSiChip', { par: hole.par, si: hole.strokeIndex })}
            </span>
          </div>
          {hole.stake != null && (
            <span className="rounded-full border border-accent/40 bg-accent/[0.08] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-accent-text tabular-nums">
              {hole.stake}x
            </span>
          )}
        </div>

        {/* Wolf-linje: hvem var Wolf, valg, utfall */}
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px] text-muted">
          <span>
            <span className="text-muted">{t('wolf.wolfLabel')}</span>{' '}
            <span className="text-text">{wolfName}</span>
          </span>
          <span aria-hidden className="text-muted/40">
            ·
          </span>
          <span className="text-text">
            {hole.choiceKey === 'choicePartner'
              ? t('wolf.choicePartner', { partnerName: partnerName ?? '?' })
              : t(`wolf.${hole.choiceKey}`)}
          </span>
          <span aria-hidden className="text-muted/40">
            ·
          </span>
          <span className={`font-medium ${wolfOutcomeClass(hole.outcome)}`}>
            {t(`wolf.${hole.outcomeKey}`)}
          </span>
        </div>

        {/* Per-spiller: side, score, contributor, poeng — det WolfView mangler */}
        <ul className="mt-2 flex flex-col gap-1 list-none">
          {hole.rows.map((cell) => {
            const info = playersById.get(cell.userId);
            const name = info
              ? formatRevealName(info.name, info.nickname)
              : tc('unknownPlayerFull');
            const onWolfSide = cell.side === 'wolf';

            return (
              <li
                key={cell.userId}
                className={`flex items-center justify-between gap-3 rounded-xl px-2.5 py-1.5 ${
                  onWolfSide
                    ? 'border border-accent/30 bg-accent/[0.05]'
                    : 'border border-transparent'
                }`}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {cell.isContributor && (
                    <span
                      aria-hidden
                      className={`text-[11px] ${onWolfSide ? 'text-accent' : 'text-muted'}`}
                    >
                      ★
                    </span>
                  )}
                  <span className="truncate font-sans text-[14px] text-text">
                    {name}
                  </span>
                  {cell.side != null && (
                    <span className="shrink-0 text-[11px] uppercase tracking-[0.1em] text-muted">
                      {cell.side === 'wolf' ? t('wolf.wolfSide') : t('wolf.andreSide')}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-baseline gap-1.5 tabular-nums">
                  {cell.pointsShown != null && (
                    <span className="text-[12px] font-semibold text-accent-text">
                      +{cell.pointsShown}
                    </span>
                  )}
                  {cell.grossShown != null && (
                    <span className="text-[10.5px] text-muted">
                      {t('wolf.bruttoLabel', { count: cell.grossShown })}
                    </span>
                  )}
                  <span className="score-num text-[18px] leading-none text-text">
                    {cell.effectiveScore ?? '–'}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
    </li>
  );
}
