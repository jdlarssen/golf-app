/**
 * The recommended setup on each «Arranger golfturnering» guide (#2331): the
 * green card under the title and its button straight into step 2 of the
 * new-game wizard (`/opprett-spill?oppsett=<audience>&step=2`).
 *
 * One home for the setup itself. The card reads the format name and the
 * «lag på N» line from here, and the wizard route reads the same entry to seed
 * `game_mode` and `team_size`, so the card can never promise a setup the
 * button doesn't open. `Record<ArrangeAudience, …>` makes a fourth audience
 * without a setup a type error (AGENTS.md trap 4).
 *
 * Each setup follows the advice in its guide's own text: scramble for the
 * company day, skins for the friends, stableford for the club night. The
 * reasons on the card live in the message catalog next to the guide
 * (`arrangeGuide.audiences.<slug>.preset.reasons`).
 */

import type { GameMode } from '@/lib/scoring/modes/types';
import type { Intent } from '@/lib/wizard/intent';
import { ARRANGE_AUDIENCES, type ArrangeAudience } from '@/lib/seo/arrangeAudiences';

export type ArrangePreset = { gameMode: GameMode; teamSize: 1 | 2 | 3 | 4 };

export const ARRANGE_PRESETS: Record<ArrangeAudience, ArrangePreset> = {
  firmagolf: { gameMode: 'texas_scramble', teamSize: 4 },
  vennegjeng: { gameMode: 'skins', teamSize: 1 },
  klubbkveld: { gameMode: 'stableford', teamSize: 1 },
};

/**
 * The setup always opens as a Kompis round: the Klubb tile only shows for club
 * admins (#525), and the Kompis catalog carries all three formats.
 */
export const PRESET_INTENT = 'kompis' as const satisfies Intent;

export function parseArrangePreset(raw: string | undefined): ArrangeAudience | undefined {
  return (ARRANGE_AUDIENCES as readonly string[]).includes(raw ?? '')
    ? (raw as ArrangeAudience)
    : undefined;
}
