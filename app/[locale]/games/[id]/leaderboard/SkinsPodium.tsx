'use client';

import { useEffect, useState, type JSX } from 'react';
import { useTranslations } from 'next-intl';
import { SmartLink } from '@/components/ui/SmartLink';
import { AppShell } from '@/components/ui/AppShell';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { Medallion } from '@/components/ui/Medallion';
import { LeaderboardBackdrop } from '@/components/illustrations/LeaderboardBackdrop';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type { SkinsResult, SkinsPlayerLine } from '@/lib/scoring/modes/types';
import { ConfettiBurst } from './ConfettiBurst';
import type { SkinsPlayerInfo } from './SkinsView';

// Distinkt sessionStorage-prefiks fra andre podium-er — inneholder ordet
// 'skins' så vi ikke kolliderer med solo-stableford/solo-strokeplay/wolf/nassau.
const STORAGE_PREFIX = 'torny-skins-podium-confetti-seen-';

export interface SkinsPodiumProps {
  /** Spill-id — brukes til sessionStorage-nøkkel + drilldown. */
  gameId: string;
  /** Turneringsnavn — vises som kicker i header. */
  gameName: string;
  /**
   * Resultat fra `lib/scoring/modes/skins.compute()`.
   * Caller må narrowe på `kind === 'skins'` før propen sendes inn.
   */
  result: SkinsResult;
  /** Spillerinfo per userId for å rendre navn + kallenavn. */
  playersById: Map<string, SkinsPlayerInfo>;
  /** Hvor pilen tilbake skal peke. Defaults til spillets hjem. */
  backHref?: string;
}

/**
 * Finished-state view for Skins — feirings-view ved
 * `game.status === 'finished'`. Speilar `WolfPodium` tett med disse
 * forskjellene:
 *   - Hoved-tallet er `totalSkins` (skins vunnet, ikke poeng).
 *   - Sub-tittel: «Skins · Skins-vinneren kåret».
 *   - Ingen bragging-stat-strip i v1 (deferred per kontrakt #275).
 *   - Distinkt sessionStorage-key: `torny-skins-podium-confetti-seen-${gameId}`.
 *
 * Skins støtter 2–16 spillere (#460). Alle vises: 1./2./3. som tradisjonelle
 * trinn + resten som «sist»-rader under podiet.
 */
export function SkinsPodium({
  gameId,
  gameName,
  result,
  playersById,
  backHref = '/',
}: SkinsPodiumProps): JSX.Element {
  const t = useTranslations('leaderboard');
  const tc = useTranslations('leaderboard.common');

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

  if (result.players.length === 0) {
    return (
      <Shell>
        <Header gameName={gameName} backHref={backHref} />
        <p className="mt-12 text-center text-sm text-muted">
          {tc('noPlayersToShow')}
        </p>
      </Shell>
    );
  }

  // result.players er allerede sortert på rank fra scoring-laget.
  const first = result.players[0];
  const second = result.players[1] ?? null;
  const third = result.players[2] ?? null;
  const rest = result.players.slice(3);

  return (
    <Shell>
      <Header gameName={gameName} backHref={backHref} />

      <div className="px-6 pt-1.5 pb-3.5 text-center">
        <Kicker tone="accent">PODIUM</Kicker>
        <h1 className="mt-2 font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          {t('skins.skinsWinnerKronet')}
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          {t('skins.skinsWinnerSubtitle', { scoring: result.scoring === 'net' ? tc('netto') : tc('brutto') })}
        </p>
      </div>

      <div
        data-testid="skins-podium"
        className="relative isolate px-3.5 pt-3 pb-2"
      >
        {replayKey > 0 && <ConfettiBurst key={replayKey} />}

        <div className="grid grid-cols-3 items-end gap-2">
          <div className="col-start-1">
            {second && (
              <PodiumStep
                rank={2}
                player={second}
                playerInfo={playersById.get(second.userId)}
                tier="silver"
                staggerIndex={1}
                t={t}
              />
            )}
          </div>

          <div className="col-start-2">
            <PodiumStep
              rank={1}
              player={first}
              playerInfo={playersById.get(first.userId)}
              tier="champagne"
              staggerIndex={0}
              t={t}
            />
          </div>

          <div className="col-start-3">
            {third && (
              <PodiumStep
                rank={3}
                player={third}
                playerInfo={playersById.get(third.userId)}
                tier="bronze"
                staggerIndex={2}
                t={t}
              />
            )}
          </div>
        </div>
      </div>

      {rest.length > 0 && (
        <ul
          data-testid="skins-rest"
          className="mx-4 mt-4 flex flex-col gap-2 list-none"
        >
          {rest.map((player) => {
            const info = playersById.get(player.userId);
            const displayName = info
              ? formatRevealName(info.name, info.nickname)
              : '(ukjent spiller)';
            return (
              <li key={player.userId} className="list-none">
                <div className="flex items-center gap-3.5 rounded-2xl border border-border bg-surface px-4 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface font-serif text-[18px] font-medium text-muted">
                    {player.rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-serif text-[16px] font-medium tracking-[-0.005em] text-text truncate">
                      {displayName}
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted tabular-nums">
                      {t('skins.holesWonCount', { count: player.holesWon })}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="score-num block text-[22px] leading-none tracking-[-0.02em] text-text tabular-nums">
                      {player.totalSkins}
                    </span>
                    <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                      {t('skins.skinLabel', { count: player.totalSkins })}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <PullQuote className="px-6 pt-4 pb-4">{tc('congratulations')}</PullQuote>
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

function Header({
  gameName,
  backHref,
}: {
  gameName: string;
  backHref: string;
}) {
  return (
    <header className="mb-2 flex items-center justify-between gap-4">
      <SmartLink
        href={backHref}
        aria-label="Tilbake"
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
  champagne: 'min-h-[180px]',
  silver: 'min-h-[150px]',
  bronze: 'min-h-[130px]',
};

const TIER_ACCENT: Record<PodiumTier, string> = {
  champagne:
    'border-accent bg-accent/[0.08] shadow-[0_2px_14px_rgba(201,169,97,0.18)]',
  silver: 'border-muted/40 bg-surface',
  bronze: 'border-warning/40 bg-surface',
};

function PodiumStep({
  rank,
  player,
  playerInfo,
  tier,
  staggerIndex,
  t,
}: {
  rank: 1 | 2 | 3;
  player: SkinsPlayerLine;
  playerInfo: SkinsPlayerInfo | undefined;
  tier: PodiumTier;
  staggerIndex: number;
  t: ReturnType<typeof useTranslations>;
}) {
  const displayName = playerInfo
    ? formatRevealName(playerInfo.name, playerInfo.nickname)
    : '(ukjent spiller)';

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

      <p className="text-center font-serif text-[13px] font-medium leading-tight tracking-[-0.005em] text-text break-words">
        {displayName}
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
          {player.totalSkins}
        </span>
        <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.16em] text-muted">
          {t('skins.skinLabel', { count: player.totalSkins })}
        </span>
      </div>

      <p className="text-[10px] tabular-nums text-muted">
        {t('skins.holesWonCount', { count: player.holesWon })}
      </p>
    </div>
  );
}
