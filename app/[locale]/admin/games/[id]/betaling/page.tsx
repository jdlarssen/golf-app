import { notFound } from 'next/navigation';
import { getTranslations, getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { MiniRibbon } from '@/components/ui/MiniRibbon';
import { formatKr } from '@/lib/format/formatKr';
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
 * startkontingenten, se «X av Y betalt», og (chunk 5) purr de som mangler.
 * Admin-only, samme cockpit-nivå som `/signups`. Nås fra telle-kortet på
 * admin-spillsiden.
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

  // Withdrawn spillere ekskluderes fra tellingen (speiler readiness-count på
  // admin-spillsiden), men vises fortsatt i lista.
  const active = players.filter((p) => !p.withdrawn);
  const paidCount = active.filter((p) => p.paid).length;
  const totalCount = active.length;
  const missingCount = totalCount - paidCount;

  const gameName = localizeGameName(
    game.name,
    game.courses?.name ?? null,
    locale as AppLocale,
  );

  return (
    <AdminShell>
      <TopBar backHref={`/admin/games/${id}`} kicker={t('kicker')} />

      <div className="space-y-5">
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
            <div className="rounded-xl border border-border bg-surface-2 px-4 py-4">
              <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                {t('summaryLabel', { amount: formatKr(game.entry_fee_kr) })}
              </p>
              <p className="mt-1 font-serif text-[22px] font-medium tabular-nums text-text">
                {t('summaryCount', { paid: paidCount, total: totalCount })}
              </p>
              {missingCount > 0 && (
                <p className="mt-0.5 font-sans text-sm text-muted tabular-nums">
                  {t('summaryMissing', { count: missingCount })}
                </p>
              )}
            </div>

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
