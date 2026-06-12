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
 */
export function RowStatusChip({
  status,
  onClick,
  disabled,
}: {
  status: RowStatus;
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
      aria-label={t('rowStatus.ariaLabel', { label })}
      className="inline-block rounded-full px-[7px] py-[3px] font-sans text-[9.5px] font-semibold uppercase transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
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
