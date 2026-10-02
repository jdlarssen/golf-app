'use client';

import type { ReactNode } from 'react';
import { useRovingFocus } from '@/hooks/useRovingFocus';
import { chipButtonClasses } from './Button';

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
  /**
   * `segments` (default): the profile page's equal-width tiles under an
   * uppercase micro-label. `pills` (#2321): the new-game wizard's auto-width
   * 44 px pills under a 14 px / 600 heading, as «Tee-kategori» on the guest
   * form — the pill classes are `Button size="chip"`'s.
   */
  variant?: 'segments' | 'pills';
  disabled?: boolean;
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
  variant = 'segments',
  disabled = false,
}: Props) {
  // Roving tabindex + arrow keys (the shared hook): only the selected option
  // (or the first if none selected) is in the tab order.
  const rovingProps = useRovingFocus(
    options.map((o) => o.value),
    value,
    onChange,
  );

  if (variant === 'pills') {
    return (
      <fieldset id={id} disabled={disabled}>
        <legend className="font-sans text-sm font-semibold leading-[normal] text-text">{legend}</legend>
        <div role="radiogroup" aria-label={legend} className="mt-3 flex flex-wrap gap-2">
          {options.map((opt, idx) => {
            const selected = value === opt.value;
            return (
              <button
                key={opt.value}
                {...rovingProps(idx)}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => onChange(opt.value)}
                className={chipButtonClasses(selected ? 'primary' : 'secondary')}
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

  return (
    <fieldset id={id} disabled={disabled}>
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
              {...rovingProps(idx)}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(opt.value)}
              className={`flex min-h-[44px] items-center justify-center rounded-xl border px-3 font-sans text-sm transition-colors duration-150 ${
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
