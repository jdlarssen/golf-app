import { Suspense } from 'react';
import { getTranslations, getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getMyClubs } from '@/lib/clubs/getMyClubs';
import { isClubAdminAnywhere } from '@/lib/clubs/isClubAdminAnywhere';
import { nextRoundByClub } from '@/lib/clubs/clubRoomRows';
import { getMyCupIds, cupLedgerHref } from '@/lib/cup/myCups';
import { getCupSnapshot } from '@/lib/cup/getCupSnapshot';
import { cupProgress, splitCupsForRoom } from '@/lib/cup/cupRoomRows';
import { getUpcomingClubGames } from '@/lib/games/getUpcomingClubGames';
import { getArrangedRounds } from '@/lib/games/getArrangedRounds';
import { groupArrangedRounds } from '@/lib/games/arrangedGames';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { SectionError } from '@/components/ui/SectionError';
import { ArrangedRoundsSkeleton, ArrangedRoundsView } from '@/components/games/ArrangedRoundsView';
import { firstName } from '@/lib/firstName';
import type { AppLocale } from '@/i18n/routing';
import { type AdminRoleContext } from '@/lib/admin/auth';
import {
  GreetingView,
  NewRoundCard,
  NewRoundCardSkeleton,
  ClubsView,
  CupsView,
  RoomSectionSkeleton,
  ToolsView,
  type RoomClub,
  type RoomCup,
} from './PlayerKlubbhusViews';

/**
 * Player (non-admin) view of the universal Klubbhuset room (#392, #892),
 * redrawn as the room where your rounds live (#2493): greeting, the one door
 * for a new round, «Rundene dine» (the same view and read as /klubbhuset,
 * #2269), your clubs with numbers, your cups with progress, and tools.
 *
 * The greeting and tools paint at once; every other section streams behind
 * its own Suspense boundary, and a failed read gives an error box in that
 * section alone (#2490).
 *
 * Reads with the admin client, each with its gate:
 * - start blocks for your planned rounds (`readCreatorStartBlock`, inside
 *   `getArrangedRounds`): only ids from your own `created_by` read;
 * - the next round in your clubs (`getUpcomingClubGames`): only club ids from
 *   your own memberships (`getMyClubs`);
 * - your cups' names and status, and their snapshots (`getCupSnapshot`): only
 *   cup ids from your own rows (`getMyCupIds`). A club cup's participant who is
 *   not a club member cannot read the cup under RLS, so the request client
 *   would drop it;
 * - whether you can make a club tournament (`isClubAdminAnywhere`): your own id.
 * Everything else (your games and their rosters, your clubs, member counts)
 * reads through the request client and RLS.
 */
export async function PlayerKlubbhus({ role }: { role: AdminRoleContext }) {
  const tNav = await getTranslations('admin.nav');
  return (
    <AdminShell>
      <TopBar kicker={tNav('klubbhus')} />

      <GreetingView name={firstName(role.name)} />

      <Suspense fallback={<NewRoundCardSkeleton />}>
        <NewRoundSection userId={role.userId} />
      </Suspense>

      <Suspense fallback={<ArrangedRoundsSkeleton />}>
        <RoundsSection userId={role.userId} />
      </Suspense>

      <Suspense fallback={<RoomSectionSkeleton rows={2} />}>
        <ClubsSection userId={role.userId} />
      </Suspense>

      <Suspense fallback={null}>
        <CupsSection userId={role.userId} />
      </Suspense>

      <ToolsView />
    </AdminShell>
  );
}

async function NewRoundSection({ userId }: { userId: string }) {
  return <NewRoundCard isClubAdmin={await isClubAdminAnywhere(userId)} />;
}

/**
 * Rundene dine (#2269): the three nearest planned rounds, with «Alle {n} →» to
 * /klubbhuset when there are more. Same read and view as /klubbhuset, so the two
 * never show different things.
 */
async function RoundsSection({ userId }: { userId: string }) {
  const supabase = await getServerClient();
  const locale = (await getLocale()) as AppLocale;
  const read = await getArrangedRounds(supabase, userId, { upcomingLimit: 3 });
  if (!read.ok) {
    console.error('[klubbhus] arranged rounds', read.error);
    return (
      <div className="pt-[18px]">
        <SectionError testId="klubbhus-rounds-error" />
      </div>
    );
  }
  return (
    <ArrangedRoundsView
      rounds={groupArrangedRounds(read.games, read.rosterByGame, { startBlocks: read.startBlocks })}
      isAdmin={false}
      locale={locale}
      upcomingLimit={3}
      upcomingAllHref="/klubbhuset"
    />
  );
}

async function ClubsSection({ userId }: { userId: string }) {
  const supabase = await getServerClient();
  const result = await getMyClubs(supabase, userId);
  if (!result.ok) return <ClubsView clubs={null} />;
  if (result.clubs.length === 0) return <ClubsView clubs={[]} />;

  const ids = result.clubs.map((c) => c.id);
  const [counts, upcoming] = await Promise.all([
    // RLS «group_members select member or admin»: a member counts the club.
    Promise.all(
      ids.map((id) =>
        supabase
          .from('group_members')
          .select('user_id', { count: 'exact', head: true })
          .eq('group_id', id),
      ),
    ),
    // Service role; the gate is `ids`, the viewer's own clubs (above).
    getUpcomingClubGames(ids),
  ]);
  const failed = counts.find((c) => c.error) ?? (upcoming.error ? upcoming : null);
  if (failed) {
    console.error('[klubbhus] club numbers', failed.error);
    return <ClubsView clubs={null} />;
  }

  const next = nextRoundByClub(upcoming.data ?? [], new Date());
  const clubs: RoomClub[] = result.clubs.map((club, i) => ({
    ...club,
    members: counts[i].count ?? 0,
    nextRoundAt: next.get(club.id) ?? null,
  }));
  return <ClubsView clubs={clubs} />;
}

type RoomCupRow = {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'finished';
  created_by: string;
  group_id: string | null;
};

async function CupsSection({ userId }: { userId: string }) {
  const supabase = await getServerClient();
  const idsRes = await getMyCupIds(supabase, userId);
  if (!idsRes.ok) return <CupsView cups={null} finishedCount={0} />;
  if (idsRes.ids.length === 0) return <CupsView cups={[]} finishedCount={0} />;

  // Status FIRST, with the service role on exactly these ids (same authz shape
  // as /admin/cup and `getCupSnapshot`): only cups that are not finished get
  // a snapshot.
  const { data, error } = await getAdminClient()
    .from('tournaments')
    .select('id, name, status, created_by, group_id')
    .in('id', idsRes.ids)
    .order('created_at', { ascending: false })
    .returns<RoomCupRow[]>();
  if (error) {
    console.error('[klubbhus] cups', error);
    return <CupsView cups={null} finishedCount={0} />;
  }

  const { live, finishedCount } = splitCupsForRoom(data ?? []);
  const t = await getTranslations('cup');
  let cups: RoomCup[];
  try {
    cups = await Promise.all(
      live.map(async (cup) => {
        const snapshot = await getCupSnapshot(cup.id, t('manage.unknownPlayer'));
        return {
          id: cup.id,
          name: cup.name,
          href: cupLedgerHref(cup, { userId, isAdmin: false }),
          ...cupProgress(snapshot?.leaderboard ?? null),
        };
      }),
    );
  } catch (snapshotError) {
    console.error('[klubbhus] cup snapshots', snapshotError);
    return <CupsView cups={null} finishedCount={0} />;
  }
  return <CupsView cups={cups} finishedCount={finishedCount} />;
}
