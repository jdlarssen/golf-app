/**
 * «Vis avanserte innstillinger» on step 5 (#2282): a card-shaped button that
 * shows or hides the content under it, with «+» closed and «–» open. The
 * content is not inside the card: the caller renders it as its own sections
 * below, and points `controls` at their wrapper.
 *
 * Not `Disclosure`: that one is a native `<details>` wrapping its content,
 * and the wizard keeps the open state itself so a checklist row can open it.
 */
export function ToggleCard({
  label,
  open,
  onToggle,
  controls,
  className = '',
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  /** Id of the content the card shows and hides. */
  controls: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      // 52 px inside the 1 px frame, as the artboard draws it (54 outside).
      className={`flex min-h-[54px] w-full items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-3.5 text-left font-sans text-[15px] leading-[normal] font-semibold text-text ${className}`}
    >
      <span>{label}</span>
      <span aria-hidden="true" className="text-[20px] leading-[normal] text-muted">
        {open ? '–' : '+'}
      </span>
    </button>
  );
}
