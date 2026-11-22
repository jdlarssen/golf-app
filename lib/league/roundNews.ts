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
 * Unlike the round report there is no retry: the call sits inside the cron
 * route's 60 seconds, after the varsler and before the mails, so one attempt
 * of at most `NARRATIVE_TIMEOUT_MS` is what the route can afford.
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

    const { system, user } = buildRoundNewsPrompt(facts);
    const client = new Anthropic({ apiKey, timeout: NARRATIVE_TIMEOUT_MS, maxRetries: 0 });
    const response = await client.messages.create({
      model: NARRATIVE_MODEL,
      max_tokens: NARRATIVE_MAX_TOKENS,
      output_config: { effort: NARRATIVE_EFFORT },
      system,
      messages: [{ role: 'user', content: user }],
    });
    console.log('[generateRoundNews] model call', {
      roundId: summary.roundId,
      stopReason: response.stop_reason,
      usage: response.usage,
    });

    // A stop at the token cap (or a refusal) leaves a cut-off or empty text.
    if (response.stop_reason !== 'end_turn') {
      console.error('[generateRoundNews] model stopped early', {
        roundId: summary.roundId,
        stopReason: response.stop_reason,
      });
      return null;
    }

    const raw = response.content
      .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
    const story = checkRoundNews(raw, facts);
    if (story === null) {
      console.error('[generateRoundNews] the story failed the checks and is dropped', {
        roundId: summary.roundId,
        rawLength: raw.length,
      });
    }
    return story;
  } catch (err) {
    console.error('[generateRoundNews] failed', { roundId: summary.roundId, err });
    return null;
  }
}
