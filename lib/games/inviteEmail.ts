/**
 * What an invitation address is (#2321): one home for the rule, read by the
 * server core (`inviteEmailToGameCore`), the wizard's «Inviter på e-post» form
 * and the publish step that sends the wizard's addresses (AGENTS trap 4).
 *
 * Pure and client-safe: no server imports.
 */

/** How many addresses the wizard sends at publish. Keeps the publish inside the function's time limit. */
export const MAX_WIZARD_INVITE_EMAILS = 10;

/**
 * The address as the rest of the flow sees it: trimmed and lower-case.
 *
 * The web action builds its redirect URL from the same address the core wrote
 * to the database, so normalising happens in one place with one result.
 */
export function normalizeInviteEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** A normalised address worth trying: not empty and has an @. The core's check, unchanged. */
export function isPlausibleInviteEmail(email: string): boolean {
  return email !== '' && email.includes('@');
}

/**
 * The wizard's addresses from the form: normalised, the implausible ones
 * dropped, duplicates removed, at most ten. Non-text entries (a `File` from
 * `FormData.getAll`) are skipped.
 */
export function parseInviteEmailList(raw: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const value of raw) {
    if (typeof value !== 'string') continue;
    const email = normalizeInviteEmail(value);
    if (!isPlausibleInviteEmail(email) || out.includes(email)) continue;
    out.push(email);
    if (out.length === MAX_WIZARD_INVITE_EMAILS) break;
  }
  return out;
}
