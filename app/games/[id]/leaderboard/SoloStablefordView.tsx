import type { JSX } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Medallion } from '@/components/ui/Medallion';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { LeaderboardBackdrop } from '@/components/illustrations/LeaderboardBackdrop';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type { StablefordResult } from '@/lib/scoring/modes/types';

/**
 * Spillerinfo for SoloStablefordView. En map fra userId → navn + kallenavn.
 * Caller (leaderboard-page) bygger map-en fra game_players-joinen.
 */
export interface SoloStablefordPlayerInfo {
  name: string;
  nickname: string | null;
}

export interface SoloStablefordViewProps {
  /** Spill-id — brukes til (fremtidig) drilldown og analytics. */
  gameId: string;
  /** Turneringsnavn — vises som kicker i header. */
  gameName: string;
  /** Resultat fra `lib/scoring/modes/stableford.compute()`. */
  result: StablefordResult;
  /** Spillerinfo per userId for å rendre navn + kallenavn. */
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
 * State #4 for solo stableford — flat liste sortert på totalPoints (høyest
 * øverst). Speilar State4View visuelt: samme fairway-backdrop, samme
 * Fraunces-for-tall typografi-token, samme champagne-tinted Card-padding.
 * Forskjeller fra best-ball-state-#4:
 *   - ingen lag-gruppering, ingen «Mot par», ingen ModeChip
 *   - top-3 får Medallion (gull/sølv/bronse), 4+ får ren rank-disc
 *   - hver rad har «X hull spilt»-chip ved siden av poeng-totalen
 *
 * Reveal-flow (confetti + podium) er bevisst lagt til fase 6 — denne view-en
 * holder seg saklig så midt-runde-bruk leser som live-leaderboard ikke som
 * cermoni.
 */
export function SoloStablefordView({
  gameId: _gameId,
  gameName,
  result,
  playersById,
  backHref = '/',
  chromeless = false,
}: SoloStablefordViewProps): JSX.Element {
  const subtitleParts = [
    'Etter 18 hull',
    'Stableford',
    'Poeng',
  ];

  if (result.players.length === 0) {
    return (
      <Shell chromeless={chromeless}>
        {!chromeless && <Header gameName={gameName} backHref={backHref} />}
        <p className="mt-12 text-center text-sm text-muted">
          Ingen spillere å vise.
        </p>
      </Shell>
    );
  }

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

      <ul
        data-testid="stableford-leaderboard"
        className="flex flex-col gap-2 px-3.5 pt-3 pb-3.5"
      >
        {result.players.map((player, i) => {
          const info = playersById.get(player.userId);
          const displayName = info
            ? formatRevealName(info.name, info.nickname)
            : '(ukjent spiller)';
          return (
            <PlayerRow
              key={player.userId}
              rank={player.rank}
              displayName={displayName}
              totalPoints={player.totalPoints}
              holesPlayed={player.holesPlayed}
              staggerIndex={i}
            />
          );
        })}
      </ul>

      <PullQuote className="px-6 pt-1 pb-4">Lykke til.</PullQuote>
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

function PlayerRow({
  rank,
  displayName,
  totalPoints,
  holesPlayed,
  staggerIndex,
}: {
  rank: number;
  displayName: string;
  totalPoints: number;
  holesPlayed: number;
  staggerIndex: number;
}) {
  const isPodium = rank >= 1 && rank <= 3;
  // Champagne-tinted Card for vinneren, helt diskret accent for 2-3, og
  // helt nøytral for 4+. Mer subtilt enn State4View sin LeaderCard-hero
  // siden denne view-en brukes både midt-runde og post-finished.
  const cardClass =
    rank === 1
      ? 'border-accent bg-accent/[0.06] shadow-[0_2px_12px_rgba(201,169,97,0.15)]'
      : '';

  return (
    <li className="list-none">
      <Card
        className={`flex items-center gap-3.5 px-4 py-3.5 reveal-up ${cardClass}`}
        style={{ animationDelay: `${60 + staggerIndex * 80}ms` }}
      >
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
            {displayName}
          </p>
          <p className="mt-0.5 text-[12px] text-muted tabular-nums">
            {holesPlayed} hull spilt
          </p>
        </div>

        <div className="shrink-0 text-right">
          <span className="score-num block text-[26px] leading-none tracking-[-0.02em] text-text">
            {totalPoints}
          </span>
          <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            poeng
          </span>
        </div>
      </Card>
    </li>
  );
}
