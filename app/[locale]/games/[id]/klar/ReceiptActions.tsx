'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { buttonClasses } from '@/components/ui/Button';

/**
 * The two half-width buttons: 48 px at 14 px / 600 with the chip's secondary
 * colours. The artboard's `<button>` is border-box, so its 1 px border sits
 * inside the 48 px; `Button`'s `tall` size renders 50.
 */
const PAIR_BUTTON =
  'inline-flex h-12 items-center justify-center rounded-full border border-border bg-surface px-[18px] text-sm leading-[normal] font-semibold text-text transition-colors duration-100 hover:bg-primary-soft';

/**
 * The four actions on the receipt after «Publiser» (#2458), as the artboard
 * `Nyttspill-forslag-spillet-klart` draws them: «Del i gruppechatten» on top,
 * «Kopier lenke» and «Legg i kalenderen» side by side, «Gå til spillet» as a
 * text link.
 *
 * `shareUrl` is null when the game has no link to share (`isPubliclyViewable`
 * says no, e.g. «Bare de jeg inviterer»): both share buttons are left out,
 * and the link is never in the HTML. `calendarHref` is null without a tee-off;
 * the remaining button of the pair then takes the full width.
 */
export function ReceiptActions({
  shareUrl,
  shareText,
  calendarHref,
  gameHref,
}: {
  shareUrl: string | null;
  shareText: string;
  calendarHref: string | null;
  gameHref: string;
}) {
  const t = useTranslations('game.publishReceipt');
  // Which button said «Kopiert!» last; the status line reads it out.
  const [copied, setCopied] = useState<'share' | 'copy' | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);

  async function copy(url: string, source: 'share' | 'copy') {
    try {
      await navigator.clipboard.writeText(url);
      setCopyFailed(false);
      setCopied(source);
      window.setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('[ReceiptActions] copy failed', err);
      setCopied(null);
      setCopyFailed(true);
    }
  }

  // The share sheet on the phone; where there is none, the link is copied
  // (as LiveFollowControl). Closing the sheet is not an error.
  async function share(url: string) {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ url, text: shareText });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }
    await copy(url, 'share');
  }

  const pair = [
    shareUrl && (
      <button
        key="copy"
        type="button"
        onClick={() => copy(shareUrl, 'copy')}
        data-testid="receipt-copy"
        className={PAIR_BUTTON}
      >
        {copied === 'copy' ? t('copied') : t('copy')}
      </button>
    ),
    // A plain <a>, not a Link: the .ics answer's Content-Disposition opens
    // «Legg til i kalender» on iOS instead of a client navigation.
    calendarHref && (
      <a
        key="calendar"
        href={calendarHref}
        data-testid="receipt-calendar"
        className={PAIR_BUTTON}
      >
        {t('calendar')}
      </a>
    ),
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-2 px-4 pt-[22px]">
      {shareUrl && (
        <button
          type="button"
          onClick={() => share(shareUrl)}
          data-testid="receipt-share"
          className={buttonClasses('primary', 'large')}
        >
          {copied === 'share' ? t('copied') : t('share')}
        </button>
      )}
      {pair.length > 0 && (
        <div className={pair.length === 2 ? 'grid grid-cols-2 gap-2' : 'grid'}>{pair}</div>
      )}
      {/* The label swap alone is silent to screen readers; this announces it. */}
      <span role="status" className="sr-only">
        {copied ? t('copied') : ''}
      </span>
      {copyFailed && (
        <p role="alert" className="text-center text-xs text-danger">
          {t('copyFailed')}
        </p>
      )}
      <Link
        href={gameHref}
        data-testid="receipt-go-to-game"
        className="flex min-h-11 items-center justify-center text-sm font-semibold text-primary underline"
      >
        {t('goToGame')}
      </Link>
    </div>
  );
}
