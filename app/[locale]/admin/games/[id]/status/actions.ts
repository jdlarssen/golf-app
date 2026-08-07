'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/admin/auth';
import { sendDeliveryReminder } from '@/lib/notifications/deliveryReminder';
import { notify } from '@/lib/notifications/notify';
import { holeCountForSegment } from '@/lib/games/holeScope';
import { selectDeliveryReminderTargets } from '@/lib/games/deliveryStatus';
import type { HoleSegment } from '@/lib/scoring';

type PlayerRow = {
  user_id: string;
  submitted_at: string | null;
  withdrawn_at: string | null;
  users: {
    email: string | null;
    name: string | null;
    locale: string | null;
    is_guest: boolean;
  } | null;
};

/**
 * Admin-purring (#376): send «husk å levere»-påminnelse til alle spillere som
 * er ferdige (18/18 registrert) men ikke har levert — og ikke er trukket.
 *
 * Best-effort (Promise.allSettled) — én feil stopper ikke resten, og action-en
 * aborterer aldri på mail/notify-feil. Bruker sendDeliveryReminder direkte (ikke
 * auto-nudgens idempotens-guard), så admin kan purre på nytt ved behov. Stamper
 * deliver_reminder_sent_at etterpå slik at auto-nudgen ikke dobbel-fyrer for de
 * samme spillerne.
 */
export async function remindUnsubmittedPlayers(gameId: string) {
  const locale = await getLocale();
  const supabase = await getServerClient();
  await requireAdmin(supabase);

  const statusPath = `/admin/games/${gameId}/status`;

  const { data: game } = await supabase
    .from('games')
    .select('id, name, status, hole_segment, tournament_id')
    .eq('id', gameId)
    .single<{
      id: string;
      name: string;
      status: string;
      hole_segment: HoleSegment;
      tournament_id: string | null;
    }>();

  if (!game || game.status !== 'active') {
    redirect({ href: `${statusPath}?error=not_active`, locale });
  }

  // #1441: front9/back9-spill er «ferdig» ved 9 hull, ikke 18.
  const expectedHoles = holeCountForSegment(game!.hole_segment);

  const [playersRes, scoresRes] = await Promise.all([
    supabase
      .from('game_players')
      .select(
        'user_id, submitted_at, withdrawn_at, users!game_players_user_id_fkey(email, name, locale, is_guest)',
      )
      .eq('game_id', gameId)
      .returns<PlayerRow[]>(),
    supabase
      .from('scores')
      .select('user_id')
      .eq('game_id', gameId)
      .not('strokes', 'is', null)
      .returns<{ user_id: string }[]>(),
  ]);

  const filledByUser = new Map<string, number>();
  for (const r of scoresRes.data ?? []) {
    filledByUser.set(r.user_id, (filledByUser.get(r.user_id) ?? 0) + 1);
  }

  // #1466: on a split-cup front9 host, a player whose back9 sibling is still
  // undelivered is nagged via the back9 game (one delivery covers the whole
  // round). Exclude them here. Batch: find the tournament's back9 host(s), then
  // ONE query for which finished front9 players are still undelivered there — no
  // per-player loop. Non-split games (hole_segment='full') skip this entirely.
  let undeliveredSiblingUserIds: Set<string> | undefined;
  if (game!.hole_segment === 'front9' && game!.tournament_id != null) {
    const admin = getAdminClient();
    const { data: back9Hosts } = await admin
      .from('games')
      .select('id')
      .eq('tournament_id', game!.tournament_id)
      .eq('hole_segment', 'back9')
      .is('source_game_id', null)
      .returns<{ id: string }[]>();
    const back9Ids = (back9Hosts ?? []).map((g) => g.id);
    if (back9Ids.length > 0) {
      const { data: undelivered } = await admin
        .from('game_players')
        .select('user_id')
        .in('game_id', back9Ids)
        .is('submitted_at', null)
        .is('withdrawn_at', null)
        .returns<{ user_id: string }[]>();
      undeliveredSiblingUserIds = new Set(
        (undelivered ?? []).map((r) => r.user_id),
      );
    }
  }

  // #1009: gjester purres ikke — plassholder-adressen kan ikke motta mail, og
  // gjesten leverer via markøren uansett. #1466: front9-spillere med ulevert
  // back9-søsken ekskluderes (purres via back9).
  const targets = selectDeliveryReminderTargets({
    players: playersRes.data ?? [],
    filledByUser,
    expectedHoles,
    undeliveredSiblingUserIds,
  });

  await Promise.allSettled(
    targets.map((p) =>
      sendDeliveryReminder({
        player: {
          userId: p.user_id,
          email: p.users?.email ?? null,
          name: p.users?.name ?? null,
          locale: p.users?.locale ?? null,
        },
        game: { id: game!.id, name: game!.name },
        logPrefix: 'remindUnsubmittedPlayers',
      }),
    ),
  );

  // Stamp så auto-nudgen ikke dobbel-fyrer for de samme spillerne.
  if (targets.length > 0) {
    await supabase
      .from('game_players')
      .update({ deliver_reminder_sent_at: new Date().toISOString() })
      .eq('game_id', gameId)
      .in(
        'user_id',
        targets.map((t) => t.user_id),
      );
  }

  revalidatePath(statusPath);
  redirect({ href: `${statusPath}?status=reminded&count=${targets.length}`, locale });
}

type UnconfirmedPlayerRow = {
  user_id: string;
  withdrawn_at: string | null;
  accepted_at: string | null;
  users: { email: string | null; name: string | null } | null;
};

/**
 * Admin-purring (#463): send «bekreft at du er med»-påminnelse (player_added-
 * kind) til alle spillere som ennå ikke har bekreftet deltakelse
 * (accepted_at is null) og ikke er trukket. Ingen idempotens-guard siden
 * admin kan sende på nytt ved behov. Best-effort (Promise.allSettled).
 * Avbryter aldri på notify-feil.
 */
export async function remindUnconfirmedPlayers(gameId: string) {
  const locale = await getLocale();
  const supabase = await getServerClient();
  await requireAdmin(supabase);

  const statusPath = `/admin/games/${gameId}/status`;

  const { data: game } = await supabase
    .from('games')
    .select('id, name, created_by')
    .eq('id', gameId)
    .single<{ id: string; name: string; created_by: string | null }>();

  if (!game) {
    redirect({ href: `${statusPath}?error=not_found`, locale });
  }

  const { data: players } = await supabase
    .from('game_players')
    .select(
      'user_id, withdrawn_at, accepted_at, users!game_players_user_id_fkey(email, name)',
    )
    .eq('game_id', gameId)
    .is('accepted_at', null)
    .returns<UnconfirmedPlayerRow[]>();

  const unconfirmed = (players ?? []).filter((p) => !p.withdrawn_at);

  // Lookup creator name for the notification message. Falls back to 'Tørny'.
  let adderName = 'Tørny';
  if (game!.created_by) {
    const admin = getAdminClient();
    const { data: creator } = await admin
      .from('users')
      .select('name, email')
      .eq('id', game!.created_by)
      .maybeSingle<{ name: string | null; email: string | null }>();
    if (creator) {
      adderName = creator.name ?? creator.email ?? 'Tørny';
    }
  }

  await Promise.allSettled(
    unconfirmed.map((p) =>
      notify({
        userId: p.user_id,
        kind: 'player_added',
        payload: {
          game_id: game!.id,
          game_name: game!.name,
          added_by_name: adderName,
        },
      }).catch((err) => {
        console.error('[remindUnconfirmedPlayers] notify failed', err);
      }),
    ),
  );

  revalidatePath(statusPath);
  redirect({ href: `${statusPath}?status=reminded_unconfirmed&count=${unconfirmed.length}`, locale });
}
