'use client';

export type ShambleVariant = 'shamble' | 'champagne';
export type ShambleCount = 1 | 2 | 3;
export type ShambleScoring = 'gross' | 'net';

interface ShambleSetupProps {
  variant: ShambleVariant;
  onVariantChange: (next: ShambleVariant) => void;
  count: ShambleCount;
  onCountChange: (next: ShambleCount) => void;
  scoring: ShambleScoring;
  onScoringChange: (next: ShambleScoring) => void;
  /** Lagstørrelse: 3 eller 4. Styres av ShambleSetup sin egen velger. */
  teamSize: 3 | 4;
  onTeamSizeChange: (next: 3 | 4) => void;
  disabled?: boolean;
}

/**
 * Shamble / Champagne Scramble-spesifikk konfig i wizardens steg 2 når
 * game_mode='shamble'.
 *
 * Fire kontrollgrupper:
 * - Lagstørrelse: 3- eller 4-mannslag.
 * - Variant: Shamble (best 2 låst) eller Champagne Scramble (velg antall).
 * - Antall som teller: kun synlig ved Champagne Scramble (1 / 2 / 3).
 * - Tellemåte: Netto (default) eller Brutto.
 *
 * Lag-størrelse 3 er ny i Tørny — validatoren (`validateShamble` i
 * gamePayload.ts) håndhever at alle lag har eksakt teamSize spillere ved
 * publish. Shamble-preset låser count til 2 server-side.
 */
export function ShambleSetup({
  variant,
  onVariantChange,
  count,
  onCountChange,
  scoring,
  onScoringChange,
  teamSize,
  onTeamSizeChange,
  disabled = false,
}: ShambleSetupProps) {
  return (
    <fieldset className="space-y-4 rounded-md border border-border bg-surface px-4 py-4">
      <legend className="px-1 text-sm font-semibold text-foreground">
        Shamble-oppsett
      </legend>

      {/* Lagstørrelse-velger */}
      <div>
        <p className="text-xs font-medium text-muted">Lagstørrelse</p>
        <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Shamble-lagstørrelse">
          <label
            className={`flex cursor-pointer flex-col items-start gap-0.5 rounded-md border px-3 py-2 transition ${
              teamSize === 3
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-surface-2 text-muted hover:border-primary/40'
            }`}
          >
            <input
              type="radio"
              name="shamble_team_size"
              value="3"
              checked={teamSize === 3}
              onChange={() => onTeamSizeChange(3)}
              disabled={disabled}
              className="sr-only"
            />
            <span className="text-xs font-medium">3-mannslag</span>
            <span className="text-[11px] text-muted/80">3 spillere per lag</span>
          </label>
          <label
            className={`flex cursor-pointer flex-col items-start gap-0.5 rounded-md border px-3 py-2 transition ${
              teamSize === 4
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-surface-2 text-muted hover:border-primary/40'
            }`}
          >
            <input
              type="radio"
              name="shamble_team_size"
              value="4"
              checked={teamSize === 4}
              onChange={() => onTeamSizeChange(4)}
              disabled={disabled}
              className="sr-only"
            />
            <span className="text-xs font-medium">4-mannslag</span>
            <span className="text-[11px] text-muted/80">4 spillere per lag</span>
          </label>
        </div>
      </div>

      {/* Variant-velger */}
      <div>
        <p className="text-xs font-medium text-muted">Variant</p>
        <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Shamble-variant">
          <label
            className={`flex cursor-pointer flex-col items-start gap-0.5 rounded-md border px-3 py-2 transition ${
              variant === 'shamble'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-surface-2 text-muted hover:border-primary/40'
            }`}
          >
            <input
              type="radio"
              name="shamble_variant"
              value="shamble"
              checked={variant === 'shamble'}
              onChange={() => onVariantChange('shamble')}
              disabled={disabled}
              className="sr-only"
            />
            <span className="text-xs font-medium">Shamble</span>
            <span className="text-[11px] text-muted/80">Best 2 teller</span>
          </label>
          <label
            className={`flex cursor-pointer flex-col items-start gap-0.5 rounded-md border px-3 py-2 transition ${
              variant === 'champagne'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-surface-2 text-muted hover:border-primary/40'
            }`}
          >
            <input
              type="radio"
              name="shamble_variant"
              value="champagne"
              checked={variant === 'champagne'}
              onChange={() => onVariantChange('champagne')}
              disabled={disabled}
              className="sr-only"
            />
            <span className="text-xs font-medium">Champagne Scramble</span>
            <span className="text-[11px] text-muted/80">Velg antall</span>
          </label>
        </div>
      </div>

      {/* Antall som teller — kun synlig ved Champagne Scramble */}
      {variant === 'champagne' && (
        <div>
          <p className="text-xs font-medium text-muted">Antall som teller</p>
          <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Antall score som teller">
            {([1, 2, 3] as const).map((n) => (
              <label
                key={n}
                className={`flex cursor-pointer flex-col items-start gap-0.5 rounded-md border px-3 py-2 transition ${
                  count === n
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-surface-2 text-muted hover:border-primary/40'
                }`}
              >
                <input
                  type="radio"
                  name="shamble_count"
                  value={String(n)}
                  checked={count === n}
                  onChange={() => onCountChange(n)}
                  disabled={disabled}
                  className="sr-only"
                />
                <span className="text-xs font-medium">{n}</span>
                <span className="text-[11px] text-muted/80">
                  {n === 1 ? 'laveste score' : 'laveste scorer'}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Tellemåte-velger */}
      <div>
        <p className="text-xs font-medium text-muted">Tellemåte</p>
        <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Shamble-scoring">
          <label
            className={`flex cursor-pointer flex-col items-start gap-0.5 rounded-md border px-3 py-2 transition ${
              scoring === 'net'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-surface-2 text-muted hover:border-primary/40'
            }`}
          >
            <input
              type="radio"
              name="shamble_scoring"
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
              name="shamble_scoring"
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
