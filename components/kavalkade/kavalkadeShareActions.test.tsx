import { describe, expect, it } from 'vitest';
import {
  UNSHAREABLE_CARD_IDS,
  kavalkadeShareActions,
} from './kavalkadeShareActions';
import { KAVALKADE_CARD_KINDS } from '@/lib/kavalkade/cardModel';

/**
 * Skjøten mellom K3s kortstokk og K4s deleknapp (#2130).
 *
 * Typen i `kavalkadeShareActions.tsx` fanger et nytt kort ved kompilering. Denne
 * testen fanger det motsatte: at oppslaget faktisk dekker hvert kort som HAR en
 * slug, og at de to kortene uten faktum står igjen uten knapp.
 */

describe('kavalkadeShareActions', () => {
  it('gir en knapp til hvert delbart kort', () => {
    const actions = kavalkadeShareActions(2026);
    expect(Object.keys(actions).sort()).toEqual([...KAVALKADE_CARD_KINDS].sort());
  });

  it('gir INGEN knapp til kortene uten et faktum å dele', () => {
    const actions = kavalkadeShareActions(2026);
    for (const id of Object.keys(UNSHAREABLE_CARD_IDS)) {
      expect(actions).not.toHaveProperty(id);
    }
  });

  it('holder lista over kort uten deling på to, med en begrunnelse hver', () => {
    expect(Object.keys(UNSHAREABLE_CARD_IDS).sort()).toEqual([
      'below-threshold',
      'gang-summary',
    ]);
    for (const reason of Object.values(UNSHAREABLE_CARD_IDS)) {
      expect(reason.length).toBeGreaterThan(10);
    }
  });
});
