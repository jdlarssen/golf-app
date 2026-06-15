import type { JSX } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Medallion } from '@/components/ui/Medallion';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { LeaderboardShell, LeaderboardHeader } from './LeaderboardChrome';
import { LeaderboardFooter } from './LeaderboardFooter';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type {
  ShambleResult,
  ShambleHoleRow,
  ShambleTeamLine,
} from '@/lib/scoring/modes/types';

/**
 * Spillerinfo for ShambleView. En map fra userId → navn + kallenavn.
 * Caller (leaderboard-page) bygger map-en fra game_players-joinen og
 * sender den inn slik at view-en kan rendre menneske-lesbare navn der
 * scoring-laget kun har userId-er.
 */
export interface ShamblePlayerInfo {
  name: string;
  nickname: string | null;
}

export interface ShambleViewProps {
  /** Spill-id — reservert for fremtidig drilldown og analytics. */
  gameId: string;
  /** Turneringsnavn — vises som kicker i header. */
  gameName: string;
  /**
   * Resultat fra `lib/scoring/modes/shamble.compute()`.
   * Caller må narrowe på `kind === 'shamble'` før propen sendes inn.
   */
  result: ShambleResult;
  /** Spillerinfo per userId for å rendre navn + kallenavn. */
  playersById: Map<string, ShamblePlayerInfo>;
  /**
   * Score-visibility-flagget fra `games.score_visibility`. Når `'reveal'`
   * og spillet ikke er ferdig, skjuler vi totaler og per-hull-tabellen.
   */
  scoreVisibility: 'live' | 'reveal';
  /** `games.status` — styrer reveal-flow sammen med `scoreVisibility`. */
  gameStatus: 'draft' | 'scheduled' | 'active' | 'finished';
  /** Antall hull fullført av den ledende spilleren (#638). Brukes i sub-tittel. */
  holesPlayed: number;
  /** Hvor pilen tilbake skal peke. Defaults til spillets hjem. */
  backHref?: string;
  /**
   * Når true, dropper outer Shell + Header — caller eier ytre page-chrome.
   * Brukes inne i LeaderboardTabs eller når en parent (podium) wrapper.
   */
  chromeless?: boolean;
}

/**
 * Live/post-finished leaderboard for Shamble / Champagne Scramble. To seksjoner:
 *
 *   - Rangert lag-tabell øverst: rang, lagnavn med medlemsnavn, totalScore, hull spilt.
 *   - Per-hull-rutenett (drilldown): ett kort per hull med lagets hull-score og
 *     per-spiller effective-score. Counted-spillere markeres, pending hull vises distinkt.
 *
 * Variant-chip og scoring (Netto/Brutto) vises i toppen.
 *
 * Reveal-modus (scoreVisibility='reveal' && status!='finished'): venterom-melding
 * i stedet for tall. Speiler NinesView-mønstret.
 */
export function ShambleView({
  gameName,
  result,
  playersById,
  scoreVisibility,
  gameStatus,
  holesPlayed,
  backHref = '/',
  chromeless = false,
}: ShambleViewProps): JSX.Element {
  const t = useTranslations('leaderboard');
  const isRevealHidden =
    scoreVisibility === 'reveal' && gameStatus !== 'finished';

  if (result.teams.length === 0) {
    return (
      <LeaderboardShell chromeless={chromeless}>
        {!chromeless && <LeaderboardHeader gameName={gameName} backHref={backHref} />}
        <p className="mt-12 text-center text-sm text-muted">
          {t('common.noTeams')}
        </p>
      </LeaderboardShell>
    );
  }

  if (isRevealHidden) {
    return (
      <LeaderboardShell chromeless={chromeless}>
        {!chromeless && <LeaderboardHeader gameName={gameName} backHref={backHref} />}
        <div
          data-testid="shamble-reveal-hidden"
          className="mx-4 mt-12 rounded-2xl border border-dashed border-border bg-surface px-5 py-8 text-center"
        >
          <p className="font-serif text-[18px] font-medium text-text">
            {t('common.revealHiddenTitle')}
          </p>
          <p className="mt-2 font-sans text-xs text-muted">
            {t('shamble.revealHiddenSub')}
          </p>
        </div>
        <PullQuote className="px-6 pt-4 pb-4">{t('common.goodLuck')}</PullQuote>
      </LeaderboardShell>
    );
  }

  const variantLabel =
    result.variant === 'champagne' ? 'Champagne Scramble' : 'Shamble';
  const scoringLabel = result.scoring === 'net' ? t('common.netto') : t('common.brutto');
  const countLabel = `best ${result.count}`;
  const statusLabel = gameStatus === 'finished' ? t('common.afterNHoles', { holes: holesPlayed }) : t('common.live');
  const subtitleParts = [statusLabel, variantLabel, countLabel, scoringLabel];

  // result.teams er allerede sortert på rank fra scoring-laget.
  const sortedTeams = [...result.teams].sort((a, b) => a.rank - b.rank);

  return (
    <LeaderboardShell chromeless={chromeless}>
      {!chromeless && <LeaderboardHeader gameName={gameName} backHref={backHref} />}

      <div className="px-6 pt-1.5 pb-3.5 text-center">
        <h1 className="font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          {t('common.leaderboardHeading')}
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          {subtitleParts.join(' · ')}
        </p>
      </div>

      {/* Rangert lag-tabell — primær storyline: hvem leder på slagsum. */}
      <ul
        data-testid="shamble-leaderboard"
        className="flex flex-col gap-2 px-3.5 pt-3 pb-3.5"
      >
        {sortedTeams.map((team, i) => {
          const memberNames = team.members
            .map((uid) => {
              const info = playersById.get(uid);
              return info ? formatRevealName(info.name, info.nickname) : t('common.unknownPlayer');
            })
            .join(', ');
          return (
            <TeamRow
              key={team.teamNumber}
              rank={team.rank}
              teamNumber={team.teamNumber}
              memberNames={memberNames}
              totalScore={team.totalScore}
              holesCounted={team.holesCounted}
              tiedWith={team.tiedWith}
              staggerIndex={i}
            />
          );
        })}
      </ul>

      {/* Per-hull-rutenett — sekundær drilldown for per-hull lag-scorer. */}
      <section className="px-3.5 pt-2 pb-3.5">
        <Kicker tone="muted" className="px-1 pb-2">
          {t('common.perHullKicker')}
        </Kicker>
        <ul
          data-testid="shamble-hole-list"
          className="flex flex-col gap-2 list-none"
        >
          {result.holes.map((hole) => (
            <HoleRow
              key={hole.holeNumber}
              hole={hole}
              playersById={playersById}
            />
          ))}
        </ul>
      </section>

      <LeaderboardFooter gameStatus={gameStatus} className="px-6 pt-1 pb-4" />
    </LeaderboardShell>
  );
}

function TeamRow({
  rank,
  teamNumber,
  memberNames,
  totalScore,
  holesCounted,
  tiedWith,
  staggerIndex,
}: {
  rank: number;
  teamNumber: number;
  memberNames: string;
  totalScore: number;
  holesCounted: number;
  tiedWith: number[];
  staggerIndex: number;
}) {
  const t = useTranslations('leaderboard');
  const isPodium = rank >= 1 && rank <= 3;
  const isTied = tiedWith.length > 0;
  const rankLabel = isTied ? `T${rank}` : `${rank}`;
  const isLeader = rank === 1 && !isTied;
  const cardClass = isLeader
    ? 'border-accent bg-accent/[0.06] shadow-[0_2px_12px_rgba(201,169,97,0.15)]'
    : '';

  return (
    <li
      className="list-none reveal-up"
      style={{ animationDelay: `${60 + staggerIndex * 80}ms` }}
    >
      <Card className={`flex items-center gap-3.5 px-4 py-3.5 ${cardClass}`}>
        {isPodium && !isTied ? (
          <span className="shrink-0">
            <Medallion place={rank as 1 | 2 | 3} size={36} />
          </span>
        ) : (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface font-serif text-[15px] font-medium text-muted tabular-nums">
            {rankLabel}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="font-serif text-[17px] font-medium tracking-[-0.005em] text-text truncate">
            {t('common.teamLabel', { number: teamNumber })}
          </p>
          <p className="mt-0.5 text-[12px] text-muted truncate">
            {memberNames}
          </p>
          <p className="mt-0.5 text-[12px] text-muted tabular-nums">
            {t('shamble.spiltHullOf18', { played: holesCounted })}
          </p>
          {isTied && (
            <p className="text-[11px] text-muted mt-0.5" data-testid={`shamble-tied-${rank}`}>
              {t('common.tiedRank', { rank })}
            </p>
          )}
        </div>

        <div className="shrink-0 text-right">
          <span
            className={`score-num block leading-none tracking-[-0.02em] tabular-nums ${
              isLeader
                ? 'text-[28px] text-accent'
                : 'text-[26px] text-text'
            }`}
          >
            {totalScore}
          </span>
          <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            {t('common.slagLabel')}
          </span>
        </div>
      </Card>
    </li>
  );
}

function HoleRow({
  hole,
  playersById,
}: {
  hole: ShambleHoleRow;
  playersById: Map<string, ShamblePlayerInfo>;
}) {
  const t = useTranslations('leaderboard');
  const tc = useTranslations('leaderboard.common');
  return (
    <li
      className="list-none"
      data-testid={`shamble-hole-row-${hole.holeNumber}`}
    >
      <Card className="px-3.5 py-3">
        {/* Hull-header: nummer + par + SI */}
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-[15px] font-medium tabular-nums text-text">
              {tc('hullNumber', { number: hole.holeNumber })}
            </span>
            <span className="text-[10.5px] tabular-nums text-muted">
              {tc('parSiChip', { par: hole.par, si: hole.strokeIndex })}
            </span>
          </div>
        </div>

        {/* Per-lag-scorer på dette hullet */}
        <div className="mt-2 flex flex-col gap-2">
          {hole.teams.map((cell) => {
            const teamLabel = t('common.teamLabel', { number: cell.teamNumber });
            return (
              <div key={cell.teamNumber} className="flex items-start gap-2">
                {/* Lag-label */}
                <span className="shrink-0 w-12 text-[11px] font-medium text-muted pt-0.5">
                  {teamLabel}
                </span>

                {/* Lag-sum eller pending */}
                <span
                  className={`shrink-0 tabular-nums font-serif text-[18px] font-medium leading-none w-8 text-center ${
                    cell.pending || cell.teamScore === null
                      ? 'text-muted/40'
                      : 'text-text'
                  }`}
                  data-testid={
                    cell.pending
                      ? `shamble-hole-${hole.holeNumber}-team-${cell.teamNumber}-pending`
                      : undefined
                  }
                >
                  {cell.pending || cell.teamScore === null ? '—' : cell.teamScore}
                </span>

                {/* Per-spiller-detalj: effective score, counted markert */}
                <div className="flex flex-wrap gap-x-2 gap-y-0.5 min-w-0">
                  {cell.perPlayer.map((pp) => {
                    const info = playersById.get(pp.userId);
                    const shortName = info
                      ? (info.name.split(' ')[0] ?? formatRevealName(info.name, info.nickname))
                      : '?';
                    const score =
                      pp.effectiveScore !== null ? pp.effectiveScore : '—';
                    return (
                      <span
                        key={pp.userId}
                        className={`text-[10.5px] tabular-nums ${
                          pp.counted
                            ? 'text-text font-semibold'
                            : 'text-muted/60'
                        }`}
                        title={pp.counted ? t('shamble.teller') : t('shamble.tellerIkke')}
                      >
                        {shortName}&nbsp;{score}
                        {pp.counted && (
                          <span className="ml-0.5 text-accent" aria-hidden>
                            ✓
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {/* Defensiv: vis melding hvis ingen team-celler */}
          {hole.teams.length === 0 && (
            <span className="text-[11px] text-muted/60">{t('shamble.noTeamsScored')}</span>
          )}
        </div>
      </Card>
    </li>
  );
}

// Re-export for use in ShamblePodium.
export type { ShambleTeamLine };
