// #2759: innboksens tekster er webbens, tegn for tegn. Testen bundles aldri, så den
// kan lese hele `messages/no.json`, og den blir rød når en setning rettes på webben
// uten at appen følger etter.
import source from '../../../../messages/no.json';
import { INBOX_TEXT, actionChipLabel, decidedLine, inboxButtonLabel } from './inboxCopy';

const web = source.inbox;
const signups = source.admin.game.signups.errors;

describe('paritet mot messages/no.json', () => {
  it('overskrift, knapper og tomtilstander', () => {
    expect(INBOX_TEXT.heading).toBe(web.kicker);
    expect(INBOX_TEXT.markAll).toBe(web.markAllAsRead);
    expect(INBOX_TEXT.clearRead).toBe(web.clearRead);
    expect(INBOX_TEXT.unread).toBe(web.unreadLabel);
    expect(INBOX_TEXT.emptyHeading).toBe(web.emptyHeading);
    expect(INBOX_TEXT.emptyBody).toBe(web.emptyBody);
    expect(INBOX_TEXT.cleanPullQuote).toBe(web.cleanPullQuote);
    expect(INBOX_TEXT.emptyFilter).toBe(web.emptyFilter);
    expect(INBOX_TEXT.actionFailed).toBe(web.actionFailed);
    expect(INBOX_TEXT.somePlayer).toBe(web.somePlayerFallback);
  });

  it('brikkene', () => {
    expect(INBOX_TEXT.filterLabel).toBe(web.filters.label);
    expect(INBOX_TEXT.filterAll).toBe(web.filters.all);
    expect(INBOX_TEXT.filterAction).toBe(web.filters.action);
    expect(INBOX_TEXT.filterFriends).toBe(web.filters.friends);
    expect(actionChipLabel(3)).toBe(web.filters.actionCount.replace('{count}', '3'));
  });

  it('seksjonene', () => {
    expect(INBOX_TEXT.sections).toEqual(web.sections);
  });

  it('knappene: alle webben har, unntatt de to som har egne felt', () => {
    const { approve, reject, ...rest } = web.buttons;
    expect(INBOX_TEXT.buttons).toEqual(rest);
    expect(INBOX_TEXT.approve).toBe(approve);
    expect(INBOX_TEXT.reject).toBe(reject);
  });

  it('statuslinjene', () => {
    expect(INBOX_TEXT.alreadyDecided).toBe(web.status.alreadyDecided);
    expect(INBOX_TEXT.forbidden).toBe(web.status.forbidden);
    expect(INBOX_TEXT.gameLocked).toBe(signups.game_locked);
    expect(INBOX_TEXT.noTeamSlot).toBe(signups.no_team_slot);
    const fill = (text: string, name: string, teamName: string, gameName: string) =>
      text.replace('{name}', name).replace('{teamName}', teamName).replace('{gameName}', gameName);
    expect(decidedLine('approved', { name: 'Kristian', teamName: null, gameName: 'G' })).toBe(
      fill(web.status.approved, 'Kristian', '', 'G'),
    );
    expect(decidedLine('approved', { name: 'Kristian', teamName: 'L', gameName: 'G' })).toBe(
      fill(web.status.approvedTeam, 'Kristian', 'L', 'G'),
    );
    expect(decidedLine('rejected', { name: 'Kristian', teamName: null, gameName: 'G' })).toBe(
      fill(web.status.rejected, 'Kristian', '', 'G'),
    );
    expect(decidedLine('rejected', { name: 'Kristian', teamName: 'L', gameName: 'G' })).toBe(
      fill(web.status.rejectedTeam, 'Kristian', 'L', 'G'),
    );
  });
});

describe('tekstene med tall', () => {
  it('brikka mister tallet ved 0', () => {
    expect(actionChipLabel(0)).toBe('Krever handling');
  });

  it('uten navn står webbens reserve', () => {
    expect(decidedLine('approved', { name: null, teamName: null, gameName: 'G' })).toBe('En spiller er med i G');
  });

  it('knappen på Hjem gir skjermleseren tallet i klartekst, og bøyer det', () => {
    expect(inboxButtonLabel(0)).toBe('Innboks');
    expect(inboxButtonLabel(1)).toBe('Innboks, 1 ulest');
    expect(inboxButtonLabel(3)).toBe('Innboks, 3 uleste');
  });
});
