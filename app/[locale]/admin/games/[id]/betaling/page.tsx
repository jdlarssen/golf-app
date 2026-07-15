import { notFound } from 'next/navigation';
import { getTranslations, getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { MiniRibbon } from '@/components/ui/MiniRibbon';
import { localizeGameName } from '@/lib/games/autoGameName';
import type { AppLocale } from '@/i18n/routing';
import { BetalingClient, type BetalingPlayer } from './BetalingClient';

type Params = Promise<{ id: string }>;

type GameRow = {
  id: string;
  name: string;
  status: 'draft' | 'scheduled' | 'active' | 'finished';
  entry_fee_kr: number;
  payment_link: string | null;
  courses: { name: string } | null;
};

type PlayerRow = {
  user_id: string;
  paid_at: string | null;
  withdrawn_at: string | null;
  users: {
    name: string | null;
    nickname: string | null;
    is_guest: boolean;
  } | null;
};

/**
 * #1049: arrangørens betaling-cockpit — huk av hvem som har betalt
 * startkontingenten, og purr de som mangler. Admin-only, samme cockpit-nivå
 * som `/signups`. Nås fra telle-kortet på admin-spillsiden.
 *
 * #1145: «X av Y betalt»-kortet er fjernet herfra — tallet står på
 * telle-kortet du kom fra, og purre-knappen bærer mangler-tallet.
 */
export default async function BetalingPage({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await getServerClient();
  await requireAdmin(supabase);
  const locale = await getLocale();
  const t = await getTranslations('admin.game.betaling');

  const { data: game } = await supabase
    .from('games')
    .select('id, name, status, entry_fee_kr, payment_link, courses(name)')
    .eq('id', id)
    .single<GameRow>();
  if (!game) notFound();

  const { data: rows, error } = await supabase
    .from('game_players')
    .select(
      'user_id, paid_at, withdrawn_at, users!game_players_user_id_fkey(name, nickname, is_guest)',
    )
    .eq('game_id', id)
    .returns<PlayerRow[]>();
  if (error) throw error;

  const unknown = t('unknownPlayer');
  const players: BetalingPlayer[] = (rows ?? []).map((r) => {
    const base = r.users?.name ?? unknown;
    const displayName = r.users?.nickname
      ? `${base} «${r.users.nickname}»`
      : base;
    return {
      userId: r.user_id,
      displayName,
      isGuest: r.users?.is_guest ?? false,
      paid: r.paid_at != null,
      withdrawn: r.withdrawn_at != null,
    };
  });

  const gameName = localizeGameName(
    game.name,
    game.courses?.name ?? null,
    locale as AppLocale,
  );

  return (
    <AdminShell>
      <TopBar backHref={`/admin/games/${id}`} kicker={t('kicker')} />

      <div className="space-y-5" data-testid="betaling-content">
        <header className="px-1">
          <h1 className="font-serif text-[26px] font-medium leading-snug tracking-[-0.015em] text-text">
            {t('heading')}
          </h1>
          <p className="mt-1 font-sans text-sm text-muted">{gameName}</p>
        </header>

        {game.entry_fee_kr <= 0 ? (
          <p className="rounded-xl border border-border bg-surface px-4 py-6 text-center font-sans text-sm text-muted">
            {t('noFee')}
          </p>
        ) : (
          <>
            <MiniRibbon>{t('rosterLabel')}</MiniRibbon>
            {players.length === 0 ? (
              <p className="rounded-xl border border-border bg-surface px-4 py-6 text-center font-sans text-sm text-muted">
                {t('emptyRoster')}
              </p>
            ) : (
              <BetalingClient gameId={id} players={players} />
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}
