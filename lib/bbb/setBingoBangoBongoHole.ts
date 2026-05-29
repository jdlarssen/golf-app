'use server';

import { revalidateTag } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';

export type SetBingoBangoBongoHoleResult =
  | { ok: true }
  | { ok: false; error: SetBingoBangoBongoHoleError };

export type SetBingoBangoBongoHoleError =
  | 'not_authenticated'
  | 'invalid_hole'
  | 'game_not_found'
  | 'game_finished'
  | 'rls_denied';

export interface SetBingoBangoBongoHoleInput {
  gameId: string;
  holeNumber: number;
  bingoUserId: string | null;
  bangoUserId: string | null;
  bongoUserId: string | null;
}

/**
 * Server-action for å lagre Bingo Bango Bongo-prestasjoner for ett hull.
 *
 * Delt registrering: alle flight-spillere kan sette/endre raden. RLS-policyen
 * `bbb_holes_write` håndhever dette. Vi sjekker auth her for en tydelig
 * feilkode istedenfor en cryptic Postgres-RLS-feil.
 *
 * Forretningsregler:
 *  - Krever autentisert bruker
 *  - hole_number 1..18
 *  - Lås ved `games.status === 'finished'` (per kontrakt §5 og §Edge Cases)
 *  - De tre user-id-ene er nullable (bango f.eks. stands often udelt)
 *
 * Etter upsert: revaliderer `game-${gameId}`-tagen så alle cache-konsumenter
 * (getBingoBangoBongoHoles, getGameWithPlayers, scoring) henter fresh data ved
 * neste request.
 *
 * entered_by settes alltid til auth.uid() (audit-spor — hvem som tastet sist).
 */
export async function setBingoBangoBongoHole(
  input: SetBingoBangoBongoHoleInput,
): Promise<SetBingoBangoBongoHoleResult> {
  const { gameId, holeNumber, bingoUserId, bangoUserId, bongoUserId } = input;

  if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18) {
    return { ok: false, error: 'invalid_hole' };
  }

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: 'not_authenticated' };
  }

  // Lås ved finished — BBB-prestasjoner skal ikke endres etter spillet er avsluttet.
  // Speiler setFoursomesTeeStarter-mønstret (foursomesActions.ts).
  const gameRow = await supabase
    .from('games')
    .select('status')
    .eq('id', gameId)
    .maybeSingle();

  if (gameRow.error || !gameRow.data) {
    return { ok: false, error: 'game_not_found' };
  }
  if (gameRow.data.status === 'finished') {
    return { ok: false, error: 'game_finished' };
  }

  // Upsert på (game_id, hole_number) — primary key på tabellen. Alle tre
  // user-id-ene er nullable; de settes eksplisitt (null overskriver previous).
  const { error } = await supabase.from('bingo_bango_bongo_holes').upsert(
    {
      game_id: gameId,
      hole_number: holeNumber,
      bingo_user_id: bingoUserId,
      bango_user_id: bangoUserId,
      bongo_user_id: bongoUserId,
      entered_by: user.id,
    },
    { onConflict: 'game_id,hole_number' },
  );

  if (error) {
    console.error('[setBingoBangoBongoHole] upsert failed', { input, error });
    // RLS-feil og constraint-violations rapporteres alle som rls_denied
    // til UI — fra brukerens perspektiv er det "du har ikke lov til dette".
    return { ok: false, error: 'rls_denied' };
  }

  revalidateTag(`game-${gameId}`, 'max');
  return { ok: true };
}
