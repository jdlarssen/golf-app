import { first } from '@/lib/url/searchParams';
import { Suspense, cache } from 'react';
import { getTranslations, getLocale } from 'next-intl/server';
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
import { Skeleton } from '@/components/ui/Skeleton';
import { formatShortDateWithYearLocale } from '@/lib/i18n/format';
import { previousMonthPeriod } from '@/lib/productUpdates/digest';
import { publishProductUpdateAction, sendDigestNowAction } from './actions';
import type { AppLocale } from '@/i18n/routing';

type SearchParams = Promise<{
  published?: string | string[];
  recipients?: string | string[];
  digest?: string | string[];
  updates?: string | string[];
  error?: string | string[];
}>;

// Cached so the page-body and any other Suspense bodies share one auth
// round-trip per request. Routes through the shared `requireAdmin` helper
// (Fase 4 #223 chunk 2 lifts the layout-gate).
const requireAdminContext = cache(async () => {
  const supabase = await getServerClient();
  const role = await requireAdmin(supabase);
  return { userId: role.userId, supabase };
});

export default async function LanseringerPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdminContext();
  const params = await searchParams;

  const t = await getTranslations('admin.launches');
  const tNav = await getTranslations('admin.nav');

  const publishedFlag = first(params.published);
  const publishedCount = first(params.recipients);
  const digestStatus = first(params.digest);
  const digestUpdates = first(params.updates);
  const errorCode = first(params.error);
  const errorMessage = errorCode
    ? t(`errors.${errorCode}` as Parameters<typeof t>[0])
    : undefined;

  const successMessage = publishedFlag
    ? t('success.published', { count: Number(publishedCount ?? '0') })
    : digestStatus === 'sent'
      ? t('success.digestSent', {
          count: Number(publishedCount ?? '0'),
          updates: Number(digestUpdates ?? '0'),
        })
      : digestStatus === 'already_sent'
        ? t('success.digestAlreadySent')
        : digestStatus === 'no_updates'
          ? t('success.digestNoUpdates')
          : undefined;

  return (
    <AdminShell>
      <TopBar backHref="/admin" kicker={tNav('klubbhus')} />

      <div className="px-1">
        <h1 className="mb-0.5 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          {t('title')}
        </h1>
        <p className="font-sans text-[11.5px] text-muted">
          {t('subtitle')}
        </p>
      </div>

      {(successMessage || errorMessage) && (
        <div className="mt-4 space-y-2">
          {successMessage && <Banner tone="success">{successMessage}</Banner>}
          {errorMessage && <Banner tone="error">{errorMessage}</Banner>}
        </div>
      )}

      <section className="mt-5">
        <MiniRibbon>{t('publishSection')}</MiniRibbon>
        <Card>
          <form action={publishProductUpdateAction} className="space-y-4">
            <Input
              id="title"
              name="title"
              type="text"
              label={t('titleLabel')}
              hint={t('titleHint')}
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
                className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-text placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                placeholder={t('bodyPlaceholder')}
              />
              <p className="mt-1.5 text-xs text-muted">
                {t('bodyHint')}
              </p>
            </div>
            <Input
              id="link"
              name="link"
              type="text"
              label={t('linkLabel')}
              hint={t('linkHint')}
              pattern="^/.*"
              maxLength={200}
            />
            <Input
              id="cta_label"
              name="cta_label"
              type="text"
              label={t('ctaLabel')}
              hint={t('ctaHint')}
              maxLength={40}
            />
            <div className="pt-1">
              <SubmitButton pendingLabel={t('publishingBusy')}>{t('publishButton')}</SubmitButton>
            </div>
          </form>
        </Card>
      </section>

      <section className="mt-6">
        <MiniRibbon>{t('digestSection')}</MiniRibbon>
        <Suspense fallback={<DigestSkeleton />}>
          <DigestCard />
        </Suspense>
      </section>

      <section className="mt-6">
        <MiniRibbon>{t('previousSection')}</MiniRibbon>
        <Suspense fallback={<ListSkeleton />}>
          <PreviousUpdatesList />
        </Suspense>
      </section>
    </AdminShell>
  );
}

async function DigestCard() {
  const admin = getAdminClient();
  const t = await getTranslations('admin.launches');
  const locale = (await getLocale()) as AppLocale;
  const { periodStart, periodEnd, periodLabel } = previousMonthPeriod();

  const { data: existing } = await admin
    .from('product_update_digests')
    .select('sent_at, recipient_count')
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .maybeSingle<{ sent_at: string; recipient_count: number }>();

  return (
    <Card>
      <p className="font-serif text-base font-medium text-text">
        {t('digestHeading', { periodLabel })}
      </p>
      {existing ? (
        <p className="mt-1 font-sans text-sm text-muted">
          {t('digestSentLine', {
            date: formatShortDateWithYearLocale(existing.sent_at, locale),
            count: existing.recipient_count,
          })}
        </p>
      ) : (
        <p className="mt-1 font-sans text-sm text-muted">
          {t('digestNotSentYet')}
        </p>
      )}
      {!existing && (
        <form action={sendDigestNowAction} className="mt-4">
          <SubmitButton pendingLabel={t('sendingBusy')}>{t('sendDigestButton')}</SubmitButton>
        </form>
      )}
    </Card>
  );
}

function DigestSkeleton() {
  return (
    <Card>
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="mt-2 h-3.5 w-1/2" />
    </Card>
  );
}

async function PreviousUpdatesList() {
  const admin = getAdminClient();
  const t = await getTranslations('admin.launches');
  const locale = (await getLocale()) as AppLocale;

  const { data: updates } = await admin
    .from('product_updates')
    .select('id, title, body, link, cta_label, created_at')
    .order('created_at', { ascending: false })
    .limit(20)
    .returns<
      {
        id: string;
        title: string;
        body: string;
        link: string | null;
        cta_label: string | null;
        created_at: string;
      }[]
    >();

  if (!updates || updates.length === 0) {
    return (
      <Card>
        <p className="font-sans text-sm text-muted">
          {t('emptyPrevious')}
        </p>
      </Card>
    );
  }

  return (
    <ul className="flex flex-col gap-2 list-none p-0">
      {updates.map((u) => (
        <li key={u.id}>
          <Card>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-serif text-base font-medium text-text">
                {u.title}
              </h3>
              <time
                dateTime={u.created_at}
                className="shrink-0 font-sans text-[11px] tabular-nums text-muted"
              >
                {formatShortDateWithYearLocale(u.created_at, locale)}
              </time>
            </div>
            <p className="mt-1.5 font-sans text-sm text-muted">{u.body}</p>
            {u.link && (
              <p className="mt-2 font-sans text-[11px] text-muted">
                Lenke: <code className="text-text">{u.link}</code>
                {u.cta_label ? ` · «${u.cta_label}»` : ''}
              </p>
            )}
          </Card>
        </li>
      ))}
    </ul>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-20 rounded-2xl" />
      <Skeleton className="h-20 rounded-2xl" delay={60} />
    </div>
  );
}
