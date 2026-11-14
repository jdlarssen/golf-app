// #2297 (Type A): regnestykkene bak handicaplinjalen. Alt er tideler, så
// `toBe` holder: 13,799999 ville vært rødt her.
import { HCP_MAX, HCP_RULER_MIN } from '../../../../lib/users/profileInput';
import {
  hcpChange,
  hcpToOffset,
  offsetToHcp,
  parseRulerField,
  RULER_STEP,
  rulerFieldProblem,
  rulerMin,
  rulerSteps,
  stepHcp,
} from './hcpRuler';

describe('stepHcp', () => {
  it('fire tideler ned fra 14,2 gir nøyaktig 13,8', () => {
    let value = 14.2;
    for (let i = 0; i < 4; i += 1) value = stepHcp(value, -1, -8);
    expect(value).toBe(13.8);
  });

  it.each([
    ['ned til plussenden', -7.9, -1, -8, -8],
    ['stopper på plussenden', -8, -1, -8, -8],
    ['opp til 54', 53.9, 2, -8, 54],
    ['stopper på 54', 54, 1, -8, HCP_MAX],
    ['over null til pluss', 0.4, -10, -8, -0.6],
    ['fra pluss til null, ikke −0', -0.1, 1, -8, 0],
    ['et lagret +9,5 er sin egen ende', -9.5, -1, -9.5, -9.5],
  ])('%s: %s %s → %s', (_label, from, delta, min, expected) => {
    const value = stepHcp(from, delta, min);
    expect(value).toBe(expected);
    expect(Object.is(value, -0)).toBe(false);
  });
});

describe('rulerMin', () => {
  it.each([
    [-9.5, -9.5],
    [-8, -8],
    [3, HCP_RULER_MIN],
    [null, HCP_RULER_MIN],
  ])('lagret %s → %s', (stored, expected) => {
    expect(rulerMin(stored)).toBe(expected);
  });

  it('linjalen har 620 tideler fra +8 til 54', () => {
    expect(rulerSteps(-8)).toBe(620);
  });
});

describe('offset og verdi', () => {
  it.each([-8, -0.6, 0, 13.8, 54])('%s fram og tilbake', (value) => {
    expect(offsetToHcp(hcpToOffset(value, -8), -8)).toBe(value);
  });

  it('12 pt er én tidel, og halvveis rundes til nærmeste merke', () => {
    expect(RULER_STEP).toBe(12);
    expect(hcpToOffset(-7.9, -8)).toBe(12);
    expect(offsetToHcp(5.9, -8)).toBe(-8);
    expect(offsetToHcp(6.1, -8)).toBe(-7.9);
  });

  it('en sprett forbi endene gir endene', () => {
    expect(offsetToHcp(-40, -8)).toBe(-8);
    expect(offsetToHcp(hcpToOffset(54, -8) + 50, -8)).toBe(54);
  });
});

describe('hcpChange', () => {
  it.each([
    [14.2, 13.8, 'down', 0.4],
    [0.4, -0.6, 'down', 1],
    [13.8, 14.2, 'up', 0.4],
    [14.2, 14.2, 'none', 0],
  ] as const)('%s → %s er %s %s', (from, to, direction, amount) => {
    expect(hcpChange(from, to)).toEqual({ direction, amount });
  });
});

describe('parseRulerField', () => {
  it.each([
    ['13,8', 13.8],
    ['13.8', 13.8],
    [' 13,8 ', 13.8],
    ['+0,6', -0.6],
    ['+8', -8],
    ['0', 0],
    ['54', 54],
    ['12,55', 12.6],
  ])('«%s» → %s', (raw, expected) => {
    expect(parseRulerField(raw, -8)).toBe(expected);
  });

  it.each(['54,1', 'abc', '', '+8,1', '-3', '1,2,3'])('«%s» → null', (raw) => {
    expect(parseRulerField(raw, -8)).toBeNull();
  });

  it('et lagret +9,5 kan skrives inn igjen', () => {
    expect(parseRulerField('+9,5', -9.5)).toBe(-9.5);
  });

  it('skiller pluss forbi enden fra alt annet', () => {
    expect(rulerFieldProblem('+8,1', -8)).toBe('plus_beyond_min');
    expect(rulerFieldProblem('+12', -8)).toBe('plus_beyond_min');
    expect(rulerFieldProblem('60', -8)).toBe('range');
    expect(rulerFieldProblem('+abc', -8)).toBe('range');
  });
});
