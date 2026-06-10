import type { JSX } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Medallion } from '@/components/ui/Medallion';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { LeaderboardBackdrop } from '@/components/illustrations/LeaderboardBackdrop';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type { TexasScrambleResult } from '@/lib/scoring/modes/types';

/**
 * Spillerinfo for TexasScrambleView. En map fra userId → navn + kallenavn.
 * Caller (leaderboard-page) bygger map-en fra game_players-joinen. Brukes til
 * å vise lag-medlemmenes navn under lag-tittelen.
 */
export interface TexasScramblePlayerInfo {
  name: string;
  nickname: string | null;
}

export interface TexasScrambleViewProps {
  gameId: string;
  gameName: string;
  /**
   * Resultat fra `lib/scoring/modes/texasScramble.compute()`.
   * Caller må narrowe på `kind === 'texas_scramble'` før propen sendes inn.
   */
  result: TexasScrambleResult;
  /** Spillerinfo per userId for å rendre lag-medlemmenes navn. */
  playersById: Map<string, TexasScramblePlayerInfo>;
  backHref?: string;
  /**
   * Når true, dropper outer Shell + Header — caller eier ytre page-chrome.
   * Brukes (fremtidig) inne i LeaderboardTabs ved side-tournament-fane.
   */
  chromeless?: boolean;
  /**
   * Format-navn som vises i sub-tittel. Default «Texas scramble». Settes av
   * caller basert på `game.game_mode` slik at Ambrose-spill viser «Ambrose»
   * i stedet for det hardkodede Texas-navnet.
   */
  formatLabel?: string;
}

/**
 * Live/post-finished leaderboard for Texas scramble — flat liste over lag,
 * sortert på `totalNet` (lavest øverst). Speilar `SoloStrokeplayView` visuelt:
 * fairway-backdrop, Fraunces-for-tall typografi-token, champagne-tint på
 * vinneren.
 *
 * Forskjeller fra solo strokeplay:
 *   - Én rad per lag (ikke per spiller)
 *   - Lag-navn = «Lag N» med medlemsnavn på sekundærlinjen
 *   - Sekundær-linje: medlemmer + brutto-total
 *   - Sub-tittel: «Texas scramble · Sortert på laveste lag-netto»
 *
 * Reveal-flow (separate podium-view) ligger i `TexasScramblePodium` — denne
 * view-en holder seg saklig så midt-runde-bruk leser som live-leaderboard og
 * ikke som seremoni. Status-router i `page.tsx` velger view per `game.status`.
 */
export function TexasScrambleView({
  gameId: _gameId,
  gameName,
  result,
  playersById,
  backHref = '/',
  chromeless = false,
  formatLabel = 'Texas scramble',
}: TexasScrambleViewProps): JSX.Element {
  const subtitleParts = [
    'Etter 18 hull',
    formatLabel,
    'Sortert på laveste lag-netto',
  ];

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

  // Sorter på rank — scoring-laget setter rank, men teams-arrayen kommer
  // sortert på teamNumber, ikke rank. Vi sorterer for å vise vinner-laget
  // øverst på leaderboarden.
  const sortedTeams = [...result.teams].sort((a, b) => a.rank - b.rank);

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
        data-testid="texas-leaderboard"
        className="flex flex-col gap-2 px-3.5 pt-3 pb-3.5"
      >
        {sortedTeams.map((team, i) => {
          const memberNames = team.members
            .map((m) => {
              const info = playersById.get(m.userId);
              return info ? formatRevealName(info.name, info.nickname) : '(ukjent)';
            })
            .join(', ');
          return (
            <TeamRow
              key={team.teamNumber}
              rank={team.rank}
              teamNumber={team.teamNumber}
              memberNames={memberNames}
              totalNet={team.totalNet}
              totalGross={team.totalGross}
              missingHoles={team.missingHoles.length}
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

function TeamRow({
  rank,
  teamNumber,
  memberNames,
  totalNet,
  totalGross,
  missingHoles,
  staggerIndex,
}: {
  rank: number;
  teamNumber: number;
  memberNames: string;
  totalNet: number;
  totalGross: number;
  missingHoles: number;
  staggerIndex: number;
}) {
  const isPodium = rank >= 1 && rank <= 3;
  const cardClass =
    rank === 1
      ? 'border-accent bg-accent/[0.06] shadow-[0_2px_12px_rgba(201,169,97,0.15)]'
      : '';

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
            Lag {teamNumber}
          </p>
          <p className="mt-0.5 text-[12px] text-muted truncate">
            {memberNames}
          </p>
          <p className="mt-0.5 text-[12px] text-muted tabular-nums">
            {totalGross} brutto
            {missingHoles > 0 && (
              <span className="ml-1 text-muted/80">
                · {missingHoles} hull mangler
              </span>
            )}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <span className="score-num block text-[26px] leading-none tracking-[-0.02em] text-text tabular-nums">
            {totalNet}
          </span>
          <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            slag
          </span>
        </div>
      </Card>
    </li>
  );
}
