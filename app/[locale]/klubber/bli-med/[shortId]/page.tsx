import { first } from '@/lib/url/searchParams';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SmartLink } from '@/components/ui/SmartLink';
import { requestToJoin } from './actions';

type Params = Promise<{ shortId: string }>;
type SearchParams = Promise<{
  sent?: string | string[];
  error?: string | string[];
}>;

/**
 * /klubber/bli-med/[shortId] — shareable join-link landing page.
 *
 * States:
 *   - Not logged in → redirect to /login?next=...
 *   - Club not found → 404
 *   - Already a member → confirmation card with link to club
 *   - Pending request exists (sent=1) → «Forespørselen er sendt» banner
 *   - Otherwise → club name + «Be om å bli med» form
 *
 * Part of #442 (Opprett klubb — eierskap + klubb-scoped oppdagbarhet).
 */
export default async function BliMedPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { shortId } = await params;
  const sp = await searchParams;

  const sent = first(sp.sent) === '1';
  const errorCode = first(sp.error);

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const locale = await getLocale();

  if (!user) {
    redirect({ href: `/login?next=/klubber/bli-med/${shortId}`, locale });
  }

  const admin = getAdminClient();

  // Look up club via admin client — non-member can't read groups via RLS.
  const { data: group } = await admin
    .from('groups')
    .select('id, name')
    .eq('short_id', shortId)
    .maybeSingle<{ id: string; name: string }>();

  if (!group) notFound();

  // Check membership status — use admin client for consistent access.
  const { data: membership } = await admin
    .from('group_members')
    .select('role')
    .eq('group_id', group.id)
    .eq('user_id', user!.id)
    .maybeSingle();

  const t = await getTranslations('klubb.join');

  if (membership) {
    // Already a member — show confirmation and link to club.
    return (
      <AppShell>
        <TopBar backHref="/klubber" kicker={t('kicker')} />
        <PageHeader title={group.name} />
        <Card>
          <p className="font-sans text-[15px] text-text mb-4">
            {t('alreadyMember', { name: group.name })}
          </p>
          <SmartLink
            href={`/klubber/${group.id}`}
            className="block rounded-full bg-primary px-4 py-3 text-center font-sans text-[15px] font-semibold text-white min-h-[44px] flex items-center justify-center"
          >
            {t('goToClubButton')}
          </SmartLink>
        </Card>
      </AppShell>
    );
  }

  // Check for existing pending request (to show correct state without ?sent=1).
  const { data: existingRequest } = await admin
    .from('group_join_requests')
    .select('id, status')
    .eq('group_id', group.id)
    .eq('user_id', user!.id)
    .maybeSingle<{ id: string; status: string }>();

  const hasPendingRequest = existingRequest?.status === 'pending';
  const showSentState = sent || hasPendingRequest;

  return (
    <AppShell>
      <TopBar backHref="/klubber" kicker={t('kicker')} />
      <PageHeader
        title={group.name}
        subtitle={
          showSentState
            ? undefined
            : t('subtitle')
        }
      />

      {showSentState && (
        <div className="mb-6" data-testid="join-sent-banner">
          <Banner tone="success">
            {t('sentBanner')}
          </Banner>
        </div>
      )}

      {errorCode && !showSentState && (
        <div className="mb-6">
          <Banner tone="error">
            {t(`errors.${errorCode}` as Parameters<typeof t>[0], undefined as never) ?? t('errors.fallback')}
          </Banner>
        </div>
      )}

      {!showSentState && (
        <Card>
          <form action={requestToJoin} className="space-y-4" data-testid="join-request-form">
            <input type="hidden" name="shortId" value={shortId} />
            <SubmitButton className="w-full" pendingLabel={t('submitPending')}>
              {t('submitButton')}
            </SubmitButton>
          </form>
        </Card>
      )}
    </AppShell>
  );
}
