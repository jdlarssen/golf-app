'use client';

import { useState } from 'react';

/**
 * Netto/brutto-toggle for handicap-allowance.
 *
 * Generalisert fra `FourballAllowanceField` (#217) til mode-uavhengig
 * komponent som brukes på tvers av alle game-mode-wizards (#266).
 *
 * Kontrollerer en hidden input med konfigurerbart felt-navn:
 *  - «Netto» (default) → admin velger allowance 0..100, default per mode.
 *  - «Brutto» → input skjules, hidden-felt sendes som 0 til server.
 *
 * Datamodellen er én DB-kolonne (`games.hcp_allowance_pct`,
 * `tournaments.fourball_allowance_pct`, eller `games.mode_config.team_handicap_pct`
 * for texas): 0 = brutto, 1..100 = netto med den prosenten. Validatorene
 * i `lib/games/gamePayload.ts` håndhever range; her er det kun UX.
 *
 * Brukes i to varianter:
 *   1. **Uncontrolled** — komponenten holder egen state. Cup-create-form
 *      lar `initialPct` defaulte til `defaultPct`.
 *   2. **Controlled** — `value` + `onChange` settes, verdien lever i parent
 *      (wizard-pathen via `useGameFormState`). Toggle-state persisterer
 *      når admin navigerer mellom wizard-steg. Sett `hideHiddenInput=true`
 *      hvis parent rendrer en sentral hidden input — toggle-en blir da
 *      bare et UI-kontroll.
 */
type Props = {
  /**
   * Form field name for hidden input. F.eks. `hcp_allowance_pct`,
   * `fourball_allowance_pct`, `texas_team_handicap_pct`.
   */
  fieldName: string;
  /**
   * Default netto-prosent. 85 for fourball matchplay (WHS), 100 for de
   * fleste solo/team-modi, 25/10 for texas avhengig av lag-størrelse.
   */
  defaultPct: number;
  /**
   * Header inne i fieldset. F.eks. «Scoring», «Lag-handicap».
   */
  legend: string;
  /**
   * Beskrivende paragraf under legend. Forklarer hva toggle-en styrer.
   */
  description?: string;
  /**
   * Tekst under tall-input når netto er valgt. F.eks.
   * «WHS-standard for fourball matchplay er 85.»
   */
  nettoHelperText?: string;
  /**
   * Tekst som vises når brutto er valgt. F.eks.
   * «Ingen handicap — laveste gross-score per hull vinner.»
   */
  bruttoHelperText: string;
  /**
   * Label på selve tall-feltet. Default «Allowance (%)».
   */
  inputLabel?: string;
  /**
   * Initial state for uncontrolled-modus. Ignoreres når `value`/`onChange`
   * er satt. Default = `defaultPct`.
   */
  initialPct?: number;
  /**
   * Controlled-modus: når `value` OG `onChange` er satt, lever verdien i
   * parent-state. Wizarden bruker denne varianten så toggle-state ikke
   * mistes ved wizard-step-bytte.
   */
  value?: number;
  onChange?: (pct: number) => void;
  /**
   * Når true, droppes det interne `<input type="hidden">`-feltet. Parent
   * forventes da å rendre en sentral hidden input selv — toggle-en er
   * bare et UI-kontroll og verdien lever i parent-state.
   */
  hideHiddenInput?: boolean;
};

export function AllowanceField({
  fieldName,
  defaultPct,
  legend,
  description,
  nettoHelperText,
  bruttoHelperText,
  inputLabel = 'Allowance (%)',
  initialPct,
  value,
  onChange,
  hideHiddenInput = false,
}: Props) {
  const isControlled = value !== undefined && onChange !== undefined;
  const seed = initialPct ?? defaultPct;
  // pct = aktuelt valg (0 = brutto, 1..100 = netto). Uncontrolled-varianten
  // holder rå-verdien lokalt; controlled-varianten leser fra parent.
  const [uncontrolledPct, setUncontrolledPct] = useState<number>(seed);
  const pct = isControlled ? (value as number) : uncontrolledPct;

  // Mode-state. Husker «sist valgte netto-prosent» separat fra pct (som blir
  // 0 i brutto-modus) så bytte tilbake til netto gjenoppretter forrige verdi
  // istedenfor å falle tilbake til default.
  const initialSeed = isControlled ? (value as number) : seed;
  const [mode, setMode] = useState<'netto' | 'brutto'>(
    initialSeed === 0 ? 'brutto' : 'netto',
  );
  const [lastNettoPct, setLastNettoPct] = useState<number>(
    initialSeed === 0 ? defaultPct : initialSeed,
  );

  function commitPct(next: number) {
    if (isControlled) {
      (onChange as (n: number) => void)(next);
    } else {
      setUncontrolledPct(next);
    }
  }

  function selectMode(nextMode: 'netto' | 'brutto') {
    setMode(nextMode);
    if (nextMode === 'brutto') {
      if (pct > 0) setLastNettoPct(pct);
      commitPct(0);
    } else {
      commitPct(lastNettoPct);
    }
  }

  const radioGroupName = `${fieldName}__scoring_mode`;
  const inputId = `${fieldName}__input`;

  return (
    <fieldset className="space-y-3 rounded-lg border border-border bg-surface-2 p-4">
      <legend className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted px-1">
        {legend}
      </legend>
      {description && (
        <p className="text-xs text-muted -mt-1">{description}</p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label
          className={`flex cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-sm font-medium transition ${
            mode === 'netto'
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border bg-surface text-text hover:border-primary/40'
          }`}
        >
          <input
            type="radio"
            name={radioGroupName}
            value="netto"
            checked={mode === 'netto'}
            onChange={() => selectMode('netto')}
            className="sr-only"
          />
          Netto
        </label>
        <label
          className={`flex cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-sm font-medium transition ${
            mode === 'brutto'
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border bg-surface text-text hover:border-primary/40'
          }`}
        >
          <input
            type="radio"
            name={radioGroupName}
            value="brutto"
            checked={mode === 'brutto'}
            onChange={() => selectMode('brutto')}
            className="sr-only"
          />
          Brutto
        </label>
      </div>

      {mode === 'netto' && (
        <div className="space-y-1.5">
          <label
            htmlFor={inputId}
            className="block text-xs font-medium text-text"
          >
            {inputLabel}
          </label>
          <input
            id={inputId}
            type="number"
            min={0}
            max={100}
            step={1}
            value={pct === 0 ? lastNettoPct : pct}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isInteger(v) && v >= 0 && v <= 100) {
                setLastNettoPct(v);
                commitPct(v);
              }
            }}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm tabular-nums focus:border-primary focus:outline-none"
          />
          {nettoHelperText && (
            <p className="text-xs text-muted">{nettoHelperText}</p>
          )}
        </div>
      )}

      {mode === 'brutto' && (
        <p className="text-xs text-muted">{bruttoHelperText}</p>
      )}

      {!hideHiddenInput && (
        <input type="hidden" name={fieldName} value={String(pct)} />
      )}
    </fieldset>
  );
}
