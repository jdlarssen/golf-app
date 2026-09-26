/**
 * Liten laster-spinner. Arver tekstfargen (border-current) så den passer i
 * alle Button-varianter. animate-spin er ikke dempet av prefers-reduced-motion
 * i globals.css (kun navngitte dekor-klasser er det), så den beveger seg også
 * under «Reduser bevegelse».
 *
 * Decorative only (aria-hidden): the surrounding control carries the meaning
 * (Button sets aria-busy and shows its pending label). Its hardcoded label
 * leaked into the button's accessible name (#2240). A standalone loading
 * state needs its own translated text next to the spinner.
 */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current ${className}`}
    />
  );
}
