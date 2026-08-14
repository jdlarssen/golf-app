import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';

/** En cup-deltaker slik varsel-fan-outen trenger den (in-app + mail). */
export type TournamentParticipant = {
  user_id: string;
  email: string;
  name: string | null;
  locale: string | null;
};

/**
 * Alle deltakere i en cup — hele deltaker-settet, ikke bare kallerens flight.
 *
 * #1540: helperen bodde i `actions.ts` og tok en klient som parameter. Begge
 * kallstedene sendte den request-scopede klienten, og RLS-en på `game_players`
 * (`is_admin() OR is_in_game(game_id)`) kollapset da lista til arrangørens egen
 * flight når arrangøren ikke var global admin — nøyaktig tilfellet personlig cup
 * (#526) er laget for. Målt i generalprøven: 4 av 12 deltakere fikk
 * `cup_finished`, og mail-fan-outen filtreres på samme liste, så de åtte falt ut
 * av begge kanalene.
 *
 * Klienten er derfor IKKE et parameter lenger: modulen henter admin-klienten
 * selv, så feil klient ikke kan gjeninnføres fra et kallsted. Service-role er
 * riktig her fordi begge kallstedene allerede er gatet av
 * `requireAdminOrClubAdminOfCup` (AGENTS.md trap 3: RLS er authz-laget, men et
 * gatet server-action kan bruke admin-klienten når gaten er passert) — samme
 * grunn `finishTournament` allerede avslutter kampene via `getAdminClient()`.
 *
 * Deltakere uten e-post droppes, men Tørny-auth er e-post-OTP, så alle brukere
 * HAR e-post — i praksis er dette hele deltaker-settet.
 */
export async function loadTournamentParticipantEmails(
  tournamentId: string,
): Promise<TournamentParticipant[]> {
  const admin = getAdminClient();

  // Hent alle distinct user_ids via game_players-joine på games med
  // tournament_id = id, deretter email via users-tabellen.
  const { data: gameRows, error: gamesError } = await admin
    .from('games')
    .select('id')
    .eq('tournament_id', tournamentId);
  if (gamesError) {
    // Bevisst best-effort (#1543): kallstedene kjører ugatet ETTER at
    // cup-statusen er flippet — et kast ville gitt arrangøren en feilside for
    // en fullført avslutning. Logg og lever tom liste i stedet.
    console.error('[cup] participant lookup: games failed', {
      tournamentId,
      error: gamesError,
    });
    return [];
  }
  const gameIds = (gameRows ?? []).map((g) => g.id);
  if (gameIds.length === 0) return [];

  const { data: playerRows, error: playersError } = await admin
    .from('game_players')
    .select('user_id, users!game_players_user_id_fkey(email, name, locale)')
    .in('game_id', gameIds);
  if (playersError) {
    // Samme bevisste best-effort som over — ikke «fiks» til et kast.
    console.error('[cup] participant lookup: game_players failed', {
      tournamentId,
      error: playersError,
    });
    return [];
  }

  const seen = new Set<string>();
  const out: TournamentParticipant[] = [];
  // Supabase JS typer FK-joins som array selv på many-to-one. Normaliser med
  // unknown-cast og array-håndtering.
  const rows = (playerRows ?? []) as unknown as Array<{
    user_id: string;
    users:
      | { email: string; name: string | null; locale: string | null }
      | { email: string; name: string | null; locale: string | null }[]
      | null;
  }>;
  for (const row of rows) {
    if (seen.has(row.user_id)) continue;
    seen.add(row.user_id);
    const userRel = Array.isArray(row.users) ? row.users[0] : row.users;
    const email = userRel?.email;
    if (!email) continue;
    out.push({
      user_id: row.user_id,
      email,
      name: userRel?.name ?? null,
      locale: userRel?.locale ?? null,
    });
  }
  return out;
}
