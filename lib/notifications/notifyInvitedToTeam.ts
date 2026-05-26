import 'server-only';
import { notify } from './notify';

/**
 * Best-effort `team_invite`-varsel til en kjent Tørny-bruker som kapteinen
 * har lagt inn som medspiller i et lag (#199 chunk 8).
 *
 * Skiller seg fra `notifyInvitedToGame` ved at semantikken er "kapteinen
 * vil ha deg i sitt lag (du må bekrefte)", ikke "admin la deg til". Derav
 * egen kind + egen helper — vi vil ikke at innboks-rendringen skal
 * forvirre de to flytene.
 *
 * Returnerer `shouldAlsoSendMail` så caller kan trigge mail-backup ved
 * off-app-bruker. Best-effort: feiler stille på alle DB-/notify-feil,
 * loggført med `[notifyInvitedToTeam]`-prefix.
 */
export async function notifyInvitedToTeam(opts: {
  recipientUserId: string;
  gameId: string;
  gameShortId: string;
  gameName: string;
  teamRequestId: string;
  teamName: string;
  invitedByName: string;
}): Promise<{ shouldAlsoSendMail: boolean }> {
  const {
    recipientUserId,
    gameId,
    gameShortId,
    gameName,
    teamRequestId,
    teamName,
    invitedByName,
  } = opts;

  try {
    return await notify({
      userId: recipientUserId,
      kind: 'team_invite',
      payload: {
        game_id: gameId,
        game_short_id: gameShortId,
        game_name: gameName,
        team_name: teamName,
        invited_by_name: invitedByName,
        request_id: teamRequestId,
      },
    });
  } catch (err) {
    console.error('[notifyInvitedToTeam] notify failed', err);
    return { shouldAlsoSendMail: false };
  }
}
