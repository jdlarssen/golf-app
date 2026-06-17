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

// Transiente markører som ALLTID skal prøves på nytt: nettverk/offline,
// timeout/abort, auth-utløp (lykkes etter re-login), rate-limit. Sjekkes FØR
// de permanente mønstrene så de alltid vinner — et tapt signal må aldri ende i
// abandon. Auth-utløp er teknisk 4xx, men hører hjemme her.
const TRANSIENT_PATTERNS = [
  'load failed',
  'failed to fetch',
  'networkerror',
  'network request failed',
  'network',
  'timeout',
  'timed out',
  'aborted',
  'jwt',
  'expired',
  'session',
  '401',
  'unauthorized',
  'rate limit',
  'too many',
  '429',
];

// Tekstlige markører på en write som ikke løser seg ved retry: RLS-avvisning,
// constraint-brudd, eller en malformed forespørsel. Substring-matchet mot den
// rå feilmeldingen i lowercase.
const PERMANENT_TEXT_PATTERNS = [
  'permission',
  'forbidden',
  'row-level',
  'row level',
  'violates',
  'constraint',
  'invalid input',
  'not-null',
];

// HTTP-statuskoder som betyr en permanent klient-feil. Matchet med ord-grenser
// (\b) så en tilfeldig sifferrekke (f.eks. «timed out after 1400ms») ikke
// forveksles med en 400 og abandoner et egentlig-transient slag (#668).
const PERMANENT_STATUS_RE = /\b(?:400|403|422)\b/;

/**
 * True bare når feilen tydelig er permanent. Transiente mønstre (nettverk,
 * timeout, auth-utløp, rate-limit) sjekkes først og vinner alltid. Ukjente /
 * tomme feil regnes som IKKE permanente (trygg default: hellere loope enn å
 * miste et ekte slag).
 */
export function isPermanentSyncError(
  rawError: string | null | undefined,
): boolean {
  if (!rawError) return false;
  const lower = rawError.toLowerCase();
  if (TRANSIENT_PATTERNS.some((pattern) => lower.includes(pattern))) {
    return false;
  }
  return (
    PERMANENT_TEXT_PATTERNS.some((pattern) => lower.includes(pattern)) ||
    PERMANENT_STATUS_RE.test(lower)
  );
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
