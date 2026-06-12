import { redirect } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { InboxClient } from './InboxClient';
import { MonthlyDigestToggle } from './MonthlyDigestToggle';
import type { NotificationRow } from '@/components/notifications/NotificationCard';
import type { AppLocale } from '@/i18n/routing';

// /innboks-flaten lever ved siden av spill-rutene — TopBar med chevron
// tilbake til /, kicker «INNBOKS». RLS sørger for at vi kun ser egne
// notifications-rader; ingen behov for eksplisitt user_id-filter, men
// vi inkluderer den slik at partial-indexen `notifications_user_unread_
// created` brukes.
export default async function InboxPage() {
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations('inbox');

  const userId = await getProxyVerifiedUserId();
  if (!userId) {
    redirect({ href: '/login', locale });
    return;
  }

  const supabase = await getServerClient();
  const { data: rows } = await supabase
    .from('notifications')
    .select('id, kind, payload, read_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100)
    .returns<NotificationRow[]>();

  const notifications = rows ?? [];

  const { data: profile } = await supabase
    .from('users')
    .select('product_updates_unsubscribed_at')
    .eq('id', userId)
    .maybeSingle();
  const monthlyOptIn = profile?.product_updates_unsubscribed_at == null;

  return (
    <AppShell>
      <TopBar
        backHref="/"
        backLabel={t('backLabel')}
        kicker={t('kicker')}
      />
      <div className="mb-4">
        <MonthlyDigestToggle initialOptIn={monthlyOptIn} />
      </div>
      <InboxClient initialNotifications={notifications} />
    </AppShell>
  );
}
