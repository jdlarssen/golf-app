// #2481: the organiser's greeting when a round is cancelled with a notice.
// No imports, on purpose: `lib/notifications/types.ts` reads the limit, and the
// app's typecheck (`native/app`) loads that file through `readOnVisit.ts`, so
// anything imported here reaches the app too (it once pulled in `server-only`
// modules through `signupInbox.ts`).

/**
 * The longest greeting the organiser can send. One home: the textarea's
 * `maxLength`, the action's check and the `game_cancelled` payload schema all
 * read it.
 */
export const CANCEL_MESSAGE_MAX = 300;

export type CancelMessageResult =
  | { ok: true; message: string | undefined }
  | { ok: false; error: 'message_too_long' };

/**
 * The greeting from the form, trimmed. Empty is no greeting. Over
 * `CANCEL_MESSAGE_MAX` is an error, never cut short. A form posts a line break
 * as CRLF; it counts once, as the textarea's `maxLength` counted it.
 */
export function normalizeCancelMessage(raw: FormDataEntryValue | null | undefined): CancelMessageResult {
  if (typeof raw !== 'string') return { ok: true, message: undefined };
  const message = raw.replace(/\r\n?/g, '\n').trim();
  if (message === '') return { ok: true, message: undefined };
  if (message.length > CANCEL_MESSAGE_MAX) return { ok: false, error: 'message_too_long' };
  return { ok: true, message };
}
