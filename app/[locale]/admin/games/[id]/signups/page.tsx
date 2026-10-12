import { Fragment } from 'react';
import { first } from '@/lib/url/searchParams';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
import { getTranslations, getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrCreator } from '@/lib/admin/auth';
import { markReadOnVisit } from '@/lib/notifications/markRead';
import { AdminShell } from '@/components/ui/AdminShell';
import { Banner } from '@/components/ui/Banner';
import { SmartLink } from '@/components/ui/SmartLink';
import { PåmeldingerClient } from './PåmeldingerClient';
import { SignupsHeader } from './SignupsHeader';
import { SignupCapacity } from './SignupCapacity';
import { SignupRoster } from './SignupRoster';
import type { RequestStatus, RequestRow, RosterEntry, TabKey } from './types';
import { toggleSignupsClosed } from '../flightActions';
import { localizeGameName } from '@/lib/games/autoGameName';
import type { AppLocale } from '@/i18n/routing';
import type { GameMode } from '@/lib/scoring/modes/types';
import type { RegistrationMode } from '@/lib/games/registration';
import { getAdminClient } from '@/lib/supabase/admin';
import { registrationPlayerCap } from '@/lib/wizard/fitsPlayerCount';
import {
  canToggleSignups,
  firstNamesLine,
  historyGroups,
  inboxCounts,
  signupCapacity,
  signupInboxState,
  sortRoster,
  type HistoryStatus,
} from '@/lib/games/signupInbox';
import {
  formatDate,
  formatListLocale,
  formatShortDayMonthLocale,
  formatTeeOffTimeLocale,
} from '@/lib/i18n/format';
import { formatHcpDisplay } from '@/lib/handicap/signFormat';
import { nameInitials } from '@/lib/names/initials';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  tab?: string | string[];
  status?: string | string[];
  error?: string | string[];
}>;

type GameRow = {
  id: string;
  name: string;
  short_id: string;
  status: 'draft' | 'scheduled' | 'active' | 'finished';
  registration_mode: RegistrationMode;
  registration_type: 'solo' | 'team' | 'both';
  game_mode: GameMode;
  mode_config: { team_size?: number } | null;
  scheduled_tee_off_at: string | null;
  signups_closed_at: string | null;
  group_id: string | null;
  // #624 — banenavn for re-lokalisering av auto-genererte spillnavn.
  courses: { name: string } | null;
};

type RawRequestRow = {
  id: string;
  user_id: string;
  status: RequestStatus;
  team_name: string | null;
  is_team_captain: boolean;
  team_request_id: string | null;
  message: string | null;
  rejection_reason: string | null;
  created_at: string;
  decided_at: string | null;
  // `email` only when the caller is admin (#2207, #2440).
  users: {
    name: string | null;
    nickname: string | null;
    hcp_index: number | null;
    email?: string;
  } | null;
};

type RawRosterRow = {
  user_id: string;
  accepted_at: string | null;
  withdrawn_at: string | null;
  users: { name: string | null; nickname: string | null; hcp_index: number | null } | null;
};

const REQUEST_COLUMNS =
  'id, user_id, status, team_name, is_team_captain, team_request_id, message, rejection_reason, created_at, decided_at';

// No `email` here (#2207): the roster shows names and handicaps only.
const ROSTER_COLUMNS =
  'user_id, accepted_at, withdrawn_at, users!game_players_user_id_fkey(name, nickname, hcp_index)';

const HISTORY: readonly HistoryStatus[] = ['approved', 'rejected', 'withdrawn'];

/** The game page's errors the close/reopen action redirects here with (#2288). */
const GAME_ERRORS = ['signups_not_scheduled', 'db_game', 'not_found'] as const;

function displayNameOf(
  users: { name: string | null; nickname: string | null; email?: string } | null,
  unknownPlayer: string,
): string {
  const baseName = users?.name ?? users?.email ?? unknownPlayer;
  return users?.nickname ? `${baseName} «${users.nickname}»` : baseName;
}

function toRequestRow(raw: RawRequestRow, unknownPlayer: string): RequestRow {
  return {
    id: raw.id,
    userId: raw.user_id,
    status: raw.status,
    displayName: displayNameOf(raw.users, unknownPlayer),
    userName: raw.users?.name ?? null,
    hcpIndex: raw.users?.hcp_index ?? null,
    teamName: raw.team_name,
    isTeamCaptain: raw.is_team_captain,
    teamRequestId: raw.team_request_id,
    message: raw.message,
    rejectionReason: raw.rejection_reason,
    createdAt: raw.created_at,
    decidedAt: raw.decided_at,
  };
}

/**
 * Every request and the roster in one go (#2288): the inbox, the history views
 * and the counts all read the same lists.
 */
async function loadRequestsAndRoster(
  id: string,
  isAdmin: boolean,
  unknownPlayer: string,
): Promise<{ requests: RequestRow[]; roster: RawRosterRow[] }> {
  // Every request and the roster in one go (#2288): the inbox, the history
  // views and the counts all read the same lists. `game_registration_requests`
  // has TWO FKs to `users` (`user_id` = the applicant, `decided_by_user_id` =
  // who decided), so the embed pins `user_id` — without the hint PostgREST
  // answers PGRST201 and the whole read fails.
  // #2207: the address is private. It is the fallback name for an admin only;
  // an organiser without the admin role sees «Ukjent spiller» for a user
  // without a name (#2440). The admin client, because an organiser who does
  // not play cannot read the applicants' `users` rows through RLS.
  const requestColumns = isAdmin
    ? `${REQUEST_COLUMNS}, users!game_registration_requests_user_id_fkey(name, nickname, hcp_index, email)`
    : `${REQUEST_COLUMNS}, users!game_registration_requests_user_id_fkey(name, nickname, hcp_index)`;
  const [requestsRes, rosterRes] = await Promise.all([
    getAdminClient()
      .from('game_registration_requests')
      .select(requestColumns)
      .eq('game_id', id)
      .order('created_at', { ascending: true })
      .returns<RawRequestRow[]>(),
    getAdminClient()
      .from('game_players')
      .select(ROSTER_COLUMNS)
      .eq('game_id', id)
      .returns<RawRosterRow[]>(),
  ]);

  // #2293: a failed read goes to the error boundary. Rendering the empty inbox
  // here would tell the organiser nobody is waiting (same rule as #1441).
  if (requestsRes.error) {
    console.error('[påmeldinger] requests fetch failed', requestsRes.error);
    throw requestsRes.error;
  }
  if (rosterRes.error) {
    console.error('[påmeldinger] roster fetch failed', rosterRes.error);
    throw rosterRes.error;
  }

  return {
    requests: (requestsRes.data ?? []).map((raw) => toRequestRow(raw, unknownPlayer)),
    roster: rosterRes.data ?? [],
  };
}

export default async function PåmeldingerPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const t = await getTranslations('admin.game.signups');
  const tDetail = await getTranslations('admin.game.detail');
  const tCta = await getTranslations('admin.game.cta');
  const locale = (await getLocale()) as AppLocale;

  // #2440: the game's organiser answers requests to their own game here too —
  // the `registration_request` varsel links to this page. Anyone else → `/`.
  const supabase = await getServerClient();
  const role = await requireAdminOrCreator(supabase, id);

  // #2201: opening the page marks the game's `registration_request` varsler
  // read. Before the game read, so a 404 still counts.
  after(() => markReadOnVisit({ userId: role.userId, surface: 'adminSignups', entityId: id }));

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select(
      'id, name, short_id, status, registration_mode, registration_type, game_mode, mode_config, scheduled_tee_off_at, signups_closed_at, group_id, courses(name)',
    )
    .eq('id', id)
    .maybeSingle<GameRow>();
  // Error ≠ absence (#1441): throw on query failure (error boundary), 404
  // only when the game is genuinely gone.
  if (gameError) throw gameError;
  if (!game) notFound();

  const unknownPlayer = tDetail('unknownPlayer');
  const { requests, roster } = await loadRequestsAndRoster(id, role.isAdmin, unknownPlayer);

  // #2291: «med» is the roster (non-withdrawn game_players rows), never the
  // approved requests.
  const counts = inboxCounts({ roster, requests });
  const cap = registrationPlayerCap(game.game_mode, game.mode_config);
  const capacity = signupCapacity({ cap, rosterCount: counts.rosterCount, queued: counts.queued });
  const historyCounts = Object.fromEntries(
    HISTORY.map((s) => [s, historyGroups(requests, s).reduce((n, g) => n + g.length, 0)]),
  ) as Record<HistoryStatus, number>;

  const tabParam = first(sp.tab) as TabKey | undefined;
  const view: 'pending' | HistoryStatus =
    tabParam && (HISTORY as readonly string[]).includes(tabParam) ? (tabParam as HistoryStatus) : 'pending';
  const inInbox = view === 'pending';

  const { statusBanner, errorMessage } = await bannerTexts(first(sp.status), first(sp.error));

  const gameLocked = game.status === 'active' || game.status === 'finished';
  const gameName = localizeGameName(game.name, game.courses?.name ?? null, locale);
  // The admin game page is admin-only; the organiser came from «Styr spillere».
  const gameHref = role.isAdmin ? `/admin/games/${id}` : `/games/${id}/spillere`;
  const inboxHref = `/admin/games/${id}/signups`;

  const state = signupInboxState(game);
  const statusLine = await statusLineText(game, state, locale);

  const rosterEntries = rosterView(roster, unknownPlayer, locale);
  const names = firstNamesLine(
    rosterEntries.map((e) => e.displayName),
    3,
  );
  const namesLine = formatListLocale(
    names.rest > 0 ? [...names.firstNames, t('more', { count: names.rest })] : names.firstNames,
    locale,
  );

  const canToggle = canToggleSignups(game.status, game.registration_mode, game.group_id);
  const signupsClosed = game.signups_closed_at != null;

  // The history line (owner's answer 2026-10-12, «Bare lenkene»): the way to
  // the approved, rejected and withdrawn, on every game. The history views add
  // «Venter N», the same number as «VENTER PÅ DEG · N».
  const historyLinks: HistoryLink[] = [
    ...(inInbox ? [] : [{ key: 'pending' as const, count: counts.queued, href: inboxHref }]),
    ...HISTORY.map((s) => ({ key: s, count: historyCounts[s], href: `${inboxHref}?tab=${s}` })),
  ];

  return (
    <AdminShell tone="app">
      <SignupsHeader
        backHref={inInbox ? gameHref : inboxHref}
        backLabel={inInbox ? t('backToGame') : t('backToInbox')}
        title={t('heading')}
        gameName={gameName}
      />

      {inInbox && (
        <SignupCapacity
          statusLine={statusLine}
          capacity={capacity}
          cap={cap}
          rosterCount={counts.rosterCount}
          queued={counts.queued}
        />
      )}

      {(statusBanner || errorMessage) && (
        <div className="mt-4 space-y-2">
          {statusBanner && <Banner tone="success">{statusBanner}</Banner>}
          {errorMessage && <Banner tone="error">{errorMessage}</Banner>}
        </div>
      )}

      {inInbox && state === 'inviteOnly' && (
        <div className="mt-4">
          <Banner tone="info">{t('inviteOnlyBanner')}</Banner>
        </div>
      )}

      <PåmeldingerClient
        gameId={id}
        requests={requests}
        view={view}
        locked={gameLocked}
        capacity={capacity}
        activeRosterUserIds={counts.activeRosterUserIds}
        headingCount={inInbox ? counts.queued : historyCounts[view as HistoryStatus]}
        renderedAt={new Date().toISOString()}
      />

      {inInbox && <SignupRoster entries={rosterEntries} namesLine={namesLine} />}

      {inInbox && canToggle && (
        <form action={toggleSignupsClosed.bind(null, id, !signupsClosed)} className="-mx-1 mt-4">
          <button
            type="submit"
            data-testid="toggle-signups-closed"
            className="flex min-h-[50px] w-full items-center justify-center rounded-full border border-border text-[14px] font-semibold leading-[normal] text-primary transition-colors hover:bg-primary-soft"
          >
            {signupsClosed ? tCta('reopenSignupsButton') : tCta('closeSignupsButton')}
          </button>
        </form>
      )}

      <HistoryLine links={historyLinks} current={view} />
    </AdminShell>
  );
}

/** The success banner for `?status=` and the error for `?error=`, if any. */
async function bannerTexts(
  statusKey: string | undefined,
  errorCode: string | undefined,
): Promise<{ statusBanner?: string; errorMessage?: string }> {
  const t = await getTranslations('admin.game.signups');
  const tBanners = await getTranslations('admin.game.banners');
  const tErrors = await getTranslations('admin.game.errors');
  let statusBanner: string | undefined;
  if (statusKey === 'approved' || statusKey === 'rejected' || statusKey === 'captain_transferred') {
    statusBanner = t(`statusBanners.${statusKey}`);
  } else if (statusKey === 'signups_closed' || statusKey === 'signups_reopened') {
    statusBanner = tBanners(statusKey);
  }
  let errorMessage: string | undefined;
  if (errorCode && t.has(`errors.${errorCode}` as Parameters<typeof t>[0])) {
    errorMessage = t(`errors.${errorCode}` as Parameters<typeof t>[0]);
  } else if (errorCode && (GAME_ERRORS as readonly string[]).includes(errorCode)) {
    // The close/reopen action shares its error codes with the game page.
    errorMessage = tErrors(errorCode as (typeof GAME_ERRORS)[number]);
  }
  return { statusBanner, errorMessage };
}

/** «Påmeldingen er åpen · onsdag 8. okt 17:30», or just the state without a tee-off. */
async function statusLineText(
  game: GameRow,
  state: ReturnType<typeof signupInboxState>,
  locale: AppLocale,
): Promise<string> {
  const t = await getTranslations('admin.game.signups');
  const tStatus = await getTranslations('gameStatus');
  const stateLabel =
    state === 'open' || state === 'closed' || state === 'inviteOnly'
      ? t(`state.${state}`)
      : tStatus(game.status);
  if (!game.scheduled_tee_off_at) return stateLabel;
  const teeOff = new Date(game.scheduled_tee_off_at);
  return t('statusLine', {
    state: stateLabel,
    when: t('when', {
      weekday: formatDate(teeOff, locale, { timeZone: 'Europe/Oslo', weekday: 'long' }),
      dayMonth: formatShortDayMonthLocale(teeOff, locale),
      time: formatTeeOffTimeLocale(teeOff, locale),
    }),
  });
}

/** The «Med» card's players: everyone not withdrawn, in the page's order. */
function rosterView(roster: RawRosterRow[], unknownPlayer: string, locale: AppLocale): RosterEntry[] {
  return sortRoster(
    roster
      .filter((p) => p.withdrawn_at == null)
      .map((p) => ({
        userId: p.user_id,
        displayName: displayNameOf(p.users, unknownPlayer),
        initials: nameInitials(p.users?.name),
        hcp: p.users?.hcp_index != null ? formatHcpDisplay(p.users.hcp_index, locale) : null,
        unconfirmed: p.accepted_at == null,
      })),
  );
}

type HistoryLink = { key: TabKey; count: number; href: string };

/**
 * One small grey line of links to the history views (owner's answer
 * 2026-10-12: «Bare lenkene»). The view on screen is text, not a link.
 */
async function HistoryLine({ links, current }: { links: HistoryLink[]; current: TabKey }) {
  const t = await getTranslations('admin.game.signups');
  return (
    <p className="mt-2 flex flex-wrap justify-center text-[12px] leading-[normal] text-muted">
      {links.map((link, i) => {
        const label = t('historyLink', { label: t(`tabs.${link.key}`), count: link.count });
        return (
          <Fragment key={link.key}>
            {i > 0 && (
              <span aria-hidden className="inline-flex min-h-11 items-center px-1.5">
                ·
              </span>
            )}
            {link.key === current ? (
              <span aria-current="page" className="inline-flex min-h-11 items-center">
                {label}
              </span>
            ) : (
              <SmartLink
                href={link.href}
                className="inline-flex min-h-11 items-center underline underline-offset-2"
              >
                {label}
              </SmartLink>
            )}
          </Fragment>
        );
      })}
    </p>
  );
}
