import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { firstName } from '@/lib/firstName';
import { PreRoundLeaderboardRealtime } from './PreRoundLeaderboard';
import type { TeamLine } from '@/lib/leaderboard';

type Props = {
  gameId: string;
  /** Game's tournament name — surfaced as the kicker subtitle. */
  gameName: string;
  /** All teams pre-sorted by rank ascending. Always brutto. */
  teams: TeamLine[];
  /** Distinct hole-numbers that already have at least one score recorded. */
  holesPlayed: number;
  /** Back-link href — typically points back to the originating hole. */
  backHref: string;
  /**
   * Verified user id (forwardet fra leaderboard-pagen). Brukes til å
   * mounte NotificationBell i TopBar. Kan være null i teori (proxy
   * redirecter ikke-innloggede), men vi forwarder for konsistens.
   */
  userId: string | null;
};

/**
 * Reveal-active leaderboard view — shows brutto best-ball totals while
 * the underlying ranking (which is netto) stays hidden until the admin
 * avslutter spillet. No medals, no champagne styling, no handicap info
 * anywhere; the climax is reserved for the State4View reveal.
 */
export function RevealBruttoView({
  gameId,
  gameName,
  teams,
  holesPlayed,
  backHref,
  userId,
}: Props) {
  return (
    <AppShell userId={userId}>
      <PreRoundLeaderboardRealtime gameId={gameId} />

      <TopBar
        backHref={backHref}
        backLabel="Tilbake"
        kicker={gameName}
      />

      <section className="px-6 pt-2 pb-3 text-center">
        <Kicker tone="accent">LIVE LEADERBOARD</Kicker>
        <h1 className="mt-2 font-serif text-[24px] font-medium tracking-[-0.015em] leading-tight text-text">
          Brutto · etter {holesPlayed} {holesPlayed === 1 ? 'hull' : 'hull'}
        </h1>
        <p className="mt-2 font-sans text-[12px] text-muted">
          Best-ball brutto. Rangeringen kommer når runden er ferdig.
        </p>
      </section>

      <ul className="flex flex-col gap-2 px-4 pt-2 pb-4 list-none">
        {teams.length === 0 && (
          <li>
            <Card>
              <p className="text-sm text-muted">Ingen lag å vise.</p>
            </Card>
          </li>
        )}
        {teams.map((line) => (
          <RevealTeamRow key={line.teamNumber} line={line} />
        ))}
      </ul>

      <PullQuote className="px-6 pt-2 pb-4">
        🤫 Vinneren avsløres når runden er ferdig
      </PullQuote>
    </AppShell>
  );
}

/** E / +N / −N relative to par played. Empty when no holes have been played. */
function deltaText(total: number, parPlayed: number): string {
  if (parPlayed === 0) return '';
  const diff = total - parPlayed;
  if (diff === 0) return 'E';
  return diff > 0 ? `+${diff}` : String(diff);
}

function RevealTeamRow({ line }: { line: TeamLine }) {
  // Per-player brutto sum + par-played across played holes.
  const perPlayerBrutto = new Map<string, number>();
  const perPlayerParPlayed = new Map<string, number>();
  // Team par-played: holes where at least one team-member has a score.
  let teamParPlayed = 0;

  for (const h of line.holes) {
    let teamHasScore = false;
    for (const pc of h.players) {
      if (pc.gross != null) {
        teamHasScore = true;
        perPlayerBrutto.set(
          pc.userId,
          (perPlayerBrutto.get(pc.userId) ?? 0) + pc.gross,
        );
        perPlayerParPlayed.set(
          pc.userId,
          (perPlayerParPlayed.get(pc.userId) ?? 0) + h.par,
        );
      }
    }
    if (teamHasScore) teamParPlayed += h.par;
  }

  const teamDelta = deltaText(line.total, teamParPlayed);

  return (
    <li className="list-none">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="font-serif text-[19px] font-medium tracking-tight text-text">
              Lag {line.teamNumber}
            </p>
            <ul className="mt-1.5 flex flex-col gap-0.5 list-none">
              {line.players.map((p) => {
                const display = p.nickname?.trim()
                  ? p.nickname
                  : firstName(p.name) ?? p.name;
                const sum = perPlayerBrutto.get(p.userId);
                const parPlayed = perPlayerParPlayed.get(p.userId) ?? 0;
                const delta =
                  sum != null ? deltaText(sum, parPlayed) : '';
                return (
                  <li
                    key={p.userId}
                    className="flex items-baseline justify-between gap-3 font-sans text-[12.5px] text-muted"
                  >
                    <span className="truncate">{display}</span>
                    <span className="flex items-baseline gap-2 tabular-nums text-[12px] text-muted">
                      <span>{sum != null ? sum : '—'}</span>
                      {delta && (
                        <span className="w-7 text-right">{delta}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="text-right shrink-0">
            <p className="score-num text-text leading-none text-3xl">
              {line.total}
            </p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
              {teamDelta && (
                <span className="tabular-nums mr-1.5 normal-case">
                  {teamDelta}
                </span>
              )}
              Brutto
            </p>
          </div>
        </div>
      </Card>
    </li>
  );
}
