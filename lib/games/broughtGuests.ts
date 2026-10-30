import 'server-only';
import type { getAdminClient } from '@/lib/supabase/admin';
import { expectAffected } from '@/lib/supabase/affectedRows';
import { displayNameForOthers } from '@/lib/users/displayName';

// Gjestene en spiller har meldt på (#2607): ett hjem for koblingen mellom en
// gjest og spilleren som tok den med (AGENTS trap 4).
//
// Eierens regel (18.10, #2570): en spiller kan bare melde på gjester når
// spilleren selv er påmeldt. Trekker spilleren seg, eller arrangøren fjerner
// spilleren, går gjestene også. Gjesten har ingen konto og kan ikke trekke seg
// selv, så ingen andre enn verten står bak plassen.
//
// I dag kommer gjester inn gjennom lagpåmeldingen: kapteinen velger dem fra
// nettverket, og koblingen er gjestens `team_request_id` → kapteinens
// påmelding. Kapteinsbyttet (0194) flytter pekeren, så gjestene følger den nye
// kapteinen (eierens svar 3). En gjest kan ikke selv bli kaptein (0228).
//
// Kapteinens trekk (`lib/games/withdrawSelf.ts`), arrangørens fjerning
// (`games/[id]/spillere/actions.ts` og lagringen i «Rediger»,
// `admin/games/[id]/edit/actions.ts`), «Trekk meg»-siden og linja på «Styr
// spillere» leser og trekker gjestene herfra. Ingen av dem leser koblingen
// selv.
//
// Gjester får aldri varsel: de har ingen innboks (jf.
// `lib/games/gameCancellation.ts`).

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
  /** Gjesten har en rad på spillerlista (en ventende påmelding har ingen). */
  onRoster: boolean;
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
 * en lesefeil: en feilet spørring skal aldri leses som «ingen gjester» (#1445),
 * ellers ville et trekk latt gjestene stå igjen uten vert.
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
  const guests = (children ?? []).filter(isGuestRequest);
  if (guests.length === 0) return byHost;

  const { data: roster, error: rosterError } = await admin
    .from('game_players')
    .select('user_id')
    .eq('game_id', gameId)
    .in(
      'user_id',
      guests.map((g) => g.user_id),
    )
    .returns<{ user_id: string }[]>();
  if (rosterError) {
    console.error(`[${context}] guest roster lookup failed`, { gameId, error: rosterError });
    return null;
  }
  const onRoster = new Set((roster ?? []).map((r) => r.user_id));

  const hostOf = new Map(captains.map((c) => [c.id, c.user_id]));
  for (const g of guests) {
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
      onRoster: onRoster.has(g.user_id),
    });
    byHost.set(host, list);
  }
  return byHost;
}

/**
 * Gjestene `hostUserId` har meldt på i spillet.
 *
 * Kapteinsraden leses uten statusfilter: et nytt forsøk etter et trekk som
 * stoppet halvveis finner kapteinens påmelding alt merket som trukket, og
 * gjestene skal fortsatt finnes.
 */
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

/**
 * Trekk gjestene sammen med verten: plassene på spillerlista slettes, og
 * påmeldingene merkes `withdrawn`.
 *
 * Plassene slettes uten `accepted_at`-filteret: arrangøren kan ha satt
 * `accepted_at` på en gjest, og et filter ville latt den stå (#2607 hull 2).
 * Rekkefølgen gjør et nytt forsøk trygt: feiler markeringen, er plassene alt
 * borte, og neste lesing finner gjestene igjen (påmeldingene er ikke merket)
 * uten plass å slette. Begge skrivingene sjekker radtallet (felle 2).
 */
export async function withdrawBroughtGuests(
  admin: Admin,
  gameId: string,
  guests: BroughtGuest[],
  actorId: string,
): Promise<{ ok: true } | { ok: false }> {
  if (guests.length === 0) return { ok: true };

  const seated = guests.filter((g) => g.onRoster);
  try {
    if (seated.length > 0) {
      const deleted = expectAffected(
        await admin
          .from('game_players')
          .delete()
          .eq('game_id', gameId)
          .in(
            'user_id',
            seated.map((g) => g.userId),
          )
          .select('user_id'),
        'withdrawBroughtGuests/roster',
      );
      if (deleted.length !== seated.length) {
        throw new Error(
          `withdrawBroughtGuests/roster: deleted ${deleted.length} of ${seated.length}`,
        );
      }
    }

    const marked = expectAffected(
      await admin
        .from('game_registration_requests')
        .update({
          status: 'withdrawn',
          decided_at: new Date().toISOString(),
          decided_by_user_id: actorId,
        })
        .eq('game_id', gameId)
        .in(
          'id',
          guests.map((g) => g.requestId),
        )
        .in('status', ['pending', 'approved'])
        .select('id'),
      'withdrawBroughtGuests/requests',
    );
    if (marked.length !== guests.length) {
      throw new Error(
        `withdrawBroughtGuests/requests: marked ${marked.length} of ${guests.length}`,
      );
    }
  } catch (err) {
    console.error('[withdrawBroughtGuests] failed', { gameId, error: err });
    return { ok: false };
  }
  return { ok: true };
}

/**
 * Trekk gjestene til spillerne arrangøren fjernet i én lagring (`hostIds`),
 * med én lesing for hele spillet. Lesefeil eller skrivefeil gir `{ ok: false }`.
 */
export async function withdrawGuestsOfHosts(
  admin: Admin,
  gameId: string,
  hostIds: readonly string[],
  actorId: string,
): Promise<{ ok: true } | { ok: false }> {
  if (hostIds.length === 0) return { ok: true };
  const read = await readBroughtGuestsInGame(admin, gameId);
  if (!read.ok) return { ok: false };
  const guests = hostIds.flatMap((host) => read.byHost.get(host) ?? []);
  return withdrawBroughtGuests(admin, gameId, guests, actorId);
}
