'use client';

import { type KeyboardEvent, type ReactNode, useRef } from 'react';

type Option = { value: string; label: string };

type Props = {
  /** Uppercase micro-label over segmentene. */
  legend: string;
  options: Option[];
  /** Valgt verdi, eller null når ingenting er valgt ennå. */
  value: string | null;
  onChange: (value: string) => void;
  /** Valgfri hjelpetekst under segmentene (én linje). */
  hint?: ReactNode;
  /** Anker-id på fieldset-en (f.eks. «kjonn» for gender-soft-prompten). */
  id?: string;
};

/**
 * Segmentert enten-eller-velger i samme stil som opprett-spill-wizardens
 * tiles (Nassau-oppsett / lagstørrelse): `role="radiogroup"` med
 * `button role="radio"`, aktiv = primær ramme + primary-soft fyll + inset-ring.
 * Kompakt (én linje per knapp) — for kjønn/spillerklasse på profil-siden.
 *
 * Kontrollert: hold valgt verdi i parent og send en skjult input ved siden av
 * for å få den med i FormData ved server-action-submit.
 *
 * Implementerer WAI-ARIA radiogroup-tastaturmønsteret (roving tabindex):
 * - Pil venstre/opp → forrige alternativ
 * - Pil høyre/ned  → neste alternativ (med wrap)
 * - Home            → første alternativ
 * - End             → siste alternativ
 */
export function SegmentedField({
  legend,
  options,
  value,
  onChange,
  hint,
  id,
}: Props) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Roving tabindex: only the selected option (or the first if none selected)
  // gets tabindex=0; all others get tabindex=-1.
  const selectedIndex =
    value !== null ? options.findIndex((o) => o.value === value) : -1;
  const rovingIndex = selectedIndex === -1 ? 0 : selectedIndex;

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>, idx: number) {
    let next: number | null = null;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      next = (idx + 1) % options.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      next = (idx - 1 + options.length) % options.length;
    } else if (e.key === 'Home') {
      next = 0;
    } else if (e.key === 'End') {
      next = options.length - 1;
    }

    if (next !== null) {
      e.preventDefault();
      onChange(options[next].value);
      buttonRefs.current[next]?.focus();
    }
  }

  return (
    <fieldset id={id}>
      <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
        {legend}
      </legend>
      <div
        role="radiogroup"
        aria-label={legend}
        className={`mt-2 grid gap-2 ${options.length >= 3 ? 'grid-cols-3' : 'grid-cols-2'}`}
      >
        {options.map((opt, idx) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              ref={(el) => {
                buttonRefs.current[idx] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={idx === rovingIndex ? 0 : -1}
              onClick={() => onChange(opt.value)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              className={`flex min-h-[44px] items-center justify-center rounded-xl border px-3 font-sans text-sm transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                selected
                  ? 'border-primary bg-primary-soft text-text shadow-[inset_0_0_0_1px_var(--primary)]'
                  : 'border-border bg-surface text-muted hover:bg-primary-soft/60 hover:text-text'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </fieldset>
  );
}
