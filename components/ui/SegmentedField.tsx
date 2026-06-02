'use client';

import { type ReactNode } from 'react';

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
 */
export function SegmentedField({
  legend,
  options,
  value,
  onChange,
  hint,
  id,
}: Props) {
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
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(opt.value)}
              className={`flex min-h-[42px] items-center justify-center rounded-xl border px-3 font-sans text-sm transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
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
