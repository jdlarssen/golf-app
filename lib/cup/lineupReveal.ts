/**
 * Avdekkings-øyeblikket (#1884) — ren logikk, ingen I/O.
 *
 * Når begge kapteiner har levert, blir de to ordnede uttakene til matcher:
 * plass i på lag 1 møter plass i på lag 2. Denne modulen bygger match-planen;
 * `insertCupMatches` skriver den.
 */

import { cupMatchLabel } from './cupPairing';
import type { CupSessionFormat } from './cupTemplates';
import type { CupBatchMatch } from './insertCupMatches';
import { seatsPerSlot, type LineupPair } from './lineupValidation';

/**
 * Neste ledige nummer i label-rekka for `format`.
 *
 * Cupen kan ha spilt foursomes før — enten fra generer-veiviseren eller fra en
 * tidligere avdekket økt. Den andre foursomes-økta skal da hete «Foursome 9,
 * 10, …», ikke starte på 1 igjen. Nummereringen er per format, så singlene
 * teller sin egen rekke.
 *
 * @param existingGameModes `games.game_mode` for cupens eksisterende matcher.
 */
export function nextLabelNumber(
  existingGameModes: string[],
  format: CupSessionFormat,
): number {
  return existingGameModes.filter((mode) => mode === format).length + 1;
}

/**
 * Bygger match-planen for en avdekket økt.
 *
 * Kaster ved ugyldig input i stedet for å returnere en feilkode: kallstedet har
 * allerede validert begge uttak gjennom `validateLineupSubmission` før de ble
 * lagret, så en kort side her betyr at databasen og valideringen har kommet ut
 * av takt — ikke noe en kaptein kan utløse, og ikke noe vi skal skrive halve
 * matcher av.
 *
 * Alle matcher er «hele» matcher: `segment: 'full'`, ingen `sourceId`, ingen
 * `flightIndex`. Kaptein-uttaket har ingen splittet-cup-dag (utenfor scope), og
 * uten bunt-feltene arver matchene DB-defaulten `score_visibility='live'` —
 * altså akkurat som veiviserens vanlige matcher.
 */
export function buildRevealMatches(input: {
  /** Brukes som prefiks i den plan-lokale id-en; må være unik per økt. */
  sessionId: string;
  format: CupSessionFormat;
  /** Første label-nummer, fra `nextLabelNumber`. */
  startNumber: number;
  pairs: LineupPair[];
}): CupBatchMatch[] {
  const { sessionId, format, startNumber, pairs } = input;
  if (pairs.length === 0) {
    throw new Error('buildRevealMatches: ingen plasser å avdekke');
  }
  const seats = seatsPerSlot(format);

  return pairs
    .slice()
    .sort((a, b) => a.slotIndex - b.slotIndex)
    .map((pair, i) => {
      if (pair.side1.length !== seats) {
        throw new Error(
          `buildRevealMatches: side1 har ${pair.side1.length} spillere, forventet ${seats}`,
        );
      }
      if (pair.side2.length !== seats) {
        throw new Error(
          `buildRevealMatches: side2 har ${pair.side2.length} spillere, forventet ${seats}`,
        );
      }
      return {
        id: `${sessionId}-${pair.slotIndex}`,
        format,
        label: cupMatchLabel(format, startNumber + i),
        side1: pair.side1,
        side2: pair.side2,
        segment: 'full' as const,
      };
    });
}
