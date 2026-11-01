import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SendArgs, SendResult } from './__tests__/_helpers';

/**
 * #2748: a link in a mail about a round goes through `gameMailUrl`, to `/runde/...`.
 * The app claims that path, so someone with the app lands on the same screen a
 * notification opens. A mail that builds `/games/...` with `mailUrl` directly would
 * open the browser, which doesn't share a login with the app, and nothing else would
 * say so.
 */
const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn<(...args: SendArgs) => Promise<SendResult>>(async () => ({
    data: { id: 'mock-id' },
    error: null,
  })),
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = 'test-key';
});

const DIR = join(process.cwd(), 'lib/mail');
const ID = '11111111-1111-1111-1111-111111111111';
const TOKEN = '11111111-2222-3333-4444-555555555555';
const TO = 'spiller@example.com';
const GAME = { to: TO, gameName: 'Sommercup 2026', gameId: ID };

/** `mailUrl(<anything>, <a string starting with /games/>)`, also across lines. */
const DIRECT_GAME_LINK = /\bmailUrl\(\s*[^,()]+,\s*[`'"]\/games\//;

const sources = readdirSync(DIR)
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
  .map((name) => ({ name, text: readFileSync(join(DIR, name), 'utf8') }));

describe('links to a round in the mails', () => {
  it('reads the mail modules', () => {
    expect(sources.map((s) => s.name)).toContain('gameFinishedNotification.ts');
  });

  it.each(sources)('$name builds no /games/ link with mailUrl', ({ text }) => {
    expect(text).not.toMatch(DIRECT_GAME_LINK);
  });

  // Null test: without this the scan could go blind and stay green.
  it.each([
    'mailUrl(locale, `/games/${gameId}`)',
    "mailUrl(locale, '/games/x/submit')",
    'mailUrl(\n  locale,\n  `/games/${gameId}/holes/${n}`,\n)',
  ])('catches %s', (line) => {
    expect(line).toMatch(DIRECT_GAME_LINK);
  });

  it('leaves other pages alone', () => {
    expect('mailUrl(locale, `/admin/games/${gameId}/signups`)').not.toMatch(DIRECT_GAME_LINK);
    expect("mailUrl(locale, '/login')").not.toMatch(DIRECT_GAME_LINK);
  });

  it.each([
    ['inviteNotification.ts', 'invitationLinkPath'],
    ['gameMovedNotification.ts', 'gameMailUrl'],
    ['paymentReminderNotification.ts', 'gameMailUrl'],
    ['registrationApproved.ts', 'gameMailUrl'],
    ['missingScoreReminderNotification.ts', 'gameMailUrl'],
    ['deliverReminderNotification.ts', 'gameMailUrl'],
    ['gameFinishedNotification.ts', 'gameMailUrl'],
    ['organizerGameNotice.ts', 'gameMailUrl'],
  ])('%s uses %s', (name, helper) => {
    expect(sources.find((s) => s.name === name)?.text).toContain(`${helper}(`);
  });
});

// Fixtures follow `__tests__/resend-contract.test.ts`. Type B on what the recipient
// gets: the same address in the button and in the plain text, in both locales.
const MAILS: Array<[string, string, (locale: string) => Promise<unknown>]> = [
  [
    'the invitation',
    `/invitasjon/${TOKEN}?email=spiller%40example.com`,
    async (locale) =>
      (await import('./inviteNotification')).sendInviteNotification({
        to: TO,
        invitedByName: 'Jørgen',
        gameName: 'Sommercup 2026',
        gameMode: 'stableford',
        inviteToken: TOKEN,
        locale,
      }),
  ],
  [
    'the round has moved',
    `/runde/${ID}`,
    async (locale) =>
      (await import('./gameMovedNotification')).sendGameMovedNotification({
        ...GAME,
        recipientFirstName: 'Marte',
        teeOffAt: '2026-10-04T07:00:00.000Z',
        courseChanged: false,
        locale,
      }),
  ],
  [
    'the payment reminder',
    `/runde/${ID}`,
    async (locale) =>
      (await import('./paymentReminderNotification')).sendPaymentReminderNotification({
        ...GAME,
        playerFirstName: 'Per',
        entryFeeKr: 200,
        paymentLink: '12345',
        locale,
      }),
  ],
  [
    'the approved registration',
    `/runde/${ID}`,
    async (locale) => (await import('./registrationApproved')).sendRegistrationApprovedMail({ ...GAME, locale }),
  ],
  [
    'the missing score',
    `/runde/${ID}/holes/10`,
    async (locale) =>
      (await import('./missingScoreReminderNotification')).sendMissingScoreReminderNotification({
        ...GAME,
        playerFirstName: 'Tore',
        holes: [10],
        locale,
      }),
  ],
  [
    'the delivery reminder',
    `/runde/${ID}/submit`,
    async (locale) =>
      (await import('./deliverReminderNotification')).sendDeliverReminderNotification({
        ...GAME,
        playerFirstName: 'Per',
        locale,
      }),
  ],
  [
    'the finished round',
    `/runde/${ID}/leaderboard`,
    async (locale) =>
      (await import('./gameFinishedNotification')).sendGameFinishedNotification({
        ...GAME,
        playerFirstName: 'Ada',
        locale,
      }),
  ],
  [
    'the organiser notice',
    `/runde/${ID}/avslutt`,
    async (locale) =>
      (await import('./organizerGameNotice')).sendOrganizerGameNotice({
        ...GAME,
        recipientFirstName: 'Kari',
        variant: 'all_delivered',
        locale,
      }),
  ],
];

describe('what the mails carry', () => {
  describe.each([
    ['no', 'https://tornygolf.no'],
    ['en', 'https://tornygolf.no/en'],
  ])('%s', (locale, base) => {
    it.each(MAILS)('%s links to %s in the button and the text', async (_label, path, send) => {
      await send(locale);
      const { html, text } = sendMock.mock.calls[0]![0];
      expect(html).toContain(`href="${base}${path}"`);
      expect(text).toContain(`${base}${path}`);
    });
  });

  it('an invitation without a token still goes to the login, as before', async () => {
    await MAILS[0]![2]('no');
    sendMock.mockClear();
    const { sendInviteNotification } = await import('./inviteNotification');
    await sendInviteNotification({ to: TO, invitedByName: 'Jørgen' });
    const { html, text } = sendMock.mock.calls[0]![0];
    const login = 'https://tornygolf.no/login?email=spiller%40example.com';
    expect(html).toContain(`href="${login}"`);
    expect(text).toContain(login);
  });
});
