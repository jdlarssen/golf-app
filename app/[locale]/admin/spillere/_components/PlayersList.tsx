// Server component: fetches all fully-onboarded players and passes them to
// PlayersListClient for live in-memory filtering (mirrors the Baner/courses
// catalog pattern in CoursesLedgerClient.tsx).
import { getTranslations, getLocale } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { getServerClient } from '@/lib/supabase/server';
import { PlayersListClient } from './PlayersListClient';

type User = {
  id: string;
  name: string | null;
  nickname: string | null;
  email: string;
  hcp_index: number;
  is_admin: boolean;
  created_at: string;
};

export async function PlayersList({ searchQuery }: { searchQuery: string }) {
  const supabase = await getServerClient();
  const t = await getTranslations('admin.players');
  const locale = (await getLocale()) as AppLocale;

  // Only show fully-onboarded players. Pending invitees have NULL name and
  // profile_completed_at and would otherwise duplicate the entry shown in
  // the pending-invitations list. Picker handles the in-between state.
  const { data, error } = await supabase
    .from('users')
    .select('id, name, nickname, email, hcp_index, is_admin, created_at')
    .not('profile_completed_at', 'is', null)
    .order('created_at', { ascending: false })
    .returns<User[]>();

  if (error) throw error;

  const users = data ?? [];

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
