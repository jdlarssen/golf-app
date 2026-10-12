export function firstName(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  const trimmed = fullName.trim();
  if (trimmed === '') return null;
  return trimmed.split(/\s+/)[0];
}

/**
 * Another of `others` has the same first name as `name` (#2286), so a short
 * label would not tell them apart: show the full name then. A missing or
 * empty name never counts as shared.
 */
export function sharesFirstName(
  name: string | null | undefined,
  others: ReadonlyArray<string | null | undefined>,
): boolean {
  const first = firstName(name);
  return first !== null && others.some((o) => firstName(o) === first);
}
