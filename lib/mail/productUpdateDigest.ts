// Sends the monthly product-update digest via Resend (issue #202).
//
// One mail per opted-in user per calendar month. Listing of all
// product_updates.created_at-rows that fall inside the given period.
//
// Includes RFC 8058 one-click unsubscribe headers so Gmail/Yahoo
// rate the mail as a well-behaved bulk-sender (better inbox placement).
//
// Best-effort: caller wraps in Promise.allSettled and never blocks
// the digest-send on a single recipient's failure.
//
// Locale-aware (i18n Fase M, #594): chrome strings (salutation, intro,
// footer) come from the `mail` catalog. The digest ENTRIES (title/body)
// are authored content — they are NOT translated and stay as-is.

import { Resend } from 'resend';
import { getMailTranslator, resolveMailLocale, mailUrl } from './i18n';

const APP_BASE_URL = 'https://tornygolf.no';

function resolveFromEmail(): string {
  const raw = process.env.RESEND_FROM_EMAIL?.trim();
  if (!raw) return 'Tørny <noreply@tornygolf.no>';
  if (raw.includes('<') && raw.includes('>')) return raw;
  return `Tørny <${raw}>`;
}

function getClient(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error('RESEND_API_KEY is not set');
  }
  return new Resend(key);
}

export type ProductUpdateDigestEntry = {
  title: string;
  body: string;
  link?: string | null;
  cta_label?: string | null;
};

export type ProductUpdateDigestParams = {
  to: string;
  /** Recipient's first name for "Hei <name>!"-salutation. Null if unknown. */
  recipientFirstName: string | null;
  /** Human-readable label for the period the digest covers, e.g. "mai 2026". */
  periodLabel: string;
  /** Updates published in the period (chronological order). */
  updates: ProductUpdateDigestEntry[];
  /** Signed unsub token bound to recipient userId — used in both List-Unsubscribe header and footer link. */
  unsubToken: string;
  /** Mottakerens locale (#594). Normalt udefinert → norsk. */
  locale?: string | null;
};

export async function sendProductUpdateDigest(
  params: ProductUpdateDigestParams,
): Promise<void> {
  const { to, recipientFirstName, periodLabel, updates, unsubToken, locale } = params;

  const loc = resolveMailLocale(locale);
  const t = await getMailTranslator(locale);

  const subject = t('productUpdate.subject', { periodLabel });
  // unsubUrl is an API endpoint — no locale prefix needed.
  const unsubUrl = `${APP_BASE_URL}/api/unsubscribe/product-update?token=${encodeURIComponent(unsubToken)}`;
  // profileUrl is an app route — locale-aware.
  const profileUrl = mailUrl(locale, '/profile');

  const salutation = recipientFirstName
    ? t('productUpdate.salutationNamed', { name: recipientFirstName })
    : t('productUpdate.salutationGeneric');

  // Update entries are authored content (data) — titles, bodies, and CTAs
  // are NOT translated. Links use the bare APP_BASE_URL since they're admin-
  // configured and point to specific in-app content pages.
  const updateBlocksHtml = updates
    .map(
      (u) => `
            <div style="margin:0 0 24px;">
              <h3 style="font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.25;margin:0 0 8px;color:#1A1813;">
                ${escapeHtml(u.title)}
              </h3>
              <p style="font-size:15px;line-height:1.55;margin:0;color:#1A1813;">
                ${escapeHtml(u.body)}
              </p>
              ${
                u.link && u.cta_label
                  ? `<div style="margin:12px 0 0;">
                       <a href="${APP_BASE_URL}${escapeHtmlAttr(u.link)}" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px;">
                         ${escapeHtml(u.cta_label)}
                       </a>
                     </div>`
                  : ''
              }
            </div>`,
    )
    .join('');

  const footerHtml = t.markup('productUpdate.footerHtml', {
    link: (c) =>
      `<a href="${unsubUrl}" style="color:#1B4332;text-decoration:underline;">${c}</a>`,
    profile: (c) =>
      `<a href="${profileUrl}" style="color:#1B4332;text-decoration:underline;">${c}</a>`,
  });

  const html = `<!DOCTYPE html><html lang="${loc}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#F8F6F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1A1813;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#F8F6F0;">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;padding:32px;">
          <tr><td>
            <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.1;margin:0 0 8px;color:#1B4332;letter-spacing:-0.01em;">
              Tørny<span style="color:#C9A961;">.</span>
            </h1>
            <p style="font-size:13px;color:#4A3F30;margin:0 0 32px;">
              ${t('common.tagline')}
            </p>
            <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.2;margin:0 0 16px;color:#1A1813;">
              ${escapeHtml(t('productUpdate.heading', { periodLabel }))}
            </h2>
            <p style="font-size:16px;line-height:1.5;margin:0 0 8px;">
              ${escapeHtml(salutation)}
            </p>
            <p style="font-size:16px;line-height:1.5;margin:0 0 28px;">
              ${escapeHtml(t('productUpdate.intro', { periodLabel }))}
            </p>
            ${updateBlocksHtml}
            <p style="font-size:13px;color:#4A3F30;line-height:1.5;margin:32px 0 0;border-top:1px solid #E6E2D6;padding-top:24px;">
              ${footerHtml}
            </p>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const updateBlocksText = updates
    .map((u) => {
      const ctaLine =
        u.link && u.cta_label
          ? `\n${u.cta_label}: ${APP_BASE_URL}${u.link}`
          : '';
      return `${u.title}\n${u.body}${ctaLine}`;
    })
    .join('\n\n');

  const text =
    `${subject}\n\n` +
    `${salutation}\n\n` +
    `${t('productUpdate.intro', { periodLabel })}\n\n` +
    `${updateBlocksText}\n\n` +
    `---\n` +
    `${t('productUpdate.footerText1')}\n` +
    `${t('productUpdate.footerText2', { url: unsubUrl })}\n` +
    `${t('productUpdate.footerText3', { profileUrl })}\n`;

  const resend = getClient();
  const result = await resend.emails.send({
    from: resolveFromEmail(),
    to,
    subject,
    html,
    text,
    headers: {
      // RFC 8058 one-click unsubscribe. Gmail/Yahoo bulk-sender best practice
      // — verdier må være tilstede SAMMEN for at one-click skal aktiveres.
      'List-Unsubscribe': `<${unsubUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });

  if (result.error) {
    throw new Error(
      `Resend send failed: ${result.error.message ?? JSON.stringify(result.error)}`,
    );
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeHtmlAttr(s: string): string {
  return escapeHtml(s);
}
