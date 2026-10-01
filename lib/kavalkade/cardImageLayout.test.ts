// Målene på et delt kavalkade-kort, flyttet ut av PNG-ruta (#2265) så appens
// deleversjon leser de samme. Type A: tallene er de ruta tegnet med før flyttingen.
import { describe, expect, it } from 'vitest';
import type { KavalkadeCardModel } from './cardModel';
import { KAVALKADE_CARD_IMAGE_WIDTH, computeCardHeight, heroFontSize } from './cardImageLayout';

function model(partial: Partial<KavalkadeCardModel>): KavalkadeCardModel {
  return {
    kind: 'best-round',
    eyebrow: 'Kavalkaden 2026',
    title: 'Årets beste runde',
    hero: { value: '79', caption: 'slag brutto' },
    lines: [],
    ...partial,
  };
}

describe('cardImageLayout', () => {
  it('draws the image 1080 pixels wide', () => {
    expect(KAVALKADE_CARD_IMAGE_WIDTH).toBe(1080);
  });

  it('shrinks the big value from a number to a long name', () => {
    expect(heroFontSize('79')).toBe(116);
    expect(heroFontSize('12345678')).toBe(116);
    expect(heroFontSize('Dina Fossum')).toBe(84);
    expect(heroFontSize('Kristoffer Fossum')).toBe(60);
  });

  it('fits the height to the content', () => {
    // 72 + 76 + (36 + 80) + 42 + (8 + 56 + 137 + 58 + 56) + 0 + 130 + 72
    expect(computeCardHeight(model({}))).toBe(823);
    const lines = [
      { label: 'Spill', value: 'Lørdagscup' },
      { label: 'Bane', value: 'Losby' },
    ];
    expect(computeCardHeight(model({ lines }))).toBe(823 + 2 * 104);
    // En lang tittel tar to linjer, og uten forklaring under tallet faller den bort.
    expect(computeCardHeight(model({ title: 'Regnskapet mot Kristoffer Fossum', hero: { value: '3–2–1', caption: null } }))).toBe(
      823 + 80 - 58,
    );
  });
});
