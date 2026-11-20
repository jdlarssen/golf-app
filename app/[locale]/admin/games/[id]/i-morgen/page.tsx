import { after } from 'next/server';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { first } from '@/lib/url/searchParams';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdminOrCreator } from '@/lib/admin/auth';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Banner } from '@/components/ui/Banner';
import { localizeGameName } from '@/lib/games/autoGameName';
import { expectedTeamSize } from '@/lib/games/teamScope';
import { markReadOnVisit } from '@/lib/notifications/markRead';
import { inboxPerson } from '@/lib/notifications/inboxSections';
import { displayNameForOthers } from '@/lib/users/displayName';
import type { AppLocale } from '@/i18n/routing';
import type { GameMode } from '@/lib/scoring/modes/types';
import { remindUnansweredPlayer } from './actions';
import { ReadyList } from './ReadyList';
import { buildReadyView, type ReadyPerson } from './readyView';

/**
 * «Klar for i morgen?» (#2483, artboard «Forslag 29: status til arrangøren
 * kvelden før»): where the organiser's evening varsel lands. Who has
 * confirmed, one row with «Purr …» per player who has not answered, the
 * course, tee and tee-off, and the flights; under them «Flytt runden» and
 * «Se startlista». The varsel is a picture of that evening; this page always
 * shows the list as it is now. The rows are decided in `buildReadyView`.
 *
 * Gated on `requireAdminOrCreator`, so the organiser without the admin role
 * gets in (the /admin layout only asks for a login, #392). It lives under
 * /admin so the app opens it in the browser: under /games the app would show
 * its own game screen. A round that is not scheduled, or a cup match, has
 * nothing to get ready, and the page sends you to the game.
 */

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ purret?: string | string[]; error?: string | string[] }>;

const ERROR_CODES = new Set(['notRemindable']);

type GameRow = {
  id: string;
  name: string;
  status: string;
  game_mode: GameMode;
  mode_config: { team_size?: number } | null;
  tournament_id: string | null;
  scheduled_tee_off_at: string | null;
  tee_interval_minutes: number | null;
  courses: { name: string } | null;
  tee_boxes: { name: string } | null;
};

type RosterRow = {
  user_id: string;
  flight_number: number | null;
  team_number: number | null;
  withdrawn_at: string | null;
  accepted_at: string | null;
  users: { name: string | null; nickname: string | null; email: string | null; is_guest: boolean } | null;
};

type AdminClient = ReturnType<typeof getAdminClient>;

/**
 * The list with the names the page shows. The admin client after the gate:
 * an organiser who does not play cannot read the players' `users` rows through
 * RLS. A name leaves the server only through `displayNameForOthers` (a
 * nameless player by the masked address).
 */
async function loadPeople(admin: AdminClient, gameId: string, unknown: string): Promise<ReadyPerson[]> {
  const { data, error } = await admin
    .from('game_players')
    .select(
      'user_id, flight_number, team_number, withdrawn_at, accepted_at, users!game_players_user_id_fkey(name, nickname, email, is_guest)',
    )
    .eq('game_id', gameId)
    .returns<RosterRow[]>();
  if (error) throw error;
  return (data ?? []).map((r) => {
    const person = r.users ? inboxPerson(displayNameForOthers(r.users)) : null;
    return {
      user_id: r.user_id,
      flight_number: r.flight_number,
      team_number: r.team_number,
      withdrawn_at: r.withdrawn_at,
      accepted_at: r.accepted_at,
      is_guest: r.users?.is_guest === true,
      full: person?.full ?? unknown,
      short: person?.short ?? unknown,
    };
  });
}

/**
 * When each player who has not answered was first told about the round: the
 * earliest `invite` or `player_added` for this game. Only for the line under
 * the name, so a failed read is logged and leaves the line out.
 */
async function loadInvitedAt(
  admin: AdminClient,
  gameId: string,
  people: readonly ReadyPerson[],
): Promise<Map<string, string>> {
  const ids = people.filter((p) => p.withdrawn_at == null && p.accepted_at == null && !p.is_guest).map((p) => p.user_id);
  const invitedAt = new Map<string, string>();
  if (ids.length === 0) return invitedAt;
  const { data, error } = await admin
    .from('notifications')
    .select('user_id, created_at')
    .in('kind', ['invite', 'player_added'])
    .eq('payload->>game_id', gameId)
    .in('user_id', ids)
    .order('created_at', { ascending: true })
    .returns<{ user_id: string; created_at: string }[]>();
  if (error) console.error('[tomorrow] invitation times read failed', { gameId, error });
  for (const n of data ?? []) if (!invitedAt.has(n.user_id)) invitedAt.set(n.user_id, n.created_at);
  return invitedAt;
}

/** The request's «now», read once, outside render. */
function requestNow(): number {
  return Date.now();
}

export default async function TomorrowPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations('admin.game.tomorrow');

  const supabase = await getServerClient();
  const ctx = await requireAdminOrCreator(supabase, id);

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select(
      'id, name, status, game_mode, mode_config, tournament_id, scheduled_tee_off_at, tee_interval_minutes, courses(name), tee_boxes(name)',
    )
    .eq('id', id)
    .maybeSingle<GameRow>();
  if (gameError) throw gameError;
  if (!game) notFound();
  if (game.status !== 'scheduled' || game.tournament_id != null) {
    redirect({ href: `/games/${id}`, locale });
  }

  const admin = getAdminClient();
  const people = await loadPeople(admin, id, (await getTranslations('admin.game.detail'))('unknownPlayer'));
  const invitedAt = await loadInvitedAt(admin, id, people);

  const view = buildReadyView({
    gameId: id,
    title: localizeGameName(game.name, game.courses?.name ?? null, locale),
    status: game.status,
    gameMode: game.game_mode,
    teamSize: expectedTeamSize(game.mode_config),
    teeOffIso: game.scheduled_tee_off_at,
    teeIntervalMinutes: game.tee_interval_minutes,
    courseName: game.courses?.name ?? null,
    teeName: game.tee_boxes?.name ?? null,
    statusLabel: (await getTranslations('gameStatus'))('scheduled'),
    people,
    invitedAt,
    purret: first(sp.purret) ?? null,
    now: requestNow(),
    locale,
    t: t as unknown as Parameters<typeof buildReadyView>[0]['t'],
  });
  const rows = view.rows.map(({ remind, ...row }) => ({
    ...row,
    remind: remind
      ? { action: remindUnansweredPlayer.bind(null, id, remind.userId), name: remind.name }
      : null,
  }));
  const errorCode = first(sp.error);

  after(() => markReadOnVisit({ userId: ctx.userId, surface: 'gameTomorrow', entityId: id }));

  return (
    <AppShell showVersion={false}>
      <TopBar backHref={ctx.isAdmin ? `/admin/games/${id}` : `/games/${id}`} kickerOneLine kicker={view.kicker} />
      <h1 className="-mt-2.5 font-serif text-[26px] font-medium leading-[1.15] text-text">{view.heading}</h1>
      {errorCode && ERROR_CODES.has(errorCode) && (
        <div className="mt-4">
          <Banner tone="error" testId="ready-error">
            {t(`errors.${errorCode}` as Parameters<typeof t>[0])}
          </Banner>
        </div>
      )}
      <ReadyList rows={rows} links={view.links} />
    </AppShell>
  );
}
