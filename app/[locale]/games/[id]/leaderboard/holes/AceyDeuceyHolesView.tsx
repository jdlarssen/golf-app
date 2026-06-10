import type { JSX } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { LeaderboardBackdrop } from '@/components/illustrations/LeaderboardBackdrop';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type { AceyDeuceyResult, AceyDeuceyHoleRow } from '@/lib/scoring/modes/types';
import type { AceyDeuceyPlayerInfo } from '../AceyDeuceyView';

export interface AceyDeuceyHolesViewProps {
  /** Spill-id — brukes til back-lenke. */
  gameId: string;
  /** Turneringsnavn — vises som kicker i header. */
  gameName: string;
  /**
   * Resultat fra `lib/scoring/modes/aceyDeucey.compute()`.
   * Caller må narrowe på `kind === 'acey_deucey'` før propen sendes inn.
   */
  result: AceyDeuceyResult;
  /** Spillerinfo per userId for å rendre navn + kallenavn. */
  playersById: Map<string, AceyDeuceyPlayerInfo>;
  /** `games.score_visibility` normalisert. Styrer reveal-flow. */
  scoreVisibility: 'live' | 'reveal';
  /** `games.status` — styrer reveal-flow sammen med `scoreVisibility`. */
  gameStatus: 'active' | 'finished';
}

type AdCell = AceyDeuceyHoleRow['perPlayer'][number];

/** Poeng-formatering: +3 / 0 / −3 (U+2212 MINUS SIGN, ikke bindestrek). */
function formatPoints(points: number): string {
  if (points > 0) return `+${points}`;
  if (points < 0) return `−${Math.abs(points)}`;
  return '0';
}

/**
 * Format-bevisst «Hull for hull» for Acey-Deucey (epic #496, PR 5). Erstatter
 * det generiske best-ball lag-scorekortet med en Acey-Deucey-riktig per-hull-
 * visning: alle fire spillere rangert på score, med ace (unik lavest, +3)
 * uthevet i champagne og deuce (unik høyest, −3) i en kald markering — det
 * AceyDeuceyView sin kompakte PER HULL (kun ace/deuce-navn) mangler.
 */
export function AceyDeuceyHolesView({
  gameId,
  gameName,
  result,
  playersById,
  scoreVisibility,
  gameStatus,
}: AceyDeuceyHolesViewProps): JSX.Element {
  const isRevealHidden =
    scoreVisibility === 'reveal' && gameStatus !== 'finished';

  if (isRevealHidden) {
    return (
      <Shell>
        <Header gameName={gameName} gameId={gameId} />
        <div
          data-testid="acey-deucey-holes-reveal-hidden"
          className="mx-4 mt-12 rounded-2xl border border-dashed border-border bg-surface px-5 py-8 text-center"
        >
          <p className="font-serif text-[18px] font-medium text-text">
            Resultatene avsløres etter runden
          </p>
          <p className="mt-2 font-sans text-xs text-muted">
            Hull for hull åpnes når admin avslutter spillet.
          </p>
        </div>
        <PullQuote className="px-6 pt-4 pb-4">Lykke til.</PullQuote>
      </Shell>
    );
  }

  return (
    <Shell>
      <Header gameName={gameName} gameId={gameId} />

      <div className="px-6 pt-1.5 pb-3.5 text-center">
        <h1 className="font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          Hull for hull
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          Acey Deucey · {result.scoring === 'net' ? 'Netto' : 'Brutto'}
        </p>
      </div>

      <ul
        data-testid="acey-deucey-holes-list"
        className="flex flex-col gap-2.5 px-3.5 pt-1 pb-3.5 list-none"
      >
        {result.holes.map((hole) => (
          <HoleCard
            key={hole.holeNumber}
            hole={hole}
            scoring={result.scoring}
            playersById={playersById}
          />
        ))}
      </ul>

      <PullQuote className="px-6 pt-1 pb-4">Godt spilt.</PullQuote>
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

function Header({ gameName, gameId }: { gameName: string; gameId: string }) {
  return (
    <header className="mb-2 flex items-center justify-between gap-4">
      <SmartLink
        href={`/games/${gameId}`}
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

function HoleCard({
  hole,
  scoring,
  playersById,
}: {
  hole: AceyDeuceyHoleRow;
  scoring: AceyDeuceyResult['scoring'];
  playersById: Map<string, AceyDeuceyPlayerInfo>;
}) {
  // Scoret hull: rangér på effective-score ASC (ace øverst, deuce nederst).
  // Uferdig hull: behold ctx.players-rekkefølge (ingen meningsfull rangering).
  const rows: AdCell[] = hole.scored
    ? [...hole.perPlayer].sort(
        (a, b) =>
          (a.effectiveScore ?? Infinity) - (b.effectiveScore ?? Infinity),
      )
    : hole.perPlayer;

  return (
    <li
      className="list-none"
      data-testid={`acey-deucey-holes-card-${hole.holeNumber}`}
    >
      <Card className="px-3.5 py-3">
        {/* Hode: hull + par/SI venstre, venter-status høyre */}
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-[15px] font-medium tabular-nums text-text">
              Hull {hole.holeNumber}
            </span>
            <span className="text-[10.5px] tabular-nums text-muted">
              Par {hole.par} · SI {hole.strokeIndex}
            </span>
          </div>
          {!hole.scored && (
            <span className="text-[10.5px] text-muted/70">Venter</span>
          )}
        </div>

        {/* Per-spiller: score + ace/deuce-markering + poeng. */}
        <ul className="mt-2 flex flex-col gap-1 list-none">
          {rows.map((cell) => {
            const info = playersById.get(cell.userId);
            const name = info
              ? formatRevealName(info.name, info.nickname)
              : '(ukjent spiller)';
            const isAce = hole.scored && cell.userId === hole.aceUserId;
            const isDeuce = hole.scored && cell.userId === hole.deuceUserId;
            const showGross =
              scoring === 'net' &&
              cell.gross != null &&
              cell.gross !== cell.effectiveScore;

            // Ace = varm champagne-glød. Deuce = kald, dempet ramme. Midten nøytral.
            const rowClass = isAce
              ? 'border border-accent/40 bg-accent/[0.06]'
              : isDeuce
                ? 'border border-border bg-surface-2'
                : 'border border-transparent';

            return (
              <li
                key={cell.userId}
                className={`flex items-center justify-between gap-3 rounded-xl px-2.5 py-1.5 ${rowClass}`}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {isAce && (
                    <span aria-hidden className="text-[11px] text-accent">
                      ★
                    </span>
                  )}
                  <span
                    className={`truncate font-sans text-[14px] ${
                      isAce ? 'font-medium text-text' : 'text-text'
                    }`}
                  >
                    {name}
                  </span>
                </span>
                <span className="flex shrink-0 items-baseline gap-1.5 tabular-nums">
                  {hole.scored && (
                    <span
                      className={`text-[12px] font-semibold ${
                        isAce
                          ? 'text-accent'
                          : isDeuce
                            ? 'text-muted'
                            : 'text-muted/40'
                      }`}
                    >
                      {formatPoints(cell.points)}
                    </span>
                  )}
                  {showGross && (
                    <span className="text-[10.5px] text-muted/70">
                      brutto {cell.gross}
                    </span>
                  )}
                  <span
                    className={`score-num text-[18px] leading-none ${
                      isAce ? 'text-accent' : isDeuce ? 'text-muted' : 'text-text'
                    }`}
                  >
                    {cell.effectiveScore ?? '–'}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
    </li>
  );
}
