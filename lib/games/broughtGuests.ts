import 'server-only';
import type { getAdminClient } from '@/lib/supabase/admin';
import { displayNameForOthers } from '@/lib/users/displayName';

// Gjestene en spiller har meldt på (#2607), lest for skjermene som sier fra før
// noen går: «Trekk meg» (`captainWithdrawalState`) og linja på «Styr spillere».
// Regelens ene hjem er SQL: supabase/migrations/0229_guests_follow_their_host.sql.
//
// Eierens regel (18.10, #2570): en spiller kan bare melde på gjester når
// spilleren selv er påmeldt. Trekker spilleren seg, eller arrangøren fjerner
// spilleren, går gjestene også. Triggeren i 0229 gjør det i samme transaksjon
// som slettingen av vertens plass, så ingen kaller skriver det selv.
//
// I dag kommer gjester inn gjennom lagpåmeldingen: kapteinen velger dem fra
// nettverket, og koblingen er gjestens `team_request_id` → kapteinens
// påmelding. Kapteinsbyttet (0194) flytter pekeren, så gjestene følger den nye
// kapteinen (eierens svar 3). En gjest kan ikke selv bli kaptein (0228).

type Admin = ReturnType<typeof getAdminClient>;

/**
 * Påmeldingens bruker, slik embedden gir den. `game_registration_requests` har
 * to FK-er til `users` (`user_id` og `decided_by_user_id`), så embedden må
 * navngi FK-en.
 */
export const REQUEST_USER_EMBED =
  'users!game_registration_requests_user_id_fkey(is_guest, name, nickname, email)';

type EmbeddedUser = {
  is_guest: boolean;
  name: string | null;
  nickname: string | null;
  email: string | null;
} | null;

/** Er påmeldingens bruker en gjest? En manglende embed leses som «nei». */
export function isGuestRequest(row: { users?: { is_guest: boolean } | null }): boolean {
  return row.users?.is_guest === true;
}

/** En gjest spilleren har meldt på, i et spill som ikke har startet. */
export type BroughtGuest = {
  requestId: string;
  userId: string;
  /** `displayNameForOthers`; `null` uten navn og adresse. */
  name: string | null;
  status: 'pending' | 'approved';
};

export type BroughtGuestsRead = { ok: true; guests: BroughtGuest[] } | { ok: false };

type CaptainRow = { id: string; user_id: string };

type GuestChildRow = {
  id: string;
  user_id: string;
  status: 'pending' | 'approved';
  team_request_id: string;
  users: EmbeddedUser;
};

/**
 * Gjestene under kapteinsradene, gruppert på kapteinens bruker-id. `null` ved
 * en lesefeil: en feilet spørring skal aldri leses som «ingen gjester» (#1445).
 */
async function readGuestsUnder(
  admin: Admin,
  gameId: string,
  captains: CaptainRow[],
  context: string,
): Promise<Map<string, BroughtGuest[]> | null> {
  const byHost = new Map<string, BroughtGuest[]>();
  if (captains.length === 0) return byHost;

  // #2440: bare rader i dette spillet — `team_request_id` er ikke bundet til
  // kapteinens spill i databasen.
  const { data: children, error: childrenError } = await admin
    .from('game_registration_requests')
    .select(`id, user_id, status, team_request_id, ${REQUEST_USER_EMBED}`)
    .eq('game_id', gameId)
    .in(
      'team_request_id',
      captains.map((c) => c.id),
    )
    .in('status', ['pending', 'approved'])
    .returns<GuestChildRow[]>();
  if (childrenError) {
    console.error(`[${context}] guest lookup failed`, { gameId, error: childrenError });
    return null;
  }

  const hostOf = new Map(captains.map((c) => [c.id, c.user_id]));
  for (const g of (children ?? []).filter(isGuestRequest)) {
    const host = hostOf.get(g.team_request_id);
    if (!host) continue;
    const list = byHost.get(host) ?? [];
    list.push({
      requestId: g.id,
      userId: g.user_id,
      name: g.users
        ? displayNameForOthers({ name: g.users.name, nickname: g.users.nickname, email: g.users.email })
        : null,
      status: g.status,
    });
    byHost.set(host, list);
  }
  return byHost;
}

/** Gjestene `hostUserId` har meldt på i spillet. */
export async function readBroughtGuests(
  admin: Admin,
  gameId: string,
  hostUserId: string,
): Promise<BroughtGuestsRead> {
  const { data: captain, error } = await admin
    .from('game_registration_requests')
    .select('id, user_id')
    .eq('game_id', gameId)
    .eq('user_id', hostUserId)
    .eq('is_team_captain', true)
    .maybeSingle<CaptainRow>();
  if (error) {
    console.error('[readBroughtGuests] host lookup failed', { gameId, error });
    return { ok: false };
  }
  const byHost = await readGuestsUnder(admin, gameId, captain ? [captain] : [], 'readBroughtGuests');
  if (!byHost) return { ok: false };
  return { ok: true, guests: byHost.get(hostUserId) ?? [] };
}

/**
 * Alle vertene i spillet med gjestene sine, i én lesing (linja på «Styr
 * spillere» spør for hele lista, ikke én gang per rad).
 */
export async function readBroughtGuestsInGame(
  admin: Admin,
  gameId: string,
): Promise<{ ok: true; byHost: Map<string, BroughtGuest[]> } | { ok: false }> {
  const { data: captains, error } = await admin
    .from('game_registration_requests')
    .select('id, user_id')
    .eq('game_id', gameId)
    .eq('is_team_captain', true)
    .returns<CaptainRow[]>();
  if (error) {
    console.error('[readBroughtGuestsInGame] captains lookup failed', { gameId, error });
    return { ok: false };
  }
  const byHost = await readGuestsUnder(admin, gameId, captains ?? [], 'readBroughtGuestsInGame');
  if (!byHost) return { ok: false };
  return { ok: true, byHost };
}
