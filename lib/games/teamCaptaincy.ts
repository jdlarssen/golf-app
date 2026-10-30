import 'server-only';
import type { getAdminClient } from '@/lib/supabase/admin';
import { REQUEST_USER_EMBED, isGuestRequest, readBroughtGuests } from '@/lib/games/broughtGuests';

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
 *
 * En gjest har aldri takket ja (#2607): den har ingen konto å svare fra, og
 * `accepted_at` på plassen er arrangørens, ikke gjestens. Uten unntaket fikk
 * kapteinen `captain_has_team` og beskjed om å gi bindet til en gjest.
 */
export function hasAcceptedTeamInvite(
  child: TeamChild,
  rosterAcceptedAt: string | null | undefined,
  isGuest: boolean,
): boolean {
  if (isGuest) return false;
  if (child.status !== 'pending' && child.status !== 'approved') return false;
  if (rosterAcceptedAt != null) return true;
  return child.status === 'approved' && child.decided_by_user_id === child.user_id;
}

export type CaptainTeam =
  | { ok: true; accepted: TeamChild[]; unanswered: TeamChild[] }
  | { ok: false };

/**
 * Lagkameratene under en kapteinsrad, delt i dem som har takket ja og dem som
 * ikke har svart. Avslåtte og trukne er ute av laget og telles ikke. Gjestene
 * er ikke med i noen av gruppene (#2607): de leses med `readBroughtGuests` og
 * følger kapteinen ut.
 *
 * `{ ok: false }` ved en lesefeil: en feilet spørring skal ikke leses som «ingen
 * på laget» (#1445) — da kunne kapteinen trukket seg fra et lag som står.
 */
export async function readCaptainTeam(
  admin: ReturnType<typeof getAdminClient>,
  gameId: string,
  captainRequestId: string,
): Promise<CaptainTeam> {
  // #2440: only rows in this game — `team_request_id` is not bound to the
  // captain's game in the database.
  const { data: children, error: childrenError } = await admin
    .from('game_registration_requests')
    .select(`id, user_id, status, decided_by_user_id, ${REQUEST_USER_EMBED}`)
    .eq('team_request_id', captainRequestId)
    .eq('game_id', gameId)
    .in('status', ['pending', 'approved'])
    .returns<(TeamChild & { users: { is_guest: boolean } | null })[]>();
  if (childrenError) {
    console.error('[readCaptainTeam] children lookup failed', {
      gameId,
      captainRequestId,
      error: childrenError,
    });
    return { ok: false };
  }
  // Gjestene leses med `readBroughtGuests`; her er bare lagkamerater med konto.
  const rows: TeamChild[] = (children ?? [])
    .filter((row) => !isGuestRequest(row))
    .map(({ id, user_id, status, decided_by_user_id }) => ({ id, user_id, status, decided_by_user_id }));
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
    // isGuest = false: gjestene er filtrert ut over.
    (hasAcceptedTeamInvite(row, rosterAcceptedAt, false) ? accepted : unanswered).push(row);
  }
  return { ok: true, accepted, unanswered };
}

/**
 * Hva «Trekk meg» betyr for en kaptein før start — for bekreftelsessiden
 * (`/games/[id]/trekk-fra`), som skal si det samme som kjernen gjør.
 *
 * `null` = kalleren er ikke kaptein, eller lesingen feilet. Siden viser da det
 * vanlige skjemaet, og kjernen er vakta uansett. `marksRequest` = påmeldingen
 * blir merket som trukket (den er ventende eller godkjent); en avvist påmelding
 * står som den er. `guestNames` = gjestene kapteinen meldte på, som trekkes
 * med (#2607).
 */
export async function captainWithdrawalState(
  admin: ReturnType<typeof getAdminClient>,
  gameId: string,
  userId: string,
): Promise<{
  blocked: boolean;
  unanswered: number;
  marksRequest: boolean;
  guestNames: string[];
} | null> {
  const { data: own, error } = await admin
    .from('game_registration_requests')
    .select('id, status, is_team_captain')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle<{ id: string; status: string; is_team_captain: boolean }>();
  if (error || !own?.is_team_captain) return null;

  const [team, brought] = await Promise.all([
    readCaptainTeam(admin, gameId, own.id),
    readBroughtGuests(admin, gameId, userId),
  ]);
  if (!team.ok || !brought.ok) return null;
  return {
    blocked: team.accepted.length > 0,
    unanswered: team.unanswered.length,
    guestNames: brought.guests.flatMap((g) => (g.name ? [g.name] : [])),
    // Kjernen merker bare en ventende eller godkjent påmelding som trukket.
    marksRequest: own.status === 'pending' || own.status === 'approved',
  };
}
