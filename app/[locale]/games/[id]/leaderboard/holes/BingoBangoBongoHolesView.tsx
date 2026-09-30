import type { JSX } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { PullQuote } from '@/components/ui/PullQuote';
import { LeaderboardShell, LeaderboardHeader } from '../LeaderboardChrome';
import type { LeaderboardNavContext } from '@/lib/leaderboard/navContext';
import { LeaderboardFooter } from '../LeaderboardFooter';
import { formatRevealName } from '@/lib/names/formatRevealName';
import {
  bingoBangoBongoHoleCards,
  type BingoBangoBongoCategory,
  type BingoBangoBongoHoleCard,
} from '@/lib/leaderboard/bingoBangoBongoHoles';
import type { BingoBangoBongoResult } from '@/lib/scoring/modes/types';
import type { BingoBangoBongoPlayerInfo } from '../BingoBangoBongoView';

export interface BingoBangoBongoHolesViewProps {
  /** Spill-id — brukes til back-lenke. */
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
 * Format-bevisst «Hull for hull» for Bingo Bango Bongo (epic #496, PR 6).
 * Erstatter det generiske best-ball lag-scorekortet med en BBB-riktig per-hull-
 * visning. BBB teller ikke slag — poeng deles ut for tre prestasjoner per hull
 * (Bingo / Bango / Bongo). Hvert hull-kort viser de tre prestasjonene og hvem
 * som tok dem (eller «ikke satt»). Dette er eneste sted per-hull-data vises —
 * BingoBangoBongoView (leaderboardet) har kun en aggregert per-spiller-tabell.
 *
 * Regnestykket (prestasjonene i fast rekkefølge, hvem som tok dem, feieren,
 * «Feiet!» og hull som venter) bor i `lib/leaderboard/bingoBangoBongoHoles.ts`,
 * delt med appen (#2255 PR 3c). Her tegnes det.
 */
export function BingoBangoBongoHolesView({
  gameId,
  gameName,
  result,
  playersById,
  scoreVisibility,
  gameStatus,
  navContext,
}: BingoBangoBongoHolesViewProps): JSX.Element {
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
          data-testid="bbb-holes-reveal-hidden"
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

  const cards = bingoBangoBongoHoleCards(result);

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
          {t('bingoBangoBongo.holesSubtitle')}
        </p>
      </div>

      <ul
        data-testid="bbb-holes-list"
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

/** Navnene på prestasjonene, hardkodet. Hintet under er en katalognøkkel fra modellen. */
const CATEGORY_LABEL: Record<BingoBangoBongoCategory, string> = {
  bingo: 'Bingo',
  bango: 'Bango',
  bongo: 'Bongo',
};

function HoleCard({
  hole,
  playersById,
}: {
  hole: BingoBangoBongoHoleCard;
  playersById: Map<string, BingoBangoBongoPlayerInfo>;
}) {
  const t = useTranslations('leaderboard');

  const nameFor = (uid: string): string => {
    const info = playersById.get(uid);
    return info ? formatRevealName(info.name, info.nickname) : t('common.unknownPlayerFull');
  };

  return (
    <li
      className="list-none"
      data-testid={`bbb-holes-card-${hole.holeNumber}`}
    >
      <Card className="px-3.5 py-3">
        {/* Hode: hull-nummer venstre, Venter/Feiet høyre */}
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-serif text-[15px] font-medium tabular-nums text-text">
            {t('common.hullNumber', { number: hole.holeNumber })}
          </span>
          {hole.sweptAll ? (
            <span className="rounded-full border border-accent/40 bg-accent/[0.08] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-accent-text">
              {t('bingoBangoBongo.feietChip')}
            </span>
          ) : hole.pending ? (
            <span className="text-[11px] uppercase tracking-[0.1em] text-muted">
              {t('common.venter')}
            </span>
          ) : null}
        </div>

        {hole.pending ? (
          <p className="mt-1.5 text-[12.5px] text-muted">
            {t('bingoBangoBongo.ingenPrestasjoner')}
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 list-none">
            {hole.rows.map((row) => {
              const uid = row.userId;
              const isSweeper = row.isSweeper;
              return (
                <li
                  key={row.category}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    <span className="font-serif text-[13.5px] font-medium text-text">
                      {CATEGORY_LABEL[row.category]}
                    </span>
                    <span className="truncate text-[10.5px] text-muted">
                      {t(`bingoBangoBongo.${row.hintKey}`)}
                    </span>
                  </span>
                  {uid ? (
                    <span
                      className={`flex shrink-0 items-center gap-1 text-[14px] ${
                        isSweeper
                          ? 'font-semibold text-accent-text'
                          : 'font-sans text-text'
                      }`}
                    >
                      {isSweeper && (
                        <span aria-hidden className="text-[11px]">
                          ★
                        </span>
                      )}
                      {nameFor(uid)}
                    </span>
                  ) : (
                    <span className="shrink-0 text-[12.5px] text-muted">
                      {t('bingoBangoBongo.ikkeSatt')}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </li>
  );
}
