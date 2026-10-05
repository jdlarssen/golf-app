import { Suspense } from 'react';
import { getTranslations, getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getMyClubs } from '@/lib/clubs/getMyClubs';
import { getNextClubRounds } from '@/lib/clubs/getNextClubRounds';
import { isClubAdminAnywhere } from '@/lib/clubs/isClubAdminAnywhere';
import { cupLedgerHref } from '@/lib/cup/myCups';
import { getRoomCups } from '@/lib/cup/getRoomCups';
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
 * - the next round in each of your clubs (`getNextClubRounds`, one query per
 *   club): only club ids from your own memberships (`getMyClubs`);
 * - your cups' names and status, and their snapshots (`getRoomCups`): only cup
 *   ids from your own rows (`getMyCupIds`). A club cup's participant who is
 *   not a club member cannot read the cup under RLS, so the request client
 *   would drop it;
 * - whether you can make a club tournament (`isClubAdminAnywhere`): your own id.
 * Everything else (your games and their rosters, your clubs, member counts)
 * reads through the request client and RLS.
 *
 * The room sits on the app's background, as its artboards draw it (owner's
 * answer 05.10); the rest of Klubbhuset keeps the linen.
 */
export async function PlayerKlubbhus({ role }: { role: AdminRoleContext }) {
  const tNav = await getTranslations('admin.nav');
  return (
    <AdminShell tone="app">
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
  const [counts, next] = await Promise.all([
    // RLS «group_members select member or admin»: a member counts the club.
    Promise.all(
      ids.map((id) =>
        supabase
          .from('group_members')
          .select('user_id', { count: 'exact', head: true })
          .eq('group_id', id),
      ),
    ),
    // Service role inside; the gate is `ids`, the viewer's own clubs (above).
    getNextClubRounds(ids, new Date()),
  ]);
  const failedCount = counts.find((c) => c.error);
  if (failedCount || !next.ok) {
    console.error('[klubbhus] club numbers', failedCount?.error ?? 'next round');
    return <ClubsView clubs={null} />;
  }

  const clubs: RoomClub[] = result.clubs.map((club, i) => ({
    ...club,
    members: counts[i].count ?? 0,
    nextRoundAt: next.next.get(club.id) ?? null,
  }));
  return <ClubsView clubs={clubs} />;
}

async function CupsSection({ userId }: { userId: string }) {
  const supabase = await getServerClient();
  const t = await getTranslations('cup');
  const read = await getRoomCups(supabase, userId, t('manage.unknownPlayer'));
  if (!read.ok) return <CupsView cups={null} finishedCount={0} />;

  const cups: RoomCup[] = read.live.map((cup) => ({
    id: cup.id,
    name: cup.name,
    href: cupLedgerHref(cup, { userId, isAdmin: false }),
    playing: cup.playing,
    progress: cup.progress,
  }));
  return <CupsView cups={cups} finishedCount={read.finishedCount} />;
}
