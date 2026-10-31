type Props = {
  children: string;
  /** `onStrong` reads on --surface-strong, where muted and accent can't (#2331). */
  tone?: 'accent' | 'muted' | 'onStrong';
  className?: string;
  /** `h2` when the kicker heads a section (the friends page, #2267). */
  as?: 'p' | 'h2';
  id?: string;
};

export function Kicker({ children, tone = 'muted', className, as: Tag = 'p', id }: Props) {
  // 12px semibold bærer alltid informasjon (turneringsnavn, seksjonsetikett),
  // så accent-tonen bruker tekst-tokenen — ikke dekor-gullet (#1374).
  // Setningsstor bokstav, ingen sperring: eieren droppet versaler 2026-10-31 (#2728).
  const color =
    tone === 'accent' ? 'text-accent-text' : tone === 'onStrong' ? 'text-on-strong/80' : 'text-muted';
  return (
    <Tag
      id={id}
      className={`font-sans text-xs font-semibold ${color} ${className ?? ''}`}
    >
      {children}
    </Tag>
  );
}
