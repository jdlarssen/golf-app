import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import type { TablesUpdate } from '@/lib/database.types';
import { expectAffected, NoRowsAffectedError } from '@/lib/supabase/affectedRows';
import { dueNotices, noticeRecipients, type LeagueRoundNoticeKind } from '@/lib/league/roundNotices';
import { firstName } from '@/lib/firstName';
import { getLigaSnapshot } from '@/lib/league/getLigaSnapshot';
import { generateRoundNews } from '@/lib/league/roundNews';
import { buildRoundSummary } from '@/lib/league/roundSummary';
import {
  sendLeagueRoundNotification,
  type LeagueRoundMailSummary,
} from '@/lib/mail/leagueRoundNotification';
import { chunkIds } from './inboxReads';
import { notify } from './notify';
import { usersWithPushDevice } from './push/pushDevices';
import type { NotificationPayload } from './types';

// The league round's two messages (#2638 Del 3): «Runde 3 i Vinterligaen er
// åpen» when the round opens, and the reminder 48 hours before it closes to
// whoever has not played it. The rules live in `lib/league/roundNotices.ts`;
// this file reads, claims and sends.
//
// Each message goes once per round. The claim is the same «win the row»
// update as `runStaleGameReminderForGame`: the stamp is set only where it is
// still null, and only the run that got the row back sends. Two runs at once
// therefore send nothing twice. A changed deadline clears the reminder's stamp
// in the database (0217), so an extended window gets a new reminder.
//
// `notify` stores the varsel and pushes when the player is away. A player who
// is away and has no device to push to gets the message as mail as well
// (#2974): 6 of the 11 players in the first league had no device, and one of
// them never opened Tørny, so nothing reached that player. Players with a
// device get no mail: the push is theirs.
//
// The opening message of a round that has a closed round before it carries a
// summary of that round in the mail (#2979): the numbers from the league
// table and a short news story, the same for everyone. Then the mail goes to
// every player who is away, with a device or not. The summary is in the mail
// only: a varsel is stored, and a name in a stored payload must be scrubbed
// when that player deletes the account (0253).

type AdminClient = ReturnType<typeof getAdminClient>;

/** The round the sweep hands over, read by the route (with its league). */
export type LeagueRoundSweepRound = {
  id: string;
  league_id: string;
  label: string;
  opens_at: string;
  closes_at: string;
  opening_notice_sent_at: string | null;
  closing_reminder_sent_at: string | null;
  leagues: { name: string; is_simulator: boolean } | null;
  /** #2666: read for the opening message of a simulator league. */
  courses: { name: string | null } | null;
  tee_boxes: { name: string | null } | null;
};

const LOG_PREFIX = 'leagueRoundReminder';

const STAMP: Record<LeagueRoundNoticeKind, 'opening_notice_sent_at' | 'closing_reminder_sent_at'> = {
  league_round_open: 'opening_notice_sent_at',
  league_round_closing: 'closing_reminder_sent_at',
};

type FlightRow = { status: string; game_players: Array<{ user_id: string; withdrawn_at: string | null }> | null };

/**
 * The due messages for one round: read the league's players and the round's
 * flights, then per message claim the stamp and send to everyone who has not
 * played. The stamp is claimed also when nobody is left to tell, so the round
 * does not come back every hour.
 *
 * Throws on a failed read or claim, so the route can count it per round and
 * one round never costs the others their messages (same as the stale sweep).
 * The sends are best-effort: one failed `notify` is logged, the rest go.
 * `sent` counts the varsler that landed, `mailed` the mails that went with
 * them. A mail never moves a stamp: it follows a varsel that has landed, from
 * the run that won the claim, so it goes at most once per message too.
 */
export async function runLeagueRoundNotices(
  admin: AdminClient,
  round: LeagueRoundSweepRound,
  now: number,
): Promise<{ sent: Record<LeagueRoundNoticeKind, number>; mailed: Record<LeagueRoundNoticeKind, number> }> {
  const sent: Record<LeagueRoundNoticeKind, number> = { league_round_open: 0, league_round_closing: 0 };
  const mailed: Record<LeagueRoundNoticeKind, number> = { league_round_open: 0, league_round_closing: 0 };
  const due = dueNotices(round, now);
  if (due.length === 0) return { sent, mailed };

  const [playersRes, flightsRes] = await Promise.all([
    admin
      .from('league_players')
      .select('user_id')
      .eq('league_id', round.league_id)
      .order('joined_at', { ascending: true })
      .returns<{ user_id: string }[]>(),
    admin
      .from('games')
      .select('status, game_players(user_id, withdrawn_at)')
      .eq('league_round_id', round.id)
      .returns<FlightRow[]>(),
  ]);
  if (playersRes.error) throw new Error(`${LOG_PREFIX} players: ${playersRes.error.message}`);
  if (flightsRes.error) throw new Error(`${LOG_PREFIX} flights: ${flightsRes.error.message}`);

  const recipients = noticeRecipients(
    (playersRes.data ?? []).map((p) => p.user_id),
    (flightsRes.data ?? []).map((f) => ({
      status: f.status,
      players: (f.game_players ?? []).map((gp) => ({ userId: gp.user_id, withdrawnAt: gp.withdrawn_at })),
    })),
  );
  const leagueName = round.leagues?.name;
  if (!leagueName) throw new Error(`${LOG_PREFIX} round ${round.id} came without its league`);
  const payload: NotificationPayload<'league_round_open'> = {
    league_id: round.league_id,
    league_name: leagueName,
    round_id: round.id,
    round_label: round.label,
    closes_at: round.closes_at,
    // #2666: a simulator league's messages name the course and tee and link to
    // the start page; a regular league's payload is unchanged.
    ...(round.leagues?.is_simulator
      ? {
          is_simulator: true,
          ...(round.courses?.name ? { course_name: round.courses.name } : {}),
          ...(round.tee_boxes?.name ? { tee_name: round.tee_boxes.name } : {}),
        }
      : {}),
  };

  for (const kind of due) {
    const stamp = STAMP[kind];
    const at = new Date(now).toISOString();
    const patch: TablesUpdate<'league_rounds'> =
      kind === 'league_round_open' ? { opening_notice_sent_at: at } : { closing_reminder_sent_at: at };
    let claim = admin
      .from('league_rounds')
      .update(patch)
      .eq('id', round.id)
      .is(stamp, null);
    // The reminder names this deadline. Moved since the read (the stamp is
    // then cleared again), it is the next run's reminder to send.
    if (kind === 'league_round_closing') claim = claim.eq('closes_at', round.closes_at);
    try {
      expectAffected(await claim.select('id'), `${LOG_PREFIX} claim ${kind}`);
    } catch (err) {
      // Another run won the row, or the deadline moved: nothing to send.
      if (err instanceof NoRowsAffectedError) continue;
      throw err;
    }

    const results = await Promise.allSettled(
      recipients.map((userId) => notify({ userId, kind, payload })),
    );
    // The players whose varsel landed while they were away (not in Tørny
    // right now, not a guest, not a deleted account: `notify` knows).
    const away: string[] = [];
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`[${LOG_PREFIX}] ${kind} to ${recipients[i]} failed`, { roundId: round.id, err: r.reason });
      } else if (r.value.inserted === false) {
        console.error(`[${LOG_PREFIX}] ${kind} to ${recipients[i]} did not land`, { roundId: round.id });
      } else {
        sent[kind] += 1;
        if (r.value.shouldAlsoSendMail) away.push(recipients[i]!);
      }
    });

    // Nobody was told: give the stamp back (only this run's own), so the next
    // run tries again. When some were told, the stamp stands, so nobody gets
    // the message twice.
    if (recipients.length > 0 && sent[kind] === 0) {
      const release: TablesUpdate<'league_rounds'> =
        kind === 'league_round_open' ? { opening_notice_sent_at: null } : { closing_reminder_sent_at: null };
      const { error: releaseError } = await admin
        .from('league_rounds')
        .update(release)
        .eq('id', round.id)
        .eq(stamp, at);
      if (releaseError) {
        console.error(`[${LOG_PREFIX}] ${kind} release failed`, { roundId: round.id, error: releaseError });
      }
    }

    const summary =
      kind === 'league_round_open' && away.length > 0 ? await previousRoundSummary(admin, round, now) : null;
    mailed[kind] = await mailAwayPlayers(admin, away, kind, payload, summary);
  }
  return { sent, mailed };
}

type MailUser = { id: string; email: string | null; name: string | null; locale: string | null };

/**
 * The round that closed before `round`, for the opening mail (#2979): its
 * numbers from the league snapshot (the table the league page shows) and the
 * news story the language model wrote from them. Null when there is no such
 * round, when nobody played it, or when the table could not be read; a null
 * story means the numbers go alone. Never throws: the mail then goes as it
 * did before, without a summary.
 */
async function previousRoundSummary(
  admin: AdminClient,
  round: LeagueRoundSweepRound,
  now: number,
): Promise<LeagueRoundMailSummary | null> {
  try {
    const snapshot = await getLigaSnapshot(round.league_id);
    if (!snapshot) return null;
    const summary = buildRoundSummary(snapshot, round.id, now);
    if (!summary) return null;
    return { summary, story: await generateRoundNews(admin, summary, round.label) };
  } catch (err) {
    console.error(`[${LOG_PREFIX}] round summary failed, the mail goes without it`, { roundId: round.id, err });
    return null;
  }
}

/**
 * The message as mail to the players in `away`. Returns how many mails went.
 * Best-effort, and it never throws: the varsler have landed and the stamp
 * stands whatever happens here.
 *
 * Without a summary the mail is for the players with no device to push to
 * (#2974). A failed device read mails everyone away: a player with a device
 * then gets the push and the mail, which is better than a player without one
 * getting nothing. With a summary (#2979) everyone away gets the mail, so the
 * whole league reads the same text. A failed read of the addresses mails
 * nobody, and one failed mail is logged while the rest go.
 */
async function mailAwayPlayers(
  admin: AdminClient,
  away: readonly string[],
  kind: LeagueRoundNoticeKind,
  payload: NotificationPayload<'league_round_open'>,
  summary: LeagueRoundMailSummary | null,
): Promise<number> {
  if (away.length === 0) return 0;
  try {
    let withDevice = new Set<string>();
    if (!summary) {
      try {
        withDevice = await usersWithPushDevice(admin, away);
      } catch (err) {
        console.error(`[${LOG_PREFIX}] ${kind} device read failed, mailing everyone away`, err);
      }
    }
    const targets = away.filter((id) => !withDevice.has(id));
    if (targets.length === 0) return 0;

    const users = new Map<string, MailUser>();
    for (const ids of chunkIds(targets)) {
      const { data, error } = await admin
        .from('users')
        .select('id, email, name, locale')
        .in('id', ids)
        .returns<MailUser[]>();
      if (error) throw new Error(`users: ${error.message}`);
      for (const user of data ?? []) users.set(user.id, user);
    }
    // In the league's order, and only the ones with an address.
    const toMail = targets.flatMap((id) => {
      const user = users.get(id);
      return user?.email ? [{ ...user, email: user.email }] : [];
    });

    const results = await Promise.allSettled(
      toMail.map((user) =>
        sendLeagueRoundNotification({
          to: user.email,
          playerFirstName: firstName(user.name),
          kind,
          payload,
          locale: user.locale,
          ...(summary ? { summary } : {}),
        }),
      ),
    );
    let mailed = 0;
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`[${LOG_PREFIX}] ${kind} mail to ${toMail[i]!.id} failed`, r.reason);
      } else {
        mailed += 1;
      }
    });
    return mailed;
  } catch (err) {
    console.error(`[${LOG_PREFIX}] ${kind} mail failed`, { roundId: payload.round_id, err });
    return 0;
  }
}
