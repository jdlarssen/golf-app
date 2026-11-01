// `nextUnfilledHole`: hullet «Fortsett runden» peker på. Selve CTA-tilstanden
// bor i `lib/games/primaryCtaState.ts` og testes der (#2228).
import { nextUnfilledHole } from './primaryCtaState';

describe('nextUnfilledHole', () => {
  it.each<[string, number[], number]>([
    ['tom runde starter på hull 1', [], 1],
    ['hopper over hullene som er ført', [1, 2, 3], 4],
    ['finner hullet som ble hoppet over', [1, 2, 4, 5], 3],
    ['full runde faller tilbake til hull 1', Array.from({ length: 18 }, (_, i) => i + 1), 1],
  ])('%s', (_label: string, filled: number[], expected: number) => {
    expect(nextUnfilledHole(filled)).toBe(expected);
  });

  // #2752: andre halvdel av en delt cup-dag eier hull 10–18.
  const BACK_NINE = [10, 11, 12, 13, 14, 15, 16, 17, 18];
  it.each<[string, number[], number]>([
    ['tom andre halvdel starter på hull 10', [], 10],
    ['finner neste i halvdelen', [10, 11], 12],
    ['full andre halvdel faller tilbake til hull 10', BACK_NINE, 10],
  ])('%s', (_label: string, filled: number[], expected: number) => {
    expect(nextUnfilledHole(filled, BACK_NINE)).toBe(expected);
  });
});
