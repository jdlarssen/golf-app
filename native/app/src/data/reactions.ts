// #2754: reaksjonene på tavla, appens vei inn og ut av `reactions`.
//
// Webbens `fetch.ts` er `server-only`, så lesingen speiles her, mens paletten og
// opptellingen er de delte funksjonene i `lib/games/reactions/`. Porten er RLS
// (migrasjon 0119): bare deltakere som ikke har trukket seg kan gi, og bare egne
// rader kan fjernes. Ingenting lagres i SQLite, og uten nett er det ingen kø.
//
// Lesingen KASTER ved feil, så en feilet henting aldri kan se ut som «ingen har
// reagert». Skrivingen gir en kode tilbake og aldri Postgres-tekst, fordi
// skjermen skal si fra på norsk.
import {
  aggregateReactions,
  type ReactionRow,
  type ReactionSummary,
} from '../../../../lib/games/reactions/aggregate';
import type { ReactionEmoji } from '../../../../lib/games/reactions/palette';
import { NoRowsAffectedError, expectAffected } from '../../../../lib/supabase/affectedRows';
import { supabase } from '../supabase';
import { RLS_DENIED_CODE } from './choices';

/** Raden finnes alt (`UNIQUE (game_id, user_id, target_user_id, emoji)`). */
const UNIQUE_VIOLATION_CODE = '23505';

export type ReactionWriteFailure = 'rls_denied' | 'db_error' | 'no_rows';

export type ReactionToggleResult = { ok: true } | { ok: false; failure: ReactionWriteFailure };

/**
 * Reaksjonene i spillet, samlet per spiller.
 *
 * @throws {Error} når spørringen feiler.
 */
export async function fetchGameReactions(gameId: string, userId: string): Promise<ReactionSummary> {
  const { data, error } = await supabase
    .from('reactions')
    .select('target_user_id, emoji, user_id')
    .eq('game_id', gameId)
    .returns<ReactionRow[]>();

  if (error) throw new Error(`fetchGameReactions: ${error.message}`);
  return aggregateReactions(data ?? [], userId);
}

function readWrite(
  result: { data: unknown[] | null; error: { message: string; code?: string } | null },
  context: string,
): ReactionToggleResult {
  if (result.error) {
    // Samme reaksjon gitt fra to enheter: det spilleren ville, står der alt.
    if (result.error.code === UNIQUE_VIOLATION_CODE) return { ok: true };
    return {
      ok: false,
      failure: result.error.code === RLS_DENIED_CODE ? 'rls_denied' : 'db_error',
    };
  }
  try {
    expectAffected({ data: result.data, error: null }, context);
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, failure: err instanceof NoRowsAffectedError ? 'no_rows' : 'db_error' };
  }
}

/**
 * Gi reaksjonen, eller fjern den hvis spilleren alt har gitt den. Samme gang
 * som webbens `toggleReaction`: les raden, så slett eller sett inn.
 */
export async function toggleReaction(input: {
  gameId: string;
  userId: string;
  targetUserId: string;
  emoji: ReactionEmoji;
}): Promise<ReactionToggleResult> {
  const { gameId, userId, targetUserId, emoji } = input;

  const existing = await supabase
    .from('reactions')
    .select('id')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .eq('target_user_id', targetUserId)
    .eq('emoji', emoji)
    .maybeSingle();
  if (existing.error) return { ok: false, failure: 'db_error' };

  if (existing.data) {
    return readWrite(
      await supabase
        .from('reactions')
        .delete()
        .eq('id', existing.data.id)
        .eq('user_id', userId)
        .select('id'),
      'toggleReaction:delete',
    );
  }
  return readWrite(
    await supabase
      .from('reactions')
      .insert({ game_id: gameId, user_id: userId, target_user_id: targetUserId, emoji })
      .select('id'),
    'toggleReaction:insert',
  );
}
