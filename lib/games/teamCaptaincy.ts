import 'server-only';
import type { getAdminClient } from '@/lib/supabase/admin';

// Kapteinen og laget før start (#2358): ett hjem for «har denne kapteinen et
// lag som står bak seg?».
//
// Eierens valg på #2358: en kaptein med lagkamerater som har takket ja kan ikke
// trekke seg, men må gi kapteinsbindet videre først. Ubesvarte invitasjoner
// stopper ikke kapteinen. Regelen trengs to steder — kjernen som nekter
// (`lib/games/withdrawSelf.ts`) og bekreftelsessiden som sier fra på forhånd
// (`/games/[id]/trekk-fra`) — og to kopier ville drevet fra hverandre (AGENTS
// trap 4).

type RequestStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

/** En lagkamerats påmelding, med feltene regelen leser. */
export type TeamChild = {
  id: string;
  user_id: string;
  status: RequestStatus;
  decided_by_user_id: string | null;
};

/**
 * Har lagkameraten takket ja til laget?
 *
 * `status` alene kan ikke svare: i en åpen runde skrives lagkameratens
 * påmelding som `approved` i det kapteinen melder på laget, før de har sett
 * invitasjonen. To signaler skiller «takket ja» fra «invitert, ikke svart»:
 *   - plassen på spillerlista er bekreftet (`game_players.accepted_at`, #463):
 *     de ble med fra lagsida eller åpnet runden;
 *   - de godkjente påmeldingen selv (`decided_by_user_id` er deres egen id):
 *     et tidlig ja i en runde med godkjenning, før arrangøren har satt laget
 *     på spillerlista.
 *
 * `rosterAcceptedAt`: `undefined` = ingen rad på spillerlista.
 */
export function hasAcceptedTeamInvite(
  child: TeamChild,
  rosterAcceptedAt: string | null | undefined,
): boolean {
  if (child.status !== 'pending' && child.status !== 'approved') return false;
  if (rosterAcceptedAt != null) return true;
  return child.status === 'approved' && child.decided_by_user_id === child.user_id;
}

export type CaptainTeam =
  | { ok: true; accepted: TeamChild[]; unanswered: TeamChild[] }
  | { ok: false };

/**
 * Lagkameratene under en kapteinsrad, delt i dem som har takket ja og dem som
 * ikke har svart. Avslåtte og trukne er ute av laget og telles ikke.
 *
 * `{ ok: false }` ved en lesefeil: en feilet spørring skal ikke leses som «ingen
 * på laget» (#1445) — da kunne kapteinen trukket seg fra et lag som står.
 */
export async function readCaptainTeam(
  admin: ReturnType<typeof getAdminClient>,
  gameId: string,
  captainRequestId: string,
): Promise<CaptainTeam> {
  const { data: children, error: childrenError } = await admin
    .from('game_registration_requests')
    .select('id, user_id, status, decided_by_user_id')
    .eq('team_request_id', captainRequestId)
    .in('status', ['pending', 'approved'])
    .returns<TeamChild[]>();
  if (childrenError) {
    console.error('[readCaptainTeam] children lookup failed', {
      gameId,
      captainRequestId,
      error: childrenError,
    });
    return { ok: false };
  }
  const rows = children ?? [];
  if (rows.length === 0) return { ok: true, accepted: [], unanswered: [] };

  const { data: roster, error: rosterError } = await admin
    .from('game_players')
    .select('user_id, accepted_at')
    .eq('game_id', gameId)
    .in(
      'user_id',
      rows.map((r) => r.user_id),
    )
    .returns<{ user_id: string; accepted_at: string | null }[]>();
  if (rosterError) {
    console.error('[readCaptainTeam] roster lookup failed', {
      gameId,
      captainRequestId,
      error: rosterError,
    });
    return { ok: false };
  }
  const acceptedAt = new Map((roster ?? []).map((r) => [r.user_id, r.accepted_at]));

  const accepted: TeamChild[] = [];
  const unanswered: TeamChild[] = [];
  for (const row of rows) {
    const rosterAcceptedAt = acceptedAt.has(row.user_id)
      ? (acceptedAt.get(row.user_id) ?? null)
      : undefined;
    (hasAcceptedTeamInvite(row, rosterAcceptedAt) ? accepted : unanswered).push(row);
  }
  return { ok: true, accepted, unanswered };
}

/**
 * Hva «Trekk meg» betyr for en kaptein før start — for bekreftelsessiden
 * (`/games/[id]/trekk-fra`), som skal si det samme som kjernen gjør.
 *
 * `null` = kalleren er ikke kaptein, eller lesingen feilet. Siden viser da det
 * vanlige skjemaet, og kjernen er vakta uansett.
 */
export async function captainWithdrawalState(
  admin: ReturnType<typeof getAdminClient>,
  gameId: string,
  userId: string,
): Promise<{ blocked: boolean; unanswered: number } | null> {
  const { data: own, error } = await admin
    .from('game_registration_requests')
    .select('id, is_team_captain')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle<{ id: string; is_team_captain: boolean }>();
  if (error || !own?.is_team_captain) return null;

  const team = await readCaptainTeam(admin, gameId, own.id);
  if (!team.ok) return null;
  return {
    blocked: team.accepted.length > 0,
    unanswered: team.unanswered.length,
  };
}
