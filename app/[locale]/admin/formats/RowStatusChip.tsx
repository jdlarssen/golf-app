'use client';

import { useTranslations } from 'next-intl';

export type RowStatus = 'aktiv' | 'inaktiv' | 'ny';

const STYLES: Record<RowStatus, { bg: string; fg: string }> = {
  aktiv: {
    bg: 'var(--score-under-bg)',
    fg: 'var(--score-under-fg)',
  },
  inaktiv: {
    bg: 'var(--surface-2)',
    fg: 'var(--text-muted)',
  },
  ny: {
    bg: 'var(--score-over1-bg)',
    fg: 'var(--score-over1-fg)',
  },
};

/**
 * Klikkbar status-chip på admin format-mapping-siden. Klikk toggler
 * `formats.is_active` mellom aktiv/inaktiv. «Ny»-statusen er informativ
 * (ingen mapping-rader for noen intent) — klikk på den fungerer som
 * aktiver/deaktiver-toggle akkurat som «Aktiv».
 *
 * The chip draws ~20px tall and hits 44px in the mobile cards via
 * `.tap-extend` (#2240). In the md+ table the rows are ~40px, so the hit area
 * stops at the row edge there instead of overlapping the next row's chip.
 */
export function RowStatusChip({
  status,
  formatName,
  onClick,
  disabled,
}: {
  status: RowStatus;
  /** Every row has a chip, so its name says which format it toggles. */
  formatName: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const t = useTranslations('admin.formats');
  const style = STYLES[status];
  const label = t(`rowStatus.${status}` as Parameters<typeof t>[0]);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={t('rowStatus.ariaLabel', { format: formatName, label })}
      className="tap-extend inline-block rounded-full px-[7px] py-[3px] font-sans text-[9.5px] font-semibold uppercase transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50 [--tap-extend:-12px_-8px] md:[--tap-extend:-10px_-8px]"
      style={{
        background: style.bg,
        color: style.fg,
        letterSpacing: '0.16em',
      }}
    >
      {label}
    </button>
  );
}
