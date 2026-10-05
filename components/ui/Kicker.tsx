type Props = {
  children: string;
  tone?: 'accent' | 'muted';
  className?: string;
  /** `h2` when the kicker heads a section (the friends page, #2267). */
  as?: 'p' | 'h2';
  id?: string;
};

export function Kicker({ children, tone = 'muted', className, as: Tag = 'p', id }: Props) {
  // 10px uppercase bærer alltid informasjon (turneringsnavn, seksjonsetikett),
  // så accent-tonen bruker tekst-tokenen — ikke dekor-gullet (#1374).
  const color = tone === 'accent' ? 'text-accent-text' : 'text-muted';
  return (
    <Tag
      id={id}
      className={`font-sans text-[10px] font-semibold uppercase tracking-[0.2em] ${color} ${className ?? ''}`}
    >
      {children}
    </Tag>
  );
}
