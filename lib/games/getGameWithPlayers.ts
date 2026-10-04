import 'server-only';
import { unstable_cache } from 'next/cache';
import { getAdminClient } from '@/lib/supabase/admin';
import type { SideCategoryId } from '@/lib/scoring/sideTournamentConfig';
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';
import type { HoleSegment } from '@/lib/scoring';
import type { GameStatus } from './status';
import type { TeeBoxRatings, TeeGender } from './teeRating';
import type { ScoreVisibility } from './visibility';

/**
 * Tag-cached fetch for the `games` + `game_players` rows the hull-page needs
 * on every hull-bytte (hole-navigation).
 *
 * ## Why cache this?
 *
 * The hull-page (`app/games/[id]/holes/[holeNumber]/page.tsx`) is the
 * hottest read-path in the app — every tap on the carousel nav re-renders
 * it server-side. Profiling showed ~440ms median tail-latency was spent in
 * the first Promise.all wave: fetching `games`, `game_players` and a
 * scoreCount. The first two never change during a hole-bytte, so they
 * belong in a cross-request cache; only the per-hole scores need a fresh
 * round-trip. Caching cuts hull-bytte latency by ~300ms.
 *
 * Only `games` + `game_players` (with the joined user name/nickname) are
 * cached here. `scores` are NOT cached — they change too frequently and
 * the hull-page needs the latest values for the current hole anyway.
 *
 * ## Why the admin client?
 *
 * Next.js's request-scoped APIs (`cookies()`, `headers()`) cannot be called
 * inside `unstable_cache` callbacks, so the cached function cannot use the
 * cookie-based `getServerClient()`. We use the service-role `getAdminClient()`
 * which bypasses RLS. Authorization is enforced at the call-site instead:
 * the hull-page reads `{ game, players }` and `notFound()`s if the current
 * user isn't in `players`. This matches the existing hull-page logic
 * (`me = allPlayers.find(...)`) — no behavior change, just a different
 * place where authz is enforced.
 *
 * `me = players.find(...)` alone lets a player into a draft (#2445): a draft
 * is hidden from everyone but its organiser and global admins. The caller
 * also needs the draft gate, an RLS read of the game with the user's client
 * (game home's `joinsRes`) or an explicit `status === 'draft'` check.
 *
 * ## Cache invalidation
 *
 * Tag convention: `game-${id}`. The 15-minute `revalidate` is a safety net
 * for edge cases (e.g., admin edits a row directly in the Supabase
 * dashboard). The primary invalidation mechanism is `expireGameCache(id)`
 * (`lib/games/expireGameCache.ts`, immediate expiry — #2068) in the mutations
 * that touch `games` or `game_players`, for example:
 *
 *  - `app/games/[id]/submit/actions.ts` — submitScorecard
 *  - `app/games/[id]/approve/actions.ts` — approveScorecard, rejectScorecard
 *  - `app/admin/games/[id]/actions.ts` — startScheduledGameAction,
 *    adminApproveScorecard, endGame, reopenScorecard, reopenGame,
 *    adminWithdrawPlayer, adminUndoWithdraw
 *  - `app/admin/games/[id]/avslutt/actions.ts` — endGameWithSideWinners
 *  - `app/admin/games/[id]/edit/actions.ts` — saveDraft, publishFromDraft,
 *    updateScheduled (these all touch `games` + replace the `game_players`
 *    roster wholesale)
 *
 * ## Stale-tolerance trade-off: user profile edits
 *
 * The cached payload joins `users.name` and `users.nickname`. Invalidating
 * the cache on every user-profile edit would require fanning out across
 * every game the player is in (potentially many rows). Instead, we accept
 * brief staleness for nickname/name changes — they self-heal on the next
 * cache miss within the 15-min revalidate window. The trade-off is worth
 * it: profile edits are rare, nickname-staleness during an active round is
 * a low-impact visual glitch, and the alternative (cascading invalidation)
 * adds material complexity.
 */

export type GameForHole = {
  id: string;
  name: string;
  status: GameStatus;
  /** Owner (#427): the user who created the game. Drives the creator-facing
   *  «Avslutt spill»-affordance on game-home. Immutable after creation, so
   *  caching it under the `game-${id}` tag is safe. */
  created_by: string | null;
  /**
   * #1007: non-null when this game is a match inside a cup/tournament.
   * Immutable after creation (cup-matches are never re-parented to a
   * different tournament), so caching it under the `game-${id}` tag is
   * safe. Drives the revansje-CTA gate on game-home (cup matches don't get
   * a standalone "run it back" button — the cup itself owns the rematch).
   */
  tournament_id: string | null;
  /** #1007: non-null when this game is a liga-round. Same immutability +
   *  gating rationale as `tournament_id` above. */
  league_round_id: string | null;
  /** #1007: non-null when this game belongs to a klubb. Immutable after
   *  creation. Used to derive the revansje-flyten's `initialIntent`
   *  ('klubb' + this id) instead of re-deriving intent from format tables. */
  group_id: string | null;
  course_id: string;
  tee_box_id: string;
  score_visibility: ScoreVisibility;
  require_peer_approval: boolean;
  scheduled_tee_off_at: string | null;
  side_tournament_enabled: boolean;
  side_ld_count: number;
  side_ctp_count: number;
  // v1.2.0 — per-spill kategori-overstyringer. Tomt array = Full pakke
  // (alle aktive). DB-CHECK i 0026 garanterer at hver entry er en gyldig
  // SideCategoryId, så vi caster trygt på input-side.
  side_disabled_categories: SideCategoryId[] | null;
  /**
   * Spillmodus-discriminator fra `games.game_mode`. DB-CHECK garanterer at
   * verdien er én av kjente moduser, men vi caster trygt på input-side fordi
   * Supabase-typene returnerer `string` (CHECK-constraints projiseres ikke).
   * Konsumenter switcher på dette via `lib/scoring/index.ts` mode-router.
   */
  game_mode: GameMode;
  /**
   * Modus-spesifikk konfig fra `games.mode_config` (JSONB). Innholdets shape
   * dikteres av `game_mode` — se `GameModeConfig`-union for varianter. Lest
   * av scoring/leaderboard-konsumenter; ikke modifisert etter publisering.
   */
  mode_config: GameModeConfig;
  /**
   * Foursomes matchplay (#218): hvem på side 1 teer ut på odd-hull. NULL =
   * ikke valgt ennå (banner vises på hull 1). Setter via
   * `setFoursomesTeeStarter` server-action. Bare meningsfull for
   * `game_mode === 'foursomes_matchplay'`.
   */
  foursomes_side1_tee_starter_user_id: string | null;
  /** Som over, for side 2. */
  foursomes_side2_tee_starter_user_id: string | null;
  // The game's single tee carries up to three independent rating-sets
  // (mens/ladies/juniors). Each player picks which set applies via their
  // tee_gender flag. Not nullable — games always have a tee assigned at
  // publish time.
  tee_box: TeeBoxRatings & { name: string };
  /**
   * #1008: AI-generated match report ("Fra pressetribunen"), written once by
   * `generateAndPersistRoundReport` inside the two finish actions. NULL until
   * the game is finished, and stays NULL if generation was skipped (no
   * `ANTHROPIC_API_KEY`, thin data, or an SDK failure) or after `reopenGame`
   * clears it. Rendered by `RoundReportCard` in every format renderer's
   * finished branch.
   */
  round_report: string | null;
  /**
   * #1049: startkontingent (kr) per spiller + betalingsmåte (Vipps-nr/lenke).
   * 0 = ingen kontingent. Drives betal-oppfordringen (`PaymentInfo`) på
   * spill-hjem til spillerens `paid_at` er satt.
   */
  entry_fee_kr: number;
  payment_link: string | null;
  /**
   * #1051: premiebord (jsonb). Rå-verdi — konsumenter kaller `safeParsePrizes`
   * for å få en typet `GamePrize[]`. Driver PremiebordCard (spill-hjem/signup),
   * SponsorStrip (tavle-flatene) og PrizeAwardsCard (avsluttet spill). Valgfri så
   * literal-konstruktører (f.eks. demoen #1042) ikke må sette den — safeParse
   * tolererer undefined → [].
   */
  prizes?: unknown;
  /**
   * #1441 (splittet cup-dag): limits the game to holes 1-9 ('front9'), 10-18
   * ('back9'), or the full round (default 'full'). DB-CHECK (migration 0151,
   * widened by 0152) constrains the column to this exact union — cast trusted
   * on input-side like `game_mode` above, since Supabase's generated types
   * project CHECK-constrained columns as plain `string`.
   */
  hole_segment: HoleSegment;
  /**
   * #1441: non-null when this game is DERIVED from another game in the same
   * cup bundle (e.g. a back9 singles match derived from the back9 best-ball
   * host). A derived game has its own `game_players` but NO own scores —
   * every score-reading consumer must fetch from `source_game_id ?? id`
   * instead. The app layer (not the DB) guards against score-entry on a
   * derived game — see the hole/scorecard/submit routes.
   */
  source_game_id: string | null;
};

export type PlayerForHole = {
  user_id: string;
  team_number: number;
  flight_number: number;
  course_handicap: number | null;
  submitted_at: string | null;
  /**
   * #2200: who marked the card delivered (trigger-filled, 0191). Differs from
   * `user_id` when the one keeping score delivered it; null on cards
   * delivered before 0191 and whenever `submitted_at` is null.
   */
  submitted_by_user_id: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  /** WD / «trekk spiller» (#386): non-null = player has been withdrawn. */
  withdrawn_at: string | null;
  /**
   * #2358: who set `withdrawn_at`. The player may undo only their own
   * withdrawal; one the organiser or an admin set is theirs to undo.
   */
  withdrawn_by_user_id: string | null;
  /**
   * #463: non-null = deltakelse bekreftet. null = lagt til av arrangør, ikke
   * bekreftet ennå («Ikke bekreftet»-badge). Ikke en sperre — scorene teller.
   */
  accepted_at: string | null;
  /**
   * #1049: non-null = arrangøren har huket av at spilleren har betalt
   * startkontingenten. null = ikke betalt. Skjuler betal-oppfordringen på
   * spill-hjem når satt. Kun arrangør (admin/creator) kan sette den.
   */
  paid_at: string | null;
  // Hole entry only renders when status is 'active' or 'finished'; pending
  // invitees can't reach those states: the start gate waits for every
  // profile (#2441). Typed nullable to match the DB column, and a scheduled
  // game may hold a pending invitee.
  // #1009: is_guest driver «Gjest»-chipen på arrangør-flatene og gater
  // claim-seksjonen på spillere-siden. E-post holdes bevisst UTE av denne
  // delte payloaden (#435-disiplinen) — claim-UI-et gjør sin egen målrettede
  // e-post-oppslag bak requireAdminOrCreator.
  users: { name: string | null; nickname: string | null; is_guest: boolean } | null;
  // Which rating-set on the game's tee applies to this player.
  tee_gender: TeeGender;
};

export type GameWithPlayers = {
  game: GameForHole;
  players: PlayerForHole[];
};

/**
 * The two selects behind `GameWithPlayers`. They are part of the cache key in
 * `getGameWithPlayers`, so any change to them gives a fresh cache entry.
 */
export const GAME_SELECT =
  'id, name, status, created_by, tournament_id, league_round_id, group_id, course_id, tee_box_id, score_visibility, require_peer_approval, scheduled_tee_off_at, side_tournament_enabled, side_ld_count, side_ctp_count, side_disabled_categories, game_mode, mode_config, foursomes_side1_tee_starter_user_id, foursomes_side2_tee_starter_user_id, round_report, entry_fee_kr, payment_link, prizes, hole_segment, source_game_id, tee_box:tee_boxes!games_tee_box_id_fkey(name, slope_mens, course_rating_mens, par_total_mens, slope_ladies, course_rating_ladies, par_total_ladies, slope_juniors, course_rating_juniors, par_total_juniors)';

export const PLAYERS_SELECT =
  'user_id, team_number, flight_number, course_handicap, submitted_at, submitted_by_user_id, approved_at, rejection_reason, withdrawn_at, withdrawn_by_user_id, accepted_at, paid_at, tee_gender, users!game_players_user_id_fkey(name, nickname, is_guest)';

async function fetchGameWithPlayers(
  id: string,
): Promise<GameWithPlayers | null> {
  const supabase = getAdminClient();
  const [gameRes, playersRes] = await Promise.all([
    supabase
      .from('games')
      .select(GAME_SELECT)
      .eq('id', id)
      .maybeSingle<GameForHole>(),
    supabase
      .from('game_players')
      .select(PLAYERS_SELECT)
      .eq('game_id', id)
      .returns<PlayerForHole[]>(),
  ]);
  // Error ≠ absence (#1441 e2e post-mortem): a transient query failure (e.g.
  // a fetch aborted by Next's dev render-restart, or a network blip) must
  // THROW — returning null here would let unstable_cache store the null under
  // `game-${id}` and serve a clean 404 to every consumer for up to 15 min.
  // Thrown errors are never cached. Only a genuine 0-row result (maybeSingle:
  // data null, error null) means "game does not exist" → null → notFound().
  if (gameRes.error) throw gameRes.error;
  if (!gameRes.data) return null;
  if (playersRes.error) throw playersRes.error;
  return { game: gameRes.data, players: playersRes.data ?? [] };
}

/**
 * Fetch `{ game, players }` for a given game id from the tag-cached layer.
 *
 * Returns `null` ONLY if the game genuinely does not exist — 0 rows, no
 * error (call-sites should `notFound()`). Throws on any query error (games
 * or game_players) so the page error boundary can render — falling back
 * silently would hide real outages, and a null returned on a transient
 * error would be CACHED under the game tag and 404 every consumer.
 */
export async function getGameWithPlayers(
  id: string,
): Promise<GameWithPlayers | null> {
  // The key carries both select strings (#2224). unstable_cache keys on the
  // callback's source and keyParts, not on the shape it returns, so a stale
  // entry used to come back under the new type with the added columns
  // `undefined` until someone bumped the key by hand (#1007 to #2358). The rows
  // are returned as fetched, so the selects decide the shape completely.
  return unstable_cache(
    () => fetchGameWithPlayers(id),
    ['gwp', GAME_SELECT, PLAYERS_SELECT, id],
    {
      tags: [`game-${id}`],
      revalidate: 900,
    },
  )();
}
