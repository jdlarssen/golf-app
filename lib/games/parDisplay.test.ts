import { describe, it, expect } from 'vitest';
import {
  hasParDifference,
  formatOtherGendersPar,
  parForPlayer,
  type HoleParByGender,
  type ParGenderLabels,
} from './parDisplay';

describe('hasParDifference', () => {
  it('returns false when all three gender pars are equal', () => {
    expect(hasParDifference({ mens: 4, ladies: 4, juniors: 4 })).toBe(false);
    expect(hasParDifference({ mens: 3, ladies: 3, juniors: 3 })).toBe(false);
    expect(hasParDifference({ mens: 5, ladies: 5, juniors: 5 })).toBe(false);
  });

  it('returns true when ladies par differs from mens', () => {
    expect(hasParDifference({ mens: 4, ladies: 5, juniors: 4 })).toBe(true);
  });

  it('returns true when juniors par differs from mens', () => {
    expect(hasParDifference({ mens: 4, ladies: 4, juniors: 5 })).toBe(true);
  });

  it('returns true when ladies and juniors agree but differ from mens', () => {
    expect(hasParDifference({ mens: 4, ladies: 5, juniors: 5 })).toBe(true);
  });

  it('returns true when all three differ', () => {
    expect(hasParDifference({ mens: 3, ladies: 4, juniors: 5 })).toBe(true);
  });
});

describe('formatOtherGendersPar', () => {
  const par: HoleParByGender = { mens: 4, ladies: 5, juniors: 3 };

  // ── fallback (no labels) — hardcoded Norwegian ──────────────────────────
  it('excludes mens for a men player (Norwegian fallback)', () => {
    expect(formatOtherGendersPar(par, 'mens')).toBe('Damer: 5, Junior: 3');
  });

  it('excludes ladies for a women player (Norwegian fallback)', () => {
    expect(formatOtherGendersPar(par, 'ladies')).toBe('Herrer: 4, Junior: 3');
  });

  it('excludes juniors for a junior player (Norwegian fallback)', () => {
    expect(formatOtherGendersPar(par, 'juniors')).toBe('Herrer: 4, Damer: 5');
  });

  it('lists all three when playerGender is undefined (Norwegian fallback)', () => {
    expect(formatOtherGendersPar(par, undefined)).toBe(
      'Herrer: 4, Damer: 5, Junior: 3',
    );
  });

  it('handles non-difference data shape without crashing (Norwegian fallback)', () => {
    expect(
      formatOtherGendersPar({ mens: 4, ladies: 4, juniors: 4 }, 'mens'),
    ).toBe('Damer: 4, Junior: 4');
  });

  // ── with pre-translated labels (locale-aware path) #681 ─────────────────
  describe('with labels (locale-aware)', () => {
    const enLabels: ParGenderLabels = {
      mens: 'Men: 4',
      ladies: 'Ladies: 5',
      juniors: 'Juniors: 3',
    };

    it('excludes mens label for a men player', () => {
      expect(formatOtherGendersPar(par, 'mens', enLabels)).toBe(
        'Ladies: 5, Juniors: 3',
      );
    });

    it('excludes ladies label for a women player', () => {
      expect(formatOtherGendersPar(par, 'ladies', enLabels)).toBe(
        'Men: 4, Juniors: 3',
      );
    });

    it('excludes juniors label for a junior player', () => {
      expect(formatOtherGendersPar(par, 'juniors', enLabels)).toBe(
        'Men: 4, Ladies: 5',
      );
    });

    it('lists all three when playerGender is undefined', () => {
      expect(formatOtherGendersPar(par, undefined, enLabels)).toBe(
        'Men: 4, Ladies: 5, Juniors: 3',
      );
    });
  });
});

describe('parForPlayer', () => {
  const par: HoleParByGender = { mens: 4, ladies: 5, juniors: 3 };

  it('returns mens par for a men player', () => {
    expect(parForPlayer(par, 'mens')).toBe(4);
  });

  it('returns ladies par for a women player', () => {
    expect(parForPlayer(par, 'ladies')).toBe(5);
  });

  it('returns juniors par for a junior player', () => {
    expect(parForPlayer(par, 'juniors')).toBe(3);
  });

  it('defaults to mens par when gender is undefined', () => {
    expect(parForPlayer(par, undefined)).toBe(4);
  });
});
