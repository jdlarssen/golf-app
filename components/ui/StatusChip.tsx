export type StatusChipTone = 'aktiv' | 'påmelding' | 'signert' | 'utkast';

const TONE_STYLES: Record<
  StatusChipTone,
  { bg: string; fg: string; label: string }
> = {
  aktiv: {
    bg: 'var(--score-under-bg)',
    fg: 'var(--score-under-fg)',
    label: 'Aktiv',
  },
  påmelding: {
    bg: 'var(--score-over1-bg)',
    fg: 'var(--score-over1-fg)',
    label: 'Påmelding',
  },
  signert: {
    bg: 'var(--score-par-bg)',
    fg: 'var(--text-muted)',
    label: 'Signert',
  },
  utkast: {
    bg: 'var(--score-over2-bg)',
    fg: 'var(--score-over2-fg)',
    label: 'Utkast',
  },
};

/**
 * Uppercase status pill used on admin "protokoll" surfaces. 4 tones map to the
 * 4 lifecycle states (Aktiv / Påmelding / Signert / Utkast). Tracks tightly
 * (0.16em) at 9.5px — meant to read as a stamp.
 */
export function StatusChip({
  tone,
  label,
  className,
}: {
  tone: StatusChipTone;
  label?: string;
  className?: string;
}) {
  const t = TONE_STYLES[tone];
  return (
    <span
      className={`inline-block rounded-full px-[7px] py-[3px] font-sans text-[9.5px] font-semibold uppercase ${className ?? ''}`}
      style={{
        background: t.bg,
        color: t.fg,
        letterSpacing: '0.16em',
      }}
    >
      {label ?? t.label}
    </span>
  );
}
