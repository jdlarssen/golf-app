import type { ReactNode } from 'react';

/**
 * Disclosure — gjenbrukbart kollapsbart seksjons-panel (#909).
 *
 * Viser en tittel + ett-linjes sammendrag i lukket tilstand, og folder ut
 * `children` ved klikk. Bygd på native `<details>`/`<summary>`: ingen JS,
 * tastatur-tilgjengelig, reduced-motion-trygt (chevron-rotasjonen er ren
 * CSS med `motion-reduce`-guard).
 *
 * VIKTIG — form-data-trygghet: native `<details>` beholder ALLTID `children`
 * i DOM (lukket tilstand skjuler dem kun visuelt). Skjema-felter inni et
 * lukket panel sendes derfor uendret ved submit. Ikke bytt dette ut med en
 * React-state-toggle som unmounter innholdet — det ville droppe form-felter.
 *
 * Disclosure er ren strukturell innpakning (ikke en destruktiv handling), så
 * dedikert-side-konvensjonen for destruktive flyter gjelder ikke — jf.
 * samme begrunnelse i `ModeGuideCard`.
 */
export function Disclosure({
  title,
  summary,
  defaultOpen = false,
  children,
  id,
  className,
}: {
  /** Panel-tittel — alltid synlig, fungerer som klikk-mål. */
  title: ReactNode;
  /**
   * Ett-linjes sammendrag av panel-innholdet, vist i lukket tilstand så admin
   * kan se hva som ligger inni uten å brette ut. Skjules når panelet er åpent.
   */
  summary?: ReactNode;
  /** Start utbrettet. Default lukket. */
  defaultOpen?: boolean;
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <details
      id={id}
      open={defaultOpen}
      className={`group rounded-2xl border border-border bg-surface ${className ?? ''}`}
    >
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <span className="font-serif text-[15px] font-medium tracking-[-0.01em] text-text">
            {title}
          </span>
          {summary != null && (
            <span className="mt-0.5 block truncate text-xs text-muted group-open:hidden">
              {summary}
            </span>
          )}
        </div>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0 text-muted transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="border-t border-border px-4 pb-4 pt-4">{children}</div>
    </details>
  );
}
