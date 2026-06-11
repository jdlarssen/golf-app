import type { JSX } from 'react';
import { useTranslations } from 'next-intl';
import { SmartLink } from '@/components/ui/SmartLink';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { LeaderboardBackdrop } from '@/components/illustrations/LeaderboardBackdrop';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type { NinesResult, NinesHoleRow } from '@/lib/scoring/modes/types';
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
}

/** Total pott per hull etter variant: Nines = 9 (5/3/1), Split Sixes = 6 (4/2/0). */
function potTotal(variant: NinesResult['variant']): number {
  return variant === 'split_sixes' ? 6 : 9;
}

/** Poeng-formatering: hele tall vises rent, evt. del-poeng med én desimal. */
function formatPoints(points: number): string {
  return Number.isInteger(points) ? String(points) : points.toFixed(1);
}

/**
 * Format-bevisst «Hull for hull» for Nines / Split Sixes (epic #496, PR 3).
 * Erstatter det generiske best-ball lag-scorekortet med en Nines-riktig
 * per-hull-visning grunnet i formatet: hver spillers plassering på hullet
 * (lavest score vinner flest poeng), brutto/netto-score, og poengene fra
 * potten — det NinesView sin kompakte PER HULL (kun poeng-tall) mangler.
 */
export function NinesHolesView({
  gameId,
  gameName,
  result,
  playersById,
  scoreVisibility,
  gameStatus,
}: NinesHolesViewProps): JSX.Element {
  const t = useTranslations('leaderboard');
  const isRevealHidden =
    scoreVisibility === 'reveal' && gameStatus !== 'finished';

  if (isRevealHidden) {
    return (
      <Shell>
        <Header gameName={gameName} gameId={gameId} />
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
      </Shell>
    );
  }

  const variantLabel =
    result.variant === 'split_sixes' ? t('nines.variantSplitSixes') : t('nines.variantNines');

  return (
    <Shell>
      <Header gameName={gameName} gameId={gameId} />

      <div className="px-6 pt-1.5 pb-3.5 text-center">
        <h1 className="font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          {t('common.hullForHullHeading')}
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          {variantLabel} · {result.scoring === 'net' ? t('common.netto') : t('common.brutto')}
        </p>
      </div>

      <ul
        data-testid="nines-holes-list"
        className="flex flex-col gap-2.5 px-3.5 pt-1 pb-3.5 list-none"
      >
        {result.holes.map((hole) => (
          <HoleCard
            key={hole.holeNumber}
            hole={hole}
            variant={result.variant}
            scoring={result.scoring}
            playersById={playersById}
          />
        ))}
      </ul>

      <PullQuote className="px-6 pt-1 pb-4">{t('common.wellPlayed')}</PullQuote>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <div className="relative isolate pb-12">
        <LeaderboardBackdrop />
        <div className="relative">{children}</div>
      </div>
    </AppShell>
  );
}

function Header({ gameName, gameId }: { gameName: string; gameId: string }) {
  const t = useTranslations('leaderboard');
  return (
    <header className="mb-2 flex items-center justify-between gap-4">
      <SmartLink
        href={`/games/${gameId}`}
        aria-label={t('common.backAriaLabel')}
        className="-ml-2 inline-flex h-11 w-11 items-center justify-center text-lg text-text"
      >
        ‹
      </SmartLink>
      <Kicker tone="accent">{gameName.toUpperCase()}</Kicker>
      <span className="w-11" aria-hidden />
    </header>
  );
}

/**
 * Plassering per spiller på hullet (competition ranking). Spillerne sorteres
 * på effectiveScore ASC; en gruppe med EKSAKT lik score på sorterte posisjoner
 * [i..j-1] deler plassering i+1. Stemmer per konstruksjon med poeng-fordelingen
 * (begge utledes av effectiveScore-rangeringen). Pending/manglende score → ikke
 * plassert.
 */
function placementByPlayer(hole: NinesHoleRow): Map<string, number> {
  // Pending hull deler ikke ut poeng (uavhengig per hull), så ingen spiller
  // plasseres — heller ikke en som tilfeldigvis har tastet før de andre.
  // Ellers ville et delvis scoret hull kåre en for tidlig leder.
  if (hole.pending) return new Map();

  const ranked = hole.perPlayer
    .filter((c) => c.effectiveScore != null)
    .sort((a, b) => (a.effectiveScore as number) - (b.effectiveScore as number));

  const placements = new Map<string, number>();
  let i = 0;
  while (i < ranked.length) {
    const groupScore = ranked[i]!.effectiveScore as number;
    let j = i;
    while (
      j < ranked.length &&
      (ranked[j]!.effectiveScore as number) === groupScore
    ) {
      j++;
    }
    for (let k = i; k < j; k++) {
      placements.set(ranked[k]!.userId, i + 1);
    }
    i = j;
  }
  return placements;
}

function HoleCard({
  hole,
  variant,
  scoring,
  playersById,
}: {
  hole: NinesHoleRow;
  variant: NinesResult['variant'];
  scoring: NinesResult['scoring'];
  playersById: Map<string, NinesPlayerInfo>;
}) {
  const t = useTranslations('leaderboard');
  const placements = placementByPlayer(hole);

  // Best score øverst (lavest effective = flest poeng). Pending/manglende
  // (ingen plassering) faller bakerst, i opprinnelig rekkefølge.
  const rows = [...hole.perPlayer].sort((a, b) => {
    const pa = placements.get(a.userId);
    const pb = placements.get(b.userId);
    if (pa == null && pb == null) return 0;
    if (pa == null) return 1;
    if (pb == null) return -1;
    return pa - pb;
  });

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
              Par {hole.par} · SI {hole.strokeIndex}
            </span>
          </div>
          {hole.pending ? (
            <span className="text-[10.5px] text-muted/70">{t('nines.ventePaaScore')}</span>
          ) : (
            <span className="rounded-full border border-accent/40 bg-accent/[0.08] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-accent tabular-nums">
              {t('nines.potLabel', { pot: potTotal(variant) })}
            </span>
          )}
        </div>

        {/* Per-spiller: plassering, score, poeng — det NinesView mangler */}
        <ul className="mt-2 flex flex-col gap-1 list-none">
          {rows.map((cell) => {
            const info = playersById.get(cell.userId);
            const name = info
              ? formatRevealName(info.name, info.nickname)
              : t('common.unknownPlayerFull');
            const placement = placements.get(cell.userId) ?? null;
            const isLeader = placement === 1;
            const pts = hole.pointsByPlayer[cell.userId] ?? 0;
            const showGross =
              scoring === 'net' &&
              cell.gross != null &&
              cell.gross !== cell.effectiveScore;

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
                          ? 'border border-accent bg-accent/[0.12] text-accent'
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
                  {pts > 0 && (
                    <span className="text-[12px] font-semibold text-accent">
                      +{formatPoints(pts)}
                    </span>
                  )}
                  {showGross && cell.gross != null && (
                    <span className="text-[10.5px] text-muted/70">
                      {t('nines.bruttoLabel', { gross: cell.gross })}
                    </span>
                  )}
                  <span
                    className={`score-num text-[18px] leading-none ${
                      isLeader ? 'text-accent' : 'text-text'
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
