/**
 * Kodene «send meg kode» kan svare med (#2216).
 *
 * Ren modul uten `server-only`: kjernen (`sendLoginCode`), ruta appen ber om
 * kode gjennom (`app/api/auth/send-code`) og appen (`native/app/src/data/
 * loginCode.ts`) leser samme liste. En ny kode her må få en status i ruta og en
 * setning i appen; testene på begge sider går over lista.
 *
 * - `rate_limited`: vår egen fartsgrense per e-post og per IP slo til.
 * - `rate_limited_minute`: Supabase gir samme adresse ny kode tidligst etter ett
 *   minutt. En kode ligger alt i innboksen.
 * - `rate_limited_quota`: prosjektets mail-tak er nådd. Ingen mail ble sendt.
 * - `user_not_found`: ingen konto, og nye kontoer er skrudd av for adressen.
 * - `invite_expired`: som over, men adressen hadde en invitasjon som gikk ut.
 * - `disposable_email`: engangs-adresse mens nye kontoer er åpne.
 * - `unknown`: alt annet, også en tom adresse.
 */
export const SEND_LOGIN_CODE_ERRORS = [
  'unknown',
  'rate_limited',
  'rate_limited_minute',
  'rate_limited_quota',
  'user_not_found',
  'invite_expired',
  'disposable_email',
] as const;

export type SendLoginCodeError = (typeof SEND_LOGIN_CODE_ERRORS)[number];
