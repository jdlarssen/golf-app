import { notFound } from 'next/navigation';
import { getTranslations, getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { Banner } from '@/components/ui/Banner';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SmartLink } from '@/components/ui/SmartLink';
import { formatShortDateLocale } from '@/lib/i18n/format';
import type { AppLocale } from '@/i18n/routing';
import { handleDeleteLeague } from '@/lib/league/actions';

/**
 * Shared delete-confirm surface for a league (#485), rendered by two routes:
 *  - `/admin/liga/[id]/slett` (variant="admin") — AdminShell, back to the admin
 *    management page.
 *  - `/klubber/[id]/liga/[ligaId]/slett` (variant="club") — AppShell, back to
 *    the club management page, so a club-admin never leaves club chrome.
 *
 * `deleteLeague` already redirects a club-league deletion to `/klubber/[groupId]`,
 * so on success both variants land correctly. The variant only switches the
 * shell + the back/cancel hrefs; the warning, the deletion summary (round /
 * participant / flight counts), and the destructive button are identical.
 */

export type LigaDeleteVariant = 'admin' | 'club';

export async function LigaDeleteConfirm({
  leagueId,
  variant,
  errorCode,
}: {
  leagueId: string;
  variant: LigaDeleteVariant;
  errorCode?: string;
}) {
  const [t, locale] = await Promise.all([
    getTranslations('liga.delete'),
    getLocale(),
  ]);

  const errorMessage = errorCode
    ? (['delete_failed', 'missing'] as const).includes(errorCode as 'delete_failed' | 'missing')
      ? t(`errors.${errorCode as 'delete_failed' | 'missing'}`)
      : undefined
    : undefined;

  const supabase = await getServerClient();

  const { data: league } = await supabase
    .from('leagues')
    .select('id, name, status, season_start, season_end, group_id')
    .eq('id', leagueId)
    .maybeSingle<{
      id: string;
      name: string;
      status: 'draft' | 'active' | 'finished';
      season_start: string;
      season_end: string;
      group_id: string | null;
    }>();

  if (!league) notFound();
  // #485: en frittstående liga hører ikke hjemme under /klubber — 404 i klubb-
  // varianten så vi aldri bygger en /klubber/null/...-lenke (kun nåbar ved at en
  // global admin håndskriver URL-en).
  if (variant === 'club' && !league.group_id) notFound();

  // Count rounds, participants, and linked flights for the deletion summary.
  const [{ count: roundCount }, { count: playerCount }] = await Promise.all([
    supabase
      .from('league_rounds')
      .select('id', { head: true, count: 'exact' })
      .eq('league_id', leagueId),
    supabase
      .from('league_players')
      .select('user_id', { head: true, count: 'exact' })
      .eq('league_id', leagueId),
  ]);

  // Flights: count games linked to rounds of this league.
  const { data: roundIds } = await supabase
    .from('league_rounds')
    .select('id')
    .eq('league_id', leagueId);
  const roundIdList = (roundIds ?? []).map((r) => r.id);
  const { count: flightCount } =
    roundIdList.length > 0
      ? await supabase
          .from('games')
          .select('id', { head: true, count: 'exact' })
          .in('league_round_id', roundIdList)
      : { count: 0 };

  const warning = league.status !== 'draft'
    ? t(`warnings.${league.status}` as `warnings.${'active' | 'finished'}`)
    : null;

  const Shell = variant === 'admin' ? AdminShell : AppShell;
  const backHref =
    variant === 'club'
      ? `/klubber/${league.group_id}/liga/${leagueId}`
      : `/admin/liga/${leagueId}`;

  return (
    <Shell>
      <TopBar backHref={backHref} kicker={t('kicker')} />
      <BrassRibbon kicker={t('brassRibbon')} />

      <div className="px-1">
        <h1 className="mb-3 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          {t('confirmTitle', { name: league.name })}
        </h1>
        <p className="font-sans text-[13px] leading-relaxed text-muted">
          {formatShortDateLocale(league.season_start, locale as AppLocale)} – {formatShortDateLocale(league.season_end, locale as AppLocale)}
        </p>
      </div>

      {warning && (
        <div className="mt-4">
          <Banner tone={league.status === 'active' ? 'error' : 'warning'}>
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
          <li>{league.name}</li>
          {(roundCount ?? 0) > 0 && (
            <li>
              {t('roundCount', { count: roundCount ?? 0 })}
            </li>
          )}
          {(playerCount ?? 0) > 0 && (
            <li>
              {t('playerCount', { count: playerCount ?? 0 })}
            </li>
          )}
        </ul>
        {(flightCount ?? 0) > 0 && (
          <p className="mt-3 font-sans text-[12px] leading-relaxed text-muted">
            {t('flightNote', { count: flightCount ?? 0 })}
          </p>
        )}
        <p className="mt-3 font-sans text-[12px] leading-relaxed text-muted">
          {t('cannotUndo')}
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-2.5">
        <form action={handleDeleteLeague}>
          <input type="hidden" name="league_id" value={league.id} />
          <SubmitButton
            className="w-full"
            style={{
              background: 'var(--danger-deep)',
              borderColor: 'var(--danger-deep)',
            }}
            pendingLabel={t('deletePending')}
          >
            {t('deleteButton')}
          </SubmitButton>
        </form>
        <SmartLink
          href={backHref}
          className="rounded-full border border-border bg-surface px-3 py-3 text-center font-sans text-[13px] font-medium text-text min-h-[44px] flex items-center justify-center"
        >
          {t('cancelButton')}
        </SmartLink>
      </div>
    </Shell>
  );
}
