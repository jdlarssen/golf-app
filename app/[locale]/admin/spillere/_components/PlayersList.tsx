// Server component: fetches all fully-onboarded players and passes them to
// PlayersListClient for live in-memory filtering (mirrors the Baner/courses
// catalog pattern in CoursesLedgerClient.tsx).
import { getTranslations, getLocale } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { PlayersListClient } from './PlayersListClient';
import { getAdminClient } from '@/lib/supabase/admin';
import { selectAllRows } from '@/lib/supabase/selectAllRows';

type User = {
  id: string;
  name: string | null;
  nickname: string | null;
  email: string;
  hcp_index: number;
  is_admin: boolean;
  is_guest: boolean;
  created_at: string;
};

export async function PlayersList({ searchQuery }: { searchQuery: string }) {
  const t = await getTranslations('admin.players');
  const locale = (await getLocale()) as AppLocale;

  // Only show fully-onboarded players. Pending invitees have NULL name and
  // profile_completed_at and would otherwise duplicate the entry shown in
  // the pending-invitations list. Picker handles the in-between state.
  // #2207: rendered only from admin/spillere, after its requireAdmin gate.
  // Paged (#2227): the whole roster outgrows PostgREST's 1 000-row cap.
  const users = await selectAllRows(
    (from, to) =>
      getAdminClient()
        .from('users')
        .select('id, name, nickname, email, hcp_index, is_admin, is_guest, created_at')
        .not('profile_completed_at', 'is', null)
        // #1012: anonymiserte husk-rader er ikke spillere lenger — de skjules her
        // (og i tellingen på sida).
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to)
        .returns<User[]>(),
    'PlayersList users',
  );

  // Pass the template string with a literal '{query}' so the client component
  // can interpolate the live search term without a server roundtrip.
  const emptyNoMatchTemplate = t('emptyNoMatch', { query: '{query}' });

  return (
    <PlayersListClient
      users={users}
      initialQuery={searchQuery}
      locale={locale}
      searchAriaLabel={t('searchAriaLabel')}
      searchPlaceholder={t('searchPlaceholder')}
      emptyNoPlayers={t('emptyNoPlayers')}
      emptyNoMatchTemplate={emptyNoMatchTemplate}
    />
  );
}
