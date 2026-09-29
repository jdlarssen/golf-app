// #2255: formatforklaringen i appen er webbens, tegn for tegn.
//
// Testen bundles aldri, så den kan lese hele `messages/no.json`. Den feiler
// når webben får et nytt format appen ikke har, og når en setning rettes på
// webben uten at appen følger etter.
import source from '../../../../messages/no.json';
import { resolveFormatContentKey } from '../../../../lib/games/formatLabel';
import { MODE_LABELS, type GameMode } from '../../../../lib/scoring/modes/types';
import { FORMAT_GUIDE, formatGuideFor } from './formatGuideCopy';

const web = source.formatGuide.content as Record<string, { summary: string; points: string[] }>;

describe('paritet mot messages/no.json', () => {
  it('appen har nøyaktig de nøklene webben har', () => {
    expect(Object.keys(FORMAT_GUIDE).sort()).toEqual(Object.keys(web).sort());
  });

  it.each(Object.keys(web))('%s: sammendrag og punkter er like', (key) => {
    expect(FORMAT_GUIDE[key]).toEqual({ summary: web[key]!.summary, points: web[key]!.points });
  });
});

describe('formatGuideFor', () => {
  it('hvert format appen kan møte, har en forklaring', () => {
    for (const mode of Object.keys(MODE_LABELS) as GameMode[]) {
      expect(formatGuideFor(resolveFormatContentKey(mode, 1))).not.toBeNull();
    }
    // Stableford for par har sin egen tekst.
    expect(formatGuideFor(resolveFormatContentKey('stableford', 2))).toBe(
      FORMAT_GUIDE['stableford-4bbb'],
    );
  });

  it('ukjent nøkkel gir null, ikke en arvet egenskap', () => {
    expect(formatGuideFor('ukjent')).toBeNull();
    expect(formatGuideFor('toString')).toBeNull();
  });
});
