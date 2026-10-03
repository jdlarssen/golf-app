import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { findGuestIds } from '@/lib/games/createGuestPlayer';
import { expireGameCache } from '@/lib/games/expireGameCache';
import { isRosterLocked, type GameStatus } from '@/lib/games/status';
import { notifyInvitedToGame } from '@/lib/notifications/notifyInvitedToGame';

// `invite`-varsel til rosteret når en runde publiseres (#2215, #2445).
//
// Appen oppretter runden selv under RLS, med kompensering (#737), og den
// flyttes ikke. Det appen ikke kan, er å varsle: `notify()` skriver med
// service-role. Appen spør derfor `POST /api/games/[id]/invite-roster` når
// innsettingen er ferdig. Webben kaller modulen direkte når et spill
// publiseres, fra opprett-actionen og fra edit-actionen (et utkast som
// publiseres). Et utkast varsler ingen (`notifyInvitedToGame`), så det er her
// spillerne fra utkastet får sitt ene varsel.
//
// **Idempotent på varselet, ikke på kallet.** En spiller som alt har et
// `invite`-varsel for runden, hoppes over. Et nytt forsøk etter et nettbrudd gir
// derfor ingen doble varsler, og et andre kall svarer `invited: 0`. Dedupen ser
// på varsel-radene, og `notify()` skriver alltid en rad, så et vellykket varsel
// er alltid synlig for neste kall.
//
// **Authz ligger hos kalleren.** Modulen leser og varsler med admin-klienten og
// spør aldri hvem som ringer. Ruta gater med `authenticatedUserId` +
// `gameOrganiserAccess` før den kaller hit, og `inviterUserId` må være den ekte
// kalleren: det er navnet i varselet og den som aldri varsles selv. Heller
// ikke arrangøren (`games.created_by`) varsles: en admin som publiserer en
// annens utkast, skal ikke sende arrangøren «<admin> inviterte deg» til sitt
// eget spill (#2441).

export type NotifyRosterInvitesResult =
  | { ok: true; invited: number }
  | { ok: false; reason: 'not_found' | 'game_locked' };

/**
 * Send `invite` til hver aktive spiller på rosteret som ikke er kalleren, ikke
 * er arrangøren, ikke er gjest og ikke alt har fått et `invite`-varsel for
 * runden.
 *
 * Gjestene (#1009) finnes med `findGuestIds`, den samme som webbens
 * opprett-løkke bruker, så regelen «gjester varsles ikke» har ett hjem. Ikke en
 * innebygd `users(is_guest)`-select: `game_players` har tre FK-er til `users`,
 * og da er den tvetydig.
 *
 * DB-feil kaster (til rutas 500): et roster vi ikke fikk lest, er ikke «ingen
 * å varsle». Selve varslene er best-effort, som på webben.
 */
export async function notifyRosterInvites(params: {
  gameId: string;
  inviterUserId: string;
}): Promise<NotifyRosterInvitesResult> {
  const { gameId, inviterUserId } = params;
  const admin = getAdminClient();

  const { data: game, error: gameError } = await admin
    .from('games')
    .select('status, created_by')
    .eq('id', gameId)
    .maybeSingle<{ status: GameStatus; created_by: string | null }>();
  if (gameError) throw gameError;
  if (!game) return { ok: false, reason: 'not_found' };
  // Samme lås som «Inviter»: et invite-varsel etter start peker på en runde
  // spilleren ikke kan bli med i lenger (#2212).
  if (isRosterLocked(game.status)) return { ok: false, reason: 'game_locked' };

  const { data: roster, error: rosterError } = await admin
    .from('game_players')
    .select('user_id')
    .eq('game_id', gameId)
    .is('withdrawn_at', null)
    .returns<{ user_id: string }[]>();
  if (rosterError) throw rosterError;

  const others = (roster ?? [])
    .map((r) => r.user_id)
    .filter((id) => id !== inviterUserId && id !== game.created_by);
  if (others.length === 0) return finish(gameId, 0);

  const guestIds = await findGuestIds(others);
  const candidates = others.filter((id) => !guestIds.has(id));
  if (candidates.length === 0) return finish(gameId, 0);

  const { data: already, error: alreadyError } = await admin
    .from('notifications')
    .select('user_id')
    .eq('kind', 'invite')
    .eq('payload->>game_id', gameId)
    .in('user_id', candidates)
    .returns<{ user_id: string }[]>();
  if (alreadyError) throw alreadyError;

  const invitedBefore = new Set((already ?? []).map((r) => r.user_id));
  const recipients = candidates.filter((id) => !invitedBefore.has(id));

  // `notifyInvitedToGame` svelger sine egne feil; `allSettled` er et ekstra
  // lag, så én spiller som feiler aldri stopper varselet til de andre.
  const results = await Promise.allSettled(
    recipients.map((recipientUserId) =>
      notifyInvitedToGame({ recipientUserId, gameId, inviterUserId }),
    ),
  );
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error('[notifyRosterInvites] invite notify failed', {
        gameId,
        recipientUserId: recipients[i],
        error: r.reason,
      });
    }
  });

  // Tallet er forsøkene som ikke kastet. `notifyInvitedToGame` svelger sine
  // egne feil, så et varsel den ga opp teller likevel: tallet er «sendt til»,
  // ikke «levert».
  return finish(
    gameId,
    results.filter((r) => r.status === 'fulfilled').length,
  );
}

/**
 * Tøm spillets cache og svar. Appen har nettopp skrevet runden og rosteret
 * uten å kunne tømme noe selv, så også et kall uten nye mottakere tømmer.
 */
function finish(gameId: string, invited: number): NotifyRosterInvitesResult {
  expireGameCache(gameId);
  return { ok: true, invited };
}
