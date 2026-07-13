import { first } from '@/lib/url/searchParams';
import { cache } from 'react';
import { getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Input } from '@/components/ui/Input';
import { createClubForAdmin } from './actions';

type SearchParams = Promise<{
  error?: string | string[];
  email?: string | string[];
  name?: string | string[];
}>;

const requireAdminContext = cache(async () => {
  const supabase = await getServerClient();
  await requireAdmin(supabase);
});

/**
 * /admin/klubber/ny — admin create-club form.
 *
 * Admin-only. Creates a club with just a name + a named owner (who must already
 * have a Tørny account). Member cap and duration are set afterwards on the club's
 * detail page, so the create form stays down to the two required fields.
 *
 * Part of #50 (Klubb-eierskap, delegering & tilgangsstyring).
 */
export default async function NyKlubbPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdminContext();

  const sp = await searchParams;
  const errorCode = first(sp.error);
  const errorEmail = first(sp.email);
  // #645: re-populate the form from the values echoed by the action on a
  // validation-error redirect, so only the offending field needs fixing.
  const prevName = first(sp.name) ?? '';

  const t = await getTranslations('klubb');

  const errorMessage = errorCode
    ? errorCode === 'owner_not_found' && errorEmail
      ? t('create.errors.owner_not_found', { email: errorEmail })
      : t(`create.errors.${errorCode}` as Parameters<typeof t>[0]) ?? t('create.errors.unknown')
    : undefined;

  return (
    <AdminShell>
      <TopBar backHref="/admin/klubber" kicker={t('create.pageKicker')} />
      <PageHeader title={t('create.pageTitle')} />

      {errorMessage && (
        <div className="mb-6">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      <Card>
        <form action={createClubForAdmin} className="space-y-5">
          <Input
            id="name"
            name="name"
            type="text"
            label={t('create.nameLabel')}
            placeholder={t('create.namePlaceholder')}
            defaultValue={prevName}
            maxLength={60}
            required
          />
          <Input
            id="owner_email"
            name="owner_email"
            type="email"
            label={t('create.ownerEmailLabel')}
            placeholder={t('create.ownerEmailPlaceholder')}
            defaultValue={errorEmail ?? ''}
            autoComplete="off"
            hint={t('create.ownerEmailHint')}
            required
          />

          <SubmitButton className="w-full" pendingLabel={t('create.submitPending')}>
            {t('create.submitButton')}
          </SubmitButton>
        </form>
      </Card>
    </AdminShell>
  );
}
