import { describe, it, expect } from 'vitest';
import { strokesReceived } from './strokesReceived';

/**
 * #1545: låser at slag-tellingen leser hullradene i matchen, ikke
 * 18-hulls-differansen. Regresjonen som utløste den: Greensome 2 på front 9
 * hadde 5 slag i differanse, men bare stroke index 1, 3 og 5 ligger på de ni
 * spilte hullene — laget mottok 3 slag, mens skjermen sa «+5 slag».
 */
describe('strokesReceived', () => {
  it('teller kun hullene som faktisk gir slag, og navngir dem', () => {
    // Front 9 av den ekte banen: hull 3, 5 og 8 har stroke index 1, 3 og 5.
    const rows = [
      { holeNumber: 1, extra: 0 },
      { holeNumber: 2, extra: 0 },
      { holeNumber: 3, extra: 1 },
      { holeNumber: 4, extra: 0 },
      { holeNumber: 5, extra: 1 },
      { holeNumber: 6, extra: 0 },
      { holeNumber: 7, extra: 0 },
      { holeNumber: 8, extra: 1 },
      { holeNumber: 9, extra: 0 },
    ];
    expect(strokesReceived(rows)).toEqual({ count: 3, holes: [3, 5, 8] });
  });

  it('summerer flere slag på samme hull, men lister hullet én gang', () => {
    const rows = [
      { holeNumber: 10, extra: 2 },
      { holeNumber: 11, extra: 1 },
    ];
    expect(strokesReceived(rows)).toEqual({ count: 3, holes: [10, 11] });
  });

  it('gir null slag for siden som ikke mottar noe', () => {
    expect(strokesReceived([{ holeNumber: 1, extra: 0 }])).toEqual({
      count: 0,
      holes: [],
    });
    expect(strokesReceived([])).toEqual({ count: 0, holes: [] });
  });
});
