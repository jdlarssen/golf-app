import { describe, expect, it } from 'vitest';
import {
  receiptInvitees,
  receiptLineKind,
  receiptNameParts,
  type ReceiptRosterPlayer,
} from './publishReceipt';

// Type A (docs/test-discipline.md): who the receipt after «Publiser» says got
// the invitation (#2458), and which line it shows.

function player(
  userId: string,
  name: string | null,
  extra: { nickname?: string; isGuest?: boolean; withdrawn?: boolean } = {},
): ReceiptRosterPlayer {
  return {
    user_id: userId,
    withdrawn_at: extra.withdrawn ? '2026-10-30T10:00:00Z' : null,
    users: { name, nickname: extra.nickname ?? null, is_guest: extra.isGuest ?? false },
  };
}

describe('receiptInvitees', () => {
  it('leaves out the organiser, also when they play', () => {
    const out = receiptInvitees({
      players: [player('org', 'Ola Nordmann'), player('a', 'Marte Hansen'), player('b', 'Jonas Berg')],
      createdBy: 'org',
      publisherId: 'org',
    });
    expect(out).toEqual([
      { userId: 'a', shortName: 'Marte' },
      { userId: 'b', shortName: 'Jonas' },
    ]);
  });

  it('leaves out an admin who publishes someone else’s draft, and the organiser', () => {
    const out = receiptInvitees({
      players: [player('admin', 'Kari Admin'), player('org', 'Ola Nordmann'), player('a', 'Marte Hansen')],
      createdBy: 'org',
      publisherId: 'admin',
    });
    expect(out.map((i) => i.userId)).toEqual(['a']);
  });

  it('leaves out guests and withdrawn players', () => {
    const out = receiptInvitees({
      players: [
        player('a', 'Marte Hansen'),
        player('g', 'Gjest Gjestesen', { isGuest: true }),
        player('w', 'Trukket Spiller', { withdrawn: true }),
      ],
      createdBy: 'org',
      publisherId: 'org',
    });
    expect(out.map((i) => i.userId)).toEqual(['a']);
  });

  it('gives the first name, never the nickname', () => {
    const out = receiptInvitees({
      players: [player('a', 'Anders Lie', { nickname: 'Andy' })],
      createdBy: null,
      publisherId: 'org',
    });
    expect(out).toEqual([{ userId: 'a', shortName: 'Anders' }]);
  });

  it('keeps a player without a name, with no short name', () => {
    const out = receiptInvitees({
      players: [player('p', null), { user_id: 'q', withdrawn_at: null, users: null }],
      createdBy: null,
      publisherId: 'org',
    });
    expect(out).toEqual([
      { userId: 'p', shortName: null },
      { userId: 'q', shortName: null },
    ]);
  });

  it('is empty without players', () => {
    expect(receiptInvitees({ players: [], createdBy: 'org', publisherId: 'org' })).toEqual([]);
  });
});

describe('receiptNameParts', () => {
  const named = (...names: string[]) => names.map((n, i) => ({ userId: `u${i}`, shortName: n }));

  it.each<[string, ReturnType<typeof named>, { names: string[]; more: number }]>([
    ['one', named('Marte'), { names: ['Marte'], more: 0 }],
    ['three', named('Marte', 'Jonas', 'Anders'), { names: ['Marte', 'Jonas', 'Anders'], more: 0 }],
    ['four gives one more', named('Marte', 'Jonas', 'Anders', 'Kari'), { names: ['Marte', 'Jonas', 'Anders'], more: 1 }],
    ['six gives three more', named('A', 'B', 'C', 'D', 'E', 'F'), { names: ['A', 'B', 'C'], more: 3 }],
    ['none', [], { names: [], more: 0 }],
  ])('%s', (_label, invitees, expected) => {
    expect(receiptNameParts(invitees)).toEqual(expected);
  });

  it('counts players without a name into «more»', () => {
    expect(
      receiptNameParts([
        { userId: 'a', shortName: 'Marte' },
        { userId: 'p', shortName: null },
        { userId: 'b', shortName: 'Jonas' },
      ]),
    ).toEqual({ names: ['Marte', 'Jonas'], more: 1 });
  });

  it('has no names when nobody has one', () => {
    expect(receiptNameParts([{ userId: 'p', shortName: null }])).toEqual({ names: [], more: 1 });
  });
});

describe('receiptLineKind', () => {
  it.each<[string, { invitees: number; emailInvites: number; hasShareLink: boolean }, string]>([
    ['players only', { invitees: 2, emailInvites: 0, hasShareLink: true }, 'names'],
    ['players and e-mail', { invitees: 2, emailInvites: 1, hasShareLink: false }, 'names_and_email'],
    ['e-mail only', { invitees: 0, emailInvites: 3, hasShareLink: true }, 'email_only'],
    ['nobody, with a link', { invitees: 0, emailInvites: 0, hasShareLink: true }, 'none_with_link'],
    ['nobody, no link', { invitees: 0, emailInvites: 0, hasShareLink: false }, 'none'],
  ])('%s', (_label, input, expected) => {
    expect(receiptLineKind(input)).toBe(expected);
  });
});
