import type { AppLocale } from '@/i18n/routing';
import { formatShortDateLocale } from '@/lib/i18n/format';

/**
 * A club is frozen/expired when it has a `valid_until` that is in the past (#50).
 * `null` valid_until = uendelig (never expires). Derived on read — no cron/flag.
 *
 * Frozen clubs are hidden from discovery, accept no new members or club-scoped
 * games, and show members an «utløpt»-state. Ongoing games are unaffected
 * (games don't check group status).
 */
export function isClubExpired(validUntil: string | null): boolean {
  if (!validUntil) return false;
  return new Date(validUntil) < new Date();
}

/**
 * Discriminated union for the club status badge.
 *
 * Callers translate the label using the catalog key:
 *   - 'active'    → t('klubb.status.active')
 *   - 'expired'   → t('klubb.status.expired')
 *   - 'expiresOn' → t('klubb.status.expiresOn', { date: formattedDate })
 *
 * The className is locale-independent and used directly.
 */
export type ClubStatusBadge =
  | { tone: 'active';    className: string }
  | { tone: 'expired';   className: string }
  | { tone: 'expiresOn'; className: string; date: string };

/**
 * Status badge data for a club's avtale, used on the admin governance surface
 * (/admin/klubber + /admin/klubber/[id]): Active / Expires {date} / Expired.
 *
 * Returns a discriminated union so the call-site can translate via the catalog:
 *   - tone 'active'    → t('klubb.status.active')
 *   - tone 'expired'   → t('klubb.status.expired')
 *   - tone 'expiresOn' → t('klubb.status.expiresOn', { date: badge.date })
 */
export function getClubStatusBadge(
  validUntil: string | null,
  locale: AppLocale,
): ClubStatusBadge {
  if (!validUntil) {
    return {
      tone: 'active',
      className: 'border-success/40 text-success bg-primary-soft',
    };
  }
  const expires = new Date(validUntil);
  if (expires < new Date()) {
    return {
      tone: 'expired',
      className: 'border-danger/30 text-danger bg-danger/[0.08]',
    };
  }
  return {
    tone: 'expiresOn',
    date: formatShortDateLocale(expires, locale),
    className: 'border-warning/40 text-warning bg-warning/[0.10]',
  };
}
