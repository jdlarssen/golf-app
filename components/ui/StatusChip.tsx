export type StatusChipTone = 'aktiv' | 'påmelding' | 'signert' | 'utkast';

const TONE_STYLES: Record<
  StatusChipTone,
  { bg: string; fg: string; label: string }
> = {
  aktiv: { bg: 'rgba(74, 124, 89, 0.16)', fg: '#2f5a3c', label: 'Aktiv' },
  påmelding: { bg: 'rgba(216, 155, 58, 0.18)', fg: '#7a5410', label: 'Påmelding' },
  signert: { bg: 'rgba(92, 83, 71, 0.10)', fg: 'var(--text-muted)', label: 'Signert' },
  utkast: { bg: 'rgba(184, 70, 62, 0.12)', fg: '#7a3935', label: 'Utkast' },
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
