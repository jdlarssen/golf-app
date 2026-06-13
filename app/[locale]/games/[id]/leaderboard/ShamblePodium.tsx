'use client';

import { useEffect, useState, type JSX } from 'react';
import { useTranslations } from 'next-intl';
import { SmartLink } from '@/components/ui/SmartLink';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { Medallion } from '@/components/ui/Medallion';
import { LeaderboardBackdrop } from '@/components/illustrations/LeaderboardBackdrop';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type { ShambleResult, ShambleTeamLine } from '@/lib/scoring/modes/types';
import { ConfettiBurst } from './ConfettiBurst';
import type { ShamblePlayerInfo } from './ShambleView';

// Distinkt sessionStorage-prefiks fra andre podium-er — verifiseres via
// dedikert test slik at konfetti ikke trigges på feil mode.
const STORAGE_PREFIX = 'torny-shamble-podium-confetti-seen-';

export interface ShamblePodiumProps {
  /** Spill-id — brukes til sessionStorage-nøkkel. */
  gameId: string;
  /** Turneringsnavn — vises som kicker i header. */
  gameName: string;
  /**
   * Resultat fra `lib/scoring/modes/shamble.compute()`.
   * Caller må narrowe på `kind === 'shamble'` før propen sendes inn.
   */
  result: ShambleResult;
  /** Spillerinfo per userId for å rendre lag-medlemmenes navn. */
  playersById: Map<string, ShamblePlayerInfo>;
  /** Hvor pilen tilbake skal peke. Defaults til spillets hjem. */
  backHref?: string;
  /**
   * Når true, hoppes Shell + Header (back-pil + kicker) over slik at podiet
   * kan rendres inni `LeaderboardTabs`. Outer-callern eier `AppShell + TopBar`
   * og er ansvarlig for chrome. Speiler `SoloStablefordPodium`-mønsteret.
   */
  chromeless?: boolean;
}

/**
 * Finished-state view for Shamble / Champagne Scramble — feirings-podium ved
 * `game.status === 'finished'`. Speiler TexasScramblePodium tett med disse
 * forskjellene:
 *   - Hoved-tallet er `totalScore` (laveste slagsum vinner).
 *   - Sub-tittel: variant (Shamble / Champagne Scramble) + scoring.
 *   - Distinkt sessionStorage-key: `torny-shamble-podium-confetti-seen-${gameId}`.
 *   - Resten (4.-plass og nedover) vises som flat liste, ikke i <details>.
 */
export function ShamblePodium({
  gameId,
  gameName,
  result,
  playersById,
  backHref = '/',
  chromeless = false,
}: ShamblePodiumProps): JSX.Element {
  const t = useTranslations('leaderboard');
  const [replayKey, setReplayKey] = useState(0);

  useEffect(() => {
    const key = `${STORAGE_PREFIX}${gameId}`;
    try {
      if (window.sessionStorage.getItem(key) === '1') return;
      window.sessionStorage.setItem(key, '1');
    } catch {
      // Storage utilgjengelig — fyr konfettien uansett.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReplayKey(1);
  }, [gameId]);

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

  // result.teams er allerede sortert på rank fra scoring-laget.
  const sortedTeams = [...result.teams].sort((a, b) => a.rank - b.rank);
  const first = sortedTeams[0];
  const second = sortedTeams[1] ?? null;
  const third = sortedTeams[2] ?? null;
  const rest = sortedTeams.slice(3);

  const variantLabel =
    result.variant === 'champagne' ? 'Champagne Scramble' : 'Shamble';
  const scoringLabel = result.scoring === 'net' ? t('common.netto') : t('common.brutto');

  return (
    <Shell chromeless={chromeless}>
      {!chromeless && <Header gameName={gameName} backHref={backHref} />}

      <div className="px-6 pt-1.5 pb-3.5 text-center">
        <Kicker tone="accent">{t('common.podiumKicker')}</Kicker>
        <h1 className="mt-2 font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          {t('common.winnerTeamAnnounced2')}
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          {variantLabel} · {scoringLabel} · {t('common.after18Holes')}
        </p>
      </div>

      <div
        data-testid="shamble-podium"
        className="relative isolate px-3.5 pt-3 pb-2"
      >
        {replayKey > 0 && <ConfettiBurst key={replayKey} />}

        <div className="grid grid-cols-3 items-end gap-2">
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

          <div className="col-start-2">
            <PodiumStep
              rank={1}
              team={first}
              playersById={playersById}
              tier="champagne"
              staggerIndex={0}
            />
          </div>

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

      {rest.length > 0 && (
        <ul
          data-testid="shamble-rest"
          className="mx-4 mt-4 flex flex-col gap-2 list-none"
        >
          {rest.map((team) => {
            const memberNames = team.members
              .map((uid) => {
                const info = playersById.get(uid);
                return info
                  ? formatRevealName(info.name, info.nickname)
                  : t('common.unknownPlayer');
              })
              .join(', ');
            return (
              <li key={team.teamNumber} className="list-none">
                <Card className="flex items-center gap-3.5 px-4 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface font-serif text-[18px] font-medium text-muted tabular-nums">
                    {team.rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-serif text-[16px] font-medium tracking-[-0.005em] text-text truncate">
                      {t('common.teamLabel', { number: team.teamNumber })}
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted truncate">
                      {memberNames}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="score-num block text-[22px] leading-none tracking-[-0.02em] text-text tabular-nums">
                      {team.totalScore}
                    </span>
                    <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                      {t('common.slagLabel')}
                    </span>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <PullQuote className="px-6 pt-4 pb-4">{t('common.congratulations')}</PullQuote>
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

type PodiumTier = 'champagne' | 'silver' | 'bronze';

const TIER_HEIGHTS: Record<PodiumTier, string> = {
  champagne: 'min-h-[200px]',
  silver: 'min-h-[170px]',
  bronze: 'min-h-[150px]',
};

const TIER_ACCENT: Record<PodiumTier, string> = {
  champagne:
    'border-accent bg-accent/[0.08] shadow-[0_2px_14px_rgba(201,169,97,0.18)]',
  silver: 'border-muted/40 bg-surface',
  bronze: 'border-warning/40 bg-surface',
};

function PodiumStep({
  rank,
  team,
  playersById,
  tier,
  staggerIndex,
}: {
  rank: 1 | 2 | 3;
  team: ShambleTeamLine;
  playersById: Map<string, ShamblePlayerInfo>;
  tier: PodiumTier;
  staggerIndex: number;
}) {
  const t = useTranslations('leaderboard');
  const memberNames = team.members
    .map((uid) => {
      const info = playersById.get(uid);
      return info ? formatRevealName(info.name, info.nickname) : t('common.unknownPlayer');
    })
    .join(', ');

  const tierClass = TIER_ACCENT[tier];
  const heightClass = TIER_HEIGHTS[tier];
  const medallionSize = rank === 1 ? 48 : 36;

  return (
    <div
      data-testid={`podium-rank-${rank}`}
      className={`reveal-up flex flex-col items-center justify-end gap-2 rounded-2xl border ${tierClass} ${heightClass} px-2 py-3`}
      style={{ animationDelay: `${80 + staggerIndex * 90}ms` }}
    >
      <Medallion place={rank} size={medallionSize} />

      <p className="text-center font-serif text-[14px] font-medium leading-tight tracking-[-0.005em] text-text">
        {t('common.teamLabel', { number: team.teamNumber })}
      </p>
      <p className="text-center text-[10.5px] leading-tight text-muted break-words">
        {memberNames}
      </p>

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
          {team.totalScore}
        </span>
        <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.16em] text-muted">
          {t('common.slagLabel')}
        </span>
      </div>
    </div>
  );
}
