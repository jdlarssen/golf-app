'use client';

export type SkinsScoring = 'gross' | 'net';

interface SkinsSetupProps {
  scoring: SkinsScoring;
  onScoringChange: (next: SkinsScoring) => void;
  disabled?: boolean;
}

/**
 * Skins-spesifikk konfig som vises i wizardens step 2 når game_mode='skins'.
 *
 * Én kontroll: scoring-toggle (Med handicap (netto) vs Brutto). Default netto.
 * Default-net-fallback speiler Tørny's HCP-ethos. Validator (validateSkins i
 * gamePayload.ts) leser feltet og faller defensivt tilbake til 'net'.
 *
 * Skins er et solo-format (2–4 spillere) — ingen rotasjon eller lagoppsett her.
 * Carryover er alltid på: delte hull ruller skinnet videre til neste hull, som
 * da er verdt mer. Ingen toggle — det er selve formatet.
 */
export function SkinsSetup({ scoring, onScoringChange, disabled = false }: SkinsSetupProps) {
  return (
    <fieldset className="space-y-3 rounded-md border border-border bg-surface px-4 py-4">
      <legend className="px-1 text-sm font-semibold text-foreground">
        Skins-oppsett
      </legend>

      <div>
        <p className="text-xs font-medium text-muted">Scoring</p>
        <p className="mt-1 text-xs text-muted/80">
          Hvert hull er verdt 1 skin. Deler to eller flere spillere hullet, ruller
          skinnet videre til neste hull (da verdt 2, så 3, osv.), helt til én vinner
          alene og scooper hele potten.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Skins-scoring">
          <label
            className={`flex cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-xs font-medium transition ${
              scoring === 'net'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-surface-2 text-muted hover:border-primary/40'
            }`}
          >
            <input
              type="radio"
              name="skins_scoring"
              value="net"
              checked={scoring === 'net'}
              onChange={() => onScoringChange('net')}
              disabled={disabled}
              className="sr-only"
            />
            Med handicap (netto)
          </label>
          <label
            className={`flex cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-xs font-medium transition ${
              scoring === 'gross'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-surface-2 text-muted hover:border-primary/40'
            }`}
          >
            <input
              type="radio"
              name="skins_scoring"
              value="gross"
              checked={scoring === 'gross'}
              onChange={() => onScoringChange('gross')}
              disabled={disabled}
              className="sr-only"
            />
            Brutto
          </label>
        </div>
      </div>
    </fieldset>
  );
}
