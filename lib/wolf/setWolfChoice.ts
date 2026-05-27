'use server';

import { revalidateTag } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';
import type { WolfChoice } from '@/lib/scoring/modes/types';

export type SetWolfChoiceResult =
  | { ok: true }
  | { ok: false; error: SetWolfChoiceError };

export type SetWolfChoiceError =
  | 'not_authenticated'
  | 'invalid_choice'
  | 'partner_required'
  | 'partner_must_be_null'
  | 'partner_cannot_be_wolf'
  | 'invalid_hole'
  | 'rls_denied';

export interface SetWolfChoiceInput {
  gameId: string;
  holeNumber: number;
  wolfUserId: string;
  choice: WolfChoice;
  partnerUserId: string | null;
}

/**
 * Server-action for å lagre Wolf-spillerens valg for ett hull.
 *
 * Authz: RLS-policy `wolf_choices_insert/update` håndhever at `wolf_user_id`
 * matcher `auth.uid()` (eller admin override). Vi sjekker også klient-side
 * her for å gi en tydelig feilkode istedenfor en cryptic Postgres-RLS-feil.
 *
 * Forretningsregler:
 *  - choice 'partner' krever partner_user_id
 *  - choice 'lone' eller 'blind' krever partner_user_id = null
 *  - partner_user_id !== wolf_user_id (selv-velgelse forbudt)
 *  - hole_number 1..18
 *
 * Etter upsert: revaliderer `game-${gameId}`-tagen så alle cache-konsumenter
 * (getWolfChoices, getGameWithPlayers, ev. scoring) henter fresh data ved
 * neste request.
 */
export async function setWolfChoice(
  input: SetWolfChoiceInput,
): Promise<SetWolfChoiceResult> {
  const { gameId, holeNumber, wolfUserId, choice, partnerUserId } = input;

  if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18) {
    return { ok: false, error: 'invalid_hole' };
  }

  if (choice !== 'partner' && choice !== 'lone' && choice !== 'blind') {
    return { ok: false, error: 'invalid_choice' };
  }

  if (choice === 'partner' && !partnerUserId) {
    return { ok: false, error: 'partner_required' };
  }

  if (choice !== 'partner' && partnerUserId !== null) {
    return { ok: false, error: 'partner_must_be_null' };
  }

  if (partnerUserId && partnerUserId === wolfUserId) {
    return { ok: false, error: 'partner_cannot_be_wolf' };
  }

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: 'not_authenticated' };
  }

  // Upsert på (game_id, hole_number) — primary key på tabellen, så
  // Wolf-spilleren kan endre valget sitt så lenge hullet ikke er lukket
  // (locking på finished-state håndteres separat, ikke i v1).
  const { error } = await supabase.from('wolf_hole_choices').upsert(
    {
      game_id: gameId,
      hole_number: holeNumber,
      wolf_user_id: wolfUserId,
      choice,
      partner_user_id: partnerUserId,
      entered_by: user.id,
    },
    { onConflict: 'game_id,hole_number' },
  );

  if (error) {
    console.error('[setWolfChoice] upsert failed', { input, error });
    // RLS-feil og constraint-violations rapporteres alle som rls_denied
    // til UI — fra brukerens perspektiv er det "du har ikke lov til dette".
    return { ok: false, error: 'rls_denied' };
  }

  revalidateTag(`game-${gameId}`, 'max');
  return { ok: true };
}
