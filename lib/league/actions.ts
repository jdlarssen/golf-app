'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import {
  requireAdmin,
  requireAdminOrClubAdmin,
  requireAdminOrClubAdminOfLeague,
} from '@/lib/admin/auth';
import { startScheduledGame } from '@/lib/games/startScheduledGame';
import { acceptedAtForActor } from '@/lib/games/participantAcceptance';
import { generateRounds } from './generateRounds';
import { leagueFlightGameConfig, isPointsBasedFormat } from './flightFormat';
import type {
  CourseScope,
  LeagueFormat,
  MissedRoundPolicy,
  PenaltyKind,
  RoundFrequency,
  StandingsModel,
} from './types';

const NAME_RE = /^.{1,80}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const GAME_NAME_MAX = 120;

/** Profile gender → tee_gender. NULL/'male' → 'mens', 'female' → 'ladies'. */
function teeGenderOf(gender: string | null): 'mens' | 'ladies' {
  return gender === 'female' ? 'ladies' : 'mens';
}

const str = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim();

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
 *  name, season_start, season_end (YYYY-MM-DD), scoring, standings_model,
 *  missed_round_policy, penalty_kind, penalty_fixed_over_par, course_scope,
 *  course_id, tee_box_id, frequency, player_ids (JSON array of user ids),
 *  group_id (optional club UUID).
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
  // Poeng-baserte formater (stableford) rangeres netto-only — tving det her som
  // andre forsvarslinje (wizard låser allerede valget). DB-CHECK (0087) er siste.
  const scoring = isPointsBasedFormat(format) ? 'net' : str(formData, 'scoring') || 'net';
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
  if (scoring !== 'net' && scoring !== 'gross' && scoring !== 'both') return { error: 'scoring' };
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

  let playerIds: string[] = [];
  try {
    const parsed = JSON.parse(str(formData, 'player_ids') || '[]');
    if (Array.isArray(parsed)) playerIds = parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return { error: 'players' };
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
    })
    .select('id')
    .single();
  if (insErr || !league) return { error: 'insert_failed' };
  const leagueId = (league as { id: string }).id;

  const windows = generateRounds(seasonStart, seasonEnd, frequency);
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
    if (rErr) return { error: 'rounds_failed' };
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
    if (pErr) return { error: 'players_failed' };
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

  const patch: Record<string, unknown> = {};
  const label = str(formData, 'label');
  if (label) patch.label = label;
  const courseId = str(formData, 'course_id');
  if (courseId) patch.course_id = courseId;
  const teeBoxId = str(formData, 'tee_box_id');
  if (teeBoxId) patch.tee_box_id = teeBoxId;
  const opensAt = str(formData, 'opens_at');
  if (opensAt) patch.opens_at = opensAt;
  const closesAt = str(formData, 'closes_at');
  if (closesAt) patch.closes_at = closesAt;

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from('league_rounds').update(patch).eq('id', roundId);
    if (error) return { error: 'update_failed' };
  }
  revalidatePath(`/admin/liga/${leagueId}`);
  revalidatePath(`/liga/${leagueId}`);
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
  const opensAt = str(formData, 'opens_at');
  const closesAt = str(formData, 'closes_at');
  if (!leagueId || !opensAt || !closesAt) return { error: 'missing' };
  await requireAdminOrClubAdminOfLeague(supabase, leagueId);
  if (new Date(closesAt).getTime() <= new Date(opensAt).getTime()) return { error: 'window' };

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

  const { error } = await supabase.from('league_rounds').insert({
    league_id: leagueId,
    sequence,
    label,
    course_id: league.course_scope === 'multi_course' ? null : league.course_id,
    tee_box_id: league.course_scope === 'single_course_single_tee' ? league.tee_box_id : null,
    opens_at: opensAt,
    closes_at: closesAt,
    original_closes_at: closesAt,
  });
  if (error) return { error: 'insert_failed' };
  revalidatePath(`/admin/liga/${leagueId}`);
  revalidatePath(`/liga/${leagueId}`);
  return { error: '' };
}

export async function overrideRoundWindow(formData: FormData): Promise<LeagueActionError> {
  const supabase = await getServerClient();
  const roundId = str(formData, 'round_id');
  const leagueId = str(formData, 'league_id');
  const closesAt = str(formData, 'closes_at');
  const opensAt = str(formData, 'opens_at');
  if (!roundId || !leagueId || !closesAt) return { error: 'missing' };
  const { userId } = await requireAdminOrClubAdminOfLeague(supabase, leagueId);

  const patch: Record<string, unknown> = {
    closes_at: closesAt,
    window_overridden_by: userId,
    window_overridden_at: new Date().toISOString(),
  };
  if (opensAt) patch.opens_at = opensAt;

  const { error } = await supabase.from('league_rounds').update(patch).eq('id', roundId);
  if (error) return { error: 'update_failed' };
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
    if (error) return { error: 'players_failed' };
  }
  revalidatePath(`/admin/liga/${leagueId}`);
  return { error: '' };
}

export async function removeLeaguePlayer(formData: FormData): Promise<LeagueActionError> {
  const supabase = await getServerClient();
  const leagueId = str(formData, 'league_id');
  const userId = str(formData, 'user_id');
  if (!leagueId || !userId) return { error: 'missing' };
  await requireAdminOrClubAdminOfLeague(supabase, leagueId);
  const { error } = await supabase
    .from('league_players')
    .delete()
    .eq('league_id', leagueId)
    .eq('user_id', userId);
  if (error) return { error: 'remove_failed' };
  revalidatePath(`/admin/liga/${leagueId}`);
  return { error: '' };
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
  const patch: Record<string, unknown> = { status: next };
  if (next === 'active') patch.started_at = new Date().toISOString();
  if (next === 'finished') patch.finished_at = new Date().toISOString();
  const { error } = await supabase.from('leagues').update(patch).eq('id', leagueId);
  if (error) return { error: 'status_failed' };
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

  const { error } = await supabase
    .from('leagues')
    .update({ status: 'active', started_at: new Date().toISOString() })
    .eq('id', leagueId);
  if (error) return { error: 'status_failed' };
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
  // page (they can't reach /admin/liga), not on a global-admin-only route.
  const { data: league } = await supabase
    .from('leagues')
    .select('group_id')
    .eq('id', leagueId)
    .maybeSingle();
  const groupId = (league?.group_id as string | null | undefined) ?? null;
  // Flight games keep their history (league_round_id → SET NULL via cascade of
  // league_rounds delete). Cascade removes rounds + players.
  const { error } = await supabase.from('leagues').delete().eq('id', leagueId);
  if (error) return { error: 'delete_failed' };
  redirect(groupId ? `/klubber/${groupId}` : '/admin/liga?status=deleted');
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
 * A participant starts a flight for a round. Server-enforces the marker rule
 * (≥2 distinct members) and the play window. Creates a flight game in the
 * league's format (slagspill / stableford / modifisert, via
 * `leagueFlightGameConfig`; course/tee resolved from the round, falling back to
 * the league), freezes
 * handicaps + flips to 'active' via startScheduledGame, and flags the flight if
 * it was created past the round's original window (only possible after an admin
 * override). Redirects to the new game on success; returns `{ error }` otherwise.
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

  const { data: round, error: rErr } = await supabase
    .from('league_rounds')
    .select('id, league_id, course_id, tee_box_id, opens_at, closes_at, original_closes_at')
    .eq('id', roundId)
    .maybeSingle();
  if (rErr || !round) return { error: 'round_not_found' };

  const { data: league, error: lErr } = await supabase
    .from('leagues')
    .select('id, name, course_id, tee_box_id, status, format')
    .eq('id', round.league_id)
    .maybeSingle();
  if (lErr || !league) return { error: 'league_not_found' };
  if (league.status !== 'active') return { error: 'league_not_active' };

  // Flight-spillformatet følger ligaen (slagspill / stableford / modifisert).
  // En stableford-flight rendrer det vanlige stableford-scorekortet uendret.
  const { gameMode, modeConfig } = leagueFlightGameConfig(league.format as LeagueFormat);

  // Window gate (server-enforced).
  const now = Date.now();
  if (now < new Date(round.opens_at).getTime() || now > new Date(round.closes_at).getTime()) {
    return { error: 'outside_window' };
  }

  // Resolve course/tee from round → league.
  const courseId = round.course_id ?? league.course_id;
  const teeBoxId = round.tee_box_id ?? league.tee_box_id;
  if (!courseId || !teeBoxId) return { error: 'round_not_ready' };

  // Membership + marker rule: caller + distinct co-players, all members, ≥2.
  const flightIds = Array.from(new Set([user.id, ...coPlayerUserIds.filter((id) => id !== user.id)]));
  if (flightIds.length < 2) return { error: 'need_marker' };

  const { data: members, error: mErr } = await supabase
    .from('league_players')
    .select('user_id')
    .eq('league_id', league.id);
  if (mErr) return { error: 'members_failed' };
  const memberSet = new Set((members ?? []).map((m) => m.user_id));
  if (!flightIds.every((id) => memberSet.has(id))) return { error: 'not_member' };

  // Block a second counted flight: already in a finished, non-withdrawn flight
  // for this round.
  const { data: priorGames } = await supabase
    .from('games')
    .select('id, status, game_players!inner(user_id, withdrawn_at)')
    .eq('league_round_id', roundId)
    .eq('status', 'finished')
    .eq('game_players.user_id', user.id);
  if ((priorGames ?? []).some((g) => (g.game_players as { withdrawn_at: string | null }[]).some((p) => p.withdrawn_at === null))) {
    return { error: 'already_played' };
  }

  // tee_gender per player from profile.
  const { data: roster } = await supabase.from('users').select('id, gender').in('id', flightIds);
  const genderById = new Map<string, string | null>(
    (roster ?? []).map((u) => [u.id, (u.gender as string | null) ?? null]),
  );

  const deliveredOutsideWindow = now > new Date(round.original_closes_at).getTime();
  const name = `${league.name} – Runde`.slice(0, GAME_NAME_MAX);

  const { data: game, error: gErr } = await supabase
    .from('games')
    .insert({
      name,
      course_id: courseId,
      tee_box_id: teeBoxId,
      status: 'scheduled',
      game_mode: gameMode,
      mode_config: modeConfig,
      created_by: user.id,
      league_round_id: roundId,
      delivered_outside_window: deliveredOutsideWindow,
    })
    .select('id')
    .single();
  if (gErr || !game) return { error: 'insert_failed' };
  const gameId = (game as { id: string }).id;

  const flightNow = new Date().toISOString();
  const { error: gpErr } = await supabase.from('game_players').insert(
    flightIds.map((uid) => ({
      game_id: gameId,
      user_id: uid,
      // Liga er solo → team_number null. team_number 1 uten flight_number brøt
      // CHECK-constrainten game_players_team_flight_consistency (#647). Og
      // game_players har INGEN status-kolonne — den lå her før og fikk hele
      // flight-inserten avvist, så ingen kunne spille en eneste runde.
      team_number: null,
      tee_gender: teeGenderOf(genderById.get(uid) ?? null),
      // #463: den som starter flighten bekreftes nå; medspillere i flighten
      // er «Ikke bekreftet» til de selv bekrefter / blir aktive.
      accepted_at: acceptedAtForActor(user.id, uid, flightNow),
    })),
  );
  if (gpErr) {
    await supabase.from('games').delete().eq('id', gameId);
    return { error: 'insert_failed' };
  }

  // Freeze handicaps + flip to active. On failure, roll back the half-made flight.
  // ORDER MATTERS: game_players were inserted above, before this call. That is
  // what lets startScheduledGame (on the user client) read co-players'
  // users.hcp_index — the "users select own or shared games" RLS policy only
  // grants that once the caller shares a game with them. Keep insert-before-start.
  const started = await startScheduledGame(supabase, gameId);
  if (!started.ok) {
    await supabase.from('game_players').delete().eq('game_id', gameId);
    await supabase.from('games').delete().eq('id', gameId);
    return { error: `start_${started.reason}` };
  }

  redirect(`/games/${gameId}`);
}
