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
});
