// native/app/src/lib/hcpRuler.test.ts
// #2297: regnestykket bak handicap-linjalen. Type A. Alt er tideler: 14,2 − 4 × 0,1
// skal være NØYAKTIG 13,8 (`toBe`), og linjalen stopper på −8 og 54.
import {
  hcpChange,
  hcpToOffset,
  isPlusOverLimit,
  offsetToHcp,
  parseRulerField,
  RULER_TICK_PT,
  rulerMin,
  rulerSteps,
  stepHcp,
} from './hcpRuler';

describe('stepHcp', () => {
  it('regner i tideler, uten flyttallsstøy', () => {
    let value = 14.2;
    for (let i = 0; i < 4; i++) value = stepHcp(value, -1, -8);
    expect(value).toBe(13.8);
  });

  it.each([
    [-7.9, -1, -8, -8],
    [-8, -1, -8, -8],
    [53.9, 2, -8, 54],
    [54, 1, -8, 54],
    [0.3, -10, -8, -0.7],
    [0, -1, -8, -0.1],
    [-9.5, -1, -9.5, -9.5],
  ])('%p + %p tideler, stopp %p gir %p', (value, delta, min, expected) => {
    expect(stepHcp(value, delta, min)).toBe(expected);
  });
});

describe('rulerMin', () => {
  it.each([
    [-9.5, -9.5],
    [3, -8],
    [-8, -8],
    [-0.6, -8],
  ])('lagret %p gir stopp %p', (stored, expected) => {
    expect(rulerMin(stored)).toBe(expected);
  });
});

describe('offsetToHcp og hcpToOffset', () => {
  it.each([-8, 0, 13.8, 54, -0.6])('%p går fram og tilbake', (value) => {
    const x = hcpToOffset(value, -8);
    expect(offsetToHcp(x, -8)).toBe(value);
  });

  it('er 12 pt per tidel, og null i bunnen', () => {
    expect(RULER_TICK_PT).toBe(12);
    expect(hcpToOffset(-8, -8)).toBe(0);
    expect(hcpToOffset(-7.9, -8)).toBe(12);
    expect(rulerSteps(-8)).toBe(620);
    expect(hcpToOffset(54, -8)).toBe(620 * 12);
  });

  it('runder til nærmeste tidel og klemmer utenfor', () => {
    expect(offsetToHcp(5, -8)).toBe(-8);
    expect(offsetToHcp(7, -8)).toBe(-7.9);
    expect(offsetToHcp(-100, -8)).toBe(-8);
    expect(offsetToHcp(99999, -8)).toBe(54);
  });
});

describe('hcpChange', () => {
  it('lavere er ned, høyere er opp, likt er ingenting', () => {
    expect(hcpChange(14.2, 13.8)).toEqual({ direction: 'down', amount: 0.4 });
    expect(hcpChange(13.8, 14.2)).toEqual({ direction: 'up', amount: 0.4 });
    expect(hcpChange(14.2, 14.2)).toEqual({ direction: 'none', amount: 0 });
  });

  it('går over nullpunktet til plusshandicap', () => {
    expect(hcpChange(0.4, -0.6)).toEqual({ direction: 'down', amount: 1 });
  });
});

describe('parseRulerField', () => {
  it.each([
    ['13,8', 13.8],
    ['13.8', 13.8],
    [' 13,8 ', 13.8],
    ['+0,6', -0.6],
    ['+ 0,6', -0.6],
    ['0', 0],
    ['+0', 0],
    ['54', 54],
    ['13,84', 13.8],
    ['12,5,', 12.5],
    ['+8,0', -8],
  ])('%p gir %p', (raw, expected) => {
    expect(parseRulerField(raw, -8)).toBe(expected);
  });

  it.each(['54,1', 'abc', '', '+', '+8,1', '-3', '1,2,3', '60', '12abc'])('%p gir null med stopp −8', (raw) => {
    expect(parseRulerField(raw, -8)).toBeNull();
  });

  it('slipper et plusshandicap ned til den lagrede verdien', () => {
    expect(parseRulerField('+9,5', -9.5)).toBe(-9.5);
    expect(parseRulerField('+9,6', -9.5)).toBeNull();
  });
});

describe('isPlusOverLimit', () => {
  it('er bare sann for et gyldig tall med pluss over stoppen', () => {
    expect(isPlusOverLimit('+8,1', -8)).toBe(true);
    expect(isPlusOverLimit('+12', -8)).toBe(true);
    expect(isPlusOverLimit('+8,0', -8)).toBe(false);
    expect(isPlusOverLimit('60', -8)).toBe(false);
    expect(isPlusOverLimit('+abc', -8)).toBe(false);
  });
});
