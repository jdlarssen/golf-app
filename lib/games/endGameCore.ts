import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { revalidateTag } from 'next/cache';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { persistResultSummaries } from '@/lib/games/persistResultSummaries';
import { persistScoreDifferentials } from '@/lib/games/persistScoreDifferentials';
import { notifyAchievementUnlocks } from '@/lib/games/notifyAchievementUnlocks';
import { generateAndPersistRoundReport } from '@/lib/games/generateRoundReport';
import { finishDerivedGames } from '@/lib/games/syncDerivedGamesStatus';
import { sendGameFinishedNotification } from '@/lib/mail/gameFinishedNotification';
import { buildGameFinishedRecipients } from '@/lib/mail/gameFinishedRecipients';
import { notifyPlayersGameFinished } from '@/lib/notifications/events';
import { logAdminEvent } from '@/lib/admin/auditLog';
import { firstName } from '@/lib/firstName';
import type { GameStatus } from '@/lib/games/status';
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';
import type { HoleSegment } from '@/lib/scoring';

/**
 * Actor context the finish pipeline needs for audit-logging. `name` is the
 * caller-resolved display name (already trimmed with its role-fallback applied).
 */
export type EndGameActor = { id: string; name: string };

/**
 * One LD/CTP side-tournament winner to persist as part of the finish (#1488,
 * K1). Upserted on the `(game_id, category, position)` PK, so a re-run
 * overwrites the previous pick. `winner_user_id` is `null` for a slot the
 * organiser explicitly left empty («ingen vinner»).
 */
export type EndGameSideWinner = {
  category: 'longest_drive' | 'closest_to_pin';
  position: 1 | 2;
  winner_user_id: string | null;
};

export type EndGameCoreOptions = {
  /**
   * «Avslutt likevel»-rømningen (#375): players who never submitted are
   * skipped instead of blocking the finish. Their `submitted_at` stays null.
   * The peer-approval gate is NEVER relaxed by this (that lock is #360's).
   */
  allowMissing?: boolean;
  /**
   * When true, the per-game reveal signals — the in-app `game_finished`
   * notification and the «Resultatet er klart»-mail — are suppressed (#1501).
   * The cup-avslutning fires ONE `cupFinishedNotification` as the reveal
   * signal instead, so each finished match staying silent avoids N per-match
   * mails/varsler. All data-persistence steps (result summaries, differentials,
   * achievements, round report, derived-game finish) still run — only the two
   * result-reveal notifications are held back.
   */
  suppressPerGameNotifications?: boolean;
  /**
   * Side-tournament (LD/CTP) winners to upsert (#1488, K1). Persisted AFTER
   * player validation and BEFORE the status flip, so a partial failure leaves
   * the game `active` and returns reason `'db_winners'` — the organiser can
   * retry. Idempotent on the `(game_id, category, position)` PK. Empty/omitted
   * → the winner step is skipped entirely (ordinary single-game finish).
   */
  sideWinners?: EndGameSideWinner[];
  /**
   * Extra fields merged into the `game.finished` audit-log payload (#1488, K1).
   * The side-winners caller passes `{ sideTournament: true, sideWinners }` so
   * the audit trail matches the old inline action byte-for-byte.
   */
  auditExtras?: Record<string, unknown>;
  /**
   * Log-prefix + notify context (#1488, K3). Default `'endGame'`; the
   * side-winners wrapper passes `'endGameWithSideWinners'`. Used in every
   * `console.error` prefix in this pipeline AND as the context parameter to
   * `notifyPlayersGameFinished`, so Vercel logs still tell the two finish
   * entry points apart.
   */
  logContext?: string;
};

export type EndGameCoreResult =
  | { ok: true; gameName: string }
  | {
      ok: false;
      reason:
        | 'not_active'
        | 'no_players'
        | 'not_all_submitted'
        | 'not_all_approved'
        | 'db_winners'
        | 'db_finish';
    };

/**
 * The callable core of the admin/creator «avslutt spill»-pipeline, extracted
 * from the `endGame` server action (#1501) so the cup one-tap finish can drive
 * the REAL finish per host match instead of duplicating the pipeline (bug-
 * prevention trap #4: one rule, one home).
 *
 * Contract vs. the old inline body:
 *  - Returns a result instead of redirecting — the caller maps it to whatever
 *    it needs (`endGame` → redirect; `finishTournament` → collect + banner).
 *  - Takes the Supabase client explicitly: `endGame` passes the request-scoped
 *    client (writes under the creator-UPDATE RLS, migration 0071); the cup path
 *    passes the admin client because a klubb-styrer isn't the games' creator
 *    (AGENTS.md trap #3 — authz is deliberate, not inherited; the cup route is
 *    gated by `requireAdminOrClubAdminOfCup` before this ever runs).
 *  - Takes the actor explicitly (audit log) and gates the two reveal
 *    notifications behind `suppressPerGameNotifications`.
 *  - #1488 (K1): also absorbs the former `endGameWithSideWinners` twin via
 *    `sideWinners` (upserted before the flip), `auditExtras` (merged into the
 *    audit payload) and `logContext` (log-prefix + notify context). The
 *    side-tournament action is now a thin wrapper: it parses the winner form
 *    and maps results to redirects, this is the single finish pipeline.
 *
 * Everything else — query order, derived-game fan-out, all the best-effort
 * persistence, the cache revalidation — is byte-identical to the old `endGame`
 * body, so the thin `endGame` wrapper stays behaviourally unchanged.
 */
export async function endGameCore(
  supabase: SupabaseClient<Database>,
  gameId: string,
  actor: EndGameActor,
  options: EndGameCoreOptions = {},
): Promise<EndGameCoreResult> {
  const {
    allowMissing = false,
    suppressPerGameNotifications = false,
    sideWinners,
    auditExtras,
    logContext = 'endGame',
  } = options;

  // Verify game is active. Inkluderer game_mode + mode_config + course_id
  // slik at vi kan bygge mode-aware completion-mail uten å re-fetche game.
  // #1441: hole_segment også — persistResultSummaries trenger den for at et
  // segment-HOST-spills (front9/back9) eget resultatsammendrag skal regnes
  // over de riktige 9 hullene, ikke alle 18.
  const { data: game } = await supabase
    .from('games')
    .select(
      'id, name, status, require_peer_approval, course_id, game_mode, mode_config, hole_segment',
    )
    .eq('id', gameId)
    .single<{
      id: string;
      name: string;
      status: GameStatus;
      require_peer_approval: boolean;
      course_id: string;
      game_mode: GameMode;
      mode_config: GameModeConfig;
      hole_segment: HoleSegment;
    }>();
  if (!game || game.status !== 'active') {
    return { ok: false, reason: 'not_active' };
  }

  // Verify every player has submitted; if require_peer_approval, every
  // submission must also be approved. Also collect user_id + email + name
  // her so we can fire både in-app `game_finished`-varsler (user_id) og
  // «Resultatet er klart»-mail (email/name) etter status-flippen uten
  // ekstra DB-runde.
  const { data: players } = await supabase
    .from('game_players')
    .select(
      'user_id, submitted_at, approved_at, withdrawn_at, users!game_players_user_id_fkey(email, name)',
    )
    .eq('game_id', gameId)
    .returns<
      {
        user_id: string;
        submitted_at: string | null;
        approved_at: string | null;
        withdrawn_at: string | null;
        users: { email: string | null; name: string | null } | null;
      }[]
    >();

  if (!players || players.length === 0) {
    return { ok: false, reason: 'no_players' };
  }
  for (const p of players) {
    // Withdrawn (WD, #386): out of the ranking entirely — never counts as a
    // missing submission or a pending approval, so they never block the end.
    if (p.withdrawn_at) continue;
    if (!p.submitted_at) {
      // No-show: block by default, but let «avslutt likevel» skip past them.
      // submitted_at stays null — they show as «ikke levert», never a false
      // levering; their registered scores still count in the leaderboard.
      if (!allowMissing) {
        return { ok: false, reason: 'not_all_submitted' };
      }
      continue;
    }
    if (game.require_peer_approval && !p.approved_at) {
      return { ok: false, reason: 'not_all_approved' };
    }
  }

  // #1488 (K1/K2): persist LD/CTP side-tournament winners BEFORE the status
  // flip so a partial failure leaves the game `active` (result `db_winners`)
  // and the organiser can retry. Idempotent on the (game_id, category,
  // position) PK — re-submitting the wizard overwrites. Ordinary finishes pass
  // no `sideWinners`, so this is a no-op for them.
  if (sideWinners && sideWinners.length > 0) {
    const rows = sideWinners.map((w) => ({
      game_id: gameId,
      category: w.category,
      position: w.position,
      winner_user_id: w.winner_user_id,
    }));
    const { error: winnerErr } = await supabase
      .from('game_side_winners')
      .upsert(rows, { onConflict: 'game_id,category,position' });
    if (winnerErr) {
      console.error(`[${logContext}] winners insert failed`, winnerErr);
      return { ok: false, reason: 'db_winners' };
    }
  }

  const endedAt = new Date().toISOString();
  const { error } = await supabase
    .from('games')
    .update({ status: 'finished', ended_at: endedAt })
    .eq('id', gameId);

  if (error) {
    console.error(`[${logContext}] finish status update failed`, error);
    return { ok: false, reason: 'db_finish' };
  }

  // #1441 (D3): fan the finish out to every derived game (back9 singles
  // etc.) in the same operation, including their own result summaries +
  // score differentials. Best-effort — 0 derived games (the vast majority
  // of finishes) is a cheap no-op; a real failure is logged but never
  // blocks the host's own finish, which has already committed above.
  await finishDerivedGames(supabase, gameId, endedAt);

  // #572: beregn og lagre per-spiller-resultatet for avsluttede-spill-kortene.
  // Best-effort — feiler aldri ut av avslutningen (egen try/catch internt).
  // #1441: hole_segment sendes med slik at et segment-HOST-spill (front9/
  // back9) får sitt eget resultat regnet over sine 9 hull, ikke alle 18.
  await persistResultSummaries({
    id: gameId,
    game_mode: game.game_mode,
    mode_config: game.mode_config,
    course_id: game.course_id,
    hole_segment: game.hole_segment,
  });

  // #941: fryser WHS score-differensial per spiller. Best-effort — se
  // persistScoreDifferentials for fullstendig begrunnelse.
  await persistScoreDifferentials(gameId);

  // #947: best-effort bragd-varsel til spillere som låste opp et øyeblikk
  // (hole-in-one/eagle/turkey/snowman) i runden. Feiler aldri ut avslutningen.
  await notifyAchievementUnlocks(gameId);

  // #1008: best-effort AI-rundereferat («Pressetribunen»). Må kjøre FØR
  // mail-blasten lenger ned slik at teksten kan bli med i «Resultatet er
  // klart»-mailen — feiler den (manglende nøkkel, tynn data, SDK-feil)
  // fortsetter avslutningen som i dag, bare uten referat.
  const { report: roundReport } = await generateAndPersistRoundReport(gameId);

  await logAdminEvent({
    actorId: actor.id,
    actorName: actor.name,
    eventType: 'game.finished',
    targetType: 'game',
    targetId: gameId,
    // #1488 (K1): `auditExtras` carries the side-winners caller's
    // `{ sideTournament: true, sideWinners }` so the audit payload is
    // byte-identical to the old inline action.
    payload: { gameName: game.name, ...auditExtras },
  });

  // #1501: cup-avslutningen undertrykker de to reveal-signalene per kamp —
  // cup-mailen er reveal-signalet der. Vanlig enkeltspill-avslutning kjører
  // begge som før.
  if (!suppressPerGameNotifications) {
    // Best-effort in-app `game_finished`-varsel til hver deltaker. Loopen fyres
    // parallelt med mail-blasten lenger ned. Phase 4-gating: aktive spillere
    // (last_seen_at < 5 min) får kun in-app; off-app-spillere får mail som
    // backup. Notify-feil → ikke send mail (samme rasjonale som inni notify()).
    const sendMailByUserId = await notifyPlayersGameFinished(
      players,
      { id: gameId, name: game.name },
      logContext,
    );

    // Best-effort: send "Resultatet er klart"-mail kun til off-app-spillere.
    // Failures er loggført men aborter aldri actionen — leaderboardet er
    // tilgjengelig in-app uansett, og admin kan re-trigge ved behov (ingen
    // resend-flyt finnes ennå, men DB er source of truth).
    //
    // Mode-aware payload: for stableford regner helperen ut leaderboard og
    // legger per-spiller rank/poeng på hver mottaker; for best-ball returnerer
    // den kun userId/email/name (mailen bruker da default nøytral copy).
    const recipients = await buildGameFinishedRecipients(supabase, gameId, {
      course_id: game.course_id,
      game_mode: game.game_mode,
      mode_config: game.mode_config,
    });
    const mailRecipients = recipients.filter(
      (r) => sendMailByUserId.get(r.userId) === true,
    );
    if (mailRecipients.length > 0) {
      const results = await Promise.allSettled(
        mailRecipients.map((r) =>
          sendGameFinishedNotification({
            to: r.email,
            playerFirstName: firstName(r.name),
            gameName: game.name,
            gameId,
            mode: r.mode,
            locale: r.locale,
            roundReport,
          }),
        ),
      );
      for (const r of results) {
        if (r.status === 'rejected') {
          console.error(`[${logContext}] game-finished mail failed`, r.reason);
        }
      }
    }
  }

  revalidateTag(`game-${gameId}`, 'max');
  revalidatePath(`/admin/games/${gameId}`);
  revalidatePath(`/games/${gameId}`);
  return { ok: true, gameName: game.name };
}
