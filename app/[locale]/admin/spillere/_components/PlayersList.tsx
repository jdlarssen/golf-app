// Server component: fetches all fully-onboarded players plus their finished
// rounds, builds the register rows (rounds, last round, labels) and passes them
// to PlayersListClient for live in-memory filtering (mirrors the Baner/courses
// catalog pattern in CoursesLedgerClient.tsx).
import { getTranslations, getLocale } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { PlayersListClient } from './PlayersListClient';
import { getAdminClient } from '@/lib/supabase/admin';
import { getServerClient } from '@/lib/supabase/server';
import { selectAllRows } from '@/lib/supabase/selectAllRows';
import { formatHcpDisplay } from '@/lib/handicap/signFormat';
import {
  buildRegisterRows,
  filterRegister,
  sortRegister,
  tallyRounds,
  type RegisterFilter,
  type RegisterUser,
  type RoundRow,
} from '@/lib/admin/playerRegister';

export async function PlayersList({
  searchQuery,
  filter,
}: {
  searchQuery: string;
  filter: RegisterFilter;
}) {
  const t = await getTranslations('admin.players');
  const locale = (await getLocale()) as AppLocale;
  // Request client, not the service role: the page sits behind requireAdmin and
  // RLS already lets an admin read every game_players/games row (#2346).
  const supabase = await getServerClient();

  // Only show fully-onboarded players. Pending invitees have NULL name and
  // profile_completed_at and would otherwise duplicate the entry shown in
  // the pending-invitations list. Picker handles the in-between state.
  // #2207: rendered only from admin/spillere, after its requireAdmin gate.
  // Paged (#2227): the whole roster outgrows PostgREST's 1 000-row cap.
  const [users, roundRows] = await Promise.all([
    selectAllRows(
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
          .returns<RegisterUser[]>(),
      'PlayersList users',
    ),
    // One read for every player's rounds, not one per player. A round is a
    // finished game the player has not withdrawn from.
    selectAllRows(
      (from, to) =>
        supabase
          .from('game_players')
          .select('user_id, games!inner(scheduled_tee_off_at, ended_at)')
          .eq('games.status', 'finished')
          .is('withdrawn_at', null)
          .order('game_id')
          .order('user_id')
          .range(from, to)
          .returns<RoundRow[]>(),
      'PlayersList rounds',
    ),
  ]);

  const register = sortRegister(
    buildRegisterRows(users, tallyRounds(roundRows), new Date(), locale, t('playedToday')),
  );
  const rows = register.map((r) => ({
    ...r,
    metaLabel: t('rowMeta', { hcp: formatHcpDisplay(r.hcp_index, locale), rounds: r.rounds }),
  }));

  // Pass the template string with a literal '{query}' so the client component
  // can interpolate the live search term without a server roundtrip.
  const emptyNoMatchTemplate = t('emptyNoMatch', { query: '{query}' });

  return (
    <PlayersListClient
      rows={rows}
      initialQuery={searchQuery}
      initialFilter={filter}
      searchAriaLabel={t('searchAriaLabel')}
      searchPlaceholder={t('searchPlaceholder')}
      filterGroupLabel={t('filterGroupLabel')}
      filterLabels={{
        alle: t('filterAll', { count: rows.length }),
        'spilt-i-aar': t('filterPlayedThisYear', {
          count: filterRegister(register, 'spilt-i-aar').length,
        }),
        gjester: t('filterGuests', { count: filterRegister(register, 'gjester').length }),
      }}
      showAllLabel={t('showAll', { count: rows.length })}
      emptyNoPlayers={t('emptyNoPlayers')}
      emptyNoMatchTemplate={emptyNoMatchTemplate}
      emptyFilterLabels={{
        'spilt-i-aar': t('emptyNoPlayedThisYear'),
        gjester: t('emptyNoGuests'),
      }}
    />
  );
}
