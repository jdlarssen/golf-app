import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { AdminShell } from '@/components/ui/AdminShell';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Banner } from '@/components/ui/Banner';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SmartLink } from '@/components/ui/SmartLink';
import { deleteTournament } from '@/lib/cup/actions';

export type CupDeleteVariant = 'admin' | 'club';

/**
 * Delt cup-slett-bekreftelse (#524). Begge slett-ruter (`/admin/cup/[id]/slett`
 * og `/klubber/[id]/cup/[cupId]/slett`) rendrer denne. Gaten gjøres i ruten.
 * Variant styrer shell + back/avbryt-href så klubb-admin holder seg i klubb-
 * chrome gjennom hele slette-flyten.
 */
export async function CupDeleteConfirm({
  tournamentId,
  variant,
  errorCode,
}: {
  tournamentId: string;
  variant: CupDeleteVariant;
  errorCode?: string;
}) {
  const [supabase, t] = await Promise.all([getServerClient(), getTranslations('cup')]);

  const { data: cup } = await supabase
    .from('tournaments')
    .select('id, name, status, team_1_name, team_2_name, group_id')
    .eq('id', tournamentId)
    .maybeSingle<{
      id: string;
      name: string;
      status: 'draft' | 'active' | 'finished';
      team_1_name: string;
      team_2_name: string;
      group_id: string | null;
    }>();

  if (!cup) notFound();

  const { count: matchCount } = await supabase
    .from('games')
    .select('id', { head: true, count: 'exact' })
    .eq('tournament_id', tournamentId);

  const isClub = variant === 'club';
  const groupId = cup.group_id;

  let clubName: string | null = null;
  if (isClub && groupId) {
    const { data: club } = await getAdminClient()
      .from('groups')
      .select('name')
      .eq('id', groupId)
      .maybeSingle();
    clubName = (club?.name as string | null | undefined) ?? null;
  }

  const errorMessage = errorCode === 'delete_failed' ? t('delete.errors.delete_failed') : undefined;
  const warningMap: Record<'draft' | 'active' | 'finished', string | null> = {
    draft: null,
    active: t('delete.warnings.active'),
    finished: t('delete.warnings.finished'),
  };
  const warning = warningMap[cup.status];

  const Shell = isClub ? AppShell : AdminShell;
  const cancelHref =
    isClub && groupId
      ? `/klubber/${groupId}/cup/${tournamentId}`
      : `/admin/cup/${tournamentId}`;
  const kicker = isClub ? (clubName ?? t('ledger.kicker')) : t('ledger.kicker');

  return (
    <Shell>
      <TopBar backHref={cancelHref} kicker={kicker} />
      <BrassRibbon kicker={t('delete.brassRibbon')} />

      <div className="px-1">
        <h1 className="mb-3 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          {t('delete.heading', { name: cup.name })}
        </h1>
        <p className="font-sans text-[13px] leading-relaxed text-muted">
          {cup.team_1_name} {t('manage.mot')} {cup.team_2_name}
        </p>
      </div>

      {warning && (
        <div className="mt-4">
          <Banner tone={cup.status === 'active' ? 'error' : 'warning'}>
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
          {t('delete.permanentHeading')}
        </p>
        <ul className="space-y-1 font-sans text-[13px] text-text">
          <li>{t('delete.cupEntry', { name: cup.name })}</li>
          <li>{t('delete.rosterEntry')}</li>
        </ul>
        {(matchCount ?? 0) > 0 && (
          <p className="mt-3 font-sans text-[12px] leading-relaxed text-muted">
            {t('delete.matchesNote', { count: matchCount ?? 0 })}
          </p>
        )}
        <p className="mt-3 font-sans text-[12px] leading-relaxed text-muted">
          {t('delete.irreversibleNote')}
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-2.5">
        <form action={deleteTournament}>
          <input type="hidden" name="id" value={cup.id} />
          <SubmitButton
            className="w-full"
            style={{
              background: 'var(--danger-deep)',
              borderColor: 'var(--danger-deep)',
            }}
            pendingLabel={t('delete.deletePending')}
          >
            {t('delete.deleteButton')}
          </SubmitButton>
        </form>
        <SmartLink
          href={cancelHref}
          className="rounded-full border border-border bg-surface px-3 py-3 text-center font-sans text-[13px] font-medium text-text"
        >
          {t('delete.cancelButton')}
        </SmartLink>
      </div>
    </Shell>
  );
}
