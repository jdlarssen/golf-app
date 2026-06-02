'use client';

import { useState, useTransition } from 'react';
import { toggleProductUpdates } from './actions';

/**
 * Kompakt månedsbrev-bryter i Innboks. Optimistisk lokal state + server-action
 * som lagrer. Eierskapet for product-updates-opt-in flyttet hit fra profil-
 * skjemaet (#401) — det hører hjemme der varsler bor.
 */
export function MonthlyDigestToggle({ initialOptIn }: { initialOptIn: boolean }) {
  const [optIn, setOptIn] = useState(initialOptIn);
  const [, startTransition] = useTransition();

  function toggle() {
    const next = !optIn;
    setOptIn(next);
    startTransition(() => {
      void toggleProductUpdates(next);
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
      <div className="min-w-0">
        <p className="font-serif text-base font-medium text-text">Månedsbrev</p>
        <p className="text-xs text-muted">Nytt i Tørny på e-post</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={optIn}
        aria-label="Månedsbrev på e-post"
        onClick={toggle}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
          optIn ? 'bg-primary' : 'bg-border'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-150 ${
            optIn ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}
