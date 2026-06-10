'use client';

export type NinesVariant = 'nines' | 'split_sixes';
export type NinesScoring = 'gross' | 'net';

interface NinesSetupProps {
  variant: NinesVariant;
  onVariantChange: (next: NinesVariant) => void;
  scoring: NinesScoring;
  onScoringChange: (next: NinesScoring) => void;
  disabled?: boolean;
}

/**
 * Nines / Split Sixes-spesifikk konfig som vises i wizardens step 2 når
 * game_mode='nines'.
 *
 * To kontroller:
 * - Variant: Nines (9 poeng per hull, 5–3–1) eller Split Sixes (6 poeng, 4–2–0).
 * - Scoring: Netto (handicap-justert) eller Brutto (rå slag). Default netto.
 *
 * Krever nøyaktig 3 spillere — validatoren (`validateNines` i gamePayload.ts)
 * håndhever dette ved publish.
 */
export function NinesSetup({
  variant,
  onVariantChange,
  scoring,
  onScoringChange,
  disabled = false,
}: NinesSetupProps) {
  return (
    <fieldset className="space-y-4 rounded-md border border-border bg-surface px-4 py-4">
      <legend className="px-1 text-sm font-semibold text-foreground">
        Nines-oppsett
      </legend>

      {/* Variant-velger */}
      <div>
        <p className="text-xs font-medium text-muted">Variant</p>
        <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Nines-variant">
          <label
            className={`flex cursor-pointer flex-col items-start gap-0.5 rounded-md border px-3 py-2 transition ${
              variant === 'nines'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-surface-2 text-muted hover:border-primary/40'
            }`}
          >
            <input
              type="radio"
              name="nines_variant"
              value="nines"
              checked={variant === 'nines'}
              onChange={() => onVariantChange('nines')}
              disabled={disabled}
              className="sr-only"
            />
            <span className="text-xs font-medium">Nines</span>
            <span className="text-[11px] text-muted/80">9 poeng per hull (5–3–1)</span>
          </label>
          <label
            className={`flex cursor-pointer flex-col items-start gap-0.5 rounded-md border px-3 py-2 transition ${
              variant === 'split_sixes'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-surface-2 text-muted hover:border-primary/40'
            }`}
          >
            <input
              type="radio"
              name="nines_variant"
              value="split_sixes"
              checked={variant === 'split_sixes'}
              onChange={() => onVariantChange('split_sixes')}
              disabled={disabled}
              className="sr-only"
            />
            <span className="text-xs font-medium">Split Sixes</span>
            <span className="text-[11px] text-muted/80">6 poeng per hull (4–2–0)</span>
          </label>
        </div>
      </div>

      {/* Scoring-velger */}
      <div>
        <p className="text-xs font-medium text-muted">Poeng fra</p>
        <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Nines-scoring">
          <label
            className={`flex cursor-pointer flex-col items-start gap-0.5 rounded-md border px-3 py-2 transition ${
              scoring === 'net'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-surface-2 text-muted hover:border-primary/40'
            }`}
          >
            <input
              type="radio"
              name="nines_scoring"
              value="net"
              checked={scoring === 'net'}
              onChange={() => onScoringChange('net')}
              disabled={disabled}
              className="sr-only"
            />
            <span className="text-xs font-medium">Netto</span>
            <span className="text-[11px] text-muted/80">Handicap-justert</span>
          </label>
          <label
            className={`flex cursor-pointer flex-col items-start gap-0.5 rounded-md border px-3 py-2 transition ${
              scoring === 'gross'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-surface-2 text-muted hover:border-primary/40'
            }`}
          >
            <input
              type="radio"
              name="nines_scoring"
              value="gross"
              checked={scoring === 'gross'}
              onChange={() => onScoringChange('gross')}
              disabled={disabled}
              className="sr-only"
            />
            <span className="text-xs font-medium">Brutto</span>
            <span className="text-[11px] text-muted/80">Rå slag</span>
          </label>
        </div>
      </div>
    </fieldset>
  );
}
