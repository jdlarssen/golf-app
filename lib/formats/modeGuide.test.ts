import { describe, it, expect } from 'vitest';
import { MODE_LABELS, type GameMode } from '@/lib/scoring/modes/types';
import { MODE_GUIDE } from './modeGuide';

// Type A completeness-test: MODE_GUIDE må dekke alle spillemoduser med reelt
// innhold. Guards mot at en ny modus legges til `GameMode`-unionen uten at
// noen skriver player-rettet «korte regler» for den (#299). TS-typen
// `Record<GameMode, ModeGuide>` fanger manglende nøkler ved compile; denne
// testen fanger TOMT innhold (tom summary, for få punkter) som typen ikke ser.

const ALL_MODES = Object.keys(MODE_LABELS) as GameMode[];

describe('MODE_GUIDE', () => {
  it('dekker alle moduser i MODE_LABELS', () => {
    for (const mode of ALL_MODES) {
      expect(MODE_GUIDE, `mangler guide for «${mode}»`).toHaveProperty(mode);
    }
  });

  it.each(ALL_MODES)('«%s» har en ikke-tom summary', (mode) => {
    expect(MODE_GUIDE[mode].summary.trim().length).toBeGreaterThan(0);
  });

  it.each(ALL_MODES)('«%s» har minst 2 ikke-tomme punkter', (mode) => {
    const points = MODE_GUIDE[mode].points;
    expect(points.length).toBeGreaterThanOrEqual(2);
    for (const point of points) {
      expect(point.trim().length).toBeGreaterThan(0);
    }
  });

  it('har ingen ekstra-nøkler utover GameMode-unionen', () => {
    const guideKeys = Object.keys(MODE_GUIDE).sort();
    const labelKeys = [...ALL_MODES].sort();
    expect(guideKeys).toEqual(labelKeys);
  });
});
