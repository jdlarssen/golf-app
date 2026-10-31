/**
 * Escapes user text (names, game titles, messages) for the mail templates'
 * HTML. `&` goes first so the entities written after it are not escaped
 * again. One copy for every sender in lib/mail (#2673); each used to carry
 * its own.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
