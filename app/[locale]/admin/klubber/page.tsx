import { cache } from 'react';
import { getTranslations } from 'next-intl/server';
import { getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { getAllClubsForAdmin } from '@/lib/clubs/getAllClubsForAdmin';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { SmartLink } from '@/components/ui/SmartLink';
import { getClubStatusBadge } from '@/lib/clubs/clubStatus';
import type { AppLocale } from '@/i18n/routing';

const requireAdminContext = cache(async () => {
  const supabase = await getServerClient();
  const role = await requireAdmin(supabase);
  return { userId: role.userId };
});

/**
 * /admin/klubber — admin club governance list.
 *
 * Shows all clubs with owner names, member counts, and status badges.
 * Admin-only; non-admins are redirected by requireAdmin.
 *
 * Part of #50 (Klubb-eierskap, delegering & tilgangsstyring).
 */
export default async function AdminKlubbListePage() {
  await requireAdminContext();

  const [clubs, t, locale] = await Promise.all([
    getAllClubsForAdmin(),
    getTranslations('klubb'),
    getLocale(),
  ]);

  return (
    <AdminShell>
      <TopBar backHref="/admin" kicker={t('manage.pageKicker')} />
      <PageHeader
        title={t('manage.pageTitle')}
        action={
          <LinkButton href="/admin/klubber/ny" variant="primary">
            {t('manage.createButton')}
          </LinkButton>
        }
      />

      {clubs.length === 0 ? (
        <Card>
          <p className="font-sans text-sm text-muted">
            {t('manage.emptyState')}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {clubs.map((club) => {
            const statusBadge = getClubStatusBadge(club.valid_until, locale as AppLocale);
            const badgeLabel =
              statusBadge.tone === 'expiresOn'
                ? t('status.expiresOn', { date: statusBadge.date })
                : t(`status.${statusBadge.tone}`);
            return (
              <SmartLink
                key={club.id}
                href={`/admin/klubber/${club.id}`}
                className="block"
              >
                <Card className="hover:border-primary/30 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-serif text-base font-medium text-text leading-snug">
                        {club.name}
                      </p>
                      <p className="mt-0.5 font-sans text-xs text-muted truncate">
                        {club.ownerNames.length > 0
                          ? club.ownerNames.join(', ')
                          : t('manage.noOwner')}
                      </p>
                      <p className="mt-1.5 font-sans text-xs tabular-nums text-muted">
                        {club.member_cap != null
                          ? t('manage.memberCountWithCap', {
                              count: club.memberCount,
                              cap: club.member_cap,
                            })
                          : t('manage.memberCount', { count: club.memberCount })}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-0.5 font-sans text-xs font-medium ${statusBadge.className}`}
                    >
                      {badgeLabel}
                    </span>
                  </div>
                </Card>
              </SmartLink>
            );
          })}
        </div>
      )}
    </AdminShell>
  );
}
