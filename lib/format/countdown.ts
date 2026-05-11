/**
 * Format milliseconds-until-tee-off as a Norwegian countdown string.
 * Negative or zero ms → "Starter snart" (tee-off has passed but status
 * hasn't flipped yet).
 */
export function formatCountdown(msUntilTeeOff: number): string {
  if (msUntilTeeOff <= 0) return 'Starter snart';

  const totalSeconds = Math.floor(msUntilTeeOff / 1000);
  if (totalSeconds < 60) return `Starter om ${totalSeconds} s`;

  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `Starter om ${totalMinutes} min`;

  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    const minutes = totalMinutes - totalHours * 60;
    return `Starter om ${totalHours} t ${minutes} min`;
  }

  const days = Math.floor(totalHours / 24);
  return `Starter om ${days} ${days === 1 ? 'dag' : 'dager'}`;
}
