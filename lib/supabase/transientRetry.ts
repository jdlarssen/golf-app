/**
 * Re-run an idempotent PostgREST read when Supabase answers with a transient
 * failure.
 *
 * Motivating bug: #2013 — `next build` died in «Collecting page data» for
 * `/[locale]/baner/[slug]` on a single `{"message":"Gateway Timeout"}` from
 * Supabase, in CI and in a Vercel preview. A re-run of the same commit went
 * green. postgrest-js already retries 503/520 and fetch failures on its own,
 * but not 504, and Next's `staticGenerationRetryCount` does not cover that
 * build phase.
 *
 * Transient = the response has an error AND its status is 502/503/504, or 0
 * (postgrest-js reports a fetch failure as `status: 0`). Everything else,
 * including 4xx and 500, comes back untouched on the first call. After the
 * last attempt the last response is returned as is, so the caller still
 * throws its error — nothing is swallowed and no empty data is invented.
 *
 * Every attempt gets its own `AbortSignal`, and the caller MUST pass it on
 * with `.abortSignal(signal)`. Next dedupes GET fetches to the same URL within
 * a render (`next/dist/server/lib/dedupe-fetch.js`) and hands the retry the
 * memoized 504 without going to the network; a signal is its opt-out.
 * Measured: without it a build against an always-504 server logged three
 * attempts but one request.
 *
 * READS ONLY. A write is not safe to repeat.
 */

type PostgrestLikeResponse = {
  error: unknown
  status: number
}

const TRANSIENT_STATUSES = new Set([0, 502, 503, 504])

/** Wait before attempt 2 and attempt 3. Three attempts in total. */
export const RETRY_DELAYS_MS = [500, 1500] as const

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function isTransient(response: PostgrestLikeResponse): boolean {
  return response.error != null && TRANSIENT_STATUSES.has(response.status)
}

export async function withTransientRetry<R extends PostgrestLikeResponse>(
  fn: (signal: AbortSignal) => PromiseLike<R>,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<R> {
  let response = await fn(new AbortController().signal)
  for (const delay of RETRY_DELAYS_MS) {
    if (!isTransient(response)) return response
    await sleep(delay)
    response = await fn(new AbortController().signal)
  }
  return response
}
