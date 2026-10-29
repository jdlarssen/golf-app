import { first } from '@/lib/url/searchParams';
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
import { localizeGameName } from '@/lib/games/autoGameName';
import type { AppLocale } from '@/i18n/routing';
import { formatShortOsloDateWithYearLocale } from '@/lib/i18n/format';
import { canCancelWithNotice } from '@/lib/games/gameCancellation';
import { loadCancellationRecipients } from '@/lib/games/gameCancellation.server';
import { deleteGame } from './actions';
import { CancelRoundConfirm } from './CancelRoundConfirm';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

type GameRow = {
  id: string;
  name: string;
  status: GameStatus;
  scheduled_tee_off_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  tournament_id: string | null;
  league_round_id: string | null;
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
  const ctx = await requireAdmin(supabase);

  const { data: game } = await supabase
    .from('games')
    .select(
      'id, name, status, scheduled_tee_off_at, started_at, ended_at, created_at, tournament_id, league_round_id, courses(name)',
    )
    .eq('id', id)
    .maybeSingle<GameRow>();

  if (!game) notFound();

  const gameName = localizeGameName(game.name, game.courses?.name ?? null, locale as AppLocale);
  const withNotice = canCancelWithNotice(game);

  // #2481: «Avlys runden?» when someone is there to tell — the same content as
  // the organiser's page, in the Sekretariat frame. With only the one who
  // cancels on the list, the plain page below.
  if (withNotice) {
    const recipients = await loadCancellationRecipients(id, ctx.userId);
    if (recipients.length > 0) {
      const tStatus = await getTranslations('gameStatus');
      return (
        <AdminShell showVersion={false}>
          <CancelRoundConfirm
            header={
              <>
                <TopBar backHref={`/admin/games/${id}`} kicker={tNav('klubbhus')} />
                <BrassRibbon kicker={`${gameName} · ${tStatus('scheduled')}`} />
              </>
            }
            gameId={game.id}
            teeOffAt={game.scheduled_tee_off_at}
            courseName={game.courses?.name ?? null}
            recipientNames={recipients.map((r) => r.name)}
            errorCode={errorCode}
            keepHref={`/admin/games/${id}`}
            trayClassName="bg-admin-bg"
          />
        </AdminShell>
      );
    }
  }

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
    return formatShortOsloDateWithYearLocale(iso, locale);
  }

  // Best available date line for the summary.
  const dateLine =
    shortDate(game.ended_at) ??
    shortDate(game.started_at) ??
    shortDate(game.scheduled_tee_off_at) ??
    shortDate(game.created_at);

  // #2481: a scheduled round outside a cup or league cancels with a notice
  // above, or has no one to tell; only a cup match keeps «si fra selv».
  const warning =
    game.status === 'scheduled'
      ? withNotice
        ? null
        : t('warnings.scheduled')
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
          {t('heading', { name: gameName })}
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
          <li>{'«'}{gameName}{'»'}</li>
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
