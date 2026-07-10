/**
 * Bro mellom prøvespill-demoen (#1042) og registreringen (#1173): demoen skriver
 * visningsnavnet besøkeren satte, og `/complete-profile` leser det én gang og
 * prefyller navn-feltet. Vi bruker localStorage (ikke query-param) så navnet
 * overlever den to-stegs OTP-loginen uten å røre auth-actions og holder seg ute
 * av URL-er og logger. `torny-`-prefikset følger #1042-konvensjonen for demoens
 * klient-lokallagring.
 */
export const DEMO_NAME_STORAGE_KEY = 'torny-demo-name';
