import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import { getTranslations, getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
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

  const locale = await getLocale();
  const t = await getTranslations('admin.game.withdraw');
  const tDetail = await getTranslations('admin.game.detail');

  const supabase = await getServerClient();
  await requireAdmin(supabase);

  const { data: game } = await supabase
    .from('games')
    .select('id, name, status, game_mode')
    .eq('id', gameId)
    .single<{ id: string; name: string; status: GameStatus; game_mode: GameMode }>();

  if (!game) notFound();

  if (game.status !== 'active') {
    redirect({ href: `${detailPath}?error=not_active`, locale });
  }

  if (!supportsWithdrawal(game.game_mode)) {
    redirect({ href: detailPath, locale });
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
    redirect({ href: detailPath, locale });
  }

  // Already withdrawn — nothing to confirm.
  if (player!.withdrawn_at) {
    redirect({ href: detailPath, locale });
  }

  const u = player!.users;
  const baseName = u?.name?.trim() || u?.email || tDetail('unknownPlayer');
  const playerName = u?.nickname ? `${baseName} «${u.nickname}»` : baseName;

  const withdrawAction = adminWithdrawPlayer.bind(null, gameId, userId);

  return (
    <AdminShell>
      <TopBar
        backHref={detailPath}
        kicker={t('topBarKicker')}
      />
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle', { name: playerName, game: game.name })}
      />

      <div className="space-y-4 px-1">
        <div className="rounded-xl border border-warning/30 bg-warning/10 px-3.5 py-3 text-sm text-warning">
          <p className="font-medium">
            {t('warningBody', { name: playerName })}
          </p>
        </div>

        <p className="text-sm text-muted">
          {t('bodyText')}
        </p>

        <form action={withdrawAction}>
          <SubmitButton
            className="w-full"
            variant={t('dangerVariant') as 'danger'}
            pendingLabel={t('submittingBusy')}
          >
            {t('submitButton', { name: playerName })}
          </SubmitButton>
        </form>

        <Link
          href={detailPath}
          className="block min-h-[44px] rounded-full border border-border px-4 py-3 text-center font-medium tracking-tight text-text transition-colors hover:bg-surface-2"
        >
          {t('cancel')}
        </Link>
      </div>
    </AdminShell>
  );
}
