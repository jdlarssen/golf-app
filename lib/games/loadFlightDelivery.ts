import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { selectAllRows } from '@/lib/supabase/selectAllRows';
import {
  flightDeliveryCandidates,
  flightDeliveryPool,
  type DeliveryGame,
  type DeliveryPlayer,
  type DeliveryScore,
} from './flightDelivery';

// Serverens lesing til leveringsregelen (#2200). Leverings-kjernen, lever-siden
// og spillsiden trenger de samme radene for å spørre `flightDeliveryCandidates`,
// så lesingen har ett hjem her, og regelen selv bor i `flightDelivery.ts`.
//
// **Authz ligger hos kalleren**, som i `submitScorecardCore`: aktøren må være
// en verifisert spiller i spillet før dette kalles. Lesingen går med
// admin-klienten, fordi slag-RLS skjuler makkernes slag i noen
// flight-oppsett, og svaret er bare navnene i aktørens egen flight.

/** Et kort aktøren kan levere, med det flatene trenger for å vise det. */
export type FlightDeliveryCard = {
  userId: string;
  name: string | null;
  isGuest: boolean;
};

type RosterRow = {
  user_id: string;
  team_number: number | null;
  flight_number: number | null;
  withdrawn_at: string | null;
  submitted_at: string | null;
  users: { name: string | null; is_guest: boolean } | null;
};

/**
 * Kortene `actorId` kan levere i tillegg til sitt eget i `gameId`, i
 * roster-rekkefølge. Leser slag bare for spillerne som kan komme på tale
 * (`flightDeliveryPool`), så et spill uten kandidater koster én roster-lesing.
 *
 * Kaster ved lesefeil. Kalleren avgjør om det er en feil eller bare «ingen
 * kort å tilby».
 */
export async function loadFlightDeliveryCards(
  gameId: string,
  actorId: string,
  game: DeliveryGame,
): Promise<FlightDeliveryCard[]> {
  const admin = getAdminClient();
  const { data: roster, error } = await admin
    .from('game_players')
    .select(
      'user_id, team_number, flight_number, withdrawn_at, submitted_at, users!game_players_user_id_fkey(name, is_guest)',
    )
    .eq('game_id', gameId)
    .returns<RosterRow[]>();
  if (error) throw new Error(`loadFlightDeliveryCards: roster: ${error.message}`, { cause: error });

  const rows = roster ?? [];
  const players: DeliveryPlayer[] = rows.map((r) => ({
    user_id: r.user_id,
    team_number: r.team_number,
    flight_number: r.flight_number,
    withdrawn_at: r.withdrawn_at,
    submitted_at: r.submitted_at,
    is_guest: r.users?.is_guest ?? false,
  }));

  const pool = flightDeliveryPool(actorId, { players, game });
  if (pool.length === 0) return [];

  const scores = await selectAllRows(
    (from, to) =>
      admin
        .from('scores')
        .select('user_id, hole_number, strokes, entered_by')
        .eq('game_id', gameId)
        .in('user_id', pool)
        .order('id')
        .range(from, to)
        .returns<DeliveryScore[]>(),
    'loadFlightDeliveryCards',
  );

  const byId = new Map(rows.map((r) => [r.user_id, r]));
  return flightDeliveryCandidates(actorId, { players, scores, game }).map((userId) => ({
    userId,
    name: byId.get(userId)?.users?.name?.trim() || null,
    isGuest: byId.get(userId)?.users?.is_guest ?? false,
  }));
}
