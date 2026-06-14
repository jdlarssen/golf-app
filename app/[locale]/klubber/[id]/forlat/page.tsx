import { first } from '@/lib/url/searchParams';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getClubDetail } from '@/lib/clubs/getClubDetail';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Banner } from '@/components/ui/Banner';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SmartLink } from '@/components/ui/SmartLink';
import { leaveClub } from './actions';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

/**
 * /klubber/[id]/forlat — dedicated leave-club confirm page.
 *
 * Shows the club name and a confirm button. The leaveClub action blocks
 * if the caller is the sole owner.
 *
 * Destructive action → dedicated route (repo rule: never inline toggle /
 * <details> for destructive flows).
 *
 * Part of #442 (Opprett klubb — eierskap + klubb-scoped oppdagbarhet).
 */
export default async function ForlatKlubbPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const locale = await getLocale();
  if (!user) redirect({ href: '/login', locale });

  const detail = await getClubDetail(supabase, id, user!.id);
  if (!detail) notFound();

  const { club } = detail;
  const errorCode = first(sp.error);

  const t = await getTranslations('klubb.leave');
  const errorMessage = errorCode
    ? (t(`errors.${errorCode}` as Parameters<typeof t>[0], undefined as never) ?? undefined)
    : undefined;

  return (
    <AppShell>
      <TopBar backHref={`/klubber/${id}`} kicker={club.name} />

      {errorMessage && (
        <div className="mb-6">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      <div className="space-y-6">
        <div className="px-1">
          <h1 className="mb-2 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
            {t('heading', { name: club.name })}
          </h1>
          <p className="font-sans text-[13px] leading-relaxed text-muted">
            {t('description')}
          </p>
        </div>

        <div
          className="rounded-xl border px-4 py-3.5"
          style={{ borderColor: 'rgba(180, 60, 60, 0.18)' }}
        >
          <p className="font-sans text-sm text-text">
            {t('confirmText', { name: club.name })}
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <form action={leaveClub}>
            <input type="hidden" name="groupId" value={club.id} />
            <SubmitButton
              className="w-full"
              style={{
                background: 'var(--danger-deep)',
                borderColor: 'var(--danger-deep)',
              }}
              pendingLabel={t('leavePending')}
            >
              {t('leaveButton')}
            </SubmitButton>
          </form>
          <SmartLink
            href={`/klubber/${id}`}
            className="rounded-full border border-border bg-surface px-4 py-3 text-center font-sans text-[13px] font-medium text-text min-h-[44px] flex items-center justify-center"
          >
            {t('cancelLink')}
          </SmartLink>
        </div>
      </div>
    </AppShell>
  );
}
