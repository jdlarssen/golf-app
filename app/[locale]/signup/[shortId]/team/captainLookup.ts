import { getAdminClient } from '@/lib/supabase/admin';
import { displayNameForOthers } from '@/lib/users/displayName';

/**
 * Delte kaptein-oppslag for lag-flyten (#1343).
 *
 * Bor utenfor `teamActions.ts` fordi den fila er `'use server'` — alt som
 * eksporteres derfra blir en server-action. Både attach-action-en og
 * `/signup/[shortId]/team`-siden trenger de samme to reglene, og en regel
 * skal ha ett hjem (AGENTS.md trap 4).
 */

/** Minimum en rad må bære for at pickeren skal kunne velge den. */
type CaptainCandidate = { id: string; user_id: string };

/**
 * Lagmedlem → kapteinsraden hen står under (`team_request_id`), for lagene
 * med en aktiv kaptein (#2358).
 *
 * Kapteinsbindet kan gis videre (`transfer_team_captaincy`, 0194). Da er den
 * som sendte en e-postinvitasjon ikke lenger kaptein, og `invited_by` alene
 * finner ikke laget. Inviterens egen påmelding peker på den nye kapteinen.
 * `invited_by` skrives aldri om: den sier hvem som faktisk inviterte.
 */
export type InviterTeams = ReadonlyMap<string, string>;

export type CaptainPick<T extends CaptainCandidate> = {
  row: T;
  source: 'invited_by' | 'fallback';
};

/**
 * Velg hvilken kaptein-request en e-post-invitert medspiller hører til.
 *
 * `invitations.invited_by` peker på den som sendte invitasjonen. Er det en
 * kaptein i spillet, er svaret sikkert (`source: 'invited_by'`) — det finnes
 * maks én kaptein-rad per bruker per spill (unique (game_id, user_id), 0042).
 * Har inviteren gitt kapteinsbindet videre, står hen fortsatt på laget, og
 * `inviterTeams` peker på den nye kapteinen — også det er et sikkert treff
 * (#2358). Er inviteren arrangøren eller en kaptein som har trukket laget, vet
 * vi ikke hvilket lag invitéen hører til, og vi faller tilbake på dagens
 * heuristikk: nyeste lag (`source: 'fallback'`). Callere som viser lagnavn i
 * UI skal kun stole på `'invited_by'` — å navngi feil lag er verre enn å la
 * være.
 *
 * Ren funksjon: `rows` forventes sortert nyest først (`order created_at desc`),
 * så fallback er `rows[0]`.
 */
export function pickCaptainRequest<T extends CaptainCandidate>(
  rows: T[],
  invitedBy: string,
  inviterTeams?: InviterTeams,
): CaptainPick<T> | null {
  if (rows.length === 0) return null;
  const invited = rows.find((r) => r.user_id === invitedBy);
  if (invited) return { row: invited, source: 'invited_by' };
  const teamId = inviterTeams?.get(invitedBy);
  const viaTeam = teamId ? rows.find((r) => r.id === teamId) : undefined;
  if (viaTeam) return { row: viaTeam, source: 'invited_by' };
  return { row: rows[0], source: 'fallback' };
}

/**
 * Minimum en invitasjons-rad må bære for at invitasjons-pickeren skal virke.
 * `invited_by` er NOT NULL i `invitations` (#1690) — ingen null-gren her.
 */
type InvitationCandidate = { invited_by: string };

/**
 * Velg hvilken åpen invitasjon vi skal gå videre med for en e-post.
 *
 * Det finnes ingen unique på (email, game_id): både arrangøren og en kaptein
 * kan ha invitert samme e-post til samme spill. Tar vi bare den nyeste, kan
 * arrangørens invitasjon skygge for kapteinens — og da havner invitéen i
 * stopp-skjermen selv om laget er sikkert kjent. Derfor: en invitasjon sendt
 * av en kaptein i spillet vinner (sikkert treff), ellers nyeste rad (#1343).
 *
 * Ren funksjon: `invitations` forventes sortert nyest først
 * (`order created_at desc`), så fallback er `invitations[0]`.
 */
export function pickPendingInvitation<T extends InvitationCandidate>(
  invitations: T[],
  captainUserIds: ReadonlySet<string> | string[],
): T | null {
  if (invitations.length === 0) return null;
  const captains = Array.isArray(captainUserIds)
    ? new Set(captainUserIds)
    : captainUserIds;
  const fromCaptain = invitations.find((i) => captains.has(i.invited_by));
  return fromCaptain ?? invitations[0];
}

/**
 * Har denne e-post-inviterte spilleren et SIKKERT lag-treff?
 *
 * Kombinerer de to pickerne over til den ene regelen callere egentlig spør
 * om: «vet vi hvilket lag invitasjonen gjelder?». Svaret er ja kun når den
 * valgte invitasjonen er sendt av noen som selv er kaptein i spillet
 * (`source: 'invited_by'`) — fallback-heuristikken gjetter, og en gjetning
 * skal hverken sette noen på lag eller peke dem mot et lag (#1343/#1425).
 *
 * Én regel, ett hjem: både `/team`-siden (som stopper på usikkert treff) og
 * base-signup-siden (som skjuler lag-pekeren) må svare likt, ellers sender
 * pekeren folk rett inn i stopp-skjermen som sender dem tilbake igjen.
 *
 * Ren funksjon: begge lister forventes sortert nyest først
 * (`order created_at desc` i kallende query).
 */
export function resolveCertainTeamInvitation<
  I extends InvitationCandidate,
  C extends CaptainCandidate,
>(
  invitations: I[],
  captainRows: C[],
  inviterTeams?: InviterTeams,
): { invitation: I; captain: C } | null {
  const invitation = pickPendingInvitation(invitations, [
    ...captainRows.map((r) => r.user_id),
    ...(inviterTeams?.keys() ?? []),
  ]);
  if (!invitation) return null;
  const picked = pickCaptainRequest(captainRows, invitation.invited_by, inviterTeams);
  if (picked?.source !== 'invited_by') return null;
  return { invitation, captain: picked.row };
}

/**
 * Lagkartet {@link InviterTeams} for kapteinsradene i et spill (#2358).
 *
 * Lest med tjenesteklienten: lagkameratenes påmeldinger er ikke synlige for
 * invitéen under RLS. En lesefeil gir et tomt kart — da oppfører oppslaget seg
 * som før overføringer fantes (stopp-skjermen), aldri som en gjetning.
 */
export async function loadInviterTeams(
  admin: ReturnType<typeof getAdminClient>,
  gameId: string,
  captainRequestIds: string[],
): Promise<InviterTeams> {
  if (captainRequestIds.length === 0) return new Map();
  const { data, error } = await admin
    .from('game_registration_requests')
    .select('user_id, team_request_id')
    .eq('game_id', gameId)
    .eq('is_team_captain', false)
    .in('status', ['pending', 'approved'])
    .in('team_request_id', captainRequestIds)
    .returns<{ user_id: string; team_request_id: string }[]>();
  if (error) {
    console.error('[loadInviterTeams] lookup failed', { gameId, error });
    return new Map();
  }
  return new Map((data ?? []).map((r) => [r.user_id, r.team_request_id]));
}

/**
 * Visningsnavn for en kaptein: navn (eller maskert e-post hvis navnet mangler,
 * #2271), med kallenavn i «» når det finnes.
 *
 * Returnerer null når bruker-raden mangler — NotificationCard fyller inn den
 * locale-korrekte fallbacken ved render, så payloads holdes locale-agnostiske
 * (#583).
 */
export async function getCaptainDisplayName(
  userId: string,
): Promise<string | null> {
  const admin = getAdminClient();
  const { data } = await admin
    .from('users')
    .select('name, nickname, email')
    .eq('id', userId)
    .maybeSingle<{
      name: string | null;
      nickname: string | null;
      email: string;
    }>();
  if (!data) return null;
  return displayNameForOthers(data);
}
