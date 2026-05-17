export function resolvePlayerTeeId(
  gender: 'M' | 'D',
  ladiesTeeId: string | null,
): string | null {
  if (gender === 'D' && ladiesTeeId) return ladiesTeeId;
  return null;
}
