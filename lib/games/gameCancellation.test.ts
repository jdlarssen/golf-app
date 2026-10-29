import { describe, it, expect } from 'vitest';
import {
  CANCEL_MESSAGE_MAX,
  canCancelWithNotice,
  cancellationRecipients,
  normalizeCancelMessage,
  type CancellationRosterRow,
} from './gameCancellation';

/**
 * #2481: who hears that a round is cancelled, which games cancel with a notice
 * and what the organiser's greeting may hold. Pure rules: both delete pages
 * and the action read the same answers.
 */

const ACTOR = 'u-actor';

function row(userId: string, name: string | null, extra: Partial<CancellationRosterRow> = {}): CancellationRosterRow {
  return { userId, name, isGuest: false, deletedAt: null, withdrawnAt: null, ...extra };
}

describe('cancellationRecipients', () => {
  it('an empty roster has no one to tell', () => {
    expect(cancellationRecipients([], ACTOR)).toEqual([]);
  });

  it('the one who cancels is not told', () => {
    expect(cancellationRecipients([row(ACTOR, 'Jørgen')], ACTOR)).toEqual([]);
  });

  it('leaves out guests, anonymised accounts and players who withdrew', () => {
    const rows = [
      row('u-marte', 'Marte Lie'),
      row('u-guest', 'Gjest Gjestesen', { isGuest: true }),
      row('u-gone', 'Slettet Bruker', { deletedAt: '2026-10-01T10:00:00Z' }),
      row('u-out', 'Trakk Seg', { withdrawnAt: '2026-10-02T10:00:00Z' }),
      row(ACTOR, 'Jørgen'),
    ];
    expect(cancellationRecipients(rows, ACTOR).map((r) => r.userId)).toEqual(['u-marte']);
  });

  it('keeps a player without a name (the page names them with the fallback)', () => {
    expect(cancellationRecipients([row('u-noname', null)], ACTOR).map((r) => r.userId)).toEqual([
      'u-noname',
    ]);
  });

  it('is in the roster order: alphabetical in Norwegian, then user id', () => {
    const rows = [
      row('u-b', 'Øyvind'),
      row('u-c', 'Anders'),
      row('u-z', 'Kari'),
      row('u-a', 'Kari'),
    ];
    expect(cancellationRecipients(rows, ACTOR).map((r) => r.userId)).toEqual([
      'u-c',
      'u-a',
      'u-z',
      'u-b',
    ]);
  });

  it('tells everyone on a club-size roster', () => {
    const rows = Array.from({ length: 150 }, (_, i) => row(`u-${String(i).padStart(3, '0')}`, `Spiller ${i}`));
    expect(cancellationRecipients([...rows, row(ACTOR, 'Jørgen')], ACTOR)).toHaveLength(150);
  });
});

describe('canCancelWithNotice', () => {
  const game = { tournament_id: null, league_round_id: null };

  it.each([
    ['scheduled', true],
    ['draft', false],
    ['active', false],
    ['finished', false],
  ] as const)('%s → %s', (status, expected) => {
    expect(canCancelWithNotice({ ...game, status })).toBe(expected);
  });

  it('a cup match or a league flight keeps the plain delete page', () => {
    expect(canCancelWithNotice({ status: 'scheduled', tournament_id: 't-1', league_round_id: null })).toBe(false);
    expect(canCancelWithNotice({ status: 'scheduled', tournament_id: null, league_round_id: 'r-1' })).toBe(false);
  });
});

describe('normalizeCancelMessage', () => {
  it.each([null, undefined, '', '   ', '\n\n'])('%j is no message', (raw) => {
    expect(normalizeCancelMessage(raw)).toEqual({ ok: true, message: undefined });
  });

  it('trims the message', () => {
    expect(normalizeCancelMessage('  Banen er stengt.  ')).toEqual({ ok: true, message: 'Banen er stengt.' });
  });

  it('takes exactly the limit', () => {
    const message = 'a'.repeat(CANCEL_MESSAGE_MAX);
    expect(normalizeCancelMessage(message)).toEqual({ ok: true, message });
  });

  it('refuses one character over the limit, and cuts nothing', () => {
    expect(normalizeCancelMessage('a'.repeat(CANCEL_MESSAGE_MAX + 1))).toEqual({
      ok: false,
      error: 'message_too_long',
    });
  });

  it('counts a line break once: the form posts it as CRLF', () => {
    // 299 letters and one line break: the textarea's maxLength counts 300.
    const posted = `${'a'.repeat(149)}\r\n${'a'.repeat(150)}`;
    expect(normalizeCancelMessage(posted)).toEqual({
      ok: true,
      message: `${'a'.repeat(149)}\n${'a'.repeat(150)}`,
    });
  });

  it('a file upload is no message', () => {
    expect(normalizeCancelMessage(new File(['x'], 'x.txt'))).toEqual({ ok: true, message: undefined });
  });

  it('the limit is 300', () => {
    expect(CANCEL_MESSAGE_MAX).toBe(300);
  });
});
