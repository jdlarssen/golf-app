import { acceptedAtForActor } from './participantAcceptance';

/**
 * #2210 — an edit of a draft or scheduled game writes only the roster changes
 * the form actually made.
 *
 * Before this module the edit action deleted the whole roster and re-inserted
 * `game_id, user_id, team_number, flight_number, tee_gender` for everyone the
 * form sent. Every column other surfaces own was lost on each save: paid
 * (Betaling), accepted (the player's own confirmation), withdrawn, signup
 * source, and the flight split the Flights section or the cup draw had set.
 * Players who signed up while the form was open were deleted, and players who
 * left were put back.
 *
 * The planner is pure (no Supabase import), in the style of `modeConfigEdit.ts`.
 * The action reads the roster, plans, then writes updates, inserts and deletes.
 */

export type RosterTeeGender = 'mens' | 'ladies' | 'juniors';

/** A roster row as it stands in the DB right before the write. */
export type PriorRosterRow = {
  user_id: string;
  team_number: number | null;
  flight_number: number | null;
  tee_gender: RosterTeeGender;
};

/** A row the form asks for. `tee_gender: null` = the form sent no category. */
export type DesiredRosterRow = {
  user_id: string;
  team_number: number | null;
  flight_number: number | null;
  tee_gender: RosterTeeGender | null;
};

/** The only columns a patch may carry. Everything else belongs to other flows. */
export type RosterPatch = Partial<
  Pick<PriorRosterRow, 'team_number' | 'flight_number' | 'tee_gender'>
>;

export type RosterInsertRow = {
  user_id: string;
  team_number: number | null;
  flight_number: number | null;
  tee_gender: RosterTeeGender;
  course_handicap: null;
  accepted_at: string | null;
};

export type RosterEditPlan = {
  updates: { user_id: string; patch: RosterPatch }[];
  inserts: RosterInsertRow[];
  deletes: string[];
};

export type RosterEditInput = {
  prior: readonly PriorRosterRow[];
  desired: readonly DesiredRosterRow[];
  /**
   * The ids the form was opened with (`roster_loaded_ids`), or `null` when the
   * form did not say (a tab opened before this shipped).
   */
  loaded: ReadonlySet<string> | null;
  /** The draft switched format. Validator flights then replace stored ones. */
  modeChanged: boolean;
  /** The form has its own flight picker for this format (see `formOwnsFlight`). */
  formOwnsFlight: boolean;
  actorUserId: string;
  guestIds: ReadonlySet<string>;
  nowIso: string;
};

/**
 * Ids the plan will insert: wanted by the form, not on the roster, and not
 * part of the roster the form was opened with. A player who left while the
 * form was open is in `loaded` and stays out. The action uses this to look up
 * guests before planning.
 */
export function plannedInsertIds(
  prior: readonly PriorRosterRow[],
  desired: readonly DesiredRosterRow[],
  loaded: ReadonlySet<string> | null,
): string[] {
  const priorIds = new Set(prior.map((r) => r.user_id));
  return desired
    .map((r) => r.user_id)
    .filter((id) => !priorIds.has(id) && !loaded?.has(id));
}

export function planRosterEdit(input: RosterEditInput): RosterEditPlan {
  const { prior, desired, loaded } = input;
  const priorById = new Map(prior.map((r) => [r.user_id, r]));
  const desiredIds = new Set(desired.map((r) => r.user_id));

  // With `loaded`, only players the organiser actually removed are deleted —
  // someone who signed up after the form opened is not in `loaded` and stays.
  // Without it (old tab) there is no way to tell, and we fall back to the
  // previous behaviour: the form's list is the roster.
  const deletes = loaded
    ? [...loaded].filter((id) => !desiredIds.has(id) && priorById.has(id))
    : prior.map((r) => r.user_id).filter((id) => !desiredIds.has(id));

  const insertIds = new Set(plannedInsertIds(prior, desired, loaded));
  const inserts: RosterInsertRow[] = desired
    .filter((r) => insertIds.has(r.user_id))
    .map((r) => ({
      user_id: r.user_id,
      team_number: r.team_number,
      flight_number: r.flight_number,
      tee_gender: r.tee_gender ?? 'mens',
      course_handicap: null,
      // #463: the organiser's own row is confirmed; others are pending. #1009:
      // a guest can never confirm themselves, so their row is confirmed here.
      accepted_at: input.guestIds.has(r.user_id)
        ? input.nowIso
        : acceptedAtForActor(input.actorUserId, r.user_id, input.nowIso),
    }));

  const updates: RosterEditPlan['updates'] = [];
  for (const want of desired) {
    const have = priorById.get(want.user_id);
    if (!have) continue;
    const patch: RosterPatch = {};
    const teamChanged = want.team_number !== have.team_number;
    if (teamChanged) patch.team_number = want.team_number;
    // The form owns the flight only for best ball (its flight picker). In
    // every other format the validator sets flight = team or null, while the
    // Flights section and the cup draw are what really set it — so a stored
    // flight stands unless the team moved or the draft changed format.
    const takeFlight =
      teamChanged ||
      input.modeChanged ||
      (input.formOwnsFlight && want.team_number !== null);
    if (takeFlight && want.flight_number !== have.flight_number) {
      patch.flight_number = want.flight_number;
    }
    if (want.tee_gender !== null && want.tee_gender !== have.tee_gender) {
      patch.tee_gender = want.tee_gender;
    }
    if (Object.keys(patch).length > 0) {
      updates.push({ user_id: want.user_id, patch });
    }
  }

  return { updates, inserts, deletes };
}

/**
 * Reads `roster_loaded_ids` (comma-separated). Missing → `null`: a tab opened
 * before #2210, or the create flow. Empty string → an empty roster.
 */
export function parseLoadedRoster(formData: FormData): Set<string> | null {
  const raw = formData.get('roster_loaded_ids');
  if (raw === null) return null;
  return new Set(
    String(raw)
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id !== ''),
  );
}

/**
 * True only for best ball — the one format whose form has a flight picker
 * (`TeamsAssignmentSection`), pre-filled from the DB. Par-stableford also
 * reads `player_${i}_flight`, but the client always sends the team there.
 */
export function formOwnsFlight(mode: string): boolean {
  return mode === 'best_ball';
}

/**
 * True when the plan changes who plays whom: an insert, a delete, or a new
 * team. A flight or tee-category patch alone does not.
 */
export function touchesCupRoster(plan: RosterEditPlan): boolean {
  return (
    plan.inserts.length > 0 ||
    plan.deletes.length > 0 ||
    plan.updates.some((u) => 'team_number' in u.patch)
  );
}
