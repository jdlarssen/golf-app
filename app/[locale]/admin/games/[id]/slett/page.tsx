import { notFound } from 'next/navigation';
import { getTranslations, getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { Banner } from '@/components/ui/Banner';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SmartLink } from '@/components/ui/SmartLink';
import type { GameStatus } from '@/lib/games/status';
import { formatShortDateWithYearLocale } from '@/lib/i18n/format';
import { deleteGame } from './actions';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

type GameRow = {
  id: string;
  name: string;
  status: GameStatus;
  scheduled_tee_off_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  courses: { name: string } | null;
};

export default async function DeleteGamePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const errorCode = first(sp.error);

  const locale = await getLocale();
  const t = await getTranslations('admin.game.delete');
  const tNav = await getTranslations('admin.nav');
  const errorMessage = errorCode
    ? t.has(`errors.${errorCode}` as Parameters<typeof t>[0])
      ? t(`errors.${errorCode}` as Parameters<typeof t>[0])
      : undefined
    : undefined;

  const supabase = await getServerClient();
  // Self-gate for Fase 4 chunk 2 layout-loosening (#223).
  await requireAdmin(supabase);

  const { data: game } = await supabase
    .from('games')
    .select('id, name, status, scheduled_tee_off_at, started_at, ended_at, created_at, courses(name)')
    .eq('id', id)
    .maybeSingle<GameRow>();

  if (!game) notFound();

  // Count child rows so the confirmation copy is accurate.
  const [gpRes, scoresRes, invRes] = await Promise.all([
    supabase
      .from('game_players')
      .select('user_id', { count: 'exact', head: true })
      .eq('game_id', id),
    supabase
      .from('scores')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', id),
    supabase
      .from('invitations')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', id),
  ]);

  const playerCount = gpRes.count ?? 0;
  const scoreCount = scoresRes.count ?? 0;
  const invitationCount = invRes.count ?? 0;

  function shortDate(iso: string | null | undefined): string | null {
    if (!iso) return null;
    return formatShortDateWithYearLocale(iso, locale);
  }

  // Best available date line for the summary.
  const dateLine =
    shortDate(game.ended_at) ??
    shortDate(game.started_at) ??
    shortDate(game.scheduled_tee_off_at) ??
    shortDate(game.created_at);

  const warning =
    game.status === 'scheduled'
      ? t('warnings.scheduled')
      : game.status === 'active'
      ? t('warnings.active')
      : game.status === 'finished'
      ? t('warnings.finished')
      : null;

  const buttonLabel =
    game.status === 'active' ? t('buttonActive') : t('buttonDefault');

  return (
    <AdminShell>
      <TopBar
        backHref={`/admin/games/${id}`}
        kicker={tNav('klubbhus')}
      />

      <BrassRibbon kicker={t('kicker')} />

      <div className="px-1">
        <h1 className="mb-3 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          {t('heading', { name: game.name })}
        </h1>
        <p className="font-sans text-[13px] leading-relaxed text-muted">
          {[game.courses?.name, dateLine].filter(Boolean).join(' · ')}
        </p>
      </div>

      {warning && (
        <div className="mt-4">
          <Banner tone={game.status === 'active' ? 'error' : 'warning'}>
            {warning}
          </Banner>
        </div>
      )}

      {errorMessage && (
        <div className="mt-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      <div
        className="mt-5 rounded-xl border bg-surface px-4 py-3.5"
        style={{ borderColor: 'rgba(180, 60, 60, 0.18)' }}
      >
        <p className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          {t('permanentLabel')}
        </p>
        <ul className="space-y-1 font-sans text-[13px] text-text">
          <li>{'«'}{game.name}{'»'}</li>
          {playerCount > 0 && (
            <li>{t('players', { count: playerCount })}</li>
          )}
          {scoreCount > 0 && (
            <li>{t('scoreRows', { count: scoreCount })}</li>
          )}
          {invitationCount > 0 && (
            <li>{t('invitations', { count: invitationCount })}</li>
          )}
        </ul>
        <p className="mt-3 font-sans text-[12px] leading-relaxed text-muted">
          {t('cannotUndo')}
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-2.5">
        <form action={deleteGame}>
          <input type="hidden" name="gameId" value={game.id} />
          <SubmitButton
            className="w-full"
            style={{ background: 'var(--danger-deep)', borderColor: 'var(--danger-deep)' }}
            pendingLabel={t('deletingBusy')}
          >
            {buttonLabel}
          </SubmitButton>
        </form>
        <SmartLink
          href={`/admin/games/${id}`}
          className="rounded-full border border-border bg-surface px-3 py-3 text-center font-sans text-[13px] font-medium text-text"
        >
          {t('cancel')}
        </SmartLink>
      </div>
    </AdminShell>
  );
}
