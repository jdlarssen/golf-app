/**
 * Liten laster-spinner. Arver tekstfargen (border-current) så den passer i
 * alle Button-varianter. animate-spin er ikke dempet av prefers-reduced-motion
 * i globals.css (kun navngitte dekor-klasser er det), så den beveger seg også
 * under «Reduser bevegelse».
 */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-label="Laster"
      role="status"
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current ${className}`}
    />
  );
}
