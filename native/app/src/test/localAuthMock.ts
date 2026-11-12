// #2841: stand-in for `expo-local-authentication` i testene av låsen.
//
// Pakken snakker med Face ID og fingeravtrykk og finnes ikke i jest. Fabrikken
// gir de fire funksjonene appen bruker som `jest.fn`, og testen styrer svaret:
//
//   jest.mock('expo-local-authentication', () =>
//     require('../test/localAuthMock').localAuthMock(),
//   );
//
// og i testen `jest.mocked(authenticateAsync).mockResolvedValue(...)`.
// Standard er en telefon med Face ID som er registrert og sier ja.

/** Fabrikken til `jest.mock('expo-local-authentication', …)`. */
export function localAuthMock(): Record<string, unknown> {
  return {
    AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
    hasHardwareAsync: jest.fn().mockResolvedValue(true),
    isEnrolledAsync: jest.fn().mockResolvedValue(true),
    supportedAuthenticationTypesAsync: jest.fn().mockResolvedValue([2]),
    authenticateAsync: jest.fn().mockResolvedValue({ success: true }),
  };
}
