// native/app/src/lib/friendsCopy.test.ts
// #2256: tekstene på vennesiden. Type A, samme mønster som profileCopy.test.
//
//  1. Alt webben også sier, er `messages/no.json → friends` tegn for tegn.
//  2. Hver statuskode gir webbens setning, eller ingen linje der webben ikke
//     viser noe.
//  3. De app-egne linjene er ferdige setninger uten plassholdere.
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
  friendStatusLine,
  friendsFailureLine,
  inviteButton,
  inviteFailureLine,
  invitePrompt,
  invitedLine,
  removeConfirmMessage,
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
  addByEmailSection: 'addByEmailSection',
  addByEmailSubtitle: 'addByEmailSubtitle',
  shareLinkSection: 'shareLinkSection',
  shareLinkSubtitle: 'shareLinkSubtitle',
  noFriendsYet: 'noFriendsYet',
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
