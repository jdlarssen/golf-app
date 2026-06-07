'use client';

import type { FormatForIntent } from '@/lib/formats/getFormatsForIntent';
import { formatIconFor } from '@/lib/formats/icons';
import { FormatStyleBadge } from '@/components/ui/FormatStyleBadge';
import type { GameMode } from '@/lib/scoring/modes/types';

type Props = {
  formats: FormatForIntent[];
  value: string | undefined;
  onChange: (slug: string) => void;
  disabled?: boolean;
};

/**
 * FormatGrid — wizard step 2 hovedflyt (Kompis / Klubb / Solo). Mottar en
 * flat liste av synlige formats for valgt intent (sortert is_primary desc,
 * sort_order asc av getFormatsForIntent) og partisjonerer på is_primary i
 * UI-laget — F1-helper sender flat liste på prinsipp.
 *
 * Layout (mobil-først):
 * - Primary: 2x2 grid med store kort (28px ikon over navn + short_description)
 * - Sekundær: 2-kolonners kompakte kort med mini-ikon ved siden av tekst
 *
 * Hvis intent har færre enn 4 primary (eller 0 sekundære), rendres bare det
 * antallet — ingen padding. Tom liste totalt = caller (wizard) viser tom-state.
 */
export function FormatGrid({ formats, value, onChange, disabled = false }: Props) {
  const primary = formats.filter((f) => f.is_primary);
  const secondary = formats.filter((f) => !f.is_primary);

  if (formats.length === 0) {
    return (
      <p
        role="status"
        className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted"
      >
        Ingen formats tilgjengelig for denne intent — kontakt admin.
      </p>
    );
  }

  return (
    <fieldset disabled={disabled} className="space-y-5">
      <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
        Velg spillform
      </legend>

      {primary.length > 0 && (
        <div role="radiogroup" aria-label="Hovedformater" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {primary.map((f) => {
            const selected = value === f.slug;
            return (
              <button
                key={f.slug}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={f.display_name}
                disabled={disabled}
                onClick={() => {
                  if (!disabled) onChange(f.slug);
                }}
                className={`flex min-h-[44px] flex-col items-start gap-2 rounded-xl border p-3 text-left transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50 ${
                  selected
                    ? 'border-primary bg-primary-soft text-text shadow-[inset_0_0_0_1px_var(--primary)]'
                    : 'border-border bg-surface text-text hover:bg-primary-soft/60'
                }`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center ${
                    selected ? 'text-primary' : 'text-muted'
                  }`}
                >
                  {formatIconFor(f.icon_key)}
                </span>
                <span className="font-serif text-base leading-snug">
                  {f.display_name}
                </span>
                <span className="font-sans text-xs leading-snug text-muted">
                  {f.short_description}
                </span>
                <FormatStyleBadge mode={f.slug as GameMode} className="mt-0.5" />
              </button>
            );
          })}
        </div>
      )}

      {secondary.length > 0 && (
        <div className="space-y-2">
          <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            Flere muligheter
          </p>
          <div role="radiogroup" aria-label="Sekundære formater" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {secondary.map((f) => {
              const selected = value === f.slug;
              return (
                <button
                  key={f.slug}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={f.display_name}
                  disabled={disabled}
                  onClick={() => {
                    if (!disabled) onChange(f.slug);
                  }}
                  className={`flex min-h-[44px] items-center gap-2 rounded-lg border p-2 text-left transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50 ${
                    selected
                      ? 'border-primary bg-primary-soft text-text'
                      : 'border-border bg-surface text-text hover:bg-primary-soft/60'
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center ${
                      selected ? 'text-primary' : 'text-muted'
                    }`}
                  >
                    {formatIconFor(f.icon_key, 20)}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-sans text-xs leading-snug">
                      {f.display_name}
                    </span>
                    <FormatStyleBadge mode={f.slug as GameMode} className="self-start" />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </fieldset>
  );
}
