import { first } from '@/lib/url/searchParams';
import { redirect } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { submitIdea } from './actions';

// #984: Foreslå en idé — lean feedback-boks. Gated på innlogget (ikke admin).
// Admin-only versjon av håndtaket er /admin/ideer.

type SearchParams = Promise<{
  sent?: string | string[];
  error?: string | string[];
}>;

export default async function ForeslaaIdePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const locale = await getLocale();
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: '/login', locale });
    return null;
  }

  const [sp, t] = await Promise.all([searchParams, getTranslations('foreslaaIde')]);

  const sent = first(sp.sent) === '1';
  const errorCode = first(sp.error);

  return (
    <AdminShell>
      <TopBar backHref="/admin" backLabel={t('backLabel')} userId={user.id} />
      <PageHeader title={t('pageTitle')} subtitle={t('pageSubtitle')} />

      {sent && (
        <div className="mb-6" data-testid="idea-sent-banner">
          <Banner tone="success">{t('successMessage')}</Banner>
        </div>
      )}

      {errorCode && !sent && (
        <div className="mb-6">
          <Banner tone="error">{t('errorEmpty')}</Banner>
        </div>
      )}

      {!sent && (
        <Card>
          <form action={submitIdea}>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="idea-text"
                  className="block font-sans text-sm font-medium text-text mb-2"
                >
                  {t('fieldLabel')}
                </label>
                <textarea
                  id="idea-text"
                  name="text"
                  rows={5}
                  maxLength={2000}
                  placeholder={t('fieldPlaceholder')}
                  className="w-full resize-none rounded-xl border border-border bg-bg px-4 py-3 font-sans text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 leading-relaxed"
                  aria-describedby="idea-helper"
                />
                <p id="idea-helper" className="mt-1.5 font-sans text-xs text-muted">
                  {t('fieldHelper')}
                </p>
              </div>

              <SubmitButton className="w-full" pendingLabel={t('submitPending')}>
                {t('submitLabel')}
              </SubmitButton>
            </div>
          </form>
        </Card>
      )}

      {sent && (
        <Card className="text-center">
          <p className="font-sans text-sm text-muted">{t('sentFollowUp')}</p>
        </Card>
      )}
    </AdminShell>
  );
}
