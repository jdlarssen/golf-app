import { describe, it, expect } from 'vitest';
import {
  getTeeLengthWarning,
  type TeeLengthWarningInput,
} from './teeLengthWarning';

const emptyTee: TeeLengthWarningInput = {
  length_meters: '',
  slope_mens: '',
  course_rating_mens: '',
  slope_ladies: '',
  course_rating_ladies: '',
  slope_juniors: '',
  course_rating_juniors: '',
};

describe('getTeeLengthWarning', () => {
  describe('no active gender', () => {
    it('returns null when no gender block has any data, even with extreme length', () => {
      expect(
        getTeeLengthWarning({ ...emptyTee, length_meters: '500' }),
      ).toBeNull();
      expect(
        getTeeLengthWarning({ ...emptyTee, length_meters: '12000' }),
      ).toBeNull();
    });
  });

  describe('mens only', () => {
    const mens: TeeLengthWarningInput = {
      ...emptyTee,
      slope_mens: '125',
      course_rating_mens: '70.5',
    };

    it('returns null at lower boundary 5300', () => {
      expect(
        getTeeLengthWarning({ ...mens, length_meters: '5300' }),
      ).toBeNull();
    });

    it('returns null at upper boundary 6600', () => {
      expect(
        getTeeLengthWarning({ ...mens, length_meters: '6600' }),
      ).toBeNull();
    });

    it('returns null mid-range', () => {
      expect(
        getTeeLengthWarning({ ...mens, length_meters: '6000' }),
      ).toBeNull();
    });

    it('warns "kort" below 5300', () => {
      expect(getTeeLengthWarning({ ...mens, length_meters: '4500' })).toBe(
        'Uvanlig kort for norsk herretee (5300–6600 m).',
      );
    });

    it('warns "lang" above 6600', () => {
      expect(getTeeLengthWarning({ ...mens, length_meters: '7500' })).toBe(
        'Uvanlig lang for norsk herretee (5300–6600 m).',
      );
    });
  });

  describe('ladies only', () => {
    const ladies: TeeLengthWarningInput = {
      ...emptyTee,
      slope_ladies: '130',
      course_rating_ladies: '72.0',
    };

    it('returns null mid-range 5000', () => {
      expect(
        getTeeLengthWarning({ ...ladies, length_meters: '5000' }),
      ).toBeNull();
    });

    it('warns "kort" below 4700', () => {
      expect(getTeeLengthWarning({ ...ladies, length_meters: '4500' })).toBe(
        'Uvanlig kort for norsk dametee (4700–5900 m).',
      );
    });

    it('warns "lang" above 5900', () => {
      expect(getTeeLengthWarning({ ...ladies, length_meters: '6100' })).toBe(
        'Uvanlig lang for norsk dametee (4700–5900 m).',
      );
    });
  });

  describe('juniors only', () => {
    const juniors: TeeLengthWarningInput = {
      ...emptyTee,
      slope_juniors: '120',
      course_rating_juniors: '68.0',
    };

    it('returns null mid-range', () => {
      expect(
        getTeeLengthWarning({ ...juniors, length_meters: '5000' }),
      ).toBeNull();
    });

    it('warns "lang" above 5600', () => {
      expect(
        getTeeLengthWarning({ ...juniors, length_meters: '5700' }),
      ).toBe('Uvanlig lang for norsk juniortee (4400–5600 m).');
    });

    it('warns "kort" below 4400', () => {
      expect(getTeeLengthWarning({ ...juniors, length_meters: '4000' })).toBe(
        'Uvanlig kort for norsk juniortee (4400–5600 m).',
      );
    });
  });

  describe('union: mens + ladies', () => {
    const both: TeeLengthWarningInput = {
      ...emptyTee,
      slope_mens: '125',
      course_rating_mens: '70.5',
      slope_ladies: '130',
      course_rating_ladies: '72.0',
    };

    it('returns null at union boundaries 4700 and 6600', () => {
      expect(
        getTeeLengthWarning({ ...both, length_meters: '4700' }),
      ).toBeNull();
      expect(
        getTeeLengthWarning({ ...both, length_meters: '6600' }),
      ).toBeNull();
    });

    it('warns "kort" below union min', () => {
      expect(getTeeLengthWarning({ ...both, length_meters: '4500' })).toBe(
        'Uvanlig kort for norsk dame-/herretee (4700–6600 m).',
      );
    });

    it('warns "lang" above union max', () => {
      expect(getTeeLengthWarning({ ...both, length_meters: '6700' })).toBe(
        'Uvanlig lang for norsk dame-/herretee (4700–6600 m).',
      );
    });
  });

  describe('union: mens + juniors', () => {
    const tee: TeeLengthWarningInput = {
      ...emptyTee,
      slope_mens: '125',
      course_rating_mens: '70.5',
      slope_juniors: '120',
      course_rating_juniors: '68.0',
    };

    it('warns above union with herre-/juniortee text', () => {
      expect(getTeeLengthWarning({ ...tee, length_meters: '6800' })).toBe(
        'Uvanlig lang for norsk herre-/juniortee (4400–6600 m).',
      );
    });
  });

  describe('union: ladies + juniors', () => {
    const tee: TeeLengthWarningInput = {
      ...emptyTee,
      slope_ladies: '130',
      course_rating_ladies: '72.0',
      slope_juniors: '120',
      course_rating_juniors: '68.0',
    };

    it('warns above union with dame-/juniortee text', () => {
      expect(getTeeLengthWarning({ ...tee, length_meters: '6100' })).toBe(
        'Uvanlig lang for norsk dame-/juniortee (4400–5900 m).',
      );
    });
  });

  describe('union: all three genders', () => {
    const all: TeeLengthWarningInput = {
      ...emptyTee,
      slope_mens: '125',
      course_rating_mens: '70.5',
      slope_ladies: '130',
      course_rating_ladies: '72.0',
      slope_juniors: '120',
      course_rating_juniors: '68.0',
    };

    it('returns null at union boundaries 4400 and 6600', () => {
      expect(
        getTeeLengthWarning({ ...all, length_meters: '4400' }),
      ).toBeNull();
      expect(
        getTeeLengthWarning({ ...all, length_meters: '6600' }),
      ).toBeNull();
    });

    it('warns "lang" above union with all-genders text', () => {
      expect(getTeeLengthWarning({ ...all, length_meters: '7000' })).toBe(
        'Uvanlig lang for norsk tee for alle kjønn (4400–6600 m).',
      );
    });

    it('warns "kort" below union with all-genders text', () => {
      expect(getTeeLengthWarning({ ...all, length_meters: '4000' })).toBe(
        'Uvanlig kort for norsk tee for alle kjønn (4400–6600 m).',
      );
    });
  });

  describe('partial gender activation', () => {
    it('treats gender as active when only slope is filled', () => {
      const tee: TeeLengthWarningInput = {
        ...emptyTee,
        slope_mens: '125',
        length_meters: '4500',
      };
      expect(getTeeLengthWarning(tee)).toBe(
        'Uvanlig kort for norsk herretee (5300–6600 m).',
      );
    });

    it('treats gender as active when only CR is filled', () => {
      const tee: TeeLengthWarningInput = {
        ...emptyTee,
        course_rating_mens: '70.5',
        length_meters: '4500',
      };
      expect(getTeeLengthWarning(tee)).toBe(
        'Uvanlig kort for norsk herretee (5300–6600 m).',
      );
    });
  });

  describe('invalid or empty length', () => {
    const mens: TeeLengthWarningInput = {
      ...emptyTee,
      slope_mens: '125',
      course_rating_mens: '70.5',
    };

    it('returns null for empty length string', () => {
      expect(
        getTeeLengthWarning({ ...mens, length_meters: '' }),
      ).toBeNull();
    });

    it('returns null for non-numeric length', () => {
      expect(
        getTeeLengthWarning({ ...mens, length_meters: 'abc' }),
      ).toBeNull();
    });

    it('returns null for whitespace-only length', () => {
      expect(
        getTeeLengthWarning({ ...mens, length_meters: '   ' }),
      ).toBeNull();
    });
  });
});
