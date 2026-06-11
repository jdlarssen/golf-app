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
import type { StablefordTeamResult } from '@/lib/scoring/modes/types';
import type { SoloStablefordPlayerInfo } from './SoloStablefordView';

export interface TeamStablefordViewProps {
  /** Spill-id — brukes til (fremtidig) drilldown og analytics. */
  gameId: string;
  /** Turneringsnavn — vises som kicker i header. */
  gameName: string;
  /**
   * Resultat fra `lib/scoring/modes/stableford.compute()` for team-varianten
   * (par-stableford / 4BBB). Caller må narrowe på `variant === 'team'` før
   * propen sendes inn.
   */
  result: StablefordTeamResult;
  /**
   * Spillerinfo per userId — gjenbruker `SoloStablefordPlayerInfo` slik at
   * leaderboard-page ikke trenger to ulike maps. Team-view rendrer begge
   * partnerne per lag-rad via `formatRevealName` (samme som solo).
   */
  playersById: Map<string, SoloStablefordPlayerInfo>;
  /** Hvor pilen tilbake skal peke. Defaults til spillets hjem. */
  backHref?: string;
  /**
   * Når true, dropper outer Shell + Header — caller eier ytre page-chrome.
   * Brukes (fremtidig) inne i LeaderboardTabs ved side-tournament-fane.
   */
  chromeless?: boolean;
}

/**
 * Aktivt + post-finished leaderboard for par-stableford. Flat liste rangert
 * på lag-poeng (høyest øverst). Speilar `SoloStablefordView` visuelt —
 * forskjellen er at hver rad nå er ET LAG (med begge partnerne navngitt) i
 * stedet for en enkelt spiller.
 *
 * Reveal-flow (confetti + 3-trinns podium) ligger i `TeamStablefordPodium`
 * og rendres når `game.status === 'finished'`. Denne view-en holder seg
 * saklig for å lese som live-leaderboard både midt-runde og post-finished
 * når admin ennå ikke har trigget reveal-flow.
 */
export function TeamStablefordView({
  gameId: _gameId,
  gameName,
  result,
  playersById,
  backHref = '/',
  chromeless = false,
}: TeamStablefordViewProps): JSX.Element {
  const t = useTranslations('leaderboard');

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

  return (
    <Shell chromeless={chromeless}>
      {!chromeless && <Header gameName={gameName} backHref={backHref} />}

      <div className="px-6 pt-1.5 pb-3.5 text-center">
        <h1 className="font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          {t('common.teamLeaderboardHeading')}
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          {t('teamStableford.subtitle')}
        </p>
      </div>

      <ul
        data-testid="stableford-team-leaderboard"
        className="flex flex-col gap-2 px-3.5 pt-3 pb-3.5"
      >
        {result.teams.map((team, i) => (
          <TeamRow
            key={team.teamNumber}
            teamNumber={team.teamNumber}
            rank={team.rank}
            playerIds={team.playerIds}
            playersById={playersById}
            totalPoints={team.totalPoints}
            tiedWith={team.tiedWith}
            staggerIndex={i}
          />
        ))}
      </ul>

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

/**
 * Konverterer en liste userIds + map til en lesbar partner-streng. Bruker
 * fornavn for kompakt layout («Alice · Bjørn») og faller tilbake til hele
 * `formatRevealName`-utgaven hvis fornavnet ikke kan parses (typisk hvis
 * navnet bare er et kallenavn). Tomme lag (skal ikke skje etter validering)
 * får placeholder slik at view-en aldri viser «undefined».
 */
function teamPartnerLabel(
  playerIds: string[],
  playersById: Map<string, SoloStablefordPlayerInfo>,
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

function TeamRow({
  teamNumber,
  rank,
  playerIds,
  playersById,
  totalPoints,
  tiedWith,
  staggerIndex,
}: {
  teamNumber: number;
  rank: number;
  playerIds: string[];
  playersById: Map<string, SoloStablefordPlayerInfo>;
  totalPoints: number;
  tiedWith: number[];
  staggerIndex: number;
}) {
  const t = useTranslations('leaderboard');
  const isPodium = rank >= 1 && rank <= 3;
  // Champagne-tinted Card for vinneren (rank 1), nøytral for 2+ slik at
  // live-leaderboard-en ikke skriker «cermoni». Mirrors SoloStablefordView.
  const cardClass =
    rank === 1
      ? 'border-accent bg-accent/[0.06] shadow-[0_2px_12px_rgba(201,169,97,0.15)]'
      : '';

  const partnerLabel = teamPartnerLabel(
    playerIds,
    playersById,
    t('common.noPlayers'),
    t('common.unknownPlayer'),
  );

  const tiedTeams = tiedWith.map((n) => t('common.teamLabel', { number: n })).join(', ');

  return (
    <li
      className="list-none reveal-up"
      style={{ animationDelay: `${60 + staggerIndex * 80}ms` }}
    >
      <Card className={`flex items-center gap-3.5 px-4 py-3.5 ${cardClass}`}>
        {isPodium ? (
          <span className="shrink-0">
            <Medallion place={rank as 1 | 2 | 3} size={36} />
          </span>
        ) : (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface font-serif text-[18px] font-medium text-muted">
            {rank}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="font-serif text-[17px] font-medium tracking-[-0.005em] text-text truncate">
            {t('common.teamLabel', { number: teamNumber })}
          </p>
          <p className="mt-0.5 text-[12px] text-muted truncate">
            {partnerLabel}
          </p>
          {tiedWith.length > 0 && (
            <p className="mt-0.5 text-[11px] text-muted tabular-nums">
              {t('common.tiedWith', { rank, teams: tiedTeams })}
            </p>
          )}
        </div>

        <div className="shrink-0 text-right">
          <span className="score-num block text-[26px] leading-none tracking-[-0.02em] text-text tabular-nums">
            {totalPoints}
          </span>
          <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            {t('common.poengLabel')}
          </span>
        </div>
      </Card>
    </li>
  );
}
