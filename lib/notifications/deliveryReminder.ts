import 'server-only';
import type { getAdminClient } from '@/lib/supabase/admin';
import { firstName } from '@/lib/firstName';
import { sendDeliverReminderNotification } from '@/lib/mail/deliverReminderNotification';
import {
  deliveryReminderGroups,
  type SweepPlayer,
  type SweepScore,
} from '@/lib/games/deliveryReminderSweep';
import { undeliveredBack9SiblingUserIds } from '@/lib/games/segmentSibling';
import type { HoleSegment } from '@/lib/scoring';
import type { GameMode } from '@/lib/scoring/modes/types';
import { selectAllRows } from '@/lib/supabase/selectAllRows';
import { notify } from './notify';

/**
 * Delt primitiv for leverings-påminnelse (#376): in-app `deliver_reminder`-
 * varsel + betinget off-app-mail. Brukes av både sveipen
 * (`runDeliveryReminderSweepForGame`, #2200) og admin-purringen
 * (`remindUnsubmittedPlayers`).
 *
 * #2200: `othersCount` > 0 betyr at påminnelsen gjelder kort mottakeren har
 * ført for andre. Da får varselet `others_count` og mailen sin egen ordlyd.
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
  othersCount?: number;
}): Promise<void> {
  const { player, game, logPrefix } = opts;
  const othersCount = opts.othersCount ?? 0;

  let shouldMail = false;
  try {
    const r = await notify({
      userId: player.userId,
      kind: 'deliver_reminder',
      payload: {
        game_id: game.id,
        game_name: game.name,
        ...(othersCount > 0 ? { others_count: othersCount } : {}),
      },
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
        forKeptCards: othersCount > 0,
      });
    } catch (e) {
      console.error(`[${logPrefix}] deliver_reminder mail failed`, e);
    }
  }
}

/** Spillet sveipen går over — lest av ruta, sendt inn her. */
export type SweepGame = {
  id: string;
  name: string;
  game_mode: GameMode;
  hole_segment: HoleSegment;
  source_game_id: string | null;
  tournament_id: string | null;
  scheduled_tee_off_at: string | null;
  created_at: string | null;
};

type SweepRosterRow = Omit<SweepPlayer, 'is_guest'> & {
  users: {
    email: string | null;
    name: string | null;
    locale: string | null;
    is_guest: boolean;
  } | null;
};

const SWEEP_LOG_PREFIX = 'deliveryReminderSweep';

/**
 * Sveipen for ett spill (#2200 del 2): les rosteret og slagene, spør
 * mottakerregelen (`deliveryReminderGroups`), og send én påminnelse per
 * mottaker for kortene hen kan levere.
 *
 * Hver påminnelse går etter et atomisk vinn-raden-krav: `deliver_reminder_sent_at`
 * settes bare på kort som fortsatt er upurret, ulevert og ikke trukket. Bare
 * kortene kravet vant, teller; vant det ingen, sendes ingenting. To kjøringer
 * samtidig, eller en kjøring nr. 2, sender derfor ikke noe to ganger, og hvert
 * kort purres én gang (eierens svar 2026-09-27: «Et kvarter, én gang»).
 *
 * Kaster ved en feilet lesing. Ruta fanger det per spill, så ett spill aldri
 * koster de andre påminnelsen. Selve sendingen er best-effort
 * (`sendDeliveryReminder`).
 */
export async function runDeliveryReminderSweepForGame(
  admin: ReturnType<typeof getAdminClient>,
  game: SweepGame,
  now: number,
): Promise<{ reminded: number }> {
  const { data: roster, error: rosterError } = await admin
    .from('game_players')
    .select(
      'user_id, team_number, flight_number, submitted_at, withdrawn_at, deliver_reminder_sent_at, users!game_players_user_id_fkey(email, name, locale, is_guest)',
    )
    .eq('game_id', game.id)
    .returns<SweepRosterRow[]>();
  if (rosterError) throw new Error(`${SWEEP_LOG_PREFIX} roster: ${rosterError.message}`);

  const scores = await selectAllRows(
    (from, to) =>
      admin
        .from('scores')
        .select('user_id, hole_number, strokes, entered_by, updated_at')
        .eq('game_id', game.id)
        .not('strokes', 'is', null)
        .order('id')
        .range(from, to)
        .returns<SweepScore[]>(),
    `${SWEEP_LOG_PREFIX} scores`,
  );

  const rows = roster ?? [];
  const players: SweepPlayer[] = rows.map((r) => ({
    user_id: r.user_id,
    team_number: r.team_number,
    flight_number: r.flight_number,
    submitted_at: r.submitted_at,
    withdrawn_at: r.withdrawn_at,
    deliver_reminder_sent_at: r.deliver_reminder_sent_at,
    is_guest: r.users?.is_guest ?? false,
  }));
  const groups = deliveryReminderGroups({
    players,
    scores,
    game: {
      game_mode: game.game_mode,
      hole_segment: game.hole_segment,
      source_game_id: game.source_game_id,
    },
    now,
    undeliveredSiblingUserIds: await undeliveredBack9SiblingUserIds(admin, game),
  });

  let reminded = 0;
  for (const group of groups) {
    const { data: won, error: claimError } = await admin
      .from('game_players')
      .update({ deliver_reminder_sent_at: new Date(now).toISOString() })
      .eq('game_id', game.id)
      .in('user_id', group.cardUserIds)
      .is('deliver_reminder_sent_at', null)
      .is('submitted_at', null)
      .is('withdrawn_at', null)
      .select('user_id');
    if (claimError) {
      console.error(`[${SWEEP_LOG_PREFIX}] reminder claim failed`, {
        gameId: game.id,
        recipientId: group.recipientId,
        error: claimError,
      });
      continue;
    }
    const wonIds = new Set((won ?? []).map((r) => r.user_id));
    if (wonIds.size === 0) continue;

    const recipient = rows.find((r) => r.user_id === group.recipientId)?.users;
    await sendDeliveryReminder({
      player: {
        userId: group.recipientId,
        email: recipient?.email ?? null,
        name: recipient?.name ?? null,
        locale: recipient?.locale ?? null,
      },
      game: { id: game.id, name: game.name },
      logPrefix: SWEEP_LOG_PREFIX,
      othersCount: group.otherCardUserIds.filter((id) => wonIds.has(id)).length,
    });
    reminded += 1;
  }
  return { reminded };
}
