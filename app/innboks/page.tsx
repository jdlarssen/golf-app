import { redirect } from 'next/navigation';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { InboxClient } from './InboxClient';
import type { NotificationRow } from '@/components/notifications/NotificationCard';

// /innboks-flaten lever ved siden av spill-rutene — TopBar med chevron
// tilbake til /, kicker «INNBOKS». RLS sørger for at vi kun ser egne
// notifications-rader; ingen behov for eksplisitt user_id-filter, men
// vi inkluderer den slik at partial-indexen `notifications_user_unread_
// created` brukes.
export default async function InboxPage() {
  const userId = await getProxyVerifiedUserId();
  if (!userId) redirect('/login');

  const supabase = await getServerClient();
  const { data: rows } = await supabase
    .from('notifications')
    .select('id, kind, payload, read_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100)
    .returns<NotificationRow[]>();

  const notifications = rows ?? [];

  return (
    <AppShell>
      <TopBar
        backHref="/"
        backLabel="Tilbake til hjem"
        kicker="Innboks"
      />
      <InboxClient initialNotifications={notifications} />
    </AppShell>
  );
}
