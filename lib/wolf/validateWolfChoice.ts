import type { WolfChoice } from '@/lib/scoring/modes/types';

// The business rules for a wolf choice (#2228): one home, read by the web's
// `setWolfChoice` action and the native app's `data/choices.ts`. Import-free
// apart from a type, so Metro can bundle it; the actions themselves are
// `'use server'` files the app cannot import.

export type WolfChoiceValidationError =
  | 'invalid_hole'
  | 'invalid_choice'
  | 'partner_required'
  | 'partner_must_be_null'
  | 'partner_cannot_be_wolf';

export interface WolfChoiceValidationInput {
  holeNumber: number;
  wolfUserId: string;
  choice: WolfChoice;
  partnerUserId: string | null;
}

/** True for an integer in 1..18. Wolf and BBB writes both gate on it. */
export function isPlayableHole(holeNumber: number): boolean {
  return Number.isInteger(holeNumber) && holeNumber >= 1 && holeNumber <= 18;
}

/**
 * The rules, in this order:
 *  - hole 1..18 (integer)
 *  - choice ∈ {partner, lone, blind}
 *  - 'partner' needs a partner; 'lone' and 'blind' need it to be null
 *  - the wolf cannot pick themselves
 *
 * No finished lock: the web deliberately has none on wolf choices.
 *
 * @returns the error code, or `null` when the choice is valid.
 */
export function validateWolfChoice(
  input: WolfChoiceValidationInput,
): WolfChoiceValidationError | null {
  const { holeNumber, wolfUserId, choice, partnerUserId } = input;

  if (!isPlayableHole(holeNumber)) return 'invalid_hole';
  if (choice !== 'partner' && choice !== 'lone' && choice !== 'blind') {
    return 'invalid_choice';
  }
  if (choice === 'partner' && !partnerUserId) return 'partner_required';
  if (choice !== 'partner' && partnerUserId !== null) return 'partner_must_be_null';
  if (partnerUserId && partnerUserId === wolfUserId) return 'partner_cannot_be_wolf';

  return null;
}
