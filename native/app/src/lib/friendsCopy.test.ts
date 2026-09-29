// native/app/src/lib/friendsCopy.test.ts
// #2256: tekstene på vennesiden. Type A, samme mønster som profileCopy.test.
//
//  1. Alt webben også sier, er `messages/no.json → friends` tegn for tegn.
//  2. Hver statuskode gir webbens setning, eller ingen linje der webben ikke
//     viser noe.
//  3. De app-egne linjene er ferdige setninger uten plassholdere.
//  4. Underlinjene fra designet: hva som står, og hva som står ute når et
//     tall mangler.
import source from '../../../../messages/no.json';
import {
  FRIEND_STATUSES,
  INVITE_STATUSES,
  type InviteStatus,
} from '../../../../lib/friends/friendStatus';
import type { WebApiFailure } from '../data/webApi';
import { isFinishedSentence } from '../test/copy';
import {
  FRIENDS_TEXT,
  declineA11yLabel,
  friendSheetValues,
  friendStatusLine,
  friendSubline,
  friendsFailureLine,
  friendsSectionTitle,
  friendsSubtitle,
  incomingSubline,
  inviteButton,
  inviteFailureLine,
  invitePrompt,
  invitedLine,
  lastPlayedLabel,
  removeConfirmMessage,
  roundsSubline,
} from './friendsCopy';

const web = source.friends;

/** Nøklene i FRIENDS_TEXT som speiler webben, med webbens nøkkel. */
const MIRRORED: Partial<Record<keyof typeof FRIENDS_TEXT, keyof typeof web>> = {
  heading: 'kicker',
  subtitle: 'subtitle',
  incomingSection: 'incomingSection',
  friendsSection: 'friendsSection',
  outgoingSection: 'outgoingSection',
  suggestionsSection: 'suggestionsSection',
  addByEmailSubtitle: 'addByEmailSubtitle',
  shareLinkSubtitle: 'shareLinkSubtitle',
  declineLabel: 'declineLabel',
  declinePending: 'declinePending',
  acceptLabel: 'acceptLabel',
  acceptPending: 'acceptPending',
  withdrawLabel: 'withdrawLabel',
  withdrawPending: 'withdrawPending',
  removeIdleLabel: 'removeIdleLabel',
  removeConfirmLabel: 'removeConfirmLabel',
  removePending: 'removePending',
  cancelLabel: 'cancelLabel',
  addEmailLabel: 'addEmailLabel',
  addEmailPending: 'addEmailPending',
  addEmailButton: 'addEmailButton',
  invitePending: 'invitePending',
  someoneFallback: 'someoneFallback',
};

describe('FRIENDS_TEXT', () => {
  it.each(Object.entries(FRIENDS_TEXT))('«%s» er en ferdig tekst', (_key, text) => {
    expect(isFinishedSentence(text)).toBe(true);
  });

  it.each(Object.entries(MIRRORED))('«%s» er webbens «%s» tegn for tegn', (appKey, webKey) => {
    expect(FRIENDS_TEXT[appKey as keyof typeof FRIENDS_TEXT]).toBe(web[webKey as keyof typeof web]);
  });
});

describe('friendStatusLine', () => {
  const webStatus: Record<string, string> = web.status;

  it.each(FRIEND_STATUSES)('«%s» sier det webben sier', (status) => {
    const line = friendStatusLine(status);
    if (status in webStatus) {
      expect(line?.text).toBe(webStatus[status]);
    } else {
      // Webben viser ingen linje for koden; da gjør ikke appen det heller.
      expect(line).toBeNull();
    }
  });

  it('farger de samme kodene rødt som webben', () => {
    expect(friendStatusLine('self')?.tone).toBe('error');
    expect(friendStatusLine('email_required')?.tone).toBe('error');
    expect(friendStatusLine('error')?.tone).toBe('error');
    expect(friendStatusLine('requested')?.tone).toBe('ok');
  });
});

describe('invitasjonen', () => {
  it('setter adressen inn akkurat der webben har plassholderen', () => {
    expect(invitedLine('{email}')).toBe(web.status.invited);
    expect(invitePrompt('{email}')).toBe(web.invitePrompt);
    expect(inviteButton('{email}')).toBe(web.inviteButton);
  });

  it.each(INVITE_STATUSES.filter((s): s is Exclude<InviteStatus, 'invited'> => s !== 'invited'))(
    'gir en ferdig setning når invitasjonen stopper på «%s»',
    (status) => {
      expect(isFinishedSentence(inviteFailureLine(status))).toBe(true);
    },
  );
});

describe('de app-egne linjene', () => {
  it.each(['offline', 'network', 'unauthorized', 'no-web-base-url'] as WebApiFailure[])(
    '«%s» er en ferdig setning',
    (reason) => {
      expect(isFinishedSentence(friendsFailureLine(reason))).toBe(true);
    },
  );

  it('spør med navnet, og med reserven når navnet mangler', () => {
    expect(removeConfirmMessage('Kari')).toBe('Vil du fjerne Kari som venn?');
    expect(removeConfirmMessage('')).toBe(`Vil du fjerne ${web.someoneFallback} som venn?`);
  });
});

describe('overskriften og underlinjene (designet)', () => {
  // Onsdag 30. september 2026, midt på dagen i enhetens tid.
  const NOW = new Date(2026, 8, 30, 12, 0);
  const at = (month: number, day: number, year = 2026) => new Date(year, month, day, 18, 0).toISOString();

  it('teller vennene i undertittelen, og bruker webbens linje uten venner', () => {
    expect(friendsSubtitle(12)).toBe('12 venner · de dukker opp når du fyller lag');
    expect(friendsSubtitle(1)).toBe('1 venn · vennen din dukker opp når du fyller lag');
    expect(friendsSubtitle(0)).toBe(web.subtitle);
    expect(friendsSectionTitle(12)).toBe(`${web.friendsSection} · 12`);
  });

  it.each([
    [at(8, 30), 'i dag'],
    [at(8, 29), 'i går'],
    [at(8, 26), 'sist lørdag'],
    [at(8, 24), 'sist torsdag'],
    [at(8, 23), '23. sep'],
    [at(0, 3), '3. jan'],
    [at(8, 14, 2025), '14. sep 2025'],
  ])('dater %s som «%s»', (iso, label) => {
    expect(lastPlayedLabel(iso, NOW)).toBe(label);
  });

  it('setter sammen handicap, runder og siste runde for en venn', () => {
    const stats = { roundsTogether: 8, lastPlayedAt: at(8, 26), lastGameName: 'Onsdagsgolfen' };
    expect(friendSubline({ hcp: 9.4, stats }, NOW)).toBe('HCP 9,4 · 8 runder sammen · sist lørdag');
    expect(friendSubline({ hcp: -1.5, stats: { ...stats, roundsTogether: 1 } }, NOW)).toBe(
      'HCP +1,5 · 1 runde sammen · sist lørdag',
    );
  });

  it('lar det som mangler stå ute, og gir ingen linje når ingenting er igjen', () => {
    const never = { roundsTogether: 0, lastPlayedAt: null, lastGameName: null };
    expect(friendSubline({ hcp: 21, stats: never }, NOW)).toBe('HCP 21,0');
    expect(friendSubline({ hcp: null, stats: null }, NOW)).toBeNull();
    expect(incomingSubline(never)).toBeNull();
    expect(roundsSubline(null)).toBeNull();
  });

  it('sier hvor dere spilte under en forespørsel, og hvor mye under et forslag', () => {
    const stats = { roundsTogether: 2, lastPlayedAt: null, lastGameName: 'Onsdagsgolfen' };
    expect(incomingSubline(stats)).toBe('Spilte med deg i Onsdagsgolfen');
    expect(roundsSubline(stats)).toBe('2 runder sammen');
  });

  it('gir ✕-knappen et navn skjermleseren kan si', () => {
    expect(declineA11yLabel('Kari')).toBe('Avslå Kari');
    expect(declineA11yLabel('')).toBe(`Avslå ${web.someoneFallback}`);
  });

  it('fyller arket, med en strek der tallet mangler', () => {
    const stats = { roundsTogether: 8, lastPlayedAt: at(8, 26), lastGameName: 'Onsdagsgolfen' };
    expect(friendSheetValues({ hcp: 9.4, stats }, NOW)).toEqual({
      hcp: '9,4',
      rounds: '8',
      lastPlayed: 'Onsdagsgolfen, sist lørdag',
    });
    expect(friendSheetValues({ hcp: null, stats: null }, NOW)).toEqual({
      hcp: '–',
      rounds: '–',
      lastPlayed: '–',
    });
  });
});
