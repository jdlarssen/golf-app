import type { JSX } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { PullQuote } from '@/components/ui/PullQuote';
import { LeaderboardShell, LeaderboardHeader } from '../LeaderboardChrome';
import type { LeaderboardNavContext } from '@/lib/leaderboard/navContext';
import { LeaderboardFooter } from '../LeaderboardFooter';
import { formatRevealName } from '@/lib/names/formatRevealName';
import { aceyDeuceyHoleCards, type AceyDeuceyHoleCard } from '@/lib/leaderboard/aceyDeuceyHoles';
import type { AceyDeuceyResult } from '@/lib/scoring/modes/types';
import type { AceyDeuceyPlayerInfo } from '../AceyDeuceyView';

export interface AceyDeuceyHolesViewProps {
  /** Spill-id — brukes til back-lenke. */
  gameId: string;
  /** Turneringsnavn — vises som kicker i header. */
  gameName: string;
  /**
   * Resultat fra `lib/scoring/modes/aceyDeucey.compute()`.
   * Caller må narrowe på `kind === 'acey_deucey'` før propen sendes inn.
   */
  result: AceyDeuceyResult;
  /** Spillerinfo per userId for å rendre navn + kallenavn. */
  playersById: Map<string, AceyDeuceyPlayerInfo>;
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
 * Format-bevisst «Hull for hull» for Acey-Deucey (epic #496, PR 5). Erstatter
 * det generiske best-ball lag-scorekortet med en Acey-Deucey-riktig per-hull-
 * visning: alle fire spillere rangert på score, med ace (unik lavest, +3)
 * uthevet i champagne og deuce (unik høyest, −3) i en kald markering — det
 * AceyDeuceyView sin kompakte PER HULL (kun ace/deuce-navn) mangler.
 *
 * Regnestykket (rekkefølgen, ace/deuce/nøytral, poengene med fortegn og brutto
 * ved siden av) bor i `lib/leaderboard/aceyDeuceyHoles.ts`, delt med appen
 * (#2255 PR 3c). Her tegnes det.
 */
export function AceyDeuceyHolesView({
  gameId,
  gameName,
  result,
  playersById,
  scoreVisibility,
  gameStatus,
  navContext,
}: AceyDeuceyHolesViewProps): JSX.Element {
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
          data-testid="acey-deucey-holes-reveal-hidden"
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

  const cards = aceyDeuceyHoleCards(result);

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
          Acey Deucey · {t(`common.${cards.scoringKey}`)}
        </p>
      </div>

      <ul
        data-testid="acey-deucey-holes-list"
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
  hole: AceyDeuceyHoleCard;
  playersById: Map<string, AceyDeuceyPlayerInfo>;
}) {
  const t = useTranslations('leaderboard');
  const tc = useTranslations('leaderboard.common');

  return (
    <li
      className="list-none"
      data-testid={`acey-deucey-holes-card-${hole.holeNumber}`}
    >
      <Card className="px-3.5 py-3">
        {/* Hode: hull + par/SI venstre, venter-status høyre */}
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-[15px] font-medium tabular-nums text-text">
              {t('common.hullNumber', { number: hole.holeNumber })}
            </span>
            <span className="text-[10.5px] tabular-nums text-muted">
              {tc('parSiChip', { par: hole.par, si: hole.strokeIndex })}
            </span>
          </div>
          {!hole.scored && (
            <span className="text-[10.5px] text-muted">{t('common.venter')}</span>
          )}
        </div>

        {/* Per-spiller: score + ace/deuce-markering + poeng. */}
        <ul className="mt-2 flex flex-col gap-1 list-none">
          {hole.rows.map((cell) => {
            const info = playersById.get(cell.userId);
            const name = info
              ? formatRevealName(info.name, info.nickname)
              : t('common.unknownPlayerFull');
            const isAce = cell.tone === 'ace';
            const isDeuce = cell.tone === 'deuce';

            // Ace = varm champagne-glød. Deuce = kald, dempet ramme. Midten nøytral.
            const rowClass = isAce
              ? 'border border-accent/40 bg-accent/[0.06]'
              : isDeuce
                ? 'border border-border bg-surface-2'
                : 'border border-transparent';

            return (
              <li
                key={cell.userId}
                className={`flex items-center justify-between gap-3 rounded-xl px-2.5 py-1.5 ${rowClass}`}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {isAce && (
                    <span aria-hidden className="text-[11px] text-accent">
                      ★
                    </span>
                  )}
                  <span
                    className={`truncate font-sans text-[14px] ${
                      isAce ? 'font-medium text-text' : 'text-text'
                    }`}
                  >
                    {name}
                  </span>
                </span>
                <span className="flex shrink-0 items-baseline gap-1.5 tabular-nums">
                  {cell.pointsText != null && (
                    <span
                      className={`text-[12px] font-semibold ${
                        isAce
                          ? 'text-accent-text'
                          : isDeuce
                            ? 'text-muted'
                            : 'text-muted/40'
                      }`}
                    >
                      {cell.pointsText}
                    </span>
                  )}
                  {cell.grossShown != null && (
                    <span className="text-[10.5px] text-muted">
                      {t('aceyDeucey.bruttoLabel', { gross: cell.grossShown })}
                    </span>
                  )}
                  <span
                    className={`score-num text-[18px] leading-none ${
                      isAce ? 'text-accent-text' : isDeuce ? 'text-muted' : 'text-text'
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
