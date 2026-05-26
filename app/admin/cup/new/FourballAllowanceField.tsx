'use client';

import { useState } from 'react';

/**
 * Netto/brutto-toggle for fourball matchplay-allowance på cup-rad.
 *
 * Issue #217. Kontrollerer hidden input `fourball_allowance_pct`:
 *  - «Netto» (default) → admin velger allowance 0..100, default 85 (WHS).
 *  - «Brutto» → input skjules, hidden-felt sendes som 0 til server.
 *
 * Ren UI-konstruksjon over én DB-kolonne (`tournaments.fourball_allowance_pct`):
 * 0 = brutto, 1..100 = netto med den prosenten. Validatoren i
 * `lib/cup/actions.ts` håndhever range; her er det kun UX.
 *
 * Cross-wizard-utrulling av samme mønster spores i #266.
 */
type Props = {
  /**
   * Initial state — settes av cup-edit-flyten når den eksisterer (per d.d.
   * pre-fyller cup-create kun default 85, så admin starter alltid i netto-modus).
   */
  initialPct?: number;
};

export function FourballAllowanceField({ initialPct = 85 }: Props) {
  const [mode, setMode] = useState<'netto' | 'brutto'>(
    initialPct === 0 ? 'brutto' : 'netto',
  );
  const [pct, setPct] = useState<number>(
    initialPct === 0 ? 85 : initialPct,
  );

  // Hidden-feltets verdi: brutto-modus sender 0, netto-modus sender pct.
  const submittedPct = mode === 'brutto' ? 0 : pct;

  return (
    <fieldset className="space-y-3 rounded-lg border border-border bg-surface-2 p-4">
      <legend className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted px-1">
        Scoring for fourball-matches
      </legend>
      <p className="text-xs text-muted -mt-1">
        Styrer handicap for nye fourball-matches i denne cupen. Hver match arver
        verdien, og kan overstyres per match i wizarden.
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
            onChange={() => setMode('netto')}
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
            onChange={() => setMode('brutto')}
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
            value={pct}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isInteger(v) && v >= 0 && v <= 100) setPct(v);
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

      {/* Skjult felt som faktisk submittes til server. */}
      <input
        type="hidden"
        name="fourball_allowance_pct"
        value={String(submittedPct)}
      />
    </fieldset>
  );
}
