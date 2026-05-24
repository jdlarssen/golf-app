import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type { GameStatus } from '@/lib/games/status';
import { SideWinnersForm, type PlayerOption } from './SideWinnersForm';
import { endGameWithSideWinners } from './actions';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string }>;

async function requireAdmin() {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!profile?.is_admin) redirect('/');

  return { supabase, user };
}

/**
 * Admin wizard for selecting LD/CTP winners before flipping a side-tournament
 * game to `finished`. EndGameButton (Task 5) redirects here when the game
 * has side_tournament_enabled + at least one slot configured; otherwise the
 * button submits the direct endGame action.
 *
 * Guards:
 *  - game must exist (notFound otherwise)
 *  - game must be `active` (redirect to detail with not_active error)
 *  - game must actually have side-tournament slots (redirect to detail)
 *
 * The form submits to `endGameWithSideWinners` which validates submissions,
 * inserts winner rows, flips status, and fires "Resultatet er klart"-mail.
 */
export default async function AvsluttPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id: gameId } = await params;
  const { error } = await searchParams;

  const { supabase, user } = await requireAdmin();

  const { data: game } = await supabase
    .from('games')
    .select(
      'id, name, status, side_tournament_enabled, side_ld_count, side_ctp_count',
    )
    .eq('id', gameId)
    .single<{
      id: string;
      name: string;
      status: GameStatus;
      side_tournament_enabled: boolean;
      side_ld_count: number;
      side_ctp_count: number;
    }>();

  if (!game) notFound();

  if (game.status !== 'active') {
    redirect(`/admin/games/${gameId}?error=not_active`);
  }
  if (
    !game.side_tournament_enabled ||
    game.side_ld_count + game.side_ctp_count === 0
  ) {
    redirect(`/admin/games/${gameId}`);
  }

  const { data: gamePlayers } = await supabase
    .from('game_players')
    .select('user_id, users!game_players_user_id_fkey(name, nickname)')
    .eq('game_id', gameId)
    .returns<
      {
        user_id: string;
        users: { name: string | null; nickname: string | null } | null;
      }[]
    >();

  const players: PlayerOption[] =
    gamePlayers?.map((gp) => ({
      user_id: gp.user_id,
      display_name: formatRevealName(
        gp.users?.name ?? '',
        gp.users?.nickname ?? null,
      ),
    })) ?? [];

  const action = endGameWithSideWinners.bind(null, gameId);

  return (
    <AdminShell>
      <TopBar
        backHref={`/admin/games/${gameId}`}
        kicker="Avslutt spillet"
        userId={user.id}
      />
      <PageHeader
        title="Avslutt spill"
        subtitle={`Velg sideturnerings-vinnere for «${game.name}». Spillet låses når du bekrefter.`}
      />
      <SideWinnersForm
        gameId={gameId}
        ldCount={game.side_ld_count}
        ctpCount={game.side_ctp_count}
        players={players}
        action={action}
        error={error}
      />
    </AdminShell>
  );
}
