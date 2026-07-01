'use client';

/**
 * Delt on/off-bryter (`role="switch"`). Trukket ut fra PushToggle +
 * MonthlyDigestToggle (#967) så fokus-ring, knapp-animasjon (`translate-x`) og
 * aria-mønster ikke drifter mellom kopier. Ren presentasjon — konsumenten eier
 * state og gir en `label` (aria-label) siden bryteren ikke har synlig tekst.
 *
 * Merk: de større brytere i LiveFollowControl (#938) og putt-pilla i HoleClient
 * (#939) har bevisst egne mål/stiler og konsumerer *ikke* denne.
 */
export function Switch({
  checked,
  onToggle,
  label,
  disabled,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      disabled={disabled}
      className={`flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 ${
        checked ? 'bg-primary' : 'bg-text/20'
      }`}
    >
      <span
        className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-150 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
