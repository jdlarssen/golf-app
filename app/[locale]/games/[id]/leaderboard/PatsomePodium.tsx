'use client';

import { useEffect, useState, type JSX } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { Medallion } from '@/components/ui/Medallion';
import { firstName } from '@/lib/firstName';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type { PatsomeResult, PatsomeTeamLine } from '@/lib/scoring/modes/types';
import { LeaderboardShell, LeaderboardHeader } from './LeaderboardChrome';
import {
  PLACE_TIER,
  SLOT_HEIGHTS_TALL,
  TIER_ACCENT,
  podiumPlace,
  type PodiumSlot,
} from './podiumPresentation';
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
      <LeaderboardShell chromeless={chromeless}>
        {!chromeless && <LeaderboardHeader gameName={gameName} backHref={backHref} />}
        <p className="mt-12 text-center text-sm text-muted">
          {t('common.noTeams')}
        </p>
      </LeaderboardShell>
    );
  }

  // Podium-slottene fylles i sortert rekkefølge (rank 1 først) — men
  // presentasjonen per trinn følger lagets FAKTISKE rank (#1573).
  const first = result.teams[0];
  const second = result.teams[1] ?? null;
  const third = result.teams[2] ?? null;
  const rest = result.teams.slice(3);
  const tiedBadge = (team: PatsomeTeamLine): string | null =>
    team.tiedWith.length > 0
      ? t('common.tiedRank', { rank: team.rank })
      : null;

  const scoringLabel = result.scoring === 'net' ? t('common.netto') : t('common.brutto');

  return (
    <LeaderboardShell chromeless={chromeless}>
      {!chromeless && <LeaderboardHeader gameName={gameName} backHref={backHref} />}

      <div className="px-6 pt-1.5 pb-3.5 text-center">
        <Kicker tone="accent">{t('common.podiumKicker')}</Kicker>
        <h1 className="mt-2 font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          {t('common.winnerTeamAnnounced')}
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          {t('patsome.podiumSubtitle', { scoring: scoringLabel })}
        </p>
      </div>

      <div
        data-testid="patsome-podium"
        className="relative isolate px-3.5 pt-3 pb-2"
      >
        {replayKey > 0 && <ConfettiBurst key={replayKey} />}

        <div className="grid grid-cols-3 items-end gap-2">
          {/* Slot 2 — venstre (andrelaget i sortert rekkefølge) */}
          <div className="col-start-1">
            {second && (
              <PodiumStep
                slot={2}
                team={second}
                playersById={playersById}
                staggerIndex={1}
                tiedBadge={tiedBadge(second)}
              />
            )}
          </div>

          {/* Slot 1 — midten (høyeste trinn) */}
          <div className="col-start-2">
            <PodiumStep
              slot={1}
              team={first}
              playersById={playersById}
              staggerIndex={0}
              tiedBadge={tiedBadge(first)}
            />
          </div>

          {/* Slot 3 — høyre (tredjelaget i sortert rekkefølge) */}
          <div className="col-start-3">
            {third && (
              <PodiumStep
                slot={3}
                team={third}
                playersById={playersById}
                staggerIndex={2}
                tiedBadge={tiedBadge(third)}
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

function PodiumStep({
  slot,
  team,
  playersById,
  staggerIndex,
  tiedBadge,
}: {
  /** Grid-posisjon: 1 = midten (høyest trinn), 2 = venstre, 3 = høyre. */
  slot: PodiumSlot;
  team: PatsomeTeamLine;
  playersById: Map<string, PatsomePlayerInfo>;
  staggerIndex: number;
  /** «Delt N. plass»-merke, eller null når laget ikke er delt-rangert. */
  tiedBadge: string | null;
}) {
  const t = useTranslations('leaderboard');
  const partners = teamPartnerLabel(
    team.playerIds,
    playersById,
    t('common.noPlayers'),
    t('common.unknownPlayer'),
  );
  // Akse-splitt (#1573): layout (høyde, testid, stagger) følger slotten;
  // presentasjon (farge, medaljong, tall-styling) følger lagets faktiske rank.
  const place = podiumPlace(team.rank);
  const tierClass = TIER_ACCENT[PLACE_TIER[place]];
  const heightClass = SLOT_HEIGHTS_TALL[slot];
  const medallionSize = place === 1 ? 48 : 36;

  return (
    <div
      data-testid={`podium-rank-${slot}`}
      data-rank={team.rank}
      className={`reveal-up flex flex-col items-center justify-end gap-2 rounded-2xl border ${tierClass} ${heightClass} px-2 py-3`}
      style={{ animationDelay: `${80 + staggerIndex * 90}ms` }}
    >
      <Medallion place={place} size={medallionSize} />

      {tiedBadge && (
        <p
          className={`text-center text-[9px] font-semibold uppercase tracking-[0.14em] ${
            place === 1 ? 'text-accent-text' : 'text-muted'
          }`}
        >
          {tiedBadge}
        </p>
      )}

      <p className="text-center font-serif text-[14px] font-medium leading-tight tracking-[-0.005em] text-text">
        {t('common.teamLabel', { number: team.teamNumber })}
      </p>

      <p className="text-center font-sans text-[11px] leading-tight text-muted break-words">
        {partners}
      </p>

      <div className="text-center">
        <span
          className={`score-num block leading-none tracking-[-0.02em] tabular-nums ${
            place === 1
              ? 'text-[32px] text-accent-text'
              : place === 2
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
