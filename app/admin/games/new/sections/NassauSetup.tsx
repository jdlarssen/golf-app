'use client';

export type NassauScoring = 'gross' | 'net';

interface NassauSetupProps {
  scoring: NassauScoring;
  onScoringChange: (next: NassauScoring) => void;
  disabled?: boolean;
}

/**
 * Nassau-spesifikk konfig som vises i wizardens step 2 når game_mode='nassau'.
 *
 * Én kontroll: scoring-toggle (Med handicap (netto) vs Brutto). Default netto.
 * Default-net-fallback speiler Tørny's HCP-ethos. Validator (validateNassau i
 * gamePayload.ts) leser feltet og faller defensivt tilbake til 'net'.
 *
 * Ingen rotasjon eller spillertilordning her — Nassau er solo-format (2-4
 * spillere), tee-up er identisk med soloStrokeplay.
 */
export function NassauSetup({ scoring, onScoringChange, disabled = false }: NassauSetupProps) {
  return (
    <fieldset className="space-y-3 rounded-md border border-border bg-surface px-4 py-4">
      <legend className="px-1 text-sm font-semibold text-foreground">
        Nassau-oppsett
      </legend>

      <div>
        <p className="text-xs font-medium text-muted">Scoring</p>
        <p className="mt-1 text-xs text-muted/80">
          Nassau er tre konkurranser i én — front 9, back 9, og totalt 18.
          Velger om handicap eller brutto avgjør hver del.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Nassau-scoring">
          <label
            className={`flex cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-xs font-medium transition ${
              scoring === 'net'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-surface-2 text-muted hover:border-primary/40'
            }`}
          >
            <input
              type="radio"
              name="nassau_scoring"
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
              name="nassau_scoring"
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
