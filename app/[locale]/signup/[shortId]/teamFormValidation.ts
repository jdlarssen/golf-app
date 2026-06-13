/**
 * Pure client-side validators for the team registration form (#362).
 *
 * Functions now return error CODES (keys into `signup.errors.*`) + optional
 * interpolation values instead of raw Norwegian strings, so the consuming
 * component translates them via `t('signup.errors.<code>', values)`.
 * Server `teamActions.ts` uses the same code constants so client inline-
 * feedback and server errors never diverge.
 *
 * All functions are pure: take input, return a code+values tuple or `null`
 * when the field is valid. Cross-field checks (duplicates, captain's own
 * email) live in `findSlotConflicts` which sees the whole slot list.
 */

export const TEAM_NAME_MIN = 3;
export const TEAM_NAME_MAX = 40;

/** Pragmatic email shape: one `@`, chars around it, a dot in the domain. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type TeamNameValidationError =
  | { code: 'teamNameEmpty' }
  | { code: 'teamNameTooShort'; min: number }
  | { code: 'teamNameTooLong'; max: number };

export type SlotEmailValidationError =
  | { code: 'slotEmailEmpty' }
  | { code: 'slotEmailInvalid' };

export type SlotConflictError =
  | { code: 'slotEmailSelf' }
  | { code: 'slotEmailDuplicate' };

export function validateTeamName(name: string): TeamNameValidationError | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return { code: 'teamNameEmpty' };
  if (trimmed.length < TEAM_NAME_MIN)
    return { code: 'teamNameTooShort', min: TEAM_NAME_MIN };
  if (trimmed.length > TEAM_NAME_MAX)
    return { code: 'teamNameTooLong', max: TEAM_NAME_MAX };
  return null;
}

export function validateSlotEmail(value: string): SlotEmailValidationError | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return { code: 'slotEmailEmpty' };
  if (!EMAIL_RE.test(trimmed)) return { code: 'slotEmailInvalid' };
  return null;
}

/**
 * Cross-field checks over all slots simultaneously. Returns a map from
 * slot-index to error code for slots that conflict — duplicate email or
 * captain's own email. Slots without conflict (or empty) are absent.
 *
 * Takes raw (untrimmed) values and normalises internally (trim + lowercase),
 * same as the server action, so «Ola@x.no» and «ola@x.no» count as a dup.
 */
export function findSlotConflicts(
  values: string[],
  captainEmail: string | null,
): Record<number, SlotConflictError> {
  const normalized = values.map((v) => v.trim().toLowerCase());
  const cap = (captainEmail ?? '').trim().toLowerCase();

  const indicesByEmail = new Map<string, number[]>();
  normalized.forEach((email, i) => {
    if (!email) return;
    const arr = indicesByEmail.get(email) ?? [];
    arr.push(i);
    indicesByEmail.set(email, arr);
  });

  const errors: Record<number, SlotConflictError> = {};
  normalized.forEach((email, i) => {
    if (!email) return;
    if (cap && email === cap) {
      errors[i] = { code: 'slotEmailSelf' };
      return;
    }
    if ((indicesByEmail.get(email)?.length ?? 0) > 1) {
      errors[i] = { code: 'slotEmailDuplicate' };
    }
  });
  return errors;
}
