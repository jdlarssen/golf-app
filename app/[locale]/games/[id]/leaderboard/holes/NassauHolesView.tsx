import type { JSX } from 'react';
import { useTranslations } from 'next-intl';
import { SmartLink } from '@/components/ui/SmartLink';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { LeaderboardBackdrop } from '@/components/illustrations/LeaderboardBackdrop';
import { LeaderboardFooter } from '../LeaderboardFooter';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type {
  NassauResult,
  NassauHoleRow,
  NassauSection,
} from '@/lib/scoring/modes/types';
import type { NassauPlayerInfo } from '../NassauView';

export interface NassauHolesViewProps {
  /** Spill-id — brukes til back-lenke. */
  gameId: string;
  /** Turneringsnavn — vises som kicker i header. */
  gameName: string;
  /**
   * Resultat fra `lib/scoring/modes/nassau.compute()`.
   * Caller må narrowe på `kind === 'nassau'` før propen sendes inn.
   */
  result: NassauResult;
  /** Spillerinfo per userId for å rendre navn + kallenavn. */
  playersById: Map<string, NassauPlayerInfo>;
  /** `games.score_visibility` normalisert. Styrer reveal-flow. */
  scoreVisibility: 'live' | 'reveal';
  /** `games.status` — styrer reveal-flow sammen med `scoreVisibility`. */
  gameStatus: 'active' | 'finished';
}

/**
 * Format-bevisst «Hull for hull» for Nassau (epic #496, PR 7). Erstatter det
 * generiske best-ball lag-scorekortet med en Nassau-tro drill-down: tre bolker
 * (For 9 / Bak 9 / Totalt) som speiler de tre veddemålene. Hver bolk har en
 * sammendrags-stripe (netto-sum per spiller, bolk-leder i champagne) + per-hull-
 * kort med netto per spiller og hull-vinner uthevet — det NassauView sitt
 * seksjons-sammendrag (kun totaler) mangler. Totalt-bolken er rent sammendrag
 * (summen av de to over), så de 18 hullene ikke repeteres en tredje gang.
 */
export function NassauHolesView({
  gameId,
  gameName,
  result,
  playersById,
  scoreVisibility,
  gameStatus,
}: NassauHolesViewProps): JSX.Element {
  const t = useTranslations('leaderboard');
  const tc = useTranslations('leaderboard.common');

  const isRevealHidden =
    scoreVisibility === 'reveal' && gameStatus !== 'finished';

  if (isRevealHidden) {
    return (
      <Shell>
        <Header gameName={gameName} gameId={gameId} />
        <div
          data-testid="nassau-holes-reveal-hidden"
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

  const frontHoles = result.holes.filter((h) => h.section === 'front9');
  const backHoles = result.holes.filter((h) => h.section === 'back9');

  return (
    <Shell>
      <Header gameName={gameName} gameId={gameId} />

      <div className="px-6 pt-1.5 pb-3.5 text-center">
        <h1 className="font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          {tc('hullForHullHeading')}
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          Nassau · {result.scoring === 'net' ? tc('netto') : tc('brutto')}
        </p>
      </div>

      <UnitsHeader result={result} playersById={playersById} t={t} />

      <div className="flex flex-col gap-6 px-3.5 pt-4 pb-3.5">
        <SectionBlock
          testId="nassau-holes-front9"
          heading={t('nassau.front9Heading')}
          subheading={t('nassau.front9Sub')}
          section={result.sections.front9}
          holes={frontHoles}
          playersById={playersById}
          t={t}
        />
        <SectionBlock
          testId="nassau-holes-back9"
          heading={t('nassau.back9Heading')}
          subheading={t('nassau.back9Sub')}
          section={result.sections.back9}
          holes={backHoles}
          playersById={playersById}
          t={t}
        />
        <TotalBlock
          section={result.sections.total18}
          playersById={playersById}
          t={t}
        />
      </div>

      <LeaderboardFooter gameStatus={gameStatus} className="px-6 pt-1 pb-4" />
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
  const tc = useTranslations('leaderboard.common');
  return (
    <header className="mb-2 flex items-center justify-between gap-4">
      <SmartLink
        href={`/games/${gameId}`}
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

/**
 * Kompakt units-orientering: hvem leder de tre veddemålene. Per spiller (rank-
 * sortert): navn, units 0–3, og tre seksjons-merker (F9 / B9 / T18) som fylles
 * i champagne når spilleren vant seksjonen alene.
 */
function UnitsHeader({
  result,
  playersById,
  t,
}: {
  result: NassauResult;
  playersById: Map<string, NassauPlayerInfo>;
  t: ReturnType<typeof useTranslations<'leaderboard'>>;
}) {
  const tc = useTranslations('leaderboard.common');
  return (
    <div className="px-3.5">
      <Card className="flex flex-col gap-2 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
          {t('nassau.sectionVunnetLabel')}
        </p>
        <ul
          data-testid="nassau-holes-units"
          className="flex flex-col gap-1.5 list-none"
        >
          {result.players.map((line) => {
            const info = playersById.get(line.userId);
            const name = info
              ? formatRevealName(info.name, info.nickname)
              : tc('unknownPlayerFull');
            const isLeader = line.rank === 1 && line.tiedWith.length === 0;
            return (
              <li
                key={line.userId}
                className="flex items-center justify-between gap-3"
              >
                <span
                  className={`min-w-0 flex-1 truncate font-sans text-[14px] ${
                    isLeader ? 'font-medium text-text' : 'text-text'
                  }`}
                >
                  {name}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <UnitDot label="F9" won={line.unitBreakdown.front9} />
                  <UnitDot label="B9" won={line.unitBreakdown.back9} />
                  <UnitDot label="T18" won={line.unitBreakdown.total18} />
                </span>
                <span
                  className={`score-num w-7 shrink-0 text-right text-[20px] leading-none tabular-nums ${
                    isLeader ? 'text-accent' : 'text-text'
                  }`}
                >
                  {line.units}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

function UnitDot({ label, won }: { label: string; won: boolean }) {
  return (
    <span
      className={`inline-flex h-5 min-w-[26px] items-center justify-center rounded-full px-1.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] tabular-nums ${
        won
          ? 'border border-accent/40 bg-accent/[0.10] text-accent'
          : 'border border-border bg-surface text-muted/50'
      }`}
    >
      {label}
    </span>
  );
}

/**
 * Én bolk (For 9 / Bak 9): sammendrags-stripe (netto-sum per spiller, bolk-
 * leder i champagne) + per-hull-kort under. Bolk-vinneren markeres i header når
 * seksjonen er avgjort; ellers viser stripen hvem som leder live.
 */
function SectionBlock({
  testId,
  heading,
  subheading,
  section,
  holes,
  playersById,
  t,
}: {
  testId: string;
  heading: string;
  subheading: string;
  section: NassauSection;
  holes: NassauHoleRow[];
  playersById: Map<string, NassauPlayerInfo>;
  t: ReturnType<typeof useTranslations<'leaderboard'>>;
}) {
  const tc = useTranslations('leaderboard.common');
  const cleanWinnerId =
    !section.isPending && section.winnerUserIds.length === 1
      ? section.winnerUserIds[0]
      : null;
  const isPush = !section.isPending && section.winnerUserIds.length > 1;

  return (
    <section data-testid={testId} className="flex flex-col gap-2.5">
      <header className="flex items-baseline justify-between gap-3 px-1">
        <div>
          <h2 className="font-serif text-[19px] font-medium tracking-[-0.01em] text-text">
            {heading}
          </h2>
          <p className="mt-0.5 text-[11px] tabular-nums text-muted">
            {subheading}
          </p>
        </div>
        {cleanWinnerId && (
          <span
            data-testid={`${testId}-winner`}
            className="rounded-full border border-accent/40 bg-accent/[0.08] px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-accent"
          >
            ★ {winnerLabel(cleanWinnerId, playersById, tc('winnerFallback'))}
          </span>
        )}
        {isPush && (
          <span className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">
            {t('nassau.sectionTied')}
          </span>
        )}
      </header>

      <SummaryStrip section={section} playersById={playersById} />

      <ul className="flex flex-col gap-2 list-none">
        {holes.map((hole) => (
          <HoleCard
            key={hole.holeNumber}
            hole={hole}
            playersById={playersById}
            t={t}
          />
        ))}
      </ul>
    </section>
  );
}

/**
 * Sammendrags-stripe: netto-sum per spiller for seksjonen, sortert lavest
 * først, bolk-leder(e) i champagne. Reflekterer eksisterende seksjons-ranking
 * (`section.players`) så stripen og hull-kortene aldri divergerer.
 */
function SummaryStrip({
  section,
  playersById,
}: {
  section: NassauSection;
  playersById: Map<string, NassauPlayerInfo>;
}) {
  const tc = useTranslations('leaderboard.common');
  // Laveste effective-sum blant spillere som faktisk har spilt hull. Brukes til
  // live-leder-highlight når seksjonen ikke er avgjort ennå.
  const playedTotals = section.players
    .filter((p) => p.holesPlayed > 0)
    .map((p) => p.totalEffectiveStrokes);
  const leaderTotal = playedTotals.length > 0 ? Math.min(...playedTotals) : null;

  return (
    <ul
      data-testid="nassau-holes-summary"
      className="flex flex-wrap gap-1.5 px-1 list-none"
    >
      {section.players.map((line) => {
        const info = playersById.get(line.userId);
        const name = info
          ? formatRevealName(info.name, info.nickname)
          : tc('unknownPlayer');
        const isLeader =
          line.holesPlayed > 0 && line.totalEffectiveStrokes === leaderTotal;
        return (
          <li
            key={line.userId}
            className={`inline-flex items-baseline gap-1.5 rounded-full px-2.5 py-1 text-[12px] ${
              isLeader
                ? 'border border-accent/40 bg-accent/[0.06] text-accent'
                : 'border border-border bg-surface text-muted'
            }`}
          >
            <span className="max-w-[7rem] truncate font-sans">{name}</span>
            <span className="score-num tabular-nums">
              {line.holesPlayed > 0 ? line.totalEffectiveStrokes : '–'}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Ett hull: hull/par/SI + netto per spiller (sortert lavest først). En enkelt
 * hull-vinner (lavest netto) uthevet i champagne med ★; ble hullet delt får
 * ingen utheving (samme nøytrale signal som duell-strippens «delt»). Uspilte
 * spillere viser «–» og sorteres sist. Hull der ingen har spilt viser «Venter».
 */
function HoleCard({
  hole,
  playersById,
  t,
}: {
  hole: NassauHoleRow;
  playersById: Map<string, NassauPlayerInfo>;
  t: ReturnType<typeof useTranslations<'leaderboard'>>;
}) {
  const tc = useTranslations('leaderboard.common');
  const scored = hole.bestUserIds.length > 0;
  // Champagne kun ved en utvetydig hull-vinner. Delt lavest netto = nøytralt.
  const uniqueWinnerId =
    hole.bestUserIds.length === 1 ? hole.bestUserIds[0] : null;
  const rows = [...hole.perPlayer].sort(
    (a, b) =>
      (a.effective ?? Number.POSITIVE_INFINITY) -
      (b.effective ?? Number.POSITIVE_INFINITY),
  );

  return (
    <li
      className="list-none"
      data-testid={`nassau-holes-card-${hole.holeNumber}`}
    >
      <Card className="px-3.5 py-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-[15px] font-medium tabular-nums text-text">
              {tc('hullNumber', { number: hole.holeNumber })}
            </span>
            <span className="text-[10.5px] tabular-nums text-muted">
              {tc('parSiChip', { par: hole.par, si: hole.strokeIndex })}
            </span>
          </div>
          {!scored && <span className="text-[10.5px] text-muted/70">{t('nassau.hullVenter')}</span>}
        </div>

        <ul className="mt-1.5 flex flex-col gap-1 list-none">
          {rows.map((cell) => {
            const info = playersById.get(cell.userId);
            const name = info
              ? formatRevealName(info.name, info.nickname)
              : tc('unknownPlayerFull');
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
                <span
                  className={`score-num shrink-0 text-[18px] leading-none tabular-nums ${
                    isBest ? 'text-accent' : 'text-text'
                  }`}
                >
                  {cell.effective ?? '–'}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
    </li>
  );
}

/**
 * Totalt-bolken: rent sammendrag (total netto per spiller + total18-vinner).
 * Ingen per-hull-repetisjon — det er summen av For 9 + Bak 9 over.
 */
function TotalBlock({
  section,
  playersById,
  t,
}: {
  section: NassauSection;
  playersById: Map<string, NassauPlayerInfo>;
  t: ReturnType<typeof useTranslations<'leaderboard'>>;
}) {
  const tc = useTranslations('leaderboard.common');
  const cleanWinnerId =
    !section.isPending && section.winnerUserIds.length === 1
      ? section.winnerUserIds[0]
      : null;

  return (
    <section data-testid="nassau-holes-total18" className="flex flex-col gap-2.5">
      <header className="flex items-baseline justify-between gap-3 px-1">
        <div>
          <h2 className="font-serif text-[19px] font-medium tracking-[-0.01em] text-text">
            {t('nassau.total18Heading')}
          </h2>
          <p className="mt-0.5 text-[11px] tabular-nums text-muted">
            {t('nassau.total18Sub')}
          </p>
        </div>
        {cleanWinnerId && (
          <span className="rounded-full border border-accent/40 bg-accent/[0.08] px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-accent">
            ★ {winnerLabel(cleanWinnerId, playersById, tc('winnerFallback'))}
          </span>
        )}
      </header>
      <SummaryStrip section={section} playersById={playersById} />
    </section>
  );
}

function winnerLabel(
  userId: string,
  playersById: Map<string, NassauPlayerInfo>,
  fallback: string,
): string {
  const info = playersById.get(userId);
  return info ? formatRevealName(info.name, info.nickname) : fallback;
}
