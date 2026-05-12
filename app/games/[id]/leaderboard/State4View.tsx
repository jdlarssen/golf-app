'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Laurel, PinFlagSm } from '@/components/icons';
import { Medallion } from '@/components/ui/Medallion';
import { firstName } from '@/lib/firstName';
import {
  playerDisplayName,
  type LeaderboardMode,
  type TeamLine,
} from '@/lib/leaderboard';
import { ConfettiBurst } from './ConfettiBurst';

const STORAGE_PREFIX = 'torny-leaderboard-confetti-seen-';

type Props = {
  gameId: string;
  /** Tournament name — shown as the header kicker. */
  gameName: string;
  /** All teams pre-sorted by rank ascending. */
  teams: TeamLine[];
  mode: LeaderboardMode;
  /** Sum of par across all played holes (typically 72). Used for "Mot par". */
  coursePar: number;
};

/**
 * State #4 — the leaderboard reveal. Shown when `game.status === 'finished'`.
 *
 * Three coordinated visual moves per quick-win-5 spec:
 *   1. Champagne-tiered hierarchy — leader gets a hero card, others get
 *      slimmer rows.
 *   2. One-shot confetti burst from the top of the leader card, controllable
 *      via the header's `Spill av`-pill.
 *   3. Staggered fade-up entry for each team card.
 *
 * The whole view is a client component because the replay pill and confetti
 * share state — bumping `replayKey` re-mounts the burst. Data is fetched by
 * the server page and passed in as plain props.
 */
export function State4View({
  gameId,
  gameName,
  teams,
  mode,
  coursePar,
}: Props) {
  const [replayKey, setReplayKey] = useState(0);

  // Auto-fire confetti on first visit per browser session. Re-fires happen
  // through the Replay pill which bumps `replayKey` directly. Wrapped in
  // try/catch since sessionStorage can throw in private-browsing or when
  // the user has site-data disabled.
  //
  // The setState-in-effect lint warning is correct in general (it can cascade
  // renders) but here we genuinely need to read sessionStorage post-mount —
  // it isn't available during SSR — and the resulting state flip is the
  // one-shot "okay, fire the confetti" toggle. Disable inline.
  useEffect(() => {
    const key = `${STORAGE_PREFIX}${gameId}`;
    try {
      if (window.sessionStorage.getItem(key) === '1') return;
      window.sessionStorage.setItem(key, '1');
    } catch {
      // Fall through — fire confetti anyway when storage is unavailable;
      // worst case the user sees it again on next mount.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReplayKey(1);
  }, [gameId]);

  const onReplay = () => setReplayKey((k) => k + 1);

  if (teams.length === 0) {
    return (
      <Shell>
        <Header gameName={gameName} onReplay={null} />
        <p className="mt-12 text-center text-sm text-muted">Ingen lag å vise.</p>
      </Shell>
    );
  }

  const leader = teams[0]!;
  const rest = teams.slice(1);
  const subtitleParts = [
    'Etter 18 hull',
    'Best ball',
    mode === 'netto' ? 'Netto' : 'Brutto',
  ];

  return (
    <Shell>
      <Header gameName={gameName} onReplay={onReplay} />

      <div className="px-6 pt-1.5 pb-3.5 text-center">
        <h1 className="font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          Leaderboard
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">
          {subtitleParts.join(' · ')}
        </p>
      </div>

      <ModeChip gameId={gameId} mode={mode} />

      <div className="relative px-3.5 pt-3">
        <ConfettiBurst trigger={replayKey} />
        <LeaderCard
          gameId={gameId}
          mode={mode}
          line={leader}
          coursePar={coursePar}
        />
      </div>

      <ul className="flex flex-col gap-2 px-3.5 pt-1.5 pb-3.5">
        {rest.map((line, i) => (
          <TeamRow
            key={line.teamNumber}
            gameId={gameId}
            mode={mode}
            line={line}
            leaderTotal={leader.total}
            coursePar={coursePar}
            staggerIndex={i}
          />
        ))}
      </ul>

      <p className="px-6 pt-1 pb-5 text-center font-serif text-[11px] italic text-muted">
        Tap et lag for hull-for-hull
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="mx-auto max-w-md pb-12">{children}</div>
    </div>
  );
}

function Header({
  gameName,
  onReplay,
}: {
  gameName: string;
  onReplay: (() => void) | null;
}) {
  return (
    <header className="flex items-center justify-between gap-2 px-4 pb-2 pt-3.5">
      <Link
        href="/"
        aria-label="Hjem"
        className="-ml-2 inline-flex h-8 w-8 items-center justify-center text-lg text-text"
      >
        ‹
      </Link>
      <span className="flex-1 truncate text-center text-[10px] font-semibold uppercase tracking-[0.20em] text-muted">
        {gameName}
      </span>
      {onReplay ? (
        <button
          type="button"
          onClick={onReplay}
          aria-label="Spill av konfetti på nytt"
          className="inline-flex items-center rounded-full border border-border bg-[rgba(229,224,211,0.5)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted hover:bg-[rgba(229,224,211,0.7)] dark:bg-[rgba(45,63,50,0.6)] dark:hover:bg-[rgba(45,63,50,0.8)]"
        >
          Spill av
        </button>
      ) : (
        <span className="w-8" aria-hidden />
      )}
    </header>
  );
}

function ModeChip({
  gameId,
  mode,
}: {
  gameId: string;
  mode: LeaderboardMode;
}) {
  const other: LeaderboardMode = mode === 'netto' ? 'brutto' : 'netto';
  return (
    <div className="flex justify-center pb-2">
      <Link
        href={`/games/${gameId}/leaderboard?mode=${other}`}
        className="inline-flex items-center rounded-full border border-border bg-surface px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted"
      >
        Bytt til {other}
      </Link>
    </div>
  );
}

function LeaderCard({
  gameId,
  mode,
  line,
  coursePar,
}: {
  gameId: string;
  mode: LeaderboardMode;
  line: TeamLine;
  coursePar: number;
}) {
  const vsPar = line.total - coursePar;
  const playersLine = line.players.map((p) => playerDisplayName(p)).join(' · ');
  const drilldownHref = `/games/${gameId}/leaderboard/holes?team=${line.teamNumber}&mode=${mode}`;

  return (
    // Two-layer structure: outer wrapper owns the entry animation (reveal-up),
    // inner wrapper owns the chrome + shimmer (leader-card + leader-shimmer).
    // Both classes set the `animation` shorthand; the CSS cascade lets the
    // later-declared rule win, so stacking them on a single element silently
    // dropped one of the two animations and left the card at the reveal-up
    // baseline (opacity: 0). Splitting them onto separate elements lets each
    // animation own its own property.
    <div className="reveal-up mb-3" style={{ animationDelay: '60ms' }}>
      <div className="leader-card leader-shimmer relative rounded-[18px] px-[22px] pt-[22px] pb-5">
        {/* Decorative laurels flanking the rank. opacity-55 per spec. */}
        <div className="pointer-events-none absolute left-3.5 top-[18px] text-accent opacity-55">
          <Laurel height={68} />
        </div>
        <div
          className="pointer-events-none absolute right-3.5 top-[18px] text-accent opacity-55"
          style={{ transform: 'scaleX(-1)' }}
        >
          <Laurel height={68} />
        </div>

        <div className="relative flex flex-col items-center">
          <span className="leader-badge-pulse text-[10px] font-semibold uppercase tracking-[0.20em] text-accent">
            Leder · {line.rank}. plass
          </span>
          <span
            className="score-num my-1 text-[64px] leading-none tracking-[-0.04em] text-accent"
            style={{ textShadow: '0 1px 0 rgba(184,148,70,0.3)' }}
          >
            {line.rank}
          </span>
          <div className="mt-1 flex items-center gap-2">
            <PinFlagSm size={14} />
            <h2 className="m-0 font-serif text-[26px] font-medium tracking-[-0.015em] text-text">
              Lag {line.teamNumber}
            </h2>
            <PinFlagSm size={14} />
          </div>
        </div>

        <div
          className="mt-[18px] flex items-end justify-between pt-3.5"
          style={{ borderTop: '1px solid rgba(201,169,97,0.4)' }}
        >
          <div className="text-left">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.20em] text-muted">
              Total netto
            </span>
            <span className="score-num mt-0.5 block text-[34px] leading-none tracking-[-0.02em] text-text">
              {line.total}
            </span>
          </div>
          <div className="text-right">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.20em] text-muted">
              Mot par
            </span>
            <span
              className={`score-num mt-0.5 block text-[34px] leading-none tracking-[-0.02em] ${
                vsPar < 0 ? 'text-score-under-fg' : 'text-text'
              }`}
            >
              {formatVsPar(vsPar)}
            </span>
          </div>
        </div>

        <p className="mt-3.5 text-center text-[12px] text-muted">{playersLine}</p>

        <Link
          href={drilldownHref}
          aria-label={`Vis hull-for-hull for lag ${line.teamNumber}`}
          className="absolute inset-0 rounded-[18px]"
        />
      </div>
    </div>
  );
}

function TeamRow({
  gameId,
  mode,
  line,
  leaderTotal,
  coursePar,
  staggerIndex,
}: {
  gameId: string;
  mode: LeaderboardMode;
  line: TeamLine;
  leaderTotal: number;
  coursePar: number;
  staggerIndex: number;
}) {
  const gap = line.total - leaderTotal;
  const vsPar = line.total - coursePar;
  const firstNames = line.players
    .map((p) => firstName(p.name) ?? p.name)
    .join(' · ');
  const isTied = line.tiedWith.length > 0;
  const drilldownHref = `/games/${gameId}/leaderboard/holes?team=${line.teamNumber}&mode=${mode}`;

  return (
    <li className="list-none">
      <Link
        href={drilldownHref}
        className="reveal-up flex items-center gap-3.5 rounded-[14px] border border-border bg-surface px-4 py-3.5 shadow-[0_1px_2px_rgba(26,46,31,0.04),0_2px_6px_rgba(26,46,31,0.03)] active:scale-[0.99]"
        style={{ animationDelay: `${140 + staggerIndex * 80}ms` }}
      >
        {line.rank === 2 || line.rank === 3 ? (
          <span className="shrink-0">
            <Medallion place={line.rank} size={36} />
          </span>
        ) : (
          <span className="score-num w-6 shrink-0 text-center text-[20px] text-muted">
            {line.rank}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-serif text-[17px] font-medium tracking-[-0.005em] text-text">
            Lag {line.teamNumber}
          </p>
          <p className="mt-0.5 truncate text-[11.5px] text-muted">
            {firstNames || '(uten spillere)'}
            {gap > 0 && (
              <>
                {' · '}
                <span className="tabular-nums">+{gap}</span> bak leder
              </>
            )}
            {isTied && <> · delt</>}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className="score-num block text-[22px] leading-none tracking-[-0.02em] text-text">
            {line.total}
          </span>
          <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.12em] tabular-nums text-muted">
            {formatVsPar(vsPar)} PAR
          </span>
        </div>
        <span aria-hidden className="text-muted">
          ›
        </span>
      </Link>
    </li>
  );
}

function formatVsPar(v: number): string {
  if (v === 0) return 'E';
  if (v > 0) return `+${v}`;
  return String(v);
}
