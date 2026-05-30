'use client';

import { useEffect, useState, type JSX } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { Medallion } from '@/components/ui/Medallion';
import { LeaderboardBackdrop } from '@/components/illustrations/LeaderboardBackdrop';
import { firstName } from '@/lib/firstName';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type { PatsomeResult } from '@/lib/scoring/modes/types';
import { ConfettiBurst } from './ConfettiBurst';
import type { PatsomePlayerInfo } from './PatsomeView';

// Distinkt sessionStorage-prefiks fra andre podium-er.
const STORAGE_PREFIX = 'torny-patsome-podium-confetti-seen-';

export interface PatsomePodiumProps {
  /** Spill-id — brukes til drilldown/analytics + sessionStorage-nøkkel. */
  gameId: string;
  /** Turneringsnavn — vises som kicker i header. */
  gameName: string;
  /**
   * Resultat fra `lib/scoring/modes/patsome.compute()`.
   * Caller må narrowe på `kind === 'patsome'` før propen sendes inn.
   */
  result: PatsomeResult;
  /** Spillerinfo per userId for å rendre partnernavn på podium-trinnene. */
  playersById: Map<string, PatsomePlayerInfo>;
  /** Hvor pilen tilbake skal peke. Defaults til spillets hjem. */
  backHref?: string;
  /**
   * Når true, hoppes Shell + Header over slik at podiet kan rendres inni
   * `LeaderboardTabs`. Speiler TeamStablefordPodium-mønsteret.
   */
  chromeless?: boolean;
}

/**
 * Finished-state view for Patsome — feirings-podium ved
 * `game.status === 'finished'`. Speiler `TeamStablefordPodium` strukturelt:
 *
 *  1. Champagne-tiered podium — 1. plass midten (høyest), 2. venstre, 3. høyre.
 *     Hvert podium-trinn viser «Lag N» med begge partnernes fornavn.
 *  2. One-shot `ConfettiBurst` på 1.-plass, auto-fyrer på første mount per
 *     browser-sesjon via sessionStorage (distinkt nøkkel fra andre podium-er).
 *  3. Resten av lagene (rank 4+) i collapsed `<details>` under podiet.
 */
export function PatsomePodium({
  gameId,
  gameName,
  result,
  playersById,
  backHref = '/',
  chromeless = false,
}: PatsomePodiumProps): JSX.Element {
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
          Ingen lag å vise.
        </p>
      </Shell>
    );
  }

  // result.teams er sortert på rank fra scoring-laget.
  const first = result.teams[0];
  const second = result.teams[1] ?? null;
  const third = result.teams[2] ?? null;
  const rest = result.teams.slice(3);

  const scoringLabel = result.scoring === 'net' ? 'Netto' : 'Brutto';

  return (
    <Shell chromeless={chromeless}>
      {!chromeless && <Header gameName={gameName} backHref={backHref} />}

      <div className="px-6 pt-1.5 pb-3.5 text-center">
        <Kicker tone="accent">PODIUM</Kicker>
        <h1 className="mt-2 font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          Vinnerlaget er kåret
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          Patsome · {scoringLabel}
        </p>
      </div>

      <div
        data-testid="patsome-podium"
        className="relative isolate px-3.5 pt-3 pb-2"
      >
        {replayKey > 0 && <ConfettiBurst key={replayKey} />}

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

      {/* Resten av rangeringen — kun hvis det finnes 4+ lag. */}
      {rest.length > 0 && (
        <details
          data-testid="patsome-rest"
          className="mx-4 mt-4 rounded-2xl border border-border bg-surface px-4 py-3"
        >
          <summary className="cursor-pointer list-none font-serif text-[15px] font-medium tracking-[-0.005em] text-text marker:hidden">
            Se hele rangeringen ({result.teams.length} lag)
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
                      Lag {team.teamNumber}
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted truncate">
                      {teamPartnerLabel(team.playerIds, playersById)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="score-num block text-[22px] leading-none tracking-[-0.02em] text-text tabular-nums">
                      {team.totalPoints}
                    </span>
                    <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                      poeng
                    </span>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </details>
      )}

      <PullQuote className="px-6 pt-4 pb-4">Gratulerer.</PullQuote>
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

function teamPartnerLabel(
  playerIds: string[],
  playersById: Map<string, PatsomePlayerInfo>,
): string {
  if (playerIds.length === 0) return '(uten spillere)';
  const labels = playerIds.map((id) => {
    const info = playersById.get(id);
    if (!info) return '(ukjent)';
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
  playersById: Map<string, PatsomePlayerInfo>;
  tier: PodiumTier;
  staggerIndex: number;
}) {
  const partners = teamPartnerLabel(team.playerIds, playersById);
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
        Lag {team.teamNumber}
      </p>

      <p className="text-center font-sans text-[11px] leading-tight text-muted break-words">
        {partners}
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
          {team.totalPoints}
        </span>
        <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.16em] text-muted">
          poeng
        </span>
      </div>
    </div>
  );
}
