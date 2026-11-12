// #2841: tekstene og navnet på appens lås. All copy for låsen bor her, så
// raden, låseskjermen og iOS-spørsmålet sier det samme.

/** `AuthenticationType` i `expo-local-authentication`: 1 = finger, 2 = ansikt. */
const FINGERPRINT = 1;
const FACIAL_RECOGNITION = 2;

export const APP_LOCK_TEXT = {
  /** Når telefonen ikke sier hva den har (Android med ansikt eller iris). */
  genericTitle: 'Lås appen',
  subtitle: 'Appen spør når den åpnes',
  unlockButton: 'Lås opp',
  /** Spørsmålet fra telefonen. */
  promptMessage: 'Lås opp Tørny',
  cancelLabel: 'Avbryt',
} as const;

/**
 * Det telefonen kaller metoden: «Face ID» og «Touch ID» på iPhone,
 * «fingeravtrykk» på Android. `null` når telefonen ikke har noe av det
 * (Android med bare ansikt eller iris). Ren funksjon.
 */
export function appLockMethodName(types: readonly number[], os: string): string | null {
  if (os === 'ios') {
    if (types.includes(FACIAL_RECOGNITION)) return 'Face ID';
    if (types.includes(FINGERPRINT)) return 'Touch ID';
    return null;
  }
  return types.includes(FINGERPRINT) ? 'fingeravtrykk' : null;
}

/** Navnet på raden: «Lås med Face ID», «Lås med Touch ID», «Lås med fingeravtrykk», ellers «Lås appen». */
export function appLockLabel(types: readonly number[], os: string): string {
  const name = appLockMethodName(types, os);
  return name ? `Lås med ${name}` : APP_LOCK_TEXT.genericTitle;
}

/**
 * Underteksten under raden. Står metoden slått av på telefonen, sier den hva
 * spilleren må gjøre; er låsen på uten at noe er registrert lenger, sier den at
 * låsen ikke virker.
 */
export function appLockSublabel(
  types: readonly number[],
  os: string,
  state: { enrolled: boolean; on: boolean },
): string {
  if (state.enrolled) return APP_LOCK_TEXT.subtitle;
  const name = appLockMethodName(types, os);
  const what = name ?? 'ansikt eller fingeravtrykk';
  return state.on
    ? `Virker ikke før du har registrert ${what} i innstillingene til telefonen`
    : `Slå på ${what} i innstillingene til telefonen først`;
}
