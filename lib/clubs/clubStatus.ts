import { formatShortDateNb } from '@/lib/format/date';

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

export type ClubStatusBadge = { label: string; className: string };

/**
 * Status badge for a club's avtale, used on the admin governance surface
 * (/admin/klubber + /admin/klubber/[id]): Aktiv / Utløper {dato} / Utløpt.
 */
export function getClubStatusBadge(validUntil: string | null): ClubStatusBadge {
  if (!validUntil) {
    return {
      label: 'Aktiv',
      className: 'border-success/40 text-success bg-primary-soft',
    };
  }
  const expires = new Date(validUntil);
  if (expires < new Date()) {
    return {
      label: 'Utløpt',
      className: 'border-danger/30 text-danger bg-danger/[0.08]',
    };
  }
  return {
    label: `Utløper ${formatShortDateNb(expires)}`,
    className: 'border-warning/40 text-warning bg-warning/[0.10]',
  };
}
