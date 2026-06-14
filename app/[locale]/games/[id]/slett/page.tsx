import { first } from '@/lib/url/searchParams';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrCreator } from '@/lib/admin/auth';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Banner } from '@/components/ui/Banner';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SmartLink } from '@/components/ui/SmartLink';
import type { GameStatus } from '@/lib/games/status';
import { formatShortDateWithYearLocale } from '@/lib/i18n/format';
import { getLocale } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { deleteGame } from '@/app/[locale]/admin/games/[id]/slett/actions';
import { localizeGameName } from '@/lib/games/autoGameName';

/**
 * Creator-facing «Slett spill»-flate (#428) — the non-admin mirror of the admin
 * delete confirmation, in `AppShell`. Gated on `requireAdminOrCreator`. A creator
 * may only delete a game that hasn't started (draft/scheduled, eier-beslutning),
 * so the page redirects active/finished games back to game-home — only an admin
 * can remove those, from Sekretariatet. Submits the SAME `deleteGame` action the
 * admin uses (it branches its redirect to home for a non-admin caller).
 *
 * Dedicated confirmation route per the destructive-action discipline — never an
 * inline toggle or <details>-popout.
 */

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

function shortLocale(iso: string | null | undefined, locale: AppLocale): string | null {
  if (!iso) return null;
  return formatShortDateWithYearLocale(iso, locale);
}

type GameRow = {
  id: string;
  name: string;
  status: GameStatus;
  scheduled_tee_off_at: string | null;
  created_at: string;
  courses: { name: string } | null;
};

export default async function CreatorDeleteGamePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const t = await getTranslations('game.delete');
  const locale = await getLocale() as AppLocale;
  const errorCode = first(sp.error);
  const errorMessage = errorCode ? t(`errors.${errorCode}` as Parameters<typeof t>[0]) : undefined;

  const supabase = await getServerClient();
  const role = await requireAdminOrCreator(supabase, id);

  const { data: game } = await supabase
    .from('games')
    .select(
      'id, name, status, scheduled_tee_off_at, created_at, courses(name)',
    )
    .eq('id', id)
    .maybeSingle<GameRow>();

  if (!game) notFound();

  // Creator delete is limited to games that haven't started (eier-beslutning).
  // active/finished → only an admin can remove them (from Sekretariatet), so send
  // the creator back to game-home.
  if (game.status !== 'draft' && game.status !== 'scheduled') {
    redirect({ href: `/games/${id}` as string, locale });
  }

  // Count child rows so the confirmation copy is accurate. A creator-who-plays
  // can read game_players (is_in_game); scores/invitations may read fewer rows
  // under RLS than an admin would — the lines just collapse, which is fine for an
  // informational summary.
  const [gpRes, scoresRes] = await Promise.all([
    supabase
      .from('game_players')
      .select('user_id', { count: 'exact', head: true })
      .eq('game_id', id),
    supabase
      .from('scores')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', id),
  ]);

  const playerCount = gpRes.count ?? 0;
  const scoreCount = scoresRes.count ?? 0;

  const dateLine =
    shortLocale(game.scheduled_tee_off_at, locale) ?? shortLocale(game.created_at, locale);

  // Only scheduled games carry a warning here (players are already invited).
  // Drafts are private to the creator, so no one needs telling.
  const warning =
    game.status === 'scheduled'
      ? t('scheduledWarning')
      : null;

  return (
    <AppShell>
      <TopBar backHref={`/games/${id}`} kicker={t('kicker')} userId={role.userId} />

      <div className="px-1">
        <h1 className="mb-3 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          {t('heading', { name: localizeGameName(game.name, game.courses?.name ?? null, locale) })}
        </h1>
        <p className="font-sans text-[13px] leading-relaxed text-muted">
          {[game.courses?.name, dateLine].filter(Boolean).join(' · ')}
        </p>
      </div>

      {warning && (
        <div className="mt-4">
          <Banner tone="warning">{warning}</Banner>
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
          <li>{t('gameEntry', { name: localizeGameName(game.name, game.courses?.name ?? null, locale) })}</li>
          {playerCount > 0 && (
            <li>{t('playerCount', { count: playerCount })}</li>
          )}
          {scoreCount > 0 && (
            <li>{t('scoreCount', { count: scoreCount })}</li>
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
            pendingLabel={t('deletePending')}
            style={{
              background: 'var(--danger-deep)',
              borderColor: 'var(--danger-deep)',
            }}
          >
            {t('deleteButton')}
          </SubmitButton>
        </form>
        <SmartLink
          href={`/games/${id}`}
          className="rounded-full border border-border bg-surface px-3 py-3 text-center font-sans text-[13px] font-medium text-text"
        >
          {t('cancelButton')}
        </SmartLink>
      </div>
    </AppShell>
  );
}
