'use client';

import { useEffect } from 'react';

type Variant = 'ios-safari' | 'ios-other' | 'unsupported';

export function InstallInstructionsModal({
  open,
  onClose,
  variant,
}: {
  open: boolean;
  onClose: () => void;
  variant: Variant;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 py-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-bg p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <h2
            id="install-modal-title"
            className="font-serif text-xl font-medium text-text"
          >
            {variant === 'ios-other'
              ? 'Bytt til Safari for å installere'
              : 'Slik installerer du Tørny'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Lukk"
            className="-mt-1 -mr-1 px-2 text-text-muted hover:text-text"
          >
            ✕
          </button>
        </div>

        {variant === 'ios-safari' && <IosSafariSteps />}
        {variant === 'ios-other' && <IosOtherSteps />}
        {variant === 'unsupported' && <UnsupportedSteps />}
      </div>
    </div>
  );
}

function IosSafariSteps() {
  return (
    <ol className="space-y-4 text-sm text-text">
      <li className="flex gap-3">
        <Step n={1} />
        <span className="leading-relaxed">
          Trykk på del-ikonet{' '}
          <SafariShareGlyph className="inline-block align-text-bottom mx-0.5" />{' '}
          nederst på skjermen.
        </span>
      </li>
      <li className="flex gap-3">
        <Step n={2} />
        <span className="leading-relaxed">
          Bla nedover og trykk på «Legg til på Hjem-skjerm».
        </span>
      </li>
      <li className="flex gap-3">
        <Step n={3} />
        <span className="leading-relaxed">
          Trykk «Legg til» øverst til høyre.
        </span>
      </li>
    </ol>
  );
}

function IosOtherSteps() {
  return (
    <div className="space-y-3 text-sm text-text leading-relaxed">
      <p>
        På iPhone er det bare{' '}
        <strong className="font-medium">Safari</strong> som kan legge Tørny
        på hjem-skjermen. Andre nettlesere på iOS støtter det ikke.
      </p>
      <p>
        Åpne <strong className="font-medium">tornygolf.no</strong> i Safari og
        prøv igjen.
      </p>
    </div>
  );
}

function UnsupportedSteps() {
  return (
    <div className="space-y-3 text-sm text-text leading-relaxed">
      <p>
        Nettleseren din kan ikke legge Tørny på hjem-skjermen automatisk.
      </p>
      <p>
        Prøv å åpne tornygolf.no i Chrome, Edge eller Safari på telefonen.
      </p>
    </div>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="font-serif text-base text-primary font-medium w-5 shrink-0">
      {n}.
    </span>
  );
}

function SafariShareGlyph({ className }: { className?: string }) {
  // Stylized iOS share icon — square with arrow pointing up out of it.
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}
