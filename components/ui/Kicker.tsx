type Props = {
  children: string;
  tone?: 'accent' | 'muted';
  className?: string;
};

export function Kicker({ children, tone = 'muted', className }: Props) {
  const color = tone === 'accent' ? 'text-accent' : 'text-muted';
  return (
    <p
      className={`font-sans text-[10px] font-semibold uppercase tracking-[0.2em] ${color} ${className ?? ''}`}
    >
      {children}
    </p>
  );
}
