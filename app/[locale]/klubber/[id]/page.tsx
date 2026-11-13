import { Suspense } from 'react';
import { first } from '@/lib/url/searchParams';
import { klubbhusBackHref } from '@/lib/url/klubbhusOrigin';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { after } from 'next/server';
import { getLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getClubDetail } from '@/lib/clubs/getClubDetail';
import { getClubRounds } from '@/lib/clubs/getClubRounds';
import type { ClubMember } from '@/lib/clubs/getClubDetail';
import { getFinishedGameWins } from '@/lib/stats/getFinishedGameWins';
import { rankBoard } from '@/lib/stats/aeresbrett';
import { osloParts } from '@/lib/format/teeOff';
import { markReadOnVisit } from '@/lib/notifications/markRead';
import { nameInitials } from '@/lib/names/initials';
import { AppShell } from '@/components/ui/AppShell';
import { Banner } from '@/components/ui/Banner';
import { LinkButton } from '@/components/ui/Button';
import { SmartLink } from '@/components/ui/SmartLink';
import { SectionError } from '@/components/ui/SectionError';
import { ChevronRightIcon } from '@/components/icons';
import { ClubLeaguesSection } from './ClubLeaguesSection';
import { ClubCupsSection } from './ClubCupsSection';
import { ClubRoundsSection, ClubRoundsSkeleton } from './ClubRoundsSection';
import { ClubBoardSection } from './ClubBoardSection';
import { isClubExpired } from '@/lib/clubs/clubStatus';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  kilde?: string | string[];
  status?: string | string[];
  name?: string | string[];
}>;

/** Members listed on the page; the rest are on /klubber/[id]/medlemmer. */
const MEMBERS_SHOWN = 5;
/** Initials in the green head. */
const INITIALS_SHOWN = 3;

/**
 * /klubber/[id] — the club's page for its members (#2326, artboard «Forslag:
 * klubbens side»): the green head with the name, a row of initials and «32
 * medlemmer · du er eier», the club's next rounds, its honour board, the first five members,
 * the club's leagues and cups, «Sett opp en runde for klubben» and «Forlat
 * klubb» (hidden for the only owner, whose confirm page would block them).
 *
 * Owner and admin get one door under the head, «Administrer klubben»
 * (/klubber/[id]/administrer): requests, invitations, «Legg til medlem» and
 * the club link live there. The whole member list with «Endre rolle» and
 * «Fjern» is /klubber/[id]/medlemmer. This page keeps the banners for an
 * expired club and for a deleted club cup or league (#2329), whose lists
 * stand here.
 *
 * Part of #442 (Opprett klubb — eierskap + klubb-scoped oppdagbarhet).
 */
export default async function KlubbDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const locale = await getLocale();

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: '/login', locale });

  // #2201: opening the club marks its `club_role_changed` varsler read; a
  // `club_join_request` is read on /administrer (#2326). Before the membership gate.
  after(() => markReadOnVisit({ userId: user.id, surface: 'club', entityId: id }));

  const detail = await getClubDetail(supabase, id, user.id);
  if (!detail) notFound();

  const { club, members, myRole, pendingRequests } = detail;
  const isAdmin = myRole === 'owner' || myRole === 'admin';

  // #480: klubbens ligaer. RLS («leagues select scoped») lar medlemmer se
  // klubb-scopede rader; oppretting/styring er klubb-admin (knapp nedenfor).
  // #524: klubbens cuper — samme mønster («tournaments select scoped»).
  // #1491: mine egne roster-rader, så en kladd-cup kan vise «Meld deg på» eller
  // «Påmeldt» rett i lista. Filtrert på meg selv og lest med request-klienten
  // (policyen `tournament_participants_select_authenticated`, 0155, er
  // `using (true)`). Alle tre kjører parallelt: roster-raden trenger ikke
  // cup-id-ene, bare mitt bruker-id.
  const [leaguesRes, cupsRes, rosterRes] =
    await Promise.all([
      supabase
        .from('leagues')
        .select('id, name, status')
        .eq('group_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('tournaments')
        .select('id, name, status, short_id')
        .eq('group_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('tournament_participants')
        .select('tournament_id')
        .eq('user_id', user.id),
    ]);

  // #2490: a failed read is not «no leagues» / «no cups». Each section gets
  // its own error box; the cup list needs both the cups and my roster rows.
  if (leaguesRes.error) console.error('[klubb] leagues', leaguesRes.error);
  const cupsError = cupsRes.error ?? rosterRes.error;
  if (cupsError) console.error('[klubb] cups', cupsError);

  const joinedCupIds = new Set(
    (rosterRes.data ?? []).map((row) => row.tournament_id),
  );
  const cupRows = (cupsRes.data ?? []).map((cup) => ({
    ...cup,
    joined: joinedCupIds.has(cup.id),
  }));

  // #50: en utløpt klubb (frossen avtale) tar ikke imot nye medlemmer eller
  // spill. Vi skjuler rundene og «sett opp runde», og viser et utløpt-banner.
  // Medlemsstyring (roller, fjern, forlat) er fortsatt mulig.
  const frozen = isClubExpired(club.valid_until);

  // Determine whether to show leave link (hide for the only owner).
  const ownerCount = members.filter((m) => m.role === 'owner').length;
  const iSoleOwner = myRole === 'owner' && ownerCount === 1;

  const statusCode = first(sp.status);
  const deletedName = first(sp.name);

  const [t, tRoles, tNav, tCup, tLiga] = await Promise.all([
    getTranslations('klubb.room'),
    getTranslations('klubb.roles'),
    getTranslations('nav'),
    getTranslations('cup.manage'),
    getTranslations('liga.ledger'),
  ]);

  // #2329: receipt after a club cup or club league was deleted. The delete
  // actions redirect here with the name, and only after a row was removed.
  const deletedMessage = !deletedName
    ? null
    : statusCode === 'cup_deleted'
      ? tCup('deletedMessage', { name: deletedName })
      : statusCode === 'league_deleted'
        ? tLiga('deletedBannerNamed', { name: deletedName })
        : null;

  // Fra Klubbhuset (?kilde=klubbhuset) går tilbake dit, ikke til lista du
  // aldri gikk gjennom (#2487).
  const backHref = klubbhusBackHref(sp.kilde, '/klubber');

  return (
    <AppShell flush>
      <header
        data-focus-surface="strong"
        data-testid="club-head"
        className="bg-surface-strong px-2 pt-2 pb-[18px] leading-[normal] text-on-strong"
      >
        <div className="flex items-center justify-between">
          <SmartLink
            href={backHref}
            aria-label={backHref === '/admin' ? tNav('backToClubhouse') : t('backToClubs')}
            className="flex size-11 items-center justify-center text-on-strong"
          >
            <svg
              aria-hidden
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </SmartLink>
          <p className="text-xs font-semibold text-on-strong/80">{t('kicker')}</p>
          <span aria-hidden className="w-11" />
        </div>
        <div className="px-3">
          <h1 className="font-serif text-[30px] font-medium">{club.name}</h1>
          <div className="mt-2 flex items-center gap-2">
            <span aria-hidden className="flex">
              {members.slice(0, INITIALS_SHOWN).map((member, i) => (
                <span
                  key={member.userId}
                  className={`flex size-[26px] items-center justify-center rounded-full bg-on-strong text-[9px] font-semibold text-surface-strong ring-2 ring-surface-strong${
                    i > 0 ? ' -ml-1.5' : ''
                  }`}
                >
                  {nameInitials(member.name)}
                </span>
              ))}
            </span>
            <span className="text-[13px] text-on-strong/90" data-testid="club-member-line">
              {t('memberLine', { count: members.length, role: myRole })}
            </span>
          </div>
        </div>
      </header>

      {deletedMessage && (
        <div className="mx-4 mt-4">
          <Banner tone="success" testId="club-deleted-banner">
            {deletedMessage}
          </Banner>
        </div>
      )}

      {frozen && (
        <div className="mx-4 mt-4">
          <Banner tone="warning">{t('frozenBanner')}</Banner>
        </div>
      )}

      {/* Owner and admin: one door to requests, invitations and the club link. */}
      {isAdmin && (
        <div className="mx-4 mt-4">
          <SmartLink
            href={`/klubber/${club.id}/administrer`}
            data-testid="club-manage-door"
            data-waiting={pendingRequests.length}
            className="flex min-h-11 items-center gap-3 rounded-2xl border border-border bg-surface px-[14px] py-3 leading-[normal] text-text transition-colors hover:bg-surface-2"
          >
            <span className="block min-w-0 grow">
              <span className="block text-[15px] font-semibold">{t('manageDoor')}</span>
              {pendingRequests.length > 0 && (
                <span className="mt-0.5 block text-[12px] font-semibold text-warning-text">
                  {t('manageWaiting', { count: pendingRequests.length })}
                </span>
              )}
            </span>
            <ChevronRightIcon className="shrink-0 text-muted" />
          </SmartLink>
        </div>
      )}

      {/* «Neste runder i klubben» — not in an expired club, which takes no rounds. */}
      {!frozen && (
        <Suspense fallback={<ClubRoundsSkeleton />}>
          <RoundsSection clubId={club.id} userId={user.id} />
        </Suspense>
      )}

      {/* «Klubbens æresbrett» (#2326 PR2) — hidden until the season has a finished round. */}
      <Suspense fallback={null}>
        <BoardSection clubId={club.id} userId={user.id} members={members} />
      </Suspense>

      {/* The first five members; the whole list is on /medlemmer. */}
      <section aria-labelledby="club-members-heading" data-testid="club-members">
        <div className="flex items-baseline justify-between px-5 pt-[18px] pb-2 leading-[normal]">
          <h2 id="club-members-heading" className="text-xs font-semibold text-muted">
            {club.member_cap != null
              ? t('membersSectionWithCap', { count: members.length, cap: club.member_cap })
              : t('membersSection', { count: members.length })}
          </h2>
          <SmartLink
            href={`/klubber/${club.id}/medlemmer`}
            aria-label={t('seeAllMembersLabel')}
            className="flex min-h-11 min-w-11 items-center justify-end text-[13px] font-semibold text-primary underline"
          >
            {t('seeAllMembers')}
          </SmartLink>
        </div>
        <ul className="mx-4 list-none divide-y divide-row-divider-warm overflow-hidden rounded-2xl border border-border bg-surface p-0">
          {members.slice(0, MEMBERS_SHOWN).map((member) => (
            <li
              key={member.userId}
              className="flex min-h-11 items-center justify-between gap-3 px-[14px] py-2.5 leading-[normal]"
            >
              <span className="truncate text-[15px] font-medium text-text">
                {member.name}
                {member.userId === user.id && (
                  <>
                    {' '}
                    <span className="ml-0.5 font-normal text-muted">{t('youSuffix')}</span>
                  </>
                )}
              </span>
              <span className="shrink-0 rounded-full border border-border px-2.5 py-0.5 text-xs text-muted">
                {tRoles(member.role)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="px-5 pt-8">
        {/* Klubbens ligaer (#480) — alle medlemmer ser lista; owner/admin oppretter. */}
        {leaguesRes.error ? (
          <div className="mb-8">
            <SectionError testId="club-leagues-error" />
          </div>
        ) : (
          <ClubLeaguesSection
            leagues={leaguesRes.data ?? []}
            clubId={club.id}
            canCreate={isAdmin && !frozen}
            canManage={isAdmin}
          />
        )}

        {/* Klubbens cuper (#524) — alle medlemmer ser lista; owner/admin oppretter.
            Kladd-rader har påmeldings-døra (#1491). */}
        {cupsError ? (
          <div className="mb-8">
            <SectionError testId="club-cups-error" />
          </div>
        ) : (
          <ClubCupsSection
            cups={cupRows}
            clubId={club.id}
            canCreate={isAdmin && !frozen}
            canManage={isAdmin}
          />
        )}
      </div>

      {/* Create a game scoped to this club (any member) — frozen when expired. */}
      {!frozen && (
        <section className="mx-4 mb-4">
          <LinkButton
            href={`/opprett-spill?klubb=${club.id}`}
            size="large"
            full
            className="text-[15px]!"
          >
            {t('setupRoundButton')}
          </LinkButton>
        </section>
      )}

      {/* Leave club */}
      {!iSoleOwner && (
        <section className="mx-4">
          <SmartLink
            href={`/klubber/${club.id}/forlat`}
            className="block rounded-full border border-border bg-surface px-4 py-3 text-center font-sans text-[13px] font-medium text-danger min-h-[44px] flex items-center justify-center"
          >
            {t('leaveLink')}
          </SmartLink>
        </section>
      )}
    </AppShell>
  );
}

/**
 * The club's rounds (#2326), streamed behind their own Suspense. The page has
 * already confirmed the membership with `getClubDetail`, which is the gate
 * for the service-role read inside `getClubRounds`.
 */
async function RoundsSection({ clubId, userId }: { clubId: string; userId: string }) {
  const supabase = await getServerClient();
  const read = await getClubRounds(supabase, clubId, userId, new Date());
  if (!read.ok) {
    return (
      <div className="mx-4 pt-4">
        <SectionError testId="club-rounds-error" />
      </div>
    );
  }
  return <ClubRoundsSection entries={read.entries} socialProof={read.socialProof} />;
}

/**
 * The honour board (#2326 PR2): wins in the club's finished rounds this Oslo
 * year, or last year while this year has none, current members only. Hidden
 * while neither year has a finished club round. The page has confirmed the
 * membership with `getClubDetail`, which is the gate for the service-role
 * read inside `getFinishedGameWins`; the names are the member list's own.
 */
async function BoardSection({
  clubId,
  userId,
  members,
}: {
  clubId: string;
  userId: string;
  members: readonly ClubMember[];
}) {
  const board = await readBoard(clubId, members);
  if (!board.ok) {
    return (
      <div className="mx-4 pt-[18px]">
        <SectionError testId="club-board-error" />
      </div>
    );
  }
  if (board.season === null) return null;
  const me = board.rows.find((row) => row.userId === userId) ?? null;
  return <ClubBoardSection year={board.season} rows={board.rows} me={me} />;
}

/** The board's season and rows; `season: null` when no year has a finished round. */
async function readBoard(
  clubId: string,
  members: readonly ClubMember[],
): Promise<
  | { ok: true; season: number | null; rows: ReturnType<typeof rankBoard> }
  | { ok: false }
> {
  try {
    const { year } = osloParts(new Date());
    let season = year;
    let wins = await getFinishedGameWins({ groupId: clubId, seasonYear: season });
    if (!wins.hasGames) {
      season = year - 1;
      wins = await getFinishedGameWins({ groupId: clubId, seasonYear: season });
    }
    if (!wins.hasGames) return { ok: true, season: null, rows: [] };

    const names = new Map(members.map((m) => [m.userId, m.name]));
    const rows = rankBoard(
      wins.winnerCounts.map(([id, count]) => ({ userId: id, count, name: names.get(id) ?? '' })),
      { onlyUserIds: new Set(names.keys()) },
    );
    return { ok: true, season, rows };
  } catch (error) {
    console.error('[klubb] board', error);
    return { ok: false };
  }
}
