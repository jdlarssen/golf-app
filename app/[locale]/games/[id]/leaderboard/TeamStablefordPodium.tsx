'use client';

import { useEffect, useState, type JSX } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { Medallion } from '@/components/ui/Medallion';
import { firstName } from '@/lib/firstName';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type { StablefordTeamResult } from '@/lib/scoring/modes/types';
import { LeaderboardShell, LeaderboardHeader } from './LeaderboardChrome';
import { ConfettiBurst } from './ConfettiBurst';
import type { SoloStablefordPlayerInfo } from './SoloStablefordView';

// Distinkt fra solo-key (`torny-stableford-podium-confetti-seen-…`) slik at
// admin som har sett solo-podium for spill X ikke skipper konfettien hvis
// hen kommer tilbake til en par-stableford-podium for samme id (skal ikke
// kunne skje i praksis, men nøkkel-isolasjon koster ingenting).
const STORAGE_PREFIX = 'torny-par-stableford-podium-confetti-seen-';

export interface TeamStablefordPodiumProps {
  /** Spill-id — brukes til drilldown/analytics + sessionStorage-nøkkel. */
  gameId: string;
  /** Turneringsnavn — vises som kicker i header. */
  gameName: string;
  /**
   * Resultat fra `lib/scoring/modes/stableford.compute()` for team-varianten.
   * Caller må narrowe på `variant === 'team'` før propen sendes inn.
   */
  result: StablefordTeamResult;
  /** Spillerinfo per userId for å rendre partnernavn på podium-trinnene. */
  playersById: Map<string, SoloStablefordPlayerInfo>;
  /** Hvor pilen tilbake skal peke. Defaults til spillets hjem. */
  backHref?: string;
  /**
   * Når true, hoppes Shell + Header (back-pil + kicker) over slik at podiet
   * kan rendres inni `LeaderboardTabs`. Outer-callern eier `AppShell + TopBar`
   * og er ansvarlig for chrome. Speiler `State4View`-mønsteret.
   */
  chromeless?: boolean;
}

/**
 * State #4 for par-stableford — feirings-view ved `game.status === 'finished'`.
 *
 * Speilar `SoloStablefordPodium` strukturelt:
 *  1. Champagne-tiered hierarchy — 1. plass midten (høyest trinn), 2. venstre,
 *     3. høyre. Hver podium-trinn viser LAG (Lag N) med begge partnernes
 *     fornavn på en linje under medaljongen.
 *  2. One-shot `ConfettiBurst` på 1.-plass, auto-fyrer på første mount per
 *     browser-sesjon (sessionStorage-key isolert fra solo-podium).
 *  3. Staggered fade-up entry på podium-trinnene via reveal-up.
 *
 * Resten av lagene (rank 4+) ligger i et collapsed `<details>`-element under
 * podiet — default closed. Skjules helt når det ikke finnes ≥4 lag.
 *
 * Hele view-en er client-only fordi confetti-burst + sessionStorage er
 * client-side. Data fetches server-side og pasres som plain props.
 */
export function TeamStablefordPodium({
  gameId,
  gameName,
  result,
  playersById,
  backHref = '/',
  chromeless = false,
}: TeamStablefordPodiumProps): JSX.Element {
  const t = useTranslations('leaderboard');
  const [replayKey, setReplayKey] = useState(0);

  // Auto-fyr konfetti på første besøk per browser-sesjon. Wrapped i try/catch
  // siden sessionStorage kan kaste i private-browsing eller når brukeren har
  // site-data disabled. Samme mønster som SoloStablefordPodium.
  useEffect(() => {
    const key = `${STORAGE_PREFIX}${gameId}`;
    try {
      if (window.sessionStorage.getItem(key) === '1') return;
      window.sessionStorage.setItem(key, '1');
    } catch {
      // Fall through — fyr konfettien uansett om storage er utilgjengelig.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReplayKey(1);
  }, [gameId]);

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

  // Podium-trinnene er rank 1, 2 og 3 — men kun hvis vi faktisk har så mange
  // lag. result.teams er allerede sortert (lavest rank først via compute()).
  const first = result.teams[0];
  const second = result.teams[1] ?? null;
  const third = result.teams[2] ?? null;
  const rest = result.teams.slice(3);

  return (
    <LeaderboardShell chromeless={chromeless}>
      {!chromeless && <LeaderboardHeader gameName={gameName} backHref={backHref} />}

      <div className="px-6 pt-1.5 pb-3.5 text-center">
        <Kicker tone="accent">{t('common.podiumKicker')}</Kicker>
        <h1 className="mt-2 font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          {t('common.winnerTeamAnnounced')}
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          {t('teamStableford.podiumSubtitle')}
        </p>
      </div>

      {/* Podium-container — relative + isolate slik at confetti-burst-en
          kan posisjoneres absolutt mot 1.-plass-cardet uten å lekke ut
          over resten av siden. */}
      <div
        data-testid="stableford-team-podium"
        className="relative isolate px-3.5 pt-3 pb-2"
      >
        {/* Confetti — kun på 1.-plass. Inline med podium-container slik at
            pieces faller "ned" over hele podiet (og over på 2/3 ved siden). */}
        {replayKey > 0 && <ConfettiBurst key={replayKey} />}

        {/* 3-kolonne layout: 2. plass venstre, 1. plass midten (høyere),
            3. plass høyre. Når vi ikke har 3 lag lar vi tom slot stå
            (visuelt sentrert via centered grid). */}
        <div className="grid grid-cols-3 items-end gap-2">
          {/* 2. plass — venstre */}
          <div className="col-start-1">
            {second && (
              <PodiumStep
                rank={2}
                team={second}
                playersById={playersById}
                tier="silver"
                staggerIndex={1}
              />
            )}
          </div>

          {/* 1. plass — midten (høyeste trinn) */}
          <div className="col-start-2">
            <PodiumStep
              rank={1}
              team={first}
              playersById={playersById}
              tier="champagne"
              staggerIndex={0}
            />
          </div>

          {/* 3. plass — høyre */}
          <div className="col-start-3">
            {third && (
              <PodiumStep
                rank={3}
                team={third}
                playersById={playersById}
                tier="bronze"
                staggerIndex={2}
              />
            )}
          </div>
        </div>
      </div>

      {/* Resten av rangeringen — kun hvis det er noen 4+. Collapsed by default. */}
      {rest.length > 0 && (
        <details
          data-testid="stableford-team-rest"
          className="mx-4 mt-4 rounded-2xl border border-border bg-surface px-4 py-3"
        >
          <summary className="cursor-pointer list-none font-serif text-[15px] font-medium tracking-[-0.005em] text-text marker:hidden">
            {t('common.showFullRankingTeams', { count: result.teams.length })}
            <span aria-hidden className="ml-1 text-muted">
              ›
            </span>
          </summary>
          <ul className="mt-3 flex flex-col gap-2 list-none">
            {rest.map((team) => (
              <li key={team.teamNumber} className="list-none">
                <Card className="flex items-center gap-3.5 px-4 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface font-serif text-[18px] font-medium text-muted">
                    {team.rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-serif text-[16px] font-medium tracking-[-0.005em] text-text truncate">
                      {t('common.teamLabel', { number: team.teamNumber })}
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted truncate">
                      {teamPartnerLabel(team.playerIds, playersById, t('common.noPlayers'), t('common.unknownPlayer'))}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="score-num block text-[22px] leading-none tracking-[-0.02em] text-text tabular-nums">
                      {team.totalPoints}
                    </span>
                    <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                      {t('common.poengLabel')}
                    </span>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </details>
      )}

      <PullQuote className="px-6 pt-4 pb-4">{t('common.congratulations')}</PullQuote>
    </LeaderboardShell>
  );
}



type PodiumTier = 'champagne' | 'silver' | 'bronze';

const TIER_HEIGHTS: Record<PodiumTier, string> = {
  champagne: 'min-h-[200px]',
  silver: 'min-h-[170px]',
  bronze: 'min-h-[150px]',
};

const TIER_ACCENT: Record<PodiumTier, string> = {
  // Champagne: forest-tinted bg + champagne border + champagne tekst-accent.
  champagne:
    'border-accent bg-accent/[0.08] shadow-[0_2px_14px_rgba(201,169,97,0.18)]',
  // Silver: en hårfin dempet ring. Mer dempet enn champagne for å la 1.-plassen
  // dominere visuelt.
  silver: 'border-muted/40 bg-surface',
  // Bronse: varmere brun-tone via warning-tokenen. Tørny har ikke en dedikert
  // bronze-token, så warning er nærmeste varme accent.
  bronze: 'border-warning/40 bg-surface',
};

/**
 * Mapper userIds + map til en kompakt partner-streng for podium-trinnet.
 * Bruker fornavn («Alice · Bjørn») for å holde linjen lesbar på små
 * podium-bredder. Faller tilbake til hele `formatRevealName`-utgaven hvis
 * fornavnet ikke kan parses (typisk hvis navnet bare er et kallenavn).
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

function PodiumStep({
  rank,
  team,
  playersById,
  tier,
  staggerIndex,
}: {
  rank: 1 | 2 | 3;
  team: { teamNumber: number; playerIds: string[]; totalPoints: number };
  playersById: Map<string, SoloStablefordPlayerInfo>;
  tier: PodiumTier;
  staggerIndex: number;
}) {
  const t = useTranslations('leaderboard');
  const partners = teamPartnerLabel(
    team.playerIds,
    playersById,
    t('common.noPlayers'),
    t('common.unknownPlayer'),
  );
  const tierClass = TIER_ACCENT[tier];
  const heightClass = TIER_HEIGHTS[tier];
  // Medallion-størrelse: 1.-plass får større for å forsterke hierarkiet.
  const medallionSize = rank === 1 ? 48 : 36;

  return (
    <div
      data-testid={`podium-rank-${rank}`}
      className={`reveal-up flex flex-col items-center justify-end gap-2 rounded-2xl border ${tierClass} ${heightClass} px-2 py-3`}
      style={{ animationDelay: `${80 + staggerIndex * 90}ms` }}
    >
      <Medallion place={rank} size={medallionSize} />

      {/* Lag-label — sentrert, bold-vekt for visuell vekt over partnernavn. */}
      <p className="text-center font-serif text-[14px] font-medium leading-tight tracking-[-0.005em] text-text">
        {t('common.teamLabel', { number: team.teamNumber })}
      </p>

      {/* Partnernavn — sentrert, mindre, brytes på 2 linjer hvis lange. */}
      <p className="text-center font-sans text-[11px] leading-tight text-muted break-words">
        {partners}
      </p>

      {/* Poeng-total */}
      <div className="text-center">
        <span
          className={`score-num block leading-none tracking-[-0.02em] tabular-nums ${
            rank === 1
              ? 'text-[32px] text-accent'
              : rank === 2
                ? 'text-[24px] text-text'
                : 'text-[22px] text-text'
          }`}
        >
          {team.totalPoints}
        </span>
        <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.16em] text-muted">
          {t('common.poengLabel')}
        </span>
      </div>
    </div>
  );
}
