import { first } from '@/lib/url/searchParams';
import { notFound } from 'next/navigation';
import { getTranslations, getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdminOrCreator } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { Banner } from '@/components/ui/Banner';
import { SignupsHeader } from '../signups/SignupsHeader';
import { FLIGHT_PLAYER_ORDER } from '../flightPlayerColumns';
import {
  StartlistaClient,
  SuggestFlightsForm,
  type StartlistaFocus,
  type StartlistaPlayer,
} from './StartlistaClient';
import { eligibleForFlightAssignment } from '@/lib/games/flightScope';
import { expectedTeamSize } from '@/lib/games/teamScope';
import { buildStartlist } from '@/lib/games/startlist';
import { localizeGameName } from '@/lib/games/autoGameName';
import { displayName } from '@/lib/format/displayName';
import { firstName, sharesFirstName } from '@/lib/firstName';
import { nameInitials } from '@/lib/names/initials';
import type { AppLocale } from '@/i18n/routing';
import type { GameMode } from '@/lib/scoring/modes/types';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  status?: string | string[];
  error?: string | string[];
  flight?: string | string[];
}>;

type GameRow = {
  id: string;
  name: string;
  status: 'draft' | 'scheduled' | 'active' | 'finished';
  game_mode: GameMode;
  mode_config: { team_size?: number } | null;
  // #624 — banenavn for re-lokalisering av auto-genererte spillnavn.
  courses: { name: string } | null;
};

type RosterRow = {
  user_id: string;
  flight_number: number | null;
  withdrawn_at: string | null;
  accepted_at: string | null;
  users: { name: string | null; nickname: string | null; hcp_index: number | string } | null;
};

// Names and the index only: never `email` or `friend_code` (#2207), also not
// for an admin, and never `*`.
const ROSTER_COLUMNS =
  'user_id, flight_number, withdrawn_at, accepted_at, users!game_players_user_id_fkey(name, nickname, hcp_index)';

/** The banners the flight actions redirect here with (`flightActions.ts`). */
const STATUS_CODES = ['flight_updated', 'flight_suggested'] as const;
const ERROR_CODES = [
  'flight_full',
  'bad_flight',
  'not_active',
  'db_roster',
  'db_players',
  'db_game',
  'not_found',
  'player_missing',
] as const;

const HEADING_ID = 'startlista-heading';

/**
 * Startlista (#2289, artboard «Forslag: startlista»): the flights as cards
 * side by side, and a player moved with two taps. For the admin and for the
 * game's organiser, who reaches it from «Styr spillere» and the start-block
 * notice on the game page; the admin also from the game page and the desk.
 *
 * Only for a game that takes a free flight split (`eligibleForFlightAssignment`:
 * a solo format, not wolf, more than four active) while it is scheduled or in
 * progress. Anything else is sent on to the game.
 */
export default async function StartlistaPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations('admin.game.flights');
  const tDetail = await getTranslations('admin.game.detail');

  const supabase = await getServerClient();
  const role = await requireAdminOrCreator(supabase, id);

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('id, name, status, game_mode, mode_config, courses(name)')
    .eq('id', id)
    .maybeSingle<GameRow>();
  // Error ≠ absence (#1441): throw on query failure (error boundary), 404
  // only when the game is genuinely gone.
  if (gameError) throw gameError;
  if (!game) notFound();

  // The admin game page is admin-only; the organiser came from «Styr spillere».
  const gameHref = role.isAdmin ? `/admin/games/${id}` : `/games/${id}/spillere`;

  // The admin client after the access check: an organiser who does not play
  // cannot read the players' `users` rows through RLS.
  const { data: rows, error: rosterError } = await getAdminClient()
    .from('game_players')
    .select(ROSTER_COLUMNS)
    .eq('game_id', id)
    .order(FLIGHT_PLAYER_ORDER[0], { ascending: true, nullsFirst: false })
    .order(FLIGHT_PLAYER_ORDER[1], { ascending: true })
    .returns<RosterRow[]>();
  if (rosterError) throw rosterError;
  const roster = rows ?? [];

  if (
    (game.status !== 'scheduled' && game.status !== 'active') ||
    !eligibleForFlightAssignment(game.game_mode, expectedTeamSize(game.mode_config), roster)
  ) {
    redirect({ href: gameHref, locale });
  }

  const players = startlistaPlayers(roster, tDetail('unknownPlayer'));
  const startlist = buildStartlist(players);

  const statusCode = first(sp.status);
  const errorCode = first(sp.error);
  const statusBanner = (STATUS_CODES as readonly string[]).includes(statusCode ?? '')
    ? (await getTranslations('admin.game.banners'))(statusCode as (typeof STATUS_CODES)[number])
    : undefined;
  const errorMessage = (ERROR_CODES as readonly string[]).includes(errorCode ?? '')
    ? (await getTranslations('admin.game.errors'))(errorCode as (typeof ERROR_CODES)[number])
    : undefined;

  const movedTo = Number(first(sp.flight));
  const focus: StartlistaFocus =
    statusCode === 'flight_updated' && Number.isInteger(movedTo) && movedTo > 0
      ? { kind: 'flight', flight: movedTo }
      : statusCode === 'flight_suggested' || errorMessage
        ? { kind: 'heading' }
        : null;

  return (
    <AdminShell tone="app">
      <SignupsHeader
        backHref={gameHref}
        backLabel={t('backToGame')}
        title={t('sectionLabel')}
        gameName={localizeGameName(game.name, game.courses?.name ?? null, locale)}
        subtitle={t('summary', {
          players: startlist.activeCount,
          flights: startlist.flights.length,
        })}
        action={<SuggestFlightsForm gameId={id} />}
        headingId={HEADING_ID}
      />

      {(statusBanner || errorMessage) && (
        <div className="mt-4 space-y-2">
          {statusBanner && <Banner tone="success">{statusBanner}</Banner>}
          {errorMessage && <Banner tone="error">{errorMessage}</Banner>}
        </div>
      )}

      <StartlistaClient gameId={id} players={players} focus={focus} headingId={HEADING_ID} />
    </AdminShell>
  );
}

/**
 * The active players with the names the chips show: the first name, or the
 * full name for both when two share a first name (#2286). Nickname before
 * name (`displayName`); no name at all is «(ukjent spiller)». Never e-post.
 */
function startlistaPlayers(roster: RosterRow[], unknownPlayer: string): StartlistaPlayer[] {
  const active = roster.filter((p) => p.withdrawn_at == null);
  const names = active.map((p) => displayName(p.users));
  return active.map((p, i) => {
    const full = names[i];
    const others = names.filter((_, j) => j !== i);
    const short = full == null ? null : sharesFirstName(full, others) ? full : firstName(full);
    return {
      user_id: p.user_id,
      flight_number: p.flight_number,
      withdrawn_at: null,
      // `hcp_index` is NOT NULL; a missing `users` row (the FK prevents it)
      // counts as scratch rather than breaking the page.
      hcpIndex: Number(p.users?.hcp_index ?? 0),
      shortName: short ?? full ?? unknownPlayer,
      fullName: full ?? unknownPlayer,
      initials: nameInitials(full),
    };
  });
}
