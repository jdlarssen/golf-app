// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Type A (#2268): the hole reminder's sender. In-app first through notify (push
 * rides on it), mail only for an off-app player with an address, and never a
 * throw: one dead address must not stop the organiser's other reminders.
 * Who gets reminded is `missingScoreTargets`' job (organizerDesk.test.ts).
 */

vi.mock('./notify', () => ({
  notify: vi.fn(async () => ({ shouldAlsoSendMail: false })),
}));
vi.mock('@/lib/mail/missingScoreReminderNotification', () => ({
  sendMissingScoreReminderNotification: vi.fn(),
}));

import { notify } from './notify';
import { sendMissingScoreReminderNotification } from '@/lib/mail/missingScoreReminderNotification';
import { sendMissingScoreReminder } from './missingScoreReminder';

const notifyMock = vi.mocked(notify);
const mailMock = vi.mocked(sendMissingScoreReminderNotification);

const base = {
  player: { userId: 'u1', email: 'tore@example.test', name: 'Tore Hansen', locale: 'en' },
  game: { id: '11111111-1111-1111-1111-111111111111', name: 'Lørdagsrunden' },
  holes: [10, 11],
  logPrefix: 'test',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('sendMissingScoreReminder', () => {
  it('stores the missing_score_reminder with the holes, and no mail for an in-app player', async () => {
    await sendMissingScoreReminder(base);
    expect(notifyMock).toHaveBeenCalledWith({
      userId: 'u1',
      kind: 'missing_score_reminder',
      payload: { game_id: base.game.id, game_name: 'Lørdagsrunden', holes: [10, 11] },
    });
    expect(mailMock).not.toHaveBeenCalled();
  });

  it('mails an off-app player, with the first name, the holes and the locale', async () => {
    notifyMock.mockResolvedValueOnce({ shouldAlsoSendMail: true });
    await sendMissingScoreReminder(base);
    expect(mailMock).toHaveBeenCalledWith({
      to: 'tore@example.test',
      playerFirstName: 'Tore',
      gameName: 'Lørdagsrunden',
      gameId: base.game.id,
      holes: [10, 11],
      locale: 'en',
    });
  });

  it('sends no mail without an address', async () => {
    notifyMock.mockResolvedValueOnce({ shouldAlsoSendMail: true });
    await sendMissingScoreReminder({ ...base, player: { ...base.player, email: null } });
    expect(mailMock).not.toHaveBeenCalled();
  });

  it('never throws: a failed notify skips the mail, a failed mail is logged', async () => {
    notifyMock.mockRejectedValueOnce(new Error('insert failed'));
    await expect(sendMissingScoreReminder(base)).resolves.toBeUndefined();
    expect(mailMock).not.toHaveBeenCalled();

    notifyMock.mockResolvedValueOnce({ shouldAlsoSendMail: true });
    mailMock.mockRejectedValueOnce(new Error('resend down'));
    await expect(sendMissingScoreReminder(base)).resolves.toBeUndefined();
  });
});
