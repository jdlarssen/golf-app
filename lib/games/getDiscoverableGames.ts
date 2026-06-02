import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';

/**
 * Hjem-sidens «Funn turneringer»-seksjon (#257) henter to lister via
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

export type PendingRequest = {
  id: string;
  game_id: string;
  short_id: string;
  game_name: string;
  team_name: string | null;
  is_team_captain: boolean;
  created_at: string;
};

export async function getDiscoverableGames(userId: string): Promise<{
  openGames: DiscoverableOpenGame[];
  pendingRequests: PendingRequest[];
}> {
  const admin = getAdminClient();

  const [playerRowsRes, requestRowsRes] = await Promise.all([
    admin
      .from('game_players')
      .select('game_id')
      .eq('user_id', userId),
    admin
      .from('game_registration_requests')
      .select('id, game_id, status, team_name, is_team_captain, created_at, games(name, short_id)')
      .eq('user_id', userId)
      .in('status', ['pending', 'approved']),
  ]);

  const joinedIds = new Set(
    (playerRowsRes.data ?? []).map((r) => r.game_id as string),
  );
  const requestedIds = new Set(
    (requestRowsRes.data ?? []).map((r) => r.game_id as string),
  );
  const excludedIds = new Set([...joinedIds, ...requestedIds]);

  let openQuery = admin
    .from('games')
    .select('id, name, short_id, scheduled_tee_off_at, registration_mode, courses(name)')
    // Påmeldingsmåten ER synligheten: open + manual_approval er oppdagbare,
    // invite_only er privat (#357). Ingen egen synlighets-bryter.
    .in('registration_mode', ['open', 'manual_approval'])
    .in('status', ['draft', 'scheduled'])
    .order('scheduled_tee_off_at', { ascending: true, nullsFirst: false })
    .limit(50);

  if (excludedIds.size > 0) {
    openQuery = openQuery.not('id', 'in', `(${[...excludedIds].join(',')})`);
  }

  const openGamesRes = await openQuery;

  const openGames: DiscoverableOpenGame[] = (openGamesRes.data ?? []).map(
    (row) => {
      // Supabase typer FK-join som array selv om relasjonen er en-til-en.
      // Normaliser til første element (eller null) før vi leser feltet.
      const courses = row.courses as unknown as
        | { name: string }
        | { name: string }[]
        | null;
      const course = Array.isArray(courses) ? courses[0] ?? null : courses;
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
      const gamesRaw = r.games as unknown as
        | { name: string; short_id: string }
        | { name: string; short_id: string }[]
        | null;
      const game = Array.isArray(gamesRaw) ? gamesRaw[0] ?? null : gamesRaw;
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

  return { openGames, pendingRequests };
}
