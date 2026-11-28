// Målene på et delt kavalkade-kort, flyttet ut av PNG-ruta (#2265) så appens
// deleversjon leser de samme. Type A: tallene er de ruta tegnet med før flyttingen.
import { describe, expect, it } from 'vitest';
import type { KavalkadeCardModel } from './cardModel';
import {
  KAVALKADE_CARD_IMAGE_WIDTH,
  computeCardHeight,
  heroFontSize,
  heroLineCount,
} from './cardImageLayout';

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

  // #3020: tied names on the gang cards. The line counts are the ones the real
  // route drew with Google's Fraunces 600 (rig render, 28.11).
  const TIE_13 = 'Aleksander B., Maximilian K., Kristoffer H. og 2 til';
  const LONG_TIE = 'Maximiliansebastians K., Aleksander B., Maximilian K. og 1 til';

  it('counts the lines the names wrap to, word by word', () => {
    expect(heroLineCount('Ola N.', 116)).toBe(1);
    expect(heroLineCount('Ola N. og Kari H.', 60)).toBe(1);
    expect(heroLineCount('Maximiliansebastians K.', 60)).toBe(1);
    expect(heroLineCount(TIE_13, 60)).toBe(2);
    expect(heroLineCount(LONG_TIE, 60)).toBe(3);
  });

  it('gives a tied card the height of its lines', () => {
    const hero = (value: string) => model({ hero: { value, caption: '1 snowman hver' } });
    // One 60 px line is round(60 · 1.18) = 71; the 116 px «79» line is 137.
    expect(computeCardHeight(hero(TIE_13))).toBe(823 - 137 + 2 * 71);
    expect(computeCardHeight(hero(LONG_TIE))).toBe(823 - 137 + 3 * 71);
  });

  it('counts a first name and its initial as one word when a no-break space joins them', () => {
    // gangLeaderNames joins tied names with U+00A0 inside each name, and Satori
    // does not break there, so the estimate must not either.
    const nb = (s: string) => s.replace(/(\S) (\S+\.)/g, '$1 $2');
    expect(nb(TIE_13)).toBe('Aleksander B., Maximilian K., Kristoffer H. og 2 til');
    expect(heroLineCount(nb(TIE_13), 60)).toBe(3);
    expect(heroLineCount(nb(LONG_TIE), 60)).toBe(3);
    expect(heroLineCount(nb('Ola N. og Kari H.'), 60)).toBe(1);
  });

  it('shrinks the names once more rather than run past three lines', () => {
    const three20 =
      'Maximiliansebastians K., Bartholomeusinianus L., Constantinopolitan M. og 2 til';
    expect(heroLineCount(three20, 60)).toBeGreaterThan(3);
    expect(heroFontSize(three20)).toBe(48);
    expect(heroLineCount(three20, 48)).toBeLessThanOrEqual(3);
  });
});
