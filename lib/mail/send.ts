// The one door to Resend (#2227). Every mail sender in lib/mail builds its
// payload and hands it to `sendMail`, which owns the client, the from-address,
// the pace and the retry.
//
// Why a shared pace: Resend allows 10 API requests per second per team and
// answers HTTP 429 `rate_limit_exceeded` with a `retry-after` header past that
// (resend.com/docs/api-reference/rate-limit, read 2026-09-27). The fan-outs —
// "Resultatet er klart" to a whole field, reminders, cup mail, the monthly
// newsletter — fire every send at once, and the SDK has no retry of its own:
// the 1 September newsletter reached 10 of 27 recipients. The pacer below lets
// 8 requests start per second from this instance, leaving 2 of the team's 10
// for other Vercel instances sending at the same time.
//
// Retry policy: only `rate_limit_exceeded` is retried, up to 3 attempts in all,
// after pausing the whole queue for `retry-after`. `daily_quota_exceeded` and
// `monthly_quota_exceeded` are 429s too, but a retry cannot help there. A
// network failure (`application_error`, statusCode null) is not retried either:
// the mail may already have gone out, and a duplicate is worse than a miss.

import { Resend } from 'resend';
import { createPacer } from '@/lib/async/pacer';

const RESEND_MAX_REQUESTS_PER_SECOND = 8;
const MAX_ATTEMPTS = 3;
const MIN_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 10_000;

// Module-level: one queue per server instance, shared by every sender.
const pacer = createPacer({
  maxStarts: RESEND_MAX_REQUESTS_PER_SECOND,
  windowMs: 1000,
});

export type MailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
};

function resolveFromEmail(): string {
  const raw = process.env.RESEND_FROM_EMAIL?.trim();
  if (!raw) return 'Tørny <noreply@tornygolf.no>';
  if (raw.includes('<') && raw.includes('>')) return raw;
  return `Tørny <${raw}>`;
}

function getClient(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error('RESEND_API_KEY is not set');
  }
  return new Resend(key);
}

function retryDelayMs(headers: Record<string, string> | null | undefined): number {
  const seconds = Number(headers?.['retry-after']);
  const ms = seconds * 1000 || MIN_RETRY_DELAY_MS;
  return Math.min(MAX_RETRY_DELAY_MS, Math.max(MIN_RETRY_DELAY_MS, ms));
}

/**
 * Sends one mail through Resend, paced under the team's rate limit. Resolves
 * once Resend accepted it; throws `Resend send failed: …` otherwise — callers
 * keep wrapping it in `Promise.allSettled` / try-catch as before.
 */
export async function sendMail(message: MailMessage): Promise<void> {
  const resend = getClient();
  const from = resolveFromEmail();

  for (let attempt = 1; ; attempt++) {
    await pacer.acquire();
    const result = await resend.emails.send({ from, ...message });
    if (!result.error) return;

    if (result.error.name === 'rate_limit_exceeded' && attempt < MAX_ATTEMPTS) {
      pacer.pauseFor(retryDelayMs(result.headers));
      continue;
    }

    throw new Error(
      `Resend send failed: ${result.error.message ?? JSON.stringify(result.error)}`,
    );
  }
}
