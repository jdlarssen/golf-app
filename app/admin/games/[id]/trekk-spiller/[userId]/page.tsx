import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import type { GameStatus } from '@/lib/games/status';
import type { GameMode } from '@/lib/scoring/modes/types';
import { supportsWithdrawal } from '@/lib/scoring';
import { adminWithdrawPlayer } from '../../actions';

type Params = Promise<{ id: string; userId: string }>;

/**
 * Dedikert bekreftelses-side for admin-WD av en spiller (#386).
 *
 * Guards:
 *  - game må finnes (notFound ellers)
 *  - game.status === 'active' (redirect til detalj med ?error=not_active)
 *  - supportsWithdrawal(game.game_mode) (redirect til detalj)
 *  - målspilleren finnes i game_players og er ikke allerede trukket (redirect til detalj)
 *
 * Confirm-knappen binder til adminWithdrawPlayer(gameId, userId).
 */
export default async function TrekkSpillerPage({ params }: { params: Params }) {
  const { id: gameId, userId } = await params;
  const detailPath = `/admin/games/${gameId}`;

  const supabase = await getServerClient();
  await requireAdmin(supabase);

  const { data: game } = await supabase
    .from('games')
    .select('id, name, status, game_mode')
    .eq('id', gameId)
    .single<{ id: string; name: string; status: GameStatus; game_mode: GameMode }>();

  if (!game) notFound();

  if (game.status !== 'active') {
    redirect(`${detailPath}?error=not_active`);
  }

  if (!supportsWithdrawal(game.game_mode)) {
    redirect(detailPath);
  }

  // Load the target player — must exist, must not already be withdrawn.
  const { data: player } = await supabase
    .from('game_players')
    .select(
      'withdrawn_at, users!game_players_user_id_fkey(name, nickname, email)',
    )
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .single<{
      withdrawn_at: string | null;
      users: { name: string | null; nickname: string | null; email: string | null } | null;
    }>();

  if (!player) {
    redirect(detailPath);
  }

  // Already withdrawn — nothing to confirm.
  if (player.withdrawn_at) {
    redirect(detailPath);
  }

  const u = player.users;
  const baseName = u?.name?.trim() || u?.email || '(ukjent spiller)';
  const playerName = u?.nickname ? `${baseName} «${u.nickname}»` : baseName;

  const withdrawAction = adminWithdrawPlayer.bind(null, gameId, userId);

  return (
    <AdminShell>
      <TopBar
        backHref={detailPath}
        kicker="Trekk spiller"
      />
      <PageHeader
        title="Trekk spiller?"
        subtitle={`${playerName} i «${game.name}».`}
      />

      <div className="space-y-4 px-1">
        <div className="rounded-xl border border-warning/30 bg-warning/10 px-3.5 py-3 text-sm text-warning">
          <p className="font-medium">
            {playerName} vil bli markert som <strong>Trukket</strong>.
          </p>
        </div>

        <p className="text-sm text-muted">
          Scorene til spilleren teller ikke lenger i rangeringen. Spilleren
          vises som «Trukket» under leaderboarden og i spillerlisten. Du kan
          angre dette etterpå så lenge spillet er aktivt.
        </p>

        <form action={withdrawAction}>
          <Button type="submit" className="w-full" variant="danger">
            Trekk {playerName}
          </Button>
        </form>

        <Link
          href={detailPath}
          className="block min-h-[44px] rounded-full border border-border px-4 py-3 text-center font-medium tracking-tight text-text transition-colors hover:bg-surface-2"
        >
          Avbryt
        </Link>
      </div>
    </AdminShell>
  );
}
