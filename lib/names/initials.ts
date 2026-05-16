/**
 * Compact identifier for avatars: first letter of first name + first letter
 * of last name. Single-word names return just the one initial. Empty / null
 * falls back to '?' so the UI never renders an empty avatar.
 */
export function nameInitials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0);
  if (parts.length === 0) return '?';

  const first = Array.from(parts[0])[0];
  if (!first) return '?';
  if (parts.length === 1) return first.toUpperCase();

  const last = Array.from(parts[parts.length - 1])[0];
  if (!last) return first.toUpperCase();
  return (first + last).toUpperCase();
}
