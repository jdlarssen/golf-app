import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getRoleContext } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { formatShortOsloDayMonthLocale } from '@/lib/i18n/format';
import type { AppLocale } from '@/i18n/routing';
import { markIdeaBuilt } from './actions';

// #984: Admin-only liste over innsendte ideer. «Marker som bygd» for å lukke
// sløyfen og sende in-app-varsel til innsenderen.

type IdeaRow = {
  id: string;
  text: string;
  status: string | null;
  built_at: string | null;
  created_at: string;
  users: { name: string | null } | null;
};

export default async function AdminIdeerPage() {
  const supabase = await getServerClient();
  const { isAdmin, userId } = await getRoleContext(supabase);

  if (!isAdmin) notFound();

  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations('adminIdeer');

  // Admin sees all rows (RLS SELECT policy: user_id = auth.uid() OR is_admin()).
  const { data } = await supabase
    .from('idea_submissions')
    .select('id, text, status, built_at, created_at, users(name)')
    .order('created_at', { ascending: false })
    .limit(100)
    .returns<IdeaRow[]>();

  const rows = data ?? [];
  void userId;

  return (
    <AdminShell>
      <TopBar backHref="/admin" backLabel={t('backLabel')} />
      <PageHeader title={t('pageTitle')} subtitle={t('pageSubtitle')} />

      {rows.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">{t('empty')}</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            const built = row.status === 'bygd';
            const submitterName = row.users?.name ?? t('unknownSubmitter');
            const date = formatShortOsloDayMonthLocale(row.created_at, locale);
            const builtDate = row.built_at
              ? formatShortOsloDayMonthLocale(row.built_at, locale)
              : null;

            return (
              <li key={row.id}>
                <Card>
                  <div className="space-y-3">
                    {/* Idea text */}
                    <p className="font-sans text-sm leading-relaxed text-text whitespace-pre-wrap">
                      {row.text}
                    </p>

                    {/* Meta row: submitter + date + status */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-sans text-xs text-muted">
                        {submitterName} · {date}
                      </p>

                      {built ? (
                        <span className="inline-flex items-center rounded-full border border-success/40 bg-primary-soft px-2.5 py-0.5 font-sans text-[11px] font-medium text-success">
                          {t('statusBuilt')}
                          {builtDate ? ` · ${builtDate}` : ''}
                        </span>
                      ) : (
                        <form action={markIdeaBuilt}>
                          <input type="hidden" name="id" value={row.id} />
                          <SubmitButton
                            variant="secondary"
                            className="min-h-[36px] px-3 py-1 text-sm"
                            pendingLabel={t('markingBuilt')}
                          >
                            {t('markAsBuilt')}
                          </SubmitButton>
                        </form>
                      )}
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </AdminShell>
  );
}
