// #2753: typevalget sier det samme som nettets steg 1, tegn for tegn.
import source from '../../../../messages/no.json';
import { TEAM_FORMAT_PLAYER_CAP } from '../../../../lib/games/teamFormatLimits';
import {
  ARRANGEMENT_TEXT,
  ARRANGEMENT_TILES,
  CLUB_TEXT,
  clubCardLine,
  memberCountText,
  type AppIntent,
} from './arrangementCopy';

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

describe('klubbvalget sier det samme som nettet (#2753)', () => {
  it('overskrift, hint, hintet uten klubb og tom liste', () => {
    expect(CLUB_TEXT.legend).toBe(web.club.legend);
    expect(CLUB_TEXT.hint).toBe(web.club.hint);
    expect(CLUB_TEXT.noClub).toBe(web.disabledHint.step2NoClub);
    expect(CLUB_TEXT.emptyRoster).toBe(web.step4.emptyRosterHintClub);
    expect(CLUB_TEXT.noPlayers).toBe(source.game.players.noPlayers);
  });

  // ICU-flertallet fylles ikke av en enkel erstatning; formene står her.
  it.each([
    [1, '1 medlem'],
    [12, '12 medlemmer'],
    [0, '0 medlemmer'],
  ])('%i → %s', (count, text) => {
    expect(memberCountText(count)).toBe(text);
    expect(web.club.memberCount).toContain('one {# medlem}');
    expect(web.club.memberCount).toContain('other {# medlemmer}');
  });

  it('rollen står for eier og admin, ikke for et medlem', () => {
    expect(clubCardLine('owner', 12)).toBe(`${source.klubb.roles.owner} · 12 medlemmer`);
    expect(clubCardLine('admin', 1)).toBe(`${source.klubb.roles.admin} · 1 medlem`);
    expect(clubCardLine('member', 84)).toBe('84 medlemmer');
  });
});
