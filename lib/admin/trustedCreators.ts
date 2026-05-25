/**
 * Allowlist for game-opprettelse utenfor admin-rolla. Lever i kode (ikke DB)
 * fordi dette er en small-bet-MVP per #198 — vi vil verifisere at noen
 * faktisk vil opprette spill FØR vi commiter til full RLS-revisjon i #22.
 *
 * Toggle brukere ved å legge til e-postadresse her + push til main.
 */
export const TRUSTED_CREATOR_EMAILS: ReadonlyArray<string> = [
  'fornes.even@yahoo.no',
] as const;

export function isTrustedCreator(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  return TRUSTED_CREATOR_EMAILS.some(
    (allowed) => allowed.toLowerCase() === normalized,
  );
}
