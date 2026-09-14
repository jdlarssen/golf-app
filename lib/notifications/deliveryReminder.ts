import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { firstName } from '@/lib/firstName';
import { sendDeliverReminderNotification } from '@/lib/mail/deliverReminderNotification';
import { TOTAL_HOLES } from '@/lib/games/deliveryStatus';
import { filledHolesByPlayer, type FilledRosterRow } from '@/lib/games/filledHoles';
import { scoreOwnerUserIds } from '@/lib/games/scoreOwner';
import { teamScoreOwnerId } from '@/lib/games/teamCaptain';
import type { GameMode } from '@/lib/scoring/modes/types';
import { notify } from './notify';

/**
 * Delt primitiv for leverings-påminnelse (#376): in-app `deliver_reminder`-
 * varsel + betinget off-app-mail. Brukes av både auto-nudgen
 * (`maybeSendDeliveryReminder`) og admin-purringen (`remindUnsubmittedPlayers`).
 *
 * In-app-først: vi sender alltid in-app (via notify), og maler kun til
 * off-app-spillere (`shouldAlsoSendMail`). Best-effort — feiler stille i
 * console.error, kaster aldri, så parent-flyten (render/server-action) aldri
 * blokkeres. Defaulter til ingen mail hvis in-app-varselet ikke gikk gjennom
 * (samme rasjonale som inni notify() — vi vil ikke maile uten in-app).
 */
export async function sendDeliveryReminder(opts: {
  player: { userId: string; email: string | null; name: string | null; locale?: string | null };
  game: { id: string; name: string };
  logPrefix: string;
}): Promise<void> {
  const { player, game, logPrefix } = opts;

  let shouldMail = false;
  try {
    const r = await notify({
      userId: player.userId,
      kind: 'deliver_reminder',
      payload: { game_id: game.id, game_name: game.name },
    });
    shouldMail = r.shouldAlsoSendMail;
  } catch (e) {
    console.error(`[${logPrefix}] deliver_reminder notify failed`, e);
    return;
  }

  if (shouldMail && player.email) {
    try {
      await sendDeliverReminderNotification({
        to: player.email,
        playerFirstName: firstName(player.name),
        gameName: game.name,
        gameId: game.id,
        locale: player.locale ?? null,
      });
    } catch (e) {
      console.error(`[${logPrefix}] deliver_reminder mail failed`, e);
    }
  }
}

/**
 * Auto-nudge: fyr én leverings-påminnelse til spilleren hvis hen har registrert
 * alle hullene sine (18, eller 9 på et front9/back9-segment, #1441) men ikke
 * levert. Kalt fra game-home-render via `after()` (notify kaller revalidateTag
 * som kaster i render-fasen). Self-gater på hull-telling + en atomisk
 * idempotens-guard, så den er trygg å kalle på hvert besøk:
 *
 *   1. Tell hull med registrert slag for spilleren — lagets kort i
 *      én-ball-formatene (#2041). < expectedHoles → return.
 *   2. Atomisk «vinn raden»-update: sett deliver_reminder_sent_at = now() KUN
 *      hvis den er null + ikke levert + ikke trukket. Ingen rad tilbake →
 *      tapte race / allerede purret / levert / trukket → return.
 *   3. Vant raden → sendDeliveryReminder. Kjøres nøyaktig én gang per spiller.
 *
 * Bruker admin-client (RLS-bypass) siden cookies ikke er tilgjengelig inni
 * `after()`-callbacken, og fordi vi uansett skriver på vegne av systemet.
 * Best-effort — svelger alle feil.
 */
export async function maybeSendDeliveryReminder(opts: {
  gameId: string;
  userId: string;
  gameName: string;
  /** Hull som skal til for «ferdig» (#1441). Default `TOTAL_HOLES` (18). */
  expectedHoles?: number;
  /**
   * #2041: the game's whole roster, withdrawn members included and `userId`
   * among them. It picks the team's row owner, so a teammate in a one-ball
   * format counts the team's card.
   */
  players: readonly FilledRosterRow[];
  mode: GameMode;
}): Promise<void> {
  const {
    gameId,
    userId,
    gameName,
    expectedHoles = TOTAL_HOLES,
    players,
    mode,
  } = opts;
  const admin = getAdminClient();

  try {
    // #2041: in the one-ball formats the captain owns the team's rows, so
    // counting the player's own rows never reached «done» for a teammate (a
    // patsome teammate stopped at 6). Fetch the player's and the captain's rows
    // — the same fetch as the Home card (#1624) — and let `filledHolesByPlayer`
    // decide per hole which row counts. Read only this player's entry: the rest
    // of the roster's rows were never fetched.
    const me = players.find((p) => p.user_id === userId);
    const owner =
      me?.team_number == null
        ? null
        : teamScoreOwnerId(
            players.filter((p) => p.team_number === me.team_number),
          );
    const { data: rows, error: scoresErr } = await admin
      .from('scores')
      .select('user_id, hole_number')
      .eq('game_id', gameId)
      .in('user_id', scoreOwnerUserIds(mode, userId, owner))
      .not('strokes', 'is', null)
      .returns<{ user_id: string; hole_number: number }[]>();

    if (scoresErr) return;
    const filled =
      filledHolesByPlayer({ players, scores: rows ?? [], mode }).get(userId) ?? 0;
    if (filled < expectedHoles) return;

    const { data: won, error: updErr } = await admin
      .from('game_players')
      .update({ deliver_reminder_sent_at: new Date().toISOString() })
      .eq('game_id', gameId)
      .eq('user_id', userId)
      .is('deliver_reminder_sent_at', null)
      .is('submitted_at', null)
      .is('withdrawn_at', null)
      .select('user_id')
      .maybeSingle<{ user_id: string }>();

    if (updErr || !won) return;

    const { data: u } = await admin
      .from('users')
      .select('email, name, locale, is_guest')
      .eq('id', userId)
      .maybeSingle<{
        email: string | null;
        name: string | null;
        locale: string | null;
        is_guest: boolean;
      }>();

    // #1009: en gjest med fullt scorekort skal ikke purres — plassholder-
    // adressen kan ikke motta mail, og gjesten leverer via markøren uansett.
    if (u?.is_guest) return;

    await sendDeliveryReminder({
      player: { userId, email: u?.email ?? null, name: u?.name ?? null, locale: u?.locale ?? null },
      game: { id: gameId, name: gameName },
      logPrefix: 'autoDeliverReminder',
    });
  } catch (e) {
    console.error('[autoDeliverReminder] failed', e);
  }
}
