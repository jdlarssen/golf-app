'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { expectAffected } from '@/lib/supabase/affectedRows';
import {
  requireAdmin,
  requireAdminOrClubAdmin,
  requireAdminOrClubAdminOfLeague,
} from '@/lib/admin/auth';
import { acceptedAtForActor } from '@/lib/games/participantAcceptance';
import { isTeeOffInPast, parseOsloDateTimeLocal } from '@/lib/games/gamePayload';
import { generateRounds } from './generateRounds';
import { ligaBasePath } from './ligaPaths';
import { isPointsBasedFormat } from './flightFormat';
import { startLeagueRoundFlightCore } from './startLeagueRoundFlightCore';
import type { TablesUpdate } from '@/lib/database.types';
import { parseSimSettings, roundOverrideFrom, type SimSettings } from './simSettings';
import type {
  CourseScope,
  LeagueFormat,
  LeagueScoring,
  MissedRoundPolicy,
  PenaltyKind,
  RoundFrequency,
  StandingsModel,
} from './types';

const NAME_RE = /^.{1,80}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const str = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim();

type ServerClient = Awaited<ReturnType<typeof getServerClient>>;

/**
 * #2223: compensating deletes for a row the flow just wrote. An error or 0 rows
 * leaves the orphan behind (a draft league, or a flight game without players),
 * so both are logged with the id. The caller's answer is unchanged.
 */
async function rollbackDraftLeague(supabase: ServerClient, leagueId: string): Promise<void> {
  const { data, error } = await supabase.from('leagues').delete().eq('id', leagueId).select('id');
  if (error || (data ?? []).length === 0) {
    console.error('[league] createLeagueDraft rollback failed', { leagueId, error });
  }
}

// ── create ─────────────────────────────────────────────────────────────────

export type LeagueActionError = { error: string };

/**
 * Creates a draft league + its generated rounds + participant list.
 *
 * Authorization follows the `group_id` field (#480):
 *  - `group_id` set → klubb-liga: caller must be the club's owner/admin (or a
 *    global admin); the league is scoped to that club and participants are
 *    filtered to actual club members.
 *  - `group_id` empty → frittstående liga: global-admin-only (democratized
 *    standalone creation is a separate issue).
 *
 * Returns `{ error }` on validation/DB failure; redirects to the detail page on
 * success. Field contract (the create wizard posts these):
 *  name, season_start, season_end (YYYY-MM-DD), standings_model,
 *  missed_round_policy, penalty_kind, penalty_fixed_over_par, course_scope,
 *  course_id, tee_box_id, frequency, player_ids (JSON array of user ids),
 *  group_id (optional club UUID), scoring ('net' | 'gross', #2638),
 *  is_simulator ('true'), sim_<key> (the league's default round settings).
 */
export async function createLeagueDraft(formData: FormData): Promise<LeagueActionError> {
  const supabase = await getServerClient();

  const rawGroupId = str(formData, 'group_id');
  let userId: string;
  let groupId: string | null = null;
  if (rawGroupId) {
    ({ userId } = await requireAdminOrClubAdmin(supabase, rawGroupId));
    groupId = rawGroupId;
  } else {
    ({ userId } = await requireAdmin(supabase));
  }

  const name = str(formData, 'name');
  const seasonStart = str(formData, 'season_start');
  const seasonEnd = str(formData, 'season_end');
  const format = (str(formData, 'format') || 'stroke') as LeagueFormat;
  // #2638: arrangøren velger netto (standard) eller brutto. «Begge» tilbys
  // ikke (#1144 ryddet det bort), så hvitelisten er de to; alt annet, også
  // 'both' i en håndlaget POST, blir netto. Låses når ligaen startes (0212).
  const scoringRaw = str(formData, 'scoring');
  const scoring: LeagueScoring = scoringRaw === 'gross' ? 'gross' : 'net';
  // #2638: simulatorliga. Innstillingene er ligaens standard for rundene.
  const isSimulator = str(formData, 'is_simulator') === 'true';
  const standingsModel = (str(formData, 'standings_model') || 'total') as StandingsModel;
  const missedPolicy = (str(formData, 'missed_round_policy') || 'penalty') as MissedRoundPolicy;
  // Poeng-ligaer bruker ikke straffescore-type (uteblitt = 0 poeng), så lås den
  // til default — wizard skjuler valget for stableford. Holder penaltyFixed = null.
  const penaltyKind = (
    isPointsBasedFormat(format) ? 'worst_plus_one' : str(formData, 'penalty_kind') || 'worst_plus_one'
  ) as PenaltyKind;
  const penaltyFixedRaw = str(formData, 'penalty_fixed_over_par');
  const bestNCountRaw = str(formData, 'best_n_count');
  const courseScope = str(formData, 'course_scope') as CourseScope;
  const courseId = str(formData, 'course_id') || null;
  const teeBoxId = str(formData, 'tee_box_id') || null;
  const frequency = (str(formData, 'frequency') || 'monthly') as RoundFrequency;

  if (!NAME_RE.test(name)) return { error: 'name' };
  if (!DATE_RE.test(seasonStart) || !DATE_RE.test(seasonEnd)) return { error: 'dates' };
  if (seasonEnd < seasonStart) return { error: 'dates' };
  if (
    standingsModel !== 'total' &&
    standingsModel !== 'average' &&
    standingsModel !== 'best_n' &&
    standingsModel !== 'points'
  ) {
    return { error: 'standings_model' };
  }
  // Defense-in-depth: validate the enum-backed fields rather than trusting the
  // form (the DB CHECK is the final backstop, but fail clean here).
  if (format !== 'stroke' && format !== 'stableford' && format !== 'modified_stableford') {
    return { error: 'format' };
  }
  if (missedPolicy !== 'penalty' && missedPolicy !== 'must_play_all') return { error: 'missed_round_policy' };
  if (penaltyKind !== 'worst_plus_one' && penaltyKind !== 'fixed') return { error: 'penalty_kind' };
  if (
    courseScope !== 'single_course_single_tee' &&
    courseScope !== 'single_course' &&
    courseScope !== 'multi_course'
  ) {
    return { error: 'course_scope' };
  }
  // Course-scope ↔ course/tee consistency (mirrors the DB CHECK).
  if (courseScope === 'single_course_single_tee' && (!courseId || !teeBoxId)) return { error: 'course' };
  if (courseScope === 'single_course' && (!courseId || teeBoxId)) return { error: 'course' };
  if (courseScope === 'multi_course' && (courseId || teeBoxId)) return { error: 'course' };

  let penaltyFixed: number | null = null;
  if (penaltyKind === 'fixed') {
    penaltyFixed = Number(penaltyFixedRaw);
    if (!Number.isFinite(penaltyFixed)) return { error: 'penalty' };
  }

  let bestNCount: number | null = null;
  if (standingsModel === 'best_n') {
    bestNCount = Number.parseInt(bestNCountRaw, 10);
    if (!Number.isInteger(bestNCount) || bestNCount < 1) return { error: 'best_n' };
  }

  let simSettings: SimSettings | null = null;
  if (isSimulator) {
    const parsedSettings = parseSimSettings(formData);
    if (!parsedSettings.ok) return { error: 'sim_settings' };
    simSettings = parsedSettings.settings;
  }

  let playerIds: string[] = [];
  try {
    const parsed = JSON.parse(str(formData, 'player_ids') || '[]');
    if (Array.isArray(parsed)) playerIds = parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return { error: 'players' };
  }

  // #924: block creating a league whose entire season is already over (the last
  // generated window closed >grace in the past) — every round would be
  // unplayable (startLeagueRoundFlight → outside_window), almost always a
  // mistyped year. Mid-season setup (past start, future end) stays legal: only
  // the last window matters. 'custom' frequency generates no windows → no check
  // (rounds are added later via the guarded addLeagueRound). Computed before any
  // insert so the reject leaves nothing to roll back. Reuses the #902 helper +
  // grace (one home for the rule). The window-close is the "playable-until"
  // instant. The windows are reused for the round insert below.
  const windows = generateRounds(seasonStart, seasonEnd, frequency);
  if (windows.length > 0 && isTeeOffInPast(windows[windows.length - 1].closes_at)) {
    return { error: 'season_over' };
  }

  const { data: league, error: insErr } = await supabase
    .from('leagues')
    .insert({
      name,
      season_start: seasonStart,
      season_end: seasonEnd,
      format,
      scoring,
      standings_model: standingsModel,
      missed_round_policy: missedPolicy,
      penalty_kind: penaltyKind,
      penalty_fixed_over_par: penaltyFixed,
      best_n_count: bestNCount,
      course_scope: courseScope,
      course_id: courseId,
      tee_box_id: teeBoxId,
      created_by: userId,
      group_id: groupId,
      is_simulator: isSimulator,
      sim_settings: simSettings,
    })
    .select('id')
    .single();
  if (insErr || !league) {
    console.error('[league] createLeagueDraft insert failed', { error: insErr });
    return { error: 'insert_failed' };
  }
  const leagueId = (league as { id: string }).id;

  if (windows.length > 0) {
    const roundRows = windows.map((w) => ({
      league_id: leagueId,
      sequence: w.sequence,
      label: `Runde ${w.sequence}`,
      // Resolve which fields the round carries vs inherits, by scope.
      course_id: courseScope === 'multi_course' ? null : courseId,
      tee_box_id: courseScope === 'single_course_single_tee' ? teeBoxId : null,
      opens_at: w.opens_at,
      closes_at: w.closes_at,
      original_closes_at: w.closes_at,
    }));
    const { error: rErr } = await supabase.from('league_rounds').insert(roundRows);
    if (rErr) {
      console.error('[league] createLeagueDraft rounds insert failed', { leagueId, error: rErr });
      // Rull tilbake den allerede committede leagues-raden så en feil her ikke
      // etterlater en foreldreløs draft-liga i /admin/liga (#675). league_rounds
      // + league_players ryddes av FK `on delete cascade` (0080). Speiler
      // rollback-mønsteret i startLeagueRoundFlight.
      await rollbackDraftLeague(supabase, leagueId);
      return { error: 'rounds_failed' };
    }
  }

  // Klubb-liga: behold kun deltakere som faktisk er medlemmer av klubben.
  // Pickeren begrenser allerede til medlemmer, men en manipulert post skal ikke
  // kunne smugle ikke-medlemmer inn (RLS-write er andre forsvarslinje).
  if (groupId && playerIds.length > 0) {
    const { data: memberRows } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId)
      .in('user_id', playerIds);
    const memberSet = new Set((memberRows ?? []).map((r) => r.user_id));
    playerIds = playerIds.filter((id) => memberSet.has(id));
  }

  if (playerIds.length > 0) {
    const draftNow = new Date().toISOString();
    const { error: pErr } = await supabase.from('league_players').insert(
      // #463: oppretters egen rad bekreftes nå; andre deltakere er «Ikke
      // bekreftet» til de selv bekrefter.
      playerIds.map((uid) => ({
        league_id: leagueId,
        user_id: uid,
        accepted_at: acceptedAtForActor(userId, uid, draftNow),
      })),
    );
    if (pErr) {
      console.error('[league] createLeagueDraft players insert failed', { leagueId, error: pErr });
      // Samme rollback som over: ikke la en feilet spiller-insert etterlate en
      // foreldreløs leagues-rad (+ ev. allerede innsatte league_rounds, som
      // cascade rydder) (#675).
      await rollbackDraftLeague(supabase, leagueId);
      return { error: 'players_failed' };
    }
  }

  // Klubb-liga: en klubb-admin når ikke /admin/liga (global-admin-gatet), så
  // send dem tilbake til klubb-siden der den nye ligaen nå står i «Klubbens
  // ligaer». Frittstående: global admin → liga-styringssiden som før.
  redirect(groupId ? `/klubber/${groupId}` : `/admin/liga/${leagueId}`);
}

// ── admin round + roster management ──────────────────────────────────────────

export async function updateLeagueRound(formData: FormData): Promise<LeagueActionError> {
  const supabase = await getServerClient();
  const roundId = str(formData, 'round_id');
  const leagueId = str(formData, 'league_id');
  if (!roundId || !leagueId) return { error: 'missing' };
  await requireAdminOrClubAdminOfLeague(supabase, leagueId);

  const patch: TablesUpdate<'league_rounds'> = {};
  const label = str(formData, 'label');
  if (label) patch.label = label;
  const courseId = str(formData, 'course_id');
  if (courseId) patch.course_id = courseId;
  const teeBoxId = str(formData, 'tee_box_id');
  if (teeBoxId) patch.tee_box_id = teeBoxId;
  // datetime-local has no offset — it is Oslo wall-clock. Convert to a real
  // UTC instant so gating (Date.now vs new Date(opens_at)) and display agree
  // (#648). Storing the raw string made Postgres read it as naive UTC.
  const opensAt = str(formData, 'opens_at');
  if (opensAt) patch.opens_at = parseOsloDateTimeLocal(opensAt);
  const closesAt = str(formData, 'closes_at');
  if (closesAt) patch.closes_at = parseOsloDateTimeLocal(closesAt);

  if (patch.course_id !== undefined || patch.tee_box_id !== undefined) {
    const refusal = await courseTeeLockRefusal(roundId, leagueId, patch);
    if (refusal) return { error: refusal };
  }

  if (Object.keys(patch).length > 0) {
    // #727: assert the update touched a row; also surfaces real DB errors the
    // bare `if (error)` previously returned without logging (bug-prevention #2).
    try {
      const result = await supabase.from('league_rounds').update(patch).eq('id', roundId).select('id');
      // #2638: the database guard (0215) gives the same code as the check above.
      if (result.error?.message?.includes(ROUND_LOCKED_MESSAGE)) return { error: 'round_settings_locked' };
      expectAffected(result, 'updateLeagueRound');
    } catch (err) {
      console.error('[league] updateLeagueRound failed', { roundId, err });
      return { error: 'update_failed' };
    }
  }
  revalidatePath(`/admin/liga/${leagueId}`);
  revalidatePath(`/liga/${leagueId}`);
  return { error: '' };
}

// ── simulator round settings (#2638) ───────────────────────────────────────────

const ROUND_LOCKED_MESSAGE = 'locked once a player has started the round';

/**
 * #2638: in a simulator league a started round keeps its course and tee. The
 * settings card shows the round's tee, so a change after the first start
 * would show a tee the flights did not play. Regular leagues are left as they
 * are, so an organiser there can still correct a wrong tee (the orchestrator's
 * choice). Refuses only an actual change; reads with the admin client because
 * the organiser cannot see other players' flights under games RLS. The
 * database guard (guard_league_rounds_sim_settings_lock, 0215) is the last
 * line and gives the same code.
 */
async function courseTeeLockRefusal(
  roundId: string,
  leagueId: string,
  patch: TablesUpdate<'league_rounds'>,
): Promise<'round_settings_locked' | 'update_failed' | null> {
  const admin = getAdminClient();
  const [leagueRes, roundRes, flightsRes] = await Promise.all([
    admin.from('leagues').select('is_simulator').eq('id', leagueId).maybeSingle(),
    admin.from('league_rounds').select('course_id, tee_box_id').eq('id', roundId).maybeSingle(),
    admin.from('games').select('id', { count: 'exact', head: true }).eq('league_round_id', roundId),
  ]);
  if (leagueRes.error || roundRes.error || flightsRes.error || flightsRes.count === null) {
    console.error('[league] updateLeagueRound lock check failed', {
      roundId,
      leagueError: leagueRes.error,
      roundError: roundRes.error,
      flightsError: flightsRes.error,
    });
    return 'update_failed';
  }
  if (!leagueRes.data?.is_simulator || !roundRes.data || flightsRes.count === 0) return null;
  const changes =
    (patch.course_id !== undefined && patch.course_id !== roundRes.data.course_id) ||
    (patch.tee_box_id !== undefined && patch.tee_box_id !== roundRes.data.tee_box_id);
  return changes ? 'round_settings_locked' : null;
}

/** The league's two doors, so both management pages show the change. */
function revalidateLeague(leagueId: string, groupId: string | null): void {
  revalidatePath(`/admin/liga/${leagueId}`);
  if (groupId) revalidatePath(`/klubber/${groupId}/liga/${leagueId}`);
  revalidatePath(`/liga/${leagueId}`);
}

/**
 * The organiser changes the league's DEFAULT round settings (#2638). Allowed
 * at any time: the change reaches only rounds nobody has started, because a
 * started round was frozen at its first start (startLeagueRoundFlightCore).
 * Same access as updateLeagueRound; RLS on `leagues` is the real gate.
 */
export async function updateLeagueSimSettings(formData: FormData): Promise<LeagueActionError> {
  const supabase = await getServerClient();
  const leagueId = str(formData, 'league_id');
  if (!leagueId) return { error: 'missing' };
  const { groupId } = await requireAdminOrClubAdminOfLeague(supabase, leagueId);

  const { data: league, error: readErr } = await getAdminClient()
    .from('leagues')
    .select('is_simulator')
    .eq('id', leagueId)
    .maybeSingle();
  if (readErr || !league) return { error: 'not_found' };
  if (!league.is_simulator) return { error: 'not_simulator' };

  const parsed = parseSimSettings(formData);
  if (!parsed.ok) return { error: 'sim_settings' };

  try {
    expectAffected(
      await supabase
        .from('leagues')
        .update({ sim_settings: parsed.settings })
        .eq('id', leagueId)
        .select('id'),
      'updateLeagueSimSettings',
    );
  } catch (err) {
    console.error('[league] updateLeagueSimSettings failed', { leagueId, err });
    return { error: 'update_failed' };
  }
  revalidateLeague(leagueId, groupId);
  return { error: '' };
}

/**
 * The organiser adjusts ONE round (#2638): «Juster for denne runden» stores
 * only the values that differ from the league default; `reset=true` («Tilbake
 * til standard») stores null. A round a player has started is locked
 * (`round_settings_locked`), so nobody in a round plays under other settings
 * than the others. The check here reads every flight with the admin client;
 * the database guard (guard_league_rounds_sim_settings_lock, 0212) is the last
 * line and gives the same code.
 */
export async function updateRoundSimSettings(formData: FormData): Promise<LeagueActionError> {
  const supabase = await getServerClient();
  const leagueId = str(formData, 'league_id');
  const roundId = str(formData, 'round_id');
  if (!leagueId || !roundId) return { error: 'missing' };
  const { groupId } = await requireAdminOrClubAdminOfLeague(supabase, leagueId);

  const admin = getAdminClient();
  const [leagueRes, flightsRes] = await Promise.all([
    admin.from('leagues').select('is_simulator, sim_settings').eq('id', leagueId).maybeSingle(),
    admin.from('games').select('id', { count: 'exact', head: true }).eq('league_round_id', roundId),
  ]);
  if (leagueRes.error || !leagueRes.data) return { error: 'not_found' };
  if (!leagueRes.data.is_simulator) return { error: 'not_simulator' };
  if (flightsRes.error || flightsRes.count === null) {
    console.error('[league] updateRoundSimSettings lock check failed', { roundId, error: flightsRes.error });
    return { error: 'update_failed' };
  }
  if (flightsRes.count > 0) return { error: 'round_settings_locked' };

  let override: SimSettings | null = null;
  if (str(formData, 'reset') !== 'true') {
    const parsed = parseSimSettings(formData);
    if (!parsed.ok) return { error: 'sim_settings' };
    override = roundOverrideFrom(parsed.settings, leagueRes.data.sim_settings);
  }

  try {
    const result = await supabase
      .from('league_rounds')
      .update({ sim_settings: override })
      .eq('id', roundId)
      .eq('league_id', leagueId)
      .select('id');
    if (result.error?.message?.includes(ROUND_LOCKED_MESSAGE)) return { error: 'round_settings_locked' };
    expectAffected(result, 'updateRoundSimSettings');
  } catch (err) {
    console.error('[league] updateRoundSimSettings failed', { roundId, err });
    return { error: 'update_failed' };
  }
  revalidateLeague(leagueId, groupId);
  return { error: '' };
}

/**
 * Admin extends/reopens a round window. Keeps original_closes_at so flights
 * created past it stay flagged. Stamps the override audit fields.
 */
/**
 * Adds a single round to a league — the manual path that complements
 * frequency-generated rounds. This is also the only way to populate a 'custom'
 * frequency league (generateRounds returns nothing for it). The new round's
 * course/tee inherit from the league per course_scope (admin can refine tee via
 * updateLeagueRound). Sequence = current max + 1.
 */
export async function addLeagueRound(formData: FormData): Promise<LeagueActionError> {
  const supabase = await getServerClient();
  const leagueId = str(formData, 'league_id');
  const opensAtRaw = str(formData, 'opens_at');
  const closesAtRaw = str(formData, 'closes_at');
  if (!leagueId || !opensAtRaw || !closesAtRaw) return { error: 'missing' };
  await requireAdminOrClubAdminOfLeague(supabase, leagueId);
  // datetime-local is Oslo wall-clock → convert to a real UTC instant (#648).
  const opensAt = parseOsloDateTimeLocal(opensAtRaw);
  const closesAt = parseOsloDateTimeLocal(closesAtRaw);
  if (new Date(closesAt).getTime() <= new Date(opensAt).getTime()) return { error: 'window' };
  // #924: a round whose play window has already closed is unplayable
  // (startLeagueRoundFlight → outside_window) — block it. The window-close is
  // the "playable-until" instant; reuse the #902 grace so liga + games agree.
  if (isTeeOffInPast(closesAt)) return { error: 'round_in_past' };

  const { data: league } = await supabase
    .from('leagues')
    .select('course_scope, course_id, tee_box_id')
    .eq('id', leagueId)
    .maybeSingle();
  if (!league) return { error: 'not_found' };

  const { data: lastRound } = await supabase
    .from('league_rounds')
    .select('sequence')
    .eq('league_id', leagueId)
    .order('sequence', { ascending: false })
    .limit(1)
    .maybeSingle();
  const sequence = ((lastRound?.sequence as number | undefined) ?? 0) + 1;
  const label = str(formData, 'label') || `Runde ${sequence}`;

  // #727: assert the insert produced a row (bug-prevention #2).
  try {
    expectAffected(
      await supabase
        .from('league_rounds')
        .insert({
          league_id: leagueId,
          sequence,
          label,
          course_id: league.course_scope === 'multi_course' ? null : league.course_id,
          tee_box_id: league.course_scope === 'single_course_single_tee' ? league.tee_box_id : null,
          opens_at: opensAt,
          closes_at: closesAt,
          original_closes_at: closesAt,
        })
        .select('id'),
      'addLeagueRound',
    );
  } catch (err) {
    console.error('[league] addLeagueRound failed', { leagueId, err });
    return { error: 'insert_failed' };
  }
  revalidatePath(`/admin/liga/${leagueId}`);
  revalidatePath(`/liga/${leagueId}`);
  return { error: '' };
}

export async function overrideRoundWindow(formData: FormData): Promise<LeagueActionError> {
  const supabase = await getServerClient();
  const roundId = str(formData, 'round_id');
  const leagueId = str(formData, 'league_id');
  const closesAtRaw = str(formData, 'closes_at');
  const opensAtRaw = str(formData, 'opens_at');
  if (!roundId || !leagueId || !closesAtRaw) return { error: 'missing' };
  const { userId } = await requireAdminOrClubAdminOfLeague(supabase, leagueId);

  // #924: intentionally NOT guarded against a past window — this path exists to
  // reopen/extend a round whose window has already closed (audit fields below).
  // datetime-local is Oslo wall-clock → convert to a real UTC instant (#648).
  const patch: TablesUpdate<'league_rounds'> = {
    closes_at: parseOsloDateTimeLocal(closesAtRaw),
    window_overridden_by: userId,
    window_overridden_at: new Date().toISOString(),
  };
  if (opensAtRaw) patch.opens_at = parseOsloDateTimeLocal(opensAtRaw);

  // #727: assert the override touched a row (bug-prevention #2).
  try {
    expectAffected(
      await supabase.from('league_rounds').update(patch).eq('id', roundId).select('id'),
      'overrideRoundWindow',
    );
  } catch (err) {
    console.error('[league] overrideRoundWindow failed', { roundId, err });
    return { error: 'update_failed' };
  }
  revalidatePath(`/admin/liga/${leagueId}`);
  revalidatePath(`/liga/${leagueId}`);
  return { error: '' };
}

export async function addLeaguePlayers(formData: FormData): Promise<LeagueActionError> {
  const supabase = await getServerClient();
  const leagueId = str(formData, 'league_id');
  if (!leagueId) return { error: 'missing' };
  await requireAdminOrClubAdminOfLeague(supabase, leagueId);

  let ids: string[] = [];
  try {
    const parsed = JSON.parse(str(formData, 'player_ids') || '[]');
    if (Array.isArray(parsed)) ids = parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return { error: 'players' };
  }

  // Klubb-liga (#483): behold kun klubbmedlemmer (speiler createLeagueDraft-
  // guardrailen, så en manipulert post ikke smugler ikke-medlemmer inn).
  if (ids.length > 0) {
    const { data: league } = await supabase
      .from('leagues')
      .select('group_id')
      .eq('id', leagueId)
      .maybeSingle();
    const groupId = (league?.group_id as string | null | undefined) ?? null;
    if (groupId) {
      const { data: memberRows } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId)
        .in('user_id', ids);
      const memberSet = new Set((memberRows ?? []).map((r) => r.user_id));
      ids = ids.filter((id) => memberSet.has(id));
    }
  }

  if (ids.length > 0) {
    const { error } = await supabase
      .from('league_players')
      // #463: arrangør legger til deltakere → ikke bekreftet ennå.
      .upsert(
        ids.map((uid) => ({ league_id: leagueId, user_id: uid, accepted_at: null })),
        {
          onConflict: 'league_id,user_id',
          ignoreDuplicates: true,
        },
      );
    if (error) {
      console.error('[league] addLeaguePlayers upsert failed', { leagueId, error });
      return { error: 'players_failed' };
    }
  }
  revalidatePath(`/admin/liga/${leagueId}`);
  return { error: '' };
}

/**
 * Removes one participant from a league. Posted by the confirm page
 * (`…/liga/[id]/fjern/[userId]`, #2244), never straight from a list row.
 *
 * Redirect-based like `removeCupParticipant`: success → the league's own door
 * with `?status=player_removed`; a refusal or failed delete → back to the
 * confirm page on the same door with `?error=<code>`. The door comes from the
 * gate's `groupId` (admin-client read of the league), never from the form.
 *
 * A FINISHED league is refused (`league_finished`): its table is the season
 * record, so the roster is locked (product ruling on #2244). The page hides the
 * button too; this is the server-side half.
 *
 * The delete runs on the RLS client, so a 0-row result is ambiguous (trap 2):
 * the admin client checks whether the row is still there. Still there → the
 * delete did not happen (`remove_failed`). Gone → someone removed the player
 * first, an honest no-op, the same reasoning as `removeCupParticipant`.
 */
export async function removeLeaguePlayer(formData: FormData): Promise<void> {
  const supabase = await getServerClient();
  const leagueId = str(formData, 'league_id');
  const userId = str(formData, 'user_id');
  // Only a hand-built post lacks these; there is no door to go back to.
  if (!leagueId || !userId) redirect('/');
  const { groupId } = await requireAdminOrClubAdminOfLeague(supabase, leagueId);
  const base = ligaBasePath(leagueId, groupId);
  const backToConfirm = (code: 'remove_failed' | 'league_finished'): never =>
    redirect(`${base}/fjern/${encodeURIComponent(userId)}?error=${code}`);

  const admin = getAdminClient();
  const { data: league, error: leagueErr } = await admin
    .from('leagues')
    .select('status')
    .eq('id', leagueId)
    .maybeSingle();
  if (leagueErr || !league) {
    console.error('[league] removeLeaguePlayer league read failed', { leagueId, leagueErr });
    backToConfirm('remove_failed');
  }
  if (league!.status === 'finished') backToConfirm('league_finished');

  const { data: deleted, error } = await supabase
    .from('league_players')
    .delete()
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .select('user_id');
  if (error) {
    console.error('[league] removeLeaguePlayer failed', { leagueId, userId, error });
    backToConfirm('remove_failed');
  }
  if ((deleted ?? []).length === 0) {
    const { data: stillThere, error: checkErr } = await admin
      .from('league_players')
      .select('user_id')
      .eq('league_id', leagueId)
      .eq('user_id', userId)
      .maybeSingle();
    if (checkErr || stillThere) {
      console.error('[league] removeLeaguePlayer deleted 0 rows', { leagueId, userId, checkErr });
      backToConfirm('remove_failed');
    }
  }

  revalidatePath(`/admin/liga/${leagueId}`);
  if (groupId) revalidatePath(`/klubber/${groupId}/liga/${leagueId}`);
  // The standings table is built from league_players.
  revalidatePath(`/liga/${leagueId}`);
  redirect(`${base}?status=player_removed`);
}

// ── member self-service (#452 Fase 3) ────────────────────────────────────────

/**
 * joinClubLeague — et klubbmedlem melder seg selv på en draft klubb-liga.
 *
 * Skriver via `join_club_league`-RPC (0086, SECURITY DEFINER) med request-scoped
 * client, så `auth.uid()` inne i funksjonen er medlemmet. RPC-en er det eneste
 * skrive-vinduet en vanlig medlem får mot `league_players` (RLS-write er
 * admin/klubb-admin-only). Redirect-basert som `leaveClub` (forlat-flyten):
 * suksess → tilbake til liga-siden (knappen forsvinner, de er nå deltaker);
 * feil → `?error=<kode>` som siden mapper til norsk.
 */
export async function joinClubLeague(formData: FormData): Promise<void> {
  const supabase = await getServerClient();
  const leagueId = str(formData, 'league_id');
  if (!leagueId) redirect('/');

  const { data, error } = await supabase.rpc('join_club_league', {
    p_league_id: leagueId,
  });
  if (error) {
    console.error('[joinClubLeague]', error);
    redirect(`/liga/${leagueId}?error=join_failed`);
  }
  if (data === 'joined' || data === 'already_member') {
    revalidatePath(`/liga/${leagueId}`);
    redirect(`/liga/${leagueId}`);
  }
  redirect(`/liga/${leagueId}?error=${data}`);
}

/**
 * leaveClubLeague — et klubbmedlem melder seg av en klubb-liga før de har spilt
 * en runde. Kalt fra `/liga/[id]/meld-av`-confirm-siden. Skriver via
 * `leave_club_league`-RPC (0086). Suksess → tilbake til liga-siden; feil →
 * tilbake til confirm-siden med `?error=<kode>`.
 */
export async function leaveClubLeague(formData: FormData): Promise<void> {
  const supabase = await getServerClient();
  const leagueId = str(formData, 'league_id');
  if (!leagueId) redirect('/');

  const { data, error } = await supabase.rpc('leave_club_league', {
    p_league_id: leagueId,
  });
  if (error) {
    console.error('[leaveClubLeague]', error);
    redirect(`/liga/${leagueId}/meld-av?error=leave_failed`);
  }
  if (data === 'left') {
    revalidatePath(`/liga/${leagueId}`);
    redirect(`/liga/${leagueId}`);
  }
  redirect(`/liga/${leagueId}/meld-av?error=${data}`);
}

async function setLeagueStatus(
  leagueId: string,
  next: 'active' | 'finished',
): Promise<LeagueActionError> {
  const supabase = await getServerClient();
  await requireAdminOrClubAdminOfLeague(supabase, leagueId);
  const patch: TablesUpdate<'leagues'> = { status: next };
  if (next === 'active') patch.started_at = new Date().toISOString();
  if (next === 'finished') patch.finished_at = new Date().toISOString();
  // #727: assert the status update touched a row (bug-prevention #2). Covers the
  // finishLeague path, which routes through here (sibling of startLeague).
  try {
    expectAffected(
      await supabase.from('leagues').update(patch).eq('id', leagueId).select('id'),
      'setLeagueStatus',
    );
  } catch (err) {
    console.error('[league] setLeagueStatus failed', { leagueId, next, err });
    return { error: 'status_failed' };
  }
  revalidatePath(`/admin/liga/${leagueId}`);
  revalidatePath(`/liga/${leagueId}`);
  return { error: '' };
}

export async function startLeague(formData: FormData): Promise<LeagueActionError> {
  const supabase = await getServerClient();
  const leagueId = str(formData, 'league_id');
  if (!leagueId) return { error: 'missing' };
  await requireAdminOrClubAdminOfLeague(supabase, leagueId);

  // A league can only start with at least one round and ≥2 participants
  // (the marker rule needs two players to ever produce a counted result).
  const [roundsCount, playersCount] = await Promise.all([
    supabase.from('league_rounds').select('id', { count: 'exact', head: true }).eq('league_id', leagueId),
    supabase.from('league_players').select('user_id', { count: 'exact', head: true }).eq('league_id', leagueId),
  ]);
  if ((roundsCount.count ?? 0) < 1) return { error: 'no_rounds' };
  if ((playersCount.count ?? 0) < 2) return { error: 'too_few_players' };

  // #727: assert the start flip touched a row (bug-prevention #2).
  try {
    expectAffected(
      await supabase
        .from('leagues')
        .update({ status: 'active', started_at: new Date().toISOString() })
        .eq('id', leagueId)
        .select('id'),
      'startLeague',
    );
  } catch (err) {
    console.error('[league] startLeague failed', { leagueId, err });
    return { error: 'status_failed' };
  }
  revalidatePath(`/admin/liga/${leagueId}`);
  revalidatePath(`/liga/${leagueId}`);
  return { error: '' };
}

export async function finishLeague(formData: FormData): Promise<LeagueActionError> {
  const leagueId = str(formData, 'league_id');
  if (!leagueId) return { error: 'missing' };
  return setLeagueStatus(leagueId, 'finished');
}

export async function deleteLeague(formData: FormData): Promise<LeagueActionError> {
  const supabase = await getServerClient();
  const leagueId = str(formData, 'league_id');
  if (!leagueId) return { error: 'missing' };
  await requireAdminOrClubAdminOfLeague(supabase, leagueId);
  // Capture the club before deleting so a club-admin lands back on the club
  // page (they can't reach /admin/liga), not on a global-admin-only route. The
  // name goes into the club page's receipt (#2329).
  const { data: league } = await supabase
    .from('leagues')
    .select('group_id, name')
    .eq('id', leagueId)
    .maybeSingle();
  const groupId = (league?.group_id as string | null | undefined) ?? null;
  // Flight games keep their history (league_round_id → SET NULL via cascade of
  // league_rounds delete). Cascade removes rounds + players.
  // #2329: 0 rows is a failure, not «slettet» (bug-prevention #2, same as
  // deleteTournament): the receipt below must never sit over a live league.
  const { data: deleted, error } = await supabase
    .from('leagues')
    .delete()
    .eq('id', leagueId)
    .select('id');
  if (error) {
    console.error('[league] deleteLeague failed', { leagueId, error });
    return { error: 'delete_failed' };
  }
  if ((deleted ?? []).length === 0) {
    console.error('[league] deleteLeague touched no row', { leagueId });
    return { error: 'delete_failed' };
  }
  if (groupId) {
    const qs = new URLSearchParams({
      status: 'league_deleted',
      name: league?.name ?? '',
    });
    redirect(`/klubber/${groupId}?${qs.toString()}`);
  }
  redirect('/admin/liga?status=deleted');
}

/**
 * Thin void wrapper so `<form action={…}>` is satisfied (`deleteLeague` returns
 * a `LeagueActionError` on failure, redirects on success). Lives here next to
 * `deleteLeague` so both delete-confirm routes (admin + club, #485) and the
 * shared `<LigaDeleteConfirm>` import it from one place.
 */
export async function handleDeleteLeague(formData: FormData): Promise<void> {
  await deleteLeague(formData);
}

// ── participant: start a flight for a round ──────────────────────────────────

/**
 * A participant starts a flight for a round. The rules (window, membership,
 * the marker rule, one counted flight per player, the #2638 settings freeze)
 * live in `startLeagueRoundFlightCore`, which the app route
 * (`POST /api/liga/rounds/[roundId]/start`) runs too. This wrapper only adds
 * the web's session and redirects: to the new game on success; a refusal
 * comes back as `{ error }`.
 */
export async function startLeagueRoundFlight(
  roundId: string,
  coPlayerUserIds: string[],
): Promise<LeagueActionError> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const result = await startLeagueRoundFlightCore(supabase, user.id, roundId, coPlayerUserIds);
  if (!result.ok) return { error: result.error };

  redirect(`/games/${result.gameId}`);
}
