export function firstName(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  const trimmed = fullName.trim();
  if (trimmed === '') return null;
  return trimmed.split(/\s+/)[0];
}
