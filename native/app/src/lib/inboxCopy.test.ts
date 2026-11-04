// #2759: det innboksen i appen sier selv, er nettets, tegn for tegn. Testen
// bundles aldri, så den kan lese hele `messages/no.json`.
import source from '../../../../messages/no.json';
import {
  INBOX_TEXT,
  actionFilterLabel,
  decisionLine,
  inboxButtonA11yLabel,
} from './inboxCopy';

const web = source.inbox;

describe('paritet mot messages/no.json', () => {
  it.each([
    ['kicker', INBOX_TEXT.kicker, web.kicker],
    ['markAllAsRead', INBOX_TEXT.markAllAsRead, web.markAllAsRead],
    ['clearRead', INBOX_TEXT.clearRead, web.clearRead],
    ['actionFailed', INBOX_TEXT.actionFailed, web.actionFailed],
    ['emptyHeading', INBOX_TEXT.emptyHeading, web.emptyHeading],
    ['emptyBody', INBOX_TEXT.emptyBody, web.emptyBody],
    ['cleanPullQuote', INBOX_TEXT.cleanPullQuote, web.cleanPullQuote],
    ['emptyFilter', INBOX_TEXT.emptyFilter, web.emptyFilter],
    ['unreadLabel', INBOX_TEXT.unreadLabel, web.unreadLabel],
    ['somePlayerFallback', INBOX_TEXT.somePlayerFallback, web.somePlayerFallback],
  ])('%s', (_key, app, webText) => {
    expect(app).toBe(webText);
  });

  it('brikker, seksjoner, knapper og statuslinjer er de samme', () => {
    expect(INBOX_TEXT.filters).toEqual(web.filters);
    expect(INBOX_TEXT.sections).toEqual(web.sections);
    expect(INBOX_TEXT.buttons).toEqual(web.buttons);
    expect(INBOX_TEXT.status).toEqual(web.status);
  });

  it('feilene fra påmeldingssiden er de samme', () => {
    const errors = source.admin.game.signups.errors;
    expect(INBOX_TEXT.signupErrors).toEqual({
      game_locked: errors.game_locked,
      no_team_slot: errors.no_team_slot,
    });
  });
});

describe('actionFilterLabel', () => {
  it('har tallet når noe venter, og mister det ved 0', () => {
    expect(actionFilterLabel(2)).toBe('Krever handling · 2');
    expect(actionFilterLabel(0)).toBe('Krever handling');
  });
});

describe('decisionLine', () => {
  const base = { name: 'Kristian', gameName: 'Onsdagsgolfen', teamName: null };

  it('sier hva som skjedde, med navnet', () => {
    expect(decisionLine({ ...base, outcome: 'approved' })).toBe('Kristian er med i Onsdagsgolfen');
    expect(decisionLine({ ...base, outcome: 'rejected' })).toBe('Kristian fikk beskjed om at det ble nei');
  });

  it('en kaptein tar laget med seg', () => {
    const team = { ...base, teamName: 'Birdiejegerne' };
    expect(decisionLine({ ...team, outcome: 'approved' })).toBe('Lag Birdiejegerne er med i Onsdagsgolfen');
    expect(decisionLine({ ...team, outcome: 'rejected' })).toBe('Lag Birdiejegerne fikk beskjed om at det ble nei');
  });

  it('uten navn står nettets reserve', () => {
    expect(decisionLine({ ...base, name: null, outcome: 'approved' })).toBe('En spiller er med i Onsdagsgolfen');
  });
});

describe('inboxButtonA11yLabel', () => {
  it('sier tallet i klartekst', () => {
    expect(inboxButtonA11yLabel(0)).toBe('Innboks');
    expect(inboxButtonA11yLabel(1)).toBe('Innboks, 1 ulest');
    expect(inboxButtonA11yLabel(3)).toBe('Innboks, 3 uleste');
  });
});
