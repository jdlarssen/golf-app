import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authenticatedUserId, callerScopedClient } from '@/lib/api/appAuth';
import type { Database } from '@/lib/database.types';
import { getAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/url/isUuid';

/** A route's answer when the gate says no. */
type GateRefusal = { ok: false; response: NextResponse };

export type CupManagerGate = {
  ok: true;
  userId: string;
  isAdmin: boolean;
  /** The organiser's name, for the audit log of a finish. */
  name: string | null;
  groupId: string | null;
  caller: SupabaseClient<Database>;
};

function refuse(error: string, status: number): GateRefusal {
  return { ok: false, response: NextResponse.json({ error }, { status }) };
}

/**
 * Who runs this cup, for the app's routes (#2752). One home for the rule:
 * `can_manage_tournament` in the database, asked as the caller, which the update
 * policy on `tournaments` also uses and which says the same as the web's
 * `requireAdminOrClubAdminOfCup`. A route writes with the service role after
 * this, so this gate IS the enforcement (AGENTS.md trap 3).
 *
 *   401 unauthorized · 404 not_found (no such cup) · 403 not_manager
 *
 * A read error throws: the route answers 500, never a refusal that looks like one.
 */
export async function requireCupManager(
  request: NextRequest,
  tournamentId: string,
): Promise<GateRefusal | CupManagerGate> {
  const userId = await authenticatedUserId(request);
  if (!userId) return refuse('unauthorized', 401);
  if (!isUuid(tournamentId)) return refuse('not_found', 404);

  const { data: tournament, error: tournamentError } = await getAdminClient()
    .from('tournaments')
    .select('group_id')
    .eq('id', tournamentId)
    .maybeSingle();
  if (tournamentError) throw tournamentError;
  if (!tournament) return refuse('not_found', 404);

  const caller = callerScopedClient(request);
  if (!caller) throw new Error('caller-scoped client unavailable');
  const { data: allowed, error: allowedError } = await caller.rpc('can_manage_tournament', {
    p_tournament_id: tournamentId,
  });
  if (allowedError) throw allowedError;
  if (allowed !== true) return refuse('not_manager', 403);

  const { data: me, error: meError } = await caller
    .from('users')
    .select('is_admin, name')
    .eq('id', userId)
    .maybeSingle();
  if (meError) throw meError;

  return {
    ok: true,
    userId,
    isAdmin: me?.is_admin === true,
    name: me?.name ?? null,
    groupId: tournament.group_id ?? null,
    caller,
  };
}

const CONFLICT_CODES = new Set([
  'wrong_status',
  'no_pending_matches',
  'not_withdrawn',
  'match_not_eligible',
  'not_participant',
  'already_started',
  'match_has_withdrawal',
  'player_not_in_match',
  'already_in_match',
  'not_candidate',
  'not_member',
  'profile_incomplete',
  'too_many_players',
  'side_awards_missing',
  'matches_not_submitted',
  'not_all_submitted',
  'not_all_approved',
  'no_players',
  'not_active',
  'invalid_counts',
  'not_a_participant',
]);

/**
 * A core's refusal as a response. The code travels as is: the app has the web's
 * sentence for each one.
 *
 *   404 not_found · 409 what the rules said no to · 500 the rest, `fallback`
 */
export function cupActionFailure(error: string, fallback: string): NextResponse {
  if (error === 'not_found') return NextResponse.json({ error }, { status: 404 });
  if (CONFLICT_CODES.has(error)) return NextResponse.json({ error }, { status: 409 });
  // A match that would not finish is named for the screen, and the cup stands.
  if (error === 'match_finish_failed') return NextResponse.json({ error }, { status: 502 });
  return NextResponse.json({ error: fallback }, { status: 500 });
}

/** A JSON body, or `{}` when it is missing or not an object. */
export async function jsonObject(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** The uuids in a body field, ignoring anything else. Never more than `limit`. */
export function uuidList(value: unknown, limit = 400): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && isUuid(item)).slice(0, limit);
}
