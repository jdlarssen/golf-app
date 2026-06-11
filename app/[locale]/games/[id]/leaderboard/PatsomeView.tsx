import type { JSX } from 'react';
import { useTranslations } from 'next-intl';
import { SmartLink } from '@/components/ui/SmartLink';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Medallion } from '@/components/ui/Medallion';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { LeaderboardBackdrop } from '@/components/illustrations/LeaderboardBackdrop';
import { firstName } from '@/lib/firstName';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type {
  PatsomeResult,
  PatsomeTeamLine,
  PatsomeHoleRow,
  PatsomeSegment,
} from '@/lib/scoring/modes/types';

/**
 * Spillerinfo for PatsomeView. En map fra userId → navn + kallenavn.
 * Caller (leaderboard-page) bygger map-en fra game_players-joinen.
 */
export interface PatsomePlayerInfo {
  name: string;
  nickname: string | null;
}

export interface PatsomeViewProps {
  /** Spill-id — brukes til (fremtidig) drilldown og analytics. */
  gameId: string;
  /** Turneringsnavn — vises som kicker i header. */
  gameName: string;
  /**
   * Resultat fra `lib/scoring/modes/patsome.compute()`.
   * Caller må narrowe på `kind === 'patsome'` før propen sendes inn.
   */
  result: PatsomeResult;
  /**
   * Spillerinfo per userId for å rendre partnernavn.
   * Gjenbruker samme form som TeamStablefordView via SoloStablefordPlayerInfo-mønstret.
   */
  playersById: Map<string, PatsomePlayerInfo>;
  /**
   * Score-visibility-flagget fra `games.score_visibility`. Når `'reveal'`
   * og spillet ikke er ferdig, skjuler vi totaler og per-hull-tabellen.
   */
  scoreVisibility: 'live' | 'reveal';
  /** `games.status` — styrer reveal-flow sammen med `scoreVisibility`. */
  gameStatus: 'draft' | 'scheduled' | 'active' | 'finished';
  /** Hvor pilen tilbake skal peke. Defaults til spillets hjem. */
  backHref?: string;
  /**
   * Når true, dropper outer Shell + Header — caller eier ytre page-chrome.
   * Brukes når PatsomePodium wrapper view-en under ferdig-tilstand.
   */
  chromeless?: boolean;
}

const SEGMENT_LABELS: Record<PatsomeSegment, string> = {
  fourball: '4BBB',
  greensome: 'Greensome',
  foursomes: 'Foursomes',
};

/**
 * Konverterer en liste userIds + map til en lesbar partner-streng.
 * Bruker fornavn for kompakt layout («Alice · Bjørn»).
 */
function teamPartnerLabel(
  playerIds: string[],
  playersById: Map<string, PatsomePlayerInfo>,
  noPlayersLabel: string,
  unknownLabel: string,
): string {
  if (playerIds.length === 0) return noPlayersLabel;
  const labels = playerIds.map((id) => {
    const info = playersById.get(id);
    if (!info) return unknownLabel;
    const first = firstName(info.name);
    return first ?? formatRevealName(info.name, info.nickname);
  });
  return labels.join(' · ');
}

/**
 * Live/post-finished leaderboard for Patsome. To seksjoner:
 *
 *   - Rangert lag-tabell øverst: rang, lagnavn, segment-delsummer, totalpoeng.
 *   - Per-hull-rutenett (drilldown): hull × lag med poeng + segment-skiller
 *     etter hull 6 og hull 12.
 *
 * Reveal-modus: skjuler totaler og per-hull-tabell mens spillet er aktivt.
 * Segment-delsummene er formens signatur-element og vises alltid tydelig.
 */
export function PatsomeView({
  gameId: _gameId,
  gameName,
  result,
  playersById,
  scoreVisibility,
  gameStatus,
  backHref = '/',
  chromeless = false,
}: PatsomeViewProps): JSX.Element {
  const t = useTranslations('leaderboard');
  const isRevealHidden =
    scoreVisibility === 'reveal' && gameStatus !== 'finished';

  if (result.teams.length === 0) {
    return (
      <Shell chromeless={chromeless}>
        {!chromeless && <Header gameName={gameName} backHref={backHref} />}
        <p className="mt-12 text-center text-sm text-muted">
          {t('common.noTeams')}
        </p>
      </Shell>
    );
  }

  if (isRevealHidden) {
    return (
      <Shell chromeless={chromeless}>
        {!chromeless && <Header gameName={gameName} backHref={backHref} />}
        <div
          data-testid="patsome-reveal-hidden"
          className="mx-4 mt-12 rounded-2xl border border-dashed border-border bg-surface px-5 py-8 text-center"
        >
          <p className="font-serif text-[18px] font-medium text-text">
            {t('common.revealHiddenTitle')}
          </p>
          <p className="mt-2 font-sans text-xs text-muted">
            {t('patsome.revealHiddenSub')}
          </p>
        </div>
        <PullQuote className="px-6 pt-4 pb-4">{t('common.goodLuck')}</PullQuote>
      </Shell>
    );
  }

  const scoringLabel = result.scoring === 'net' ? t('common.netto') : t('common.brutto');
  const statusLabel = gameStatus === 'finished' ? t('common.after18Holes') : t('common.live');
  const subtitleParts = [statusLabel, 'Patsome', scoringLabel];

  return (
    <Shell chromeless={chromeless}>
      {!chromeless && <Header gameName={gameName} backHref={backHref} />}

      <div className="px-6 pt-1.5 pb-3.5 text-center">
        <h1 className="font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          {t('common.teamLeaderboardHeading')}
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          {subtitleParts.join(' · ')}
        </p>
      </div>

      {/* Rangert lag-tabell */}
      <ul
        data-testid="patsome-leaderboard"
        className="flex flex-col gap-2 px-3.5 pt-3 pb-3.5"
      >
        {result.teams.map((team, i) => (
          <TeamRow
            key={team.teamNumber}
            team={team}
            playersById={playersById}
            staggerIndex={i}
          />
        ))}
      </ul>

      {/* Per-hull-rutenett med segment-skillelinjer */}
      <section className="px-3.5 pt-2 pb-3.5">
        <Kicker tone="muted" className="px-1 pb-2">
          {t('common.perHullKicker')}
        </Kicker>
        <div
          data-testid="patsome-hole-grid"
          className="flex flex-col gap-2"
        >
          {result.teams[0]?.holes.map((hole) => (
            <HoleRow
              key={hole.holeNumber}
              hole={hole}
              teams={result.teams}
              playersById={playersById}
            />
          ))}
        </div>
      </section>

      <PullQuote className="px-6 pt-1 pb-4">{t('common.goodLuck')}</PullQuote>
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
  const t = useTranslations('leaderboard');
  return (
    <header className="mb-2 flex items-center justify-between gap-4">
      <SmartLink
        href={backHref}
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

function TeamRow({
  team,
  playersById,
  staggerIndex,
}: {
  team: PatsomeTeamLine;
  playersById: Map<string, PatsomePlayerInfo>;
  staggerIndex: number;
}) {
  const t = useTranslations('leaderboard');
  const isPodium = team.rank >= 1 && team.rank <= 3;
  const cardClass =
    team.rank === 1
      ? 'border-accent bg-accent/[0.06] shadow-[0_2px_12px_rgba(201,169,97,0.15)]'
      : '';

  const partnerLabel = teamPartnerLabel(
    team.playerIds,
    playersById,
    t('common.noPlayers'),
    t('common.unknownPlayer'),
  );

  const { fourball, greensome, foursomes } = team.segments;

  return (
    <li
      className="list-none reveal-up"
      style={{ animationDelay: `${60 + staggerIndex * 80}ms` }}
    >
      <Card className={`px-4 py-3.5 ${cardClass}`}>
        <div className="flex items-start gap-3.5">
          {/* Rang-indikator */}
          {isPodium ? (
            <span className="shrink-0 mt-0.5">
              <Medallion place={team.rank as 1 | 2 | 3} size={36} />
            </span>
          ) : (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface font-serif text-[18px] font-medium text-muted mt-0.5">
              {team.rank}
            </span>
          )}

          {/* Lag-info + segment-delsummer */}
          <div className="min-w-0 flex-1">
            <p className="font-serif text-[17px] font-medium tracking-[-0.005em] text-text truncate">
              {t('common.teamLabel', { number: team.teamNumber })}
            </p>
            <p className="mt-0.5 text-[12px] text-muted truncate">
              {partnerLabel}
            </p>

            {/* Segment-delsummer — signatur-elementet */}
            <p
              data-testid={`patsome-segments-${team.teamNumber}`}
              className="mt-1.5 text-[11px] tabular-nums text-muted"
            >
              {SEGMENT_LABELS.fourball} {fourball.points}
              {' · '}
              {SEGMENT_LABELS.greensome} {greensome.points}
              {' · '}
              {SEGMENT_LABELS.foursomes} {foursomes.points}
            </p>

            {team.tiedWith.length > 0 && (
              <p className="mt-0.5 text-[11px] text-muted tabular-nums">
                {t('common.tiedWith', {
                  rank: team.rank,
                  teams: team.tiedWith.map((n) => t('common.teamLabel', { number: n })).join(', '),
                })}
              </p>
            )}
          </div>

          {/* Total-poeng */}
          <div className="shrink-0 text-right">
            <span
              data-testid={`patsome-total-${team.teamNumber}`}
              className="score-num block text-[26px] leading-none tracking-[-0.02em] text-text tabular-nums"
            >
              {team.totalPoints}
            </span>
            <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              {t('patsome.totalLabel')}
            </span>
          </div>
        </div>
      </Card>
    </li>
  );
}

/**
 * Én rad i per-hull-rutenettet. Viser hull-nummer, segment-label, par + SI,
 * og per-lag-poeng. En tynn segment-skille-divider vises etter hull 6 og hull 12
 * for å markere grensen mellom de tre segmentene visuelt.
 */
function HoleRow({
  hole,
  teams,
  playersById,
}: {
  hole: PatsomeHoleRow;
  teams: PatsomeTeamLine[];
  playersById: Map<string, PatsomePlayerInfo>;
}) {
  const t = useTranslations('leaderboard');
  const isFirstGreensome = hole.holeNumber === 7;
  const isFirstFoursomes = hole.holeNumber === 13;

  return (
    <>
      {(isFirstGreensome || isFirstFoursomes) && (
        <div
          aria-hidden
          className="flex items-center gap-2 px-1 py-0.5"
        >
          <div className="h-px flex-1 bg-border" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            {isFirstGreensome
              ? SEGMENT_LABELS.greensome
              : SEGMENT_LABELS.foursomes}
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>
      )}

      <div data-testid={`patsome-hole-row-${hole.holeNumber}`}>
      <Card className="px-3.5 py-3">
        {/* Hull-header */}
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-[15px] font-medium tabular-nums text-text">
              Hull {hole.holeNumber}
            </span>
            <span className="text-[10.5px] tabular-nums text-muted">
              Par {hole.par} · SI {hole.strokeIndex}
            </span>
          </div>
          <span className="text-[10.5px] tabular-nums text-muted/60">
            {SEGMENT_LABELS[hole.segment]}
          </span>
        </div>

        {/* Per-lag-poeng */}
        <div className="mt-2 flex gap-3">
          {teams.map((team) => {
            const teamHole = team.holes.find(
              (h) => h.holeNumber === hole.holeNumber,
            );
            const points = teamHole?.teamPoints ?? 0;
            const partnerLabel = teamPartnerLabel(
              team.playerIds,
              playersById,
              t('common.noPlayers'),
              t('common.unknownPlayer'),
            );
            const isUnplayed =
              teamHole === undefined ||
              (hole.segment === 'fourball'
                ? teamHole.players.every((p) => p.gross === null)
                : teamHole.teamGross === null);

            return (
              <div
                key={team.teamNumber}
                className="flex flex-1 flex-col items-center gap-0.5"
              >
                <span
                  className={`tabular-nums font-serif text-[18px] font-medium leading-none ${
                    isUnplayed ? 'text-muted/40' : 'text-text'
                  }`}
                >
                  {isUnplayed ? '—' : points}
                </span>
                <span className="text-[10px] text-muted truncate max-w-[64px] text-center">
                  {partnerLabel}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
      </div>
    </>
  );
}
