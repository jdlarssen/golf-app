// native/app/src/lib/stagingGate.ts
// Native #1906: er dette bygget et staging-bygg?
//
// Ett spørsmål, ett svar, ett sted. Svaret styrer én ting i dag: om
// utvikler-seksjonen med Sync-lab-raden står i profil-rommet. Sync-lab er
// verktøy for oss — kø, konflikter, testskriving — og har ingenting å gjøre i
// hendene på en spiller som har lastet ned appen.
//
// **`__DEV__` duger ikke som gate.** Den er `false` i alt annet enn Metro-
// utviklingsbygg, og eierens telefon kjører et Release-bygg mot staging. En
// `__DEV__`-gate ville altså skjult raden nøyaktig der den skal brukes, og
// samtidig vist den for enhver som kjører `expo start` mot prod-basen.
// Spørsmålet er ikke «hvordan ble dette bygget kompilert», men «hvilke data
// ser det på» — og det er Supabase-verten som svarer på det.
//
// **Fail-closed.** Mangler env-varen, er den tom, eller er den noe vi ikke
// klarer å lese en vert ut av, svarer vi `false`. Et prod-bygg skal aldri
// kunne vise utviklerverktøy ved et uhell, og tvil er ikke et ja. Funksjonen
// kaster heller aldri: den kalles under render i profil-rommet, og et kast
// der ville tatt ned skjermen i stedet for å skjule én rad.
//
// **Verten sammenlignes hel, aldri som delstreng.** `includes()` ville sagt ja
// til `https://snwmueecmfqqdurxedxv.supabase.co.angriper.no`, og et
// `startsWith` ville sagt ja til `https://bruker@snwmueecmfqqdurxedxv...`
// -formede adresser der den ekte verten står ETTER krøllalfaen. Derfor
// plukkes autoriteten ut, brukerinfo og port skrelles av, og resten
// sammenlignes med `===`.

/** Staging-prosjektets Supabase-vert (ref `snwmueecmfqqdurxedxv`). */
export const STAGING_SUPABASE_HOST = 'snwmueecmfqqdurxedxv.supabase.co';

// Skjema + autoritet. Alt fra første `/`, `?` eller `#` er sti og angår oss
// ikke. Bevisst regex og ikke `new URL`: hvilken URL-implementasjon en
// RN-runtime har er ikke noe denne gaten skal være avhengig av, og en
// gate som kan kaste er ikke fail-closed.
const AUTHORITY_PATTERN = /^https?:\/\/([^/?#]+)/i;

/**
 * Verten i en URL-streng, eller `null` når strengen ikke er en http(s)-adresse.
 *
 * Brukerinfo (`bruker:pass@`) skrelles av fra SISTE krøllalfa — en adresse kan
 * inneholde flere, og det er den siste som skiller brukerinfo fra verten.
 * Porten fjernes fordi den ikke er en del av identiteten vi sammenligner.
 */
function hostOf(raw: string): string | null {
  const match = AUTHORITY_PATTERN.exec(raw.trim());
  if (!match) return null;
  const authority = match[1];
  const host = authority
    .slice(authority.lastIndexOf('@') + 1)
    .replace(/:\d+$/, '')
    .toLowerCase();
  return host || null;
}

/**
 * Sant bare når appen peker på staging-basen.
 *
 * Leses ved kall, ikke ved import: `EXPO_PUBLIC_*` bakes inn ved bundling, men
 * det er ingen grunn til å fryse svaret i en modulvariabel — og testene bytter
 * env mellom casene.
 */
export function isStagingBuild(): boolean {
  const raw = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!raw) return false;
  return hostOf(raw) === STAGING_SUPABASE_HOST;
}
