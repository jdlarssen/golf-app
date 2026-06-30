import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { first } from '@/lib/url/searchParams';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Input } from '@/components/ui/Input';
import { MiniRibbon } from '@/components/ui/MiniRibbon';
import { editProductUpdateAction } from '../../actions';

type Params = Promise<{ locale: string; id: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

export default async function EditLaunchPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  // Gate (the [locale] error boundary catches any throw as a friendly screen).
  const supabase = await getServerClient();
  await requireAdmin(supabase);

  const { id } = await params;
  const t = await getTranslations('admin.launches');

  // Admin-client read: product_updates is world-readable, but the publish page
  // already reads it via the admin-client, so we stay consistent.
  const admin = getAdminClient();
  const { data: update } = await admin
    .from('product_updates')
    .select('id, title, body, link, cta_label')
    .eq('id', id)
    .maybeSingle<{
      id: string;
      title: string;
      body: string;
      link: string | null;
      cta_label: string | null;
    }>();

  if (!update) notFound();

  const errorCode = first((await searchParams).error);
  const errorMessage = errorCode
    ? t(`errors.${errorCode}` as Parameters<typeof t>[0])
    : undefined;

  return (
    <AdminShell>
      <TopBar backHref="/admin/lanseringer" kicker={t('title')} />

      <div className="px-1">
        <h1 className="mb-0.5 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          {t('editTitle')}
        </h1>
        <p className="font-sans text-[11.5px] text-muted">{t('editSubtitle')}</p>
      </div>

      {errorMessage && (
        <div className="mt-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      <section className="mt-5">
        <MiniRibbon>{update.title}</MiniRibbon>
        <Card>
          <form action={editProductUpdateAction} className="space-y-4">
            <input type="hidden" name="id" value={update.id} />
            <Input
              id="title"
              name="title"
              type="text"
              label={t('titleLabel')}
              hint={t('titleHint')}
              defaultValue={update.title}
              required
              maxLength={120}
            />
            <div>
              <label
                htmlFor="body"
                className="block text-sm font-medium text-text mb-1.5"
              >
                {t('bodyLabel')}
              </label>
              <textarea
                id="body"
                name="body"
                required
                rows={3}
                maxLength={400}
                defaultValue={update.body}
                className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-text placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                placeholder={t('bodyPlaceholder')}
              />
              <p className="mt-1.5 text-xs text-muted">{t('bodyHint')}</p>
            </div>
            <Input
              id="link"
              name="link"
              type="text"
              label={t('linkLabel')}
              hint={t('linkHint')}
              defaultValue={update.link ?? ''}
              pattern="^/.*"
              maxLength={200}
            />
            <Input
              id="cta_label"
              name="cta_label"
              type="text"
              label={t('ctaLabel')}
              hint={t('ctaHint')}
              defaultValue={update.cta_label ?? ''}
              maxLength={40}
            />
            <p className="rounded-lg bg-primary-soft/40 px-3 py-2 text-xs text-muted">
              {t('editPropagationNote')}
            </p>
            <div className="pt-1">
              <SubmitButton pendingLabel={t('editingBusy')}>
                {t('editButton')}
              </SubmitButton>
            </div>
          </form>
        </Card>
      </section>
    </AdminShell>
  );
}
