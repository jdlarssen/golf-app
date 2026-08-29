/**
 * Nudge-køen på Hjem (#1797, kontrakt #1069 K6): maks ÉN nudge/banner om
 * gangen, i eier-fastsatt prioritet Install > Push > Nytt-i-Tørny > Passkey.
 * Suksess-/kvitteringsbannere står utenfor køen.
 *
 * Kvalifiseringen er blandet server/klient og asynkron, så hver plass
 * rapporterer 'pending' → 'yes'/'no' etter hvert som den avklares. Regelen som
 * hindrer synlig banner-bytting ved sidelast: en plass vises først når ALLE
 * over den har avklart seg til 'no' — er en høyere plass fortsatt 'pending',
 * vises ingenting. En nudge kan dermed dukke opp litt senere, men aldri bli
 * byttet ut av en annen.
 */

export const NUDGE_PRIORITY = [
  'install',
  'push',
  'productUpdate',
  'passkey',
] as const;

export type NudgeSlotId = (typeof NUDGE_PRIORITY)[number];

export type NudgeSlotStatus = 'pending' | 'yes' | 'no';

export type NudgeSlotStatuses = Record<NudgeSlotId, NudgeSlotStatus>;

/**
 * Walk the priority order: the first 'yes' wins; a 'pending' above everything
 * qualified means «wait» (null) — never show a lower slot on a guess.
 */
export function resolveVisibleNudge(
  statuses: NudgeSlotStatuses,
): NudgeSlotId | null {
  for (const slot of NUDGE_PRIORITY) {
    const status = statuses[slot];
    if (status === 'pending') return null;
    if (status === 'yes') return slot;
  }
  return null;
}
