import type { JSX } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Medallion } from '@/components/ui/Medallion';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { LeaderboardBackdrop } from '@/components/illustrations/LeaderboardBackdrop';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type {
  RoundRobinResult,
  RoundRobinPlayerLine,
  RoundRobinSegmentLine,
} from '@/lib/scoring/modes/types';

/**
 * Spillerinfo for RoundRobinView. En map fra userId → navn + kallenavn.
 * Caller (leaderboard-page) bygger map-en fra game_players-joinen og
 * sender den inn slik at view-en kan rendre menneske-lesbare navn der
 * scoring-laget kun har userId-er.
 */
export interface RoundRobinPlayerInfo {
  name: string;
  nickname: string | null;
}

export interface RoundRobinViewProps {
  /** Spill-id — brukes til (fremtidig) drilldown og analytics. */
  gameId: string;
  /** Turneringsnavn — vises som kicker i header. */
  gameName: string;
  /**
   * Resultat fra `lib/scoring/modes/roundRobin.compute()`.
   * Caller må narrowe på `kind === 'round_robin'` før propen sendes inn.
   */
  result: RoundRobinResult;
  /** Spillerinfo per userId for å rendre navn + kallenavn. */
  playersById: Map<string, RoundRobinPlayerInfo>;
  /**
   * Score-visibility-flagget fra `games.score_visibility`. Når `'reveal'`
   * og spillet ikke er ferdig, skjuler vi totaler — kun en venterom-melding
   * vises. Speiler WolfView/BingoBangoBongoView-mønstret.
   */
  scoreVisibility: 'live' | 'reveal';
  /** `games.status` — styrer reveal-flow sammen med `scoreVisibility`. */
  gameStatus: 'draft' | 'scheduled' | 'active' | 'finished';
  /** Hvor pilen tilbake skal peke. Defaults til spillets hjem. */
  backHref?: string;
  /**
   * Når true, dropper outer Shell + Header — caller eier ytre page-chrome.
   * Brukes inne i en parent (podium) wrapper.
   */
  chromeless?: boolean;
}

const SLOT_LABEL: Record<number, string> = { 1: 'A', 2: 'B', 3: 'C', 4: 'D' };
const SEGMENT_HOLES: Record<1 | 2 | 3, string> = {
  1: 'Hull 1–6',
  2: 'Hull 7–12',
  3: 'Hull 13–18',
};

function playerLabel(
  userId: string,
  playersById: Map<string, RoundRobinPlayerInfo>,
): string {
  const info = playersById.get(userId);
  return info ? formatRevealName(info.name, info.nickname) : '(ukjent)';
}

/**
 * Live/post-finished leaderboard for Round Robin. To seksjoner:
 *
 *   - Per-spiller-tabell: rangert på totalHoleWins DESC. Topp 3 får Medallion,
 *     4+ får ren rank-disc. Hoved-tall: hull-seire. Leader-rad får champagne-
 *     accent.
 *   - Segment-sammendrag: for hver spiller de 3 roterende konstellasjonene
 *     (hvem spilleren var partner med + hull-seire/tap/delt i det segmentet).
 *     Forteller Round Robin-historien om hvem som var sterk i hvilken
 *     konstellasjon.
 *
 * Reveal-modus (scoreVisibility='reveal' && status='active'): venterom-melding
 * i stedet for tall. Speiler WolfView-mønstret.
 */
export function RoundRobinView({
  gameId: _gameId,
  gameName,
  result,
  playersById,
  scoreVisibility,
  gameStatus,
  backHref = '/',
  chromeless = false,
}: RoundRobinViewProps): JSX.Element {
  const isRevealHidden =
    scoreVisibility === 'reveal' && gameStatus !== 'finished';

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

  if (isRevealHidden) {
    return (
      <Shell chromeless={chromeless}>
        {!chromeless && <Header gameName={gameName} backHref={backHref} />}
        <div
          data-testid="round-robin-reveal-hidden"
          className="mx-4 mt-12 rounded-2xl border border-dashed border-border bg-surface px-5 py-8 text-center"
        >
          <p className="font-serif text-[18px] font-medium text-text">
            Resultatene avsløres etter runden
          </p>
          <p className="mt-2 font-sans text-xs text-muted">
            Round Robin-poeng holdes hemmelig til admin avslutter spillet.
          </p>
        </div>
        <PullQuote className="px-6 pt-4 pb-4">Lykke til.</PullQuote>
      </Shell>
    );
  }

  const statusLabel = gameStatus === 'finished' ? 'Etter 18 hull' : 'Live';

  return (
    <Shell chromeless={chromeless}>
      {!chromeless && <Header gameName={gameName} backHref={backHref} />}

      <div className="px-6 pt-1.5 pb-3.5 text-center">
        <h1 className="font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          Leaderboard
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          {statusLabel} · Round Robin · {result.allowancePct}% handicap
        </p>
      </div>

      {/* Per-spiller-tabell: primær rangering på hull-seire. */}
      <ul
        data-testid="round-robin-leaderboard"
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
              player={player}
              displayName={displayName}
              staggerIndex={i}
            />
          );
        })}
      </ul>

      {/* Segment-sammendrag: de 3 roterende konstellasjonene per spiller. */}
      <section className="px-3.5 pt-2 pb-3.5">
        <Kicker tone="muted" className="px-1 pb-2">
          SEGMENT-SAMMENDRAG
        </Kicker>
        <ul
          data-testid="round-robin-segment-summary"
          className="flex flex-col gap-3 list-none"
        >
          {result.players.map((player) => {
            const info = playersById.get(player.userId);
            const displayName = info
              ? formatRevealName(info.name, info.nickname)
              : '(ukjent spiller)';
            return (
              <SegmentCard
                key={player.userId}
                player={player}
                displayName={displayName}
                playersById={playersById}
              />
            );
          })}
        </ul>
      </section>

      <PullQuote className="px-6 pt-1 pb-4">Lykke til.</PullQuote>
    </Shell>
  );
}

function PlayerRow({
  player,
  displayName,
  staggerIndex,
}: {
  player: RoundRobinPlayerLine;
  displayName: string;
  staggerIndex: number;
}) {
  const isPodium = player.rank >= 1 && player.rank <= 3;
  const isLeader = player.rank === 1;
  const cardClass = isLeader
    ? 'border-accent bg-accent/[0.06] shadow-[0_2px_12px_rgba(201,169,97,0.15)]'
    : '';

  const slotLabel = SLOT_LABEL[player.teamNumber] ?? String(player.teamNumber);

  return (
    <li
      className="list-none reveal-up"
      style={{ animationDelay: `${60 + staggerIndex * 80}ms` }}
    >
      <Card className={`flex items-center gap-3.5 px-4 py-3.5 ${cardClass}`}>
        {isPodium ? (
          <span className="shrink-0">
            <Medallion place={player.rank as 1 | 2 | 3} size={36} />
          </span>
        ) : (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface font-serif text-[18px] font-medium text-muted">
            {player.rank}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="font-serif text-[17px] font-medium tracking-[-0.005em] text-text truncate">
            {displayName}
          </p>
          <p className="mt-0.5 text-[12px] text-muted tabular-nums">
            Slot {slotLabel}
            {player.tiedWith.length > 0 && (
              <span className="ml-1 text-muted/80">· Delt {player.rank}. plass</span>
            )}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <span
            className={`score-num block leading-none tracking-[-0.02em] tabular-nums ${
              isLeader ? 'text-[28px] text-accent' : 'text-[26px] text-text'
            }`}
          >
            {player.totalHoleWins}
          </span>
          <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            hull
          </span>
        </div>
      </Card>
    </li>
  );
}

function SegmentCard({
  player,
  displayName,
  playersById,
}: {
  player: RoundRobinPlayerLine;
  displayName: string;
  playersById: Map<string, RoundRobinPlayerInfo>;
}) {
  return (
    <li className="list-none" data-testid={`round-robin-segment-card-${player.userId}`}>
      <Card className="px-3.5 py-3">
        <p className="font-serif text-[14px] font-medium tracking-[-0.005em] text-text mb-2">
          {displayName}
        </p>
        <ul className="flex flex-col gap-1.5 list-none">
          {player.segments.map((seg) => (
            <SegmentRow
              key={seg.segment}
              seg={seg}
              playersById={playersById}
            />
          ))}
        </ul>
      </Card>
    </li>
  );
}

function SegmentRow({
  seg,
  playersById,
}: {
  seg: RoundRobinSegmentLine;
  playersById: Map<string, RoundRobinPlayerInfo>;
}) {
  const partnerName = playerLabel(seg.partnerUserId, playersById);
  const oppNames = seg.opponentUserIds
    .map((id) => playerLabel(id, playersById))
    .join(' + ');
  const holeLabel = SEGMENT_HOLES[seg.segment as 1 | 2 | 3] ?? `Seg ${seg.segment}`;

  const resultClass =
    seg.holesWon > seg.holesLost
      ? 'text-accent font-semibold'
      : seg.holesWon < seg.holesLost
        ? 'text-muted'
        : 'text-text';

  return (
    <li className="list-none">
      <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
        <div className="min-w-0">
          <span className="text-muted">{holeLabel}:</span>{' '}
          <span className="text-text">
            med {partnerName}
          </span>
          <span className="mx-1 text-muted/40" aria-hidden>
            vs
          </span>
          <span className="text-muted">{oppNames}</span>
        </div>
        <div
          className={`shrink-0 tabular-nums ${resultClass}`}
          title={`${seg.holesWon} vunnet · ${seg.holesLost} tapt · ${seg.holesHalved} delt`}
        >
          {seg.holesWon}–{seg.holesLost}
          {seg.holesHalved > 0 && (
            <span className="text-muted/70"> ({seg.holesHalved})</span>
          )}
        </div>
      </div>
    </li>
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
