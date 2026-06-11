import type { JSX } from 'react';
import { useTranslations } from 'next-intl';
import { SmartLink } from '@/components/ui/SmartLink';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { LeaderboardBackdrop } from '@/components/illustrations/LeaderboardBackdrop';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type {
  RoundRobinResult,
  RoundRobinHoleRow,
  RoundRobinPlayerCell,
} from '@/lib/scoring/modes/types';
import type { RoundRobinPlayerInfo } from '../RoundRobinView';

export interface RoundRobinHolesViewProps {
  /** Spill-id — brukes til back-lenke. */
  gameId: string;
  /** Turneringsnavn — vises som kicker i header. */
  gameName: string;
  /**
   * Resultat fra `lib/scoring/modes/roundRobin.compute()`.
   * Caller må narrowe på `kind === 'round_robin'` før propen sendes inn.
   */
  result: RoundRobinResult;
  /** Spillerinfo per userId for å rendre navn + kallenavn. */
  playersById: Map<string, RoundRobinPlayerInfo>;
  /** `games.score_visibility` normalisert. Styrer reveal-flow. */
  scoreVisibility: 'live' | 'reveal';
  /** `games.status` — styrer reveal-flow sammen med `scoreVisibility`. */
  gameStatus: 'active' | 'finished';
}

function nameOf(
  userId: string,
  playersById: Map<string, RoundRobinPlayerInfo>,
  fallback: string,
): string {
  const info = playersById.get(userId);
  return info ? formatRevealName(info.name, info.nickname) : fallback;
}

function sideNames(
  ids: readonly string[],
  playersById: Map<string, RoundRobinPlayerInfo>,
  fallback: string,
): string {
  return ids.map((id) => nameOf(id, playersById, fallback)).join(' + ');
}

/**
 * Format-bevisst «Hull for hull» for Round Robin (epic #496, PR 4). Round Robin
 * roterer partnerskapet hvert 6. hull (3 segmenter), og leaderboardet har ingen
 * per-hull-visning i det hele tatt — denne flaten ER hull-for-hull-historien.
 *
 * Segment-gruppert: tre bolker, hver med en konstellasjons-header som viser
 * rotasjonen («{Side 1} mot {Side 2}»), deretter de 6 hull-kortene med begge
 * sidenes per-spiller-netto, contributor-markering og hvem som vant hullet.
 */
export function RoundRobinHolesView({
  gameId,
  gameName,
  result,
  playersById,
  scoreVisibility,
  gameStatus,
}: RoundRobinHolesViewProps): JSX.Element {
  const t = useTranslations('leaderboard');
  const isRevealHidden =
    scoreVisibility === 'reveal' && gameStatus !== 'finished';

  if (isRevealHidden) {
    return (
      <Shell>
        <Header gameName={gameName} gameId={gameId} />
        <div
          data-testid="round-robin-holes-reveal-hidden"
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

  // Grupper hull på segment (1/2/3), segment-rekkefølge stigende. Rotasjonen
  // er konstant innen et segment, så konstellasjonen leses fra første hull.
  const segments: Array<{ segment: 1 | 2 | 3; holes: RoundRobinHoleRow[] }> = [];
  for (const seg of [1, 2, 3] as const) {
    const holes = result.holes
      .filter((h) => h.segment === seg)
      .sort((a, b) => a.holeNumber - b.holeNumber);
    if (holes.length > 0) segments.push({ segment: seg, holes });
  }

  return (
    <Shell>
      <Header gameName={gameName} gameId={gameId} />

      <div className="px-6 pt-1.5 pb-3.5 text-center">
        <h1 className="font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          {t('common.hullForHullHeading')}
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">Round Robin</p>
      </div>

      <div
        data-testid="round-robin-holes-segments"
        className="flex flex-col gap-5 px-3.5 pt-1 pb-3.5"
      >
        {segments.map(({ segment, holes }) => (
          <SegmentBlock
            key={segment}
            segment={segment}
            holes={holes}
            playersById={playersById}
          />
        ))}
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

function SegmentBlock({
  segment,
  holes,
  playersById,
}: {
  segment: 1 | 2 | 3;
  holes: RoundRobinHoleRow[];
  playersById: Map<string, RoundRobinPlayerInfo>;
}) {
  const t = useTranslations('leaderboard');

  const SEGMENT_HOLES: Record<1 | 2 | 3, string> = {
    1: t('roundRobin.segmentHoles1'),
    2: t('roundRobin.segmentHoles2'),
    3: t('roundRobin.segmentHoles3'),
  };

  const first = holes[0]!;
  const side1 = sideNames(first.side1PlayerIds, playersById, t('common.unknownPlayer'));
  const side2 = sideNames(first.side2PlayerIds, playersById, t('common.unknownPlayer'));

  return (
    <section data-testid={`round-robin-holes-segment-${segment}`}>
      {/* Konstellasjons-header: hvem som er partnere DETTE segmentet. */}
      <div className="px-1 pb-2">
        <Kicker tone="muted" className="pb-1">
          {t('roundRobin.segmentLabel', { number: segment, holes: SEGMENT_HOLES[segment] })}
        </Kicker>
        <p className="text-[12.5px] text-muted">
          <span className="text-text">{side1}</span>
          <span className="mx-1.5 text-muted/40" aria-hidden>
            {t('roundRobin.vsLabel')}
          </span>
          <span className="text-text">{side2}</span>
        </p>
      </div>

      <ul className="flex flex-col gap-2.5 list-none">
        {holes.map((hole) => (
          <HoleCard key={hole.holeNumber} hole={hole} playersById={playersById} />
        ))}
      </ul>
    </section>
  );
}

function outcomeChip(
  result: RoundRobinHoleRow['result'],
  t: ReturnType<typeof useTranslations<'leaderboard'>>,
): {
  label: string;
  className: string;
} | null {
  switch (result) {
    case 'tied':
      return { label: t('roundRobin.outcomeChipTied'), className: 'text-muted' };
    case 'unplayed':
      return { label: t('roundRobin.outcomeChipVenter'), className: 'text-muted/70' };
    default:
      // side1_wins / side2_wins markeres på selve siden, ingen topp-chip.
      return null;
  }
}

function HoleCard({
  hole,
  playersById,
}: {
  hole: RoundRobinHoleRow;
  playersById: Map<string, RoundRobinPlayerInfo>;
}) {
  const t = useTranslations('leaderboard');
  const tc = useTranslations('leaderboard.common');
  const chip = outcomeChip(hole.result, t);

  return (
    <li
      className="list-none"
      data-testid={`round-robin-holes-card-${hole.holeNumber}`}
    >
      <Card className="px-3.5 py-3">
        {/* Hode: hull + par/SI venstre, utfall (delt/venter) høyre */}
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-[15px] font-medium tabular-nums text-text">
              {t('common.hullNumber', { number: hole.holeNumber })}
            </span>
            <span className="text-[10.5px] tabular-nums text-muted">
              {tc('parSiChip', { par: hole.par, si: hole.strokeIndex })}
            </span>
          </div>
          {chip && (
            <span
              className={`text-[10.5px] font-medium uppercase tracking-[0.1em] ${chip.className}`}
            >
              {chip.label}
            </span>
          )}
        </div>

        {/* To side-blokker: vinnende side uthevet (accent), per-spiller netto. */}
        <div className="mt-2 flex flex-col gap-1.5">
          <SideBlock
            players={hole.side1Players}
            isWinner={hole.result === 'side1_wins'}
            playersById={playersById}
          />
          <SideBlock
            players={hole.side2Players}
            isWinner={hole.result === 'side2_wins'}
            playersById={playersById}
          />
        </div>
      </Card>
    </li>
  );
}

function SideBlock({
  players,
  isWinner,
  playersById,
}: {
  players: RoundRobinPlayerCell[];
  isWinner: boolean;
  playersById: Map<string, RoundRobinPlayerInfo>;
}) {
  const t = useTranslations('leaderboard');
  return (
    <div
      className={`rounded-xl px-2.5 py-1.5 ${
        isWinner
          ? 'border border-accent/40 bg-accent/[0.06]'
          : 'border border-transparent'
      }`}
    >
      {isWinner && (
        <span className="mb-0.5 block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-accent">
          {t('roundRobin.vantHulletLabel')}
        </span>
      )}
      <ul className="flex flex-col gap-1 list-none">
        {players.map((cell) => {
          const name = nameOf(cell.userId, playersById, t('common.unknownPlayer'));
          const showGross =
            cell.gross != null && cell.net != null && cell.gross !== cell.net;

          return (
            <li
              key={cell.userId}
              className="flex items-center justify-between gap-3"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                {cell.isContributor && cell.net != null && (
                  <span
                    aria-hidden
                    className={`text-[11px] ${isWinner ? 'text-accent' : 'text-muted'}`}
                  >
                    ★
                  </span>
                )}
                <span
                  className={`truncate font-sans text-[14px] ${
                    cell.isContributor && cell.net != null
                      ? 'font-medium text-text'
                      : 'text-text'
                  }`}
                >
                  {name}
                </span>
              </span>
              <span className="flex shrink-0 items-baseline gap-1.5 tabular-nums">
                {showGross && cell.gross != null && (
                  <span className="text-[10.5px] text-muted/70">
                    {t('roundRobin.bruttoLabel', { gross: cell.gross })}
                  </span>
                )}
                <span
                  className={`score-num text-[18px] leading-none ${
                    isWinner ? 'text-accent' : 'text-text'
                  }`}
                >
                  {cell.net ?? '–'}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
