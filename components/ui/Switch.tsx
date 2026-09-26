'use client';

/**
 * Delt on/off-bryter (`role="switch"`). Trukket ut fra PushToggle +
 * MonthlyDigestToggle (#967) så knapp-animasjon (`translate-x`) og
 * aria-mønster ikke drifter mellom kopier. Fokusringen eies av den globale
 * `:focus-visible`-regelen i globals.css (#1386). Ren presentasjon — konsumenten eier
 * state og gir en `label` (aria-label) siden bryteren ikke har synlig tekst.
 *
 * The putts pill in HoleClient (#939) deliberately keeps its own look and does
 * not use this. LiveFollowControl's larger hand-rolled switch was replaced by
 * this one (#2240).
 *
 * The track draws 44×24 and hits 44×44: `.tap-extend` hangs an invisible
 * 10px strip above and below it (#2240), so rows keep their height.
 */
const SWITCH_TAP_STYLE = { ['--tap-extend' as string]: '-10px 0' };

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
      style={SWITCH_TAP_STYLE}
      className={`tap-extend flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors duration-150 disabled:opacity-50 ${
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
