export function formatRevealName(
  name: string,
  nickname: string | null,
): string {
  const trimmedNick = nickname?.trim() ?? '';
  if (trimmedNick.length === 0) return name.trim();

  const parts = name
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0);
  if (parts.length === 0) return `"${trimmedNick}"`;
  if (parts.length === 1) return `${parts[0]} "${trimmedNick}"`;

  const first = parts[0];
  const last = parts[parts.length - 1];
  return `${first} "${trimmedNick}" ${last}`;
}
