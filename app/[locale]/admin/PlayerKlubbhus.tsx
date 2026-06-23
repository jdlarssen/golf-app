import { Suspense } from 'react';
import { getTranslations, getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getMyClubs } from '@/lib/clubs/getMyClubs';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { firstName } from '@/lib/firstName';
import { localizeGameName } from '@/lib/games/autoGameName';
import type { AppLocale } from '@/i18n/routing';
import type { GameStatus } from '@/lib/games/status';
import { type AdminRoleContext } from '@/lib/admin/auth';
import {
  GreetingView,
  ArrangementView,
  ArrangementSkeleton,
  ClubsView,
  ClubsSkeleton,
  ToolsView,
  type ArrangedGame,
} from './PlayerKlubbhusViews';

// Max created games shown inline before «Se alle →» overflows to /klubbhuset.
const MAX_ARRANGED = 4;

type ArrangedGameRow = {
  id: string;
  name: string;
  status: GameStatus;
  courses: { name: string } | null;
};

/**
 * Player (non-admin) view of the universal Klubbhuset room (#392, #892). An
 * adaptive room: greeting + an invitation to arrange (or the games you arrange)
 * + your clubs + tools. It varies on just two facts — do you have clubs, and
 * have you created anything — so a pure joiner gets a calm, inviting room with
 * no dead-end empty list.
 *
 * Greeting + tools paint immediately; the arrangement block and the club list
 * each stream behind their own Suspense boundary. Request-scoped client only —
 * no admin counts reach the player room.
 */
export async function PlayerKlubbhus({ role }: { role: AdminRoleContext }) {
  const tNav = await getTranslations('admin.nav');
  return (
    <AdminShell>
      <TopBar backHref="/" kicker={tNav('klubbhus')} />

      <GreetingView name={firstName(role.name)} />

      <Suspense fallback={<ArrangementSkeleton />}>
        <ArrangementSection userId={role.userId} />
      </Suspense>

      <Suspense fallback={<ClubsSkeleton />}>
        <ClubsSection userId={role.userId} />
      </Suspense>

      <ToolsView />
    </AdminShell>
  );
}

async function ArrangementSection({ userId }: { userId: string }) {
  const supabase = await getServerClient();
  const locale = (await getLocale()) as AppLocale;

  // Created games (RLS 0071 «games select own created») + personal-cup count
  // (RLS select-own; group_id null = personal cup). Fetch limit+1 to detect the
  // «Se alle →» overflow without a second count query.
  const [gamesRes, cupRes] = await Promise.all([
    supabase
      .from('games')
      .select('id, name, status, courses(name)')
      .eq('created_by', userId)
      .order('created_at', { ascending: false })
      .limit(MAX_ARRANGED + 1)
      .returns<ArrangedGameRow[]>(),
    supabase
      .from('tournaments')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', userId)
      .is('group_id', null),
  ]);

  const rows = gamesRes.data ?? [];
  const hasMore = rows.length > MAX_ARRANGED;
  const games: ArrangedGame[] = rows.slice(0, MAX_ARRANGED).map((g) => ({
    id: g.id,
    name: localizeGameName(g.name, g.courses?.name ?? null, locale),
    courseName: g.courses?.name ?? null,
    status: g.status,
  }));

  return (
    <ArrangementView games={games} hasMore={hasMore} cupCount={cupRes.count ?? 0} />
  );
}

async function ClubsSection({ userId }: { userId: string }) {
  const supabase = await getServerClient();
  const { clubs } = await getMyClubs(supabase, userId);
  return <ClubsView clubs={clubs} />;
}
