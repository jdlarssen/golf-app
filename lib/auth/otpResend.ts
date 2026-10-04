// lib/auth/otpResend.ts
// The login code's numbers and «Ny kode om 0:42» (#2349).
//
// One home for the web's code step (`app/[locale]/(auth)/login/`) and the
// app's (`native/app/src/lib/loginCopy.ts` re-exports these under its own
// names).
//
// `OTP_LENGTH` and `OTP_RESEND_SECONDS` mirror the Supabase Auth settings: the
// length of the email code, and how long the same address waits for a new
// one. They only steer what the screens show; Supabase decides. Change the
// setting in Supabase and these together (docs/auth-flow.md).
//
// Pure on purpose: no Intl and no clock of its own. The app imports this file
// (Hermes has no ICU data), and callers pass `nowMs`.

/** Digits in the code from the mail. */
export const OTP_LENGTH = 8;

/** Seconds before the same address can get a new code. */
export const OTP_RESEND_SECONDS = 60;

const SENT_MAX_AGE_MS = 10 * 60 * 1000;
const SENT_MAX_AHEAD_MS = 5 * 1000;

/**
 * `sent` from the URL (whole unix seconds, stamped by `sendCode`) as
 * milliseconds, or `null`. Only values from ten minutes back to five seconds
 * ahead count (a little clock skew between servers is fine). Anything else —
 * missing, hand-edited, an old link from the history — is `null`, and the
 * page treats the code as old enough to ask for a new one.
 */
export function parseSentAt(raw: string | undefined, nowMs: number): number | null {
  if (!raw || !/^\d{1,11}$/.test(raw)) return null;
  const sentMs = Number(raw) * 1000;
  if (sentMs < nowMs - SENT_MAX_AGE_MS || sentMs > nowMs + SENT_MAX_AHEAD_MS) return null;
  return sentMs;
}

/** Seconds until «Send ny kode» can be pressed, from 0 to {@link OTP_RESEND_SECONDS}. `null` is 0. */
export function resendWaitSeconds(sentAtMs: number | null, nowMs: number): number {
  if (sentAtMs === null) return 0;
  const elapsed = Math.floor((nowMs - sentAtMs) / 1000);
  return Math.min(OTP_RESEND_SECONDS, Math.max(0, OTP_RESEND_SECONDS - elapsed));
}

/**
 * The countdown as «0:42». Not `formatCountdown` in `lib/format/countdown.ts`:
 * that one takes milliseconds to a tee-off.
 */
export function formatResendCountdown(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * The address in «Vi sendte den til …»: the first character, one dot per rest
 * of the local part, and the whole domain — «k••••@firma.no», as on the design
 * (Innlogging-forslag). Without an `@` (or empty) it stands as it is.
 *
 * Not `maskEmail` (`lib/users/maskEmail.ts`): that one shows two characters
 * and three fixed dots («ka•••@firma.no»), a different shape than the design's.
 */
export function maskSentToEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return email;
  const local = email.slice(0, at);
  return `${local.slice(0, 1)}${'•'.repeat(local.length - 1)}${email.slice(at)}`;
}
