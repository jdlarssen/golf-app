import { Suspense, cache } from 'react';
import { getTranslations, getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getMyClubs } from '@/lib/clubs/getMyClubs';
import { getNextClubRounds } from '@/lib/clubs/getNextClubRounds';
import { isClubAdminAnywhere } from '@/lib/clubs/isClubAdminAnywhere';
import { cupLedgerHref, getMyCupIds } from '@/lib/cup/myCups';
import { getRoomCups } from '@/lib/cup/getRoomCups';
import { getArrangedRounds } from '@/lib/games/getArrangedRounds';
import { groupArrangedRounds } from '@/lib/games/arrangedGames';
import { getDiscoverableGames } from '@/lib/games/getDiscoverableGames';
import { buildTerminEntries } from '@/lib/games/terminliste';
import { isNewPlayer } from '@/lib/games/isNewPlayer';
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
  NewPlayerSubtitle,
  JoinView,
  type RoomClub,
  type RoomCup,
} from './PlayerKlubbhusViews';

/**
 * Player (non-admin) view of the universal Klubbhuset room (#392, #892),
 * redrawn as the room where your rounds live (#2493): greeting, the one door
 * for a new round, «Rundene dine» (the same view and read as /klubbhuset,
 * #2269), your clubs with numbers, your cups with progress, and tools.
 *
 * A player with no round, no club and no cup gets the new player's version
 * instead (#2494, `isNewPlayer`): a subtitle, the same card, «Bli med»
 * (Terminlista and «Klubben din») and the tools. Your rounds, your clubs and
 * your cup ids are read once, in parallel, to choose; the sections reuse the
 * answers. The greeting paints at once; the rest streams, the clubs' and cups'
 * numbers each behind their own Suspense, and a failed read gives an error box
 * in that section alone (#2490), never the new player's version.
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
 * - whether you can make a club tournament (`isClubAdminAnywhere`): your own id;
 * - the open rounds for a new player's Terminlista line (`getDiscoverableGames`):
 *   the gate is inside the function — club rounds only in your own clubs,
 *   friends' and open rounds only with a registration mode you can sign up
 *   for, and only base info that is safe to show (see its top comment).
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

      <Suspense
        fallback={
          <>
            <NewRoundCardSkeleton />
            <ArrangedRoundsSkeleton />
          </>
        }
      >
        <RoomBody userId={role.userId} />
      </Suspense>
    </AdminShell>
  );
}

// The three reads that choose the room's version, cached for the request so
// the sections reuse them instead of reading again.
const readRounds = cache(async (userId: string) =>
  getArrangedRounds(await getServerClient(), userId, { upcomingLimit: 3 }),
);
const readClubs = cache(async (userId: string) => getMyClubs(await getServerClient(), userId));
const readCupIds = cache(async (userId: string) => getMyCupIds(await getServerClient(), userId));

// What the clubs and cups sections read after those: started as soon as their
// own first read is in, not after the choice, so choosing the version does not
// hold them up. For a new player they find nothing and read nothing more.
const readClubNumbers = cache(async (userId: string) => {
  const result = await readClubs(userId);
  if (!result.ok || result.clubs.length === 0) return null;
  const supabase = await getServerClient();
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
  return { counts, next };
});
const readRoomCups = cache(async (userId: string) => {
  const t = await getTranslations('cup');
  return getRoomCups(await readCupIds(userId), t('manage.unknownPlayer'));
});

async function RoomBody({ userId }: { userId: string }) {
  // Start the follow-up reads now; the sections await the same promises. The
  // catch only marks them handled here: a section that awaits one still sees
  // its error.
  readClubNumbers(userId).catch(() => {});
  readRoomCups(userId).catch(() => {});
  const [rounds, clubs, cups, isClubAdmin] = await Promise.all([
    readRounds(userId),
    readClubs(userId),
    readCupIds(userId),
    isClubAdminAnywhere(userId),
  ]);

  if (isNewPlayer({ rounds, clubs, cups })) {
    return (
      <>
        <NewPlayerSubtitle />
        <NewRoundCard isClubAdmin={isClubAdmin} />
        <Suspense fallback={<RoomSectionSkeleton rows={2} />}>
          <JoinSection userId={userId} />
        </Suspense>
        <ToolsView rowHeight="min-h-14" />
      </>
    );
  }

  return (
    <>
      <NewRoundCard isClubAdmin={isClubAdmin} />
      <RoundsSection userId={userId} />
      <Suspense fallback={<RoomSectionSkeleton rows={2} />}>
        <ClubsSection userId={userId} />
      </Suspense>
      <Suspense fallback={null}>
        <CupsSection userId={userId} />
      </Suspense>
      <ToolsView />
    </>
  );
}

/**
 * Bli med for a new player (#2494): Terminlista says whether there are open
 * rounds to sign up for. «Empty» counts open rounds only, as the list shows
 * them (`buildTerminEntries`), not pending requests: a request is no open
 * round. `getDiscoverableGames` swallows its read errors, so a failed read
 * also says «Ingen åpne runder akkurat nå»; the row and its link stand either
 * way, and /finn-turneringer reads the same function.
 */
async function JoinSection({ userId }: { userId: string }) {
  const terminEmpty = buildTerminEntries(await getDiscoverableGames(userId), new Map()).length === 0;
  return <JoinView terminEmpty={terminEmpty} />;
}

/**
 * Rundene dine (#2269): the three nearest planned rounds, with «Alle {n} →» to
 * /klubbhuset when there are more. Same read and view as /klubbhuset, so the two
 * never show different things.
 */
async function RoundsSection({ userId }: { userId: string }) {
  const locale = (await getLocale()) as AppLocale;
  const read = await readRounds(userId);
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
  const result = await readClubs(userId);
  if (!result.ok) return <ClubsView clubs={null} />;
  if (result.clubs.length === 0) return <ClubsView clubs={[]} />;

  const numbers = await readClubNumbers(userId);
  const failedCount = numbers?.counts.find((c) => c.error);
  if (!numbers || failedCount || !numbers.next.ok) {
    console.error('[klubbhus] club numbers', failedCount?.error ?? 'next round');
    return <ClubsView clubs={null} />;
  }
  const { counts, next } = numbers;

  const clubs: RoomClub[] = result.clubs.map((club, i) => ({
    ...club,
    members: counts[i].count ?? 0,
    nextRoundAt: next.next.get(club.id) ?? null,
  }));
  return <ClubsView clubs={clubs} />;
}

async function CupsSection({ userId }: { userId: string }) {
  const read = await readRoomCups(userId);
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
