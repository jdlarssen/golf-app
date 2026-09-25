import { APP_BASE_URL } from './i18n';

/**
 * Display size of the header wordmark (CSS px): `native/assets/wordmark-master.svg`'s
 * declared size, and half of the @2x PNG the generator writes from it.
 */
export const MAIL_WORDMARK_WIDTH = 88;
export const MAIL_WORDMARK_HEIGHT = 40;

/** Written by native/assets/generate-icons.mjs; served from public/brand/. */
export const MAIL_WORDMARK_URL = `${APP_BASE_URL}/brand/wordmark-mail@2x.png`;

/**
 * The «Tørny» wordmark for the mail header (#1985): the ball rests on the T,
 * which plain text in a mail client cannot draw, so it is an image of the
 * generated PNG. The mail card's white is baked into the PNG, so the forest
 * letters survive Gmail/Outlook's dark mode. With images blocked the client
 * shows the alt text «Tørny» in the surrounding <h1>'s serif — accepted by the
 * owner (2026-09-25). Every mail header and the unsubscribe page call this;
 * nothing else writes the wordmark in mail HTML.
 */
export function mailWordmarkHtml(): string {
  return (
    `<img src="${MAIL_WORDMARK_URL}" width="${MAIL_WORDMARK_WIDTH}" height="${MAIL_WORDMARK_HEIGHT}" alt="Tørny" ` +
    `style="display:block;width:${MAIL_WORDMARK_WIDTH}px;height:${MAIL_WORDMARK_HEIGHT}px;border:0;outline:none;text-decoration:none;">`
  );
}
