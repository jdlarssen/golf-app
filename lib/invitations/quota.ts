export function formatTimeUntil(target: Date): string {
  const diffMs = target.getTime() - Date.now();
  if (diffMs <= 0) return 'snart';
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours >= 1) return `${hours} t`;
  const minutes = Math.ceil(diffMs / (60 * 1000));
  return `${minutes} min`;
}
