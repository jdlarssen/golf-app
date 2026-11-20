'use server';

import { updateTag } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';
import type { WolfChoice } from '@/lib/scoring/modes/types';
import { validateWolfChoice, type WolfChoiceValidationError } from '@/lib/wolf/validateWolfChoice';
import { wolfChoiceRefusal, type WolfChoiceRefusal } from '@/lib/wolf/wolfChoiceRefusal';

export type SetWolfChoiceResult =
  | { ok: true }
  | { ok: false; error: SetWolfChoiceError };

export type SetWolfChoiceError =
  | 'not_authenticated'
  | WolfChoiceValidationError
  | WolfChoiceRefusal;

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
 * Authz: databasen. Vakta på `wolf_hole_choices` (migrasjon 0249) krever at
 * runden pågår, at `wolf_user_id` er den som spør (eller at den som spør er
 * admin), at ulven har hullet i rundgangen, og at partneren er med i spillet.
 * En avvisning kommer med grunnen, og `wolfChoiceRefusal` gjør den om til en
 * kode skjermen har tekst for. Alt som ikke er en avvisning (nettbrudd,
 * serverfeil), blir `save_failed`: «prøv igjen», ikke «du er ikke Wolf».
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
  // Wolf-spilleren kan endre valget sitt så lenge runden pågår.
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
    return { ok: false, error: wolfChoiceRefusal(error) };
  }

  updateTag(`game-${gameId}`);
  return { ok: true };
}
