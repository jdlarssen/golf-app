import { describe, it, expect } from 'vitest';
import { MODE_LABELS, type GameMode } from '@/lib/scoring/modes/types';
import { MODE_GUIDE, STABLEFORD_4BBB_GUIDE, resolveModeGuide } from './modeGuide';

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

describe('resolveModeGuide (4BBB-variant, #282)', () => {
  it('gir 4BBB-guiden for stableford team_size 2', () => {
    expect(resolveModeGuide('stableford', 2)).toBe(STABLEFORD_4BBB_GUIDE);
  });

  it('gir 4BBB-guiden for modifisert stableford team_size 2', () => {
    expect(resolveModeGuide('modified_stableford', 2)).toBe(STABLEFORD_4BBB_GUIDE);
  });

  it('gir solo-guiden for stableford team_size 1', () => {
    expect(resolveModeGuide('stableford', 1)).toBe(MODE_GUIDE.stableford);
  });

  it('rører ikke andre lag-moduser (best ball team_size 2 → best ball-guide)', () => {
    expect(resolveModeGuide('best_ball', 2)).toBe(MODE_GUIDE.best_ball);
  });

  it('4BBB-guiden forklarer at beste poeng per hull teller', () => {
    expect(STABLEFORD_4BBB_GUIDE.summary).toMatch(/beste/i);
    expect(STABLEFORD_4BBB_GUIDE.points.length).toBeGreaterThanOrEqual(2);
  });
});
