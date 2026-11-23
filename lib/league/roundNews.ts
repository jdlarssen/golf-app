import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import {
  NARRATIVE_EFFORT,
  NARRATIVE_MAX_TOKENS,
  NARRATIVE_MODEL,
  NARRATIVE_TIMEOUT_MS,
} from '@/lib/ai/narrative';
import { readAiAllowedUserIds } from '@/lib/ai/consent';
import type { getAdminClient } from '@/lib/supabase/admin';
import { buildRoundNewsFacts, buildRoundNewsPrompt, checkRoundNews } from './roundNewsPrompt';
import type { RoundSummary } from './roundSummary';

type AdminClient = ReturnType<typeof getAdminClient>;

/** The first draft, and one more when the first is dropped. */
const NEWS_ATTEMPTS = 2;

/**
 * A second attempt starts only with this much of the time left. The first
 * call in prod took under 7 seconds (23.11.2026); with less than this left, a
 * second draft would most likely be cut off by the deadline anyway.
 */
const NEWS_RETRY_MIN_MS = 8_000;

/**
 * The short news story about the round in `summary` (#2979), written by the
 * language model, or null. One text for the whole league: the sweep makes it
 * once, right before the mails that carry it.
 *
 * The same shape as the round report (`generateRoundReport.ts`): no
 * `ANTHROPIC_API_KEY` means no story, only players who said yes are in the
 * facts, the model's answer is checked before it is used, and nothing here
 * ever throws. Null always means «send the numbers alone».
 *
 * A draft that fails the checks gets one more attempt, and the model is told
 * what was wrong with the first one. Both attempts share one deadline of
 * `NARRATIVE_TIMEOUT_MS`: the call sits inside the cron route's 60 seconds,
 * after the varsler and before the mails, so the story never gets more time
 * than one attempt had before. A call that throws (a timeout, the network)
 * ends it: there is no time left to spend.
 */
export async function generateRoundNews(
  admin: AdminClient,
  summary: RoundSummary,
  nextRoundLabel: string,
): Promise<string | null> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;

    const playerIds = [...new Set([...summary.round, ...summary.table].map((row) => row.userId))];
    const allowed = await readAiAllowedUserIds(admin, playerIds);
    const facts = buildRoundNewsFacts(summary, nextRoundLabel, allowed);
    if (facts === null) return null;

    const client = new Anthropic({ apiKey, timeout: NARRATIVE_TIMEOUT_MS, maxRetries: 0 });
    const deadline = Date.now() + NARRATIVE_TIMEOUT_MS;
    let fault: string | null = null;

    for (let attempt = 1; attempt <= NEWS_ATTEMPTS; attempt++) {
      const timeLeft = deadline - Date.now();
      if (attempt > 1 && timeLeft < NEWS_RETRY_MIN_MS) break;

      const { system, user } = buildRoundNewsPrompt(facts, fault);
      const response = await client.messages.create(
        {
          model: NARRATIVE_MODEL,
          max_tokens: NARRATIVE_MAX_TOKENS,
          output_config: { effort: NARRATIVE_EFFORT },
          system,
          messages: [{ role: 'user', content: user }],
        },
        { timeout: timeLeft },
      );
      console.log('[generateRoundNews] model call', {
        roundId: summary.roundId,
        attempt,
        stopReason: response.stop_reason,
        usage: response.usage,
      });

      // A stop at the token cap (or a refusal) leaves a cut-off or empty text.
      const check =
        response.stop_reason === 'end_turn'
          ? checkRoundNews(textOf(response), facts)
          : { story: null, fault: 'Utkastet ble avbrutt før det var ferdig.' };
      if (check.story !== null) return check.story;

      fault = check.fault;
      console.error('[generateRoundNews] the draft is dropped', { roundId: summary.roundId, attempt, fault });
    }
    return null;
  } catch (err) {
    console.error('[generateRoundNews] failed', { roundId: summary.roundId, err });
    return null;
  }
}

/** The text blocks of the answer, in order. */
function textOf(response: Anthropic.Message): string {
  return response.content
    .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}
