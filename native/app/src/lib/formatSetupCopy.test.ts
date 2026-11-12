// #2753 D3: oppsettet for de nye formatene sier det samme som nettet.
import source from '../../../../messages/no.json';
import { PATSOME_TEXT } from './formatSetupCopy';

const patsome = source.wizard.sections.patsome;

describe('Patsome-oppsettet er nettets', () => {
  it('overskrift, merknad og tellemåte', () => {
    expect(PATSOME_TEXT.legend).toBe(patsome.legend);
    expect(PATSOME_TEXT.handicapNote).toBe(patsome.handicapNote);
    expect(PATSOME_TEXT.scoringFrom).toBe(patsome.scoringFromLabel);
    expect(PATSOME_TEXT.net).toBe(patsome.scoringNetTitle);
    expect(PATSOME_TEXT.gross).toBe(patsome.scoringGrossTitle);
  });

  it.each([0, 1, 2] as const)('segment %i', (i) => {
    const n = i + 1;
    const web = patsome as unknown as Record<string, string>;
    expect(PATSOME_TEXT.segments[i]).toEqual({
      holes: web[`segment${n}Holes`],
      format: web[`segment${n}Format`],
      body: web[`segment${n}Body`],
    });
  });
});
