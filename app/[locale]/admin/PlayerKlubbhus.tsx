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
import { readAnyOwnStandaloneRound } from '@/lib/games/readAnyOwnStandaloneRound';
import { getRegistrationSeats } from '@/lib/games/getRegistrationSeats';
import { getDiscoverableGames } from '@/lib/games/getDiscoverableGames';
import { hasOpenRounds } from '@/lib/games/terminliste';
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
 * (Terminlista and «Klubben din») and the tools. Three quick reads choose the
 * version (one own round, your clubs, your cup ids); the card comes with that
 * choice, and «Rundene dine», the clubs and the cups each stream behind their
 * own Suspense, from reads started at once and shared through a request cache.
 * The greeting paints at once. A failed read gives an error box in that section
 * alone (#2490), never the new player's version.
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
 * - the open rounds for a new player's Terminlista row (`getDiscoverableGames`):
 *   the gate is inside the function — club rounds only in your own clubs,
 *   friends' and open rounds only with a registration mode you can sign up
 *   for, and only base info that is safe to show (see its top comment);
 * - whether those rounds are full (`getRegistrationSeats`): only the games that
 *   list just returned, and only counts leave it.
 * Everything else (your games and their rosters, your clubs, member counts)
 * reads through the request client and RLS.
 *
 * The room sits on the app's background, as its artboards draw it (owner's
 * answer 05.10); the rest of Klubbhuset keeps the linen.
 */
export async function PlayerKlubbhus({ role }: { role: AdminRoleContext }) {
  const tNav = await getTranslations('admin.nav');
  const { userId } = role;
  // Start every section's read now, before anything waits on the choice of
  // version; the sections await the same cached promises. The catch only
  // marks them handled here: a section that awaits one still sees its error.
  readRounds(userId).catch(() => {});
  readClubNumbers(userId).catch(() => {});
  readRoomCups(userId).catch(() => {});
  return (
    <AdminShell tone="app">
      <TopBar kicker={tNav('klubbhus')} />

      <GreetingView name={firstName(role.name)} />

      <Suspense fallback={<NewRoundCardSkeleton />}>
        <TopSection userId={userId} />
      </Suspense>

      {/* Before the choice, a plain label and card of rows: it fits both the
          new player's «Bli med» and the room's first section. */}
      <Suspense fallback={<RoomSectionSkeleton rows={2} />}>
        <RoomBody userId={userId} />
      </Suspense>
    </AdminShell>
  );
}

// Reads cached for the request, so the choice of version and the sections
// share them instead of reading again.
const readRounds = cache(async (userId: string) =>
  getArrangedRounds(await getServerClient(), userId, { upcomingLimit: 3 }),
);
const readClubs = cache(async (userId: string) => getMyClubs(await getServerClient(), userId));
const readCupIds = cache(async (userId: string) => getMyCupIds(await getServerClient(), userId));

// Whether you made any standalone round: one row is enough to know, so the
// choice of version does not wait for «Rundene dine» (rosters, start blocks).
const readAnyOwnRound = cache(async (userId: string) =>
  readAnyOwnStandaloneRound(await getServerClient(), userId),
);

/**
 * The new player's version or the room from #2493 (`isNewPlayer`): three
 * quick reads (one own round, your clubs, your cup ids), each one round trip,
 * in parallel. A failed read is never «new».
 */
const readIsNewPlayer = cache(async (userId: string) => {
  const [rounds, clubs, cups] = await Promise.all([
    readAnyOwnRound(userId),
    readClubs(userId),
    readCupIds(userId),
  ]);
  return isNewPlayer({ rounds, clubs, cups });
});

// What the clubs and cups sections read after their first read: started at
// once (above), not after the choice of version. For a new player they find
// nothing and read nothing more.
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

/**
 * The new player's subtitle and the «Lag en ny runde» card, together: the
 * card waits only for the quick choice and the club-admin check, both one
 * round trip, in parallel, so the subtitle never pushes it down afterwards.
 */
async function TopSection({ userId }: { userId: string }) {
  const [isNew, isClubAdmin] = await Promise.all([readIsNewPlayer(userId), isClubAdminAnywhere(userId)]);
  return (
    <>
      {isNew && <NewPlayerSubtitle />}
      <NewRoundCard isClubAdmin={isClubAdmin} />
    </>
  );
}

async function RoomBody({ userId }: { userId: string }) {
  if (await readIsNewPlayer(userId)) {
    return (
      <>
        <Suspense fallback={<RoomSectionSkeleton rows={2} />}>
          <JoinSection userId={userId} />
        </Suspense>
        <ToolsView rowHeight="min-h-14" />
      </>
    );
  }

  return (
    <>
      <Suspense fallback={<ArrangedRoundsSkeleton />}>
        <RoundsSection userId={userId} />
      </Suspense>
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
 * Bli med for a new player (#2494): the Terminlista row stands only when the
 * list has a round you can sign up for (owner's answer 05.10, O1 B):
 * `hasOpenRounds` over the list's own rows and seats, read the way
 * /finn-turneringer reads them; a pending request is no open round.
 * `getDiscoverableGames` swallows its read errors, so a failed read hides the
 * row too; /finn-turneringer reads the same function and would show nothing.
 */
async function JoinSection({ userId }: { userId: string }) {
  const data = await getDiscoverableGames(userId);
  const seats = await getRegistrationSeats([...data.clubGames, ...data.friendGames, ...data.openGames]);
  return <JoinView hasOpenRounds={hasOpenRounds(data, seats)} />;
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
