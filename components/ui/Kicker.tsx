type Props = {
  children: string;
  tone?: 'accent' | 'muted';
  className?: string;
};

export function Kicker({ children, tone = 'muted', className }: Props) {
  // 10px uppercase bærer alltid informasjon (turneringsnavn, seksjonsetikett),
  // så accent-tonen bruker tekst-tokenen — ikke dekor-gullet (#1374).
  const color = tone === 'accent' ? 'text-accent-text' : 'text-muted';
  return (
    <p
      className={`font-sans text-[10px] font-semibold uppercase tracking-[0.2em] ${color} ${className ?? ''}`}
    >
      {children}
    </p>
  );
}
