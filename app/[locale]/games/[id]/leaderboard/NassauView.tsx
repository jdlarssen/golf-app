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
  NassauResult,
  NassauSection,
  NassauSectionLine,
} from '@/lib/scoring/modes/types';

/**
 * Spillerinfo for NassauView. En map fra userId → navn + kallenavn.
 * Caller (leaderboard-page) bygger map-en fra game_players-joinen og
 * sender den inn slik at view-en kan rendre menneske-lesbare navn der
 * scoring-laget kun har userId-er.
 */
export interface NassauPlayerInfo {
  name: string;
  nickname: string | null;
}

export interface NassauViewProps {
  /** Spill-id — brukes til (fremtidig) drilldown og analytics. */
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
  /**
   * Score-visibility-flagget fra `games.score_visibility`. Når `'reveal'`
   * og spillet ikke er ferdig skjuler vi totaler og vinner-highlights —
   * kun en venterom-melding vises. Når spillet er ferdig konvergerer
   * begge modus på full visning.
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
 * Live/post-finished leaderboard for Nassau. Tre stacked sections:
 *
 *   - Front 9 — hull 1–9, ranking på effective-strokes for spilte hull
 *   - Back 9 — hull 10–18, samme prinsipp
 *   - Totalt 18 hull — hele runden, total-ranking
 *
 * Hver seksjon har sin egen rank-en-til-N-liste. Ren vinner får champagne-
 * tinted highlight; push (tied etter cascade) viser «T1» + flere navn uten
 * highlight; pending (ingen har fullført seksjonen) viser en venterom-tekst.
 *
 * Reveal-modus (scoreVisibility='reveal' && status='active'): vi rendrer
 * en venterom-melding i stedet for tall — Nassau-formatet er drama-drevet
 * (tre konkurranser, sweep-mulighet), og det er hyggeligere å holde
 * resultatene under lokk til admin avslutter. Når spillet er ferdig
 * (status='finished') faller vi tilbake til full visning.
 */
export function NassauView({
  gameId: _gameId,
  gameName,
  result,
  playersById,
  scoreVisibility,
  gameStatus,
  backHref = '/',
  chromeless = false,
}: NassauViewProps): JSX.Element {
  const t = useTranslations('leaderboard');
  const tc = useTranslations('leaderboard.common');

  const isRevealHidden =
    scoreVisibility === 'reveal' && gameStatus !== 'finished';

  const totalPlayers = result.players.length;

  if (totalPlayers === 0) {
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
          data-testid="nassau-reveal-hidden"
          className="mx-4 mt-12 rounded-2xl border border-dashed border-border bg-surface px-5 py-8 text-center"
        >
          <p className="font-serif text-[18px] font-medium text-text">
            {tc('revealHiddenTitle')}
          </p>
          <p className="mt-2 font-sans text-xs text-muted">
            {t('nassau.revealHiddenSub')}
          </p>
        </div>
        <PullQuote className="px-6 pt-4 pb-4">{tc('goodLuck')}</PullQuote>
      </Shell>
    );
  }

  const subtitleParts = [
    gameStatus === 'finished' ? tc('after18Holes') : tc('live'),
    'Nassau',
    result.scoring === 'net' ? tc('netto') : tc('brutto'),
  ];

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

      <div
        data-testid="nassau-sections"
        className="flex flex-col gap-5 px-3.5 pt-3 pb-3.5"
      >
        <SectionBlock
          testId="nassau-section-front9"
          heading={t('nassau.front9Heading')}
          subheading={t('nassau.front9Sub')}
          section={result.sections.front9}
          playersById={playersById}
          t={t}
        />
        <SectionBlock
          testId="nassau-section-back9"
          heading={t('nassau.back9Heading')}
          subheading={t('nassau.back9Sub')}
          section={result.sections.back9}
          playersById={playersById}
          t={t}
        />
        <SectionBlock
          testId="nassau-section-total18"
          heading={t('nassau.total18Heading')}
          subheading={t('nassau.total18Sub')}
          section={result.sections.total18}
          playersById={playersById}
          t={t}
        />
      </div>

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

/**
 * Én av de tre seksjonene (Front 9 / Back 9 / Totalt). Header + per-spiller-
 * rader. Pending-tilstand vises som en egen meldings-rad; vinner-highlight
 * gjelder kun ren-vinner-tilfellet (push får ingen accent, men T1-prefix-en
 * gjør at brukeren skjønner at to står på første plass).
 */
function SectionBlock({
  testId,
  heading,
  subheading,
  section,
  playersById,
  t,
}: {
  testId: string;
  heading: string;
  subheading: string;
  section: NassauSection;
  playersById: Map<string, NassauPlayerInfo>;
  t: ReturnType<typeof useTranslations<'leaderboard'>>;
}) {
  const tc = useTranslations('leaderboard.common');
  const hasCleanWinner =
    !section.isPending && section.winnerUserIds.length === 1;
  const hasPushWinner =
    !section.isPending && section.winnerUserIds.length > 1;

  return (
    <section data-testid={testId} className="flex flex-col gap-2">
      <header className="flex items-baseline justify-between gap-3 px-1">
        <div>
          <h2 className="font-serif text-[19px] font-medium tracking-[-0.01em] text-text">
            {heading}
          </h2>
          <p className="mt-0.5 text-[11px] tabular-nums text-muted">
            {subheading}
          </p>
        </div>
        {hasPushWinner && (
          <span
            data-testid={`${testId}-push`}
            className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted"
          >
            {t('nassau.sectionTied')}
          </span>
        )}
      </header>

      {section.isPending ? (
        <div
          data-testid={`${testId}-pending`}
          className="rounded-2xl border border-dashed border-border bg-surface px-4 py-5 text-center"
        >
          <p className="font-serif text-[15px] font-medium text-text">
            {t('nassau.sectionsPending')}
          </p>
          <p className="mt-1 text-[12px] text-muted">
            {t('nassau.sectionsPendingNote')}
          </p>
        </div>
      ) : (
        <ul
          data-testid={`${testId}-list`}
          className="flex flex-col gap-2 list-none"
        >
          {section.players.map((line, i) => {
            const info = playersById.get(line.userId);
            const displayName = info
              ? formatRevealName(info.name, info.nickname)
              : tc('unknownPlayerFull');
            const isWinnerHighlight =
              hasCleanWinner && section.winnerUserIds[0] === line.userId;

            return (
              <SectionPlayerRow
                key={line.userId}
                line={line}
                displayName={displayName}
                isWinnerHighlight={isWinnerHighlight}
                staggerIndex={i}
                t={t}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SectionPlayerRow({
  line,
  displayName,
  isWinnerHighlight,
  staggerIndex,
  t,
}: {
  line: NassauSectionLine;
  displayName: string;
  isWinnerHighlight: boolean;
  staggerIndex: number;
  t: ReturnType<typeof useTranslations<'leaderboard'>>;
}) {
  const isTied = line.tiedWith.length > 0;
  const rankLabel = isTied ? `T${line.rank}` : `${line.rank}`;
  // Champagne-tinted Card kun for ren vinner; push/T1 viser nøytral rad
  // siden ingen unit deles ut og UI-en skal speile det (samme prinsipp
  // som Wolf-tied: stake bæres uten poeng-utdeling).
  const cardClass = isWinnerHighlight
    ? 'border-accent bg-accent/[0.06] shadow-[0_2px_12px_rgba(201,169,97,0.15)]'
    : '';

  const isPodium = line.rank >= 1 && line.rank <= 3;

  return (
    <li
      className="list-none reveal-up"
      style={{ animationDelay: `${60 + staggerIndex * 70}ms` }}
      data-testid={`nassau-row-${line.userId}`}
      data-winner={isWinnerHighlight ? 'true' : undefined}
    >
      <Card className={`flex items-center gap-3.5 px-4 py-3 ${cardClass}`}>
        {isPodium && !isTied ? (
          <span className="shrink-0">
            <Medallion place={line.rank as 1 | 2 | 3} size={32} />
          </span>
        ) : (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface font-serif text-[15px] font-medium text-muted tabular-nums">
            {rankLabel}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="font-serif text-[16px] font-medium tracking-[-0.005em] text-text truncate">
            {displayName}
          </p>
          <p className="mt-0.5 text-[12px] text-muted tabular-nums">
            {t('nassau.sectionBrutto', { gross: line.totalGrossStrokes })}
            {' · '}
            {t('nassau.sectionHullSpilt', { holes: line.holesPlayed })}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <span className="score-num block text-[24px] leading-none tracking-[-0.02em] text-text tabular-nums">
            {line.totalEffectiveStrokes}
          </span>
          <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
            {t('nassau.totalEffectiveStrokesLabel')}
          </span>
        </div>
      </Card>
    </li>
  );
}
