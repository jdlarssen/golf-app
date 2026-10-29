import { describe, it, expect } from 'vitest';
import { CANCEL_MESSAGE_MAX, normalizeCancelMessage } from './cancelMessage';

/** #2481: the organiser's greeting when a round is cancelled with a notice. */

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
