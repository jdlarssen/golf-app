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
  NinesResult,
  NinesHoleRow,
  NinesPlayerLine,
} from '@/lib/scoring/modes/types';

/**
 * Spillerinfo for NinesView. En map fra userId → navn + kallenavn.
 * Caller (leaderboard-page) bygger map-en fra game_players-joinen og
 * sender den inn slik at view-en kan rendre menneske-lesbare navn der
 * scoring-laget kun har userId-er.
 */
export interface NinesPlayerInfo {
  name: string;
  nickname: string | null;
}

export interface NinesViewProps {
  /** Spill-id — brukes til (fremtidig) drilldown og analytics. */
  gameId: string;
  /** Turneringsnavn — vises som kicker i header. */
  gameName: string;
  /**
   * Resultat fra `lib/scoring/modes/nines.compute()`.
   * Caller må narrowe på `kind === 'nines'` før propen sendes inn.
   */
  result: NinesResult;
  /** Spillerinfo per userId for å rendre navn + kallenavn. */
  playersById: Map<string, NinesPlayerInfo>;
  /**
   * Score-visibility-flagget fra `games.score_visibility`. Når `'reveal'`
   * og spillet ikke er ferdig, skjuler vi totaler og per-hull-tabellen —
   * kun en venterom-melding vises. Når spillet er ferdig konvergerer begge
   * modus på full visning.
   */
  scoreVisibility: 'live' | 'reveal';
  /** `games.status` — styrer reveal-flow sammen med `scoreVisibility`. */
  gameStatus: 'draft' | 'scheduled' | 'active' | 'finished';
  /** Hvor pilen tilbake skal peke. Defaults til spillets hjem. */
  backHref?: string;
  /**
   * Når true, dropper outer Shell + Header — caller eier ytre page-chrome.
   * Brukes inne i LeaderboardTabs eller når en parent (podium) wrapper.
   */
  chromeless?: boolean;
}

/**
 * Live/post-finished leaderboard for Nines / Split Sixes. To seksjoner:
 *
 *   - Rangert spiller-tabell øverst: rang, navn, totalpoeng, antall hull scoret.
 *   - Per-hull-rutenett (debug-vennlig drilldown): hull × spiller med poeng per
 *     hull. Pending hull vises distinkt med —.
 *
 * Variant-chip (Nines / Split Sixes) og scoring (Netto/Brutto) vises i toppen.
 *
 * Reveal-modus (scoreVisibility='reveal' && status!='finished'): venterom-melding
 * i stedet for tall. Speiler SkinsView-mønstret.
 */
export function NinesView({
  gameId: _gameId,
  gameName,
  result,
  playersById,
  scoreVisibility,
  gameStatus,
  backHref = '/',
  chromeless = false,
}: NinesViewProps): JSX.Element {
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
          data-testid="nines-reveal-hidden"
          className="mx-4 mt-12 rounded-2xl border border-dashed border-border bg-surface px-5 py-8 text-center"
        >
          <p className="font-serif text-[18px] font-medium text-text">
            Resultatene avsløres etter runden
          </p>
          <p className="mt-2 font-sans text-xs text-muted">
            Poengene holdes hemmelig til admin avslutter spillet.
          </p>
        </div>
        <PullQuote className="px-6 pt-4 pb-4">Lykke til.</PullQuote>
      </Shell>
    );
  }

  const variantLabel =
    result.variant === 'split_sixes' ? 'Split Sixes' : 'Nines';
  const scoringLabel = result.scoring === 'net' ? 'Netto' : 'Brutto';
  const statusLabel = gameStatus === 'finished' ? 'Etter 18 hull' : 'Live';
  const subtitleParts = [statusLabel, variantLabel, scoringLabel];

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

      {/* Rangert spiller-tabell — primær storyline: hvem leder på poeng. */}
      <ul
        data-testid="nines-leaderboard"
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
              holesScored={player.holesScored}
              tiedWith={player.tiedWith}
              staggerIndex={i}
            />
          );
        })}
      </ul>

      {/* Per-hull-rutenett — sekundær drilldown for poengfordeling. */}
      <section className="px-3.5 pt-2 pb-3.5">
        <Kicker tone="muted" className="px-1 pb-2">
          PER HULL
        </Kicker>
        <ul
          data-testid="nines-hole-list"
          className="flex flex-col gap-2 list-none"
        >
          {result.holes.map((hole) => (
            <HoleRow
              key={hole.holeNumber}
              hole={hole}
              players={result.players}
              playersById={playersById}
            />
          ))}
        </ul>
      </section>

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
  holesScored,
  tiedWith,
  staggerIndex,
}: {
  rank: number;
  displayName: string;
  totalPoints: number;
  holesScored: number;
  tiedWith: string[];
  staggerIndex: number;
}) {
  const isPodium = rank >= 1 && rank <= 3;
  const isTied = tiedWith.length > 0;
  const rankLabel = isTied ? `T${rank}` : `${rank}`;
  const isLeader = rank === 1 && !isTied;
  const cardClass = isLeader
    ? 'border-accent bg-accent/[0.06] shadow-[0_2px_12px_rgba(201,169,97,0.15)]'
    : '';

  return (
    <li
      className="list-none reveal-up"
      style={{ animationDelay: `${60 + staggerIndex * 80}ms` }}
    >
      <Card className={`flex items-center gap-3.5 px-4 py-3.5 ${cardClass}`}>
        {isPodium && !isTied ? (
          <span className="shrink-0">
            <Medallion place={rank as 1 | 2 | 3} size={36} />
          </span>
        ) : (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface font-serif text-[15px] font-medium text-muted tabular-nums">
            {rankLabel}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="font-serif text-[17px] font-medium tracking-[-0.005em] text-text truncate">
            {displayName}
          </p>
          <p className="mt-0.5 text-[12px] text-muted tabular-nums">
            {holesScored} hull scoret
          </p>
          {isTied && (
            <p className="text-[11px] text-muted mt-0.5" data-testid={`nines-tied-${rank}`}>
              Delt {rank}. plass
            </p>
          )}
        </div>

        <div className="shrink-0 text-right">
          <span
            className={`score-num block leading-none tracking-[-0.02em] tabular-nums ${
              isLeader
                ? 'text-[28px] text-accent'
                : 'text-[26px] text-text'
            }`}
          >
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

function HoleRow({
  hole,
  players,
  playersById,
}: {
  hole: NinesHoleRow;
  players: NinesPlayerLine[];
  playersById: Map<string, NinesPlayerInfo>;
}) {
  return (
    <li
      className="list-none"
      data-testid={`nines-hole-row-${hole.holeNumber}`}
    >
      <Card className="px-3.5 py-3">
        {/* Hull-header: nummer + par + SI */}
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-[15px] font-medium tabular-nums text-text">
              Hull {hole.holeNumber}
            </span>
            <span className="text-[10.5px] tabular-nums text-muted">
              Par {hole.par} · SI {hole.strokeIndex}
            </span>
          </div>
          {hole.pending && (
            <span className="text-[10.5px] text-muted/70">Venter på score</span>
          )}
        </div>

        {/* Per-spiller-poeng på dette hullet */}
        <div className="mt-2 flex gap-3">
          {players.map((playerLine) => {
            const entry = hole.perPlayer.find(
              (pp) => pp.userId === playerLine.userId,
            );
            const info = playersById.get(playerLine.userId);
            const displayName = info
              ? formatRevealName(info.name, info.nickname)
              : '(ukjent)';
            const points = entry?.points ?? 0;
            const isPending = hole.pending || entry == null;

            return (
              <div
                key={playerLine.userId}
                className="flex flex-1 flex-col items-center gap-0.5"
              >
                <span
                  className={`tabular-nums font-serif text-[18px] font-medium leading-none ${
                    isPending ? 'text-muted/40' : 'text-text'
                  }`}
                >
                  {isPending ? '—' : points}
                </span>
                <span className="text-[10px] text-muted truncate max-w-[60px] text-center">
                  {displayName}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </li>
  );
}

// Re-export for use in NinesPodium (avoids separate import of the same type).
export type { NinesPlayerLine };
