import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import type { RegistrationMode } from './registration';

/**
 * Hjem-sidens «Funn turneringer»-seksjon (#257) henter listene via
 * admin-client for å bypass game-rads strenge SELECT-policy (gater på
 * admin OR game_players-membership). En non-admin som ikke er påmeldt
 * matcher ingen av delene, men skal likevel kunne SE at et open-spill
 * finnes — det er hele poenget med selv-påmeldings-flyten.
 *
 * Returnerer kun base-info som er trygt å eksponere offentlig.
 */

export type DiscoverableOpenGame = {
  id: string;
  name: string;
  short_id: string;
  scheduled_tee_off_at: string | null;
  course_name: string | null;
  /**
   * Påmeldingsmåten ER synligheten (flyt 2): `open` → «Meld meg på»,
   * `manual_approval` → «Be om å bli med». `invite_only` er privat og
   * ekskluderes av query-filteret, så det dukker aldri opp her.
   */
  registration_mode: 'open' | 'manual_approval';
};

/**
 * Et klubb-scopet spill (#442). I motsetning til de globale open-spillene er
 * disse synlige for klubbens medlemmer UANSETT `registration_mode` — også
 * `invite_only` (medlemskap ER invitasjonen). `group_name` brukes til badge.
 */
export type DiscoverableClubGame = {
  id: string;
  name: string;
  short_id: string;
  scheduled_tee_off_at: string | null;
  course_name: string | null;
  registration_mode: RegistrationMode;
  group_name: string;
};

export type PendingRequest = {
  id: string;
  game_id: string;
  short_id: string;
  game_name: string;
  team_name: string | null;
  is_team_captain: boolean;
  created_at: string;
};

/** Normaliser Supabase FK-join (typet som array selv for en-til-en). */
function firstJoined<T>(raw: T | T[] | null | undefined): T | null {
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw ?? null;
}

export async function getDiscoverableGames(userId: string): Promise<{
  clubGames: DiscoverableClubGame[];
  openGames: DiscoverableOpenGame[];
  pendingRequests: PendingRequest[];
}> {
  const admin = getAdminClient();

  const [playerRowsRes, requestRowsRes, myClubsRes] = await Promise.all([
    admin
      .from('game_players')
      .select('game_id')
      .eq('user_id', userId),
    admin
      .from('game_registration_requests')
      .select('id, game_id, status, team_name, is_team_captain, created_at, games(name, short_id)')
      .eq('user_id', userId)
      .in('status', ['pending', 'approved']),
    admin
      .from('group_members')
      .select('group_id')
      .eq('user_id', userId),
  ]);

  const joinedIds = new Set(
    (playerRowsRes.data ?? []).map((r) => r.game_id as string),
  );
  const requestedIds = new Set(
    (requestRowsRes.data ?? []).map((r) => r.game_id as string),
  );
  const excludedIds = new Set([...joinedIds, ...requestedIds]);

  const myClubIds = (myClubsRes.data ?? []).map((r) => r.group_id as string);

  // Klubb-scopet discovery (#442): spill i mine klubber er synlige uansett
  // registration_mode — medlemskap ER invitasjonen. Ekskluder spill jeg selv
  // har opprettet (de arrangerer jeg, ikke oppdager) eller alt er med i / har
  // forespurt.
  let clubGames: DiscoverableClubGame[] = [];
  if (myClubIds.length > 0) {
    let clubQuery = admin
      .from('games')
      .select(
        'id, name, short_id, scheduled_tee_off_at, registration_mode, courses(name), groups(name)',
      )
      .in('group_id', myClubIds)
      .in('status', ['draft', 'scheduled'])
      .neq('created_by', userId)
      .order('scheduled_tee_off_at', { ascending: true, nullsFirst: false })
      .limit(50);

    if (excludedIds.size > 0) {
      clubQuery = clubQuery.not('id', 'in', `(${[...excludedIds].join(',')})`);
    }

    const clubRes = await clubQuery;

    clubGames = (clubRes.data ?? []).map((row) => {
      const course = firstJoined(row.courses as { name: string } | { name: string }[] | null);
      const group = firstJoined(row.groups as { name: string } | { name: string }[] | null);
      return {
        id: row.id as string,
        name: row.name as string,
        short_id: row.short_id as string,
        scheduled_tee_off_at: row.scheduled_tee_off_at as string | null,
        course_name: course?.name ?? null,
        registration_mode: row.registration_mode as RegistrationMode,
        group_name: group?.name ?? '',
      };
    });
  }

  // Dedup: et klubb-spill som også er open/manual_approval skal ikke dukke opp
  // i BÅDE klubb-seksjonen og den globale open-lista — klubb-seksjonen vinner.
  const openExcludedIds = new Set([
    ...excludedIds,
    ...clubGames.map((g) => g.id),
  ]);

  let openQuery = admin
    .from('games')
    .select('id, name, short_id, scheduled_tee_off_at, registration_mode, courses(name)')
    // Påmeldingsmåten ER synligheten: open + manual_approval er oppdagbare,
    // invite_only er privat (#357). Ingen egen synlighets-bryter.
    .in('registration_mode', ['open', 'manual_approval'])
    .in('status', ['draft', 'scheduled'])
    .order('scheduled_tee_off_at', { ascending: true, nullsFirst: false })
    .limit(50);

  if (openExcludedIds.size > 0) {
    openQuery = openQuery.not('id', 'in', `(${[...openExcludedIds].join(',')})`);
  }

  const openGamesRes = await openQuery;

  const openGames: DiscoverableOpenGame[] = (openGamesRes.data ?? []).map(
    (row) => {
      const course = firstJoined(
        row.courses as { name: string } | { name: string }[] | null,
      );
      return {
        id: row.id as string,
        name: row.name as string,
        short_id: row.short_id as string,
        scheduled_tee_off_at: row.scheduled_tee_off_at as string | null,
        course_name: course?.name ?? null,
        registration_mode: row.registration_mode as 'open' | 'manual_approval',
      };
    },
  );

  const pendingRequests: PendingRequest[] = (requestRowsRes.data ?? [])
    .filter((r) => r.status === 'pending')
    .map((r) => {
      const game = firstJoined(
        r.games as { name: string; short_id: string } | { name: string; short_id: string }[] | null,
      );
      return {
        id: r.id as string,
        game_id: r.game_id as string,
        short_id: game?.short_id ?? '',
        game_name: game?.name ?? 'Ukjent spill',
        team_name: r.team_name as string | null,
        is_team_captain: r.is_team_captain as boolean,
        created_at: r.created_at as string,
      };
    });

  return { clubGames, openGames, pendingRequests };
}
