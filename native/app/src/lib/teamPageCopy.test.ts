// #2840 del 3: tekstene på lagsiden (Type A). Tegningen v3.1, «3. Lagsiden», står ordrett.
import type { AppTeamPageMember, AppTeamPageTeam } from '../../../../lib/games/appRoundInviteView';
import { ROUND_INVITE_TEXT } from './roundInviteCopy';
import {
  TEAM_PAGE_TEXT,
  addFriendLabel,
  attachBody,
  describeTeamPageFailure,
  describeTeamPageLoadFailure,
  isRetryableTeamPageFailure,
  memberStatusLine,
  pickerMeta,
  removeBody,
  removeButton,
  removeTitle,
  resentLine,
  teamLinkLine,
  teamMetaLine,
  transferBody,
  transferTitle,
} from './teamPageCopy';

const member = (name: string, status: AppTeamPageMember['status']): AppTeamPageMember => ({
  requestId: `r-${name}`,
  userId: `u-${name}`,
  displayName: name,
  status,
  isGuest: false,
});

function team(overrides: Partial<AppTeamPageTeam> = {}): AppTeamPageTeam {
  return {
    kind: 'captain',
    game: {
      id: 'g1',
      shortId: 'abcd2345',
      name: 'Onsdagsgolfen',
      courseName: null,
      joinEffect: 'instant',
      signupsClosed: false,
      teamSize: 4,
      teeOffAt: null,
    },
    myRowId: 'r-meg',
    myStatus: 'approved',
    teamName: 'Birdie-jegerne',
    captain: { requestId: 'r-meg', userId: 'u-meg', displayName: 'Martin Berg', status: 'approved' },
    members: [member('Ola Kompis', 'approved'), member('Kari Nord', 'pending'), member('Per Hansen', 'rejected')],
    ...overrides,
  };
}

describe('tegningens ord', () => {
  it.each([
    ['approved', 'Med på laget'],
    ['pending', 'Venter på svar'],
    ['declined', 'Takket nei'],
  ] as const)('%s er «%s»', (state, text) => {
    expect(memberStatusLine(state)).toBe(text);
  });

  it('kapteinen: «Onsdagsgolfen · påmeldt · 2 av 3 har svart ja»', () => {
    expect(teamMetaLine(team())).toBe('Onsdagsgolfen · påmeldt · 2 av 3 har svart ja');
  });

  it('med en ledig plass: «Onsdagsgolfen · påmeldt · 1 plass ledig»', () => {
    const value = team({ members: [member('Ola Kompis', 'approved'), member('Kari Nord', 'pending')] });
    expect(teamMetaLine(value)).toBe('Onsdagsgolfen · påmeldt · 1 plass ledig');
  });

  it('kapteinen som venter på arrangøren, og to ledige plasser', () => {
    const value = team({ myStatus: 'pending', members: [member('Ola Kompis', 'approved')] });
    expect(teamMetaLine(value)).toBe('Onsdagsgolfen · venter på arrangøren · 2 plasser ledig');
  });

  it.each([
    ['approved', 'Onsdagsgolfen · du er med på laget'],
    ['pending', 'Onsdagsgolfen · du har ikke svart ennå'],
    ['rejected', 'Onsdagsgolfen · du takket nei'],
  ] as const)('medspilleren, %s: «%s»', (myStatus, line) => {
    expect(teamMetaLine(team({ kind: 'member', myStatus }))).toBe(line);
  });

  it('raden på runden: «Laget ditt · 2 av 3 har svart ja»', () => {
    expect(teamLinkLine(team())).toBe('Laget ditt · 2 av 3 har svart ja');
  });

  it('velgeren: «Birdie-jegerne · 1 plass ledig» og «Legg Ingrid til på laget»', () => {
    expect(pickerMeta('Birdie-jegerne', 1)).toBe('Birdie-jegerne · 1 plass ledig');
    expect(addFriendLabel('Ingrid Næss')).toBe('Legg Ingrid til på laget');
  });

  it('bekreftelsen før fjerning, for en som ikke har svart', () => {
    expect(removeTitle('Kari Nord')).toBe('Fjerne Kari Nord fra laget?');
    expect(removeBody('Kari Nord', 'Birdie-jegerne', true)).toBe(
      'Kari er ikke lenger med på Birdie-jegerne, og invitasjonen faller bort. Plassen blir ledig, og du kan velge en annen venn etterpå.',
    );
    expect(removeButton('Kari Nord')).toBe('Fjern Kari Nord');
  });

  it('for en som har sagt ja, faller ingen invitasjon bort', () => {
    expect(removeBody('Ola Kompis', 'Birdie-jegerne', false)).toBe(
      'Ola er ikke lenger med på Birdie-jegerne. Plassen blir ledig, og du kan velge en annen venn etterpå.',
    );
  });

  it('bekreftelsen før kapteinsbyttet', () => {
    expect(transferTitle('Ola Kompis')).toBe('Gi kapteinsrollen til Ola Kompis?');
    expect(transferBody('Ola Kompis', 'Birdie-jegerne')).toBe(
      'Ola blir kaptein for Birdie-jegerne. Du blir en vanlig medspiller og kan ikke lenger endre laget.',
    );
  });

  it('uten navn og lagnavn står reserveordene', () => {
    expect(removeTitle(null)).toBe('Fjerne medspilleren fra laget?');
    expect(transferBody(null, null)).toBe(
      'Medspilleren blir kaptein for laget. Du blir en vanlig medspiller og kan ikke lenger endre laget.',
    );
  });

  it('en gammel invitasjon på e-post', () => {
    expect(attachBody('instant')).toBe('Invitasjonen kom på e-post. Du blir med i runden med en gang.');
    expect(attachBody('approval')).toMatch(/må arrangøren godta laget/);
  });

  it('«Send på nytt» gikk', () => {
    expect(resentLine('Kari Nord')).toBe('Kari har fått varselet på nytt.');
  });
});

describe('feilene', () => {
  it.each([
    ['game_locked', ROUND_INVITE_TEXT.locked],
    ['signup_closed', ROUND_INVITE_TEXT.closed],
    ['captain_is_guest', TEAM_PAGE_TEXT.captainIsGuest],
    ['not_approved', TEAM_PAGE_TEXT.notApproved],
    ['already_registered', TEAM_PAGE_TEXT.friendTaken],
    ['network', ROUND_INVITE_TEXT.saveFailed],
  ] as const)('%s', (reason, text) => {
    expect(describeTeamPageFailure(reason)).toBe(text);
  });

  it.each([
    ['network', true],
    ['offline', true],
    ['db_error', true],
    ['team_full', false],
    ['captain_is_guest', false],
  ] as const)('%s kan prøves igjen: %s', (reason, retry) => {
    expect(isRetryableTeamPageFailure(reason)).toBe(retry);
  });

  it('en henting som feiler, sier at laget ikke kom, og en ukjent runde er påmeldingens tekst', () => {
    expect(describeTeamPageLoadFailure('network')).toBe(TEAM_PAGE_TEXT.loadFailed);
    expect(describeTeamPageLoadFailure('not_found')).toBe(ROUND_INVITE_TEXT.notFound);
  });
});
