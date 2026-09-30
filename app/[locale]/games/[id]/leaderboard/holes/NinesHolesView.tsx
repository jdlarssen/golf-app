import type { JSX } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { AppLocale } from '@/i18n/routing';
import { formatNumber } from '@/lib/i18n/format';
import { Card } from '@/components/ui/Card';
import { PullQuote } from '@/components/ui/PullQuote';
import { LeaderboardShell, LeaderboardHeader } from '../LeaderboardChrome';
import type { LeaderboardNavContext } from '@/lib/leaderboard/navContext';
import { LeaderboardFooter } from '../LeaderboardFooter';
import { formatRevealName } from '@/lib/names/formatRevealName';
import {
  ninesHoleCards,
  ninesPointsText,
  type NinesHoleCard,
} from '@/lib/leaderboard/ninesHoles';
import type { NinesResult } from '@/lib/scoring/modes/types';
import type { NinesPlayerInfo } from '../NinesView';

export interface NinesHolesViewProps {
  /** Spill-id — brukes til back-lenke. */
  gameId: string;
  /** Turneringsnavn — vises som kicker i header. */
  gameName: string;
  /**
   * Resultat fra `lib/scoring/modes/nines.compute()`.
   * Caller må narrowe på `kind === 'nines'` før propen sendes inn.
   */
  result: NinesResult;
  /** Spillerinfo per userId for å rendre navn + kallenavn. */
  playersById: Map<string, NinesPlayerInfo>;
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
 * Del-poeng med én desimal i webbens språk. Regelen (hele tall rent) bor i
 * `ninesPointsText`.
 */
function oneDecimal(points: number, locale: AppLocale): string {
  return formatNumber(points, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/**
 * Format-bevisst «Hull for hull» for Nines / Split Sixes (epic #496, PR 3).
 * Erstatter det generiske best-ball lag-scorekortet med en Nines-riktig
 * per-hull-visning grunnet i formatet: hver spillers plassering på hullet
 * (lavest score vinner flest poeng), brutto/netto-score, og poengene fra
 * potten — det NinesView sin kompakte PER HULL (kun poeng-tall) mangler.
 *
 * Regnestykket (plassen, rekkefølgen, lederen, potten, poengene og brutto ved
 * siden av) bor i `lib/leaderboard/ninesHoles.ts`, delt med appen (#2255 PR
 * 3c). Her tegnes det.
 */
export function NinesHolesView({
  gameId,
  gameName,
  result,
  playersById,
  scoreVisibility,
  gameStatus,
  navContext,
}: NinesHolesViewProps): JSX.Element {
  const t = useTranslations('leaderboard');
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
          data-testid="nines-holes-reveal-hidden"
          className="mx-4 mt-12 rounded-2xl border border-dashed border-border bg-surface px-5 py-8 text-center"
        >
          <p className="font-serif text-[18px] font-medium text-text">
            {t('common.revealHiddenTitle')}
          </p>
          <p className="mt-2 font-sans text-xs text-muted">
            {t('common.hullForHullRevealSub')}
          </p>
        </div>
        <PullQuote className="px-6 pt-4 pb-4">{t('common.goodLuck')}</PullQuote>
      </LeaderboardShell>
    );
  }

  const cards = ninesHoleCards(result);

  return (
    <LeaderboardShell>
      <LeaderboardHeader
        gameName={gameName}
        backHref={navContext?.from ?? `/games/${gameId}`}
      />

      <div className="px-6 pt-1.5 pb-3.5 text-center">
        <h1 className="font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          {t('common.hullForHullHeading')}
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          {t(`nines.${cards.variantKey}`)} · {t(`common.${cards.scoringKey}`)}
        </p>
      </div>

      <ul
        data-testid="nines-holes-list"
        className="flex flex-col gap-2.5 px-3.5 pt-1 pb-3.5 list-none"
      >
        {cards.holes.map((hole) => (
          <HoleCard key={hole.holeNumber} hole={hole} playersById={playersById} />
        ))}
      </ul>

      <LeaderboardFooter gameStatus={gameStatus} className="px-6 pt-1 pb-4" />
    </LeaderboardShell>
  );
}

function HoleCard({
  hole,
  playersById,
}: {
  hole: NinesHoleCard;
  playersById: Map<string, NinesPlayerInfo>;
}) {
  const t = useTranslations('leaderboard');
  const tc = useTranslations('leaderboard.common');
  const locale = useLocale();

  return (
    <li className="list-none" data-testid={`nines-holes-card-${hole.holeNumber}`}>
      <Card className="px-3.5 py-3">
        {/* Hode: hull + par/SI venstre, pott / pending-status høyre */}
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-[15px] font-medium tabular-nums text-text">
              {t('common.hullNumber', { number: hole.holeNumber })}
            </span>
            <span className="text-[10.5px] tabular-nums text-muted">
              {tc('parSiChip', { par: hole.par, si: hole.strokeIndex })}
            </span>
          </div>
          {hole.pot == null ? (
            <span className="text-[10.5px] text-muted">{t('nines.ventePaaScore')}</span>
          ) : (
            <span className="rounded-full border border-accent/40 bg-accent/[0.08] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-accent-text tabular-nums">
              {t('nines.potLabel', { pot: hole.pot })}
            </span>
          )}
        </div>

        {/* Per-spiller: plassering, score, poeng — det NinesView mangler */}
        <ul className="mt-2 flex flex-col gap-1 list-none">
          {hole.rows.map((cell) => {
            const info = playersById.get(cell.userId);
            const name = info
              ? formatRevealName(info.name, info.nickname)
              : t('common.unknownPlayerFull');
            const { placement, isLeader } = cell;

            return (
              <li
                key={cell.userId}
                className={`flex items-center justify-between gap-3 rounded-xl px-2.5 py-1.5 ${
                  isLeader
                    ? 'border border-accent/40 bg-accent/[0.06]'
                    : 'border border-transparent'
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold tabular-nums ${
                      placement == null
                        ? 'border border-dashed border-border text-muted/50'
                        : isLeader
                          ? 'border border-accent bg-accent/[0.12] text-accent-text'
                          : 'border border-border text-muted'
                    }`}
                  >
                    {placement ?? '–'}
                  </span>
                  <span
                    className={`truncate font-sans text-[14px] ${
                      isLeader ? 'font-semibold text-text' : 'text-text'
                    }`}
                  >
                    {name}
                  </span>
                </span>
                <span className="flex shrink-0 items-baseline gap-1.5 tabular-nums">
                  {cell.pointsShown != null && (
                    <span className="text-[12px] font-semibold text-accent-text">
                      +{ninesPointsText(cell.pointsShown, (n) => oneDecimal(n, locale))}
                    </span>
                  )}
                  {cell.grossShown != null && (
                    <span className="text-[10.5px] text-muted">
                      {t('nines.bruttoLabel', { gross: cell.grossShown })}
                    </span>
                  )}
                  <span
                    className={`score-num text-[18px] leading-none ${
                      isLeader ? 'text-accent-text' : 'text-text'
                    }`}
                  >
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
