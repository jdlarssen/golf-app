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
// #2277: «Stemmer ikke noe? Si fra» på en baneside lenker hit med ?bane=<slug>
// (courseReportHref), og feltet fylles med banens navn — en melding til admin.

type SearchParams = Promise<{
  sent?: string | string[];
  error?: string | string[];
  bane?: string | string[];
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
  }

  const [sp, t] = await Promise.all([searchParams, getTranslations('foreslaaIde')]);

  const sent = first(sp.sent) === '1';
  const errorCode = first(sp.error);

  // Banens navn fra sluggen. Ingen treff eller en feil gir tomt felt, som før.
  const courseSlug = first(sp.bane);
  let prefill: string | undefined;
  if (courseSlug && !sent) {
    const { data: course, error } = await supabase
      .from('courses')
      .select('name')
      .eq('slug', courseSlug)
      .maybeSingle();
    if (error) console.error('[foreslaa-ide] course prefill failed', error);
    if (course) prefill = t('coursePrefill', { name: course.name });
  }

  return (
    <AdminShell>
      <TopBar backHref="/admin" backLabel={t('backLabel')} />
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
            {/* #2277: lets submitIdea tell an untouched prefill from an idea
                and keep ?bane on its error redirect. */}
            {courseSlug && <input type="hidden" name="bane" value={courseSlug} />}
            {prefill && <input type="hidden" name="prefill" value={prefill} />}
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
                  defaultValue={prefill}
                  className="w-full resize-none rounded-xl border border-border bg-bg px-4 py-3 font-sans text-sm text-text placeholder:text-muted focus:ring-2 focus:ring-primary/30 leading-relaxed"
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
