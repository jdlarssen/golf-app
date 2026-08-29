import { after } from 'next/server';
import { redirect } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import {
  collectSignupGameIds,
  partitionStaleSignupNotifications,
} from '@/lib/notifications/staleNotifications';
import { archiveStaleNotifications } from '@/lib/notifications/archive';
import { InboxClient } from './InboxClient';
import { MonthlyDigestToggle } from './MonthlyDigestToggle';
import type { NotificationRow } from '@/components/notifications/NotificationCard';
import type { AppLocale } from '@/i18n/routing';

// /innboks-flaten lever ved siden av spill-rutene — TopBar med chevron
// tilbake til /, kicker «INNBOKS». RLS sørger for at vi kun ser egne
// notifications-rader; ingen behov for eksplisitt user_id-filter, men
// vi inkluderer den + `archived_at is null` slik at partial-indexen
// `notifications_user_active_created` (#616) brukes — arkiverte varsler
// skjules fra lista (soft-archive, ikke slettet).
export default async function InboxPage() {
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations('inbox');

  const userId = await getProxyVerifiedUserId();
  if (!userId) {
    redirect({ href: '/login', locale });
    return;
  }

  const supabase = await getServerClient();
  const { data: rows, error: rowsError } = await supabase
    .from('notifications')
    .select('id, kind, payload, read_at, created_at')
    .eq('user_id', userId)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(100)
    .returns<NotificationRow[]>();
  // Feiler spørringen skal error-grensa ta over med «Prøv igjen» — ikke
  // tomtilstanden, som ville påstå at ingenting venter (#1392).
  if (rowsError) throw rowsError;

  const notifications = rows ?? [];

  // Skjul påmeldings-varsler som peker til et spill som ikke lenger finnes
  // (slettet/utilgjengelig) — de navigerer til /admin/games/[id]/signups som
  // kaller notFound(), en blindvei. Én batched eksistens-spørring via
  // admin-klienten (kun id-sjekk, bypasser RLS — ingen datalekkasje siden vi
  // bare sjekker spill brukeren allerede er varslet om). (#613)
  const signupGameIds = collectSignupGameIds(notifications);
  let visibleNotifications = notifications;
  if (signupGameIds.length > 0) {
    const { data: existing, error: existingError } = await getAdminClient()
      .from('games')
      .select('id')
      .in('id', signupGameIds)
      .returns<{ id: string }[]>();
    // Feiler eksistens-oppslaget, ville et tomt `existing` stemplet ALLE
    // påmeldings-varsler som stale — og fra #1393 arkivert dem. Samme regel
    // som de andre spørringene på sida (#1392): feil → error-grensa, ikke
    // gjett.
    if (existingError) throw existingError;
    const existingIds = new Set((existing ?? []).map((g) => g.id));
    const { visible, stale } = partitionStaleSignupNotifications(
      notifications,
      existingIds,
    );
    visibleNotifications = visible;

    // Å bare skjule dem holdt ikke: radene ble liggende uleste, og
    // bunn-nav-prikken teller uleste — den kunne aldri slukkes fordi ingen
    // flate kunne åpne varselet (#1393). Vi arkiverer + markerer lest når
    // brukeren først er innom innboksen. I `after()` fordi DB-skriving og
    // revalidateTag ikke er lov i render-fasen i Next.js 16 (samme mønster som
    // spill-hjem-sida), og best-effort: feiler det, står raden bare over til
    // neste besøk.
    const staleIds = stale.map((row) => row.id);
    if (staleIds.length > 0) {
      after(async () => {
        await archiveStaleNotifications({ userId, ids: staleIds });
      });
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('product_updates_unsubscribed_at')
    .eq('id', userId)
    .maybeSingle();
  // Samme grunn: en svelget feil her ville vist månedsbrev-bryteren i feil
  // tilstand (#1392).
  if (profileError) throw profileError;
  const monthlyOptIn = profile?.product_updates_unsubscribed_at == null;

  return (
    <AppShell>
      <TopBar
        backHref="/"
        backLabel={t('backLabel')}
        kicker={t('kicker')}
      />
      <InboxClient initialNotifications={visibleNotifications} />
      {/* #1799: bryteren er en innstilling, ikke et varsel — den bor nederst
          så varslene (grunnen til at du er her) kommer først. */}
      <div className="mt-6">
        <MonthlyDigestToggle initialOptIn={monthlyOptIn} />
      </div>
    </AppShell>
  );
}
