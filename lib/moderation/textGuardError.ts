// lib/moderation/textGuardError.ts
// #3019: the two errors the 0259 guard triggers raise on text other players
// see. Import-pure, so the web actions and the native app share it.
//
// `expectOne`/`expectAffected` keep only the message (lib/supabase/
// affectedRows.ts), so the check also reads a thrown Error's message.
export const BLOCKED_WORD = 'blocked_word';
export const TEXT_TOO_LONG = 'text_too_long';

export type TextGuardError = typeof BLOCKED_WORD | typeof TEXT_TOO_LONG;

type ErrorLike = { code?: string | null; message?: string | null } | null | undefined;

/** Which text guard refused the write, or null when it was something else. */
export function textGuardError(err: unknown): TextGuardError | null {
  const message = (err as ErrorLike)?.message ?? '';
  if (typeof message !== 'string') return null;
  if (message.includes(BLOCKED_WORD)) return BLOCKED_WORD;
  if (message.includes(TEXT_TOO_LONG)) return TEXT_TOO_LONG;
  return null;
}
