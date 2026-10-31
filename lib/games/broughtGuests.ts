import 'server-only';
import type { getAdminClient } from '@/lib/supabase/admin';
import { displayNameForOthers } from '@/lib/users/displayName';
import type { GuestTee } from '@/lib/games/createGuestPlayer';

// Gjestene en spiller har meldt på (#2607), lest for skjermene som sier fra før
// noen går: «Trekk meg» (`captainWithdrawalState`) og linja på «Styr spillere».
// Regelens ene hjem er SQL: supabase/migrations/0229_guests_follow_their_host.sql.
//
// Eierens regel (18.10, #2570): en spiller kan bare melde på gjester når
// spilleren selv er påmeldt. Trekker spilleren seg, eller arrangøren fjerner
// spilleren, går gjestene også. Triggeren i 0229 gjør det i samme transaksjon
// som slettingen av vertens plass, så ingen kaller skriver det selv.
//
// Gjester kommer inn to veier, med hver sin kobling:
//   - lagpåmeldingen: kapteinen velger dem fra nettverket, og gjestens
//     `team_request_id` peker på kapteinens påmelding. Kapteinsbyttet (0194)
//     flytter pekeren, så gjestene følger den nye kapteinen (eierens svar 3).
//     En gjest kan ikke selv bli kaptein (0228).
//   - «Ta med en gjest» (fase 2, 0230): en spiller som er påmeldt alene tar med
//     én gjest, og gjestens `brought_by_user_id` er spilleren. Vakttriggeren
//     `guard_brought_guest` holder taket under.

type Admin = ReturnType<typeof getAdminClient>;

/**
 * Hvor mange gjester en spiller kan ta med i ett spill (eierens svar 30.10).
 * Samme tall står i `guard_brought_guest` (0230); `broughtGuestsMax.test.ts`
 * sjekker at de to er like (AGENTS.md felle 4).
 */
export const BROUGHT_GUESTS_MAX = 1;

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

const LIVE_STATUSES = ['pending', 'approved'] as const;

function toBroughtGuest(row: {
  id: string;
  user_id: string;
  status: 'pending' | 'approved';
  users: EmbeddedUser;
}): BroughtGuest {
  return {
    requestId: row.id,
    userId: row.user_id,
    name: row.users
      ? displayNameForOthers({ name: row.users.name, nickname: row.users.nickname, email: row.users.email })
      : null,
    status: row.status,
  };
}

function addTo(byHost: Map<string, BroughtGuest[]>, host: string, guest: BroughtGuest) {
  const list = byHost.get(host) ?? [];
  list.push(guest);
  byHost.set(host, list);
}

/** Navnene på gjestene, for setningene som navngir dem. */
export function guestNamesOf(guests: BroughtGuest[]): string[] {
  return guests.flatMap((g) => (g.name ? [g.name] : []));
}

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
    .in('status', [...LIVE_STATUSES])
    .returns<GuestChildRow[]>();
  if (childrenError) {
    console.error(`[${context}] guest lookup failed`, { gameId, error: childrenError });
    return null;
  }

  const hostOf = new Map(captains.map((c) => [c.id, c.user_id]));
  for (const g of (children ?? []).filter(isGuestRequest)) {
    const host = hostOf.get(g.team_request_id);
    if (!host) continue;
    addTo(byHost, host, toBroughtGuest(g));
  }
  return byHost;
}

type BroughtByRow = {
  id: string;
  user_id: string;
  status: 'pending' | 'approved';
  brought_by_user_id: string;
  users: EmbeddedUser;
};

/**
 * Gjestene spillere har tatt med alene (`brought_by_user_id`, 0230), lagt til
 * i `byHost`. `hostUserId` = bare den spilleren; `null` = alle i spillet.
 * `false` ved en lesefeil (#1445).
 */
async function addBroughtBy(
  admin: Admin,
  gameId: string,
  hostUserId: string | null,
  byHost: Map<string, BroughtGuest[]>,
  context: string,
): Promise<boolean> {
  const base = admin
    .from('game_registration_requests')
    .select(`id, user_id, status, brought_by_user_id, ${REQUEST_USER_EMBED}`)
    .eq('game_id', gameId)
    .in('status', [...LIVE_STATUSES]);
  const { data, error } = await (hostUserId
    ? base.eq('brought_by_user_id', hostUserId)
    : base.not('brought_by_user_id', 'is', null)
  ).returns<BroughtByRow[]>();
  if (error) {
    console.error(`[${context}] brought guests lookup failed`, { gameId, error });
    return false;
  }
  for (const g of (data ?? []).filter(isGuestRequest)) {
    addTo(byHost, g.brought_by_user_id, toBroughtGuest(g));
  }
  return true;
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
  if (!(await addBroughtBy(admin, gameId, hostUserId, byHost, 'readBroughtGuests'))) return { ok: false };
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
  if (!(await addBroughtBy(admin, gameId, null, byHost, 'readBroughtGuestsInGame'))) return { ok: false };
  return { ok: true, byHost };
}

/** Gjesten spilleren tok med alene, med det gjestesiden viser (skjerm 3). */
export type MyBroughtGuest = BroughtGuest & {
  /** Signert WHS-index (plusshandicap negativ). */
  hcpIndex: number | null;
  tee: GuestTee;
};

type MyBroughtRow = {
  id: string;
  user_id: string;
  status: 'pending' | 'approved';
  users: (NonNullable<EmbeddedUser> & {
    hcp_index: number | null;
    gender: 'mens' | 'ladies' | null;
    level: string | null;
  }) | null;
};

/**
 * Gjesten `userId` har tatt med i spillet (`brought_by_user_id`), for raden på
 * spillets side og siden «Ta med en gjest». Taket er én (`BROUGHT_GUESTS_MAX`),
 * så det finnes høyst én levende. `guest: null` = ingen.
 */
export async function readMyBroughtGuest(
  admin: Admin,
  gameId: string,
  userId: string,
): Promise<{ ok: true; guest: MyBroughtGuest | null } | { ok: false }> {
  const { data, error } = await admin
    .from('game_registration_requests')
    .select(
      'id, user_id, status, users!game_registration_requests_user_id_fkey(is_guest, name, nickname, email, hcp_index, gender, level)',
    )
    .eq('game_id', gameId)
    .eq('brought_by_user_id', userId)
    .in('status', [...LIVE_STATUSES])
    .order('created_at', { ascending: true })
    .limit(1)
    .returns<MyBroughtRow[]>();
  if (error) {
    console.error('[readMyBroughtGuest] lookup failed', { gameId, error });
    return { ok: false };
  }
  const row = (data ?? []).find(isGuestRequest);
  if (!row) return { ok: true, guest: null };
  const u = row.users;
  return {
    ok: true,
    guest: {
      ...toBroughtGuest(row),
      hcpIndex: u?.hcp_index ?? null,
      // The guest's profile carries the category the form chose (createGuestUser).
      tee: u?.level === 'junior' ? 'J' : u?.gender === 'ladies' ? 'D' : 'M',
    },
  };
}
