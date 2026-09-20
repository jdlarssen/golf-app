import 'server-only';

/**
 * AI-innledningen til Kavalkaden (#2128, epic #1040).
 *
 * Speiler `lib/games/generateRoundReport.ts`: samme modell, timeout og vask
 * (`lib/ai/narrative.ts`), hel try/catch rundt kroppen, `console.error` med
 * fast prefiks — og **kaster aldri**. Teksten er pynt. En kavalkade uten
 * innledning er en kavalkade; en kavalkade som krasjer, er ingenting.
 *
 * ## Uten nøkkel: stille av
 *
 * Ingen `ANTHROPIC_API_KEY` → `null` uten at SDK-klienten i det hele tatt
 * bygges, samme port som rundereferatet bruker. Nøkkelens tilstedeværelse ER
 * bryteren; ingen egen funksjonsflagg.
 *
 * ## Modellen regner aldri
 *
 * Den ser bare `KavalkadeFacts` — ferdig utregnet av `buildKavalkadeFacts` —
 * og aldri en rå score. Id-ene strippes i prompt-byggeren, så bare navn og tall
 * forlater huset.
 *
 * Kalles fra `getOrCreateKavalkade`, nøyaktig én gang per spiller per år:
 * første gang kavalkaden åpnes etter frysegrensen.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  NARRATIVE_MAX_RETRIES,
  NARRATIVE_MODEL,
  NARRATIVE_TIMEOUT_MS,
} from '@/lib/ai/narrative';
import type { KavalkadeFacts } from './buildKavalkadeFacts';
import {
  buildKavalkadeNarrativePrompt,
  sanitizeKavalkadeNarrative,
} from './kavalkadeNarrativePrompt';

/** 2–4 setninger trenger ikke mer. Taket er en brems, ikke et mål. */
const MAX_TOKENS = 400;

/**
 * Skriver innledningen til én spillers kavalkade, eller `null` når den ikke
 * lot seg skrive (ingen nøkkel, tomt år, modellfeil eller et svar vasken
 * forkastet). Kallstedet lagrer `null` som `null` og viser kortene uten tekst.
 */
export async function generateKavalkadeNarrative(
  facts: KavalkadeFacts,
): Promise<string | null> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;

    // Et år uten en eneste ferdig runde har ingen historie å fortelle — og
    // ingen grunn til å koste et modellkall.
    if (facts.rounds === 0) return null;

    const { system, user } = buildKavalkadeNarrativePrompt(facts);

    const client = new Anthropic({
      apiKey,
      timeout: NARRATIVE_TIMEOUT_MS,
      maxRetries: NARRATIVE_MAX_RETRIES,
    });
    const response = await client.messages.create({
      model: NARRATIVE_MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: 'user', content: user }],
    });

    const rawText = response.content
      .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    const sanitized = sanitizeKavalkadeNarrative(rawText);
    if (sanitized === null) {
      console.error('[generateKavalkadeNarrative] sanitizer rejected model output', {
        year: facts.year,
        rawLength: rawText.length,
      });
      return null;
    }

    return sanitized;
  } catch (err) {
    console.error('[generateKavalkadeNarrative] failed', { year: facts.year, err });
    return null;
  }
}
