/**
 * Sync-error-klassifisering for offline-køen (#668).
 *
 * KJERNE-INVARIANT: et slag forsvinner ALDRI fordi spilleren var offline. Bare
 * EKSPLISITT permanente feil (permission / row-level / constraint / malformed
 * 4xx) teller mot give-up-grensen. Nettverks-, auth-utløp-, rate-limit- og
 * *ukjente* feil er transiente → prøv på nytt i det uendelige til signalet (eller
 * innloggingen) er tilbake.
 *
 * Brukes av `drainQueue` til å avgjøre om et gift-element skal quarantines
 * (abandonedAt) i stedet for å loope for alltid.
 */

// Maks antall feilede forsøk på en EKSPLISITT permanent feil før kø-elementet
// gis opp. Transiente feil rammes aldri av dette taket.
export const MAX_PERMANENT_ATTEMPTS = 5;

// Mønstre som signaliserer en feil som ikke løser seg ved å prøve på nytt:
// RLS-avvisning, constraint-brudd, eller en malformed forespørsel. Sjekkes mot
// den rå feilmeldingen i lowercase.
const PERMANENT_PATTERNS = [
  'permission',
  'forbidden',
  'row-level',
  'row level',
  'violates',
  'constraint',
  'invalid input',
  'not-null',
  '403',
  '400',
  '422',
];

/**
 * True bare når feilen tydelig er permanent. Ukjente / tomme feil regnes som
 * IKKE permanente (trygg default: hellere loope enn å miste et ekte slag).
 * Auth-utløp (401 / JWT / expired) er transient — den lykkes etter re-login —
 * og sjekkes før de generiske permanente mønstrene siden den teknisk er 4xx.
 */
export function isPermanentSyncError(
  rawError: string | null | undefined,
): boolean {
  if (!rawError) return false;
  const lower = rawError.toLowerCase();
  if (
    lower.includes('jwt') ||
    lower.includes('expired') ||
    lower.includes('401') ||
    lower.includes('unauthorized')
  ) {
    return false;
  }
  return PERMANENT_PATTERNS.some((pattern) => lower.includes(pattern));
}

/**
 * Hva `drainQueue` skal gjøre med et kø-element etter en RPC-feil.
 * `attemptCount` er antall TIDLIGERE feilede forsøk (før dette siste).
 *
 * - `'abandon'`: feilen er eksplisitt permanent OG dette er forsøk nr.
 *   `maxPermanentAttempts` eller mer → quarantine elementet.
 * - `'retry'`: alt annet (transient feil uansett antall forsøk, eller permanent
 *   feil under taket).
 */
export function syncRetryDecision(opts: {
  attemptCount: number;
  errorMessage: string | null | undefined;
  maxPermanentAttempts?: number;
}): 'retry' | 'abandon' {
  const max = opts.maxPermanentAttempts ?? MAX_PERMANENT_ATTEMPTS;
  const nextAttempt = opts.attemptCount + 1;
  if (isPermanentSyncError(opts.errorMessage) && nextAttempt >= max) {
    return 'abandon';
  }
  return 'retry';
}
