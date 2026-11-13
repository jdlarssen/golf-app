import type { JSX, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Medallion } from '@/components/ui/Medallion';
import { PullQuote } from '@/components/ui/PullQuote';
import { LeaderboardBackLink } from '@/components/ui/LeaderboardBackLink';
import { LeaderboardShell, LeaderboardHeader } from './LeaderboardChrome';
import { LeaderboardFooter } from './LeaderboardFooter';
import { formatRevealName } from '@/lib/names/formatRevealName';
import { firstName } from '@/lib/firstName';
import { headlineUnit, teamHeadline } from '@/lib/leaderboard/vsPar';
import {
  NASSAU_SECTION_KEYS,
  summarizeNassau,
  type NassauCardSummary,
  type NassauSectionKey,
} from '@/lib/leaderboard/nassauBoard';
import { pillText } from './boardText';
import { NassauSectionTabs, type NassauCardView } from './NassauSectionTabs';
import { SettlementTable } from './SettlementTable';
import type { Settlement } from '@/lib/scoring/settlement';
import type {
  NassauResult,
  NassauSection,
  NassauSectionLine,
} from '@/lib/scoring/modes/types';
import { RowReactionsForPlayer } from './RowReactionsForPlayer';

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
  /** Antall hull fullført av den ledende spilleren (#638). Brukes i pillen. */
  holesPlayed: number;
  /** Hvor pilen tilbake skal peke. Defaults til spillets hjem. */
  backHref?: string;
  /**
   * Når true, dropper outer Shell + tilbakepila — caller eier ytre page-chrome.
   * Brukes inne i LeaderboardTabs eller når en parent (podium) wrapper.
   */
  chromeless?: boolean;
  /** Pengeoppgjør (#937) — null hvis kr_per_unit ikke er satt eller ≤ 0. */
  settlement?: Settlement | null;
  /**
   * Valgfri hale-seksjon rendret ETTER hovedinnholdet, men INNI shell-en
   * (#386/#1008-mønster). Kun rendret i hoved-visningen (finished + fylte
   * data) — tomme/reveal-hidden-grenene har ingen leaderboard å knytte
   * referatet til.
   */
  footerSlot?: ReactNode;
  /**
   * #2327: the player looking at the board — their own line on each card and
   * their row marked in the list. `null`/empty for spectators, embeds and an
   * organizer who does not play: no «Du» line then.
   */
  viewerUserId?: string | null;
}

/**
 * Live/post-finished leaderboard for Nassau (#2327): the three matches —
 * Front 9, Back 9 and Totalt — as three cards under a forest-green head. The
 * card of the match being played is selected and its full list shows under
 * the cards; a tap on another card shows that list instead.
 *
 * A match is decided when every player has played all its holes, or the game
 * is finished (`summarizeNassau`). Until then it has a leader and a ranked
 * list, but no winner and no gold. When one player has won every decided
 * match alone and a match is still open, an amber line says they can take all
 * three.
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
  holesPlayed,
  backHref = '/',
  chromeless = false,
  settlement,
  footerSlot,
  viewerUserId,
}: NassauViewProps): JSX.Element {
  const t = useTranslations('leaderboard');
  const tc = useTranslations('leaderboard.common');
  const tb = useTranslations('leaderboard.nassau.board');
  const tBoard = useTranslations('leaderboard.board');
  const tStatus = useTranslations('gameStatus');

  const isRevealHidden =
    scoreVisibility === 'reveal' && gameStatus !== 'finished';

  const totalPlayers = result.players.length;

  if (totalPlayers === 0) {
    return (
      <LeaderboardShell chromeless={chromeless}>
        {!chromeless && <LeaderboardHeader gameName={gameName} backHref={backHref} />}
        <p className="mt-12 text-center text-sm text-muted">
          {tc('noPlayersToShow')}
        </p>
      </LeaderboardShell>
    );
  }

  if (isRevealHidden) {
    return (
      <LeaderboardShell chromeless={chromeless}>
        {!chromeless && <LeaderboardHeader gameName={gameName} backHref={backHref} />}
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
      </LeaderboardShell>
    );
  }

  const viewer = viewerUserId || null;
  const board = summarizeNassau(result, { finished: gameStatus === 'finished', viewerUserId: viewer });
  const viewerPlays = viewer !== null && result.players.some((p) => p.userId === viewer);

  // The cards and the sweep line name players short: the nickname, else the
  // first name. The list keeps the full name (`formatRevealName`).
  const shortName = (userId: string): string => {
    const info = playersById.get(userId);
    return info?.nickname || firstName(info?.name) || tc('unknownPlayer');
  };

  const kicker: Record<NassauSectionKey, string> = {
    front9: t('nassau.front9Heading'),
    back9: t('nassau.back9Heading'),
    total18: t('nassau.totalLabel'),
  };

  const cardView = (key: NassauSectionKey, s: NassauCardSummary): NassauCardView => {
    const sole = s.leaderUserIds.length === 1 ? s.leaderUserIds[0] : null;
    return {
      kicker: kicker[key],
      status:
        s.state === 'decided'
          ? tb('stateDecided')
          : s.state === 'live'
            ? tb('stateLive', { done: s.holesDone, total: s.holesTotal })
            : tb('stateWaiting'),
      decided: s.state === 'decided',
      leaderMark:
        sole === null ? null : s.state === 'decided' ? (
          <span aria-hidden className="flex shrink-0">
            <Medallion place={1} size={22} />
          </span>
        ) : (
          <span
            aria-hidden
            className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border border-primary font-serif text-[11px] font-semibold"
          >
            1
          </span>
        ),
      leaderName:
        s.state === 'waiting'
          ? null
          : sole !== null
            ? sole === viewer
              ? tb('you')
              : shortName(sole)
            : s.leaderUserIds.length > 1
              ? s.state === 'decided'
                ? tb('pushed')
                : tb('tiedLead')
              : tb('noWinner'),
      score: s.leaderHeadline?.text ?? null,
      viewer: viewerLine(s),
    };
  };

  const viewerLine = (s: NassauCardSummary): NassauCardView['viewer'] => {
    const v = s.viewer;
    if (!v) return null;
    if (s.state === 'decided' && s.leaderUserIds.length === 1 && s.leaderUserIds[0] === viewer) {
      return { text: tb('viewerWon'), sr: tb('viewerWon'), strong: true };
    }
    if (s.state === 'live' && v.rank === 1 && !v.tied) {
      const text = v.lead === null ? tb('viewerLead') : tb('viewerLeadBy', { lead: v.lead });
      return { text, sr: text, strong: true };
    }
    const tied = String(v.tied);
    return v.gap === null
      ? { text: tb('viewerRank', { tied, rank: v.rank }), sr: tb('viewerSr', { tied, rank: v.rank }), strong: false }
      : {
          text: tb('viewerRankGap', { tied, rank: v.rank, gap: v.gap }),
          sr: tb('viewerSrGap', { tied, rank: v.rank, gap: v.gap }),
          strong: false,
        };
  };

  const cards = {} as Record<NassauSectionKey, NassauCardView>;
  const panels = {} as Record<NassauSectionKey, ReactNode>;
  for (const key of NASSAU_SECTION_KEYS) {
    cards[key] = cardView(key, board.sections[key]);
    panels[key] = (
      <SectionBlock
        sectionKey={key}
        summary={board.sections[key]}
        section={result.sections[key]}
        ranking={result.ranking}
        scoring={result.scoring}
        playersById={playersById}
        viewerUserId={viewer}
        headingLevel={chromeless ? 'h3' : 'h2'}
        // Only the open list renders, so the reactions still show once per
        // player on the screen (#943).
        showReactions
      />
    );
  }

  const sweep = board.sweep;
  const sweepLine = sweep ? (
    <p
      data-testid="nassau-sweep"
      className="mt-3 rounded-[14px] border border-warning/40 bg-warning-soft px-3.5 py-2.5 text-[13px] text-text"
    >
      <span className="font-semibold">
        {sweep.userId === viewer ? tb('sweepSelf') : tb('sweepOther', { name: shortName(sweep.userId) })}
      </span>
      {/* Spectators and organizers who do not play get the first sentence only. */}
      {viewerPlays && sweep.userId !== viewer && (
        <> {tb('stopSweep', { section: sweep.openSection })}</>
      )}
    </p>
  ) : null;

  const pill =
    gameStatus === 'finished'
      ? tc('afterNHoles', { holes: holesPlayed })
      : gameStatus === 'active'
        ? pillText(tBoard, holesPlayed)
        : tStatus(gameStatus);
  const Title = chromeless ? 'h2' : 'h1';

  return (
    <LeaderboardShell chromeless={chromeless} footerSlot={footerSlot}>
      <div className={chromeless ? 'px-3.5 pt-3' : undefined}>
        <header
          data-focus-surface="strong"
          className="rounded-2xl bg-surface-strong px-2 pt-2 pb-5 text-bg-tint"
        >
          <div className="flex items-center justify-between gap-3">
            {chromeless ? (
              <span aria-hidden className="h-11 w-11 shrink-0" />
            ) : (
              <LeaderboardBackLink href={backHref} label={tc('backAriaLabel')} tone="onStrong" />
            )}
            <span
              data-testid="nassau-pill"
              className="mr-2 inline-flex items-center gap-1.5 rounded-full border border-bg-tint/35 px-3 py-1.5 text-xs font-semibold tabular-nums"
            >
              {gameStatus === 'active' && (
                <span aria-hidden className="h-2 w-2 rounded-full bg-success" />
              )}
              {pill}
            </span>
          </div>
          <div className="px-3">
            <p className="truncate text-xs font-semibold text-bg-tint/80">
              {tb('kicker', { game: gameName, scoring: result.scoring })}
            </p>
            <Title className="mt-1 font-serif text-[28px] font-medium leading-[1.1]">
              {tb('title')}
            </Title>
            <p className="mt-0.5 text-[13px] text-bg-tint/85">{tb('subtitle')}</p>
          </div>
        </header>

        <NassauSectionTabs
          cards={cards}
          defaultSection={board.defaultSection}
          panels={panels}
          tablistLabel={tb('tablistLabel')}
          aside={sweepLine}
          hint={tb('tapHint')}
        />

        {/* Pengeoppgjør (#937) — vises kun når kr_per_unit er satt (settlement != null). */}
        {settlement && (
          <div className="pt-5">
            <SettlementTable
              settlement={settlement}
              playersById={playersById}
              gameName={gameName}
              mode="nassau"
              isFinal={gameStatus === 'finished'}
            />
          </div>
        )}
      </div>

      <LeaderboardFooter gameStatus={gameStatus} className="px-6 pt-4 pb-4" />
    </LeaderboardShell>
  );
}

/**
 * The open match's full list (#2327): one card with a row per player — place,
 * name, holes played and the number the match ranks on. A match nobody has
 * started shows the waiting box. Gold, the medals and the tied chip belong to
 * a decided match only, so nobody sees a winner before everyone has played.
 */
function SectionBlock({
  sectionKey,
  summary,
  section,
  ranking,
  scoring,
  playersById,
  viewerUserId,
  headingLevel,
  showReactions = false,
}: {
  sectionKey: NassauSectionKey;
  summary: NassauCardSummary;
  section: NassauSection;
  /** #2625: a section ranked on strokes to par shows it («−2», «E»). */
  ranking: NassauResult['ranking'];
  scoring: NassauResult['scoring'];
  playersById: Map<string, NassauPlayerInfo>;
  viewerUserId: string | null;
  headingLevel: 'h2' | 'h3';
  showReactions?: boolean;
}) {
  const t = useTranslations('leaderboard');
  const tb = useTranslations('leaderboard.nassau.board');
  const tc = useTranslations('leaderboard.common');
  const testId = `nassau-section-${sectionKey}`;
  const decided = summary.state === 'decided';
  const winnerUserIds = decided ? summary.leaderUserIds : [];
  const unit = headlineUnit(ranking) === 'toPar' ? 'toPar' : scoring;
  const Heading = headingLevel;

  return (
    <section data-testid={testId}>
      <header className="flex items-baseline justify-between gap-3 px-1 pt-4 pb-2">
        <span className="flex min-w-0 items-baseline gap-2">
          <Heading className="text-xs leading-[normal] font-semibold text-muted">
            {tb('panelHeading', { section: sectionKey })}
          </Heading>
          {winnerUserIds.length > 1 && (
            <span
              data-testid={`${testId}-push`}
              className="rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] font-semibold text-muted"
            >
              {t('nassau.sectionTied')}
            </span>
          )}
        </span>
        <span className="shrink-0 text-xs leading-[normal] text-muted">{tb('listUnit', { unit })}</span>
      </header>

      {summary.state === 'waiting' ? (
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
        <ol
          data-testid={`${testId}-list`}
          className="list-none overflow-hidden rounded-2xl border border-border bg-surface"
        >
          {section.players.map((line, i) => {
            const isViewer = line.userId === viewerUserId;
            const info = playersById.get(line.userId);
            const displayName = isViewer
              ? tb('you')
              : info
                ? formatRevealName(info.name, info.nickname)
                : tc('unknownPlayerFull');
            return (
              <SectionPlayerRow
                key={line.userId}
                line={line}
                ranking={ranking}
                displayName={displayName}
                decided={decided}
                isWinnerHighlight={winnerUserIds.length === 1 && winnerUserIds[0] === line.userId}
                isViewer={isViewer}
                first={i === 0}
                staggerIndex={i}
                holesLabel={tb('rowHoles', { holes: line.holesPlayed })}
                showReactions={showReactions}
              />
            );
          })}
        </ol>
      )}
    </section>
  );
}

function SectionPlayerRow({
  line,
  ranking,
  displayName,
  decided,
  isWinnerHighlight,
  isViewer,
  first,
  staggerIndex,
  holesLabel,
  showReactions = false,
}: {
  line: NassauSectionLine;
  ranking: NassauResult['ranking'];
  displayName: string;
  decided: boolean;
  isWinnerHighlight: boolean;
  isViewer: boolean;
  first: boolean;
  staggerIndex: number;
  holesLabel: string;
  showReactions?: boolean;
}) {
  const isTied = line.tiedWith.length > 0;
  const rankLabel = isTied ? `T${line.rank}` : `${line.rank}`;
  const headline = teamHeadline(ranking, { total: line.totalEffectiveStrokes, toPar: line.toPar });
  // Champagne tint only for a clean winner of a decided match; a tie (push)
  // shows neutral rows, since no unit is given out — the same principle as
  // Wolf-tied. The viewer's own row is marked when it is not the winner's.
  const rowTone = isWinnerHighlight ? 'bg-accent/10' : isViewer ? 'bg-primary-soft' : '';
  const medal = decided && !isTied && line.rank >= 1 && line.rank <= 3;

  return (
    <li
      className={`list-none reveal-up ${first ? '' : 'border-t border-row-divider-warm'}`}
      style={{ animationDelay: `${60 + staggerIndex * 70}ms` }}
      data-testid={`nassau-row-${line.userId}`}
      data-winner={isWinnerHighlight ? 'true' : undefined}
      data-viewer={isViewer ? 'true' : undefined}
    >
      <div
        className={`grid grid-cols-[28px_minmax(0,1fr)_60px_44px] items-center gap-2 px-3.5 py-2.5 leading-[normal] ${rowTone}`}
      >
        {medal ? (
          <span className="flex justify-center">
            <Medallion place={line.rank as 1 | 2 | 3} size={28} />
          </span>
        ) : (
          <span className="text-center font-serif font-semibold">{rankLabel}</span>
        )}
        <span className="truncate text-[15px] font-semibold text-text">{displayName}</span>
        <span className="text-right text-xs leading-[normal] text-muted">{holesLabel}</span>
        <span className="score-num text-right text-[18px] text-text">{headline.text}</span>
      </div>
      {showReactions && <RowReactionsForPlayer targetUserId={line.userId} />}
    </li>
  );
}
