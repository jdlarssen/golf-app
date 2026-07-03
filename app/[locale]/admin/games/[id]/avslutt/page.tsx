import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { getTranslations, getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type { GameStatus } from '@/lib/games/status';
import type { AppLocale } from '@/i18n/routing';
import { localizeGameName } from '@/lib/games/autoGameName';
import { SideWinnersForm, type PlayerOption } from './SideWinnersForm';
import { endGameWithSideWinners } from './actions';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string }>;

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

  const locale = await getLocale();
  const t = await getTranslations('admin.game.finish');

  const supabase = await getServerClient();
  // Self-gate for Fase 4 chunk 2 layout-loosening (#223). Replaces the
  // page-local inline `requireAdmin()` wrapper that previously did the
  // auth.getUser + users.is_admin round-trip inline.
  await requireAdmin(supabase);

  const { data: game } = await supabase
    .from('games')
    .select(
      'id, name, status, side_tournament_enabled, side_ld_count, side_ctp_count, courses(name)',
    )
    .eq('id', gameId)
    .single<{
      id: string;
      name: string;
      status: GameStatus;
      side_tournament_enabled: boolean;
      side_ld_count: number;
      side_ctp_count: number;
      courses: { name: string } | null;
    }>();

  if (!game) notFound();

  if (game.status !== 'active') {
    redirect({ href: `/admin/games/${gameId}?error=not_active`, locale });
  }
  if (
    !game.side_tournament_enabled ||
    game.side_ld_count + game.side_ctp_count === 0
  ) {
    redirect({ href: `/admin/games/${gameId}`, locale });
  }

  const { data: gamePlayers } = await supabase
    .from('game_players')
    .select('user_id, submitted_at, users!game_players_user_id_fkey(name, nickname)')
    .eq('game_id', gameId)
    .returns<
      {
        user_id: string;
        submitted_at: string | null;
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

  // «Avslutt likevel» (#375): spillere som aldri leverte blokkerer ikke lenger.
  // Vis hvem som mangler her, og send allowMissing til actionen så den hopper
  // over dem (submitted_at forblir null → «ikke levert», ikke falsk levering;
  // scorene deres teller fortsatt i resultatet).
  const missing = (gamePlayers ?? [])
    .filter((gp) => !gp.submitted_at)
    .map((gp) =>
      formatRevealName(gp.users?.name ?? '', gp.users?.nickname ?? null),
    );

  const action = endGameWithSideWinners.bind(null, gameId, missing.length > 0);

  return (
    <AdminShell>
      <TopBar
        backHref={`/admin/games/${gameId}`}
        kicker={t('topBarKicker')}
      />
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle', { name: localizeGameName(game.name, game.courses?.name ?? null, locale as AppLocale) })}
      />
      {missing.length > 0 && (
        <div className="mb-4 rounded-xl border border-warning/30 bg-warning/10 px-3.5 py-3 text-sm text-warning">
          <p className="font-medium">
            {t('missingHeader', { count: missing.length })}
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
            {missing.map((name, i) => (
              <li key={i}>{name}</li>
            ))}
          </ul>
          <p className="mt-2 text-text">
            {t.rich('missingBody', {
              bold: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
        </div>
      )}
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
