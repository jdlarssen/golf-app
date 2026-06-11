import type { JSX } from 'react';
import { useTranslations } from 'next-intl';
import { SmartLink } from '@/components/ui/SmartLink';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { LeaderboardBackdrop } from '@/components/illustrations/LeaderboardBackdrop';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type { SkinsResult, SkinsHoleRow } from '@/lib/scoring/modes/types';
import type { SkinsPlayerInfo } from '../SkinsView';

export interface SkinsHolesViewProps {
  /** Spill-id — brukes til back-lenke. */
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
  /** `games.score_visibility` normalisert. Styrer reveal-flow. */
  scoreVisibility: 'live' | 'reveal';
  /** `games.status` — styrer reveal-flow sammen med `scoreVisibility`. */
  gameStatus: 'active' | 'finished';
}

/**
 * Format-bevisst «Hull for hull» for Skins (epic #496). Erstatter det generiske
 * best-ball lag-scorekortet (som aldri forgrenet på `game_mode`) med en
 * Skins-riktig per-hull-visning: hver spillers score på hullet, hvem som vant
 * skinen, carryover-kjeden og hengende pott.
 *
 * Rikere enn SkinsView sin kompakte PER HULL-seksjon: den viser også hver
 * spillers score per hull (`perPlayer`), ikke bare utfallet.
 */
export function SkinsHolesView({
  gameId,
  gameName,
  result,
  playersById,
  scoreVisibility,
  gameStatus,
}: SkinsHolesViewProps): JSX.Element {
  const t = useTranslations('leaderboard');
  const tc = useTranslations('leaderboard.common');

  const isRevealHidden =
    scoreVisibility === 'reveal' && gameStatus !== 'finished';

  if (isRevealHidden) {
    return (
      <Shell>
        <Header gameName={gameName} gameId={gameId} />
        <div
          data-testid="skins-holes-reveal-hidden"
          className="mx-4 mt-12 rounded-2xl border border-dashed border-border bg-surface px-5 py-8 text-center"
        >
          <p className="font-serif text-[18px] font-medium text-text">
            {tc('revealHiddenTitle')}
          </p>
          <p className="mt-2 font-sans text-xs text-muted">
            {tc('hullForHullRevealSub')}
          </p>
        </div>
        <PullQuote className="px-6 pt-4 pb-4">{tc('goodLuck')}</PullQuote>
      </Shell>
    );
  }

  const subtitleParts = [
    'Skins',
    result.scoring === 'net' ? tc('netto') : tc('brutto'),
  ];

  return (
    <Shell>
      <Header gameName={gameName} gameId={gameId} />

      <div className="px-6 pt-1.5 pb-3.5 text-center">
        <h1 className="font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          {tc('hullForHullHeading')}
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          {subtitleParts.join(' · ')}
        </p>
      </div>

      <ul
        data-testid="skins-holes-list"
        className="flex flex-col gap-2.5 px-3.5 pt-1 pb-3.5 list-none"
      >
        {result.holes.map((hole) => (
          <HoleCard
            key={hole.holeNumber}
            hole={hole}
            scoring={result.scoring}
            playersById={playersById}
            t={t}
            tc={tc}
          />
        ))}
      </ul>

      {result.carriedPot > 0 && (
        <div
          data-testid="skins-holes-unwon"
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

      <PullQuote className="px-6 pt-1 pb-4">{tc('wellPlayed')}</PullQuote>
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

function Header({
  gameName,
  gameId,
}: {
  gameName: string;
  gameId: string;
}) {
  return (
    <header className="mb-2 flex items-center justify-between gap-4">
      <SmartLink
        href={`/games/${gameId}`}
        aria-label="Tilbake"
        className="-ml-2 inline-flex h-11 w-11 items-center justify-center text-lg text-text"
      >
        ‹
      </SmartLink>
      <Kicker tone="accent">{gameName.toUpperCase()}</Kicker>
      <span className="w-11" aria-hidden />
    </header>
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

function HoleCard({
  hole,
  scoring,
  playersById,
  t,
  tc,
}: {
  hole: SkinsHoleRow;
  scoring: SkinsResult['scoring'];
  playersById: Map<string, SkinsPlayerInfo>;
  t: ReturnType<typeof useTranslations>;
  tc: ReturnType<typeof useTranslations>;
}) {
  const atStakeLabel = t('skins.atStakeLabel', { count: hole.atStake });

  return (
    <li className="list-none" data-testid={`skins-holes-card-${hole.holeNumber}`}>
      <Card className="px-3.5 py-3">
        {/* Hode: hull + par/SI venstre, pott på spill høyre */}
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-[15px] font-medium tabular-nums text-text">
              Hull {hole.holeNumber}
            </span>
            <span className="text-[10.5px] tabular-nums text-muted">
              Par {hole.par} · SI {hole.strokeIndex}
            </span>
          </div>
          <span
            className={`text-[10.5px] tabular-nums font-medium ${
              hole.atStake > 1 ? 'text-accent' : 'text-muted'
            }`}
          >
            {atStakeLabel}
          </span>
        </div>

        {/* Per-spiller-scorer — det SkinsView ikke viser. */}
        <ul className="mt-2 flex flex-col gap-1 list-none">
          {hole.perPlayer.map((cell) => {
            const info = playersById.get(cell.userId);
            const displayName = info
              ? formatRevealName(info.name, info.nickname)
              : '(ukjent spiller)';
            const isSkinWinner = hole.outcome === 'won' && cell.isWinner;
            const isLowTied = hole.outcome === 'carryover' && cell.isWinner;
            const showGross =
              scoring === 'net' &&
              cell.gross != null &&
              cell.gross !== cell.effectiveScore;

            return (
              <li
                key={cell.userId}
                className={`flex items-center justify-between gap-3 rounded-xl px-2.5 py-1.5 ${
                  isSkinWinner
                    ? 'border border-accent bg-accent/[0.07]'
                    : 'border border-transparent'
                }`}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {isSkinWinner && (
                    <span aria-hidden className="text-[11px] text-accent">
                      ★
                    </span>
                  )}
                  <span
                    className={`truncate font-sans text-[14px] ${
                      isSkinWinner
                        ? 'font-semibold text-text'
                        : isLowTied
                          ? 'font-medium text-text'
                          : 'text-muted'
                    }`}
                  >
                    {displayName}
                  </span>
                </span>
                <span className="flex shrink-0 items-baseline gap-1.5 tabular-nums">
                  {showGross && (
                    <span className="text-[10.5px] text-muted/70">
                      {tc('grossBrutto', { count: cell.gross ?? 0 })}
                    </span>
                  )}
                  <span
                    className={`score-num text-[18px] leading-none ${
                      isSkinWinner ? 'text-accent' : 'text-text'
                    }`}
                  >
                    {cell.effectiveScore ?? '–'}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>

        {/* Utfall + carryover-kjede */}
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px]">
          <span className={`font-medium ${outcomeClass(hole.outcome)}`}>
            {hole.outcome === 'won'
              ? `+${hole.skinsAwarded} ${t('skins.skinLabel', { count: hole.skinsAwarded })}`
              : hole.outcome === 'carryover'
                ? t('skins.drattVidere')
                : t('skins.outcomePending')}
          </span>
          {hole.carriedIn > 0 && (
            <>
              <span aria-hidden className="text-muted/40">
                ·
              </span>
              <span className="tabular-nums text-muted/70">
                {t('skins.carriedInLabel', { count: hole.carriedIn })}
              </span>
            </>
          )}
        </div>
      </Card>
    </li>
  );
}
