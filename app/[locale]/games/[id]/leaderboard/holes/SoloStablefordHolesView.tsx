import type { JSX } from 'react';
import { useTranslations } from 'next-intl';
import { SmartLink } from '@/components/ui/SmartLink';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { LeaderboardBackdrop } from '@/components/illustrations/LeaderboardBackdrop';
import { ScoreShape } from '@/components/scoring/ScoreShape';
import { scoreShape } from '@/lib/scoring/scoreShape';
import { scoreTone } from '@/lib/scoring/scoreTone';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type {
  StablefordSoloResult,
  StablefordSoloHoleRow,
} from '@/lib/scoring/modes/types';
import type { SoloStablefordPlayerInfo } from '../SoloStablefordView';

export interface SoloStablefordHolesViewProps {
  /** Spill-id — brukes til back-lenke. */
  gameId: string;
  /** Turneringsnavn — vises som kicker i header. */
  gameName: string;
  /**
   * Solo-resultat fra `lib/scoring/modes/stableford.compute()` (eller modified).
   * Caller må narrowe på `kind === 'stableford' && variant === 'solo'`.
   */
  result: StablefordSoloResult;
  /** Spillerinfo per userId for å rendre navn + kallenavn. */
  playersById: Map<string, SoloStablefordPlayerInfo>;
  /** Format-etikett: «Stableford» eller «Modifisert Stableford». */
  formatLabel: string;
  /** `games.score_visibility` normalisert. Styrer reveal-flow. */
  scoreVisibility: 'live' | 'reveal';
  /** `games.status` — styrer reveal-flow sammen med `scoreVisibility`. */
  gameStatus: 'active' | 'finished';
}

/** Poeng-format: negative med U+2212-minus (modified kan gi −1/−3). */
function formatPoints(points: number): string {
  return points < 0 ? `−${Math.abs(points)}` : String(points);
}

/**
 * Format-bevisst «Hull for hull» for solo stableford / modified stableford
 * (epic #496, PR 9). Erstatter det generiske best-ball «Lag N»-scorekortet med
 * et klassisk per-spiller stableford-scorekort: rangert stillings-header
 * (poeng), så Ut/Inn-bolker med per-hull-kort (brutto-shape → poeng per spiller,
 * sortert HØYEST poeng først, hull-vinner i champagne) og en poeng-subtotal per
 * ni. Modified-poeng kan være negative.
 */
export function SoloStablefordHolesView({
  gameId,
  gameName,
  result,
  playersById,
  formatLabel,
  scoreVisibility,
  gameStatus,
}: SoloStablefordHolesViewProps): JSX.Element {
  const t = useTranslations('leaderboard');
  const isRevealHidden =
    scoreVisibility === 'reveal' && gameStatus !== 'finished';

  if (isRevealHidden) {
    return (
      <Shell>
        <Header gameName={gameName} gameId={gameId} />
        <div
          data-testid="solo-stableford-holes-reveal-hidden"
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

  const rankedIds = result.players.map((p) => p.userId);
  const frontHoles = result.holes.filter((h) => h.holeNumber <= 9);
  const backHoles = result.holes.filter((h) => h.holeNumber >= 10);

  return (
    <Shell>
      <Header gameName={gameName} gameId={gameId} />

      <div className="px-6 pt-1.5 pb-3.5 text-center">
        <h1 className="font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          {t('common.hullForHullHeading')}
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">{formatLabel}</p>
      </div>

      <TotalsHeader result={result} playersById={playersById} />

      <div className="flex flex-col gap-6 px-3.5 pt-4 pb-3.5">
        <NineBlock
          testId="solo-stableford-holes-front9"
          heading="Ut"
          subheading="Hull 1–9"
          holes={frontHoles}
          rankedIds={rankedIds}
          playersById={playersById}
        />
        <NineBlock
          testId="solo-stableford-holes-back9"
          heading="Inn"
          subheading="Hull 10–18"
          holes={backHoles}
          rankedIds={rankedIds}
          playersById={playersById}
        />
      </div>

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
 * Rangert stillings-header (løpende poeng): per spiller poeng-total stort,
 * hull-spilt smått, leder i champagne. Reflekterer `result.players` (allerede
 * rank-sortert høyest poeng først).
 */
function TotalsHeader({
  result,
  playersById,
}: {
  result: StablefordSoloResult;
  playersById: Map<string, SoloStablefordPlayerInfo>;
}) {
  const t = useTranslations('leaderboard');
  return (
    <div className="px-3.5">
      <Card className="flex flex-col gap-2 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
          {t('common.stillingen')}
        </p>
        <ul
          data-testid="solo-stableford-holes-totals"
          className="flex flex-col gap-1.5 list-none"
        >
          {result.players.map((line) => {
            const info = playersById.get(line.userId);
            const name = info
              ? formatRevealName(info.name, info.nickname)
              : t('common.unknownPlayerFull');
            const isLeader = line.rank === 1 && line.tiedWith.length === 0;
            return (
              <li
                key={line.userId}
                className="flex items-center justify-between gap-3"
              >
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="w-4 shrink-0 text-[12px] tabular-nums text-muted">
                    {line.rank}
                  </span>
                  <span
                    className={`min-w-0 truncate font-sans text-[14px] ${
                      isLeader ? 'font-medium text-text' : 'text-text'
                    }`}
                  >
                    {name}
                  </span>
                </span>
                <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                  <span className="text-[10.5px] text-muted/70">
                    {t('common.hullChip', { count: line.holesPlayed })}
                  </span>
                  <span
                    className={`score-num text-[20px] leading-none ${
                      isLeader ? 'text-accent' : 'text-text'
                    }`}
                  >
                    {formatPoints(line.totalPoints)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

/**
 * Én ni (Ut / Inn): heading + poeng-subtotal-stripe per spiller + per-hull-kort.
 */
function NineBlock({
  testId,
  heading,
  subheading,
  holes,
  rankedIds,
  playersById,
}: {
  testId: string;
  heading: string;
  subheading: string;
  holes: StablefordSoloHoleRow[];
  rankedIds: string[];
  playersById: Map<string, SoloStablefordPlayerInfo>;
}) {
  return (
    <section data-testid={testId} className="flex flex-col gap-2.5">
      <header className="flex items-baseline justify-between gap-3 px-1">
        <h2 className="font-serif text-[19px] font-medium tracking-[-0.01em] text-text">
          {heading}
        </h2>
        <p className="text-[11px] tabular-nums text-muted">{subheading}</p>
      </header>

      <SubtotalStrip
        holes={holes}
        rankedIds={rankedIds}
        playersById={playersById}
      />

      <ul className="flex flex-col gap-2 list-none">
        {holes.map((hole) => (
          <HoleCard key={hole.holeNumber} hole={hole} playersById={playersById} />
        ))}
      </ul>
    </section>
  );
}

/**
 * Poeng-subtotal for nien per spiller, leder (HØYEST poeng) i champagne.
 * «Løpende poeng» ved Ut/Inn-bruddet.
 */
function SubtotalStrip({
  holes,
  rankedIds,
  playersById,
}: {
  holes: StablefordSoloHoleRow[];
  rankedIds: string[];
  playersById: Map<string, SoloStablefordPlayerInfo>;
}) {
  const t = useTranslations('leaderboard');
  // Poeng-sum per spiller for nien (kun spilte hull). null = ingen spilte.
  const sums = new Map<string, number | null>();
  for (const id of rankedIds) {
    let sum = 0;
    let played = 0;
    for (const hole of holes) {
      const cell = hole.perPlayer.find((c) => c.userId === id);
      if (cell && cell.gross != null) {
        sum += cell.points;
        played += 1;
      }
    }
    sums.set(id, played > 0 ? sum : null);
  }
  const playedSums = [...sums.values()].filter((v): v is number => v != null);
  const leaderSum = playedSums.length > 0 ? Math.max(...playedSums) : null;

  return (
    <ul
      data-testid="solo-stableford-holes-subtotal"
      className="flex flex-wrap gap-1.5 px-1 list-none"
    >
      {rankedIds.map((id) => {
        const info = playersById.get(id);
        const name = info ? formatRevealName(info.name, info.nickname) : t('common.unknownPlayer');
        const sum = sums.get(id) ?? null;
        const isLeader = sum != null && sum === leaderSum;
        return (
          <li
            key={id}
            className={`inline-flex items-baseline gap-1.5 rounded-full px-2.5 py-1 text-[12px] ${
              isLeader
                ? 'border border-accent/40 bg-accent/[0.06] text-accent'
                : 'border border-border bg-surface text-muted'
            }`}
          >
            <span className="max-w-[7rem] truncate font-sans">{name}</span>
            <span className="score-num tabular-nums">
              {sum == null ? '–' : formatPoints(sum)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Ett hull: hull/par/SI + per spiller brutto-shape → poeng (sortert HØYEST
 * poeng først). En entydig hull-vinner (høyest poeng) uthevet i champagne med
 * ★; delt høyest = nøytralt (som duell-strippens «delt»). Uspilte sorteres sist
 * og viser «–». Hull der ingen har spilt viser «Venter».
 */
function HoleCard({
  hole,
  playersById,
}: {
  hole: StablefordSoloHoleRow;
  playersById: Map<string, SoloStablefordPlayerInfo>;
}) {
  const t = useTranslations('leaderboard');
  const scored = hole.bestUserIds.length > 0;
  const uniqueWinnerId =
    hole.bestUserIds.length === 1 ? hole.bestUserIds[0] : null;
  // Sorter høyest poeng først; uspilte (gross null) sist.
  const rows = [...hole.perPlayer].sort((a, b) => {
    if (a.gross == null && b.gross == null) return 0;
    if (a.gross == null) return 1;
    if (b.gross == null) return -1;
    return b.points - a.points;
  });

  return (
    <li
      className="list-none"
      data-testid={`solo-stableford-holes-card-${hole.holeNumber}`}
    >
      <Card className="px-3.5 py-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-[15px] font-medium tabular-nums text-text">
              Hull {hole.holeNumber}
            </span>
            <span className="text-[10.5px] tabular-nums text-muted">
              Par {hole.par} · SI {hole.strokeIndex}
            </span>
          </div>
          {!scored && <span className="text-[10.5px] text-muted/70">{t('common.venter')}</span>}
        </div>

        <ul className="mt-1.5 flex flex-col gap-1 list-none">
          {rows.map((cell) => {
            const info = playersById.get(cell.userId);
            const name = info
              ? formatRevealName(info.name, info.nickname)
              : t('common.unknownPlayerFull');
            const isBest = cell.userId === uniqueWinnerId;
            return (
              <li
                key={cell.userId}
                className={`flex items-center justify-between gap-3 rounded-xl px-2.5 py-1.5 ${
                  isBest
                    ? 'border border-accent/40 bg-accent/[0.06]'
                    : 'border border-transparent'
                }`}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {isBest && (
                    <span aria-hidden className="text-[11px] text-accent">
                      ★
                    </span>
                  )}
                  <span
                    className={`truncate font-sans text-[14px] ${
                      isBest ? 'font-medium text-text' : 'text-text'
                    }`}
                  >
                    {name}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2 tabular-nums">
                  <ScoreShape
                    shape={scoreShape(cell.gross, hole.par)}
                    tone={scoreTone(cell.gross, hole.par)}
                    size="sm"
                  >
                    {cell.gross == null ? '–' : String(cell.gross)}
                  </ScoreShape>
                  <span className="flex items-baseline gap-1">
                    <span
                      className={`score-num text-[18px] leading-none ${
                        isBest ? 'text-accent' : 'text-text'
                      }`}
                    >
                      {cell.gross == null ? '–' : formatPoints(cell.points)}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.1em] text-muted/60">
                      p
                    </span>
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
