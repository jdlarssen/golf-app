import type { JSX } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { LeaderboardBackdrop } from '@/components/illustrations/LeaderboardBackdrop';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type {
  BingoBangoBongoResult,
  BingoBangoBongoHoleRow,
} from '@/lib/scoring/modes/types';
import type { BingoBangoBongoPlayerInfo } from '../BingoBangoBongoView';

export interface BingoBangoBongoHolesViewProps {
  /** Spill-id — brukes til back-lenke. */
  gameId: string;
  /** Turneringsnavn — vises som kicker i header. */
  gameName: string;
  /**
   * Resultat fra `lib/scoring/modes/bingoBangoBongo.compute()`.
   * Caller må narrowe på `kind === 'bingo_bango_bongo'` før propen sendes inn.
   */
  result: BingoBangoBongoResult;
  /** Spillerinfo per userId for å rendre navn + kallenavn. */
  playersById: Map<string, BingoBangoBongoPlayerInfo>;
  /** `games.score_visibility` normalisert. Styrer reveal-flow. */
  scoreVisibility: 'live' | 'reveal';
  /** `games.status` — styrer reveal-flow sammen med `scoreVisibility`. */
  gameStatus: 'active' | 'finished';
}

/** De tre prestasjonene per hull, i fast rekkefølge. */
const CATEGORIES = [
  { key: 'bingo', label: 'Bingo', hint: 'først på green' },
  { key: 'bango', label: 'Bango', hint: 'nærmest hullet' },
  { key: 'bongo', label: 'Bongo', hint: 'først i hull' },
] as const;

/**
 * Format-bevisst «Hull for hull» for Bingo Bango Bongo (epic #496, PR 6).
 * Erstatter det generiske best-ball lag-scorekortet med en BBB-riktig per-hull-
 * visning. BBB teller ikke slag — poeng deles ut for tre prestasjoner per hull
 * (Bingo / Bango / Bongo). Hvert hull-kort viser de tre prestasjonene og hvem
 * som tok dem (eller «ikke satt»). Dette er eneste sted per-hull-data vises —
 * BingoBangoBongoView (leaderboardet) har kun en aggregert per-spiller-tabell.
 */
export function BingoBangoBongoHolesView({
  gameId,
  gameName,
  result,
  playersById,
  scoreVisibility,
  gameStatus,
}: BingoBangoBongoHolesViewProps): JSX.Element {
  const isRevealHidden =
    scoreVisibility === 'reveal' && gameStatus !== 'finished';

  if (isRevealHidden) {
    return (
      <Shell>
        <Header gameName={gameName} gameId={gameId} />
        <div
          data-testid="bbb-holes-reveal-hidden"
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
          Bingo Bango Bongo
        </p>
      </div>

      <ul
        data-testid="bbb-holes-list"
        className="flex flex-col gap-2.5 px-3.5 pt-1 pb-3.5 list-none"
      >
        {result.holes.map((hole) => (
          <HoleCard
            key={hole.holeNumber}
            hole={hole}
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
  playersById,
}: {
  hole: BingoBangoBongoHoleRow;
  playersById: Map<string, BingoBangoBongoPlayerInfo>;
}) {
  const winnerByKey: Record<'bingo' | 'bango' | 'bongo', string | null> = {
    bingo: hole.bingoUserId,
    bango: hole.bangoUserId,
    bongo: hole.bongoUserId,
  };

  const isPending =
    hole.bingoUserId == null &&
    hole.bangoUserId == null &&
    hole.bongoUserId == null;

  // Sweep: spilleren som tok ≥2 av de tre på hullet (maks én mulig med tre
  // kategorier). Driver accent-uthevningen; tok-alle-tre (=3) gir «Feiet!»-chip.
  let sweepId: string | null = null;
  let sweepPoints = 0;
  for (const [uid, pts] of Object.entries(hole.pointsByPlayer)) {
    if (pts >= 2 && pts > sweepPoints) {
      sweepPoints = pts;
      sweepId = uid;
    }
  }
  const sweptAll = sweepPoints === 3;

  const nameFor = (uid: string): string => {
    const info = playersById.get(uid);
    return info ? formatRevealName(info.name, info.nickname) : '(ukjent spiller)';
  };

  return (
    <li
      className="list-none"
      data-testid={`bbb-holes-card-${hole.holeNumber}`}
    >
      <Card className="px-3.5 py-3">
        {/* Hode: hull-nummer venstre, Venter/Feiet høyre */}
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-serif text-[15px] font-medium tabular-nums text-text">
            Hull {hole.holeNumber}
          </span>
          {sweptAll ? (
            <span className="rounded-full border border-accent/40 bg-accent/[0.08] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-accent">
              ★ Feiet!
            </span>
          ) : isPending ? (
            <span className="text-[11px] uppercase tracking-[0.1em] text-muted">
              Venter
            </span>
          ) : null}
        </div>

        {isPending ? (
          <p className="mt-1.5 text-[12.5px] text-muted">
            Ingen prestasjoner registrert ennå.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 list-none">
            {CATEGORIES.map((cat) => {
              const uid = winnerByKey[cat.key];
              const isSweeper = uid != null && uid === sweepId;
              return (
                <li
                  key={cat.key}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    <span className="font-serif text-[13.5px] font-medium text-text">
                      {cat.label}
                    </span>
                    <span className="truncate text-[10.5px] text-muted">
                      {cat.hint}
                    </span>
                  </span>
                  {uid ? (
                    <span
                      className={`flex shrink-0 items-center gap-1 text-[14px] ${
                        isSweeper
                          ? 'font-semibold text-accent'
                          : 'font-sans text-text'
                      }`}
                    >
                      {isSweeper && (
                        <span aria-hidden className="text-[11px]">
                          ★
                        </span>
                      )}
                      {nameFor(uid)}
                    </span>
                  ) : (
                    <span className="shrink-0 text-[12.5px] text-muted">
                      ikke satt
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </li>
  );
}
