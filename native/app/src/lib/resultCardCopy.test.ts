// #2756: paritets-porten for resultatets tekster, samme mønster som
// `boardCopy.test.ts`. Webbens strenger er tegn for tegn like, appens egne er ingen av dem.
import source from '../../../../messages/no.json';
import { RESULT_APP_TEXT, RESULT_CARD_TEXT, RESULT_MODE_TEXT, SHARE_RESULT_LABEL } from './resultCardCopy';

describe('paritet med messages/no.json', () => {
  it('kortets tekster er `leaderboard.shareCard`, tegn for tegn', () => {
    expect(RESULT_CARD_TEXT).toEqual(source.leaderboard.shareCard);
  });

  it('formatnavnene er `modes`, tegn for tegn', () => {
    const { playStyle: _ignored, ...modes } = source.modes as Record<string, unknown>;
    expect(RESULT_MODE_TEXT).toEqual(modes);
  });

  it('knappen er `leaderboard.common.shareResult`', () => {
    expect(SHARE_RESULT_LABEL).toBe(source.leaderboard.common.shareResult);
  });

  it('appens egne er ikke en av webbens', () => {
    const web = new Set(Object.values(source.leaderboard.shareCard));
    for (const value of Object.values(RESULT_APP_TEXT)) expect(web.has(value)).toBe(false);
  });
});
