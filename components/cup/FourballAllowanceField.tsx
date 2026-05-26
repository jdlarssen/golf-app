'use client';

import { useState } from 'react';

/**
 * Netto/brutto-toggle for fourball matchplay-allowance.
 *
 * Issue #217. Kontrollerer hidden input `fourball_allowance_pct`:
 *  - «Netto» (default) → admin velger allowance 0..100, default 85 (WHS).
 *  - «Brutto» → input skjules, hidden-felt sendes som 0 til server.
 *
 * Ren UI-konstruksjon over én DB-kolonne (`tournaments.fourball_allowance_pct`
 * når brukt i cup-create-form, `games.mode_config.allowance_pct` når brukt i
 * game-wizarden): 0 = brutto, 1..100 = netto med den prosenten. Validatorene
 * i `lib/cup/actions.ts` og `lib/games/gamePayload.ts` håndhever range; her
 * er det kun UX.
 *
 * Gjenbrukes i to flater:
 *   1. `app/admin/cup/new/page.tsx` — cup-rad-default (allowance arves av
 *      nye fourball-matches). Uncontrolled — komponenten holder egen state.
 *   2. `app/admin/games/new/GameWizard.tsx` — per-match-overstyring,
 *      pre-fylles fra `tournaments.fourball_allowance_pct` for cup-matches.
 *      Controlled — verdien lever i `useGameFormState` så den persisterer
 *      når admin navigerer mellom wizard-steg. `hideHiddenInput=true` lar
 *      wizarden rendre en sentral hidden input i `FormDataInputs`.
 */
type Props = {
  /**
   * Initial state for uncontrolled-modus. Cup-create-form lar denne stå
   * udefinert (default 85). Ignoreres når `value`/`onChange` er satt.
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
   * Når true, droppes det interne `<input type="hidden" name="fourball_allowance_pct">`-
   * feltet. Wizarden setter denne true og rendrer en sentral hidden input i
   * `FormDataInputs` så verdien persisterer på tvers av steg — toggle-en er
   * da bare et UI-kontroll. Cup-create-form-en lar den stå false (default)
   * så hidden-input-en submittes som vanlig.
   */
  hideHiddenInput?: boolean;
};

export function FourballAllowanceField({
  initialPct = 85,
  value,
  onChange,
  hideHiddenInput = false,
}: Props) {
  const isControlled = value !== undefined && onChange !== undefined;
  // pct = aktuelt valg (0 = brutto, 1..100 = netto). Uncontrolled-varianten
  // holder verdien lokalt; controlled-varianten leser fra parent.
  const [uncontrolledPct, setUncontrolledPct] = useState<number>(
    initialPct === 0 ? 85 : initialPct,
  );
  const pct = isControlled ? (value as number) : uncontrolledPct;

  // Mode-state. Husker «sist valgte netto-prosent» separat fra pct (som blir
  // 0 i brutto-modus) så bytte tilbake til netto gjenoppretter forrige verdi
  // istedenfor å falle tilbake til default 85.
  const initialSeed = isControlled ? (value as number) : initialPct;
  const [mode, setMode] = useState<'netto' | 'brutto'>(
    initialSeed === 0 ? 'brutto' : 'netto',
  );
  const [lastNettoPct, setLastNettoPct] = useState<number>(
    initialSeed === 0 ? 85 : initialSeed,
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

  return (
    <fieldset className="space-y-3 rounded-lg border border-border bg-surface-2 p-4">
      <legend className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted px-1">
        Scoring for fourball-matches
      </legend>
      <p className="text-xs text-muted -mt-1">
        Styrer handicap for fourball-matches. Netto bruker en andel av hver
        spillers handicap, brutto teller laveste gross per hull per side.
      </p>

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
            name="fourball_scoring_mode"
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
            name="fourball_scoring_mode"
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
            htmlFor="fourball_allowance_pct_input"
            className="block text-xs font-medium text-text"
          >
            Allowance (%)
          </label>
          <input
            id="fourball_allowance_pct_input"
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
          <p className="text-xs text-muted">
            Andel av hver spillers handicap som teller. WHS-standard for
            four-ball matchplay er 85.
          </p>
        </div>
      )}

      {mode === 'brutto' && (
        <p className="text-xs text-muted">
          Ingen handicap — laveste gross-score per hull per side vinner. Vanlig
          format på ekte Ryder Cup.
        </p>
      )}

      {/* Skjult felt som submittes til server. Wizarden setter `hideHiddenInput`
          så en sentral input i `FormDataInputs` overtar — toggle-en er da bare
          et UI-kontroll og verdien lever i `useGameFormState`. */}
      {!hideHiddenInput && (
        <input
          type="hidden"
          name="fourball_allowance_pct"
          value={String(pct)}
        />
      )}
    </fieldset>
  );
}
