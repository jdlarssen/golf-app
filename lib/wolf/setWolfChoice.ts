'use server';

import { updateTag } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';
import type { WolfChoice } from '@/lib/scoring/modes/types';
import { validateWolfChoice, type WolfChoiceValidationError } from '@/lib/wolf/validateWolfChoice';

export type SetWolfChoiceResult =
  | { ok: true }
  | { ok: false; error: SetWolfChoiceError };

export type SetWolfChoiceError =
  | 'not_authenticated'
  | WolfChoiceValidationError
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
 * Forretningsreglene (hull 1..18, gyldig valg, partner bare ved 'partner',
 * ikke seg selv) bor i `validateWolfChoice`, delt med appen (#2228). De
 * sjekkes før `getUser`, som før.
 *
 * Etter upsert: `updateTag` utløper `game-${gameId}`-tagen med én gang, så alle
 * cache-konsumenter (getWolfChoices, getGameWithPlayers, ev. scoring) venter på
 * ferske data ved neste request (#2091). Lagring på hullet leser egen skriving:
 * `revalidateTag(tag, 'max')` ga stale-while-revalidate, og første omlasting
 * viste valget fra før.
 */
export async function setWolfChoice(
  input: SetWolfChoiceInput,
): Promise<SetWolfChoiceResult> {
  const { gameId, holeNumber, wolfUserId, choice, partnerUserId } = input;

  const invalid = validateWolfChoice(input);
  if (invalid) return { ok: false, error: invalid };

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

  updateTag(`game-${gameId}`);
  return { ok: true };
}
