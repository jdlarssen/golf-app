// #2840: tekstene i lagskjemaet og svaret (Type A). Der nettsiden har samme feil, er
// appens tekst låst mot `messages/no.json`, så de to ikke glir fra hverandre.
import source from '../../../../messages/no.json';
import { validateTeamName } from '../../../../lib/games/teamName';
import { ROUND_INVITE_TEXT } from './roundInviteCopy';
import { OFFLINE_NOTE } from './rosterCopy';
import {
  TEAM_SIGNUP_TEXT,
  describeTeamNameError,
  describeTeamSignupFailure,
  firstName,
  friendTeamLine,
  fullRoundPlace,
  inviteBody,
  inviteTitle,
  isRetryableTeamFailure,
  nameCounter,
  noHitLine,
  pickMoreLabel,
  slotResultLabel,
  submitTeamLabel,
  teamFormMeta,
  teamRoundLine,
} from './teamSignupCopy';

const errors = source.signup.errors;

const ROUND = {
  name: 'Onsdagsgolfen',
  modeLabel: 'Texas scramble',
  courseName: 'Byneset',
  teeName: null,
  // Jest kjører i UTC (`jest.config.js`), så lokaltid er UTC her.
  teeOffAt: '2026-11-19T17:30:00.000Z',
  entryFeeKr: 0,
};

describe('nettsidens ordlyd', () => {
  it.each([
    ['teammateNotFriend', TEAM_SIGNUP_TEXT.teammateNotFriend, errors.teammate_not_friend],
    ['duplicateMembers', TEAM_SIGNUP_TEXT.duplicateMembers, errors.duplicate_members],
    ['teamFull', TEAM_SIGNUP_TEXT.teamFull, errors.team_full],
    ['gameFull', TEAM_SIGNUP_TEXT.gameFull, errors.game_full],
    ['teamNameInvalid', TEAM_SIGNUP_TEXT.teamNameInvalid, errors.team_name_invalid],
    ['slotsCountWrong', TEAM_SIGNUP_TEXT.slotsCountWrong, errors.slots_count_wrong],
    ['selfInSlots', TEAM_SIGNUP_TEXT.selfInSlots, errors.self_in_slots],
    ['alreadyRegistered', TEAM_SIGNUP_TEXT.alreadyRegistered, errors.already_registered],
    ['wrongType', TEAM_SIGNUP_TEXT.wrongType, errors.wrong_type],
    ['modeNoTeams', TEAM_SIGNUP_TEXT.modeNoTeams, errors.mode_does_not_support_teams],
  ])('%s er nettsidens', (_key, app, web) => {
    expect(app).toBe(web);
  });
});

describe('knappen og feltet', () => {
  it('teller ned og blir «Meld på» med lagnavnet', () => {
    expect(pickMoreLabel(3)).toBe('Velg 3 til');
    expect(submitTeamLabel('Birdie-jegerne')).toBe('Meld på Birdie-jegerne');
    expect(nameCounter(2, 40)).toBe('2/40');
  });

  // Regelen er `validateTeamName`, den samme nettsiden bruker. Her er bare ordene.
  it.each([
    ['', 'Skriv inn et lagnavn.'],
    ['Bi', 'Lagnavnet må ha minst 3 tegn.'],
    ['x'.repeat(41), 'Lagnavnet kan ha maks 40 tegn.'],
  ])('%j gir «%s»', (name, text) => {
    const error = validateTeamName(name);
    expect(error).not.toBeNull();
    expect(describeTeamNameError(error!)).toBe(text);
  });

  it('et godt navn gir ingen feil', () => {
    expect(validateTeamName('Birdie-jegerne')).toBeNull();
  });

  it('søket uten treff siterer det du skrev', () => {
    expect(noHitLine(' Jonas ')).toBe('Ingen av vennene dine heter «Jonas».');
  });
});

describe('vennene', () => {
  const stats = (roundsTogether: number) => ({ roundsTogether, lastPlayedAt: null, lastGameName: null });

  it.each([
    ['HCP og runder', { hcp: 18, stats: stats(6) }, 'HCP 18,0 · 6 runder sammen'],
    ['én runde', { hcp: 25.1, stats: stats(1) }, 'HCP 25,1 · 1 runde sammen'],
    ['ingen runder', { hcp: null, stats: stats(0) }, 'Ingen runder sammen ennå'],
    ['tallene mangler', { hcp: null, stats: null }, null],
  ])('%s', (_label, friend, line) => {
    expect(friendTeamLine(friend)).toBe(line);
  });

  it('fornavnet er første ord', () => {
    expect(firstName('Kari Nord')).toBe('Kari');
    expect(firstName(null)).toBe('');
  });
});

describe('linjene om runden', () => {
  it('skjemaet: navn, dag og plasser', () => {
    expect(teamFormMeta({ round: ROUND, seats: { kind: 'capped', cap: 12, held: 8 } })).toBe(
      'Onsdagsgolfen · tor 19. nov · 8 av 12 plasser',
    );
  });

  it('uten tid og tak står bare navnet', () => {
    expect(teamFormMeta({ round: { ...ROUND, teeOffAt: null }, seats: null })).toBe('Onsdagsgolfen');
  });

  it('svaret og «sendt»: navn, dag og klokkeslett', () => {
    expect(teamRoundLine(ROUND)).toBe('Onsdagsgolfen · tor 19. nov kl. 17:30');
  });

  it('full runde: dagen med stor forbokstav, og plassene', () => {
    expect(fullRoundPlace({ round: ROUND, seats: { kind: 'capped', cap: 12, held: 12 } })).toBe(
      'Tor 19. nov kl. 17:30 · 12 av 12 plasser · fullt',
    );
  });
});

describe('invitasjonen og svaret', () => {
  it('kapteinens fornavn, eller «Kapteinen»', () => {
    expect(inviteTitle('Kari Nord')).toBe('Kari vil ha deg med på laget');
    expect(inviteTitle(null)).toBe('Kapteinen vil ha deg med på laget');
  });

  it('et ja sier hva det gjør', () => {
    expect(inviteBody('instant')).toBe(TEAM_SIGNUP_TEXT.joinInstant);
    expect(inviteBody('approval')).toBe(TEAM_SIGNUP_TEXT.joinApproval);
  });

  it.each([
    [{ ok: true as const, userId: 'u', name: 'Ola' }, 'Får varsel'],
    [{ ok: false as const, userId: 'u', name: 'Per', reason: 'alreadyRegistered' as const }, 'Er alt påmeldt'],
    [{ ok: false as const, userId: 'u', name: 'Per', reason: 'dbError' as const }, 'Ble ikke lagt til'],
  ])('%j → %s', (result, label) => {
    expect(slotResultLabel(result)).toBe(label);
  });
});

describe('feilene', () => {
  it.each([
    ['teammate_not_friend', TEAM_SIGNUP_TEXT.teammateNotFriend],
    ['team_full', TEAM_SIGNUP_TEXT.teamFull],
    ['duplicate_members', TEAM_SIGNUP_TEXT.duplicateMembers],
    ['wrong_mode', ROUND_INVITE_TEXT.wrongMode],
    ['offline', OFFLINE_NOTE],
    ['db_error', ROUND_INVITE_TEXT.saveFailed],
  ] as const)('%s → teksten sin', (reason, text) => {
    expect(describeTeamSignupFailure(reason)).toBe(text);
  });

  it.each([
    ['network', true],
    ['offline', true],
    ['db_error', true],
    ['teammate_not_friend', false],
  ] as const)('%s kan prøves igjen: %s', (reason, retry) => {
    expect(isRetryableTeamFailure(reason)).toBe(retry);
  });
});
