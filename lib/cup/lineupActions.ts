'use server';

import type { CupTeamNumber } from './captainRoles';
import { loadCupLineupAccess } from './lineupAccess';
import {
  deleteCupLineupSessionCore,
  openCupLineupSessionCore,
  retryCupLineupRevealCore,
  setCupParticipantRoleCore,
  setCupPlannedMatchCountCore,
  submitCupLineupCore,
  unlockCupLineupCore,
  type CupLineupActionError as CoreError,
} from './lineupCore';
import { lineupSlotsFrom, type LineupSlotInput } from './lineupValidation';

/**
 * Server-actions for kaptein-uttaket (#1884): skjemaet inn, kjernen under. Reglene og
 * gatene bor i `lineupCore.ts`, som appens ruter også kaller (#2752). Feil returneres som
 * `{ error: kode }`, aldri som redirect: uttaks-skjemaet er fullt av kapteinens valg.
 */

export type CupLineupActionError = CoreError;

function readTeam(formData: FormData): CupTeamNumber | null {
  const raw = formData.get('team');
  if (raw === '1') return 1;
  if (raw === '2') return 2;
  return null;
}

/** Leser `slots`-feltet: JSON på formen `[{slotIndex, userIds}]`. */
function parseSlots(raw: FormDataEntryValue | null): LineupSlotInput[] | null {
  if (typeof raw !== 'string') return null;
  try {
    return lineupSlotsFrom(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function setCupParticipantRole(formData: FormData): Promise<CupLineupActionError> {
  return setCupParticipantRoleCore(loadCupLineupAccess, {
    tournamentId: String(formData.get('id') ?? ''),
    userId: String(formData.get('user_id') ?? ''),
    teamNumber: readTeam(formData),
    isCaptain: formData.get('is_captain') === 'on',
  });
}

export async function setCupPlannedMatchCount(formData: FormData): Promise<CupLineupActionError> {
  return setCupPlannedMatchCountCore(loadCupLineupAccess, {
    tournamentId: String(formData.get('id') ?? ''),
    plannedRaw: String(formData.get('planned_match_count') ?? ''),
  });
}

export async function openCupLineupSession(formData: FormData): Promise<CupLineupActionError> {
  return openCupLineupSessionCore(loadCupLineupAccess, {
    tournamentId: String(formData.get('id') ?? ''),
    format: String(formData.get('format') ?? ''),
    slotCount: Number(formData.get('slot_count')),
  });
}

export async function deleteCupLineupSession(formData: FormData): Promise<CupLineupActionError> {
  return deleteCupLineupSessionCore(loadCupLineupAccess, {
    tournamentId: String(formData.get('id') ?? ''),
    sessionId: String(formData.get('session_id') ?? ''),
  });
}

export async function submitCupLineup(formData: FormData): Promise<CupLineupActionError> {
  return submitCupLineupCore(loadCupLineupAccess, {
    tournamentId: String(formData.get('id') ?? ''),
    sessionId: String(formData.get('session_id') ?? ''),
    team: readTeam(formData),
    slots: parseSlots(formData.get('slots')),
  });
}

export async function unlockCupLineup(formData: FormData): Promise<CupLineupActionError> {
  return unlockCupLineupCore(loadCupLineupAccess, {
    tournamentId: String(formData.get('id') ?? ''),
    sessionId: String(formData.get('session_id') ?? ''),
    team: readTeam(formData),
  });
}

export async function retryCupLineupReveal(formData: FormData): Promise<CupLineupActionError> {
  return retryCupLineupRevealCore(loadCupLineupAccess, {
    tournamentId: String(formData.get('id') ?? ''),
    sessionId: String(formData.get('session_id') ?? ''),
  });
}
