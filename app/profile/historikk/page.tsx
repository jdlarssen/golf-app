import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { BackLink } from '@/components/ui/BackLink';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { SmartLink } from '@/components/ui/SmartLink';
import { formatTeeOffDate } from '@/lib/format/teeOff';

type GameRow = {
  id: string;
  name: string;
  scheduled_tee_off_at: string | null;
  ended_at: string | null;
};

type ScoreRow = {
  game_id: string;
  strokes: number | null;
};

type GameWithStats = GameRow & {
  bruttoSum: number | null;
  holeCount: number;
};

export default async function HistorikkPage() {
  const userId = await getProxyVerifiedUserId();
  if (!userId) {
    redirect('/login');
  }

  const supabase = await getServerClient();

  // Round-trip 1: fetch all finished games the user participated in.
  const { data: gamePlayers, error: gpError } = await supabase
    .from('game_players')
    .select('game_id, games!inner(id, name, scheduled_tee_off_at, ended_at)')
    .eq('user_id', userId)
    .eq('games.status', 'finished')
    .order('games(scheduled_tee_off_at)', { ascending: false });

  if (gpError) throw gpError;

  const rows = (gamePlayers ?? []) as unknown as Array<{
    game_id: string;
    games: GameRow;
  }>;

  const gameIds = rows.map((r) => r.game_id);

  // Round-trip 2: fetch all user scores for those games in one IN query.
  let scoresByGame: Map<string, ScoreRow[]> = new Map();
  if (gameIds.length > 0) {
    const { data: scores, error: scoresError } = await supabase
      .from('scores')
      .select('game_id, strokes')
      .eq('user_id', userId)
      .in('game_id', gameIds)
      .not('strokes', 'is', null);

    if (scoresError) throw scoresError;

    for (const score of scores ?? []) {
      const existing = scoresByGame.get(score.game_id) ?? [];
      existing.push(score as ScoreRow);
      scoresByGame.set(score.game_id, existing);
    }
  }

  // Sort games by tee-off date descending (newest first).
  const sortedGames = rows
    .map((r) => r.games)
    .sort((a, b) => {
      const aTime = a.scheduled_tee_off_at
        ? new Date(a.scheduled_tee_off_at).getTime()
        : a.ended_at
          ? new Date(a.ended_at).getTime()
          : 0;
      const bTime = b.scheduled_tee_off_at
        ? new Date(b.scheduled_tee_off_at).getTime()
        : b.ended_at
          ? new Date(b.ended_at).getTime()
          : 0;
      return bTime - aTime;
    });

  // Compute stats per game.
  const gamesWithStats: GameWithStats[] = sortedGames.map((game) => {
    const gameScores = scoresByGame.get(game.id) ?? [];
    const holeCount = gameScores.length;
    const bruttoSum =
      holeCount > 0
        ? gameScores.reduce((acc, s) => acc + (s.strokes ?? 0), 0)
        : null;
    return { ...game, bruttoSum, holeCount };
  });

  const finishedCount = gamesWithStats.length;
  const subtitle =
    finishedCount === 0
      ? 'Ingen fullførte runder ennå'
      : finishedCount === 1
        ? '1 fullført runde'
        : `${finishedCount} fullførte runder`;

  return (
    <AppShell>
      <div className="-mt-3 mb-4">
        <BackLink href="/profile">Tilbake til profil</BackLink>
      </div>

      <PageHeader title="Min historikk" subtitle={subtitle} />

      {finishedCount === 0 ? (
        <Card>
          <p className="font-sans text-sm text-muted leading-relaxed">
            Du har ingen fullførte runder ennå. Bli med på et spill først.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {gamesWithStats.map((game) => (
            <GameHistoryCard key={game.id} game={game} />
          ))}
        </div>
      )}
    </AppShell>
  );
}

function GameHistoryCard({ game }: { game: GameWithStats }) {
  const dateString = game.scheduled_tee_off_at
    ? formatTeeOffDate(new Date(game.scheduled_tee_off_at))
    : game.ended_at
      ? formatTeeOffDate(new Date(game.ended_at))
      : null;

  const avgPerHole =
    game.bruttoSum !== null && game.holeCount > 0
      ? (game.bruttoSum / game.holeCount).toFixed(1)
      : null;

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-serif text-base font-medium text-text leading-snug truncate">
              {game.name}
            </h2>
            {dateString && (
              <p className="font-sans text-sm text-muted mt-0.5 capitalize">
                {dateString}
              </p>
            )}
          </div>

          {/* Stats cluster */}
          <div className="shrink-0 flex gap-4 items-center">
            <div className="text-right">
              <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-muted leading-none mb-1">
                Brutto
              </p>
              <p className="font-sans tabular-nums text-base font-semibold text-text leading-none">
                {game.bruttoSum !== null ? game.bruttoSum : '—'}
              </p>
            </div>
            <div className="text-right">
              <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-muted leading-none mb-1">
                Snitt/hull
              </p>
              <p className="font-sans tabular-nums text-base font-semibold text-text leading-none">
                {avgPerHole !== null ? avgPerHole : '—'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer link to leaderboard */}
      <div className="border-t border-border">
        <SmartLink
          href={`/games/${game.id}/leaderboard`}
          className="flex items-center justify-between px-5 py-3 font-sans text-[13px] font-medium text-muted hover:text-text hover:bg-bg/50 transition-colors"
        >
          <span>Se resultatliste</span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            className="shrink-0"
          >
            <path
              d="M6 3l5 5-5 5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </SmartLink>
      </div>
    </Card>
  );
}
