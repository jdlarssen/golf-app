// #2748: tekstene på påmeldingsskjermen (Type A). Der nettsiden har samme tekst, er
// den låst mot `messages/no.json`, så de to ikke glir fra hverandre.
import source from '../../../../messages/no.json';
import { REGISTRATION_MESSAGE_MAX } from '../../../../lib/games/registration';
import { OFFLINE_NOTE } from './rosterCopy';
import {
  ROUND_INVITE_TEXT,
  describeRoundInviteFailure,
  describeRoundInviteLoadFailure,
  roundFeeLine,
  roundPlaceLine,
  roundWhenLine,
} from './roundInviteCopy';


const web = source.signup;

const ROUND = {
  name: 'Lørdagsrunden',
  modeLabel: 'Stableford',
  courseName: 'Larvik GK',
  teeName: 'Gul',
  teeOffAt: null,
  entryFeeKr: 150,
};

describe('nettsidens ordlyd', () => {
  it.each([
    ['kicker', ROUND_INVITE_TEXT.kicker, web.kicker],
    ['joinIntro', ROUND_INVITE_TEXT.joinIntro, web.soloOpenIntro],
    ['joinButton', ROUND_INVITE_TEXT.joinButton, web.signUpButton],
    ['joinPending', ROUND_INVITE_TEXT.joinPending, web.signUpPending],
    ['requestIntro', ROUND_INVITE_TEXT.requestIntro, web.soloManualIntro],
    ['requestPending', ROUND_INVITE_TEXT.requestPending, web.sendRequestPending],
    ['messageLabel', ROUND_INVITE_TEXT.messageLabel, web.messageLabel],
    ['messagePlaceholder', ROUND_INVITE_TEXT.messagePlaceholder, web.messagePlaceholder],
    ['closed', ROUND_INVITE_TEXT.closed, web.signupsClosedBanner],
    ['locked', ROUND_INVITE_TEXT.locked, web.errors.game_locked],
    ['notFound', ROUND_INVITE_TEXT.notFound, web.errors.game_not_found],
    ['wrongMode', ROUND_INVITE_TEXT.wrongMode, web.errors.wrong_mode],
    ['gameFull', ROUND_INVITE_TEXT.gameFull, web.errors.game_full],
    ['profileIncomplete', ROUND_INVITE_TEXT.profileIncomplete, web.errors.profile_incomplete],
    ['rateLimited', ROUND_INVITE_TEXT.rateLimited, web.errors.rate_limited],
    ['messageTooLong', ROUND_INVITE_TEXT.messageTooLong, web.errors.message_too_long],
    ['saveFailed', ROUND_INVITE_TEXT.saveFailed, web.errors.db_error],
  ])('%s er ordrett', (_key, app, site) => {
    expect(app).toBe(site);
  });

  it('teksten om lengden er taket i regelen', () => {
    expect(ROUND_INVITE_TEXT.messageTooLong).toContain(String(REGISTRATION_MESSAGE_MAX));
  });
});

describe('roundPlaceLine', () => {
  it('har format, bane og tee', () => {
    expect(roundPlaceLine(ROUND)).toBe('Stableford · Larvik GK · Gul tee');
  });

  it('hopper over det runden ikke har', () => {
    expect(roundPlaceLine({ ...ROUND, teeName: null })).toBe('Stableford · Larvik GK');
    expect(roundPlaceLine({ ...ROUND, courseName: null, teeName: null })).toBe('Stableford');
  });
});

describe('roundWhenLine', () => {
  it('har dag, dato og klokkeslett i lokaltid', () => {
    const local = new Date(2026, 10, 21, 9, 20).toISOString();
    expect(roundWhenLine(local)).toBe('Lørdag 21. november · kl. 09:20');
  });

  it.each([[null], ['ikke en dato']])('%s gir ingen linje', (iso) => {
    expect(roundWhenLine(iso)).toBeNull();
  });
});

describe('roundFeeLine', () => {
  // #2749: kontingenten står i appen.
  it('har beløpet', () => {
    expect(roundFeeLine(150)).toBe('Startkontingent 150 kr');
  });

  it('har ingen linje på null kroner', () => {
    expect(roundFeeLine(0)).toBeNull();
  });
});

describe('feilene', () => {
  it.each([
    ['wrong_mode', ROUND_INVITE_TEXT.wrongMode],
    ['game_full', ROUND_INVITE_TEXT.gameFull],
    ['profile_incomplete', ROUND_INVITE_TEXT.profileIncomplete],
    ['rate_limited', ROUND_INVITE_TEXT.rateLimited],
    ['message_too_long', ROUND_INVITE_TEXT.messageTooLong],
    ['db_error', ROUND_INVITE_TEXT.saveFailed],
    ['network', ROUND_INVITE_TEXT.saveFailed],
    ['offline', OFFLINE_NOTE],
    ['unauthorized', ROUND_INVITE_TEXT.unauthorized],
  ] as const)('%s har sin tekst', (reason, text) => {
    expect(describeRoundInviteFailure(reason)).toBe(text);
  });

  it.each([
    ['not_found', ROUND_INVITE_TEXT.notFound],
    ['load_failed', ROUND_INVITE_TEXT.loadFailed],
    ['network', ROUND_INVITE_TEXT.loadFailed],
    ['offline', ROUND_INVITE_TEXT.loadFailed],
    ['unauthorized', ROUND_INVITE_TEXT.unauthorized],
  ] as const)('henting: %s har sin tekst', (reason, text) => {
    expect(describeRoundInviteLoadFailure(reason)).toBe(text);
  });
});
