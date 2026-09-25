import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import { MAIL_WORDMARK_HEIGHT, MAIL_WORDMARK_WIDTH, mailWordmarkHtml } from './wordmark';

describe('mailWordmarkHtml', () => {
  // The img/alt contract, once for the whole mail family: every header and the
  // unsubscribe page call this helper, so their chrome locks only carry it along.
  it('points at the generated PNG on the prod origin, with alt text and fixed size', () => {
    expect(mailWordmarkHtml()).toMatchInlineSnapshot(
      `"<img src="https://tornygolf.no/brand/wordmark-mail@2x.png" width="88" height="40" alt="Tørny" style="display:block;width:88px;height:40px;border:0;outline:none;text-decoration:none;">"`,
    );
  });

  // Trap #4: the display size lives here and in the generated PNG (2x). A
  // regenerated wordmark with new proportions must not be squashed in mail.
  it('declares half the pixel size of the committed @2x PNG', () => {
    const png = fs.readFileSync(path.resolve(__dirname, '../../public/brand/wordmark-mail@2x.png'));
    expect({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }).toEqual({
      width: MAIL_WORDMARK_WIDTH * 2,
      height: MAIL_WORDMARK_HEIGHT * 2,
    });
  });
});
