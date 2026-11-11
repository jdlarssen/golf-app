// #2753: typevalget sier det samme som nettets steg 1, tegn for tegn.
import source from '../../../../messages/no.json';
import { TEAM_FORMAT_PLAYER_CAP } from '../../../../lib/games/teamFormatLimits';
import { ARRANGEMENT_TEXT, ARRANGEMENT_TILES, type AppIntent } from './arrangementCopy';

const web = source.wizard;

describe('ordlyden er nettets', () => {
  it('tittelen og hintet', () => {
    expect(ARRANGEMENT_TEXT.title).toBe(web.stepTitle['1']);
    expect(ARRANGEMENT_TEXT.noIntent).toBe(web.disabledHint.step1NoIntent);
  });

  it.each<AppIntent>(['kompis', 'klubb', 'cup'])('flisen %s', (intent) => {
    expect(ARRANGEMENT_TILES[intent].label).toBe(web.intent[intent].label);
    expect(ARRANGEMENT_TILES[intent].description).toBe(
      web.intent[intent].description.replace('{max}', String(TEAM_FORMAT_PLAYER_CAP)),
    );
  });

  it('har ikke «Solo / test»', () => {
    expect(Object.keys(ARRANGEMENT_TILES)).toEqual(['kompis', 'klubb', 'cup']);
  });
});
