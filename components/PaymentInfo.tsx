'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { formatKr } from '@/lib/format/formatKr';
import { isPaymentUrl } from '@/lib/payment/paymentLink';

/**
 * #1049: viser startkontingent + betalingsmåte til spilleren, både i
 * påmeldingsflyten og på spill-hjem. Informativt — aldri blokkerende.
 *
 * `payment_link` tolkes ved visning (isPaymentUrl): en `http(s)`-URL rendres som
 * en klikkbar «Betal her»-lenke; alt annet behandles som et Vipps-nummer med
 * kopier-knapp. Er lenken tom, vises kun beløpet + «avtal med arrangøren».
 * Returnerer null når det ikke er noen kontingent (entryFeeKr ≤ 0).
 *
 * #1068: `compact` gir en énlinjes variant for aktiv-runde-visning, der den
 * fulle boksen ville konkurrert med «Fortsett runden»-CTA-en. Kun ment for
 * ubetalte spillere — call-siten selv-gater på `paid` FØR rendring (paid
 * spillere skal se ingenting under runden), så `compact` håndterer ikke
 * `paid`-grenen i det hele tatt.
 */
export function PaymentInfo({
  entryFeeKr,
  paymentLink,
  paid = false,
  compact = false,
  className,
}: {
  entryFeeKr: number;
  paymentLink: string | null;
  /**
   * #1049: true når arrangøren har huket av spilleren som betalt (spill-hjem).
   * Da vises en diskret «betalt»-bekreftelse i stedet for betal-oppfordringen.
   * På påmeldingssidene er `paid` alltid false (ingen betalt-status der ennå).
   */
  paid?: boolean;
  /**
   * #1068: kompakt énlinjes variant (beløp + betal-affordance, ingen kicker/
   * kort-chrome) for aktiv-runde-visningen. Call-siten er ansvarlig for å
   * kun rendre denne varianten til ubetalte spillere.
   */
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations('payment');
  const [copied, setCopied] = useState(false);

  if (entryFeeKr <= 0) return null;

  if (paid) {
    return (
      <div
        className={`rounded-xl border border-border bg-surface-2 px-4 py-3 ${className ?? ''}`}
      >
        <p className="font-sans text-sm font-medium text-success">
          ✓ {t('paidBadge')}
        </p>
      </div>
    );
  }

  const link = paymentLink?.trim() || null;
  const linkIsUrl = isPaymentUrl(link);

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('[PaymentInfo] copy failed', err);
    }
  }

  if (compact) {
    return (
      <div
        className={`flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-4 py-2.5 ${className ?? ''}`}
      >
        <span className="font-sans text-sm text-text">
          {t('compactLine', { amount: formatKr(entryFeeKr) })}
        </span>
        {linkIsUrl && link ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[36px] shrink-0 items-center justify-center rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-hover dark:text-bg"
          >
            {t('payVia')}
          </a>
        ) : link ? (
          <button
            type="button"
            onClick={copy}
            className="inline-flex min-h-[36px] shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-border bg-bg px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-surface-2"
          >
            {copied ? t('copied') : t('copy')}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-border bg-surface-2 px-4 py-3 ${className ?? ''}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          {t('label')}
        </span>
        <span className="font-serif text-lg tabular-nums text-text">
          {formatKr(entryFeeKr)}
        </span>
      </div>

      {linkIsUrl && link ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover dark:text-bg"
        >
          {t('payVia')}
        </a>
      ) : link ? (
        <div className="mt-2 flex items-center gap-2">
          <span className="flex-1 font-sans text-sm text-text">
            {t('vippsTo', { number: link })}
          </span>
          <button
            type="button"
            onClick={copy}
            className="inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-full border border-border bg-bg px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-2"
          >
            {copied ? t('copied') : t('copy')}
          </button>
        </div>
      ) : (
        <p className="mt-1 text-xs text-muted">{t('arrangeWithHost')}</p>
      )}
    </div>
  );
}
