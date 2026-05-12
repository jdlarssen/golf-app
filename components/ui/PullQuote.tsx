type Props = { children: string; className?: string };

export function PullQuote({ children, className }: Props) {
  return (
    <p
      className={`pullquote font-serif italic text-[11.5px] leading-relaxed text-muted text-center ${className ?? ''}`}
    >
      «{children}»
    </p>
  );
}
