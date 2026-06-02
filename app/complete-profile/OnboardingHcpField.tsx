'use client';

import { useState } from 'react';
import { formatGolfboxHcp } from '@/lib/handicap/sign';

const INPUT_CLASS =
  'w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-text placeholder-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-[border-color,box-shadow] duration-150';

/**
 * Handicap-felt for onboarding: magnitude-input + «+»-chip for plusshandicap
 * (spilleren slipper å taste fortegn på mobil), med live «Lagres som …»-
 * bekreftelse. Sender `hcp_index` (magnitude) + `hcp_plus`; server-actionen
 * regner ut signert verdi. Fortegns-logikken bor i `lib/handicap/sign`.
 */
export function OnboardingHcpField() {
  const [magnitude, setMagnitude] = useState('');
  const [isPlus, setIsPlus] = useState(false);
  const num = Number.parseFloat(magnitude.replace(',', '.'));
  const hasMagnitude = Number.isFinite(num);

  return (
    <div>
      <label
        htmlFor="hcp_index"
        className="block text-sm font-medium text-text mb-1.5"
      >
        Handicap-index
      </label>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setIsPlus((v) => !v)}
          aria-pressed={isPlus}
          aria-label="Plusshandicap"
          className={`flex min-h-[46px] w-11 shrink-0 items-center justify-center rounded-xl border text-lg font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
            isPlus
              ? 'border-primary bg-primary-soft text-text shadow-[inset_0_0_0_1px_var(--primary)]'
              : 'border-border bg-surface text-muted hover:text-text'
          }`}
        >
          +
        </button>
        <input
          id="hcp_index"
          name="hcp_index"
          type="number"
          inputMode="decimal"
          step="0.1"
          min={0}
          max={54}
          required
          value={magnitude}
          onChange={(e) => setMagnitude(e.target.value)}
          className={`${INPUT_CLASS} score-num min-w-0`}
        />
      </div>
      <input type="hidden" name="hcp_plus" value={isPlus ? 'on' : ''} />
      <p className="mt-1.5 text-xs text-muted">
        {isPlus && hasMagnitude ? (
          <>
            Lagres som{' '}
            <span className="font-medium text-text">
              {formatGolfboxHcp(num, true)}
            </span>{' '}
            · plusshandicap
          </>
        ) : (
          'Tallet du har i Golfbox akkurat nå'
        )}
      </p>
    </div>
  );
}
